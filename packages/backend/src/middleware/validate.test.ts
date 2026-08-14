import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from './validate';

function mockReq(body: unknown): Partial<Request> {
  return { body };
}

function mockRes(): Partial<Response> & { statusCode?: number; jsonBody?: unknown } {
  const res: Partial<Response> & { statusCode?: number; jsonBody?: unknown } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  res.json = vi.fn().mockImplementation((data: unknown) => {
    res.jsonBody = data;
    return res as Response;
  });
  return res;
}

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email format'),
    age: z.number().int().min(0, 'Age must be non-negative'),
  });

  it('should call next() and replace req.body with parsed data on valid input', () => {
    const req = mockReq({ name: 'Alice', email: 'alice@example.com', age: 30 });
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Alice', email: 'alice@example.com', age: 30 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should strip unknown fields from req.body (Zod strip mode)', () => {
    const req = mockReq({ name: 'Bob', email: 'bob@test.com', age: 25, extra: 'ignored' });
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({ name: 'Bob', email: 'bob@test.com', age: 25 });
    expect(req.body).not.toHaveProperty('extra');
  });

  it('should return 400 with field errors when required fields are missing', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.jsonBody).toEqual({
      error: 'Validation failed',
      details: expect.objectContaining({
        name: expect.any(Array),
        email: expect.any(Array),
        age: expect.any(Array),
      }),
    });
  });

  it('should return descriptive error messages for invalid field values', () => {
    const req = mockReq({ name: '', email: 'not-an-email', age: -5 });
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const details = (res.jsonBody as { details: Record<string, string[]> }).details;
    expect(details.name).toContain('Name is required');
    expect(details.email).toContain('Invalid email format');
    expect(details.age).toContain('Age must be non-negative');
  });

  it('should handle nested object validation errors with dot-path keys', () => {
    const nestedSchema = z.object({
      user: z.object({
        name: z.string().min(1, 'Name is required'),
      }),
    });

    const req = mockReq({ user: { name: '' } });
    const res = mockRes();
    const next = vi.fn();

    validate(nestedSchema)(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const details = (res.jsonBody as { details: Record<string, string[]> }).details;
    expect(details['user.name']).toContain('Name is required');
  });

  it('should handle array field validation errors', () => {
    const arraySchema = z.object({
      recipients: z.array(z.string().email('Invalid email')).min(1, 'At least one recipient'),
    });

    const req = mockReq({ recipients: [] });
    const res = mockRes();
    const next = vi.fn();

    validate(arraySchema)(req as Request, res as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    const details = (res.jsonBody as { details: Record<string, string[]> }).details;
    expect(details.recipients).toContain('At least one recipient');
  });
});
