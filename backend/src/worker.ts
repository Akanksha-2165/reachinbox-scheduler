import { Worker, Job, DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from './config/env.js';
import { redisConnectionOptions } from './config/redis.js';
import { prisma } from './lib/prisma.js';
import { EmailJobData } from './queues/emailQueue.js';
import {
  checkAndIncrementRateLimit,
  undoRateLimitIncrement,
  onRateLimitHit,
} from './lib/rateLimiter.js';
import { indexOrUpdateEmail } from './lib/elasticsearch.js';
import { recoverStuckSendingEmails } from './lib/crashRecovery.js';

console.log(
  `⚙️  [BullMQ Worker] Initializing with concurrency: ${env.WORKER_CONCURRENCY}, ` +
  `minDelayBetweenSends: ${env.MIN_DELAY_BETWEEN_SENDS_MS}ms, ` +
  `sendingStaleMs: ${env.SENDING_STALE_MS}ms`
);

// Block 3 Crash Safety: On worker startup, reset rows stuck in "sending" > SENDING_STALE_MS back to "scheduled"
recoverStuckSendingEmails().then((recoveredCount) => {
  if (recoveredCount > 0) {
    console.log(`🛡️  [BullMQ Worker] Startup crash recovery reset ${recoveredCount} orphaned email(s) to 'scheduled'.`);
  }
}).catch((err) => {
  console.error('❌ [BullMQ Worker] Startup crash recovery encountered an error:', err);
});

/**
 * Worker processor function for dispatching emails via Ethereal SMTP.
 *
 * Block 2 & Block 3 Design:
 * 1. Idempotency & Crash-Safety: Atomically claims the row from 'scheduled' -> 'sending'.
 *    If count is 0, checks if the email is a retried stalled job stuck in 'sending' > SENDING_STALE_MS.
 * 2. Elasticsearch Tracking: Every lifecycle status transition (sending, sent, failed, scheduled/rescheduled)
 *    is idempotently mirrored to Elasticsearch without blocking email delivery if ES is unreachable.
 * 3. Per-Sender Rate Limiting: Evaluates atomic Redis Lua script (rate:{senderId}:{hourWindow}).
 *    If over limit, job is moved to the next hour window via job.moveToDelayed(nextHourTimestamp, token).
 * 4. Stalled Job Recovery: Worker listens to 'stalled' event and resets orphaned rows back to 'scheduled'.
 */
async function processEmailJob(job: Job<EmailJobData>, token?: string): Promise<void> {
  const { emailId } = job.data;
  console.log(`\n📨 [Worker] Processing job #${job.id} for Email ID: ${emailId}`);

  // 1. Idempotency: Atomically claim the row from 'scheduled' -> 'sending'
  let claim = await prisma.email.updateMany({
    where: { id: emailId, status: 'scheduled' },
    data: { status: 'sending' },
  });

  if (claim.count === 0) {
    // Crash Safety Fallback: Check if this row is stuck in 'sending' for longer than SENDING_STALE_MS
    const staleThreshold = new Date(Date.now() - env.SENDING_STALE_MS);
    const reclaimed = await prisma.email.updateMany({
      where: {
        id: emailId,
        status: 'sending',
        updatedAt: { lt: staleThreshold },
      },
      data: { status: 'sending' },
    });

    if (reclaimed.count > 0) {
      console.log(`♻️  [Worker] Recovered stale email ${emailId} from 'sending' state (crash-safety reclaim).`);
    } else {
      console.log(`ℹ️  [Worker] Email ${emailId} already claimed or processed (count=0). Skipping duplicate.`);
      return;
    }
  }

  // Sync status transition to Elasticsearch (idempotent, non-blocking)
  await indexOrUpdateEmail({
    id: emailId,
    status: 'sending',
  });

  // 2. Fetch email and sender details
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email) {
    console.warn(`⚠️  [Worker] Email ${emailId} not found in DB. Skipping job.`);
    return;
  }

  // 3. Hourly Rate Limit Check per Sender
  const hourlyLimit = email.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const now = Date.now();
  const rateResult = await checkAndIncrementRateLimit(email.senderId, hourlyLimit, now);

  if (!rateResult.allowed) {
    // Notify rate limit hook (Slack integration attaches here in later blocks)
    onRateLimitHit(email.senderId, rateResult.hourWindow);

    // Undo counter so blocked attempt does not consume a valid quota slot
    await undoRateLimitIncrement(rateResult.rateKey);

    // Calculate next hour window start timestamp
    const nextHourWindow = rateResult.hourWindow + 1;
    const nextHourStartMs = nextHourWindow * 3600000;
    // Add small per-job offset (index * 100ms) to preserve order
    const indexOffset = (job.data.index ?? 0) * 100;
    const nextScheduledAtMs = nextHourStartMs + indexOffset;
    const nextScheduledAt = new Date(nextScheduledAtMs);

    // Reset status back to 'scheduled' and update scheduledAt in DB
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'scheduled',
        scheduledAt: nextScheduledAt,
      },
    });

    // Mirror rescheduled status and updated scheduledAt in Elasticsearch
    await indexOrUpdateEmail({
      id: email.id,
      status: 'scheduled',
      scheduledAt: nextScheduledAt,
    });

    // Move the same job to the delayed state in Redis using the worker lock token
    await job.moveToDelayed(nextScheduledAtMs, token);

    console.log(
      `⏳ [Worker] Sender "${email.sender.name}" (${email.senderId}) reached hourly limit (${hourlyLimit}/hr). ` +
      `Email ${email.id} rescheduled to next hour: ${nextScheduledAt.toISOString()}`
    );

    // WHY:
    // Throwing BullMQ's built-in DelayedError informs BullMQ that the job was moved
    // to the delayed set, preventing BullMQ from trying to complete or fail an untracked lock.
    throw new DelayedError();
  }

  // 4. Send Email via Ethereal SMTP
  try {
    const transporter = nodemailer.createTransport({
      host: email.sender.smtpHost,
      port: email.sender.smtpPort,
      secure: email.sender.smtpPort === 465,
      auth: {
        user: email.sender.user,
        pass: email.sender.pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${email.sender.name}" <${email.sender.email}>`,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      html: email.body.replace(/\n/g, '<br/>'),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    const sentAt = new Date();

    // Update DB record on success
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'sent',
        sentAt,
        error: null,
      },
    });

    // Mirror sent status in Elasticsearch
    await indexOrUpdateEmail({
      id: email.id,
      status: 'sent',
      sentAt,
    });

    console.log(`✅ [Worker] Email sent to ${email.recipient}`);
    console.log(`   Message ID:  ${info.messageId}`);
    if (previewUrl) {
      console.log(`   Preview URL: ${previewUrl}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [Worker] Failed to send email ${email.id}:`, errorMsg);

    // Persist failure reason to DB
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'failed',
        error: errorMsg,
      },
    });

    // Mirror failed status in Elasticsearch
    await indexOrUpdateEmail({
      id: email.id,
      status: 'failed',
    });

    // Re-throw so BullMQ registers the job failure and initiates configured retries
    throw error;
  }
}

