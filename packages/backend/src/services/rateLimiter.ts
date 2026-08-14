/**
 * Rate Limiter Service
 *
 * Enforces per-sender rate limits using Redis atomic operations:
 * - Maximum emails per hour (configurable)
 * - Minimum delay between consecutive emails (configurable)
 *
 * Uses Redis MULTI/EXEC for atomic counter increments and
 * last-send timestamp checks to ensure correctness across
 * multiple Worker instances running concurrently.
 *
 * Requirements: 3.1, 3.2, 3.5
 */

import Redis from 'ioredis';
import { RateLimitResult } from '../types';

/** Configuration for the rate limiter */
export interface RateLimiterConfig {
  maxEmailsPerHour: number;
  delayBetweenEmailsMs: number;
}

export class RateLimiter {
  private redisClient: Redis;
  private config: RateLimiterConfig;

  constructor(redisClient: Redis, config: RateLimiterConfig) {
    this.redisClient = redisClient;
    this.config = config;
  }

  /**
   * Check whether a sender is allowed to send an email right now.
   *
   * Uses Redis MULTI/EXEC pipeline to atomically:
   * 1. GET the last send timestamp for the sender
   * 2. INCR the hourly counter for the sender
   * 3. Check TTL / set expiry on the hourly counter key
   *
   * Returns a RateLimitResult indicating whether the send is allowed,
   * and if not, how long to wait before retrying.
   */
  async checkRateLimit(sender: string): Promise<RateLimitResult> {
    const now = Date.now();
    const hourTimestamp = Math.floor(now / 3600000);
    const hourlyKey = `ratelimit:${sender}:${hourTimestamp}`;
    const lastSendKey = `lastsend:${sender}`;

    // Use MULTI/EXEC for atomic read-and-increment
    const pipeline = this.redisClient.multi();
    pipeline.get(lastSendKey);
    pipeline.incr(hourlyKey);
    pipeline.ttl(hourlyKey);

    const results = await pipeline.exec();

    if (!results) {
      // If MULTI/EXEC fails entirely, deny the request as a safety measure
      return {
        allowed: false,
        retryAfterMs: 1000,
        currentCount: 0,
        maxCount: this.config.maxEmailsPerHour,
      };
    }

    const [lastSendResult, incrResult, ttlResult] = results;

    const lastSendValue = lastSendResult[1] as string | null;
    const currentCount = incrResult[1] as number;
    const ttl = ttlResult[1] as number;

    // Set expiry on the hourly key if it's new (TTL returns -1 when no expiry is set)
    if (ttl === -1) {
      await this.redisClient.expire(hourlyKey, 3600);
    }

    // Check inter-email delay
    if (lastSendValue) {
      const lastSendTime = parseInt(lastSendValue, 10);
      const elapsed = now - lastSendTime;
      if (elapsed < this.config.delayBetweenEmailsMs) {
        const retryAfterMs = this.config.delayBetweenEmailsMs - elapsed;

        // Decrement the counter since we're not actually sending
        await this.redisClient.decr(hourlyKey);

        return {
          allowed: false,
          retryAfterMs,
          currentCount: currentCount - 1,
          maxCount: this.config.maxEmailsPerHour,
        };
      }
    }

    // Check hourly rate limit
    if (currentCount > this.config.maxEmailsPerHour) {
      // Calculate milliseconds until the next hour boundary
      const currentHourStartMs = hourTimestamp * 3600000;
      const nextHourStartMs = currentHourStartMs + 3600000;
      const retryAfterMs = nextHourStartMs - now;

      // Decrement since we're not actually sending
      await this.redisClient.decr(hourlyKey);

      return {
        allowed: false,
        retryAfterMs,
        currentCount: currentCount - 1,
        maxCount: this.config.maxEmailsPerHour,
      };
    }

    // Allowed - update last send timestamp atomically
    await this.redisClient.set(lastSendKey, now.toString());

    return {
      allowed: true,
      currentCount,
      maxCount: this.config.maxEmailsPerHour,
    };
  }

  /**
   * Record that a send has occurred for the given sender.
   * Updates the last send timestamp to the current time.
   */
  async recordSend(sender: string): Promise<void> {
    const lastSendKey = `lastsend:${sender}`;
    await this.redisClient.set(lastSendKey, Date.now().toString());
  }
}
