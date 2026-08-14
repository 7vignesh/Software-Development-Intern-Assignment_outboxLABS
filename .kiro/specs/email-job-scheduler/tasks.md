# Implementation Plan: Email Job Scheduler

## Overview

This implementation plan covers a full-stack email job scheduler service with a React dashboard. The system uses Express.js with BullMQ for delayed job scheduling, PostgreSQL for persistence, Redis for queue storage and rate limiting, Ethereal Email for SMTP, and Google OAuth for authentication. Tasks are organized to build infrastructure first, then core backend services, followed by frontend components, and finally integration testing.

## Tasks

- [x] 1. Project Scaffolding and Infrastructure Setup
  - [x] 1.1 Create monorepo root with `package.json` (workspaces: `packages/backend`, `packages/frontend`), `.gitignore`, and `.env.example` with all required environment variables (DATABASE_URL, REDIS_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, SESSION_SECRET, WORKER_CONCURRENCY, DELAY_BETWEEN_EMAILS_MS, MAX_EMAILS_PER_HOUR, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
    - _Requirements: 9.2, 9.4_
  - [x] 1.2 Create `docker-compose.yml` provisioning PostgreSQL 15 (port 5432, volume for persistence) and Redis 7 (port 6379, appendonly enabled for persistence) with healthchecks
    - _Requirements: 9.1_
  - [x] 1.3 Initialize `packages/backend` with `package.json`, `tsconfig.json` (strict mode, ES2020 target, path aliases), and install dependencies: express, bullmq, ioredis, nodemailer, passport, passport-google-oauth20, prisma, @prisma/client, dotenv, uuid, cors, helmet, express-session
    - _Requirements: 9.4_
  - [x] 1.4 Initialize `packages/frontend` with Vite React TypeScript template, install dependencies: react-router-dom, axios, tailwindcss, postcss, autoprefixer, and configure tailwind.config.js and postcss.config.js
    - _Requirements: 8.4, 9.4_
  - [x] 1.5 Create backend `src/config.ts` loading all environment variables with validation (throw on missing required vars), exporting typed config object
    - _Requirements: 9.2_

- [x] 2. Database Schema and Prisma Setup
  - [x] 2.1 Create `packages/backend/prisma/schema.prisma` with User model (id UUID, googleId, email, name, avatarUrl, createdAt, updatedAt), EmailJob model (id UUID, userId relation, idempotencyKey unique, recipient, subject, body, sender, scheduledTime, status enum [SCHEDULED, PROCESSING, SENT, FAILED], sentAt nullable, errorReason nullable, batchId, batchOrder, bullmqJobId, createdAt, updatedAt), and Session model (id UUID, userId relation, token unique, expiresAt, createdAt)
    - _Requirements: 4.1, 1.4_
  - [x] 2.2 Add indexes to Prisma schema: EmailJob(status), EmailJob(userId, status), EmailJob(sender, scheduledTime), EmailJob(batchId, batchOrder), Session(token), Session(expiresAt)
    - _Requirements: 4.1_
  - [x] 2.3 Run `npx prisma migrate dev --name init` to generate initial migration and Prisma client
    - _Requirements: 9.3_
  - [x] 2.4 Create `packages/backend/src/repositories/emailJobRepo.ts` with methods: create(data), createMany(data[]), findById(id), findByStatus(userId, status, page, limit), updateStatus(id, status, extras?), findByIdempotencyKey(key)
    - _Requirements: 1.1, 4.1, 10.2_
  - [x] 2.5 Create `packages/backend/src/repositories/userRepo.ts` with methods: findByGoogleId(googleId), upsert(googleId, email, name, avatarUrl)
    - _Requirements: 5.2_

- [x] 3. Backend Express App and Middleware
  - [x] 3.1 Create `packages/backend/src/index.ts` as Express app entry: initialize express, apply cors, helmet, json parser, session middleware, connect to Redis (ioredis), log connection status for both DB and Redis, start server on configured port
    - _Requirements: 9.5_
  - [x] 3.2 Create `packages/backend/src/middleware/auth.ts` exporting an `authenticate` middleware that reads session token from cookie/header, validates against sessions table (checking expiry), and attaches user to req or returns 401
    - _Requirements: 5.4_
  - [x] 3.3 Create `packages/backend/src/middleware/validate.ts` exporting a generic validation middleware that accepts a Zod schema and validates req.body, returning 400 with descriptive field errors on failure
    - _Requirements: 1.2_
  - [x] 3.4 Create `packages/backend/src/types/index.ts` with TypeScript interfaces: ScheduleEmailRequest, ScheduleResult, EmailJobResponse, UserProfile, PaginatedResponse<T>, RateLimitResult
    - _Requirements: 10.1, 10.2_
  - [x] 3.5 Create `packages/backend/src/utils/idempotency.ts` with function generateIdempotencyKey(batchId: string, recipient: string, scheduledTime: string): string using SHA-256 hash
    - _Requirements: 1.4_

- [x] 4. Google OAuth Authentication
  - [x] 4.1 Create `packages/backend/src/services/authService.ts` with methods: initiateGoogleAuth() returning redirect URL, handleGoogleCallback(code) exchanging code for tokens and returning user profile, createSession(userId) creating session record and returning token, validateSession(token) checking validity and returning user, invalidateSession(token) deleting session record
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [x] 4.2 Create `packages/backend/src/routes/auth.ts` with routes: GET /api/auth/google (redirect to Google consent screen with email+profile scopes), GET /api/auth/google/callback (exchange code, upsert user, create session, redirect to frontend with session cookie), GET /api/auth/me (protected, return user profile), POST /api/auth/logout (protected, invalidate session, clear cookie)
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 10.3, 10.4_
  - [x] 4.3 Register auth routes in the Express app, configure Passport Google OAuth 2.0 strategy with credentials from config
    - _Requirements: 5.1_
  - [x] 4.4 Implement session cookie handling: set httpOnly secure cookie on successful login, read from cookie in auth middleware, clear on logout
    - _Requirements: 5.3, 5.5_

- [x] 5. SMTP Transport and Email Sending
  - [x] 5.1 Create `packages/backend/src/services/smtpTransport.ts` with: initializeTransport() creating Nodemailer transport with Ethereal credentials from config, sendEmail(from, to, subject, body) returning {messageId, previewUrl}, categorizeError(error) classifying as 'transient' (ECONNREFUSED, ETIMEDOUT, 4xx) or 'permanent' (invalid recipient, auth failure, 5xx)
    - _Requirements: 2.1, 2.2, 2.3_
  - [x]* 5.2 Write unit tests for error categorization function validating correct classification of known error codes
    - _Requirements: 2.2, 2.3_

- [x] 6. Rate Limiter Service
  - [x] 6.1 Create `packages/backend/src/services/rateLimiter.ts` with RateLimiter class: constructor(redisClient, config), checkRateLimit(sender): RateLimitResult using Redis MULTI/EXEC for atomic GET lastsend + INCR hourly counter + SET lastsend, recordSend(sender) updating last send timestamp
    - _Requirements: 3.1, 3.2, 3.5_
  - [x] 6.2 Implement hourly counter logic: key format `ratelimit:{sender}:{hourTimestamp}`, INCR with EXPIRE 3600, compare against MAX_EMAILS_PER_HOUR, calculate retryAfterMs as milliseconds until next hour boundary when limit exceeded
    - _Requirements: 3.2_
  - [x] 6.3 Implement inter-email delay logic: key format `lastsend:{sender}`, compare current time against stored value + DELAY_BETWEEN_EMAILS_MS, return retryAfterMs if too soon
    - _Requirements: 3.1_
  - [x]* 6.4 Write property-based tests for rate limiter hourly limit invariant
    - **Property 4: Rate Limit Invariant**
    - **Validates: Requirements 3.2**
  - [x]* 6.5 Write property-based tests for inter-email delay invariant
    - **Property 5: Inter-Email Delay Invariant**
    - **Validates: Requirements 3.1**

- [x] 7. Checkpoint - Ensure infrastructure and core services pass all tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Email Scheduling Service
  - [x] 8.1 Create `packages/backend/src/services/emailScheduler.ts` with scheduleEmails(request: ScheduleEmailRequest, userId: string): ScheduleResult that: validates scheduledTime is in the future, generates batchId, computes per-recipient delays, generates idempotency keys, persists all EmailJobs in a transaction, enqueues BullMQ delayed jobs
    - _Requirements: 1.1, 1.3, 1.4, 1.5_
  - [x] 8.2 Implement BullMQ queue initialization in a separate `packages/backend/src/queue/emailQueue.ts`: create Queue instance with Redis connection, export addEmailJob(jobData, delayMs) and getQueue() functions
    - _Requirements: 1.1, 2.1_
  - [x] 8.3 Implement batch distribution logic: when recipients count exceeds MAX_EMAILS_PER_HOUR, automatically distribute jobs across hourly windows respecting rate limits, assign batch_order for ordering
    - _Requirements: 3.4, 1.5_
  - [x]* 8.4 Write property-based tests for batch job count equals recipient count
    - **Property 2: Batch Job Count Equals Recipient Count**
    - **Validates: Requirements 1.5**
  - [x]* 8.5 Write property-based tests for incremental delay ordering
    - **Property 3: Incremental Delay Ordering**
    - **Validates: Requirements 1.5**

- [x] 9. BullMQ Email Worker
  - [x] 9.1 Create `packages/backend/src/workers/emailWorker.ts` with Worker class: connect to Redis, set concurrency from WORKER_CONCURRENCY env var, define processor function that handles one email job
    - _Requirements: 2.4, 2.5_
  - [x] 9.2 Implement worker processor logic: load EmailJob from DB by id, check status is 'scheduled' (skip if sent/failed), check rate limiter, if rate-limited reschedule job with new delay, transition status to 'processing', send via SMTP, update to 'sent' with sent_at
    - _Requirements: 2.1, 3.3, 4.4_
  - [x] 9.3 Implement error handling in worker: catch SMTP errors, classify as transient/permanent, for transient throw error (BullMQ auto-retries up to 3 attempts with exponential backoff configured on queue), for permanent mark as 'failed' with error_reason
    - _Requirements: 2.2, 2.3_
  - [x] 9.4 Configure BullMQ job options: attempts=3, backoff={type:'exponential', delay:5000}, removeOnComplete=true, removeOnFail=false for debugging
    - _Requirements: 2.2, 4.3_
  - [x]* 9.5 Write property-based tests for idempotent processing
    - **Property 7: Idempotent Processing**
    - **Validates: Requirements 4.4**

- [x] 10. Email API Routes
  - [x] 10.1 Create `packages/backend/src/routes/emails.ts` with POST /api/emails/schedule: authenticate, validate request body (recipients array non-empty, subject non-empty, body non-empty, sender non-empty, scheduledTime valid ISO 8601, delayBetweenEmailsMs >= 0, maxEmailsPerHour > 0), call emailScheduler.scheduleEmails, return 201 with ScheduleResult
    - _Requirements: 10.1, 1.1, 1.2_
  - [x] 10.2 Implement GET /api/emails?status={status}&page={page}&limit={limit}: authenticate, validate query params, call emailJobRepo.findByStatus with pagination, return PaginatedResponse with items, total, page, totalPages
    - _Requirements: 10.2_
  - [x] 10.3 Implement GET /api/emails/:id: authenticate, fetch by id, verify ownership (userId matches), return EmailJobResponse or 404
    - _Requirements: 10.2_
  - [x] 10.4 Register email routes in Express app with authenticate middleware applied to all email endpoints
    - _Requirements: 5.4_
  - [x]* 10.5 Write property-based tests for JSON round-trip serialization
    - **Property 9: Email Job JSON Round-Trip**
    - **Validates: Requirements 10.5**

- [x] 11. Checkpoint - Ensure all backend services and routes pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Frontend Auth and Routing
  - [x] 12.1 Create `packages/frontend/src/types/index.ts` with TypeScript interfaces mirroring backend types: User, EmailJob, ScheduleEmailRequest, PaginatedResponse
    - _Requirements: 8.4_
  - [x] 12.2 Create `packages/frontend/src/api/auth.ts` with functions: getLoginUrl() returning Google OAuth initiation URL, getCurrentUser() calling GET /api/auth/me, logout() calling POST /api/auth/logout
    - _Requirements: 5.1, 5.5_
  - [x] 12.3 Create `packages/frontend/src/hooks/useAuth.ts` custom hook: manage user state, check auth on mount, provide login/logout functions, loading state
    - _Requirements: 5.3, 8.5_
  - [x] 12.4 Create `packages/frontend/src/components/ProtectedRoute.tsx` component that checks useAuth, redirects to login if not authenticated, renders children if authenticated
    - _Requirements: 8.5_
  - [x] 12.5 Create `packages/frontend/src/pages/Login.tsx` with Google OAuth login button styled with Tailwind, centered layout, app branding
    - _Requirements: 5.1_

- [x] 13. Frontend Dashboard Layout
  - [x] 13.1 Create `packages/frontend/src/components/Header.tsx` showing authenticated user's avatar (img), name, email, and a logout button styled with Tailwind
    - _Requirements: 8.1_
  - [x] 13.2 Create `packages/frontend/src/components/TabNavigation.tsx` with Scheduled/Sent tabs using active state styling (Tailwind border-bottom/text color indicators)
    - _Requirements: 8.2_
  - [x] 13.3 Create `packages/frontend/src/components/Layout.tsx` composing Header + TabNavigation + main content area + "Compose New Email" floating action button
    - _Requirements: 8.3_
  - [x] 13.4 Create `packages/frontend/src/App.tsx` with React Router: / redirects to /dashboard, /login renders Login page, /dashboard/* renders ProtectedRoute wrapping Layout with nested routes for scheduled/sent/compose
    - _Requirements: 8.5_
  - [x] 13.5 Create reusable UI primitives: `LoadingSkeleton.tsx` (animated table placeholder rows), `EmptyState.tsx` (icon + message), `ErrorState.tsx` (error message + retry button)
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 14. Frontend Email Composition
  - [x] 14.1 Create `packages/frontend/src/utils/leadParser.ts` with parseLeads(fileContent: string): {validEmails: string[], invalidCount: number} that extracts emails from CSV or text content using RFC 5322 simplified regex, handling comma/newline/semicolon separators
    - _Requirements: 6.2, 6.3_
  - [x] 14.2 Create `packages/frontend/src/components/FileUpload.tsx` with drag-and-drop zone accepting .csv and .txt files, reads file content via FileReader, calls leadParser, displays file name and status
    - _Requirements: 6.2_
  - [x] 14.3 Create `packages/frontend/src/components/RecipientCount.tsx` showing count of valid recipients parsed, with warning if invalid entries found
    - _Requirements: 6.2_
  - [x] 14.4 Create `packages/frontend/src/pages/Compose.tsx` form with: subject input, body textarea, FileUpload component, datetime-local input for start time, number inputs for delay (seconds) and hourly limit, Schedule button with loading state, success/error feedback
    - _Requirements: 6.1, 6.4, 6.5_
  - [x] 14.5 Create `packages/frontend/src/api/emails.ts` with functions: scheduleEmails(request) calling POST /api/emails/schedule, getEmails(status, page, limit) calling GET /api/emails
    - _Requirements: 10.1, 10.2_
  - [x]* 14.6 Write property-based tests for leadParser email extraction
    - **Property 8: Lead Parser Email Extraction**
    - **Validates: Requirements 6.2**

- [x] 15. Frontend Email List Views
  - [x] 15.1 Create `packages/frontend/src/components/EmailTable.tsx` as a reusable table component accepting columns config and data array, with Tailwind styling (striped rows, responsive)
    - _Requirements: 7.1, 7.2_
  - [x] 15.2 Create `packages/frontend/src/hooks/useEmails.ts` custom hook: accept status filter, manage loading/error/data states, fetch emails with pagination, provide refetch function
    - _Requirements: 7.1, 7.2_
  - [x] 15.3 Create `packages/frontend/src/pages/Scheduled.tsx` using useEmails('scheduled'), rendering EmailTable with columns [recipient, subject, scheduledTime, status], showing LoadingSkeleton/EmptyState/ErrorState appropriately
    - _Requirements: 7.1, 7.3, 7.4_
  - [x] 15.4 Create `packages/frontend/src/pages/Sent.tsx` using useEmails('sent'), rendering EmailTable with columns [recipient, subject, sentAt, status], showing LoadingSkeleton/EmptyState/ErrorState appropriately
    - _Requirements: 7.2, 7.3, 7.4_
  - [x] 15.5 Implement pagination controls in email list pages: Previous/Next buttons, current page indicator, disable buttons at boundaries
    - _Requirements: 10.2_

- [x] 16. Integration Testing and Polish
  - [x] 16.1 Write integration test: schedule a batch of 5 emails via POST /api/emails/schedule, verify 5 EmailJob records created in DB with status 'scheduled', verify 5 BullMQ jobs enqueued with correct delays
    - _Requirements: 1.1, 1.5_
  - [x] 16.2 Write integration test: process a ready job through the worker with mocked SMTP, verify status transitions from 'scheduled' → 'processing' → 'sent', verify sent_at is set
    - _Requirements: 2.1_
  - [x] 16.3 Write integration test: simulate rate limit exceeded scenario, verify job is rescheduled with delay to next hour window, verify original order is preserved
    - _Requirements: 3.3_
  - [x] 16.4 Write integration test: simulate worker receiving a job for an already-sent email, verify SMTP is not called and job completes successfully (idempotency)
    - _Requirements: 4.4, 4.5_
  - [x]* 16.5 Write property-based test for pagination completeness
    - **Property 10: Pagination Completeness**
    - **Validates: Requirements 10.2**

- [x] 17. Documentation and Final Configuration
  - [x] 17.1 Create root `README.md` with: project overview, architecture diagram (text), prerequisites (Node 18+, Docker), setup instructions (docker-compose up, env config, prisma migrate, start backend, start frontend), API documentation summary, environment variables table
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 17.2 Add npm scripts to root package.json: `dev:backend`, `dev:frontend`, `dev` (concurrent), `build`, `test`, `docker:up`, `docker:down`, `db:migrate`, `db:seed`
    - _Requirements: 9.4_
  - [x] 17.3 Create `packages/backend/src/seed.ts` script that creates a test user and 10 sample EmailJobs in various statuses for development
    - _Requirements: 9.3_
  - [x] 17.4 Configure CORS in backend to allow frontend origin (configurable via FRONTEND_URL env var), configure proxy in Vite config for API requests during development
    - _Requirements: 9.2_
  - [x] 17.5 Final review: ensure all TypeScript strict mode errors are resolved, all endpoints return consistent JSON error format {error: string, details?: object}, and Tailwind purge is configured for production builds
    - _Requirements: 8.4, 10.5_

- [x] 18. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between major phases
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript throughout (backend and frontend)
- Infrastructure tasks (Docker, Prisma) must be completed before service implementation
- Frontend tasks can proceed in parallel with backend integration tests once API routes are available

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.5", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "3.1", "3.4"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.5"] },
    { "id": 5, "tasks": ["4.1", "5.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "5.2", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["6.4", "6.5", "8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 10, "tasks": ["9.1", "9.2", "9.3", "9.4"] },
    { "id": 11, "tasks": ["9.5", "10.1", "10.2", "10.3"] },
    { "id": 12, "tasks": ["10.4", "10.5", "12.1", "12.2"] },
    { "id": 13, "tasks": ["12.3", "12.4", "12.5", "13.1", "13.2"] },
    { "id": 14, "tasks": ["13.3", "13.4", "13.5", "14.1"] },
    { "id": 15, "tasks": ["14.2", "14.3", "14.4", "14.5", "14.6"] },
    { "id": 16, "tasks": ["15.1", "15.2"] },
    { "id": 17, "tasks": ["15.3", "15.4", "15.5"] },
    { "id": 18, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5"] },
    { "id": 19, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5"] }
  ]
}
```
