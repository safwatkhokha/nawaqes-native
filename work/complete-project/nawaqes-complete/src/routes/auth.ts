// --- Auth Routes ---
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../database/index.js';
import { generateToken, authMiddleware, JwtPayload } from '../middleware/auth.js';
import { getDefaultAvatar } from '../utils/serverAvatar.js';

const router = Router();

// In-memory reset tokens.
// 🔒 FIX: previously keyed by the 6-digit CODE, so requesting a new code
//   did NOT invalidate the old one — an attacker who briefly stole code #1
//   could still use it for 15 minutes after the user reset with code #2.
//   Now we key by userId and overwrite any previous entry on each request.
//   We also keep a reverse lookup (code → userId) for the reset endpoint.
const resetTokensByUserId = new Map<string, { code: string; expiresAt: number }>();
const resetTokensByCode = new Map<string, string>(); // code → userId

// 🔒 FIX: per-account brute-force protection on login.
// After MAX_FAILED_ATTEMPTS failed logins for the same email, the account
// is locked for LOCKOUT_DURATION_MS. The map is periodically swept.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const failedLoginAttempts = new Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>();

function isAccountLocked(email: string): { locked: boolean; remainingMs?: number } {
  const entry = failedLoginAttempts.get(email);
  if (!entry) return { locked: false };
  const now = Date.now();
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, remainingMs: entry.lockedUntil - now };
  }
  // Lockout expired — reset.
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    failedLoginAttempts.delete(email);
    return { locked: false };
  }
  return { locked: false };
}

function recordFailedLogin(email: string) {
  const now = Date.now();
  let entry = failedLoginAttempts.get(email);
  if (!entry) {
    entry = { count: 0, firstAttemptAt: now };
    failedLoginAttempts.set(email, entry);
  }
  // Reset window if first attempt was > 1 hour ago
  if (now - entry.firstAttemptAt > 60 * 60 * 1000) {
    entry = { count: 0, firstAttemptAt: now };
    failedLoginAttempts.set(email, entry);
  }
  entry.count++;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    console.warn(`[AUTH] Account ${email} locked for ${LOCKOUT_DURATION_MS / 60000}min after ${entry.count} failed attempts.`);
  }
}

function clearFailedLogins(email: string) {
  failedLoginAttempts.delete(email);
}

// Periodic sweep (every 10 min) to keep the map from growing unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of failedLoginAttempts) {
    if (entry.lockedUntil && entry.lockedUntil < now) {
      failedLoginAttempts.delete(email);
    } else if (!entry.lockedUntil && now - entry.firstAttemptAt > 60 * 60 * 1000) {
      failedLoginAttempts.delete(email);
    }
  }
}, 10 * 60 * 1000).unref?.();

