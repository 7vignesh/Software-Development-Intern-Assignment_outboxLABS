import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';

// Mock Prisma
vi.mock('../lib/prisma', () => ({
  default: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma';

const mockFindUnique = prisma.session.findUnique as ReturnType<typeof vi.fn>;

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('authenticate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn() as unknown as NextFunction;
  });

  it('should return 401 when no token is provided', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should read token from session_token cookie', async () => {
    const req = createMockReq({ cookies: { session_token: 'valid-token' } });
    const res = createMockRes();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: 'session-1',
      token: 'valid-token',
      expiresAt: futureDate,
      user: {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
    });

    await authenticate(req, res, next);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { token: 'valid-token' },
      include: { user: true },
    });
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(next).toHaveBeenCalled();
  });

  it('should read token from Authorization Bearer header', async () => {
    const req = createMockReq({
      headers: { authorization: 'Bearer bearer-token-123' },
    });
    const res = createMockRes();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: 'session-2',
      token: 'bearer-token-123',
      expiresAt: futureDate,
      user: {
        id: 'user-2',
        email: 'jane@example.com',
        name: 'Jane Doe',
        avatarUrl: null,
      },
    });

    await authenticate(req, res, next);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { token: 'bearer-token-123' },
      include: { user: true },
    });
    expect(req.user).toEqual({
      id: 'user-2',
      email: 'jane@example.com',
      name: 'Jane Doe',
      avatarUrl: null,
    });
    expect(next).toHaveBeenCalled();
  });

  it('should prefer cookie over Authorization header', async () => {
    const req = createMockReq({
      cookies: { session_token: 'cookie-token' },
      headers: { authorization: 'Bearer header-token' },
    });
    const res = createMockRes();

    const futureDate = new Date(Date.now() + 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: 'session-3',
      token: 'cookie-token',
      expiresAt: futureDate,
      user: {
        id: 'user-3',
        email: 'bob@example.com',
        name: 'Bob',
        avatarUrl: null,
      },
    });

    await authenticate(req, res, next);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { token: 'cookie-token' },
      include: { user: true },
    });
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 when session is not found', async () => {
    const req = createMockReq({ cookies: { session_token: 'unknown-token' } });
    const res = createMockRes();

    mockFindUnique.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when session is expired', async () => {
    const req = createMockReq({ cookies: { session_token: 'expired-token' } });
    const res = createMockRes();

    const pastDate = new Date(Date.now() - 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: 'session-4',
      token: 'expired-token',
      expiresAt: pastDate,
      user: {
        id: 'user-4',
        email: 'expired@example.com',
        name: 'Expired User',
        avatarUrl: null,
      },
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when database throws an error', async () => {
    const req = createMockReq({ cookies: { session_token: 'some-token' } });
    const res = createMockRes();

    mockFindUnique.mockRejectedValue(new Error('DB connection error'));

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 for Authorization header without Bearer prefix', async () => {
    const req = createMockReq({
      headers: { authorization: 'Basic some-token' },
    });
    const res = createMockRes();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});
