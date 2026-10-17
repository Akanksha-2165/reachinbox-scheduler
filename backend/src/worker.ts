import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from './config/env.js';
import { redisConnectionOptions } from './config/redis.js';
import { prisma } from './lib/prisma.js';
import { EmailJobData, EMAIL_JOB_NAME } from './queues/emailQueue.js';

console.log(`⚙️  [BullMQ Worker] Initializing with concurrency: ${env.WORKER_CONCURRENCY}`);

/**
 * Worker processor function for dispatching emails via Ethereal SMTP.
 *
 * WHY:
 * 1. Idempotency: We check the DB status first. If already marked 'sent', we skip
 *    to prevent duplicate delivery under worker restarts or job retries.
 * 2. Ethereal SMTP: The email record contains a relation to its assigned Sender,
 *    providing authentic host/port/auth credentials created during seeding.
 * 3. Status Tracking: We update DB row status to 'sent' + sentAt, or 'failed' + error.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailId } = job.data;
  console.log(`\n📨 [Worker] Processing job #${job.id} for Email ID: ${emailId}`);

  // Fetch email and sender credentials
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email) {
    console.warn(`⚠️  [Worker] Email ${emailId} not found in DB. Skipping job.`);
    return;
  }

  // Idempotency check: never re-send already sent emails
  if (email.status === 'sent') {
    console.log(`ℹ️  [Worker] Email ${emailId} is already sent. Skipping duplicate send.`);
    return;
  }

  try {
    // Configure transporter dynamically using the assigned sender's credentials
    const transporter = nodemailer.createTransport({
      host: email.sender.smtpHost,
      port: email.sender.smtpPort,
      secure: email.sender.smtpPort === 465, // Port 587 uses STARTTLS (secure: false)
      auth: {
        user: email.sender.user,
        pass: email.sender.pass,
      },
    });

    // Send the email via Nodemailer
    const info = await transporter.sendMail({
      from: `"${email.sender.name}" <${email.sender.email}>`,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
      html: email.body.replace(/\n/g, '<br/>'),
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    // Update DB record on success
    await prisma.email.update({
      where: { id: email.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        error: null,
      },
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

    // Re-throw so BullMQ registers the job failure and initiates configured retries
    throw error;
  }
}

// Start BullMQ Worker with configured concurrency from env
export const worker = new Worker<EmailJobData>(env.QUEUE_NAME, processEmailJob, {
  connection: redisConnectionOptions,
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on('ready', () => {
  console.log(`🟢 [BullMQ Worker] Ready and listening on queue "${env.QUEUE_NAME}"`);
});

worker.on('failed', (job, err) => {
  console.error(`💥 [BullMQ Worker] Job ${job?.id} failed with error:`, err.message);
});

worker.on('error', (err) => {
  console.error('💥 [BullMQ Worker] Unexpected worker error:', err);
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
