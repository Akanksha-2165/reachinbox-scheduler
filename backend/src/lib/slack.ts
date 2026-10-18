import { Redis } from 'ioredis';
import { prisma } from './prisma.js';
import { redisConnectionOptions } from '../config/redis.js';

const redis = new Redis(redisConnectionOptions as any);

/**
 * Called when a sender hits the hourly limit. Sends ONE live Slack message
 * per (user, sender, hour window). Never throws: Slack problems must not
 * affect email sending.
 */
export async function notifySlackRateLimit(
  userId: string | null,
  senderName: string,
  senderId: string,
  limit: number,
  hourWindow: number
): Promise<void> {
  try {
    if (!userId) return;

    const conn = await prisma.slackConnection.findUnique({ where: { userId } });
    if (!conn) return; // Slack not connected: silently skip

    // Dedup: only the first hit in this hour window sends a message
    const key = `slack:notified:${userId}:${senderId}:${hourWindow}`;
    const first = await redis.set(key, '1', 'EX', 3600, 'NX');
    if (first !== 'OK') return;

    const resumeAt = new Date((hourWindow + 1) * 3600000).toLocaleTimeString('en-IN');
    const res = await fetch(conn.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:warning: Sender *${senderName}* reached its hourly limit (${limit}/hr). Remaining emails are rescheduled and will resume at ${resumeAt}.`,
      }),
    });
    if (!res.ok) console.warn(`[Slack] webhook returned ${res.status}`);
  } catch (err) {
    console.warn('[Slack] notify failed:', err instanceof Error ? err.message : err);
  }
}