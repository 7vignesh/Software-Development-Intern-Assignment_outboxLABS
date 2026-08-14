/**
 * BullMQ Email Worker
 *
 * Processes email send jobs from the 'email-sends' queue.
 * Handles:
 * - Idempotency checks (skip if already sent/failed)
 * - Rate limiting with rescheduling
 * - SMTP sending via Ethereal
 * - Error classification (transient = retry, permanent = fail immediately)
 * - DB status transitions: SCHEDULED → PROCESSING → SENT / FAILED
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 4.3, 4.4
 */

import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import config from '../config';
import { prisma } from '../lib/prisma';
import { RateLimiter } from '../services/rateLimiter';
import { sendEmail, categorizeError } from '../services/smtpTransport';
import { EmailJobData, addEmailJob } from '../queue/emailQueue';
import { EmailStatus } from '@prisma/client';

const QUEUE_NAME = 'email-sends';

/**
 * Parse a Redis URL (redis://host:port) into host and port components
 * for BullMQ Worker connection configuration.
 */
function parseRedisUrl(redisUrl: string): { host: string; port: number } {
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 6379,
    };
  } catch {
    const match = redisUrl.match(/(?:redis:\/\/)?([^:]+):(\d+)/);
    if (match) {
      return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: 'localhost', port: 6379 };
  }
}

// Redis connection for the worker
const redisConnection = parseRedisUrl(config.redisUrl);

// Separate Redis client for the RateLimiter (BullMQ manages its own connections)
const rateLimiterRedis = new Redis(config.redisUrl);

const rateLimiter = new RateLimiter(rateLimiterRedis, {
  maxEmailsPerHour: config.maxEmailsPerHour,
  delayBetweenEmailsMs: config.delayBetweenEmailsMs,
});

let worker: Worker<EmailJobData> | null = null;

/**
 * Processor function for the email worker.
 * Handles loading, validation, rate limiting, sending, and status updates.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailJobId, sender, recipient, subject, body } = job.data;

  // 1. Load EmailJob from database
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
  });

  if (!emailJob) {
    console.warn(`[Worker] EmailJob ${emailJobId} not found in database. Skipping.`);
    return;
  }

  // 2. Idempotency guard - skip if already sent or failed
  if (emailJob.status === EmailStatus.SENT || emailJob.status === EmailStatus.FAILED) {
    console.info(
      `[Worker] EmailJob ${emailJobId} already has status '${emailJob.status}'. Skipping duplicate.`
    );
    return;
  }

  // 3. Check rate limiter
  const rateLimitResult = await rateLimiter.checkRateLimit(sender);

  if (!rateLimitResult.allowed) {
    // Reschedule the job with the calculated delay
    const retryDelay = rateLimitResult.retryAfterMs ?? 1000;
    console.info(
      `[Worker] Rate limited for sender '${sender}'. Rescheduling job ${emailJobId} with ${retryDelay}ms delay.`
    );

    // Re-add the job to the queue with the retry delay
    await addEmailJob(job.data, retryDelay);

    // Return without processing — the new job will be picked up later
    return;
  }

  // 4. Transition status to PROCESSING
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: EmailStatus.PROCESSING },
  });

  // 5. Attempt to send the email via SMTP
  try {
    await sendEmail(sender, recipient, subject, body);

    // 6. Update status to SENT with sent_at timestamp
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
      },
    });

    // 7. Record the send for rate limiting
    await rateLimiter.recordSend(sender);

    console.info(`[Worker] Successfully sent email job ${emailJobId} to ${recipient}.`);
  } catch (error: unknown) {
    // 8. Classify the error
    const errorCategory = categorizeError(error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown SMTP error';

    if (errorCategory === 'transient') {
      // Throw so BullMQ retries with exponential backoff (attempts=3, backoff 5s exponential)
      console.warn(
        `[Worker] Transient error for job ${emailJobId}: ${errorMessage}. Will retry.`
      );

      // Revert status back to SCHEDULED so it can be retried
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: EmailStatus.SCHEDULED },
      });

      throw error;
    } else {
      // Permanent error — mark as failed immediately, don't throw
      console.error(
        `[Worker] Permanent error for job ${emailJobId}: ${errorMessage}. Marking as FAILED.`
      );

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: EmailStatus.FAILED,
          errorReason: errorMessage,
        },
      });
    }
  }
}

/**
 * Starts the BullMQ worker, begins processing jobs from the 'email-sends' queue.
 */
export function startWorker(): Worker<EmailJobData> {
  worker = new Worker<EmailJobData>(QUEUE_NAME, processEmailJob, {
    connection: redisConnection,
    concurrency: config.workerConcurrency,
  });

  // Handle the 'failed' event — fires when all retries are exhausted
  worker.on('failed', async (job, error) => {
    if (!job) return;

    const { emailJobId } = job.data;
    const errorMessage = error?.message ?? 'Unknown error after retries exhausted';

    console.error(
      `[Worker] Job ${job.id} for EmailJob ${emailJobId} failed after all retries: ${errorMessage}`
    );

    // Update DB status to FAILED when all retries are exhausted
    try {
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: EmailStatus.FAILED,
          errorReason: `All retries exhausted: ${errorMessage}`,
        },
      });
    } catch (dbError) {
      console.error(
        `[Worker] Failed to update DB status for EmailJob ${emailJobId}:`,
        dbError
      );
    }
  });

  worker.on('completed', (job) => {
    if (job) {
      console.debug(`[Worker] Job ${job.id} completed successfully.`);
    }
  });

  worker.on('error', (error) => {
    console.error('[Worker] Worker error:', error);
  });

  console.info(
    `[Worker] Email worker started with concurrency ${config.workerConcurrency}.`
  );

  return worker;
}

/**
 * Gracefully closes the worker and its Redis connections.
 */
export async function closeWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await rateLimiterRedis.quit();
  console.info('[Worker] Email worker stopped.');
}
