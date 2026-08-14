import dotenv from 'dotenv';

dotenv.config();

interface Config {
  databaseUrl: string;
  redisUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleCallbackUrl: string;
  sessionSecret: string;
  workerConcurrency: number;
  delayBetweenEmailsMs: number;
  maxEmailsPerHour: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  port: number;
  frontendUrl: string;
}

const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'SESSION_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

function loadConfig(): Config {
  const missing: string[] = [];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    databaseUrl: process.env.DATABASE_URL!,
    redisUrl: process.env.REDIS_URL!,
    googleClientId: process.env.GOOGLE_CLIENT_ID!,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL!,
    sessionSecret: process.env.SESSION_SECRET!,
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    delayBetweenEmailsMs: parseInt(process.env.DELAY_BETWEEN_EMAILS_MS || '2000', 10),
    maxEmailsPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || '100', 10),
    smtpHost: process.env.SMTP_HOST!,
    smtpPort: parseInt(process.env.SMTP_PORT!, 10),
    smtpUser: process.env.SMTP_USER!,
    smtpPass: process.env.SMTP_PASS!,
    port: parseInt(process.env.PORT || '3000', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  };
}

const config: Config = loadConfig();

export default config;
export type { Config };
