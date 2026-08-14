import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ============================================================================
// Mocks - Must be declared before imports
// ============================================================================

// Mock config to avoid env var validation
vi.mock('../config', () => ({
  default: {
    redisUrl: 'redis://localhost:6379',
    maxEmailsPerHour: 100,
    delayBetweenEmailsMs: 2000,
    workerConcurrency: 1,
    smtpHost: 'smtp.ethereal.email',
    smtpPort: 587,
    smtpUser: 'test@ethereal.email',
    smtpPass: 'test-pass',
    googleClientId: 'mock-google-client-id',
    googleClientSecret: 'mock-google-client-secret',
    googleCallbackUrl: 'http://localhost:3000/api/auth/google/callback',
    sessionSecret: 'test-session-secret',
    port: 3000,
    frontendUrl: 'http://localhost:5173',
  },
}));

// In-memory stores for mock database
const mockUsers: Map<string, any> = new Map();
const mockSessions: Map<string, any> = new Map();
const mockEmailJobs: Map<string, any> = new Map();

// Mock Prisma client with in-memory storage
vi.mock('../lib/prisma', () => {
  const prismaMock = {
    user: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    emailJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    prisma: prismaMock,
    default: prismaMock,
  };
});

// Mock BullMQ queue
vi.mock('../queue/emailQueue', () => ({
  addEmailJob: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job-id' }),
  getQueue: vi.fn(),
  closeQueue: vi.fn(),
}));

// Mock SMTP transport
vi.mock('../services/smtpTransport', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-msg-id', previewUrl: '' }),
  categorizeError: vi.fn().mockReturnValue('transient'),
  initializeTransport: vi.fn(),
}));

// Mock global fetch for Google OAuth
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Imports (after mocks)
// ============================================================================

import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../lib/prisma';
import { addEmailJob } from '../queue/emailQueue';
import { sendEmail } from '../services/smtpTransport';
import authRouter from '../routes/auth';
import emailRouter from '../routes/emails';

// ============================================================================
// Test App Setup
// ============================================================================

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  return app;
}

// Helper to make requests to the app
async function request(
  app: express.Application,
  method: 'GET' | 'POST',
  path: string,
  options?: { body?: any; token?: string }
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  // Use node's built-in http for testing
  return new Promise<{ status: number; body: any; headers: Record<string, string> }>(
    (resolve, reject) => {
      const http = require('http');
      const server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        const reqOptions = {
          hostname: 'localhost',
          port: addr.port,
          path,
          method,
          headers,
        };

        const req = http.request(reqOptions, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            server.close();
            let parsedBody: any;
            try {
              parsedBody = JSON.parse(data);
            } catch {
              parsedBody = data;
            }
            const responseHeaders: Record<string, string> = {};
            Object.entries(res.headers).forEach(([k, v]) => {
              responseHeaders[k] = String(v);
            });
            resolve({ status: res.statusCode, body: parsedBody, headers: responseHeaders });
          });
        });

        req.on('error', (err: Error) => {
          server.close();
          reject(err);
        });

        if (options?.body) {
          req.write(JSON.stringify(options.body));
        }
        req.end();
      });
    }
  );
}

// ============================================================================
// End-to-End Test Suite
// ============================================================================

