import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const slackRouter = Router();

// 1. "Connect Slack" button lands here -> redirect to Slack consent screen
slackRouter.get('/connect', requireAuth, (_req: Request, res: Response): void => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('slack_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook,chat:write',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

// 2. Slack redirects back with ?code=&state=
slackRouter.get('/callback', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.cookies?.slack_state) {
      res.status(400).send('Invalid Slack OAuth state');
      return;
    }
    res.clearCookie('slack_state');

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        redirect_uri: env.SLACK_REDIRECT_URI,
      }),
    });
    const data = (await tokenRes.json()) as {
      ok: boolean;
      error?: string;
      team?: { name?: string };
      incoming_webhook?: { url: string; channel?: string };
    };
    if (!data.ok || !data.incoming_webhook) {
      res.status(400).send(`Slack OAuth failed: ${data.error ?? 'no webhook returned'}`);
      return;
    }

    await prisma.slackConnection.upsert({
      where: { userId: res.locals.userId },
      update: {
        webhookUrl: data.incoming_webhook.url,
        channel: data.incoming_webhook.channel ?? null,
        teamName: data.team?.name ?? null,
      },
      create: {
        userId: res.locals.userId,
        webhookUrl: data.incoming_webhook.url,
        channel: data.incoming_webhook.channel ?? null,
        teamName: data.team?.name ?? null,
      },
    });
    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    console.error('Slack callback error:', err);
    res.status(500).send('Slack connection failed');
  }
});

// 3. Status for the dashboard button
slackRouter.get('/status', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const conn = await prisma.slackConnection.findUnique({ where: { userId: res.locals.userId } });
  res.json({ connected: !!conn, channel: conn?.channel ?? null, teamName: conn?.teamName ?? null });
});

// 4. Disconnect
slackRouter.post('/disconnect', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  await prisma.slackConnection.deleteMany({ where: { userId: res.locals.userId } });
  res.json({ ok: true });
});