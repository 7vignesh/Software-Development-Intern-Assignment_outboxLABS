# Design Document

## Overview

This document describes the technical architecture and implementation design for the Email Job Scheduler system. The system is structured as a monorepo with a TypeScript Express.js backend and a React + Tailwind CSS frontend. The backend uses BullMQ for delayed job scheduling, PostgreSQL for persistence, Redis for queue storage and rate limiting, and Ethereal Email for SMTP delivery.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + Tailwind)                │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │  Login   │  │  Dashboard   │  │  Compose   │  │  Email List  │  │
│  │  Page    │  │  Layout      │  │  Form      │  │  Tables      │  │
│  └──────────┘  └──────────────┘  └────────────┘  └─────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP/REST (JSON)
┌───────────────────────────────▼─────────────────────────────────────┐
│                         BACKEND (Express.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │ Auth Routes  │  │ Email Routes │  │ Middleware (Auth, Validate)│ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────────┘ │
│         │                  │                                         │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌───────────────────────────┐ │
│  │ Auth Service │  │Email Service │  │   Rate Limiter Service    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│         │                  │                        │               │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌─────────────▼─────────────┐ │
│  │ User Repo   │  │ Email Repo   │  │  Redis Atomic Counters    │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
│         │                  │                        │               │
│  ┌──────▼──────────────────▼────────────────────────▼─────────────┐ │
│  │              BullMQ Queue + Worker                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────┬────────────────┬────────────────────────┬───────────────┘
            │                │                        │
     ┌──────▼──────┐  ┌─────▼──────┐  ┌──────────────▼──┐
     │ PostgreSQL  │  │   Redis    │  │ Ethereal SMTP   │
     │  (Database) │  │  (Queue)   │  │   (Email Send)  │
     └─────────────┘  └────────────┘  └─────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + TypeScript | Dashboard SPA |
| Styling | Tailwind CSS | Utility-first CSS |
| Build Tool | Vite | Frontend bundling |
| Backend | Express.js + TypeScript | REST API server |
| ORM | Prisma | Database access and migrations |
| Queue | BullMQ | Delayed job scheduling |
| Cache/Queue Store | Redis 7 | BullMQ backend + rate limiting |
| Database | PostgreSQL 15 | Persistent storage |
| SMTP | Nodemailer + Ethereal | Email delivery |
| Auth | Passport.js + Google OAuth 2.0 | Authentication |
| Containers | Docker Compose | Local infrastructure |

## Data Models

### PostgreSQL Schema

```sql
-- Users table (Google OAuth)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Jobs table
CREATE TABLE email_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    sender VARCHAR(255) NOT NULL,
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'processing', 'sent', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_reason TEXT,
    batch_id UUID,
    batch_order INTEGER,
    bullmq_job_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_email_jobs_status ON email_jobs(status);
CREATE INDEX idx_email_jobs_user_status ON email_jobs(user_id, status);
CREATE INDEX idx_email_jobs_sender_scheduled ON email_jobs(sender, scheduled_time);
CREATE INDEX idx_email_jobs_batch ON email_jobs(batch_id, batch_order);

-- Sessions table (for server-side sessions)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    token VARCHAR(512) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### BullMQ Job Data Structure

```typescript
interface EmailJobData {
    emailJobId: string;       // UUID referencing email_jobs.id
    idempotencyKey: string;   // For duplicate detection
    recipient: string;
    subject: string;
    body: string;
    sender: string;
}
```

## Components and Interfaces

### Service Interfaces

```typescript
// Email Scheduling Service Interface
interface IEmailSchedulerService {
    scheduleEmails(request: ScheduleEmailRequest): Promise<ScheduleResult>;
    getEmailJob(id: string): Promise<EmailJob | null>;
    getEmailJobs(filter: EmailJobFilter): Promise<PaginatedResult<EmailJob>>;
}

// Rate Limiter Service Interface
interface IRateLimiterService {
    checkRateLimit(sender: string): Promise<RateLimitResult>;
    recordSend(sender: string): Promise<void>;
}

// Auth Service Interface
interface IAuthService {
    handleOAuthCallback(code: string): Promise<{ user: User; sessionToken: string }>;
    validateSession(token: string): Promise<User | null>;
    invalidateSession(token: string): Promise<void>;
}

// SMTP Transport Interface
interface ISmtpTransport {
    sendEmail(options: { to: string; from: string; subject: string; body: string }): Promise<SendResult>;
}

// Lead Parser Interface (Frontend)
interface ILeadParser {
    parseFile(content: string, fileType: 'csv' | 'text'): ParseResult;
}

interface ParseResult {
    validEmails: string[];
    invalidCount: number;
    errors: string[];
}
```

### Repository Interfaces

```typescript
// Email Job Repository
interface IEmailJobRepository {
    create(job: CreateEmailJobInput): Promise<EmailJob>;
    createBatch(jobs: CreateEmailJobInput[]): Promise<EmailJob[]>;
    findById(id: string): Promise<EmailJob | null>;
    findByStatus(status: EmailStatus, pagination: PaginationInput): Promise<PaginatedResult<EmailJob>>;
    updateStatus(id: string, status: EmailStatus, metadata?: Partial<EmailJob>): Promise<EmailJob>;
}

// User Repository
interface IUserRepository {
    findByGoogleId(googleId: string): Promise<User | null>;
    upsert(userData: UpsertUserInput): Promise<User>;
}

// Session Repository
interface ISessionRepository {
    create(userId: string, token: string, expiresAt: Date): Promise<Session>;
    findByToken(token: string): Promise<Session | null>;
    delete(token: string): Promise<void>;
}
```

## Component Design

### Backend Components

#### 1. Email Scheduling Service (`services/emailScheduler.ts`)

Responsibilities:
- Validate scheduling requests
- Create Email_Job records in Database
- Calculate delays and enqueue BullMQ delayed jobs
- Handle batch scheduling with incremental delay offsets

```typescript
interface ScheduleEmailRequest {
    recipients: string[];
    subject: string;
    body: string;
    sender: string;
    scheduledTime: string;          // ISO 8601
    delayBetweenEmailsMs: number;
    maxEmailsPerHour: number;
}

interface ScheduleResult {
    batchId: string;
    totalJobs: number;
    firstScheduledAt: string;
    lastScheduledAt: string;
}
```

Key logic:
- Generate a unique `batch_id` for grouped sends
- For each recipient at index `i`, compute delay: `(scheduledTime - now) + (i * delayBetweenEmailsMs)`
- Generate `idempotency_key` as `sha256(batchId + recipient + scheduledTime)`
- Persist all records in a single database transaction, then enqueue all jobs

#### 2. Email Worker (`workers/emailWorker.ts`)

Responsibilities:
- Process jobs from BullMQ queue
- Check idempotency before sending
- Send via Nodemailer/Ethereal
- Update job status in database
- Coordinate with Rate Limiter

```typescript
// Worker processing flow:
// 1. Receive job from queue
// 2. Load Email_Job from DB by emailJobId
// 3. Check status === 'scheduled' (idempotency guard)
// 4. Check Rate_Limiter allowance
// 5. If rate-limited, reschedule job with new delay
// 6. Update status to 'processing'
// 7. Send email via SMTP transport
// 8. Update status to 'sent' with sent_at timestamp
// 9. On error: retry (transient) or mark failed (permanent)
```

#### 3. Rate Limiter Service (`services/rateLimiter.ts`)

Responsibilities:
- Track sends per sender per hour using Redis
- Enforce minimum inter-email delay
- Provide rescheduling recommendations when limits are hit

```typescript
interface RateLimitResult {
    allowed: boolean;
    retryAfterMs?: number;    // If not allowed, delay until next window
    currentCount: number;
    maxCount: number;
}
```

Redis key structure:
- Hourly counter: `ratelimit:{sender}:{hourTimestamp}` with TTL of 3600s
- Last send time: `lastsend:{sender}` storing epoch ms

Algorithm:
1. Check `lastsend:{sender}` - if within DELAY_BETWEEN_EMAILS_MS, calculate wait time
2. INCR `ratelimit:{sender}:{currentHour}` atomically
3. If count > MAX_EMAILS_PER_HOUR, calculate delay to next hour boundary
4. If allowed, SET `lastsend:{sender}` to current time

#### 4. Auth Service (`services/authService.ts`)

Responsibilities:
- Handle Google OAuth 2.0 flow
- Create/update user records
- Issue and validate session tokens
- Handle logout (session invalidation)

#### 5. SMTP Transport (`services/smtpTransport.ts`)

Responsibilities:
- Configure Nodemailer with Ethereal credentials
- Categorize errors as transient vs permanent
- Return send confirmation with message ID

### Frontend Components

#### 1. Auth Flow
- `pages/Login.tsx` - Google OAuth redirect button
- `hooks/useAuth.ts` - Auth state management, token storage
- `components/ProtectedRoute.tsx` - Route guard redirecting to login

#### 2. Dashboard Layout
- `components/Layout.tsx` - Header with user info, navigation tabs
- `components/Header.tsx` - Avatar, name, email, logout button
- `components/TabNavigation.tsx` - Scheduled / Sent tab switcher

#### 3. Email Composition
- `pages/Compose.tsx` - Full compose form
- `components/FileUpload.tsx` - CSV/text file upload with drag-and-drop
- `utils/leadParser.ts` - Email extraction and validation from file content
- `components/RecipientCount.tsx` - Display parsed recipient count

#### 4. Email Lists
- `pages/Scheduled.tsx` - Scheduled emails table view
- `pages/Sent.tsx` - Sent emails table view
- `components/EmailTable.tsx` - Reusable table with columns config
- `components/LoadingSkeleton.tsx` - Table loading state
- `components/EmptyState.tsx` - No data message
- `components/ErrorState.tsx` - Error with retry button

## API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/auth/google | Initiate OAuth flow | No |
| GET | /api/auth/google/callback | OAuth callback | No |
| GET | /api/auth/me | Get current user profile | Yes |
| POST | /api/auth/logout | Invalidate session | Yes |
| POST | /api/emails/schedule | Schedule email batch | Yes |
| GET | /api/emails?status=scheduled&page=1&limit=20 | List emails by status | Yes |
| GET | /api/emails/:id | Get single email job details | Yes |

## Project Structure

```
email-job-scheduler/
├── docker-compose.yml
├── .env.example
├── packages/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── index.ts                 # Express app entry
│   │       ├── config.ts               # Env config loader
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   └── emails.ts
│   │       ├── services/
│   │       │   ├── emailScheduler.ts
│   │       │   ├── rateLimiter.ts
│   │       │   ├── authService.ts
│   │       │   └── smtpTransport.ts
│   │       ├── workers/
│   │       │   └── emailWorker.ts
│   │       ├── middleware/
│   │       │   ├── auth.ts
│   │       │   └── validate.ts
│   │       ├── repositories/
│   │       │   ├── emailJobRepo.ts
│   │       │   └── userRepo.ts
│   │       ├── types/
│   │       │   └── index.ts
│   │       └── utils/
│   │           └── idempotency.ts
│   └── frontend/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           │   ├── auth.ts
│           │   └── emails.ts
│           ├── components/
│           │   ├── Layout.tsx
│           │   ├── Header.tsx
│           │   ├── TabNavigation.tsx
│           │   ├── FileUpload.tsx
│           │   ├── EmailTable.tsx
│           │   ├── LoadingSkeleton.tsx
│           │   ├── EmptyState.tsx
│           │   ├── ErrorState.tsx
│           │   ├── RecipientCount.tsx
│           │   └── ProtectedRoute.tsx
│           ├── pages/
│           │   ├── Login.tsx
│           │   ├── Dashboard.tsx
│           │   ├── Compose.tsx
│           │   ├── Scheduled.tsx
│           │   └── Sent.tsx
│           ├── hooks/
│           │   ├── useAuth.ts
│           │   └── useEmails.ts
│           ├── utils/
│           │   └── leadParser.ts
│           └── types/
│               └── index.ts
```

## Key Design Decisions

1. **Prisma over raw SQL**: Provides type-safe database access, auto-generated migrations, and works well with TypeScript
2. **UUID for idempotency_key**: Using SHA-256 hash of batch_id + recipient + scheduled_time ensures deterministic keys that prevent duplicate creation even on retry
3. **Status field with 'processing' state**: Prevents race conditions where a job could be picked up by two workers - the transition from 'scheduled' → 'processing' acts as a lock
4. **Batch scheduling in single transaction**: All email jobs for a batch are created atomically - either all persist or none do
5. **Redis for rate limiting over DB**: Atomic INCR operations with TTL provide lock-free, high-performance rate tracking without database contention
6. **Server-side sessions over stateless JWT**: Enables immediate logout (session invalidation) which stateless JWTs cannot provide without a blacklist
7. **Vite for frontend**: Fast HMR, native TypeScript support, optimized production builds

## Error Handling

### Backend Error Categories

| Category | Examples | Response | Recovery Strategy |
|----------|----------|----------|-------------------|
| Validation Error | Missing fields, invalid email format, past scheduled_time | HTTP 400 with descriptive message | Client corrects input and retries |
| Authentication Error | Invalid/expired session token, missing auth header | HTTP 401 Unauthorized | Client redirects to login |
| Rate Limit Error | Sender exceeds MAX_EMAILS_PER_HOUR | Job rescheduled to next window | Automatic via Worker rescheduling |
| Transient SMTP Error | Connection timeout, temporary server failure | Retry up to 3 times with exponential backoff | BullMQ built-in retry mechanism |
| Permanent SMTP Error | Invalid recipient, auth failure | Mark as "failed" immediately | Store error_reason, no retry |
| Database Error | Connection lost, constraint violation | HTTP 500, log error | Reconnect on next request, transaction rollback |
| Redis Error | Connection timeout, memory full | Log and degrade gracefully | BullMQ handles reconnection |

### Error Flow in Worker Processing

1. **Pre-send validation failure**: Job skipped, logged as duplicate (idempotency guard)
2. **Rate limit exceeded**: Job rescheduled with calculated delay, no status change
3. **SMTP transient error**: BullMQ retries with exponential backoff (attempts: 3, backoff: { type: 'exponential', delay: 5000 })
4. **SMTP permanent error**: Status set to "failed", error_reason persisted, job completed
5. **Unexpected error**: Logged with full context, job left for BullMQ retry mechanism

### Frontend Error Handling

- **API errors**: Display error state with retry button, preserve user input
- **Network errors**: Show connectivity warning, auto-retry on reconnection
- **File parsing errors**: Display specific validation messages per file
- **Auth errors**: Redirect to login page with appropriate message

## Testing Strategy

### Unit Tests

Unit tests verify specific component behavior with concrete examples:
- **Email Scheduler Service**: Test job creation, batch scheduling, validation rejection
- **Rate Limiter Service**: Test counter increment, window boundary behavior, concurrent access
- **Auth Service**: Test session creation, validation, and invalidation
- **Lead Parser**: Test CSV parsing, email validation, error cases
- **API Routes**: Test request validation, response formatting, auth middleware

### Property-Based Tests

Property-based tests verify universal correctness properties across randomly generated inputs. Each property test runs a minimum of 100 iterations using `fast-check`.

- Library: `fast-check` (TypeScript property-based testing)
- Configuration: 100+ iterations per property
- Tag format: **Feature: email-job-scheduler, Property {number}: {property_text}**

Properties tested:
- Idempotency key uniqueness across batches
- Batch job count equals recipient count
- Incremental delay ordering preservation
- Rate limit invariant enforcement
- Lead parser email extraction completeness
- Email job serialization round-trip

### Integration Tests

- **Database operations**: Verify Prisma queries against a test PostgreSQL instance
- **BullMQ queue**: Verify job enqueueing, delay accuracy, and worker processing
- **Redis rate limiting**: Verify atomic counter behavior under concurrency
- **OAuth flow**: Verify Google callback handling with mocked responses
- **SMTP delivery**: Verify Nodemailer sends via Ethereal test accounts

### End-to-End Tests

- Full scheduling flow: compose → schedule → queue → deliver → status update
- Auth flow: login → access protected routes → logout → redirect

## Correctness Properties

### Property 1: Idempotency Key Uniqueness

*For any* set of Email_Jobs created within a batch, all idempotency_keys are unique. Formally: for jobs J1 and J2 where J1 ≠ J2, idempotencyKey(J1) ≠ idempotencyKey(J2).

**Validates: Requirements 1.4**

### Property 2: Batch Job Count Equals Recipient Count

*For any* scheduling request with N recipients, exactly N Email_Jobs are created in the database and N delayed jobs are enqueued. Formally: |emailJobs| = |recipients| for any valid batch.

**Validates: Requirements 1.5**

### Property 3: Incremental Delay Ordering

*For any* batch of N jobs ordered by batch_order, job[i].effectiveDelay = baseDelay + (i * delayBetweenEmailsMs). Each subsequent job's scheduled execution time is exactly delayBetweenEmailsMs later than the previous.

**Validates: Requirements 1.5**

### Property 4: Rate Limit Invariant

*For any* sender S and any 1-hour window W, the count of Email_Jobs with status "sent" and sent_at within W is less than or equal to MAX_EMAILS_PER_HOUR. Formally: count(sent_emails(S, W)) ≤ MAX_EMAILS_PER_HOUR.

**Validates: Requirements 3.2**

### Property 5: Inter-Email Delay Invariant

*For any* sender S and any two consecutively sent emails E1 and E2 (ordered by sent_at), the time difference is at least DELAY_BETWEEN_EMAILS_MS. Formally: E2.sent_at - E1.sent_at ≥ DELAY_BETWEEN_EMAILS_MS.

**Validates: Requirements 3.1**

### Property 6: Rescheduling Preserves Order

*For any* batch of jobs rescheduled due to rate limiting, their relative order (by batch_order within the same batch) is preserved. Formally: if job[i].batch_order < job[j].batch_order, then job[i].effective_scheduled_time ≤ job[j].effective_scheduled_time.

**Validates: Requirements 3.3**

### Property 7: Idempotent Processing

*For any* Worker that receives a job whose Email_Job status is already "sent" or "failed", the Worker does not invoke the SMTP_Transport. The email is sent at most once regardless of how many times the job is processed.

**Validates: Requirements 4.4**

### Property 8: Lead Parser Email Extraction

*For any* input string containing N valid email addresses (matching RFC 5322 simplified pattern) interspersed with arbitrary text, the Lead_Parser extracts exactly those N addresses. Invalid formats are excluded, valid ones are never lost.

**Validates: Requirements 6.2**

### Property 9: Email Job JSON Round-Trip

*For any* valid Email_Job object E, deserialize(serialize(E)) produces an object equivalent to E. All fields including timestamps (ISO 8601) and UUIDs survive the round-trip without data loss or type coercion errors.

**Validates: Requirements 10.5**

### Property 10: Pagination Completeness

*For any* dataset of N Email_Jobs with a given status, iterating through all pages (page 1 to ceil(N/limit)) returns exactly N unique jobs with no duplicates and no omissions.

**Validates: Requirements 10.2**
