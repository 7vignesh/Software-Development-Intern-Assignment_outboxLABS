import client from './client';
import type { ScheduleEmailRequest, EmailJob, PaginatedResponse } from '../types';

/**
 * Schedule a batch of emails for delivery.
 */
export async function scheduleEmails(request: ScheduleEmailRequest): Promise<{ batchId: string; totalJobs: number }> {
  const response = await client.post('/emails/schedule', request);
  return response.data;
}

/**
 * Fetch emails filtered by status with pagination.
 */
export async function getEmails(
  status: string,
  page: number,
  limit: number
): Promise<PaginatedResponse<EmailJob>> {
  const response = await client.get('/emails', {
    params: { status, page, limit },
  });
  return response.data;
}
