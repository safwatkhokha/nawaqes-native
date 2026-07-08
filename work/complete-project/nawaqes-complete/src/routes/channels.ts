// ─── Channel Routes (Telegram-like broadcast channels) ────────────
//
// Endpoints:
//   POST   /api/channels                — create a new channel
//   GET    /api/channels                — list public channels (paginated)
//   GET    /api/channels/search?q=      — search channels by name/handle
//   GET    /api/channels/:id            — get channel details
//   PATCH  /api/channels/:id            — update channel (owner/admin only)
//   DELETE /api/channels/:id            — delete channel (owner only)
//   POST   /api/channels/:id/subscribe    — subscribe to channel
//   DELETE /api/channels/:id/subscribe    — unsubscribe from channel
//   GET    /api/channels/mine            — channels owned by current user
//   GET    /api/channels/subscribed      — channels the user subscribed to
//
//   POST   /api/channels/:id/posts      — create a post (owner/admin only)
//   GET    /api/channels/:id/posts      — list posts in channel
//   PATCH  /api/channels/posts/:postId    — edit post (author only)
//   DELETE /api/channels/posts/:postId    — delete post (author/owner/admin)
//   POST   /api/channels/posts/:postId/view      — record a view
//   POST   /api/channels/posts/:postId/react     — toggle reaction
//   POST   /api/channels/posts/:postId/comments  — add comment
//   GET    /api/channels/posts/:postId/comments  — list comments
//   POST   /api/channels/posts/:postId/pin       — pin/unpin post (owner/admin)

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import db from '../database/index.js';
import { authMiddleware, optionalAuth, JwtPayload } from '../middleware/auth.js';
import { wsManager } from '../websocket/index.js';
import { createEventBackup } from '../database/backup-system.js';
import { sendPushToUsers } from '../services/pushNotifications.js';

const router = Router();

// ─── File upload setup (for channel avatar + post media) ──────────
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const uploadsDir = path.resolve('uploads', 'channels');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // 🔧 FIX: expanded extension list — previously .mov (iPhone) and .avi
    // were silently rejected because the safeExt list didn't include them,
    // so the file was saved with no extension and the browser couldn't
    // play it. Now we accept all common video formats.
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.3gp'].includes(ext) ? ext : '';
    cb(null, `ch_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  },
});
const upload = multer({
  storage,
  // 🔧 FIX: raised from 50MB to 100MB — videos are typically much larger
  // than images, and 50MB was too small for anything beyond a few seconds
  // of 720p footage. 100MB covers most short-form videos.
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 🔧 FIX: expanded mimetype list — iPhone records as 'video/quicktime'
    // (.mov), Android sometimes sends 'video/3gpp', and some browsers send
    // 'video/x-m4v' for .m4v files. Previously these were rejected with a
    // generic "نوع الملف غير مدعوم" error, which is why users couldn't
    // upload videos from their phones.
    const allowed = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // Videos — expanded to cover iPhone, Android, and common formats
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/x-m4v', 'video/3gpp',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Include the rejected mimetype in the error so the user can see
      // exactly what was rejected (helps with debugging on mobile).
      cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}. الأنواع المدعومة: صور (jpg/png/gif/webp) أو فيديو (mp4/webm/mov/avi/mkv/m4v/3gp)`));
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────
function generateHandle(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '')
    .slice(0, 20) || 'channel';
  let handle = base;
  let suffix = 1;
  while (db.prepare('SELECT id FROM channels WHERE handle = ?').get(handle)) {
    handle = `${base}${suffix++}`;
  }
  return handle;
}

