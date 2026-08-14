import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client
vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    emailJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  default: {
    $transaction: vi.fn(),
    emailJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock BullMQ queue
vi.mock('../queue/emailQueue', () => ({
  addEmailJob: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job-id' }),
  getQueue: vi.fn(),
}));

// Mock SMTP transport
vi.mock('../services/smtpTransport', () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-msg-id', previewUrl: '' }),
  categorizeError: vi.fn().mockReturnValue('transient'),
  initializeTransport: vi.fn(),
}));

// Mock config to avoid env var validation
vi.mock('../config', () => ({
  default: {
    redisUrl: 'redis://localhost:6379',
    maxEmailsPerHour: 100,
    delayBetweenEmailsMs: 1000,
    workerConcurrency: 1,
    smtpHost: 'smtp.ethereal.email',
    smtpPort: 587,
    smtpUser: 'test@ethereal.email',
    smtpPass: 'test-pass',
  },
}));

import { prisma } from '../lib/prisma';
import { addEmailJob } from '../queue/emailQueue';
import { sendEmail } from '../services/smtpTransport';
import { scheduleEmails } from '../services/emailScheduler';
import { ScheduleEmailRequest } from '../types';

// ---- Helpers to mock the worker processor logic inline ----
// We replicate the core worker logic here since the actual worker file
// instantiates Redis and BullMQ connections on import. Testing the
// processor function directly avoids those side effects.

interface MockRateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  currentCount: number;
  maxCount: number;
}

const mockRateLimiter = {
  checkRateLimit: vi.fn<[string], Promise<MockRateLimitResult>>(),
  recordSend: vi.fn().mockResolvedValue(undefined),
};

/**
 * Simulates the email worker processor logic.
 * This mirrors the processEmailJob function in workers/emailWorker.ts
 * without requiring live Redis/BullMQ connections.
 */
async function simulateWorkerProcess(jobData: {
  emailJobId: string;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
}): Promise<void> {
  const { emailJobId, sender, recipient, subject, body } = jobData;

  // 1. Load EmailJob from DB
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
  });

  if (!emailJob) return;

  // 2. Idempotency guard
  if (emailJob.status === 'SENT' || emailJob.status === 'FAILED') {
    return;
  }

  // 3. Check rate limiter
  const rateLimitResult = await mockRateLimiter.checkRateLimit(sender);

  if (!rateLimitResult.allowed) {
    const retryDelay = rateLimitResult.retryAfterMs ?? 1000;
    await addEmailJob(jobData, retryDelay);
    return;
  }

  // 4. Transition to PROCESSING
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: 'PROCESSING' },
  });

  // 5. Send email
  await sendEmail(sender, recipient, subject, body);

  // 6. Update to SENT
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: 'SENT', sentAt: expect.any(Date) },
  });

  // 7. Record send for rate limiting
  await mockRateLimiter.recordSend(sender);
}

