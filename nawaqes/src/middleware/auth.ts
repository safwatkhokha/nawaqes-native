// ─── JWT Auth Middleware (Production-Secure) ────────────────────────
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../database/index.js';

// Lazy JWT_SECRET: read at first use, not at import time, so dotenv.config() can run first.
// 🔒 SECURITY: In production, server.ts already refuses to start without JWT_SECRET.
// Here we only fall back to an ephemeral random value in non-production, and we
// throw loudly in production (defence-in-depth — should never be reached).
let _jwtSecret: string | null = null;
function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  const secret = process.env.JWT_SECRET;
  const isPlaceholder = !secret
    || secret === 'REPLACE-WITH-YOUR-OWN-SECURE-RANDOM-STRING'
    || secret === 'CHANGE_ME_TO_A_RANDOM_64_PLUS_CHAR_HEX_STRING'
    || secret === 'nawaqes_secret_2024_xK9pL2mN8qR3wY6'; // known leaked value
  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is missing or placeholder in production. Refusing to sign/verify tokens.');
    }
    const fallback = crypto.randomBytes(64).toString('hex');
    process.env.JWT_SECRET = fallback;
    _jwtSecret = fallback;
    console.warn('[AUTH] ⚠️  Using ephemeral JWT_SECRET (dev mode only).');
    return _jwtSecret;
  }
  _jwtSecret = secret;
  return _jwtSecret;
}

function getJwtExpires(): string {
  return process.env.JWT_EXPIRES_IN || '7d';
}

export interface JwtPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
  sub?: string; // alias for userId (standard JWT claim)
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: getJwtExpires() as any });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

// Cache of deactivated user IDs. A user is added here when any request
// detects is_deactivated = 1, and removed when they re-login (login
// endpoint already rejects deactivated users). This avoids a DB hit on
// every authenticated request.
// Entries auto-expire after 60s so a re-activation by admin takes effect.
const deactivatedUserIdCache = new Map<string, number>(); // userId -> expiresAt (ms)
const DEACTIVATED_CACHE_TTL_MS = 60_000;

function isUserDeactivated(userId: string): boolean {
  const now = Date.now();
  const cached = deactivatedUserIdCache.get(userId);
  if (cached !== undefined) {
    if (cached > now) return true; // still deactivated
    deactivatedUserIdCache.delete(userId); // expired → re-check from DB
  }
  let deactivated = false;
  try {
    const row = db.prepare('SELECT is_deactivated FROM users WHERE id = ?').get(userId) as any;
    if (!row) {
      // User no longer exists — treat as deactivated (deny request).
      deactivated = true;
    } else {
      deactivated = !!row.is_deactivated;
    }
  } catch {
    // If we can't reach the DB, fail OPEN (let the request through) so a
    // transient DB issue doesn't lock every user out. The DB error will
    // surface in the actual handler.
    return false;
  }
  if (deactivated) {
    deactivatedUserIdCache.set(userId, now + DEACTIVATED_CACHE_TTL_MS);
  }
  return deactivated;
}

// Public helper: clears the cache for a user (call after re-activation)
export function clearDeactivationCache(userId?: string) {
  if (userId) deactivatedUserIdCache.delete(userId);
  else deactivatedUserIdCache.clear();
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    return;
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'جلسة منتهية، سجل دخولك مجدداً' });
    return;
  }
  const userId = payload.userId || payload.sub || '';
  if (userId && isUserDeactivated(userId)) {
    res.status(403).json({ error: 'هذا الحساب معطل. تواصل مع الإدارة.' });
    return;
  }
  (req as any).user = payload;
  next();
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as JwtPayload;
  if (!user?.isAdmin) {
    res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
    return;
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if (payload) {
      const userId = payload.userId || payload.sub || '';
      // For optional auth we DON'T reject deactivated users — we just
      // don't attach the user. They'll be treated as a logged-out visitor.
      if (userId && !isUserDeactivated(userId)) {
        (req as any).user = payload;
      }
    }
  }
  next();
}