function isChannelAdmin(channelId: string, userId: string): boolean {
  const sub = db.prepare('SELECT role FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, userId) as { role: string } | undefined;
  return sub?.role === 'owner' || sub?.role === 'admin';
}

function isChannelOwner(channelId: string, userId: string): boolean {
  const sub = db.prepare('SELECT role FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, userId) as { role: string } | undefined;
  return sub?.role === 'owner';
}

function enrichChannel(channel: any, currentUserId?: string) {
  if (!channel) return null;
  const result: any = {
    ...channel,
    is_public: !!channel.is_public,
    is_verified: !!channel.is_verified,
    allow_comments: !!channel.allow_comments,
    allow_reactions: !!channel.allow_reactions,
  };
  if (currentUserId) {
    const sub = db.prepare('SELECT role, muted, notification_level, muted_until, auto_load_media FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channel.id, currentUserId) as any;
    result.is_subscribed = !!sub;
    result.role = sub?.role || null;
    result.is_muted = !!sub?.muted;
    result.is_owner = sub?.role === 'owner';
    result.is_admin = sub?.role === 'owner' || sub?.role === 'admin';
    // 🔔 Subscriber settings (returned so the ChannelSettingsModal can
    // pre-fill the current state)
    result.notification_level = sub?.notification_level || 'all';
    result.muted_until = sub?.muted_until || null;
    result.auto_load_media = sub?.auto_load_media === undefined ? true : !!sub.auto_load_media;
    // Check if the user has blocked this channel (separate table — a blocked
    // channel has no subscriber row, so we look it up regardless of sub state)
    const block = db.prepare('SELECT 1 FROM channel_blocks WHERE channel_id = ? AND user_id = ?').get(channel.id, currentUserId) as any;
    result.is_blocked = !!block;
  } else {
    result.notification_level = 'all';
    result.muted_until = null;
    result.auto_load_media = true;
    result.is_blocked = false;
  }
  // Get owner info
  const owner = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(channel.owner_id) as any;
  result.owner_name = owner?.name || '';
  result.owner_avatar = owner?.avatar || '';
  // TikTok-style LIVE badge — true if channel has an active stream
  const liveStream = db.prepare("SELECT id, viewer_count, title, started_at FROM channel_livestreams WHERE channel_id = ? AND status = 'live' LIMIT 1").get(channel.id) as any;
  result.is_live = !!liveStream;
  if (liveStream) {
    result.live_stream = {
      id: liveStream.id,
      viewer_count: liveStream.viewer_count || 0,
      title: liveStream.title || '',
      started_at: liveStream.started_at,
    };
  } else {
    result.live_stream = null;
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════
// CHANNELS CRUD
// ══════════════════════════════════════════════════════════════════

// POST /api/channels — create channel
router.post('/', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { name, description, handle, is_public, allow_comments, allow_reactions, category } = req.body;

    if (!name || name.trim().length < 3) {
      res.status(400).json({ error: 'اسم القناة يجب أن يكون 3 أحرف على الأقل' });
      return;
    }
    if (name.trim().length > 100) {
      res.status(400).json({ error: 'اسم القناة طويل جدًا (الحد 100 حرف)' });
      return;
    }

    // Generate or validate handle
    let finalHandle = handle?.trim().toLowerCase().replace(/^@/, '');
    if (finalHandle) {
      if (!/^[a-z0-9_]{3,30}$/.test(finalHandle)) {
        res.status(400).json({ error: 'المعرّف يجب أن يكون 3-30 حرف: a-z, 0-9, _' });
        return;
      }
      const exists = db.prepare('SELECT id FROM channels WHERE handle = ?').get(finalHandle);
      if (exists) {
        res.status(409).json({ error: 'هذا المعرّف محجوز، اختر غيره' });
        return;
      }
    } else {
      finalHandle = generateHandle(name);
    }

    const id = crypto.randomBytes(16).toString('hex');
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    const avatar = files.avatar?.[0] ? `/uploads/channels/${files.avatar[0].filename}` : '';
    const coverPhoto = files.cover?.[0] ? `/uploads/channels/${files.cover[0].filename}` : '';

    db.prepare(`
      INSERT INTO channels (id, owner_id, name, handle, description, avatar, cover_photo, is_public, allow_comments, allow_reactions, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, payload.userId, name.trim(), finalHandle,
      (description || '').slice(0, 500),
      avatar,
      coverPhoto,
      is_public === false || is_public === 0 ? 0 : 1,
      allow_comments === false || allow_comments === 0 ? 0 : 1,
      allow_reactions === false || allow_reactions === 0 ? 0 : 1,
      (category || '').slice(0, 50)
    );

    // Owner auto-subscribes with role='owner'
    db.prepare(`
      INSERT INTO channel_subscribers (channel_id, user_id, role)
      VALUES (?, ?, 'owner')
    `).run(id, payload.userId);

    db.prepare('UPDATE channels SET subscriber_count = 1 WHERE id = ?').run(id);

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
    res.status(201).json(enrichChannel(channel, payload.userId));
  } catch (err: any) {
    console.error('[CHANNELS] Create error:', err);
    res.status(500).json({ error: 'فشل إنشاء القناة' });
  }
});

// GET /api/channels — list public channels (paginated)
router.get('/', optionalAuth, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const category = req.query.category as string;

    const sort = (req.query.sort as string) || 'trending';
    let query = 'SELECT * FROM channels WHERE is_public = 1';
    const params: any[] = [];
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    // 🔕 Exclude channels the current user has blocked (so they don't
    // appear in trending/explore after the user blocked them)
    if (payload?.userId) {
      query += ` AND id NOT IN (SELECT channel_id FROM channel_blocks WHERE user_id = ?)`;
      params.push(payload.userId);
    }
    // sort=new → newest first; sort=trending (default) → by subscribers
    if (sort === 'new') {
      query += ' ORDER BY created_at DESC, subscriber_count DESC';
    } else {
      query += ' ORDER BY subscriber_count DESC, created_at DESC';
    }
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const channels = db.prepare(query).all(...params) as any[];
    res.json(channels.map(c => enrichChannel(c, payload?.userId)));
  } catch (err: any) {
    console.error('[CHANNELS] List error:', err);
    res.status(500).json({ error: 'فشل جلب القنوات' });
  }
});

// GET /api/channels/search?q=
router.get('/search', optionalAuth, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload | undefined;
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) { res.json([]); return; }

    const search = `%${q}%`;
    let query = `
      SELECT * FROM channels
      WHERE is_public = 1 AND (name LIKE ? OR handle LIKE ? OR description LIKE ?)
    `;
    const params: any[] = [search, search, search];
    // 🔕 Exclude blocked channels from search results
    if (payload?.userId) {
      query += ` AND id NOT IN (SELECT channel_id FROM channel_blocks WHERE user_id = ?)`;
      params.push(payload.userId);
    }
    query += ` ORDER BY subscriber_count DESC LIMIT 20`;
    const channels = db.prepare(query).all(...params) as any[];

    res.json(channels.map(c => enrichChannel(c, payload?.userId)));
  } catch (err: any) {
    console.error('[CHANNELS] Search error:', err);
    res.status(500).json({ error: 'فشل البحث' });
  }
});

// GET /api/channels/mine — channels owned by current user
router.get('/mine', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channels = db.prepare(`
      SELECT c.* FROM channels c
      JOIN channel_subscribers cs ON c.id = cs.channel_id
      WHERE cs.user_id = ? AND cs.role IN ('owner', 'admin')
      ORDER BY c.created_at DESC
    `).all(payload.userId) as any[];
    res.json(channels.map(c => enrichChannel(c, payload.userId)));
  } catch (err: any) {
    console.error('[CHANNELS] Mine error:', err);
    res.status(500).json({ error: 'فشل جلب قنواتي' });
  }
});

// GET /api/channels/subscribed — channels user is subscribed to
router.get('/subscribed', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channels = db.prepare(`
      SELECT c.* FROM channels c
      JOIN channel_subscribers cs ON c.id = cs.channel_id
      WHERE cs.user_id = ?
      ORDER BY cs.joined_at DESC
    `).all(payload.userId) as any[];
    res.json(channels.map(c => enrichChannel(c, payload.userId)));
  } catch (err: any) {
    console.error('[CHANNELS] Subscribed error:', err);
    res.status(500).json({ error: 'فشل جلب الاشتراكات' });
  }
});

// GET /api/channels/:id — channel details
router.get('/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload | undefined;
    const channel = db.prepare('SELECT * FROM channels WHERE id = ? OR handle = ?')
      .get(req.params.id, req.params.id.replace(/^@/, '')) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }

    // If channel is private, only subscribers can view
    if (!channel.is_public && payload) {
      const sub = db.prepare('SELECT 1 FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channel.id, payload.userId);
      if (!sub) { res.status(403).json({ error: 'هذه القناة خاصة' }); return; }
    } else if (!channel.is_public && !payload) {
      res.status(401).json({ error: 'يجب تسجيل الدخول' });
      return;
    }

    res.json(enrichChannel(channel, payload?.userId));
  } catch (err: any) {
    console.error('[CHANNELS] Get error:', err);
    res.status(500).json({ error: 'فشل جلب القناة' });
  }
});

// PATCH /api/channels/:id — update channel (owner/admin only)
router.patch('/:id', authMiddleware, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    if (!isChannelAdmin(channelId, payload.userId)) {
      res.status(403).json({ error: 'صلاحيات غير كافية' });
      return;
    }

    const allowed = ['name', 'description', 'is_public', 'allow_comments', 'allow_reactions', 'category'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] }) || {};
    if (files.avatar?.[0]) {
      updates.push('avatar = ?');
      values.push(`/uploads/channels/${files.avatar[0].filename}`);
    }
    if (files.cover?.[0]) {
      updates.push('cover_photo = ?');
      values.push(`/uploads/channels/${files.cover[0].filename}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'لا توجد حقول للتحديث' });
      return;
    }
    updates.push("updated_at = datetime('now')");
    values.push(channelId);

    db.prepare(`UPDATE channels SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    res.json(enrichChannel(channel, payload.userId));
  } catch (err: any) {
    console.error('[CHANNELS] Update error:', err);
    res.status(500).json({ error: 'فشل تحديث القناة' });
  }
});

// DELETE /api/channels/:id — delete channel (owner only)
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    if (!isChannelOwner(channelId, payload.userId)) {
      res.status(403).json({ error: 'فقط مالك القناة يمكنه حذفها' });
      return;
    }

    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
    res.json({ success: true, message: 'تم حذف القناة' });
  } catch (err: any) {
    console.error('[CHANNELS] Delete error:', err);
    res.status(500).json({ error: 'فشل حذف القناة' });
  }
});

// ══════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════════

// POST /api/channels/:id/subscribe
router.post('/:id/subscribe', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    const channel = db.prepare('SELECT id, is_public FROM channels WHERE id = ?').get(channelId) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }
    if (!channel.is_public) { res.status(403).json({ error: 'هذه القناة خاصة - تحتاج دعوة' }); return; }

    const existing = db.prepare('SELECT 1 FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, payload.userId);
    if (existing) { res.json({ success: true, already_subscribed: true }); return; }

    db.prepare(`
      INSERT INTO channel_subscribers (channel_id, user_id, role)
      VALUES (?, ?, 'subscriber')
    `).run(channelId, payload.userId);

    db.prepare('UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = ?').run(channelId);

    res.json({ success: true, subscribed: true });
  } catch (err: any) {
    console.error('[CHANNELS] Subscribe error:', err);
    res.status(500).json({ error: 'فشل الاشتراك' });
  }
});

// DELETE /api/channels/:id/subscribe — unsubscribe
router.delete('/:id/subscribe', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    // Owner cannot unsubscribe from own channel
    if (isChannelOwner(channelId, payload.userId)) {
      res.status(400).json({ error: 'لا يمكن إلغاء اشتراكك من قناتك' });
      return;
    }

    const result = db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').run(channelId, payload.userId);
    if (result.changes > 0) {
      db.prepare('UPDATE channels SET subscriber_count = MAX(subscriber_count - 1, 0) WHERE id = ?').run(channelId);
    }
    res.json({ success: true, unsubscribed: true });
  } catch (err: any) {
    console.error('[CHANNELS] Unsubscribe error:', err);
    res.status(500).json({ error: 'فشل إلغاء الاشتراك' });
  }
});

// ══════════════════════════════════════════════════════════════════
// SUBSCRIBER SETTINGS — per-user preferences for a channel
// (notification level, mute duration, auto-load media, block, report)
// ══════════════════════════════════════════════════════════════════

// PATCH /api/channels/:id/subscriber-settings — update the caller's
// per-channel preferences. Caller must be a subscriber (we auto-subscribe
// them if they aren't, to make the UI flow smoother — toggling
// "notification level" on a channel you haven't joined yet would otherwise
// be a confusing "you're not subscribed" error).
router.patch('/:id/subscriber-settings', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const { notification_level, muted_until, auto_load_media } = req.body || {};

    // Validate notification_level if provided
    const validLevels = ['all', 'live_only', 'important', 'none'];
    if (notification_level !== undefined && !validLevels.includes(notification_level)) {
      res.status(400).json({ error: 'مستوى إشعارات غير صالح' });
      return;
    }

    // Validate muted_until if provided (ISO string or null)
    let mutedUntilValue: string | null = null;
    if (muted_until !== undefined) {
      if (muted_until === null) {
        mutedUntilValue = null;
      } else if (typeof muted_until === 'string') {
        const d = new Date(muted_until);
        if (isNaN(d.getTime())) {
          res.status(400).json({ error: 'صيغة وقت الكتم غير صالحة' });
          return;
        }
        mutedUntilValue = d.toISOString();
      } else {
        res.status(400).json({ error: 'muted_until يجب أن يكون تاريخ أو null' });
        return;
      }
    }

    // Build the SET clause dynamically
    const setClauses: string[] = [];
    const values: any[] = [];
    if (notification_level !== undefined) {
      setClauses.push('notification_level = ?');
      values.push(notification_level);
    }
    if (muted_until !== undefined) {
      setClauses.push('muted_until = ?');
      values.push(mutedUntilValue);
      // Also flip the legacy `muted` boolean so any old code that reads it
      // still works correctly.
      setClauses.push('muted = ?');
      values.push(mutedUntilValue ? 1 : 0);
    }
    if (auto_load_media !== undefined) {
      setClauses.push('auto_load_media = ?');
      values.push(auto_load_media ? 1 : 0);
    }
    if (setClauses.length === 0) {
      res.status(400).json({ error: 'لا توجد حقول للتحديث' });
      return;
    }

    // Ensure the user is a subscriber (auto-subscribe if not — see comment above)
    const sub = db.prepare('SELECT id FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, payload.userId) as any;
    if (!sub) {
      // Auto-subscribe with default settings, then apply the requested changes
      const subId = crypto.randomBytes(16).toString('hex');
      db.prepare(`INSERT INTO channel_subscribers (id, channel_id, user_id, role, muted, notification_level, muted_until, auto_load_media)
        VALUES (?, ?, ?, 'subscriber', 0, ?, ?, ?)`)
        .run(
          subId, channelId, payload.userId,
          notification_level || 'all',
          mutedUntilValue,
          auto_load_media === undefined ? 1 : (auto_load_media ? 1 : 0)
        );
      db.prepare('UPDATE channels SET subscriber_count = subscriber_count + 1 WHERE id = ?').run(channelId);
    } else {
      values.push(channelId, payload.userId);
      db.prepare(`UPDATE channel_subscribers SET ${setClauses.join(', ')} WHERE channel_id = ? AND user_id = ?`).run(...values);
    }

    res.json({
      success: true,
      notification_level: notification_level || sub?.notification_level || 'all',
      muted_until: mutedUntilValue,
      auto_load_media: auto_load_media === undefined ? true : !!auto_load_media,
    });
  } catch (err: any) {
    console.error('[CHANNELS] Update subscriber settings error:', err);
    res.status(500).json({ error: 'فشل تحديث الإعدادات' });
  }
});

// POST /api/channels/:id/block — block a channel (won't appear in
// suggestions/search; also unsubscribes if currently subscribed)
router.post('/:id/block', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    // Can't block your own channel
    if (isChannelOwner(channelId, payload.userId)) {
      res.status(400).json({ error: 'لا يمكن حظر قناتك' });
      return;
    }

    // Insert (ignore duplicates — UNIQUE constraint)
    db.prepare('INSERT OR IGNORE INTO channel_blocks (channel_id, user_id) VALUES (?, ?)').run(channelId, payload.userId);

    // Also unsubscribe if currently subscribed
    const result = db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').run(channelId, payload.userId);
    if (result.changes > 0) {
      db.prepare('UPDATE channels SET subscriber_count = MAX(subscriber_count - 1, 0) WHERE id = ?').run(channelId);
    }

    res.json({ success: true, blocked: true });
  } catch (err: any) {
    console.error('[CHANNELS] Block error:', err);
    res.status(500).json({ error: 'فشل حظر القناة' });
  }
});

// DELETE /api/channels/:id/block — unblock a channel
router.delete('/:id/block', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('DELETE FROM channel_blocks WHERE channel_id = ? AND user_id = ?').run(req.params.id, payload.userId);
    res.json({ success: true, blocked: false });
  } catch (err: any) {
    console.error('[CHANNELS] Unblock error:', err);
    res.status(500).json({ error: 'فشل إلغاء الحظر' });
  }
});

// POST /api/channels/:id/report — report a channel (spam/abuse/scam/etc.)
router.post('/:id/report', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const { reason, details } = req.body || {};

    const validReasons = ['spam', 'abuse', 'scam', 'copyright', 'illegal', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      res.status(400).json({ error: 'السبب غير صالح' });
      return;
    }

    // INSERT OR IGNORE — one report per user per channel (UNIQUE constraint)
    const result = db.prepare(`INSERT OR IGNORE INTO channel_reports (channel_id, reporter_id, reason, details)
      VALUES (?, ?, ?, ?)`).run(channelId, payload.userId, reason, (details || '').slice(0, 500));

    if (result.changes === 0) {
      res.status(409).json({ error: 'لقد أبلغت عن هذه القناة من قبل' });
      return;
    }

    res.json({ success: true, message: 'تم استلام بلاغك — شكراً لمساعدتنا في الحفاظ على المجتمع' });
  } catch (err: any) {
    console.error('[CHANNELS] Report error:', err);
    res.status(500).json({ error: 'فشل إرسال البلاغ' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POSTS
// ══════════════════════════════════════════════════════════════════

// POST /api/channels/:id/posts — create post (owner/admin only)
router.post('/:id/posts', authMiddleware, upload.single('media'), (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;

    if (!isChannelAdmin(channelId, payload.userId)) {
      res.status(403).json({ error: 'فقط المشرفون يمكنهم النشر' });
      return;
    }

    const { content, media_type, media_caption, link_url, link_title, link_description, link_image } = req.body;
    if (!content && !req.file && !link_url) {
      res.status(400).json({ error: 'المحتوى فارغ' });
      return;
    }

    const id = crypto.randomBytes(16).toString('hex');
    const finalMediaType = req.file
      ? (req.file.mimetype.startsWith('video/') ? 'video' : 'image')
      : (link_url ? 'link' : 'text');
    const mediaUrl = req.file ? `/uploads/channels/${req.file.filename}` : '';

    db.prepare(`
      INSERT INTO channel_posts (id, channel_id, author_id, content, media_type, media_url, media_caption, link_url, link_title, link_description, link_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, channelId, payload.userId,
      (content || '').slice(0, 4000),
      finalMediaType, mediaUrl,
      (media_caption || '').slice(0, 500),
      (link_url || '').slice(0, 500),
      (link_title || '').slice(0, 200),
      (link_description || '').slice(0, 500),
      (link_image || '').slice(0, 500)
    );

    db.prepare('UPDATE channels SET post_count = post_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(channelId);

    const post = db.prepare(`
      SELECT p.*, u.name as author_name, u.avatar as author_avatar
      FROM channel_posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.id = ?
    `).get(id) as any;

    // Notify subscribers via WebSocket
    try {
      // 🔔 Filter out subscribers who have muted the channel or set
      // notification_level to 'none'. They still see the post when they
      // visit the channel, but they don't get a push notification.
      // Subscribers with 'live_only' are also excluded from POST
      // notifications (they only want livestream alerts).
      const subscribers = db.prepare(`
        SELECT user_id, notification_level, muted_until
        FROM channel_subscribers
        WHERE channel_id = ? AND user_id != ?
      `).all(channelId, payload.userId) as any[];

      const now = new Date().toISOString();
      // WS recipients: everyone except 'none' (so they see it in real-time
      // if they're on the channel page). Actually, even 'none' users should
      // see the post appear in real-time if they're viewing the channel —
      // the setting only affects PUSH notifications, not the WS feed.
      const wsRecipientIds = new Set<string>(subscribers.map(s => s.user_id));
      wsManager.broadcastToUsers(wsRecipientIds, {
        type: 'channel:post',
        data: {
          channel_id: channelId,
          post: { ...post, is_pinned: !!post.is_pinned },
        },
      });

      // PUSH recipients: only those whose notification_level includes posts
      // ('all' or 'important') AND who aren't currently muted.
      // 'live_only' and 'none' subscribers don't get a push for posts.
      const pushRecipientIds = subscribers
        .filter(s => {
          const level = s.notification_level || 'all';
          if (level === 'none' || level === 'live_only') return false;
          // Check mute
          if (s.muted_until && new Date(s.muted_until) > new Date(now)) return false;
          return true;
        })
        .map(s => s.user_id);

      if (pushRecipientIds.length > 0) {
        const channelInfo = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId) as any;
        const channelName = channelInfo?.name || 'قناة';
        sendPushToUsers(
          pushRecipientIds,
          `📝 ${channelName}`,
          post.content ? post.content.slice(0, 100) : 'منشور جديد',
          { type: 'channel_post', channel_id: channelId, post_id: id, link: `/channels/${channelId}` }
        ).catch(() => {});
      }
    } catch (e) {
      console.warn('[CHANNELS] WS broadcast failed:', e);
    }

    res.status(201).json({ ...post, is_pinned: !!post.is_pinned });
  } catch (err: any) {
    console.error('[CHANNELS] Create post error:', err);
    res.status(500).json({ error: 'فشل نشر المنشور' });
  }
});

// GET /api/channels/:id/posts — list posts
router.get('/:id/posts', optionalAuth, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload | undefined;
    const channelId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const channel = db.prepare('SELECT is_public FROM channels WHERE id = ?').get(channelId) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }
    if (!channel.is_public && !payload) {
      res.status(401).json({ error: 'يجب تسجيل الدخول' });
      return;
    }

    const posts = db.prepare(`
      SELECT p.*, u.name as author_name, u.avatar as author_avatar
      FROM channel_posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.channel_id = ?
      ORDER BY p.is_pinned DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(channelId, limit, offset) as any[];

    // Enrich with current user's reaction + view status
    const enriched = posts.map(p => {
      const result: any = { ...p, is_pinned: !!p.is_pinned };
      if (payload) {
        const reaction = db.prepare('SELECT emoji FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').get(p.id, payload.userId) as any;
        result.my_reaction = reaction?.emoji || null;
        const viewed = db.prepare('SELECT 1 FROM channel_post_views WHERE post_id = ? AND user_id = ?').get(p.id, payload.userId);
        result.has_viewed = !!viewed;
      }
      // Get reaction breakdown (top 5 emojis)
      const reactions = db.prepare(`
        SELECT emoji, COUNT(*) as count FROM channel_post_reactions WHERE post_id = ? GROUP BY emoji ORDER BY count DESC LIMIT 5
      `).all(p.id) as any[];
      result.reactions = reactions;
      return result;
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('[CHANNELS] List posts error:', err);
    res.status(500).json({ error: 'فشل جلب المنشورات' });
  }
});

// DELETE /api/channels/posts/:postId
router.delete('/posts/:postId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const post = db.prepare('SELECT channel_id, author_id FROM channel_posts WHERE id = ?').get(req.params.postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Author OR channel owner/admin can delete
    const canDelete = post.author_id === payload.userId || isChannelAdmin(post.channel_id, payload.userId);
    if (!canDelete) {
      res.status(403).json({ error: 'صلاحيات غير كافية' });
      return;
    }

    db.prepare('DELETE FROM channel_posts WHERE id = ?').run(req.params.postId);
    db.prepare('UPDATE channels SET post_count = MAX(post_count - 1, 0) WHERE id = ?').run(post.channel_id);
    res.json({ success: true, message: 'تم حذف المنشور' });
  } catch (err: any) {
    console.error('[CHANNELS] Delete post error:', err);
    res.status(500).json({ error: 'فشل حذف المنشور' });
  }
});

// POST /api/channels/posts/:postId/view — record a view
router.post('/posts/:postId/view', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const postId = req.params.postId;

    // Insert ignore (UNIQUE constraint on post_id+user_id)
    db.prepare('INSERT OR IGNORE INTO channel_post_views (post_id, user_id) VALUES (?, ?)').run(postId, payload.userId);
    // Always bump views_count (channel admins want to see total views, not unique)
    db.prepare('UPDATE channel_posts SET views_count = views_count + 1 WHERE id = ?').run(postId);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[CHANNELS] View error:', err);
    res.status(500).json({ error: 'فشل تسجيل المشاهدة' });
  }
});

// POST /api/channels/posts/:postId/react — toggle reaction
router.post('/posts/:postId/react', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const postId = req.params.postId;
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
      res.status(400).json({ error: 'الإيموجي غير صالح' });
      return;
    }

    const existing = db.prepare('SELECT emoji FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').get(postId, payload.userId) as any;

    if (existing?.emoji === emoji) {
      // Same emoji → remove
      db.prepare('DELETE FROM channel_post_reactions WHERE post_id = ? AND user_id = ?').run(postId, payload.userId);
      db.prepare('UPDATE channel_posts SET reactions_count = MAX(reactions_count - 1, 0) WHERE id = ?').run(postId);
      res.json({ success: true, action: 'removed' });
    } else if (existing) {
      // Different emoji → update
      db.prepare('UPDATE channel_post_reactions SET emoji = ? WHERE post_id = ? AND user_id = ?').run(emoji, postId, payload.userId);
      res.json({ success: true, action: 'updated', emoji });
    } else {
      // New reaction
      db.prepare('INSERT INTO channel_post_reactions (post_id, user_id, emoji) VALUES (?, ?, ?)').run(postId, payload.userId, emoji);
      db.prepare('UPDATE channel_posts SET reactions_count = reactions_count + 1 WHERE id = ?').run(postId);
      res.json({ success: true, action: 'added', emoji });
    }
  } catch (err: any) {
    console.error('[CHANNELS] React error:', err);
    res.status(500).json({ error: 'فشل التفاعل' });
  }
});

// POST /api/channels/posts/:postId/comments — add comment
router.post('/posts/:postId/comments', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const postId = req.params.postId;
    const { content, parent_id } = req.body;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'التعليق فارغ' });
      return;
    }

    const post = db.prepare('SELECT channel_id, allow_comments FROM channel_posts p JOIN channels c ON p.channel_id = c.id WHERE p.id = ?').get(postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }
    if (!post.allow_comments) { res.status(403).json({ error: 'التعليقات معطلة في هذه القناة' }); return; }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO channel_comments (id, post_id, author_id, content, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, postId, payload.userId, content.trim().slice(0, 1000), parent_id || null);

    db.prepare('UPDATE channel_posts SET comments_count = comments_count + 1 WHERE id = ?').run(postId);

    const comment = db.prepare(`
      SELECT c.*, u.name as author_name, u.avatar as author_avatar
      FROM channel_comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.id = ?
    `).get(id) as any;

    res.status(201).json(comment);
  } catch (err: any) {
    console.error('[CHANNELS] Add comment error:', err);
    res.status(500).json({ error: 'فشل إضافة التعليق' });
  }
});

// GET /api/channels/posts/:postId/comments
router.get('/posts/:postId/comments', optionalAuth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const comments = db.prepare(`
      SELECT c.*, u.name as author_name, u.avatar as author_avatar
      FROM channel_comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
      LIMIT ? OFFSET ?
    `).all(req.params.postId, limit, offset) as any[];

    res.json(comments);
  } catch (err: any) {
    console.error('[CHANNELS] List comments error:', err);
    res.status(500).json({ error: 'فشل جلب التعليقات' });
  }
});

// POST /api/channels/posts/:postId/pin — pin/unpin (owner/admin only)
router.post('/posts/:postId/pin', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const post = db.prepare('SELECT channel_id, is_pinned FROM channel_posts WHERE id = ?').get(req.params.postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    if (!isChannelAdmin(post.channel_id, payload.userId)) {
      res.status(403).json({ error: 'صلاحيات غير كافية' });
      return;
    }

    const newPinned = post.is_pinned ? 0 : 1;
    // Unpin any previously pinned post in this channel (only one pinned at a time)
    if (newPinned === 1) {
      db.prepare('UPDATE channel_posts SET is_pinned = 0 WHERE channel_id = ?').run(post.channel_id);
    }
    db.prepare('UPDATE channel_posts SET is_pinned = ? WHERE id = ?').run(newPinned, req.params.postId);

    res.json({ success: true, is_pinned: !!newPinned });
  } catch (err: any) {
    console.error('[CHANNELS] Pin error:', err);
    res.status(500).json({ error: 'فشل التثبيت' });
  }
});

// ══════════════════════════════════════════════════════════════════
// LIVE STREAMS (channel-only)
// ══════════════════════════════════════════════════════════════════

// POST /api/channels/:id/live/start
router.post('/:id/live/start', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const { title } = req.body;

    if (!isChannelAdmin(channelId, payload.userId)) {
      res.status(403).json({ error: 'فقط المشرفون يمكنهم بدء البث' });
      return;
    }
    const existing = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(channelId);
    if (existing) { res.status(409).json({ error: 'يوجد بث مباشر بالفعل' }); return; }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_livestreams (id, channel_id, host_id, title) VALUES (?, ?, ?, ?)').run(id, channelId, payload.userId, (title || '').slice(0, 200));

    const stream = db.prepare('SELECT s.*, u.name as host_name, u.avatar as host_avatar FROM channel_livestreams s JOIN users u ON s.host_id = u.id WHERE s.id = ?').get(id) as any;

    try {
      // 🔔 Filter subscribers by notification_level for PUSH, but send WS
      // to all subscribers (so they see the LIVE badge appear in real-time).
      // Subscribers with 'none' OR who are currently muted don't get push.
      const subscribers = db.prepare(`
        SELECT user_id, notification_level, muted_until
        FROM channel_subscribers
        WHERE channel_id = ? AND user_id != ?
      `).all(channelId, payload.userId) as any[];
      const now = new Date().toISOString();

      const wsRecipientIds = new Set<string>(subscribers.map(s => s.user_id));
      wsManager.broadcastToUsers(wsRecipientIds, { type: 'channel:live-started', data: { channel_id: channelId, stream_id: id, title: stream.title, host_name: stream.host_name } });

      // PUSH recipients: 'all', 'live_only', and 'important' all want
      // livestream alerts. Only 'none' and muted subscribers are excluded.
      const pushRecipientIds = subscribers
        .filter(s => {
          const level = s.notification_level || 'all';
          if (level === 'none') return false;
          if (s.muted_until && new Date(s.muted_until) > new Date(now)) return false;
          return true;
        })
        .map(s => s.user_id);

      // 🔔 Send PUSH notifications to filtered subscribers
      const channelInfo = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId) as any;
      const channelName = channelInfo?.name || 'قناة';
      const notifTitle = `🔴 بث مباشر الآن: ${channelName}`;
      const notifBody = `${stream.host_name} بدأ بثًا مباشرًا${stream.title ? ` — ${stream.title}` : ''}`;
      if (pushRecipientIds.length > 0) {
        sendPushToUsers(
          pushRecipientIds,
          notifTitle,
          notifBody,
          { type: 'livestream', channel_id: channelId, stream_id: id, link: `/channels/${channelId}` }
        ).catch(() => {});
      }

      // 🔔 Also notify users interested in the channel's category (these
      // are NON-subscribers — they don't have per-channel settings, so we
      // only filter by is_deactivated which is already in the query)
      const channelCat = db.prepare('SELECT category FROM channels WHERE id = ?').get(channelId) as any;
      if (channelCat?.category) {
        const interestedUsers = db.prepare(`
          SELECT DISTINCT u.id FROM users u
          WHERE u.id != ? AND u.is_deactivated = 0
          AND u.interests LIKE ?
        `).all(payload.userId, `%${channelCat.category}%`) as any[];
        if (interestedUsers.length > 0) {
          // Exclude users who have BLOCKED this channel (they shouldn't
          // get notifications about it even via the category path)
          const blockedUserIds = new Set(
            (db.prepare('SELECT user_id FROM channel_blocks WHERE channel_id = ?').all(channelId) as any[]).map(b => b.user_id)
          );
          const interestedIds = interestedUsers
            .map(u => u.id)
            .filter((id: string) => !wsRecipientIds.has(id) && !blockedUserIds.has(id));
          if (interestedIds.length > 0) {
            sendPushToUsers(
              interestedIds,
              `📢 ${channelName} بدأ بثًا مباشرًا`,
              `بث مباشر في مجال يهمك: ${channelCat.category}`,
              { type: 'livestream', channel_id: channelId, stream_id: id, link: `/channels/${channelId}` }
            ).catch(() => {});
          }
        }
      }
    } catch {}

    res.status(201).json(stream);
  } catch (err: any) { res.status(500).json({ error: 'فشل بدء البث' }); }
});

// POST /api/channels/:id/live/end
router.post('/:id/live/end', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const { recording_url, recording_duration } = req.body;

    const stream = db.prepare("SELECT * FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(channelId) as any;
    if (!stream) { res.status(404).json({ error: 'لا يوجد بث مباشر حاليًا' }); return; }
    if (stream.host_id !== payload.userId && !isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'فقط المضيف أو المشرف' }); return; }

    db.prepare("UPDATE channel_livestreams SET status = 'ended', ended_at = datetime('now'), recording_url = ?, recording_duration = ? WHERE id = ?").run(recording_url || '', recording_duration || 0, stream.id);

    if (recording_url) {
      const postId = crypto.randomBytes(16).toString('hex');
      db.prepare("INSERT INTO channel_posts (id, channel_id, author_id, content, media_type, media_url, media_caption) VALUES (?, ?, ?, ?, 'video', ?, ?)").run(postId, channelId, stream.host_id, stream.title || 'بث مباشر مسجل', recording_url, `المدة: ${Math.floor((recording_duration || 0) / 60)} دقيقة`);
      db.prepare('UPDATE channels SET post_count = post_count + 1 WHERE id = ?').run(channelId);
    }

    try {
      const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channelId) as any[];
      const ids = new Set<string>(subscribers.map(s => s.user_id));
      wsManager.broadcastToUsers(ids, { type: 'channel:live-ended', data: { channel_id: channelId, stream_id: stream.id } });
    } catch {}

    // ─── Also terminate the in-memory WS stream (WebRTC P2P) ────────
    // This evicts all viewers immediately and tells their browsers to
    // close the peer connection + show the "stream ended" UI.
    try { wsManager.endChannelStream(stream.id, 'host-ended'); } catch {}

    res.json({ success: true, message: 'تم إنهاء البث' });
  } catch (err: any) { res.status(500).json({ error: 'فشل إنهاء البث' }); }
});

// GET /api/channels/:id/live/current
router.get('/:id/live/current', optionalAuth, (req: Request, res: Response) => {
  try {
    const stream = db.prepare("SELECT s.*, u.name as host_name, u.avatar as host_avatar FROM channel_livestreams s JOIN users u ON s.host_id = u.id WHERE s.channel_id = ? AND s.status = 'live'").get(req.params.id) as any;
    if (!stream) { res.json(null); return; }
    res.json(stream);
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// POST /api/channels/:id/live/:streamId/recording — Attach a recording URL
// to an ALREADY-ENDED stream. Used by the background-upload flow:
//   1. Host clicks "end stream" → stream ends immediately (no recording URL)
//   2. The recording blob uploads in the background (can take 30s-2min)
//   3. When the upload finishes, the client calls THIS endpoint to save
//      the URL on the stream record AND create a replay channel post.
// This decouples "end stream" (which must be instant) from "save recording"
// (which can take a while), so the host isn't blocked waiting for the upload.
router.post('/:id/live/:streamId/recording', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const streamId = req.params.streamId;
    const { recording_url, recording_duration } = req.body;

    if (!recording_url || typeof recording_url !== 'string') {
      res.status(400).json({ error: 'رابط التسجيل مطلوب' });
      return;
    }
    // Validate URL shape (must be a local /uploads/ path)
    if (!recording_url.startsWith('/uploads/') && !recording_url.startsWith('data:')) {
      res.status(400).json({ error: 'صيغة الرابط غير صالحة' });
      return;
    }

    const stream = db.prepare('SELECT * FROM channel_livestreams WHERE id = ? AND channel_id = ?').get(streamId, channelId) as any;
    if (!stream) {
      res.status(404).json({ error: 'البث غير موجود' });
      return;
    }
    // Only the host or channel admin can attach a recording
    if (stream.host_id !== payload.userId && !isChannelAdmin(channelId, payload.userId)) {
      res.status(403).json({ error: 'فقط المضيف أو المشرف' });
      return;
    }

    // Save the recording URL + duration on the stream record
    db.prepare("UPDATE channel_livestreams SET recording_url = ?, recording_duration = ? WHERE id = ?")
      .run(recording_url, recording_duration || 0, streamId);

    // Create a replay channel post (only if one doesn't already exist for
    // this stream — avoids duplicates if the client retries)
    const existing = db.prepare('SELECT id FROM channel_posts WHERE id = ?').get(`replay-${streamId}`) as any;
    if (!existing) {
      const postId = `replay-${streamId}`;
      const durationMin = Math.floor((recording_duration || 0) / 60);
      db.prepare("INSERT INTO channel_posts (id, channel_id, author_id, content, media_type, media_url, media_caption) VALUES (?, ?, ?, ?, 'video', ?, ?)")
        .run(
          postId,
          channelId,
          stream.host_id,
          stream.title || 'بث مباشر مسجل',
          recording_url,
          `المدة: ${durationMin} دقيقة`
        );
      db.prepare('UPDATE channels SET post_count = post_count + 1 WHERE id = ?').run(channelId);
    }

    res.json({ success: true, message: 'تم حفظ التسجيل' });
  } catch (err: any) {
    console.error('[CHANNELS] Attach recording failed:', err);
    res.status(500).json({ error: 'فشل حفظ التسجيل' });
  }
});

// POST /api/channels/:id/live/viewer-join
router.post('/:id/live/viewer-join', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.status(404).json({ error: 'لا يوجد بث حالي' }); return; }

    db.prepare('INSERT OR IGNORE INTO channel_livestream_viewers (stream_id, user_id) VALUES (?, ?)').run(stream.id, payload.userId);
    db.prepare('UPDATE channel_livestreams SET viewer_count = viewer_count + 1, viewer_total = (SELECT COUNT(*) FROM channel_livestream_viewers WHERE stream_id = ?), viewer_peak = MAX(viewer_peak, viewer_count + 1) WHERE id = ?').run(stream.id, stream.id);

    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// POST /api/channels/:id/live/viewer-leave
router.post('/:id/live/viewer-leave', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.json({ success: true }); return; }
    db.prepare("UPDATE channel_livestream_viewers SET left_at = datetime('now') WHERE stream_id = ? AND user_id = ? AND left_at IS NULL").run(stream.id, payload.userId);
    db.prepare('UPDATE channel_livestreams SET viewer_count = MAX(viewer_count - 1, 0) WHERE id = ?').run(stream.id);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// POST /api/channels/:id/live/chat
router.post('/:id/live/chat', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { content } = req.body;
    if (!content?.trim()) { res.status(400).json({ error: 'الرسالة فارغة' }); return; }

    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.status(404).json({ error: 'لا يوجد بث حالي' }); return; }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_livestream_chat (id, stream_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, stream.id, payload.userId, content.trim().slice(0, 500));
    db.prepare('UPDATE channel_livestreams SET chat_count = chat_count + 1 WHERE id = ?').run(stream.id);

    const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;

    try {
      const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(req.params.id) as any[];
      const ids = new Set<string>(subscribers.map(s => s.user_id));
      wsManager.broadcastToUsers(ids, { type: 'channel:live-chat', data: { stream_id: stream.id, channel_id: req.params.id, id, user_id: payload.userId, user_name: user?.name || '', user_avatar: user?.avatar || '', content: content.trim(), created_at: new Date().toISOString() } });
    } catch {}

    res.status(201).json({ id, user_id: payload.userId, user_name: user?.name || '', user_avatar: user?.avatar || '', content: content.trim(), created_at: new Date().toISOString() });
  } catch { res.status(500).json({ error: 'فشل إرسال الرسالة' }); }
});

// GET /api/channels/:id/live/chat
router.get('/:id/live/chat', optionalAuth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.json([]); return; }
    const messages = db.prepare('SELECT c.*, u.name as user_name, u.avatar as user_avatar FROM channel_livestream_chat c JOIN users u ON c.user_id = u.id WHERE c.stream_id = ? ORDER BY c.created_at DESC LIMIT ?').all(stream.id, limit) as any[];
    res.json(messages.reverse());
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// ══════════════════════════════════════════════════════════════════
// CHANNEL INTEGRATIONS: Stories + Promotions + AI cross-posting + Wallet
// ══════════════════════════════════════════════════════════════════

// POST /api/channels/:id/story — create a channel story (stories feed + channel post)
router.post('/:id/story', authMiddleware, upload.single('media'), (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'فقط المشرفون' }); return; }
    const { text } = req.body;
    const imageUrl = req.file ? `/uploads/channels/${req.file.filename}` : '';
    if (!text && !req.file) { res.status(400).json({ error: 'المحتوى فارغ' }); return; }

    // 1. Create story
    const storyId = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO stories (id, user_id, image, type, text, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))')
      .run(storyId, payload.userId, imageUrl, req.file ? 'image' : 'text', text || '');

    // 2. Create channel post
    const postId = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_posts (id, channel_id, author_id, content, media_type, media_url) VALUES (?, ?, ?, ?, ?, ?)')
      .run(postId, channelId, payload.userId, text || '📸 قصة جديدة', req.file ? 'image' : 'text', imageUrl);
    db.prepare('UPDATE channels SET post_count = post_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(channelId);

    try { createEventBackup('channel_story'); } catch {}
    res.status(201).json({ success: true, storyId, postId, message: 'تم نشر القصة في القناة' });
  } catch { res.status(500).json({ error: 'فشل نشر القصة' }); }
});

// POST /api/channels/:id/promote — promote channel in main feed (deducts from wallet)
router.post('/:id/promote', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'فقط المشرفون' }); return; }
    const { budget, tier } = req.body;
    if (!budget || budget <= 0) { res.status(400).json({ error: 'الميزانية مطلوبة' }); return; }

    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user || user.wallet_balance < budget) { res.status(400).json({ error: 'رصيد المحفظة غير كافٍ' }); return; }

    const channel = db.prepare('SELECT name, handle, avatar, subscriber_count FROM channels WHERE id = ?').get(channelId) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }

    const durationDays = tier === 'vip' ? 30 : tier === 'premium' ? 14 : 7;
    db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(budget, payload.userId);

    const postId = crypto.randomBytes(16).toString('hex');
    db.prepare(`INSERT INTO posts (id, author_id, content, type, is_promoted, promotion_tier, promotion_status, promotion_started_at, promotion_expires_at, category) VALUES (?, ?, ?, 'ad', 1, ?, 'active', datetime('now'), datetime('now', '+${durationDays} days'), 'channel')`)
      .run(postId, payload.userId, `📢 قناة جديدة: ${channel.name}\n@${channel.handle}\n${channel.subscriber_count} مشترك`, tier || 'standard');

    db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)').run(
      crypto.randomBytes(16).toString('hex'), payload.userId, 'promotion', -budget, `ترويج قناة: ${channel.name}`, 'completed'
    );
    try { createEventBackup('channel_promotion'); } catch {}

    res.status(201).json({ success: true, postId, message: `تم ترويج القناة لمدة ${durationDays} يوم`, newBalance: user.wallet_balance - budget });
  } catch (err: any) { res.status(500).json({ error: 'فشل الترويج' }); }
});

// GET /api/channels/:id/cross-post — AI suggests channel posts from recent chats
router.get('/:id/cross-post', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }

    const recentMsgs = db.prepare("SELECT text, created_at FROM chat_messages WHERE sender_id = ? AND text IS NOT NULL AND text != '' AND message_type = 'text' AND deleted_for = '' ORDER BY created_at DESC LIMIT 100").all(payload.userId) as any[];
    const suggestions = recentMsgs.filter(m => m.text.length > 30 && !m.text.includes('http')).slice(0, 5).map(m => ({ text: m.text.slice(0, 500), created_at: m.created_at, reason: m.text.length > 100 ? 'محتوى طويل ومفيد' : 'نقاش مثير' }));
    res.json({ suggestions });
  } catch { res.json({ suggestions: [] }); }
});

// POST /api/channels/:id/cross-post — publish chat content as channel post
router.post('/:id/cross-post', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }
    const { content } = req.body;
    if (!content?.trim()) { res.status(400).json({ error: 'المحتوى مطلوب' }); return; }

    const postId = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_posts (id, channel_id, author_id, content, media_type) VALUES (?, ?, ?, ?, \'text\')').run(postId, channelId, payload.userId, content.trim().slice(0, 4000));
    db.prepare("UPDATE channels SET post_count = post_count + 1, updated_at = datetime('now') WHERE id = ?").run(channelId);
    try { createEventBackup('channel_crosspost'); } catch {}
    res.status(201).json({ success: true, postId, message: 'تم النشر في القناة' });
  } catch { res.status(500).json({ error: 'فشل النشر' }); }
});

// GET /api/channels/:id/wallet-transactions — unified wallet for channel admin
router.get('/:id/wallet-transactions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }
    const transactions = db.prepare("SELECT t.*, u.name as user_name FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.user_id = ? AND (t.description LIKE ? OR t.type = 'chat_transfer') ORDER BY t.created_at DESC LIMIT 50").all(payload.userId, `%channel:${channelId}%`);
    res.json(transactions);
  } catch { res.json([]); }
});

// ══════════════════════════════════════════════════════════════════
// CHANNEL V2: Scheduled Streams + Live Polls + Analytics + Gifts
// ══════════════════════════════════════════════════════════════════

// ─── Gift Catalog (built-in) ───────────────────────────────────────
const GIFT_CATALOG = [
  { type: 'rose',    name: 'وردة',          icon: '🌹', price: 5 },
  { type: 'heart',   name: 'قلب',           icon: '❤️', price: 10 },
  { type: 'star',    name: 'نجمة',          icon: '⭐', price: 25 },
  { type: 'crown',   name: 'تاج',           icon: '👑', price: 50 },
  { type: 'diamond', name: 'ماس',           icon: '💎', price: 100 },
  { type: 'trophy',  name: 'كأس البطولة',  icon: '🏆', price: 200 },
];

// GET /api/channels/gifts/catalog
router.get('/gifts/catalog', (_req: Request, res: Response) => {
  res.json(GIFT_CATALOG);
});

// POST /api/channels/:id/live/gift — send a gift during live stream
router.post('/:id/live/gift', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    const { giftType, message } = req.body;

    const gift = GIFT_CATALOG.find(g => g.type === giftType);
    if (!gift) { res.status(400).json({ error: 'هدية غير صالحة' }); return; }

    // Check stream is live
    const stream = db.prepare("SELECT * FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(channelId) as any;
    if (!stream) { res.status(404).json({ error: 'لا يوجد بث حالي' }); return; }

    // Check wallet balance
    const user = db.prepare('SELECT wallet_balance, name FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user || user.wallet_balance < gift.price) {
      res.status(400).json({ error: `رصيد المحفظة غير كافٍ (${gift.price} ج.م مطلوبة)` });
      return;
    }

    const tx = db.transaction(() => {
      // Deduct from sender wallet
      db.prepare('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?').run(gift.price, payload.userId);
      // Add to receiver (stream host) wallet
      db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(gift.price, stream.host_id);
      // Record gift
      const giftId = crypto.randomBytes(16).toString('hex');
      db.prepare(`INSERT INTO channel_gifts (id, stream_id, channel_id, sender_id, receiver_id, gift_type, gift_name, gift_icon, amount, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(giftId, stream.id, channelId, payload.userId, stream.host_id, gift.type, gift.name, gift.icon, gift.price, (message || '').slice(0, 200));
      // Update stream gift count
      db.prepare('UPDATE channel_livestreams SET gift_count = gift_count + 1 WHERE id = ?').run(stream.id);
      // Record transaction
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomBytes(16).toString('hex'), payload.userId, 'gift', -gift.price, `هدية ${gift.icon} ${gift.name} في بث مباشر`, 'completed'
      );
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, description, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomBytes(16).toString('hex'), stream.host_id, 'gift_received', gift.price, `استلمت هدية ${gift.icon} ${gift.name} من ${user.name}`, 'completed'
      );
    });
    tx();

    // Broadcast gift to all viewers via WebSocket
    try {
      const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channelId) as any[];
      const ids = new Set<string>(subscribers.map(s => s.user_id));
      wsManager.broadcastToUsers(ids, {
        type: 'channel:live-gift',
        data: {
          stream_id: stream.id, channel_id: channelId,
          sender_id: payload.userId, sender_name: user.name,
          gift_type: gift.type, gift_name: gift.name, gift_icon: gift.icon,
          amount: gift.price, message: (message || '').slice(0, 200),
        },
      });
    } catch {}

    res.status(201).json({ success: true, gift: { ...gift, message: (message || '').slice(0, 200) }, newBalance: user.wallet_balance - gift.price });
  } catch (err: any) { res.status(500).json({ error: 'فشل إرسال الهدية' }); }
});

