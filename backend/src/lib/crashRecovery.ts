import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { indexOrUpdateEmail } from './elasticsearch.js';

/**
 * Crash Safety Recovery:
 * If a worker process dies unexpectedly (e.g., OOM, SIGKILL, unhandled exception, power cut)
 * after claiming a database row as "sending", the email must not be lost or permanently stuck.
 *
 * This function locates all rows stuck in "sending" status for longer than SENDING_STALE_MS
 * and resets their status back to "scheduled", syncing the update to Elasticsearch.
 *
 * TRADE-OFF (At-Least-Once vs At-Most-Once):
 * - If a worker crashes before dispatching to SMTP: resetting to "scheduled" guarantees the email
 *   is eventually sent (preventing data loss).
 * - If a worker crashes after SMTP accepted the message but before updating DB to "sent": resetting
 *   could cause the recipient to receive a duplicate email.
 * - In outreach/marketing schedulers, dropping an email silently is worse than a rare duplicate caused
 *   by an infrastructure crash. We choose At-Least-Once delivery with a safety timeout (SENDING_STALE_MS).
 */
export async function recoverStuckSendingEmails(): Promise<number> {
  try {
    const staleThreshold = new Date(Date.now() - env.SENDING_STALE_MS);

    // 1. Identify all emails stuck in 'sending' past the stale threshold
    const stuckEmails = await prisma.email.findMany({
      where: {
        status: 'sending',
        updatedAt: { lt: staleThreshold },
      },
      select: {
        id: true,
        recipient: true,
        subject: true,
        updatedAt: true,
      },
    });

    if (stuckEmails.length === 0) {
      return 0;
    }

    console.warn(
      `⚠️  [Crash Safety] Found ${stuckEmails.length} email(s) stuck in "sending" state for ` +
      `longer than ${env.SENDING_STALE_MS}ms. Resetting to "scheduled"...`
    );

    const stuckIds = stuckEmails.map((e) => e.id);

    // 2. Atomically reset them back to 'scheduled'
    const resetResult = await prisma.email.updateMany({
      where: {
        id: { in: stuckIds },
        status: 'sending', // Safety check
      },
      data: {
        status: 'scheduled',
      },
    });

    // 3. Sync each recovered email in Elasticsearch
    for (const email of stuckEmails) {
      console.log(
        `♻️  [Crash Safety] Reset email ${email.id} to "${email.recipient}" ` +
        `(last updated: ${email.updatedAt.toISOString()}) back to "scheduled"`
      );
      await indexOrUpdateEmail({
        id: email.id,
        status: 'scheduled',
      });
    }

    return resetResult.count;
  } catch (error) {
    console.error('❌ [Crash Safety] Error during stale emails recovery:', error);
    return 0;
  }
}
