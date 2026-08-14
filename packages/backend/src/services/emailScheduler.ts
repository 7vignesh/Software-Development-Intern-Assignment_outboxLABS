import { v4 as uuid } from 'uuid';
import { prisma } from '../lib/prisma';
import { generateIdempotencyKey } from '../utils/idempotency';
import { ScheduleEmailRequest, ScheduleResult } from '../types';
import { addEmailJob } from '../queue/emailQueue';
import { EmailStatus } from '@prisma/client';

/**
 * Schedules a batch of emails for future delivery.
 *
 * Validates the scheduled time, generates batch metadata, computes per-recipient
 * delays (with hourly window distribution when needed), persists all jobs in a
 * single transaction, and enqueues BullMQ delayed jobs.
 *
 * Requirements: 1.1, 1.3, 1.4, 1.5
 */
export async function scheduleEmails(
  request: ScheduleEmailRequest,
  userId: string
): Promise<ScheduleResult> {
  const {
    recipients,
    subject,
    body,
    sender,
    scheduledTime,
    delayBetweenEmailsMs,
    maxEmailsPerHour,
  } = request;

  const now = new Date();
  const scheduledDate = new Date(scheduledTime);

  // 1. Validate scheduledTime is in the future (Requirement 1.3)
  if (scheduledDate.getTime() <= now.getTime()) {
    throw new Error('Scheduled time must be in the future');
  }

  // 2. Generate batchId
  const batchId = uuid();

  // 3. Compute per-recipient delays and idempotency keys
  const baseDelayMs = scheduledDate.getTime() - now.getTime();
  const MS_PER_HOUR = 3_600_000;

  // 4. Handle batch distribution across hourly windows (Requirement 3.4)
  // If recipients exceed maxEmailsPerHour, distribute across multiple hour windows
  const jobPrepData = recipients.map((recipient, i) => {
    let effectiveDelayMs: number;

    if (recipients.length > maxEmailsPerHour) {
      // Distribute across hourly windows respecting rate limits
      const hourWindow = Math.floor(i / maxEmailsPerHour);
      const indexWithinWindow = i % maxEmailsPerHour;
      effectiveDelayMs =
        baseDelayMs +
        hourWindow * MS_PER_HOUR +
        indexWithinWindow * delayBetweenEmailsMs;
    } else {
      // Simple incremental delay within a single window
      effectiveDelayMs = baseDelayMs + i * delayBetweenEmailsMs;
    }

    const idempotencyKey = generateIdempotencyKey(batchId, recipient, scheduledTime);
    const effectiveScheduledTime = new Date(now.getTime() + effectiveDelayMs);

    return {
      recipient,
      batchOrder: i,
      effectiveDelayMs,
      effectiveScheduledTime,
      idempotencyKey,
    };
  });

  // 5. Persist all EmailJob records in a single Prisma transaction (Requirement 1.1, 1.4)
  const createdJobs = await prisma.$transaction(
    jobPrepData.map((job) =>
      prisma.emailJob.create({
        data: {
          userId,
          idempotencyKey: job.idempotencyKey,
          recipient: job.recipient,
          subject,
          body,
          sender,
          scheduledTime: job.effectiveScheduledTime,
          status: EmailStatus.SCHEDULED,
          batchId,
          batchOrder: job.batchOrder,
        },
      })
    )
  );

  // 6. After successful persist, enqueue all BullMQ delayed jobs (Requirement 1.1, 1.5)
  for (let i = 0; i < createdJobs.length; i++) {
    const createdJob = createdJobs[i];
    const prepData = jobPrepData[i];

    await addEmailJob(
      {
        emailJobId: createdJob.id,
        idempotencyKey: createdJob.idempotencyKey,
        recipient: createdJob.recipient,
        subject,
        body,
        sender,
      },
      prepData.effectiveDelayMs
    );
  }

  // 7. Return result
  const firstScheduledAt = jobPrepData[0].effectiveScheduledTime.toISOString();
  const lastScheduledAt =
    jobPrepData[jobPrepData.length - 1].effectiveScheduledTime.toISOString();

  return {
    batchId,
    totalJobs: createdJobs.length,
    firstScheduledAt,
    lastScheduledAt,
  };
}
