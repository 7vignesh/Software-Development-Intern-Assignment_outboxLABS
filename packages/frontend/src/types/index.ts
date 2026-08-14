export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface EmailJob {
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

export interface ScheduleEmailRequest {
  recipients: string[];
  subject: string;
  body: string;
  sender: string;
  scheduledTime: string;
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}