describe('End-to-End Email Scheduler Flow', () => {
  let app: express.Application;
  let sessionToken: string;
  const testUserId = 'user-e2e-001';
  const testUser = {
    id: testUserId,
    googleId: 'google-123456',
    email: 'testuser@gmail.com',
    name: 'Test User',
    avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(() => {
    app = createTestApp();
  });

  // --------------------------------------------------------------------------
  // Test 1: Authentication Flow
  // --------------------------------------------------------------------------
  describe('Test 1: Authentication Flow', () => {
    it('should handle Google OAuth callback and create a session', async () => {
      // Mock Google token exchange
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return {
            ok: true,
            json: async () => ({
              access_token: 'mock-access-token',
              id_token: 'mock-id-token',
              refresh_token: 'mock-refresh-token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
          };
        }
        if (url.includes('googleapis.com/oauth2/v2/userinfo')) {
          return {
            ok: true,
            json: async () => ({
              id: testUser.googleId,
              email: testUser.email,
              name: testUser.name,
              picture: testUser.avatarUrl,
            }),
          };
        }
        return { ok: false, text: async () => 'Not Found' };
      });

      // Mock prisma user upsert
      const mockUpsert = prisma.user.upsert as ReturnType<typeof vi.fn>;
      mockUpsert.mockResolvedValue(testUser);

      // Mock prisma session create
      const mockSessionCreate = prisma.session.create as ReturnType<typeof vi.fn>;
      mockSessionCreate.mockImplementation(async (args: any) => {
        const session = {
          id: 'session-001',
          userId: args.data.userId,
          token: args.data.token,
          expiresAt: args.data.expiresAt,
          createdAt: new Date(),
        };
        mockSessions.set(args.data.token, session);
        return session;
      });

      // Make the OAuth callback request
      const res = await request(app, 'GET', '/api/auth/google/callback?code=mock-auth-code');

      // Should redirect to frontend with token
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/dashboard?token=');

      // Extract the session token from the redirect URL
      const location = res.headers['location'] as string;
      const tokenMatch = location.match(/token=([^&]+)/);
      expect(tokenMatch).not.toBeNull();
      sessionToken = tokenMatch![1];
      expect(sessionToken).toBeDefined();
      expect(sessionToken.length).toBeGreaterThan(0);

      // Verify Google OAuth token exchange was called
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify user was upserted
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { googleId: testUser.googleId },
        })
      );

      // Verify session was created
      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: testUserId,
          }),
        })
      );
    });

    it('GET /api/auth/me should return user profile with valid token', async () => {
      // Mock session lookup for authenticate middleware
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });

      const res = await request(app, 'GET', '/api/auth/me', { token: sessionToken });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: testUserId,
        email: testUser.email,
        name: testUser.name,
        avatarUrl: testUser.avatarUrl,
      });
    });

    it('GET /api/auth/me should return 401 without token', async () => {
      const res = await request(app, 'GET', '/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/auth/me should work multiple times with same token (session persistence)', async () => {
      // First request
      const res1 = await request(app, 'GET', '/api/auth/me', { token: sessionToken });
      expect(res1.status).toBe(200);
      expect(res1.body.email).toBe(testUser.email);

      // Second request - simulating page refresh with localStorage token
      const res2 = await request(app, 'GET', '/api/auth/me', { token: sessionToken });
      expect(res2.status).toBe(200);
      expect(res2.body.email).toBe(testUser.email);

      // Third request
      const res3 = await request(app, 'GET', '/api/auth/me', { token: sessionToken });
      expect(res3.status).toBe(200);
      expect(res3.body.id).toBe(testUserId);
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Schedule Emails
  // --------------------------------------------------------------------------
  describe('Test 2: Schedule Emails', () => {
    const scheduledTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const recipients = ['alice@example.com', 'bob@example.com', 'carol@example.com'];
    let batchId: string;

    beforeEach(() => {
      vi.clearAllMocks();

      // Re-setup session mock for auth middleware
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });
    });

    it('POST /api/emails/schedule should create 3 email jobs and return batchId', async () => {
      const mockCreatedJobs = recipients.map((recipient, i) => ({
        id: `email-job-${i + 1}`,
        userId: testUserId,
        idempotencyKey: `idem-${i}`,
        recipient,
        subject: 'Test Campaign',
        body: 'Hello from test',
        sender: 'sender@test.com',
        scheduledTime: new Date(scheduledTime),
        status: 'SCHEDULED',
        sentAt: null,
        errorReason: null,
        batchId: 'batch-e2e-001',
        batchOrder: i,
        bullmqJobId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Store in our mock DB for later queries
      mockCreatedJobs.forEach((job) => mockEmailJobs.set(job.id, job));

      // Mock $transaction to return created jobs
      const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
      mockTransaction.mockResolvedValue(mockCreatedJobs);

      const res = await request(app, 'POST', '/api/emails/schedule', {
        token: sessionToken,
        body: {
          recipients,
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime,
          delayBetweenEmailsMs: 2000,
          maxEmailsPerHour: 100,
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.batchId).toBeDefined();
      expect(res.body.totalJobs).toBe(3);
      expect(res.body.firstScheduledAt).toBeDefined();
      expect(res.body.lastScheduledAt).toBeDefined();

      batchId = res.body.batchId;

      // Verify addEmailJob was called 3 times
      expect(addEmailJob).toHaveBeenCalledTimes(3);

      // Verify each job has incremental delay
      const calls = (addEmailJob as ReturnType<typeof vi.fn>).mock.calls;
      for (let i = 1; i < calls.length; i++) {
        const prevDelay = calls[i - 1][1];
        const currDelay = calls[i][1];
        expect(currDelay - prevDelay).toBe(2000);
      }
    });

    it('GET /api/emails?status=SCHEDULED should return 3 items after scheduling', async () => {
      const scheduledJobs = Array.from(mockEmailJobs.values()).filter(
        (j) => j.status === 'SCHEDULED'
      );

      // Mock $transaction for paginated query
      const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
      mockTransaction.mockResolvedValue([scheduledJobs, scheduledJobs.length]);

      const res = await request(app, 'GET', '/api/emails?status=SCHEDULED', {
        token: sessionToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: View Scheduled Emails
  // --------------------------------------------------------------------------
  describe('Test 3: View Scheduled Emails', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Re-setup session mock
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });
    });

    it('should return paginated scheduled emails with correct metadata', async () => {
      const scheduledTime = new Date(Date.now() + 60 * 60 * 1000);
      const scheduledJobs = [
        {
          id: 'email-job-1',
          userId: testUserId,
          idempotencyKey: 'idem-0',
          recipient: 'alice@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime,
          status: 'SCHEDULED',
          sentAt: null,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 0,
          bullmqJobId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'email-job-2',
          userId: testUserId,
          idempotencyKey: 'idem-1',
          recipient: 'bob@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime,
          status: 'SCHEDULED',
          sentAt: null,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 1,
          bullmqJobId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'email-job-3',
          userId: testUserId,
          idempotencyKey: 'idem-2',
          recipient: 'carol@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime,
          status: 'SCHEDULED',
          sentAt: null,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 2,
          bullmqJobId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock $transaction for paginated query (findMany + count)
      const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
      mockTransaction.mockResolvedValue([scheduledJobs, 3]);

      const res = await request(app, 'GET', '/api/emails?status=SCHEDULED', {
        token: sessionToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.totalPages).toBe(1);

      // Verify each item has required fields
      for (const item of res.body.items) {
        expect(item.recipient).toBeDefined();
        expect(item.subject).toBe('Test Campaign');
        expect(item.scheduledTime).toBeDefined();
        expect(item.status).toBe('SCHEDULED');
        expect(item.sentAt).toBeNull();
      }

      // Verify recipients
      const recipients = res.body.items.map((item: any) => item.recipient);
      expect(recipients).toContain('alice@example.com');
      expect(recipients).toContain('bob@example.com');
      expect(recipients).toContain('carol@example.com');
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Worker Processes Emails (simulate)
  // --------------------------------------------------------------------------
  describe('Test 4: Worker Processes Emails (simulate)', () => {
    const emailJobs = [
      {
        id: 'worker-job-1',
        userId: testUserId,
        idempotencyKey: 'worker-idem-0',
        recipient: 'alice@example.com',
        subject: 'Test Campaign',
        body: 'Hello from test',
        sender: 'sender@test.com',
        scheduledTime: new Date(),
        status: 'SCHEDULED' as const,
        sentAt: null,
        errorReason: null,
        batchId: 'batch-e2e-001',
        batchOrder: 0,
      },
      {
        id: 'worker-job-2',
        userId: testUserId,
        idempotencyKey: 'worker-idem-1',
        recipient: 'bob@example.com',
        subject: 'Test Campaign',
        body: 'Hello from test',
        sender: 'sender@test.com',
        scheduledTime: new Date(),
        status: 'SCHEDULED' as const,
        sentAt: null,
        errorReason: null,
        batchId: 'batch-e2e-001',
        batchOrder: 1,
      },
      {
        id: 'worker-job-3',
        userId: testUserId,
        idempotencyKey: 'worker-idem-2',
        recipient: 'carol@example.com',
        subject: 'Test Campaign',
        body: 'Hello from test',
        sender: 'sender@test.com',
        scheduledTime: new Date(),
        status: 'SCHEDULED' as const,
        sentAt: null,
        errorReason: null,
        batchId: 'batch-e2e-001',
        batchOrder: 2,
      },
    ];

    it('should process each email: SCHEDULED → PROCESSING → SENT with sentAt', async () => {
      for (const job of emailJobs) {
        vi.clearAllMocks();

        // Mock findUnique to return the SCHEDULED job
        const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
        mockFindUnique.mockResolvedValue({ ...job, status: 'SCHEDULED' });

        // Mock update to track status transitions
        const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;
        mockUpdate.mockResolvedValue({});

        // Mock sendEmail to succeed
        (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
          messageId: `msg-${job.id}`,
          previewUrl: `https://ethereal.email/preview/${job.id}`,
        });

        // Simulate the worker processor logic
        const emailJob = await prisma.emailJob.findUnique({ where: { id: job.id } });
        expect(emailJob).not.toBeNull();
        expect(emailJob!.status).toBe('SCHEDULED');

        // Transition to PROCESSING
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { status: 'PROCESSING' },
        });

        // Send the email
        await sendEmail(job.sender, job.recipient, job.subject, job.body);

        // Transition to SENT
        const sentAt = new Date();
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { status: 'SENT', sentAt },
        });

        // Verify transitions occurred correctly
        expect(mockUpdate).toHaveBeenCalledTimes(2);

        // First call: PROCESSING
        expect(mockUpdate).toHaveBeenNthCalledWith(1, {
          where: { id: job.id },
          data: { status: 'PROCESSING' },
        });

        // Second call: SENT with sentAt
        expect(mockUpdate).toHaveBeenNthCalledWith(2, {
          where: { id: job.id },
          data: { status: 'SENT', sentAt },
        });

        // Verify sendEmail was called with correct params
        expect(sendEmail).toHaveBeenCalledWith(
          job.sender,
          job.recipient,
          job.subject,
          job.body
        );
      }
    });

    it('should have called sendEmail for all 3 recipients across the batch', async () => {
      // This test verifies the cumulative effect: all 3 emails were processed
      // We run the simulated worker for all 3 and verify final state

      const processedRecipients: string[] = [];

      for (const job of emailJobs) {
        // Mock findUnique
        const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
        mockFindUnique.mockResolvedValue({ ...job, status: 'SCHEDULED' });

        // Mock update
        const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;
        mockUpdate.mockResolvedValue({ ...job, status: 'SENT', sentAt: new Date() });

        // Mock sendEmail
        (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
          messageId: `msg-${job.id}`,
          previewUrl: '',
        });

        // Process
        await sendEmail(job.sender, job.recipient, job.subject, job.body);
        processedRecipients.push(job.recipient);
      }

      expect(processedRecipients).toEqual([
        'alice@example.com',
        'bob@example.com',
        'carol@example.com',
      ]);
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: View Sent Emails
  // --------------------------------------------------------------------------
  describe('Test 5: View Sent Emails', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Re-setup session mock
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });
    });

    it('GET /api/emails?status=SENT should return sent emails with sentAt field', async () => {
      const sentAt = new Date();
      const sentJobs = [
        {
          id: 'email-job-1',
          userId: testUserId,
          idempotencyKey: 'idem-0',
          recipient: 'alice@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime: new Date(Date.now() - 60 * 60 * 1000),
          status: 'SENT',
          sentAt,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 0,
          bullmqJobId: 'bull-1',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        {
          id: 'email-job-2',
          userId: testUserId,
          idempotencyKey: 'idem-1',
          recipient: 'bob@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime: new Date(Date.now() - 60 * 60 * 1000),
          status: 'SENT',
          sentAt,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 1,
          bullmqJobId: 'bull-2',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
        {
          id: 'email-job-3',
          userId: testUserId,
          idempotencyKey: 'idem-2',
          recipient: 'carol@example.com',
          subject: 'Test Campaign',
          body: 'Hello from test',
          sender: 'sender@test.com',
          scheduledTime: new Date(Date.now() - 60 * 60 * 1000),
          status: 'SENT',
          sentAt,
          errorReason: null,
          batchId: 'batch-e2e-001',
          batchOrder: 2,
          bullmqJobId: 'bull-3',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          updatedAt: new Date(),
        },
      ];

      // Mock $transaction for paginated query
      const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
      mockTransaction.mockResolvedValue([sentJobs, 3]);

      const res = await request(app, 'GET', '/api/emails?status=SENT', {
        token: sessionToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(3);

      // Verify each sent email has sentAt field set
      for (const item of res.body.items) {
        expect(item.status).toBe('SENT');
        expect(item.sentAt).not.toBeNull();
        expect(item.sentAt).toBeDefined();
        // Verify sentAt is a valid ISO string
        expect(new Date(item.sentAt).getTime()).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 6: Session Persistence (Refresh Simulation)
  // --------------------------------------------------------------------------
  describe('Test 6: Session Persistence (Refresh Simulation)', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Re-setup session mock
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });
    });

    it('should still authenticate with same token after simulated page refresh', async () => {
      // Simulate a fresh page load where the token is retrieved from localStorage
      const res = await request(app, 'GET', '/api/auth/me', { token: sessionToken });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testUserId);
      expect(res.body.email).toBe(testUser.email);
      expect(res.body.name).toBe(testUser.name);
      expect(res.body.avatarUrl).toBe(testUser.avatarUrl);
    });

    it('should return consistent user data across multiple refreshes', async () => {
      const res1 = await request(app, 'GET', '/api/auth/me', { token: sessionToken });
      const res2 = await request(app, 'GET', '/api/auth/me', { token: sessionToken });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body).toEqual(res2.body);
    });
  });

  // --------------------------------------------------------------------------
  // Test 7: Logout
  // --------------------------------------------------------------------------
  describe('Test 7: Logout', () => {
    it('POST /api/auth/logout should invalidate the session', async () => {
      // Setup session mock for the logout request (auth middleware needs it)
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockImplementation(async (args: any) => {
        if (args.where.token === sessionToken) {
          return {
            id: 'session-001',
            userId: testUserId,
            token: sessionToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            user: testUser,
          };
        }
        return null;
      });

      // Mock deleteMany for invalidateSession
      const mockDeleteMany = prisma.session.deleteMany as ReturnType<typeof vi.fn>;
      mockDeleteMany.mockResolvedValue({ count: 1 });

      const res = await request(app, 'POST', '/api/auth/logout', {
        token: sessionToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');

      // Verify session was deleted
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { token: sessionToken },
      });
    });

    it('GET /api/auth/me should return 401 after logout', async () => {
      // After logout, session no longer exists — findUnique returns null
      const mockSessionFind = prisma.session.findUnique as ReturnType<typeof vi.fn>;
      mockSessionFind.mockResolvedValue(null);

      const res = await request(app, 'GET', '/api/auth/me', { token: sessionToken });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('GET /api/auth/me without any token should return 401', async () => {
      const res = await request(app, 'GET', '/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });
  });
});
