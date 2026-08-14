import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import config from './config';
import authRouter from './routes/auth';
import emailRouter from './routes/emails';
import { startWorker, closeWorker } from './workers/emailWorker';
import { closeQueue } from './queue/emailQueue';

const app = express();
const prisma = new PrismaClient();

// Initialize Redis client
const redis = new Redis(config.redisUrl);

// Redis connection event handlers
redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

// Apply middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/emails', emailRouter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start server and connect to databases
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('[Database] Connected successfully');
  } catch (err) {
    console.error('[Database] Connection error:', (err as Error).message);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`[Server] Running on port ${config.port}`);
  });

  // Start BullMQ email worker after server is listening
  startWorker();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[Server] ${signal} received, shutting down gracefully...`);
    server.close(() => {
      console.log('[Server] HTTP server closed');
    });
    await closeWorker();
    console.log('[Worker] Closed');
    await closeQueue();
    console.log('[Queue] Closed');
    await redis.quit();
    console.log('[Redis] Connection closed');
    await prisma.$disconnect();
    console.log('[Database] Connection closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();

export { app, redis, prisma };