// GET /api/channels/:id/live/gifts — list gifts for current stream
router.get('/:id/live/gifts', optionalAuth, (req: Request, res: Response) => {
  try {
    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.json([]); return; }
    const gifts = db.prepare(`
      SELECT g.*, u.name as sender_name, u.avatar as sender_avatar
      FROM channel_gifts g JOIN users u ON g.sender_id = u.id
      WHERE g.stream_id = ? ORDER BY g.created_at DESC LIMIT 50
    `).all(stream.id);
    res.json(gifts);
  } catch { res.json([]); }
});

// ─── Scheduled Streams ─────────────────────────────────────────────

// POST /api/channels/:id/schedule-stream
router.post('/:id/schedule-stream', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'فقط المشرفون' }); return; }
    const { title, description, scheduledAt } = req.body;
    if (!title || !scheduledAt) { res.status(400).json({ error: 'العنوان والوقت مطلوبان' }); return; }
    if (new Date(scheduledAt) <= new Date()) { res.status(400).json({ error: 'الوقت يجب أن يكون في المستقبل' }); return; }

    const id = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_scheduled_streams (id, channel_id, host_id, title, description, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, channelId, payload.userId, title.trim().slice(0, 200), (description || '').slice(0, 500), scheduledAt);

    // Notify all subscribers about the scheduled stream
    try {
      const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ? AND user_id != ?').all(channelId, payload.userId) as any[];
      const channel = db.prepare('SELECT name FROM channels WHERE id = ?').get(channelId) as any;
      const ids = subscribers.map(s => s.user_id);
      sendPushToUsers(ids, `📅 بث مجدول: ${channel?.name || 'قناة'}`, `${title} — ${new Date(scheduledAt).toLocaleString('ar-EG')}`, { type: 'scheduled_stream', channel_id: channelId, link: `/channels/${channelId}` }).catch(() => {});
    } catch {}

    res.status(201).json({ id, success: true });
  } catch { res.status(500).json({ error: 'فشل جدولة البث' }); }
});

