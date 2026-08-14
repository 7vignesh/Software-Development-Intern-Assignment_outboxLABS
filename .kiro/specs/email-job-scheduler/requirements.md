# Requirements Document

## Introduction

A production-grade full-stack email job scheduler service with a React dashboard. The system accepts email scheduling requests via API, persists them in a relational database, schedules delivery using BullMQ delayed jobs (no cron), sends emails through Ethereal SMTP, and provides a frontend dashboard with Google OAuth authentication for managing scheduled and sent emails. The system must handle 1000+ concurrent scheduled emails, enforce rate limiting, survive server restarts without data loss or duplication, and guarantee idempotent delivery.

## Glossary

- **Scheduler_Service**: The Express.js backend application responsible for accepting email scheduling requests, persisting them, and coordinating with the Job_Queue
- **Job_Queue**: The BullMQ-based delayed job queue backed by Redis that triggers email sends at the scheduled time
- **Worker**: A BullMQ worker process that consumes jobs from the Job_Queue and sends emails via SMTP
- **Email_Job**: A unit of work representing a single email to be sent, containing recipient, subject, body, sender, and scheduled time
- **Rate_Limiter**: A Redis-backed component that enforces per-sender and global email send rate limits
- **SMTP_Transport**: The Nodemailer transport configured with Ethereal Email credentials for sending emails
- **Dashboard**: The React/Next.js frontend application for composing, scheduling, and monitoring emails
- **Auth_Service**: The backend component handling Google OAuth 2.0 authentication and session management
- **Lead_Parser**: The frontend component that parses uploaded CSV/text files to extract recipient email addresses
- **Database**: The PostgreSQL or MySQL relational database storing email jobs, user data, and send history

## Requirements

### Requirement 1: Email Job Scheduling via API

**User Story:** As a user, I want to schedule emails for future delivery via API, so that I can queue emails to be sent at specific times without manual intervention.

#### Acceptance Criteria

1. WHEN a valid scheduling request containing recipient, subject, body, sender, and scheduled_time is received, THE Scheduler_Service SHALL persist the Email_Job to the Database with status "scheduled" and enqueue a delayed job in the Job_Queue with delay equal to the difference between scheduled_time and current time
2. WHEN a scheduling request is missing required fields (recipient, subject, body, sender, or scheduled_time), THE Scheduler_Service SHALL return an HTTP 400 response with a descriptive error message identifying the missing fields
3. WHEN a scheduling request specifies a scheduled_time in the past, THE Scheduler_Service SHALL return an HTTP 400 response indicating the scheduled time must be in the future
4. THE Scheduler_Service SHALL assign a unique idempotency_key to each Email_Job at creation time to prevent duplicate sends
5. WHEN a scheduling request contains a batch of recipients from a CSV upload, THE Scheduler_Service SHALL create one Email_Job per recipient and enqueue each with the configured inter-email delay offset applied incrementally

### Requirement 2: Email Delivery via BullMQ Workers

**User Story:** As the system operator, I want emails to be delivered reliably by queue workers, so that scheduled emails are sent at the correct time without cron dependencies.

#### Acceptance Criteria

1. WHEN a delayed job becomes ready in the Job_Queue, THE Worker SHALL retrieve the corresponding Email_Job from the Database, send the email via SMTP_Transport, and update the Email_Job status to "sent" with a sent_at timestamp
2. IF the SMTP_Transport returns a transient error (connection timeout, temporary server failure), THEN THE Worker SHALL retry the Email_Job up to 3 times with exponential backoff and update the status to "failed" only after all retries are exhausted
3. IF the SMTP_Transport returns a permanent error (invalid recipient, authentication failure), THEN THE Worker SHALL immediately mark the Email_Job status as "failed" with the error reason stored in the Database
4. THE Worker SHALL process jobs with a configurable concurrency level defined via environment variable WORKER_CONCURRENCY
5. WHILE multiple Worker instances are processing jobs in parallel, THE Job_Queue SHALL guarantee that each Email_Job is delivered to exactly one Worker (at-most-once delivery per job)

### Requirement 3: Rate Limiting and Throttling

**User Story:** As the system operator, I want to enforce rate limits on email sending, so that the system mimics real provider throttling and avoids being flagged as spam.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce a configurable minimum delay (DELAY_BETWEEN_EMAILS_MS) between consecutive email sends from the same sender
2. THE Rate_Limiter SHALL enforce a configurable maximum emails per hour (MAX_EMAILS_PER_HOUR) per sender, tracked using Redis-backed atomic counters with hourly expiration
3. WHEN the hourly rate limit for a sender is reached, THE Worker SHALL reschedule the Email_Job to the start of the next available hour window without losing the job or changing send order
4. WHILE 1000 or more Email_Jobs are scheduled for approximately the same time, THE Scheduler_Service SHALL distribute them across available time slots respecting rate limits and inter-email delays
5. THE Rate_Limiter SHALL use Redis atomic operations (INCR with TTL) to ensure correctness across multiple Worker instances running concurrently

### Requirement 4: Persistence and Crash Recovery

**User Story:** As the system operator, I want scheduled emails to survive server restarts, so that no emails are lost or duplicated after a crash or deployment.

#### Acceptance Criteria

1. THE Scheduler_Service SHALL persist all Email_Job data (recipient, subject, body, sender, scheduled_time, status, idempotency_key) to the Database before enqueuing the corresponding job in the Job_Queue
2. WHEN the Scheduler_Service restarts, THE Job_Queue SHALL retain all pending delayed jobs in Redis and process them at their originally scheduled times without re-enqueuing
3. WHEN a Worker crashes mid-send (after picking up a job but before confirming delivery), THE Job_Queue SHALL make the job available for retry by another Worker instance
4. THE Worker SHALL verify the Email_Job status in the Database is "scheduled" before sending, and SHALL skip the send if the status is already "sent" or "failed" (idempotency guard)
5. IF a duplicate job execution is detected via the idempotency_key check, THEN THE Worker SHALL log the duplicate attempt and complete the job without sending the email again

