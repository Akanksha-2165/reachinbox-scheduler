import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { emailQueue, EMAIL_JOB_NAME } from '../queues/emailQueue.js';
import { env } from '../config/env.js';
import { bulkIndexEmails, searchEmails } from '../lib/elasticsearch.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const emailRouter = Router();

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

const searchQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * POST /api/schedule
 * Bulk path: 1 DB query (createMany), BullMQ addBulk in chunks, 1 ES bulk call.
 * jobId = email id keeps idempotency; DB is the source of truth.
 */
emailRouter.post('/schedule', requireAuth, async (req: Request, res: Response): Promise<void> => {
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

    const senders = await prisma.sender.findMany({ orderBy: { createdAt: 'asc' } });
    if (senders.length === 0) {
      res.status(400).json({
        error: 'No senders found in database. Run "npm run seed" first to generate Ethereal senders.',
      });
      return;
    }

    const poolSenders = senderId ? senders.filter((s) => s.id === senderId) : senders;
    if (poolSenders.length === 0) {
      res.status(400).json({ error: `Sender with ID "${senderId}" not found.` });
      return;
    }

    const baseStartMs = new Date(startTime).getTime();
    const effectiveHourlyLimit = hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER;

    const rows = recipients.map((recipient, i) => {
      const sender = poolSenders[i % poolSenders.length];
      return {
        id: randomUUID(),
        recipient,
        subject,
        body,
        senderId: sender.id,
        userId: res.locals.userId as string,
        scheduledAt: new Date(baseStartMs + i * delayBetweenMs),
        status: 'scheduled' as const,
        hourlyLimit: effectiveHourlyLimit,
      };
    });

    // 1. One DB query (source of truth)
    await prisma.email.createMany({ data: rows });

    // 2. BullMQ delayed jobs in chunks, jobId = email id (idempotent)
    const CHUNK = 500;
    const nowMs = Date.now();
    for (let c = 0; c < rows.length; c += CHUNK) {
      const chunk = rows.slice(c, c + CHUNK);
      await emailQueue.addBulk(
        chunk.map((row, j) => ({
          name: EMAIL_JOB_NAME,
          data: { emailId: row.id, hourlyLimit: effectiveHourlyLimit, index: c + j },
          opts: { delay: Math.max(0, row.scheduledAt.getTime() - nowMs), jobId: row.id },
        }))
      );
    }

    // 3. One ES bulk call (failure is logged, never breaks scheduling)
    await bulkIndexEmails(rows.map((r) => ({ ...r })));

    res.status(201).json({
      message: `Successfully scheduled ${rows.length} email(s)`,
      count: rows.length,
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
 */
emailRouter.get('/emails', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
      where: { userId: res.locals.userId, ...(status ? { status } : {}) },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
      orderBy: { scheduledAt: 'asc' },
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

emailRouter.get('/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    return;
  }
  try {
    res.status(200).json(await searchEmails({ ...parsed.data, userId: res.locals.userId }));
  } catch (error) {
    console.error('Error in GET /api/search:', error);
    res.status(503).json({
      error: 'Search unavailable',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

emailRouter.get('/emails/counts', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const userId = res.locals.userId;
  const [scheduled, sent] = await Promise.all([
    prisma.email.count({ where: { userId, status: { in: ['scheduled', 'sending'] } } }),
    prisma.email.count({ where: { userId, status: { in: ['sent', 'failed'] } } }),
  ]);
  res.json({ scheduled, sent });
});