// GET /api/channels/:id/scheduled-streams
router.get('/:id/scheduled-streams', optionalAuth, (req: Request, res: Response) => {
  try {
    const streams = db.prepare("SELECT * FROM channel_scheduled_streams WHERE channel_id = ? AND status = 'scheduled' AND scheduled_at > datetime('now') ORDER BY scheduled_at ASC").all(req.params.id);
    res.json(streams);
  } catch { res.json([]); }
});

// POST /api/channels/scheduled-streams/:streamId/remind — set reminder
router.post('/scheduled-streams/:streamId/remind', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('INSERT OR IGNORE INTO channel_stream_reminders (stream_id, user_id) VALUES (?, ?)').run(req.params.streamId, payload.userId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// DELETE /api/channels/scheduled-streams/:streamId — cancel scheduled stream
router.delete('/scheduled-streams/:streamId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const stream = db.prepare('SELECT * FROM channel_scheduled_streams WHERE id = ?').get(req.params.streamId) as any;
    if (!stream) { res.status(404).json({ error: 'غير موجود' }); return; }
    if (!isChannelAdmin(stream.channel_id, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }
    db.prepare("UPDATE channel_scheduled_streams SET status = 'cancelled' WHERE id = ?").run(req.params.streamId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// ─── Live Polls ────────────────────────────────────────────────────

// POST /api/channels/:id/live/poll — create poll during live stream
router.post('/:id/live/poll', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'فقط المشرفون' }); return; }
    const { question, options } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) { res.status(400).json({ error: 'السؤال وخياران على الأقل مطلوبان' }); return; }

    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(channelId) as any;
    if (!stream) { res.status(404).json({ error: 'لا يوجد بث حالي' }); return; }

    const pollId = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO channel_live_polls (id, stream_id, channel_id, question) VALUES (?, ?, ?, ?)').run(pollId, stream.id, channelId, question.slice(0, 300));
    const insertOpt = db.prepare('INSERT INTO channel_live_poll_options (id, poll_id, text, sort_order) VALUES (?, ?, ?, ?)');
    options.forEach((opt: string, i: number) => { if (opt.trim()) insertOpt.run(crypto.randomBytes(16).toString('hex'), pollId, opt.trim().slice(0, 200), i); });

    // Broadcast poll to viewers
    try {
      const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ?').all(channelId) as any[];
      const ids = new Set<string>(subscribers.map(s => s.user_id));
      const opts = db.prepare('SELECT * FROM channel_live_poll_options WHERE poll_id = ? ORDER BY sort_order').all(pollId);
      wsManager.broadcastToUsers(ids, { type: 'channel:live-poll', data: { poll_id: pollId, stream_id: stream.id, channel_id: channelId, question: question.slice(0, 300), options: opts } });
    } catch {}

    res.status(201).json({ id: pollId, question: question.slice(0, 300), options: db.prepare('SELECT * FROM channel_live_poll_options WHERE poll_id = ? ORDER BY sort_order').all(pollId) });
  } catch { res.status(500).json({ error: 'فشل إنشاء الاستطلاع' }); }
});

