import { EmailJob, EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateEmailJobInput {
  userId: string;
  idempotencyKey: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  scheduledTime: Date;
  status?: EmailStatus;
  batchId?: string;
  batchOrder?: number;
  bullmqJobId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface UpdateStatusExtras {
  sentAt?: Date;
  errorReason?: string;
  bullmqJobId?: string;
}

/**
 * Creates a single EmailJob record.
 */
export async function create(data: CreateEmailJobInput): Promise<EmailJob> {
  return prisma.emailJob.create({
    data: {
      userId: data.userId,
      idempotencyKey: data.idempotencyKey,
      recipient: data.recipient,
      subject: data.subject,
      body: data.body,
      sender: data.sender,
      scheduledTime: data.scheduledTime,
      status: data.status ?? EmailStatus.SCHEDULED,
      batchId: data.batchId,
      batchOrder: data.batchOrder,
      bullmqJobId: data.bullmqJobId,
    },
  });
}

/**
 * Creates multiple EmailJob records in a single transaction.
 */
export async function createMany(data: CreateEmailJobInput[]): Promise<EmailJob[]> {
  return prisma.$transaction(
    data.map((item) =>
      prisma.emailJob.create({
        data: {
          userId: item.userId,
          idempotencyKey: item.idempotencyKey,
          recipient: item.recipient,
          subject: item.subject,
          body: item.body,
          sender: item.sender,
          scheduledTime: item.scheduledTime,
          status: item.status ?? EmailStatus.SCHEDULED,
          batchId: item.batchId,
          batchOrder: item.batchOrder,
          bullmqJobId: item.bullmqJobId,
        },
      })
    )
  );
}

/**
 * Finds a single EmailJob by its UUID.
 */
export async function findById(id: string): Promise<EmailJob | null> {
  return prisma.emailJob.findUnique({
    where: { id },
  });
}

/**
 * Finds EmailJobs filtered by userId and status with pagination.
 * Results are ordered by createdAt descending (newest first).
 */
export async function findByStatus(
  userId: string,
  status: EmailStatus,
  page: number,
  limit: number
): Promise<PaginatedResult<EmailJob>> {
  const skip = (page - 1) * limit;

  const [items, total] = await prisma.$transaction([
    prisma.emailJob.findMany({
      where: { userId, status },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.emailJob.count({
      where: { userId, status },
    }),
  ]);

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Updates the status of an EmailJob, optionally setting sentAt, errorReason, or bullmqJobId.
 */
export async function updateStatus(
  id: string,
  status: EmailStatus,
  extras?: UpdateStatusExtras
): Promise<EmailJob> {
  const updateData: Prisma.EmailJobUpdateInput = {
    status,
    ...(extras?.sentAt && { sentAt: extras.sentAt }),
    ...(extras?.errorReason && { errorReason: extras.errorReason }),
    ...(extras?.bullmqJobId && { bullmqJobId: extras.bullmqJobId }),
  };

  return prisma.emailJob.update({
    where: { id },
    data: updateData,
  });
}

/**
 * Finds an EmailJob by its unique idempotency key.
 */
export async function findByIdempotencyKey(key: string): Promise<EmailJob | null> {
  return prisma.emailJob.findUnique({
    where: { idempotencyKey: key },
  });
}
