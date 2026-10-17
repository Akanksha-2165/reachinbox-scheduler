import { ConnectionOptions } from 'bullmq';
import Redis from 'ioredis';
import { env } from './env.js';

/**
 * Shared Redis connection options.
 *
 * WHY:
 * BullMQ requires `maxRetriesPerRequest: null` on its Redis connections so it
 * can manage blocking Redis commands (like BRPOPLPUSH/BLMOVE) reliably without
 * throwing timeout errors.
 */
export const redisConnectionOptions: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const createRedisClient = (): Redis => {
  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
};

export const redisClient = createRedisClient();
