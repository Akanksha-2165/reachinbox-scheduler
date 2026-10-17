import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const COOKIE_NAME = 'token';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { uid: string };
    res.locals.userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}