### Requirement 5: Google OAuth Authentication

**User Story:** As a user, I want to log in with my Google account, so that I can securely access the dashboard without creating a separate account.

#### Acceptance Criteria

1. WHEN a user initiates login, THE Auth_Service SHALL redirect the user to Google OAuth 2.0 consent screen requesting email and profile scopes
2. WHEN Google returns a valid authorization code, THE Auth_Service SHALL exchange it for access and ID tokens, extract user profile (name, email, avatar_url), and create or update the user record in the Database
3. WHEN authentication is successful, THE Auth_Service SHALL issue a session token (JWT or server-side session) and return it to the Dashboard
4. WHEN a request to a protected API endpoint lacks a valid session token, THE Auth_Service SHALL return HTTP 401 Unauthorized
5. WHEN a user initiates logout, THE Auth_Service SHALL invalidate the session token and redirect to the login page

### Requirement 6: Dashboard - Email Composition and Scheduling

**User Story:** As a user, I want to compose and schedule emails from the dashboard, so that I can upload recipients and configure delivery timing visually.

#### Acceptance Criteria

1. WHEN the user opens the compose form, THE Dashboard SHALL display fields for subject, body, start time, delay between emails (seconds), and hourly send limit
2. WHEN the user uploads a CSV or text file, THE Lead_Parser SHALL extract email addresses, validate their format, and display the total count of valid recipients
3. IF the uploaded file contains no valid email addresses, THEN THE Lead_Parser SHALL display an error message indicating no valid recipients were found
4. WHEN the user clicks the schedule button with all required fields filled, THE Dashboard SHALL send the scheduling request to the Scheduler_Service and display a success confirmation with the number of emails queued
5. WHILE the scheduling request is being processed, THE Dashboard SHALL display a loading indicator and disable the schedule button to prevent duplicate submissions

### Requirement 7: Dashboard - Email Monitoring

**User Story:** As a user, I want to view scheduled and sent emails in the dashboard, so that I can monitor the status of my email campaigns.

#### Acceptance Criteria

1. WHEN the user navigates to the Scheduled tab, THE Dashboard SHALL fetch and display a table of Email_Jobs with status "scheduled", showing recipient, subject, scheduled_time, and status columns
2. WHEN the user navigates to the Sent tab, THE Dashboard SHALL fetch and display a table of Email_Jobs with status "sent", showing recipient, subject, sent_at, and status columns
3. WHILE data is being fetched from the Scheduler_Service, THE Dashboard SHALL display a loading skeleton in the table area
4. WHEN no Email_Jobs exist for the selected tab, THE Dashboard SHALL display an empty state message indicating no emails are scheduled or sent
5. IF the API request to fetch Email_Jobs fails, THEN THE Dashboard SHALL display an error message with a retry button

### Requirement 8: Dashboard Layout and User Experience

**User Story:** As a user, I want a clean and responsive dashboard layout, so that I can navigate between features efficiently.

#### Acceptance Criteria

1. THE Dashboard SHALL display a header containing the authenticated user's name, email, avatar, and a logout button
2. THE Dashboard SHALL provide tab navigation to switch between Scheduled Emails and Sent Emails views
3. THE Dashboard SHALL include a prominent "Compose New Email" button accessible from any tab
4. THE Dashboard SHALL be built with reusable TypeScript React components styled with Tailwind CSS
5. WHEN the user is not authenticated, THE Dashboard SHALL redirect to the login page

### Requirement 9: Infrastructure and Deployment

**User Story:** As a developer, I want Docker-based infrastructure for Redis and the database, so that I can run the full system locally with minimal setup.

#### Acceptance Criteria

1. THE Scheduler_Service SHALL provide a Docker Compose configuration that provisions Redis and the Database (PostgreSQL or MySQL) containers
2. THE Scheduler_Service SHALL read all configuration values (database URL, Redis URL, SMTP credentials, OAuth credentials, WORKER_CONCURRENCY, DELAY_BETWEEN_EMAILS_MS, MAX_EMAILS_PER_HOUR) from environment variables
3. THE Scheduler_Service SHALL include database migration scripts that create the required tables on first run
4. THE Scheduler_Service SHALL organize code in a monorepo structure with separate directories for backend and frontend
5. WHEN the Docker containers are running, THE Scheduler_Service SHALL connect to Redis and the Database on startup and log connection status

### Requirement 10: API Design and Data Serialization

**User Story:** As a frontend developer, I want well-structured REST API endpoints with consistent JSON responses, so that I can integrate the dashboard with the backend reliably.

#### Acceptance Criteria

1. THE Scheduler_Service SHALL expose a POST /api/emails/schedule endpoint accepting JSON with fields: recipients (array), subject (string), body (string), sender (string), scheduled_time (ISO 8601 string), delay_between_emails_ms (number), max_emails_per_hour (number)
2. THE Scheduler_Service SHALL expose a GET /api/emails?status={status} endpoint returning a paginated JSON array of Email_Jobs filtered by status
3. THE Scheduler_Service SHALL expose a GET /api/auth/google endpoint initiating OAuth flow and a GET /api/auth/google/callback endpoint handling the OAuth callback
4. THE Scheduler_Service SHALL expose a GET /api/auth/me endpoint returning the authenticated user's profile (name, email, avatar_url)
5. FOR ALL valid Email_Job objects, serializing to JSON then deserializing back SHALL produce an equivalent Email_Job object (round-trip property)