// POST /api/channels/live/polls/:pollId/vote
router.post('/live/polls/:pollId/vote', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { optionId } = req.body;
    if (!optionId) { res.status(400).json({ error: 'الخيار مطلوب' }); return; }

    const poll = db.prepare('SELECT * FROM channel_live_polls WHERE id = ? AND status = ?').get(req.params.pollId, 'active') as any;
    if (!poll) { res.status(404).json({ error: 'الاستطلاع غير موجود أو مغلق' }); return; }

    // Replace vote (one vote per user)
    db.prepare('DELETE FROM channel_live_poll_votes WHERE poll_id = ? AND user_id = ?').run(poll.id, payload.userId);
    db.prepare('INSERT INTO channel_live_poll_votes (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)').run(crypto.randomBytes(16).toString('hex'), poll.id, optionId, payload.userId);
    db.prepare('UPDATE channel_live_poll_options SET vote_count = (SELECT COUNT(*) FROM channel_live_poll_votes WHERE option_id = ?) WHERE id = ?').run(optionId, optionId);

    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل التصويت' }); }
});

// POST /api/channels/live/polls/:pollId/close
router.post('/live/polls/:pollId/close', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const poll = db.prepare('SELECT * FROM channel_live_polls WHERE id = ?').get(req.params.pollId) as any;
    if (!poll) { res.status(404).json({ error: 'غير موجود' }); return; }
    if (!isChannelAdmin(poll.channel_id, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }
    db.prepare("UPDATE channel_live_polls SET status = 'closed' WHERE id = ?").run(req.params.pollId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

// GET /api/channels/:id/live/polls — active polls
router.get('/:id/live/polls', optionalAuth, (req: Request, res: Response) => {
  try {
    const stream = db.prepare("SELECT id FROM channel_livestreams WHERE channel_id = ? AND status = 'live'").get(req.params.id) as any;
    if (!stream) { res.json([]); return; }
    const polls = db.prepare("SELECT * FROM channel_live_polls WHERE stream_id = ? AND status = 'active'").all(stream.id) as any[];
    const enriched = polls.map(p => ({ ...p, options: db.prepare('SELECT * FROM channel_live_poll_options WHERE poll_id = ? ORDER BY sort_order').all(p.id) }));
    res.json(enriched);
  } catch { res.json([]); }
});

// ─── Channel Analytics ─────────────────────────────────────────────

// GET /api/channels/:id/analytics
router.get('/:id/analytics', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const channelId = req.params.id;
    if (!isChannelAdmin(channelId, payload.userId)) { res.status(403).json({ error: 'صلاحيات غير كافية' }); return; }

    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
    const totalStreams = db.prepare("SELECT COUNT(*) as c FROM channel_livestreams WHERE channel_id = ?").get(channelId) as any;
    const totalGifts = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total FROM channel_gifts WHERE channel_id = ?").get(channelId) as any;
    const totalPolls = db.prepare("SELECT COUNT(*) as c FROM channel_live_polls WHERE channel_id = ?").get(channelId) as any;
    const recentStreams = db.prepare("SELECT * FROM channel_livestreams WHERE channel_id = ? ORDER BY started_at DESC LIMIT 10").all(channelId) as any[];
    const subscriberGrowth = db.prepare("SELECT COUNT(*) as c FROM channel_subscribers WHERE channel_id = ?").get(channelId) as any;
    const topGifters = db.prepare(`
      SELECT g.sender_id, u.name, u.avatar, COUNT(*) as gift_count, SUM(g.amount) as total_amount
      FROM channel_gifts g JOIN users u ON g.sender_id = u.id
      WHERE g.channel_id = ? GROUP BY g.sender_id ORDER BY total_amount DESC LIMIT 5
    `).all(channelId);

    res.json({
      channel: { name: channel?.name, subscriber_count: channel?.subscriber_count, post_count: channel?.post_count },
      totals: {
        streams: totalStreams?.c || 0,
        gifts_count: totalGifts?.c || 0,
        gifts_amount: totalGifts?.total || 0,
        polls: totalPolls?.c || 0,
        subscribers: subscriberGrowth?.c || 0,
      },
      recentStreams: recentStreams.map(s => ({
        id: s.id, title: s.title, status: s.status,
        viewer_peak: s.viewer_peak, viewer_total: s.viewer_total,
        chat_count: s.chat_count, gift_count: s.gift_count,
        started_at: s.started_at, ended_at: s.ended_at,
      })),
      topGifters,
    });
  } catch { res.status(500).json({ error: 'فشل' }); }
});

export default router;
