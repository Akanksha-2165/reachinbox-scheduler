import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { emailQueue, EMAIL_JOB_NAME } from '../queues/emailQueue.js';
import { env } from '../config/env.js';
import { indexOrUpdateEmail, searchEmails } from '../lib/elasticsearch.js';

export const emailRouter = Router();

/**
 * Validation schema for scheduling emails.
 *
 * Requirements:
 * - subject (non-empty string)
 * - body (non-empty string)
 * - recipients (array of valid emails, min 1)
 * - startTime (valid ISO date string)
 * - delayBetweenMs (non-negative integer)
 * - hourlyLimit (positive integer)
 */
const scheduleEmailSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required'),
  body: z.string().trim().min(1, 'Body is required'),
  recipients: z
    .array(z.string().trim().email('Invalid email address format'))
    .min(1, 'At least one recipient is required'),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'startTime must be a valid ISO-8601 date string',
  }),
  delayBetweenMs: z.coerce
    .number()
    .int()
    .nonnegative('delayBetweenMs must be >= 0')
    .default(env.DEFAULT_DELAY_BETWEEN_MS),
  hourlyLimit: z.coerce
    .number()
    .int()
    .positive('hourlyLimit must be > 0')
    .optional(),
  senderId: z.string().optional(),
});

const getEmailsQuerySchema = z.object({
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
});

/**
 * POST /api/schedule
 * Schedules batch emails with round-robin sender assignment and BullMQ delayed jobs.
 */
emailRouter.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = scheduleEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { subject, body, recipients, startTime, delayBetweenMs, hourlyLimit, senderId } = parseResult.data;

    // Fetch all active senders from DB
    const senders = await prisma.sender.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (senders.length === 0) {
      res.status(400).json({
        error: 'No senders found in database. Run "npm run seed" first to generate Ethereal senders.',
      });
      return;
    }

    // If senderId is specified, restrict distribution to that sender
    const poolSenders = senderId
      ? senders.filter((s) => s.id === senderId)
      : senders;

    if (poolSenders.length === 0) {
      res.status(400).json({
        error: `Sender with ID "${senderId}" not found.`,
      });
      return;
    }

    const baseStartMs = new Date(startTime).getTime();
    const effectiveHourlyLimit = hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    const createdEmails = [];

    // WHY:
    // We loop through recipients, spreading scheduledAt by `delayBetweenMs`
    // and round-robining across available senders. Each email is stored in DB
    // with status=scheduled, and immediately registered as a BullMQ delayed job.
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const sender = poolSenders[i % poolSenders.length];

      // Calculate staggered schedule timestamp
      const scheduledTimeMs = baseStartMs + i * delayBetweenMs;
      const scheduledAt = new Date(scheduledTimeMs);

      // 1. Create DB row with status = scheduled
      const email = await prisma.email.create({
        data: {
          recipient,
          subject,
          body,
          senderId: sender.id,
          scheduledAt,
          status: 'scheduled',
          hourlyLimit: effectiveHourlyLimit,
        },
        include: {
          sender: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Mirror to Elasticsearch with full fields (worker later sends partial updates)
      await indexOrUpdateEmail({
        id: email.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduledAt: email.scheduledAt,
        senderId: email.senderId,
      });
      // 2. Compute BullMQ delay (ms relative to right now)
      // If scheduled time is in the past or now, delay is 0 (runs immediately).
      const now = Date.now();
      const delay = Math.max(0, scheduledTimeMs - now);

      // WHY:
      // BullMQ jobId is set strictly to `email.id`. BullMQ guarantees job ID uniqueness,
      // ensuring that even under concurrent re-triggers or retries, duplicate jobs cannot be created.
      await emailQueue.add(
        EMAIL_JOB_NAME,
        {
          emailId: email.id,
          hourlyLimit: effectiveHourlyLimit,
          index: i,
        },
        {
          delay,
          jobId: email.id, // Idempotency via DB primary key
        }
      );

      createdEmails.push(email);
    }

    res.status(201).json({
      message: `Successfully scheduled ${createdEmails.length} email(s)`,
      count: createdEmails.length,
      emails: createdEmails,
    });
  } catch (error) {
    console.error('Error in POST /api/schedule:', error);
    res.status(500).json({
      error: 'Internal server error while scheduling emails',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/emails?status=scheduled|sent
 * Retrieves emails, optionally filtered by status.
 */
emailRouter.get('/emails', async (req: Request, res: Response): Promise<void> => {
  try {
    const queryParse = getEmailsQuerySchema.safeParse(req.query);
    if (!queryParse.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: queryParse.error.flatten(),
      });
      return;
    }

    const { status } = queryParse.data;

    const emails = await prisma.email.findMany({
      where: status ? { status } : undefined,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
    });

    res.status(200).json(emails);
  } catch (error) {
    console.error('Error in GET /api/emails:', error);
    res.status(500).json({
      error: 'Internal server error while fetching emails',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
const searchQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

emailRouter.get('/search', async (req: Request, res: Response): Promise<void> => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    return;
  }
  try {
    res.status(200).json(await searchEmails(parsed.data));
  } catch (error) {
    console.error('Error in GET /api/search:', error);
    res.status(503).json({
      error: 'Search unavailable',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});