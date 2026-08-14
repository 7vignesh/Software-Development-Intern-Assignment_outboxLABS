/**
 * Shared TypeScript interfaces for the Email Job Scheduler backend.
 * Requirements: 10.1, 10.2
 */

/** Request body for POST /api/emails/schedule */
export interface ScheduleEmailRequest {
  recipients: string[];
  subject: string;
  body: string;
  sender: string;
  scheduledTime: string; // ISO 8601
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
}

/** Result returned after successfully scheduling a batch of emails */
export interface ScheduleResult {
  batchId: string;
  totalJobs: number;
  firstScheduledAt: string;
  lastScheduledAt: string;
}

/** Serialized representation of an email job returned by the API */
export interface EmailJobResponse {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  sender: string;
  scheduledTime: string;
  status: string;
  sentAt: string | null;
  errorReason: string | null;
  batchId: string | null;
  batchOrder: number | null;
  createdAt: string;
}

/** Authenticated user profile returned by GET /api/auth/me */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Generic paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

/** Result of a rate limit check for a sender */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  currentCount: number;
  maxCount: number;
}

// Extend the Express Request type to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}
