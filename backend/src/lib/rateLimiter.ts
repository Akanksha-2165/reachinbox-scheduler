import { redisClient } from '../config/redis.js';

/**
 * Atomic Lua script to increment rate counter and set a 2-hour TTL (7200s) on initial creation.
 *
 * WHY:
 * Executing INCR and EXPIRE in a single atomic Lua script guarantees that no race
 * conditions or connection interruptions can leave the counter key in Redis without
 * an expiration time, preventing indefinite key accumulation.
 */
const INCR_RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], 7200)
end
return current
`;

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  hourWindow: number;
  rateKey: string;
}

/**
 * Hook invoked immediately when a sender exceeds their hourly email limit.
 * Currently logs the event; Slack notification logic will attach to this hook in Block 3.
 */
export function onRateLimitHit(senderId: string, window: number): void {
  console.warn(`[RateLimiter] 🚨 Sender "${senderId}" reached hourly limit for hour window ${window}.`);
}

/**
 * Checks and increments the sender's hourly limit atomically in Redis.
 *
 * @param senderId - ID of the sender
 * @param limit - Maximum emails allowed in this 1-hour window
 * @param now - Current timestamp in ms (defaults to Date.now())
 */
export async function checkAndIncrementRateLimit(
  senderId: string,
  limit: number,
  now: number = Date.now()
): Promise<RateLimitResult> {
  const hourWindow = Math.floor(now / 3600000);
  const rateKey = `rate:${senderId}:${hourWindow}`;

  // Execute atomic Lua evaluation
  const currentCount = (await redisClient.eval(
    INCR_RATE_LIMIT_LUA,
    1,
    rateKey
  )) as number;

  const allowed = currentCount <= limit;

  return {
    allowed,
    currentCount,
    limit,
    hourWindow,
    rateKey,
  };
}

/**
 * Undoes the increment when an attempt exceeds the limit.
 *
 * WHY:
 * If an email cannot be sent in the current hour window, it is delayed to the next window.
 * Decrementing the counter ensures that this rejected attempt does not consume a valid quota slot.
 */
export async function undoRateLimitIncrement(rateKey: string): Promise<void> {
  await redisClient.decr(rateKey);
}
