import crypto from 'crypto';

/**
 * Generates a deterministic idempotency key for an email job using SHA-256.
 * The key is derived from the combination of batchId, recipient, and scheduledTime,
 * ensuring each email job within a batch has a unique, reproducible identifier.
 *
 * @param batchId - The unique identifier for the email batch
 * @param recipient - The recipient email address
 * @param scheduledTime - The ISO 8601 scheduled time string
 * @returns A hex-encoded SHA-256 hash string
 */
export function generateIdempotencyKey(
  batchId: string,
  recipient: string,
  scheduledTime: string
): string {
  const data = batchId + recipient + scheduledTime;
  return crypto.createHash('sha256').update(data).digest('hex');
}
