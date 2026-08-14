import { Queue, Job } from 'bullmq';
import config from '../config';

/**
 * Data structure for email jobs enqueued to BullMQ.
 */
export interface EmailJobData {
  emailJobId: string;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
}

const QUEUE_NAME = 'email-sends';

/**
 * Parse a Redis URL (redis://host:port) into host and port components
 * for BullMQ's connection configuration.
 */
function parseRedisUrl(redisUrl: string): { host: string; port: number } {
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port, 10) : 6379,
    };
  } catch {
    // Fallback: attempt basic parsing for non-standard formats
    const match = redisUrl.match(/(?:redis:\/\/)?([^:]+):(\d+)/);
    if (match) {
      return { host: match[1], port: parseInt(match[2], 10) };
    }
    return { host: 'localhost', port: 6379 };
  }
}

const redisConnection = parseRedisUrl(config.redisUrl);

const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: redisConnection,
});

/**
 * Returns the BullMQ Queue instance for the email-sends queue.
 */
export function getQueue(): Queue<EmailJobData> {
  return emailQueue;
}

/**
 * Adds an email job to the queue with the specified delay.
 * Configured with:
 * - 3 retry attempts with exponential backoff (5s base delay)
 * - removeOnComplete: true (clean up successful jobs)
 * - removeOnFail: false (keep failed jobs for debugging)
 */
export async function addEmailJob(
  jobData: EmailJobData,
  delayMs: number
): Promise<Job<EmailJobData>> {
  const job = await emailQueue.add(QUEUE_NAME, jobData, {
    delay: delayMs,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  });

  return job;
}

/**
 * Closes the queue connection for graceful shutdown.
 */
export async function closeQueue(): Promise<void> {
  await emailQueue.close();
}