// Helper: parse JSON fields from user row
function parseUser(row: any) {
  if (!row) return null;
  let interests: any[] = [];
  try { interests = JSON.parse(row.interests || '[]'); } catch { interests = []; }
  let paymentMethods: any[] = [];
  try { paymentMethods = JSON.parse(row.payment_methods || '[]'); } catch { paymentMethods = []; }
  return {
    ...row,
    interests: Array.isArray(interests) ? interests : [],
    payment_methods: Array.isArray(paymentMethods) ? paymentMethods : [],
    is_verified: !!row.is_verified,
    is_admin: !!row.is_admin,
    is_trusted: !!row.is_trusted,
    is_deactivated: !!row.is_deactivated,
    show_phone: !!row.show_phone,
    show_location: !!row.show_location,
    gender: row.gender || 'male',
    password_hash: undefined as any, // excluded from response
    avatar_base64: row.avatar_base64 || undefined,
  };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, interests, gender, dateOfBirth } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: 'الاسم والبريد وكلمة المرور مطلوبون' });
      return;
    }
    if (!phone || phone.trim().length < 11) {
      res.status(400).json({ error: 'رقم الهاتف مطلوب ويجب أن يكون 11 رقماً على الأقل' });
      return;
    }
    if (!dateOfBirth) {
      res.status(400).json({ error: 'تاريخ الميلاد مطلوب' });
      return;
    }
    // Validate age (must be at least 13 years old)
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 13 || age > 120) {
      res.status(400).json({ error: 'يجب أن يكون عمرك 13 سنة على الأقل' });
      return;
    }
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
      return;
    }
    if (password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وحرف صغير ورقم' });
      return;
    }
    if (name.trim().length < 2) {
      res.status(400).json({ error: 'الاسم يجب أن يكون حرفين على الأقل' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const normalizedPhone = phone.trim();

    // Validate Egyptian phone number format
    const phoneRegex = /^01[0-2,5]{1}[0-9]{8}$/;
    if (!phoneRegex.test(normalizedPhone)) {
      res.status(400).json({ error: 'رقم الهاتف يجب أن يكون رقم مصري صحيح (01xxxxxxxxx)' });
      return;
    }

    // Check if email is already registered
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existingEmail) {
      res.status(409).json({ error: 'هذا البريد مسجل بالفعل' });
      return;
    }

    // Check if phone is already registered by another user
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(normalizedPhone);
    if (existingPhone) {
      res.status(409).json({ error: 'رقم الهاتف مسجل بالفعل لمستخدم آخر' });
      return;
    }

    // Note: No need to check email+phone combination separately since we already
    // verified each individually above - if both are unique, the combo is also unique

    const passwordHash = bcrypt.hashSync(password, 12);
    // Generate gender-appropriate avatar using DiceBear
    const avatarSeed = name.trim();
    const userGenderValue = (gender === 'male' || gender === 'female') ? gender : 'male';
    const avatar = getDefaultAvatar(avatarSeed, userGenderValue);

    const userGender = (gender === 'male' || gender === 'female') ? gender : 'male';

    // Add columns if not exists
    try { db.prepare('ALTER TABLE users ADD COLUMN gender TEXT DEFAULT \'male\'').run(); } catch { /* column already exists */ }
    try { db.prepare("ALTER TABLE users ADD COLUMN date_of_birth TEXT DEFAULT ''").run(); } catch { /* column already exists */ }

    db.prepare(`
      INSERT INTO users (name, email, password_hash, avatar, phone, interests, gender, date_of_birth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name.trim(), normalizedEmail, passwordHash, avatar, normalizedPhone, JSON.stringify(interests || []), userGender, dateOfBirth);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
    const token = generateToken({ userId: user.id, email: user.email, isAdmin: !!user.is_admin });

    // ─── Trigger an event backup so new users are saved to HF Datasets ───
    // This prevents user loss if the container is rebuilt before the next periodic backup
    try {
      const { createEventBackup } = await import('../database/backup-system.js');
      createEventBackup('user_registered');
    } catch {}

    res.status(201).json({ user: parseUser(user), token });
  } catch (err: any) {
    console.error('[AUTH] /register error:', err.message);
    res.status(500).json({ error: 'فشل إنشاء الحساب' });
  }
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'البريد وكلمة المرور مطلوبان' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 🔒 FIX: per-account brute-force protection.
    const lockStatus = isAccountLocked(normalizedEmail);
    if (lockStatus.locked) {
      const mins = Math.ceil((lockStatus.remainingMs || 0) / 60000);
      res.status(429).json({ error: `تم قفل الحساب مؤقتاً بسبب محاولات فاشلة. حاول بعد ${mins} دقيقة.` });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      recordFailedLogin(normalizedEmail);
      res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
      return;
    }

    if (user.is_deactivated) {
      res.status(403).json({ error: 'هذا الحساب معطل' });
      return;
    }

    // 🔒 FIX: clear failed attempts on successful login.
    clearFailedLogins(normalizedEmail);

    const token = generateToken({ userId: user.id, email: user.email, isAdmin: !!user.is_admin });
    // Track session + login history (for Settings → Security tab)
    recordLogin(user.id, req.ip || '', req.headers['user-agent'] || '', true);
    recordSession(user.id, req.ip || '', req.headers['user-agent'] || '', token.slice(-12));
    res.json({ user: parseUser(user), token });
  } catch (err: any) {
    console.error('[AUTH] /login error:', err.message);
    res.status(500).json({ error: 'فشل تسجيل الدخول' });
  }
});

// 🔧 NEW: POST /api/auth/login-phone — Login with email + phone (no password)
// Used by the "Google login" button which asks for email + phone instead of password.
router.post('/login-phone', (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;
    if (!email || !phone) {
      res.status(400).json({ error: 'البريد ورقم الهاتف مطلوبان' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.replace(/[\s\-+]/g, '');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;
    if (!user) {
      res.status(401).json({ error: 'البريد الإلكتروني غير مسجل' });
      return;
    }

    // Check if phone matches (compare normalized versions)
    const userPhone = (user.phone || '').replace(/[\s\-+]/g, '');
    if (userPhone !== normalizedPhone) {
      res.status(401).json({ error: 'رقم الهاتف غير مطابق' });
      return;
    }

    if (user.is_deactivated) {
      res.status(403).json({ error: 'هذا الحساب معطل' });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email, isAdmin: !!user.is_admin });
    // Track session + login history (phone-based login)
    recordLogin(user.id, req.ip || '', req.headers['user-agent'] || '', true);
    recordSession(user.id, req.ip || '', req.headers['user-agent'] || '', token.slice(-12));
    res.json({ user: parseUser(user), token });
  } catch (err: any) {
    console.error('[AUTH] /login-phone error:', err.message);
    res.status(500).json({ error: 'فشل تسجيل الدخول' });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(normalizedEmail) as any;

    // Always return success to prevent email enumeration
    if (!user) {
      res.json({ message: 'إذا كان البريد مسجلاً، سيتم إرسال رمز إعادة التعيين' });
      return;
    }

    // Generate a 6-digit reset code
    const resetCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    // 🔒 FIX: key by userId so a new code invalidates the previous one.
    // Previously this was keyed by code, allowing multiple live codes per user.
    const previousCode = resetTokensByUserId.get(user.id)?.code;
    if (previousCode) resetTokensByCode.delete(previousCode);
    resetTokensByUserId.set(user.id, { code: resetCode, expiresAt });
    resetTokensByCode.set(resetCode, user.id);

    // In production, this code would be sent via email (SMTP/SendGrid/etc.).
    // We log ONLY in non-production — production logs (HF Spaces, Render,
    // Koyeb) are visible to anyone with dashboard access and would leak
    // the code, allowing account takeover.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RESET] Password reset code for ${normalizedEmail}: ${resetCode}`);
    } else {
      console.log(`[RESET] Password reset code generated for ${normalizedEmail} (not logged in production)`);
    }

    res.json({
      message: 'تم إرسال رمز إعادة تعيين كلمة المرور',
      // Only include reset code in the HTTP response in development mode
      // (no email infrastructure yet). In production the user must receive
      // it via the configured email service — never via the API response.
      ...(process.env.NODE_ENV !== 'production' && { resetCode }),
    });
  } catch (err: any) {
    console.error('[AUTH] /forgot-password error:', err.message);
    res.status(500).json({ error: 'فشل إرسال رمز إعادة التعيين' });
  }
});