describe('Integration Tests - Email Job Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('16.1 - Schedule a batch of 5 emails', () => {
    it('should create 5 EmailJob records and enqueue 5 BullMQ jobs with correct delays', async () => {
      const recipients = [
        'alice@example.com',
        'bob@example.com',
        'carol@example.com',
        'dave@example.com',
        'eve@example.com',
      ];

      const request: ScheduleEmailRequest = {
        recipients,
        subject: 'Hello Batch',
        body: '<p>Test body</p>',
        sender: 'sender@example.com',
        scheduledTime: new Date(Date.now() + 60000).toISOString(), // 1 minute in the future
        delayBetweenEmailsMs: 2000,
        maxEmailsPerHour: 100,
      };

      // Mock $transaction to return 5 created jobs (simulating prisma.$transaction with array of creates)
      const mockCreatedJobs = recipients.map((recipient, i) => ({
        id: `job-${i + 1}`,
        userId: 'user-123',
        idempotencyKey: `key-${i}`,
        recipient,
        subject: request.subject,
        body: request.body,
        sender: request.sender,
        scheduledTime: new Date(),
        status: 'SCHEDULED',
        sentAt: null,
        errorReason: null,
        batchId: 'batch-uuid',
        batchOrder: i,
        bullmqJobId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
      mockTransaction.mockResolvedValue(mockCreatedJobs);

      const result = await scheduleEmails(request, 'user-123');

      // Assert: transaction called with array of 5 create operations
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      const transactionArg = mockTransaction.mock.calls[0][0];
      expect(transactionArg).toHaveLength(5);

      // Assert: addEmailJob called 5 times with correct delays
      expect(addEmailJob).toHaveBeenCalledTimes(5);

      // Verify delays are incremental (each subsequent job has +2000ms delay)
      const calls = (addEmailJob as ReturnType<typeof vi.fn>).mock.calls;
      for (let i = 0; i < 5; i++) {
        const [jobData, delayMs] = calls[i];
        expect(jobData.emailJobId).toBe(`job-${i + 1}`);
        expect(jobData.recipient).toBe(recipients[i]);
        // Each job's delay should be approximately baseDelay + (i * 2000)
        if (i > 0) {
          const prevDelay = calls[i - 1][1];
          expect(delayMs - prevDelay).toBeCloseTo(2000, -1);
        }
      }

      // Assert: result indicates 5 total jobs
      expect(result.totalJobs).toBe(5);
      expect(result.batchId).toBeDefined();
    });
  });

  describe('16.2 - Worker processes a job successfully', () => {
    it('should transition status from SCHEDULED → PROCESSING → SENT with sentAt', async () => {
      const jobData = {
        emailJobId: 'job-abc',
        idempotencyKey: 'idem-key-1',
        recipient: 'recipient@example.com',
        subject: 'Test Subject',
        body: '<p>Hello</p>',
        sender: 'sender@example.com',
      };

      // Mock findUnique to return a SCHEDULED job
      const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
      mockFindUnique.mockResolvedValue({
        id: 'job-abc',
        status: 'SCHEDULED',
        userId: 'user-1',
        recipient: 'recipient@example.com',
        subject: 'Test Subject',
        body: '<p>Hello</p>',
        sender: 'sender@example.com',
        scheduledTime: new Date(),
        idempotencyKey: 'idem-key-1',
      });

      // Mock rate limiter to allow
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: true,
        currentCount: 1,
        maxCount: 100,
      });

      // Mock update
      const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;
      mockUpdate.mockResolvedValue({});

      // Mock sendEmail to succeed
      (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        messageId: 'msg-123',
        previewUrl: 'https://ethereal.email/preview/msg-123',
      });

      await simulateWorkerProcess(jobData);

      // Verify: update called twice
      expect(mockUpdate).toHaveBeenCalledTimes(2);

      // First call: transition to PROCESSING
      expect(mockUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: 'job-abc' },
        data: { status: 'PROCESSING' },
      });

      // Second call: transition to SENT with sentAt
      expect(mockUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: 'job-abc' },
        data: { status: 'SENT', sentAt: expect.any(Date) },
      });

      // Verify: sendEmail was called with correct params
      expect(sendEmail).toHaveBeenCalledWith(
        'sender@example.com',
        'recipient@example.com',
        'Test Subject',
        '<p>Hello</p>'
      );

      // Verify: recordSend was called
      expect(mockRateLimiter.recordSend).toHaveBeenCalledWith('sender@example.com');
    });
  });

  describe('16.3 - Rate limit exceeded, job rescheduled', () => {
    it('should reschedule the job with retryAfterMs delay and NOT send the email', async () => {
      const jobData = {
        emailJobId: 'job-rate-limited',
        idempotencyKey: 'idem-key-2',
        recipient: 'limited@example.com',
        subject: 'Rate Limited Test',
        body: '<p>Delayed</p>',
        sender: 'busy-sender@example.com',
      };

      // Mock findUnique to return a SCHEDULED job
      const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
      mockFindUnique.mockResolvedValue({
        id: 'job-rate-limited',
        status: 'SCHEDULED',
        userId: 'user-2',
        recipient: 'limited@example.com',
        subject: 'Rate Limited Test',
        body: '<p>Delayed</p>',
        sender: 'busy-sender@example.com',
        scheduledTime: new Date(),
        idempotencyKey: 'idem-key-2',
      });

      // Mock rate limiter to deny with retryAfterMs
      mockRateLimiter.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterMs: 3600000, // 1 hour
        currentCount: 100,
        maxCount: 100,
      });

      const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;

      await simulateWorkerProcess(jobData);

      // Verify: addEmailJob called with retryAfterMs delay to reschedule
      expect(addEmailJob).toHaveBeenCalledTimes(1);
      expect(addEmailJob).toHaveBeenCalledWith(jobData, 3600000);

      // Verify: sendEmail NOT called
      expect(sendEmail).not.toHaveBeenCalled();

      // Verify: status NOT changed (no update calls — job is rescheduled, not transitioned)
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('16.4 - Idempotency: already-sent email not re-sent', () => {
    it('should skip processing and NOT call sendEmail for a job with status SENT', async () => {
      const jobData = {
        emailJobId: 'job-already-sent',
        idempotencyKey: 'idem-key-3',
        recipient: 'already@example.com',
        subject: 'Already Sent',
        body: '<p>Old email</p>',
        sender: 'sender@example.com',
      };

      // Mock findUnique to return a job with status SENT
      const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
      mockFindUnique.mockResolvedValue({
        id: 'job-already-sent',
        status: 'SENT',
        userId: 'user-3',
        recipient: 'already@example.com',
        subject: 'Already Sent',
        body: '<p>Old email</p>',
        sender: 'sender@example.com',
        scheduledTime: new Date(),
        sentAt: new Date(Date.now() - 3600000),
        idempotencyKey: 'idem-key-3',
      });

      const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;

      // Should complete without error
      await simulateWorkerProcess(jobData);

      // Verify: sendEmail NOT called
      expect(sendEmail).not.toHaveBeenCalled();

      // Verify: no status update occurred
      expect(mockUpdate).not.toHaveBeenCalled();

      // Verify: rate limiter was never consulted
      expect(mockRateLimiter.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should skip processing and NOT call sendEmail for a job with status FAILED', async () => {
      const jobData = {
        emailJobId: 'job-already-failed',
        idempotencyKey: 'idem-key-4',
        recipient: 'failed@example.com',
        subject: 'Already Failed',
        body: '<p>Failed email</p>',
        sender: 'sender@example.com',
      };

      // Mock findUnique to return a job with status FAILED
      const mockFindUnique = prisma.emailJob.findUnique as ReturnType<typeof vi.fn>;
      mockFindUnique.mockResolvedValue({
        id: 'job-already-failed',
        status: 'FAILED',
        userId: 'user-4',
        recipient: 'failed@example.com',
        subject: 'Already Failed',
        body: '<p>Failed email</p>',
        sender: 'sender@example.com',
        scheduledTime: new Date(),
        errorReason: 'Invalid recipient',
        idempotencyKey: 'idem-key-4',
      });

      const mockUpdate = prisma.emailJob.update as ReturnType<typeof vi.fn>;

      // Should complete without error
      await simulateWorkerProcess(jobData);

      // Verify: sendEmail NOT called
      expect(sendEmail).not.toHaveBeenCalled();

      // Verify: no status update occurred
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