/**
 * BullMQ Worker instance with configured concurrency and queue-wide limiter.
 */
export const worker = new Worker<EmailJobData>(env.QUEUE_NAME, processEmailJob, {
  connection: redisConnectionOptions,
  concurrency: env.WORKER_CONCURRENCY,
  limiter: {
    max: 1,
    duration: env.MIN_DELAY_BETWEEN_SENDS_MS,
  },
});

worker.on('ready', () => {
  console.log(`🟢 [BullMQ Worker] Ready and listening on queue "${env.QUEUE_NAME}"`);
});

// Block 3 Crash Safety: Handle stalled jobs
worker.on('stalled', async (jobId: string, prev: string) => {
  console.warn(`⚠️  [BullMQ Worker] Job ${jobId} stalled (previous state: ${prev}). Checking for stuck rows...`);
  await recoverStuckSendingEmails();
});

worker.on('failed', (job, err) => {
  console.error(`💥 [BullMQ Worker] Job ${job?.id} failed with error:`, err.message);
});

worker.on('error', (err) => {
  console.error('💥 [BullMQ Worker] Unexpected worker error:', err);
});
});

/**
 * Graceful shutdown for BullMQ worker
 */
const shutdown = async () => {
  console.log('\n🛑 [BullMQ Worker] Stopping worker gracefully...');
  await worker.close();
  await prisma.$disconnect();
  console.log('🛑 [BullMQ Worker] Worker closed and database disconnected.');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