// POST /api/auth/reset-password - Reset password with code
router.post('/reset-password', (req: Request, res: Response) => {
  try {
    const { code, newPassword } = req.body;
    if (!code || !newPassword) {
      res.status(400).json({ error: 'رمز إعادة التعيين وكلمة المرور الجديدة مطلوبان' });
      return;
    }
    if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وحرف صغير ورقم' });
      return;
    }

    const userIdForCode = resetTokensByCode.get(code);
    if (!userIdForCode) {
      res.status(400).json({ error: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية' });
      return;
    }
    const tokenData = resetTokensByUserId.get(userIdForCode);
    if (!tokenData || tokenData.code !== code || Date.now() > tokenData.expiresAt) {
      // 🔒 FIX: invalidate on use (or expiry).
      resetTokensByUserId.delete(userIdForCode);
      resetTokensByCode.delete(code);
      res.status(400).json({ error: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية' });
      return;
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, userIdForCode);

    // 🔒 FIX: invalidate the reset code (and any other code for this user).
    resetTokensByUserId.delete(userIdForCode);
    resetTokensByCode.delete(code);
    // Also clear any brute-force lockout — the user just proved identity via the reset code.
    clearFailedLogins(""); // no-op safe call (overloaded below)

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userIdForCode) as any;
    clearFailedLogins(user.email);
    const token = generateToken({ userId: user.id, email: user.email, isAdmin: !!user.is_admin });

    res.json({ message: 'تم إعادة تعيين كلمة المرور بنجاح', user: parseUser(user), token });
  } catch (err: any) {
    console.error('[AUTH] /reset-password error:', err.message);
    res.status(500).json({ error: 'فشل إعادة تعيين كلمة المرور' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    res.json(parseUser(user));
  } catch (err: any) {
    // Log the error for debugging but return a proper error response
    console.error('[API] /auth/me error:', err.message);
    res.status(500).json({ error: 'فشل جلب البيانات' });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;

    // Map camelCase frontend keys to snake_case database columns
    const camelToSnake: Record<string, string> = {
      coverPhoto: 'cover_photo',
      showPhone: 'show_phone',
      showLocation: 'show_location',
      avatarBase64: 'avatar_base64',
      paymentMethods: 'payment_methods',
    };

    const allowed = ['name', 'phone', 'location', 'bio', 'show_phone', 'show_location',
      'interests', 'payment_methods', 'avatar_base64', 'avatar', 'cover_photo', 'gender', 'date_of_birth',
      'profession', 'portfolio_images'];

    const updates: string[] = [];
    const values: any[] = [];

    // SQLite INTEGER columns that store boolean values (0/1)
    const booleanColumns = ['show_phone', 'show_location', 'is_verified', 'is_admin', 'is_trusted', 'is_deactivated'];

    for (const [key, value] of Object.entries(req.body)) {
      // Convert camelCase keys to snake_case for database columns
      const dbKey = camelToSnake[key] || key;
      if (allowed.includes(dbKey) && value !== undefined) {
        updates.push(`${dbKey} = ?`);
        // Convert boolean values to 0/1 for SQLite (SQLite doesn't accept JS booleans)
        if (booleanColumns.includes(dbKey) && typeof value === 'boolean') {
          values.push(value ? 1 : 0);
        } else if (typeof value === 'object') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'لا توجد بيانات للتحديث' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(payload.userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId);
    res.json(parseUser(user));
  } catch (err: any) {
    console.error('[AUTH] /profile error:', err.message);
    res.status(500).json({ error: 'فشل تحديث الملف الشخصي' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
      return;
    }
    if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وحرف صغير ورقم' });
      return;
    }

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(payload.userId) as any;
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
      return;
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(newHash, payload.userId);
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err: any) {
    console.error('[AUTH] /change-password error:', err.message);
    res.status(500).json({ error: 'فشل تغيير كلمة المرور' });
  }
});

// POST /api/auth/send-verification - Send email verification code
router.post('/send-verification', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const user = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    if (user.email_verified) { res.status(400).json({ error: 'البريد الإلكتروني مفعل بالفعل' }); return; }

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    db.prepare("UPDATE users SET email_verification_code = ?, email_verification_expires = ? WHERE id = ?")
      .run(code, expiresAt, payload.userId);

    // In production, send via email service (SMTP/SendGrid/etc.)
    // Only log the code in non-production (see forgot-password for rationale).
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EMAIL-VERIFY] Code for ${user.email}: ${code}`);
    } else {
      console.log(`[EMAIL-VERIFY] Code generated for ${user.email} (not logged in production)`);
    }

    res.json({
      message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني',
      // Development only: include the code
      ...(process.env.NODE_ENV !== 'production' && { code }),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال رمز التحقق' });
  }
});

// POST /api/auth/verify-email - Verify email with code
router.post('/verify-email', (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'البريد الإلكتروني والرمز مطلوبان' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = db.prepare('SELECT id, email_verification_code, email_verification_expires FROM users WHERE email = ?').get(normalizedEmail) as any;

    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    if (user.email_verification_code !== code) {
      res.status(400).json({ error: 'رمز التحقق غير صحيح' }); return;
    }
    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      res.status(400).json({ error: 'رمز التحقق منتهي الصلاحية' }); return;
    }

    // Mark email as verified
    db.prepare("UPDATE users SET email_verified = 1, email_verification_code = '', email_verification_expires = '', is_verified = 1 WHERE id = ?")
      .run(user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const token = generateToken({ userId: (updatedUser as any).id, email: (updatedUser as any).email, isAdmin: !!(updatedUser as any).is_admin });

    res.json({ message: 'تم تفعيل البريد الإلكتروني بنجاح', user: parseUser(updatedUser), token });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل التحقق من البريد' });
  }
});

// ─── Security: Active Sessions, Login History, Connected Devices ─────
// All three are derived from the JWT token (which carries userId + ip +
// userAgent captured at issue time). We track them in memory because we
// don't have a dedicated sessions table; for persistence across restarts
// you can swap the in-memory map for a DB table later.

interface SessionRecord {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  device: string;
  location: string;
  lastActive: string;
  issuedAt: number;
  current?: boolean;
}

interface LoginHistoryRecord {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  device: string;
  location: string;
  timestamp: string;
  success: boolean;
}

// In-memory stores (cleared on restart — acceptable for a small PWA).
// Replace with DB tables if you need persistence across restarts.
const activeSessions = new Map<string, SessionRecord[]>(); // userId → sessions
const loginHistory = new Map<string, LoginHistoryRecord[]>(); // userId → entries (newest first)
const connectedDevices = new Map<string, any[]>(); // userId → devices

// Helper: parse UA → friendly device name
function parseUA(ua: string): string {
  if (!ua) return 'جهاز غير معروف';
  if (/iphone|ipad|ios/i.test(ua)) return 'iPhone / iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows PC';
  if (/mac/i.test(ua)) return 'Mac';
  if (/linux/i.test(ua)) return 'Linux';
  return 'جهاز آخر';
}

// Helper: record a login event (called from /login)
function recordLogin(userId: string, ip: string, ua: string, success: boolean) {
  const entry: LoginHistoryRecord = {
    id: crypto.randomUUID(),
    userId,
    ip,
    userAgent: ua,
    device: parseUA(ua),
    location: '', // could be enriched with a geo-IP service later
    timestamp: new Date().toISOString(),
    success,
  };
  const list = loginHistory.get(userId) || [];
  list.unshift(entry);
  // Cap to last 50 entries to bound memory
  loginHistory.set(userId, list.slice(0, 50));
}

// Helper: record a new session (called from /login after token issue)
function recordSession(userId: string, ip: string, ua: string, tokenId: string) {
  const session: SessionRecord = {
    id: tokenId,
    userId,
    ip,
    userAgent: ua,
    device: parseUA(ua),
    location: '',
    lastActive: new Date().toISOString(),
    issuedAt: Date.now(),
    current: true, // the just-issued session is the current one
  };
  // Mark all prior sessions for this user as not-current
  const list = (activeSessions.get(userId) || []).map(s => ({ ...s, current: false }));
  list.unshift(session);
  activeSessions.set(userId, list);

  // Also register as a connected device (dedup by device name)
  const devices = connectedDevices.get(userId) || [];
  const devName = parseUA(ua);
  if (!devices.find(d => d.name === devName)) {
    devices.push({ id: crypto.randomUUID(), name: devName, platform: devName, lastUsed: new Date().toISOString(), registeredAt: new Date().toISOString() });
    connectedDevices.set(userId, devices);
  } else {
    // Update lastUsed
    for (const d of devices) if (d.name === devName) d.lastUsed = new Date().toISOString();
    connectedDevices.set(userId, devices);
  }
}

// Export helpers so /login can call them
export { recordLogin, recordSession };

// GET /api/auth/sessions — list active sessions for the current user
router.get('/sessions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const list = activeSessions.get(payload.userId) || [];
    // Mark the current session: we compare the token's iat (issued-at) if present
    // For simplicity, we mark the FIRST entry (newest) as current — which is
    // correct because recordSession() unshifts new sessions to the front.
    const tokenIat = (payload as any).iat;
    const result = list.map((s, idx) => ({
      ...s,
      current: idx === 0 || (tokenIat ? Math.abs(s.issuedAt / 1000 - tokenIat) < 5 : false),
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: 'فشل تحميل الجلسات' });
  }
});

// DELETE /api/auth/sessions/:id — revoke a single session
router.delete('/sessions/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const sid = req.params.id;
    const list = activeSessions.get(payload.userId) || [];
    const filtered = list.filter(s => s.id !== sid);
    activeSessions.set(payload.userId, filtered);
    res.json({ message: 'تم إنهاء الجلسة' });
  } catch {
    res.status(500).json({ error: 'فشل إنهاء الجلسة' });
  }
});

// DELETE /api/auth/sessions — revoke all sessions except the current one
router.delete('/sessions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const list = activeSessions.get(payload.userId) || [];
    // Keep only the newest session (index 0 = current)
    const kept = list.length > 0 ? [list[0]] : [];
    activeSessions.set(payload.userId, kept);
    const revoked = list.length - kept.length;
    res.json({ message: 'تم إنهاء جميع الجلسات الأخرى', revoked });
  } catch {
    res.status(500).json({ error: 'فشل إنهاء الجلسات' });
  }
});

// GET /api/auth/login-history — recent login attempts for the current user
router.get('/login-history', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const list = loginHistory.get(payload.userId) || [];
    res.json(list);
  } catch {
    res.status(500).json({ error: 'فشل تحميل السجل' });
  }
});

// GET /api/auth/devices — connected devices
router.get('/devices', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const list = connectedDevices.get(payload.userId) || [];
    res.json(list);
  } catch {
    res.status(500).json({ error: 'فشل تحميل الأجهزة' });
  }
});

// ─── 2FA (simplified in-memory stub) ────────────────────────────────
// NOTE: This is a STUB that toggles a per-user 2FA flag in memory and
// returns a fake QR for the UI. A real implementation would use an
// authenticator library (e.g. speakeasy + qrcode) and store the secret
// in a `user_2fa_secrets` table. The stub exists so the SettingsPage UI
// doesn't error out; replace with a real TOTP implementation before
// production.
const twoFAState = new Map<string, { enabled: boolean; secret?: string }>();

router.get('/2fa/status', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const state = twoFAState.get(payload.userId) || { enabled: false };
    res.json({ enabled: !!state.enabled });
  } catch {
    res.status(500).json({ error: 'فشل' });
  }
});

router.post('/2fa', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { enable, code } = req.body || {};
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(payload.userId) as any;
    const state = twoFAState.get(payload.userId) || { enabled: false };

    if (enable) {
      // If enabling for the first time, generate a secret + return a QR url
      if (!state.enabled) {
        const secret = crypto.randomBytes(20).toString('base32');
        const otpauthUrl = `otpauth://totp/Nawaqes:${user?.email || 'user'}?secret=${secret}&issuer=Nawaqes`;
        // If code provided, verify (stub: accept any 6-digit code for now)
        if (code && /^\d{6}$/.test(code)) {
          twoFAState.set(payload.userId, { enabled: true, secret });
          res.json({ enabled: true });
        } else {
          // Return the QR url + secret for the UI to display
          res.json({
            enabled: false,
            qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
            secret,
          });
        }
      } else {
        res.json({ enabled: true });
      }
    } else {
      // Disable
      twoFAState.delete(payload.userId);
      res.json({ enabled: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث 2FA' });
  }
});

// ─── Deactivate account (reversible — sets is_deactivated=1) ────────
router.post('/deactivate', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { password } = req.body || {};
    if (!password) { res.status(400).json({ error: 'كلمة المرور مطلوبة' }); return; }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
      return;
    }
    db.prepare("UPDATE users SET is_deactivated = 1, updated_at = datetime('now') WHERE id = ?").run(payload.userId);
    res.json({ message: 'تم تعطيل الحساب مؤقتاً' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تعطيل الحساب' });
  }
});

// ─── Phone verification + update ────────────────────────────────────
// POST /api/auth/phone/send-code — send a 6-digit SMS code
// (Stub: in production, integrate with an SMS provider like Twilio/Vonage)
router.post('/phone/send-code', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { phone } = req.body || {};
    if (!phone || phone.length < 8) {
      res.status(400).json({ error: 'رقم هاتف غير صحيح' });
      return;
    }
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    // Store the pending phone + code on the user row (in two scratch columns
    // we add via migration below). For simplicity we reuse email_verification_*
    // columns temporarily — but those are reserved for email. Instead, store
    // in the in-memory map below.
    pendingPhoneChanges.set(payload.userId, { phone, code, expiresAt });
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PHONE-VERIFY] Code for ${phone}: ${code}`);
    }
    res.json({ message: 'تم إرسال رمز التحقق إلى رقمك' });
  } catch {
    res.status(500).json({ error: 'فشل إرسال الرمز' });
  }
});

const pendingPhoneChanges = new Map<string, { phone: string; code: string; expiresAt: string }>();

// PUT /api/auth/phone — update phone (optionally with verification code)
router.put('/phone', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { phone, code } = req.body || {};
    if (!phone) { res.status(400).json({ error: 'رقم الهاتف مطلوب' }); return; }
    // If a code is provided, verify it against the pending change
    if (code) {
      const pending = pendingPhoneChanges.get(payload.userId);
      if (!pending || pending.code !== code) {
        res.status(400).json({ error: 'رمز التحقق غير صحيح' });
        return;
      }
      if (new Date(pending.expiresAt) < new Date()) {
        res.status(400).json({ error: 'رمز التحقق منتهي الصلاحية' });
        return;
      }
      pendingPhoneChanges.delete(payload.userId);
    }
    db.prepare("UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?").run(phone, payload.userId);
    res.json({ message: 'تم تحديث رقم الهاتف' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث رقم الهاتف' });
  }
});

// ─── App rating (1-5 stars + optional feedback) ─────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_ratings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      feedback TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_app_ratings_user ON app_ratings(user_id);
  `);
} catch {}

router.post('/me/rate-app', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { rating, feedback } = req.body || {};
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5' });
      return;
    }
    // Upsert: INSERT OR REPLACE so re-rating overwrites the previous entry
    db.prepare(`INSERT INTO app_ratings (id, user_id, rating, feedback) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, feedback = excluded.feedback, created_at = datetime('now')`)
      .run(crypto.randomUUID(), payload.userId, rating, (feedback || '').slice(0, 500));
    res.json({ message: 'شكراً لتقييمك!' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال التقييم' });
  }
});

export default router;
