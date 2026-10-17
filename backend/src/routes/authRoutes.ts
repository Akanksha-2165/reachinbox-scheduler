import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth, COOKIE_NAME } from '../middleware/requireAuth.js';

export const authRouter = Router();

// 1. Browser yahan aata hai -> Google ke login page par redirect
authRouter.get('/google', (_req: Request, res: Response): void => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// 2. Google yahan wapas bhejta hai ?code=...&state=...
authRouter.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.cookies?.oauth_state) {
      res.status(400).send('Invalid OAuth state');
      return;
    }
    res.clearCookie('oauth_state');

    // code -> access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      res.status(401).send('Google token exchange failed');
      return;
    }

    // access token -> user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await profileRes.json()) as {
      sub: string; email: string; name?: string; picture?: string;
    };

    // find-or-create user (googleId unique)
    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      update: { name: profile.name ?? profile.email, avatar: profile.picture ?? null },
      create: {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email,
        avatar: profile.picture ?? null,
      },
    });

    const token = jwt.sign({ uid: user.id }, env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // production (https) mein true
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(env.FRONTEND_URL);
  } catch (err) {
    console.error('Google callback error:', err);
    res.status(500).send('Login failed');
  }
});

// 3. Current user
authRouter.get('/me', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: res.locals.userId },
    select: { id: true, name: true, email: true, avatar: true },
  });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// 4. Logout
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});