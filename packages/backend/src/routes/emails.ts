import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EmailStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { scheduleEmails } from '../services/emailScheduler';
import * as emailJobRepo from '../repositories/emailJobRepo';
import { EmailJobResponse, PaginatedResponse } from '../types';

const router = Router();

// --- Validation Schemas ---

/**
 * Zod schema for POST /api/emails/schedule request body.
 * Validates that scheduledTime is a future ISO 8601 date.
 */
const scheduleEmailSchema = z.object({
  recipients: z
    .array(z.string().min(1, 'Each recipient must be non-empty'))
    .min(1, 'At least one recipient is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  sender: z.string().email('Sender must be a valid email address'),
  scheduledTime: z
    .string()
    .refine(
      (val) => !isNaN(Date.parse(val)),
      'scheduledTime must be a valid ISO 8601 date string'
    )
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      'scheduledTime must be in the future'
    ),
  delayBetweenEmailsMs: z
    .number()
    .min(0, 'delayBetweenEmailsMs must be >= 0'),
  maxEmailsPerHour: z
    .number()
    .gt(0, 'maxEmailsPerHour must be greater than 0'),
});

// --- Routes ---

/**
 * POST /api/emails/schedule
 * Schedules a batch of emails for future delivery.
 * Requirements: 10.1, 1.1, 1.2
 */
router.post(
  '/schedule',
  authenticate,
  validate(scheduleEmailSchema),
  async (req: Request, res: Response) => {
    try {
      const result = await scheduleEmails(req.body, req.user!.id);
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      // Validation-level errors from the service (e.g., past scheduledTime)
      if (message.includes('must be in the future')) {
        res.status(400).json({ error: message });
        return;
      }

      console.error('[Emails] Schedule error:', message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/emails
 * Returns a paginated list of email jobs, optionally filtered by status.
 * Requirements: 10.2
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    // Parse and validate query params
    const statusParam = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    // Validate status if provided
    if (statusParam) {
      const validStatuses = Object.values(EmailStatus);
      if (!validStatuses.includes(statusParam as EmailStatus)) {
        res.status(400).json({
          error: 'Validation failed',
          details: {
            status: [`Invalid status. Must be one of: ${validStatuses.join(', ')}`],
          },
        });
        return;
      }
    }

    const status = statusParam as EmailStatus;
    const result = await emailJobRepo.findByStatus(req.user!.id, status, page, limit);

    // Transform EmailJob[] to EmailJobResponse[]
    const items: EmailJobResponse[] = result.items.map(toEmailJobResponse);

    const response: PaginatedResponse<EmailJobResponse> = {
      items,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    };

    res.json(response);
  } catch (error) {
    console.error('[Emails] List error:', (error as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/emails/:id
 * Returns a single email job by ID. Verifies ownership.
 * Requirements: 10.2
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const emailJob = await emailJobRepo.findById(id);

    if (!emailJob) {
      res.status(404).json({ error: 'Email job not found' });
      return;
    }

    // Verify ownership
    if (emailJob.userId !== req.user!.id) {
      res.status(404).json({ error: 'Email job not found' });
      return;
    }

    res.json(toEmailJobResponse(emailJob));
  } catch (error) {
    console.error('[Emails] Get by ID error:', (error as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Helpers ---

/**
 * Transforms a Prisma EmailJob model to an API-friendly EmailJobResponse
 * with dates serialized as ISO 8601 strings.
 */
function toEmailJobResponse(job: {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  scheduledTime: Date;
  status: string;
  sentAt: Date | null;
  errorReason: string | null;
  batchId: string | null;
  batchOrder: number | null;
  createdAt: Date;
}): EmailJobResponse {
  return {
    id: job.id,
    recipient: job.recipient,
    subject: job.subject,
    body: job.body,
    sender: job.sender,
    scheduledTime: job.scheduledTime.toISOString(),
    status: job.status,
    sentAt: job.sentAt ? job.sentAt.toISOString() : null,
    errorReason: job.errorReason,
    batchId: job.batchId,
    batchOrder: job.batchOrder,
    createdAt: job.createdAt.toISOString(),
  };
}

export default router;
