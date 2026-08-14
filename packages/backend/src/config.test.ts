import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  const validEnv = {
    DATABASE_URL: 'postgresql://localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    SESSION_SECRET: 'test-session-secret',
    SMTP_HOST: 'smtp.ethereal.email',
    SMTP_PORT: '587',
    SMTP_USER: 'test@ethereal.email',
    SMTP_PASS: 'test-password',
  };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load config with all required env vars present', async () => {
    process.env = { ...process.env, ...validEnv };
    const { default: config } = await import('./config');

    expect(config.databaseUrl).toBe('postgresql://localhost:5432/test');
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.googleClientId).toBe('test-client-id');
    expect(config.googleClientSecret).toBe('test-client-secret');
    expect(config.googleCallbackUrl).toBe('http://localhost:3000/api/auth/google/callback');
    expect(config.sessionSecret).toBe('test-session-secret');
    expect(config.smtpHost).toBe('smtp.ethereal.email');
    expect(config.smtpPort).toBe(587);
    expect(config.smtpUser).toBe('test@ethereal.email');
    expect(config.smtpPass).toBe('test-password');
  });

  it('should use default values for optional vars', async () => {
    process.env = { ...process.env, ...validEnv };
    const { default: config } = await import('./config');

    expect(config.workerConcurrency).toBe(5);
    expect(config.delayBetweenEmailsMs).toBe(2000);
    expect(config.maxEmailsPerHour).toBe(100);
    expect(config.port).toBe(3000);
    expect(config.frontendUrl).toBe('http://localhost:5173');
  });

  it('should use provided values for optional vars when set', async () => {
    process.env = {
      ...process.env,
      ...validEnv,
      WORKER_CONCURRENCY: '10',
      DELAY_BETWEEN_EMAILS_MS: '5000',
      MAX_EMAILS_PER_HOUR: '200',
      PORT: '4000',
      FRONTEND_URL: 'http://localhost:3001',
    };
    const { default: config } = await import('./config');

    expect(config.workerConcurrency).toBe(10);
    expect(config.delayBetweenEmailsMs).toBe(5000);
    expect(config.maxEmailsPerHour).toBe(200);
    expect(config.port).toBe(4000);
    expect(config.frontendUrl).toBe('http://localhost:3001');
  });

  it('should throw an error listing all missing required vars', async () => {
    process.env = { ...process.env };
    // Remove all required vars
    for (const key of Object.keys(validEnv)) {
      delete process.env[key];
    }

    await expect(import('./config')).rejects.toThrow(
      'Missing required environment variables: DATABASE_URL, REDIS_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, SESSION_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'
    );
  });

  it('should throw listing only the missing vars when some are present', async () => {
    process.env = {
      ...process.env,
      DATABASE_URL: 'postgresql://localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
    };
    // Don't set the others
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CALLBACK_URL;
    delete process.env.SESSION_SECRET;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    await expect(import('./config')).rejects.toThrow(
      'Missing required environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, SESSION_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS'
    );
  });
});
