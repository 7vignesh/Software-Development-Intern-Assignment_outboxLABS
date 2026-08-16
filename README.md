# Email Job Scheduler

A production-grade full-stack email job scheduler service with a React dashboard. Schedule emails for future delivery, enforce rate limiting, and monitor send status — all through an intuitive web interface with Google OAuth authentication.

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

## Prerequisites

- **Node.js** 18+ (with npm)
- **Docker** and Docker Compose
- A Google OAuth 2.0 client (for authentication)

## Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd email-job-scheduler
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your Google OAuth credentials and (optionally) Ethereal SMTP credentials.

3. **Start infrastructure containers**

   ```bash
   docker-compose up -d
   ```

   This starts PostgreSQL 15 and Redis 7 with persistent storage.

4. **Install dependencies**

   ```bash
   npm install
   ```

5. **Run database migrations**

   ```bash
   cd packages/backend
   npx prisma migrate deploy
   cd ../..
   ```

6. **Start development servers**

   ```bash
   npm run dev
   ```

   - Backend runs on `http://localhost:3000`
   - Frontend runs on `http://localhost:5173`

## API Documentation

| Method | Path | Description | Auth Required |
|--------|------|-------------|:---:|
| GET | `/api/auth/google` | Initiate Google OAuth flow | No |
| GET | `/api/auth/google/callback` | OAuth callback handler | No |
| GET | `/api/auth/me` | Get current user profile | Yes |
| POST | `/api/auth/logout` | Invalidate session and log out | Yes |
| POST | `/api/emails/schedule` | Schedule a batch of emails | Yes |
| GET | `/api/emails?status={status}&page={page}&limit={limit}` | List emails (paginated, filtered by status) | Yes |
| GET | `/api/emails/:id` | Get a single email job by ID | Yes |

### Request/Response Examples

**POST /api/emails/schedule**

```json
{
  "recipients": ["user1@example.com", "user2@example.com"],
  "subject": "Hello!",
  "body": "This is a scheduled email.",
  "sender": "sender@example.com",
  "scheduledTime": "2025-01-15T10:00:00.000Z",
  "delayBetweenEmailsMs": 2000,
  "maxEmailsPerHour": 100
}
```

**Response (201)**

```json
{
  "batchId": "uuid-string",
  "totalJobs": 2,
  "firstScheduledAt": "2025-01-15T10:00:00.000Z",
  "lastScheduledAt": "2025-01-15T10:00:02.000Z"
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/email_scheduler` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID | *(required)* |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret | *(required)* |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL | `http://localhost:3000/api/auth/google/callback` |
| `SESSION_SECRET` | Secret for session signing | *(required)* |
| `WORKER_CONCURRENCY` | Number of concurrent BullMQ workers | `5` |
| `DELAY_BETWEEN_EMAILS_MS` | Minimum delay between consecutive sends (ms) | `2000` |
| `MAX_EMAILS_PER_HOUR` | Maximum emails per sender per hour | `100` |
| `SMTP_HOST` | SMTP server host | `smtp.ethereal.email` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username (Ethereal) | *(required)* |
| `SMTP_PASS` | SMTP password (Ethereal) | *(required)* |
| `PORT` | Backend server port | `3000` |
| `FRONTEND_URL` | Frontend origin for CORS | `http://localhost:5173` |

## Rate Limiting

The system enforces rate limiting to mimic real email provider throttling:

- **Inter-email delay**: A minimum of 2 seconds (configurable via `DELAY_BETWEEN_EMAILS_MS`) between consecutive sends from the same sender. This prevents burst sending.
- **Hourly limit**: A maximum of 100 emails per hour (configurable via `MAX_EMAILS_PER_HOUR`) per sender, tracked with Redis atomic counters that expire hourly.
- **Automatic rescheduling**: When a rate limit is hit, jobs are automatically rescheduled to the next available time window. Send order is preserved.
- **Batch distribution**: When scheduling more recipients than the hourly limit, the system automatically distributes jobs across hourly windows.

## Persistence and Restart Recovery

The system is designed to survive server restarts without data loss or email duplication:

