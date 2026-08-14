import { PrismaClient, EmailStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function seed() {
  console.log('[Seed] Starting database seeding...');

  // Create test user
  const user = await prisma.user.upsert({
    where: { googleId: 'test-google-id' },
    update: {},
    create: {
      googleId: 'test-google-id',
      email: 'testuser@example.com',
      name: 'Test User',
      avatarUrl: null,
    },
  });

  console.log(`[Seed] Created/found test user: ${user.email} (${user.id})`);

  const batchId = uuidv4();
  const now = new Date();

  // Helper to create dates relative to now
  const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

  const emailJobs = [
    // 3 SCHEDULED (future times)
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-scheduled-1`,
      recipient: 'alice@example.com',
      subject: 'Weekly Newsletter - Issue #42',
      body: 'Hello Alice, here is your weekly newsletter with the latest updates.',
      sender: 'testuser@example.com',
      scheduledTime: hoursFromNow(2),
      status: EmailStatus.SCHEDULED,
      batchId,
      batchOrder: 0,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-scheduled-2`,
      recipient: 'bob@example.com',
      subject: 'Weekly Newsletter - Issue #42',
      body: 'Hello Bob, here is your weekly newsletter with the latest updates.',
      sender: 'testuser@example.com',
      scheduledTime: hoursFromNow(2),
      status: EmailStatus.SCHEDULED,
      batchId,
      batchOrder: 1,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-scheduled-3`,
      recipient: 'charlie@example.com',
      subject: 'Product Launch Announcement',
      body: 'Hi Charlie, we are excited to announce our new product launching next week!',
      sender: 'testuser@example.com',
      scheduledTime: hoursFromNow(5),
      status: EmailStatus.SCHEDULED,
      batchId,
      batchOrder: 2,
    },

    // 4 SENT (past times with sentAt)
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-sent-1`,
      recipient: 'diana@example.com',
      subject: 'Welcome to Our Platform',
      body: 'Hi Diana, welcome aboard! Here is everything you need to get started.',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(24),
      status: EmailStatus.SENT,
      sentAt: hoursAgo(24),
      batchId,
      batchOrder: 3,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-sent-2`,
      recipient: 'edward@example.com',
      subject: 'Your Invoice #1023',
      body: 'Hi Edward, please find attached your invoice for this month.',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(12),
      status: EmailStatus.SENT,
      sentAt: hoursAgo(12),
      batchId,
      batchOrder: 4,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-sent-3`,
      recipient: 'fiona@example.com',
      subject: 'Meeting Reminder',
      body: 'Hi Fiona, just a reminder about our meeting tomorrow at 2 PM.',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(6),
      status: EmailStatus.SENT,
      sentAt: hoursAgo(6),
      batchId,
      batchOrder: 5,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-sent-4`,
      recipient: 'george@example.com',
      subject: 'Password Reset Confirmation',
      body: 'Hi George, your password has been successfully reset.',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(3),
      status: EmailStatus.SENT,
      sentAt: hoursAgo(3),
      batchId,
      batchOrder: 6,
    },

    // 2 FAILED (with errorReason)
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-failed-1`,
      recipient: 'invalid@nonexistent-domain-xyz.com',
      subject: 'Special Offer Inside',
      body: 'Hi, check out our special limited-time offer!',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(8),
      status: EmailStatus.FAILED,
      errorReason: 'Permanent SMTP error: 550 Mailbox not found',
      batchId,
      batchOrder: 7,
    },
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-failed-2`,
      recipient: 'bounced@example.com',
      subject: 'Account Verification',
      body: 'Please verify your email address by clicking the link below.',
      sender: 'testuser@example.com',
      scheduledTime: hoursAgo(4),
      status: EmailStatus.FAILED,
      errorReason: 'Permanent SMTP error: 552 Message size exceeds maximum permitted',
      batchId,
      batchOrder: 8,
    },

    // 1 PROCESSING
    {
      userId: user.id,
      idempotencyKey: `seed-${batchId}-processing-1`,
      recipient: 'henry@example.com',
      subject: 'Order Confirmation #5678',
      body: 'Hi Henry, your order has been confirmed and is being processed.',
      sender: 'testuser@example.com',
      scheduledTime: new Date(now.getTime() - 30 * 1000), // 30 seconds ago
      status: EmailStatus.PROCESSING,
      batchId,
      batchOrder: 9,
    },
  ];

  // Delete existing seed data to avoid unique constraint violations
  await prisma.emailJob.deleteMany({
    where: { idempotencyKey: { startsWith: `seed-${batchId}` } },
  });

  // Create all email jobs
  for (const jobData of emailJobs) {
    await prisma.emailJob.create({ data: jobData });
  }

  console.log(`[Seed] Created ${emailJobs.length} email jobs in batch ${batchId}`);
  console.log('[Seed] Breakdown:');
  console.log('  - 3 SCHEDULED (future delivery)');
  console.log('  - 4 SENT (completed)');
  console.log('  - 2 FAILED (with error reasons)');
  console.log('  - 1 PROCESSING (in progress)');
  console.log('[Seed] Done!');
}

seed()
  .catch((error) => {
    console.error('[Seed] Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