- **BullMQ jobs persist in Redis**: Redis is configured with `appendonly yes`, so all queued and delayed jobs survive Redis restarts. Jobs retain their original scheduled times.
- **Database stores authoritative state**: Every email job is persisted to PostgreSQL before being enqueued. The database is the source of truth for job status.
- **Idempotency guard**: Each email job has a unique idempotency key. If a worker picks up a job whose database status is already "sent" or "failed", it skips the send. This prevents duplicates after crashes.
- **Worker crash recovery**: If a worker crashes mid-send, BullMQ makes the job available for retry by another worker instance (up to 3 retries with exponential backoff).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both backend and frontend in development mode |
| `npm run dev:backend` | Start only the backend |
| `npm run dev:frontend` | Start only the frontend |
| `npm run build` | Build both packages for production |
| `npm run test` | Run backend tests |
| `npm run docker:up` | Start Docker containers |
| `npm run docker:down` | Stop Docker containers |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database with test data |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build Tool | Vite |
| Backend | Express.js + TypeScript |
| ORM | Prisma |
| Queue | BullMQ |
| Cache/Queue Store | Redis 7 |
| Database | PostgreSQL 15 |
| SMTP | Nodemailer + Ethereal |
| Auth | Google OAuth 2.0 |
| Containers | Docker Compose |

## Setting Up Ethereal Email

1. Go to [https://ethereal.email](https://ethereal.email)
2. Click "Create Ethereal Account" (no signup needed)
3. Copy the generated username and password
4. Set them in your `.env`:
   ```
   SMTP_HOST=smtp.ethereal.email
   SMTP_PORT=587
   SMTP_USER=your-generated-user@ethereal.email
   SMTP_PASS=your-generated-password
   ```
5. After emails are sent, log into Ethereal with those same credentials to view them in the inbox

Ethereal is a fake SMTP service — emails are captured but never delivered to real recipients. This is ideal for testing.

## Features Implemented

### Backend
| Feature | Status | Details |
|---------|--------|---------|
| Email Scheduling API | ✅ | POST /api/emails/schedule with batch support |
| BullMQ Delayed Jobs | ✅ | No cron — uses BullMQ delayed jobs backed by Redis |
| Persistence on Restart | ✅ | Redis AOF + DB state + idempotency guard |
| Rate Limiting (per-sender) | ✅ | Redis atomic counters, configurable hourly limit |
| Inter-email Delay | ✅ | Configurable min delay between sends (default 2s) |
| Worker Concurrency | ✅ | Configurable via WORKER_CONCURRENCY env var |
| Idempotency | ✅ | SHA-256 idempotency key prevents duplicate sends |
| Automatic Rescheduling | ✅ | Rate-limited jobs rescheduled to next window |
| Batch Distribution | ✅ | 1000+ emails distributed across hourly windows |
| Transient Error Retry | ✅ | 3 retries with exponential backoff |
| Google OAuth 2.0 | ✅ | Real Google login with session management |
| Ethereal SMTP | ✅ | Fake SMTP for testing, emails visible in Ethereal inbox |

### Frontend
| Feature | Status | Details |
|---------|--------|---------|
| Google Login | ✅ | Real OAuth, shows name/email/avatar |
| Dashboard Layout | ✅ | Sidebar with navigation (Figma design) |
| Compose Email | ✅ | Subject, body, recipients (type or upload CSV) |
| CSV/Text Upload | ✅ | Parse email addresses from file |
| Schedule Configuration | ✅ | Start time, delay, hourly limit, Send Later popup |
| Scheduled Emails View | ✅ | List with recipient, time badge, subject preview |
| Sent Emails View | ✅ | List with sent status and timestamp |
| Loading States | ✅ | Skeleton loaders while fetching |
| Empty States | ✅ | Message when no emails exist |
| Error Handling | ✅ | Error display with retry button |
| Pagination | ✅ | Previous/Next with page indicator |
| TypeScript | ✅ | Full type safety, interfaces for API responses |
| Reusable Components | ✅ | EmailTable, FileUpload, Pagination, etc. |

## Assumptions & Trade-offs

- **Rich text toolbar is decorative**: The compose page shows a formatting toolbar (bold, italic, etc.) matching the Figma, but the body is submitted as plain text. A full rich text editor (e.g., TipTap) would add significant complexity for this scope.
- **Email/password fields on login are visual-only**: The Figma shows email/password inputs, but the assignment requires Google OAuth only. The fields are shown for design fidelity but don't function.
- **Ethereal SMTP only**: No real email delivery — all emails are captured by Ethereal for testing purposes.
- **Session stored in memory (production warning)**: Express session uses MemoryStore. For true production, a Redis session store would be used.
- **Free-tier hosting limitations**: Render free tier may sleep after inactivity. Upstash Redis has connection limits that cause occasional ECONNRESET (auto-reconnects).
