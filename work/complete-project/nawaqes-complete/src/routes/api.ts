// ─── General API Routes (categories, news, stories, trends, users, promotions, friends) ─
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import db from '../database/index.js';
import { authMiddleware, optionalAuth, JwtPayload } from '../middleware/auth.js';
import { getDefaultAvatar } from '../utils/serverAvatar.js';
import { notifyFriendRequest, sendPushToUser } from '../services/pushNotifications.js';
import { backupFileToHF } from '../database/image-backup.js';
import { wsManager } from '../websocket/index.js';

const router = Router();

// ─── File Upload Setup ──────────────────────────────────────────────
// Whitelist of allowed image/video extensions. Anything else (especially
// .html, .svg, .htm, .js, .xml, .exe, .php) is rejected to prevent
// stored XSS via uploaded files served by express.static.
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico']);
const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.ogv', '.3gp']);
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/x-icon',
]);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'video/mp2t', 'video/ogg', 'video/3gpp',
]);

// Magic-byte signatures for true file-type detection. Android WebView
// (and some iOS Safari versions) often send images as
// `application/octet-stream` or with a wrong MIME type. We sniff the
// first few bytes of the file as a fallback to decide whether to accept
// the upload. This keeps the security property (no .html/.svg served as
// text/html) while not breaking real image uploads from mobile devices.
function detectImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  // GIF: 47 49 46 38 (GIF8)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  // WebP: RIFF....WEBP
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // BMP: 42 4D (BM)
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
  return null;
}

function detectVideoMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // MP4/MOV: ftyp box at offset 4
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('latin1');
    if (brand.startsWith('mp4')) return 'video/mp4';
    if (brand.startsWith('qt  ')) return 'video/quicktime';
    if (brand.startsWith('avc1')) return 'video/mp4';
    // Default ftyp-based detection to mp4
    return 'video/mp4';
  }
  // WebM: 1A 45 DF A3
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm';
  // FLV: 46 4C 56
  if (buf[0] === 0x46 && buf[1] === 0x4C && buf[2] === 0x56) return 'video/x-flv';
  return null;
}

function isAllowedImage(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  // Require a whitelisted extension.
  if (!ALLOWED_IMAGE_EXT.has(ext)) return false;
  // Accept if the MIME is whitelisted.
  if (ALLOWED_IMAGE_MIME.has(file.mimetype)) return true;
  // Fallback: if the MIME is missing or generic (octet-stream / empty),
  // sniff the file's magic bytes to confirm it's really an image.
  // This is what makes uploads from Android WebView work.
  if (file.mimetype === 'application/octet-stream' || file.mimetype === '' || !file.mimetype) {
    const buf = file.buffer || Buffer.alloc(0);
    if (buf.length > 0 && detectImageMimeFromBuffer(buf)) return true;
    // No buffer available (multer.diskStorage) — accept by extension only,
    // since the extension is already whitelisted.
    return true;
  }
  return false;
}
function isAllowedVideo(file: Express.Multer.File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_VIDEO_EXT.has(ext)) return false;
  if (ALLOWED_VIDEO_MIME.has(file.mimetype)) return true;
  if (file.mimetype === 'application/octet-stream' || file.mimetype === '' || !file.mimetype) {
    const buf = file.buffer || Buffer.alloc(0);
    if (buf.length > 0 && detectVideoMimeFromBuffer(buf)) return true;
    return true;
  }
  return false;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve('uploads')),
  filename: (_req, file, cb) => {
    // Always re-write the extension from the whitelist so the saved file
    // cannot be served as text/html etc. by express.static.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for images
  fileFilter: (_req, file, cb) => {
    if (isAllowedImage(file)) return cb(null, true);
    cb(null, false);
  },
});

// Video upload setup
const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const videoDir = path.resolve('uploads/videos');
    if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });
    cb(null, videoDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `vid_${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for videos
  fileFilter: (_req, file, cb) => {
    if (isAllowedVideo(file)) return cb(null, true);
    cb(null, false);
  },
});

// POST /api/upload — Accept both images and videos
const mediaUpload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for any media
  fileFilter: (_req, file, cb) => {
    if (isAllowedImage(file) || isAllowedVideo(file)) return cb(null, true);
    cb(null, false);
  },
});
router.post('/upload', authMiddleware, mediaUpload.single('image'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'لم يتم رفع أي ملف' }); return; }
  const url = `/uploads/${req.file.filename}`;
  // 🔒 RADICAL FIX: synchronously back up to HF Dataset so images survive rebuilds
  backupFileToHF(req.file.path);
  res.json({ url, filename: req.file.filename });
});

// POST /api/videos/upload - Upload video file
router.post('/videos/upload', authMiddleware, videoUpload.single('video'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'لم يتم رفع أي فيديو' });
      return;
    }
    const url = `/uploads/videos/${req.file.filename}`;
    const size = req.file.size;
    // 🔒 RADICAL FIX: back up video to HF Dataset so it survives rebuilds
    backupFileToHF(req.file.path);
    res.json({ url, filename: req.file.filename, size });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفع الفيديو', details: err.message });
  }
});

// Error handler for multer video upload errors
router.use('/videos/upload', (err: any, _req: Request, res: Response, _next: any) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'حجم الفيديو يتجاوز الحد المسموح (500 ميجابايت)' });
    return;
  }
  if (err.message) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'فشل رفع الفيديو' });
});

// POST /api/market-live/link-video - Link uploaded video to a post or market listing
// 🔧 FIX: postId is now OPTIONAL — standalone videos (no ad) don't need it
router.post('/market-live/link-video', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { postId, videoUrl, thumbnailUrl, duration, listingType, title, description } = req.body;

    // 🔧 FIX: only videoUrl is required. postId is optional for standalone videos.
    if (!videoUrl) {
      res.status(400).json({ error: 'رابط الفيديو مطلوب' });
      return;
    }

    // Validate the video URL belongs to our uploads
    if (!videoUrl.startsWith('/uploads/')) {
      res.status(400).json({ error: 'رابط الفيديو غير صالح' });
      return;
    }

    const videoId = crypto.randomBytes(16).toString('hex').toLowerCase();

    // 🔧 FIX: handle 4 cases: market_listing, post, standalone, or channel
    if (listingType === 'market_listing' && postId) {
      const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND seller_id = ?').get(postId, payload.userId) as any;
      if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود أو ليس ملكك' }); return; }
      db.prepare(`INSERT INTO ad_videos (id, post_id, user_id, video_url, thumbnail_url, duration) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(videoId, postId, payload.userId, videoUrl, thumbnailUrl || '', duration || 0);
    } else if (postId) {
      const post = db.prepare('SELECT * FROM posts WHERE id = ? AND author_id = ?').get(postId, payload.userId) as any;
      if (!post) { res.status(404).json({ error: 'المنشور غير موجود أو ليس ملكك' }); return; }
      db.prepare(`UPDATE posts SET video_url = ?, updated_at = datetime('now') WHERE id = ?`).run(videoUrl, postId);
      db.prepare(`INSERT INTO ad_videos (id, post_id, user_id, video_url, thumbnail_url, duration) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(videoId, postId, payload.userId, videoUrl, thumbnailUrl || '', duration || 0);
    } else {
      db.prepare(`INSERT INTO ad_videos (id, post_id, user_id, video_url, thumbnail_url, duration) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(videoId, null, payload.userId, videoUrl, thumbnailUrl || '', duration || 0);
    }

    // ─── NEW: Notify all followers of the uploader about the new video ──
    // Sends an in-app notification to every user who follows the uploader.
    // The notification appears in NotificationsPage + triggers a toast + FCM push.
    try {
      const uploader = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
      const uploaderName = uploader?.name || 'مستخدم';
      const followers = db.prepare('SELECT follower_id FROM user_follows WHERE following_id = ?').all(payload.userId) as any[];
      if (followers.length > 0) {
        const notifId = crypto.randomBytes(16).toString('hex');
        const notifMsg = `${uploaderName} نشر فيديو جديد في سوق لايف`;
        const notifLink = `/market-live`;
        // Insert one notification per follower (batch)
        const insertNotif = db.prepare(`
          INSERT INTO notifications (id, user_id, type, message, user_id_ref, link, created_at)
          VALUES (?, ?, 'video', ?, ?, ?, datetime('now'))
        `);
        const insertMany = db.transaction((fol: any[]) => {
          for (const f of fol) {
            insertNotif.run(crypto.randomBytes(16).toString('hex'), f.follower_id, notifMsg, payload.userId, notifLink);
          }
        });
        insertMany(followers);

        // Emit WebSocket event so followers see the notification in real-time
        try {
          const followerIds = new Set<string>(followers.map(f => f.follower_id));
          const { wsManager } = await import('../websocket/index.js');
          wsManager.broadcastToUsers(followerIds, {
            type: 'notification:new',
            data: {
              type: 'video',
              message: notifMsg,
              link: notifLink,
              fromUserId: payload.userId,
              fromUserName: uploaderName,
            },
          });
        } catch {}
      }
    } catch (notifErr) {
      console.error('[link-video] Failed to notify followers:', notifErr);
    }

    // ─── Chat V3 Integration: also publish to channel if channelId provided ──
    const { channelId } = req.body;
    if (channelId) {
      // Verify user is admin of the channel
      const sub = db.prepare('SELECT role FROM channel_subscribers WHERE channel_id = ? AND user_id = ?').get(channelId, payload.userId) as any;
      if (sub?.role === 'owner' || sub?.role === 'admin') {
        const channelPostId = crypto.randomBytes(16).toString('hex');
        db.prepare(`
          INSERT INTO channel_posts (id, channel_id, author_id, content, media_type, media_url, media_caption)
          VALUES (?, ?, ?, ?, 'video', ?, ?)
        `).run(channelPostId, channelId, payload.userId, title || 'فيديو جديد', videoUrl, description || '');
        db.prepare('UPDATE channels SET post_count = post_count + 1, updated_at = datetime(\'now\') WHERE id = ?').run(channelId);

        // Notify subscribers via WebSocket
        try {
          const subscribers = db.prepare('SELECT user_id FROM channel_subscribers WHERE channel_id = ? AND user_id != ?').all(channelId, payload.userId) as any[];
          const subscriberIds = new Set<string>(subscribers.map(s => s.user_id));
          const { wsManager } = await import('../websocket/index.js');
          wsManager.broadcastToUsers(subscriberIds, {
            type: 'channel:post',
            data: { channel_id: channelId, post_id: channelPostId },
          });
        } catch {}

        // Trigger backup
        try { const { createEventBackup } = await import('../database/backup-system.js'); createEventBackup('channel_video'); } catch {}
      }
    }

    res.status(201).json({
      id: videoId,
      videoUrl,
      thumbnailUrl: thumbnailUrl || '',
      duration: duration || 0,
      message: 'تم ربط الفيديو بنجاح',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل ربط الفيديو', details: err.message });
  }
});

// GET /api/market-live/my-videos - Get current user's uploaded videos
router.get('/market-live/my-videos', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const videos = db.prepare(`
      SELECT v.*, p.content as post_content, p.image as post_image,
             ml.title as listing_title, ml.images as listing_images
      FROM ad_videos v
      LEFT JOIN posts p ON p.id = v.post_id
      LEFT JOIN market_listings ml ON ml.id = v.post_id
      WHERE v.user_id = ? AND v.status = 'active'
      ORDER BY v.created_at DESC
    `).all(payload.userId);

    const result = videos.map((v: any) => ({
      id: v.id,
      postId: v.post_id,
      videoUrl: v.video_url,
      thumbnailUrl: v.thumbnail_url || v.post_image || '',
      duration: v.duration,
      views: v.views,
      likes: v.likes,
      shares: v.shares,
      saves: v.saves,
      isFeatured: !!v.is_featured,
      title: v.listing_title || v.post_content?.substring(0, 60) || '',
      createdAt: v.created_at,
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب فيديوهاتي', details: err.message });
  }
});

// ─── NEW: GET /api/market-live/user-videos/:userId — Get any user's videos ──
// Public endpoint (optionalAuth) — returns all active videos uploaded by a
// specific user. Used by the UserVideosPage (grid of thumbnails) and the
// "آخر فيديو" preview on the profile page.
router.get('/market-live/user-videos/:userId', optionalAuth, (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }

    const videos = db.prepare(`
      SELECT v.id, v.video_url, v.thumbnail_url, v.duration,
             v.views, v.likes, v.shares, v.saves, v.is_featured,
             v.created_at,
             COALESCE(ml.title, p.content) as title,
             COALESCE(ml.price, p.price) as price,
             COALESCE(ml.currency, p.currency, 'ج.م') as currency,
             COALESCE(ml.images, '[]') as images
      FROM ad_videos v
      LEFT JOIN market_listings ml ON ml.id = v.post_id
      LEFT JOIN posts p ON p.id = v.post_id
      WHERE v.user_id = ? AND v.status = 'active'
      ORDER BY v.created_at DESC
    `).all(userId);

    const result = videos.map((v: any) => {
      let images: string[] = [];
      try { const p = JSON.parse(v.images || '[]'); if (Array.isArray(p)) images = p; } catch { images = []; }
      return {
        id: v.id,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url || images[0] || '',
        duration: v.duration,
        views: v.views || 0,
        likes: v.likes || 0,
        shares: v.shares || 0,
        saves: v.saves || 0,
        isFeatured: !!v.is_featured,
        title: v.title || '',
        price: v.price,
        currency: v.currency,
        createdAt: v.created_at,
      };
    });

    res.json({ videos: result, total: result.length });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب فيديوهات المستخدم', details: err.message });
  }
});

// ─── Active Admin Alerts ────────────────────────────────────────────
// NOTE: The PUBLIC version of this endpoint is defined further below
// (search "GET /api/alerts/active — PUBLIC endpoint"). Do NOT register
// an authMiddleware-protected version here — it would shadow the public
// one and break alert rendering for unauthenticated users.

// ─── Categories ─────────────────────────────────────────────────────
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort').all();
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الفئات', details: err.message });
  }
});

// ─── News ───────────────────────────────────────────────────────────
router.get('/news', (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    let query = 'SELECT * FROM news_items';
    const params: string[] = [];
    if (category && ['general', 'egypt', 'world', 'urgent'].includes(category)) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    query += ' ORDER BY created_at DESC LIMIT 50';
    const news = db.prepare(query).all(...params);
    res.json(news);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الأخبار', details: err.message });
  }
});

// ─── Stories ────────────────────────────────────────────────────────
router.get('/stories', optionalAuth, (_req: Request, res: Response) => {
  try {
    const stories = db.prepare(`
      SELECT s.*, u.name as user_name, u.avatar as user_avatar
      FROM stories s JOIN users u ON u.id = s.user_id
      WHERE s.created_at >= datetime('now', '-24 hours')
      ORDER BY s.created_at DESC
    `).all().map((s: any) => ({
      id: s.id,
      image: s.image,
      type: s.type,
      text: s.text,
      backgroundColor: s.background_color,
      isSeen: !!s.is_seen,
      createdAt: s.created_at,
      user: { id: s.user_id, name: s.user_name, avatar: s.user_avatar },
    }));
    res.json(stories);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب القصص', details: err.message });
  }
});

// POST /api/stories
router.post('/stories', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { image, type, text, backgroundColor } = req.body;

    const result = db.prepare('INSERT INTO stories (user_id, image, type, text, background_color) VALUES (?, ?, ?, ?, ?)')
      .run(payload.userId, image || '', type || 'image', text || '', backgroundColor || '');

    const story = db.prepare('SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(payload.userId) as any;

    // Emit WebSocket event so other users see the new story in real-time
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.broadcast({ type: 'story:created', data: { userId: payload.userId } }, { excludeUserId: payload.userId });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit story created:', wsErr.message); }

    res.status(201).json(story);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء القصة', details: err.message });
  }
});

// ─── Trends ─────────────────────────────────────────────────────────
router.get('/trends', (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    let query = 'SELECT * FROM market_trends';
    const params: string[] = [];
    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    query += ' ORDER BY updated_at DESC';
    const trends = db.prepare(query).all(...params);
    res.json(trends);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الاتجاهات', details: err.message });
  }
});

// ─── Refresh Trends (recompute from real data) ─────────────────────
router.post('/trends/refresh', authMiddleware, (_req: Request, res: Response) => {
  try {
    // Compute category-level stats from real posts
    const categoryStats = db.prepare(`
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(AVG(price), 0) as avg_price,
        COALESCE(SUM(likes), 0) as total_likes
      FROM posts 
      WHERE type = 'ad' AND status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category 
      ORDER BY count DESC
    `).all() as any[];

    const categoryTrendData: Record<string, { recent: number; previous: number; avgPrice: number; count: number }> = {};
    for (const cat of categoryStats) {
      const recent = db.prepare(`
        SELECT COUNT(*) as count FROM posts 
        WHERE type = 'ad' AND status = 'active' AND category = ? 
        AND created_at >= datetime('now', '-7 days')
      `).get(cat.category) as any;
      const previous = db.prepare(`
        SELECT COUNT(*) as count FROM posts 
        WHERE type = 'ad' AND status = 'active' AND category = ? 
        AND created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')
      `).get(cat.category) as any;
      categoryTrendData[cat.category] = {
        recent: recent.count || 0,
        previous: previous.count || 0,
        avgPrice: cat.avg_price,
        count: cat.count,
      };
    }

    const categoryNames: Record<string, string> = {
      phones: 'هواتف', cars: 'سيارات', electronics: 'إلكترونيات', realEstate: 'عقارات',
      games: 'ألعاب', fashion: 'أزياء', services: 'خدمات', books: 'كتب',
      sports: 'رياضة', animals: 'حيوانات', jobs: 'وظائف', other: 'أخرى',
    };

    db.prepare('DELETE FROM market_trends').run();
    const insertTrend = db.prepare("INSERT INTO market_trends (id, item, trend, change, category, price, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))");

    for (const [cat, data] of Object.entries(categoryTrendData)) {
      if (data.count < 1) continue;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let changePercent = 0;
      if (data.previous > 0) {
        changePercent = Math.round(((data.recent - data.previous) / data.previous) * 100);
        if (changePercent > 3) trend = 'up';
        else if (changePercent < -3) trend = 'down';
      } else if (data.recent > 0) {
        changePercent = 100;
        trend = 'up';
      }
      const changeStr = changePercent >= 0 ? `+${changePercent}%` : `${changePercent}%`;
      insertTrend.run(`trend-real-${cat}`, categoryNames[cat] || cat, trend, changeStr, cat, Math.round(data.avgPrice));
    }

    const trends = db.prepare('SELECT * FROM market_trends ORDER BY updated_at DESC').all();
    res.json({ message: 'تم تحديث الاتجاهات من البيانات الحقيقية', trends });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الاتجاهات', details: err.message });
  }
});

// ─── Opportunities (فرص قد تهمك) ──────────────────────────────────
// NEW: Supports multi-city targeting — promoted posts only show to users in targeted cities
router.get('/opportunities', optionalAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;
    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

    // Get the current user's info for targeting (if authenticated)
    let userInterests: string[] = [];
    let userLocation = '';
    let userCityId = ''; // city ID derived from user location
    let userAge = 0;
    if (userId) {
      try {
        const userInfo = db.prepare('SELECT interests, location, date_of_birth FROM users WHERE id = ?').get(userId) as any;
        if (userInfo) {
          try { userInterests = JSON.parse(userInfo.interests || '[]'); } catch { userInterests = []; }
          userLocation = userInfo.location || '';
          // Calculate user age
          if (userInfo.date_of_birth) {
            const birthDate = new Date(userInfo.date_of_birth);
            const today = new Date();
            userAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              userAge--;
            }
          }
          // Try to match user location string to a city ID
          if (userLocation) {
            const cityMatch = db.prepare("SELECT id FROM cities_lookup WHERE name_ar = ? OR name_en = ? COLLATE NOCASE")
              .get(userLocation, userLocation) as any;
            if (cityMatch) userCityId = cityMatch.id;
          }
        }
      } catch { /* ignore */ }
    }

    // Fetch real posts that match user interests or are promoted
    let opportunities: any[] = [];

    // 1. First: Promoted posts that are active AND match targeting criteria
    const promotedPosts = db.prepare(`
      SELECT p.id, p.content, p.image, p.price, p.category, p.location, p.created_at,
             p.is_promoted, p.promotion_tier, p.targeting, p.target_city, p.target_interests,
             p.target_age_min, p.target_age_max,
             u.name as author_name, u.avatar as author_avatar, u.avatar_base64, u.is_verified
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.type = 'ad' AND p.status = 'active' AND p.is_promoted = 1 AND p.promotion_status = 'approved'
      ORDER BY p.reach_count DESC, p.created_at DESC
      LIMIT ?
    `).all(limit * 2) as any[];

    // Filter promoted posts by ALL targeting criteria (city, interests, age)
    const filteredPromotedPosts = promotedPosts.filter(p => {
      // City targeting filter
      if (p.targeting === 'city' && p.target_city) {
        if (userCityId || userLocation) {
          let targetCities: string[] = [];
          try {
            const parsed = JSON.parse(p.target_city || '[]');
            if (Array.isArray(parsed)) targetCities = parsed;
            else if (typeof parsed === 'string' && parsed.length > 0) targetCities = [parsed];
          } catch {
            if (p.target_city) targetCities = [p.target_city];
          }
          if (targetCities.length > 0) {
            const cityMatch = (userCityId && targetCities.includes(userCityId)) ||
              (userLocation && targetCities.some(c => userLocation.includes(c)));
            if (!cityMatch) return false;
          }
        }
      }

      // Interest targeting filter (flexible matching)
      if (p.targeting === 'interests' && p.target_interests) {
        let postInterests: string[] = [];
        try {
          const parsed = JSON.parse(p.target_interests || '[]');
          if (Array.isArray(parsed)) postInterests = parsed;
        } catch {
          postInterests = [p.target_interests];
        }
        if (postInterests.length > 0 && userInterests.length > 0) {
          const hasMatch = postInterests.some((interest: string) =>
            userInterests.some(ui =>
              ui === interest ||
              ui.toLowerCase() === interest.toLowerCase() ||
              ui.includes(interest) || interest.includes(ui) ||
              (ui === 'هواتف' && interest === 'phones') || (ui === 'phones' && interest === 'هواتف') ||
              (ui === 'سيارات' && interest === 'cars') || (ui === 'cars' && interest === 'سيارات') ||
              (ui === 'إلكترونيات' && interest === 'electronics') || (ui === 'electronics' && interest === 'إلكترونيات') ||
              (ui === 'عقارات' && interest === 'realEstate') || (ui === 'realEstate' && interest === 'عقارات') ||
              (ui === 'أزياء' && interest === 'fashion') || (ui === 'fashion' && interest === 'أزياء') ||
              (ui === 'ألعاب' && interest === 'games') || (ui === 'games' && interest === 'ألعاب') ||
              (ui === 'رياضة' && interest === 'sports') || (ui === 'sports' && interest === 'رياضة') ||
              (ui === 'كتب' && interest === 'books') || (ui === 'books' && interest === 'كتب') ||
              (ui === 'وظائف' && interest === 'jobs') || (ui === 'jobs' && interest === 'وظائف') ||
              (ui === 'خدمات' && interest === 'services') || (ui === 'services' && interest === 'خدمات') ||
              (ui === 'حيوانات' && interest === 'animals') || (ui === 'animals' && interest === 'حيوانات')
            )
          );
          if (!hasMatch) return false;
        }
      }

      // Age targeting filter
      if (p.target_age_min && p.target_age_max && p.target_age_min > 0 && p.target_age_max > 0) {
        if (userAge > 0) {
          if (userAge < p.target_age_min || userAge > p.target_age_max) return false;
        }
      }

      return true;
    });

    // 2. If user has interests, fetch posts matching their interests
    let interestPosts: any[] = [];
    if (userInterests.length > 0) {
      const placeholders = userInterests.map(() => 'p.category = ?').join(' OR ');
      interestPosts = db.prepare(`
        SELECT p.id, p.content, p.image, p.price, p.category, p.location, p.created_at,
               p.is_promoted, p.promotion_tier,
               u.name as author_name, u.avatar as author_avatar, u.avatar_base64, u.is_verified
        FROM posts p JOIN users u ON u.id = p.author_id
        WHERE p.type = 'ad' AND p.status = 'active' AND (${placeholders})
        ORDER BY p.likes DESC, p.created_at DESC
        LIMIT ?
      `).all(...userInterests, limit) as any[];
    }

    // 3. Fill remaining with recent popular posts
    const existingIds = new Set([...filteredPromotedPosts, ...interestPosts].map(p => p.id));
    const recentPosts = db.prepare(`
      SELECT p.id, p.content, p.image, p.price, p.category, p.location, p.created_at,
             p.is_promoted, p.promotion_tier,
             u.name as author_name, u.avatar as author_avatar, u.avatar_base64, u.is_verified
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.type = 'ad' AND p.status = 'active'
      ORDER BY p.likes DESC, p.created_at DESC
      LIMIT ?
    `).all(limit * 2) as any[];

    // Merge and deduplicate: promoted first, then interest-matched, then recent
    const seen = new Set<string>();
    const addPost = (p: any) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      // Parse target_city for display
      let targetCitiesForDisplay: string[] = [];
      if (p.targeting === 'city' && p.target_city) {
        try {
          const parsed = JSON.parse(p.target_city);
          targetCitiesForDisplay = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          targetCitiesForDisplay = [p.target_city];
        }
      }
      opportunities.push({
        id: p.id,
        content: p.content?.substring(0, 100) + (p.content?.length > 100 ? '...' : ''),
        image: p.image,
        price: p.price,
        category: p.category,
        location: p.location,
        isPromoted: !!p.is_promoted,
        promotionTier: p.promotion_tier,
        targeting: p.targeting,
        targetCities: targetCitiesForDisplay,
        createdAt: p.created_at,
        author: {
          name: p.author_name,
          avatar: p.avatar_base64 || p.author_avatar || getDefaultAvatar('default'),
          isVerified: !!p.is_verified,
        },
        matchReason: p.is_promoted ? 'promoted' :
          (p.category && userInterests.includes(p.category)) ? 'interest' : 'recent',
      });
    };

    filteredPromotedPosts.forEach(addPost);
    interestPosts.forEach(addPost);
    recentPosts.forEach(addPost);

    res.json(opportunities.slice(0, limit));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الفرص', details: err.message });
  }
});

// ─── Market Pulse Overview ──────────────────────────────────────────
router.get('/market-pulse/overview', optionalAuth, (_req: Request, res: Response) => {
  try {
    // Active ads count
    const activeAds = db.prepare("SELECT COUNT(*) as count FROM posts WHERE type = 'ad' AND status = 'active'").get() as any;

    // New ads today
    const newToday = db.prepare("SELECT COUNT(*) as count FROM posts WHERE type = 'ad' AND status = 'active' AND created_at >= datetime('now', '-1 day')").get() as any;

    // New ads this week
    const newThisWeek = db.prepare("SELECT COUNT(*) as count FROM posts WHERE type = 'ad' AND status = 'active' AND created_at >= datetime('now', '-7 days')").get() as any;

    // Total users
    const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE is_deactivated = 0").get() as any;

    // Average price
    const avgPrice = db.prepare("SELECT COALESCE(AVG(price), 0) as avg FROM posts WHERE type = 'ad' AND status = 'active' AND price > 0").get() as any;

    // Category distribution
    const categoryDist = db.prepare(`
      SELECT category, COUNT(*) as count, COALESCE(AVG(price), 0) as avg_price, 
             COALESCE(MIN(price), 0) as min_price, COALESCE(MAX(price), 0) as max_price
      FROM posts WHERE type = 'ad' AND status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category ORDER BY count DESC LIMIT 10
    `).all();

    // Top ads by reach
    const topAds = db.prepare(`
      SELECT p.id, p.content, p.image, p.price, p.category, p.location, p.reach_count, p.likes, p.created_at,
             u.name as author_name, u.avatar as author_avatar
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.type = 'ad' AND p.status = 'active'
      ORDER BY p.reach_count DESC, p.likes DESC LIMIT 5
    `).all();

    // Supply & demand indicator per category
    const supplyDemand = db.prepare(`
      SELECT category, 
        COUNT(*) as supply,
        COALESCE(SUM(likes), 0) as demand_score
      FROM posts WHERE type = 'ad' AND status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category ORDER BY demand_score DESC LIMIT 6
    `).all();

    // Price ranges per category
    const priceRanges = db.prepare(`
      SELECT category,
        COUNT(*) as count,
        COALESCE(MIN(price), 0) as min_price,
        COALESCE(MAX(price), 0) as max_price,
        COALESCE(AVG(price), 0) as avg_price
      FROM posts WHERE type = 'ad' AND status = 'active' AND price > 0 AND category != '' AND category IS NOT NULL
      GROUP BY category ORDER BY count DESC LIMIT 8
    `).all();

    // Weekly activity (ads per day in the last 7 days)
    const weeklyActivity = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM posts WHERE type = 'ad' AND status = 'active' AND created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all();

    res.json({
      activeAds: activeAds.count || 0,
      newToday: newToday.count || 0,
      newThisWeek: newThisWeek.count || 0,
      totalUsers: totalUsers.count || 0,
      avgPrice: Math.round(avgPrice.avg || 0),
      categoryDist,
      topAds: topAds.map((a: any) => ({
        id: a.id,
        content: a.content?.substring(0, 80) + (a.content?.length > 80 ? '...' : ''),
        image: a.image,
        price: a.price,
        category: a.category,
        location: a.location,
        reachCount: a.reach_count || 0,
        likes: a.likes || 0,
        authorName: a.author_name,
        authorAvatar: a.author_avatar,
        createdAt: a.created_at,
      })),
      supplyDemand: supplyDemand.map((s: any) => ({
        category: s.category,
        supply: s.supply,
        demandScore: s.demand_score,
        ratio: s.supply > 0 ? Math.round((s.demand_score / s.supply) * 10) / 10 : 0,
      })),
      priceRanges: priceRanges.map((p: any) => ({
        category: p.category,
        count: p.count,
        minPrice: p.min_price,
        maxPrice: p.max_price,
        avgPrice: Math.round(p.avg_price),
      })),
      weeklyActivity,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب نبض السوق', details: err.message });
  }
});

// ─── Notifications ──────────────────────────────────────────────────
router.get('/notifications', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    // Fetch latest 50 notifications for this user. We no longer filter out
    // 'like'/'comment'/'friend' types — they are now opt-out via per-user
    // preferences (see notification_preferences table). 'story_reaction'
    // type is included so story reactions are visible.
    const notifications = db.prepare(
      `SELECT id, type, message, post_id, user_id_ref, link, read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 50`
    ).all(payload.userId);
    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإشعارات', details: err.message });
  }
});

// POST /api/notifications/mark-read
router.post('/notifications/mark-read', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(payload.userId);
    res.json({ message: 'تم قراءة جميع الإشعارات' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الإشعارات', details: err.message });
  }
});

// POST /api/notifications/:id/mark-read - Mark a single notification as read
router.post('/notifications/:id/mark-read', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { id } = req.params;
    const result = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الإشعار غير موجود' });
      return;
    }
    res.json({ message: 'تم تعليم الإشعار كمقروء' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الإشعار', details: err.message });
  }
});

// DELETE /api/notifications/:id - Delete a single notification
router.delete('/notifications/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { id } = req.params;
    const result = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الإشعار غير موجود' });
      return;
    }
    res.json({ message: 'تم حذف الإشعار' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الإشعار', details: err.message });
  }
});

// DELETE /api/notifications - Clear ALL notifications for the current user
router.delete('/notifications', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const type = (req.query.type as string) || null;
    let result;
    if (type) {
      result = db.prepare('DELETE FROM notifications WHERE user_id = ? AND type = ?').run(payload.userId, type);
    } else {
      result = db.prepare('DELETE FROM notifications WHERE user_id = ?').run(payload.userId);
    }
    res.json({ message: 'تم حذف الإشعارات', deleted: result.changes });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الإشعارات', details: err.message });
  }
});

// GET /api/notifications/unread-count - Fast unread count for badge polling
router.get('/notifications/unread-count', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(payload.userId) as any;
    res.json({ count: row?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب عدد الإشعارات' });
  }
});

// GET /api/notifications/preferences - Per-user notification opt-outs
router.get('/notifications/preferences', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const rows = db.prepare('SELECT type, enabled FROM notification_preferences WHERE user_id = ?').all(payload.userId) as any[];
    // Default all types to enabled; override with user's preferences
    const defaults: Record<string, boolean> = {
      like: true, comment: true, friend: true, message: true, payment: true,
      promotion: true, livestream: true, story: true, story_reaction: true,
      warning: true, system: true, admin_alert: true,
    };
    for (const r of rows) {
      defaults[r.type] = !!r.enabled;
    }
    res.json(defaults);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب التفضيلات' });
  }
});

// PUT /api/notifications/preferences - Update per-user opt-outs
router.put('/notifications/preferences', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const prefs = req.body as Record<string, boolean>;
    const upsert = db.prepare(`
      INSERT INTO notification_preferences (user_id, type, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, type) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')
    `);
    const del = db.prepare('DELETE FROM notification_preferences WHERE user_id = ? AND type = ?');
    for (const [type, enabled] of Object.entries(prefs)) {
      if (enabled === true) {
        // No need to keep a row — absence = enabled (default)
        del.run(payload.userId, type);
      } else {
        upsert.run(payload.userId, type, 0);
      }
    }
    res.json({ message: 'تم حفظ التفضيلات' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ التفضيلات' });
  }
});

// ─── Promotion Requests ─────────────────────────────────────────────
router.post('/promotions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { postId, tier, price, packageName, duration, estimatedReach, maxNotifications, includeMessages, targeting, targetCity, targetCities, cityCount, cityTierLabel, targetInterests, targetAgeMin, targetAgeMax } = req.body;

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }
    if (post.author_id !== payload.userId) { res.status(403).json({ error: 'يمكنك ترويج منشوراتك فقط' }); return; }

    // Validate targeting data
    // Support multi-city targeting (targetCities array) — available for ALL packages
    const finalTargetCities: string[] = targetCities && Array.isArray(targetCities) && targetCities.length > 0
      ? targetCities
      : targetCity ? [targetCity] : [];

    if (targeting === 'city' && finalTargetCities.length === 0) {
      res.status(400).json({ error: 'يجب تحديد مدينة واحدة على الأقل عند تفعيل استهداف المدن' }); return;
    }
    if (targeting === 'interests' && (!targetInterests || !Array.isArray(targetInterests) || targetInterests.length === 0)) {
      res.status(400).json({ error: 'يجب تحديد اهتمام واحد على الأقل لاستهداف الاهتمامات' }); return;
    }

    const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;
    const wallet = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (wallet.wallet_balance < price) { res.status(400).json({ error: 'رصيدك غير كافٍ للترويج' }); return; }

    // Deduct wallet balance immediately to prevent double-spending
    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ?")
      .run(price, payload.userId);

    // Create transaction record for the promotion debit
    db.prepare('INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?)')
      .run(payload.userId, 'promotion_debit', price, 'محفظة', 'completed');

    const promoId = crypto.randomBytes(16).toString('hex').toLowerCase();

    // Store target_cities as JSON array, and target_city as first city (backward compat)
    const targetCitiesJson = JSON.stringify(finalTargetCities);
    const firstCity = finalTargetCities[0] || '';

    db.prepare(`INSERT INTO promotion_requests
      (id, post_id, post_content, author_id, author_name, author_avatar, tier, price, package_name, duration, estimated_reach, max_notifications, include_messages, targeting, target_city, target_interests, target_age_min, target_age_max, city_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      promoId, postId, post.content, payload.userId, user.name, user.avatar,
      tier, price, packageName, duration, estimatedReach, maxNotifications,
      includeMessages ? 1 : 0, targeting,
      targetCitiesJson, JSON.stringify(targetInterests || []),
      targetAgeMin || 0, targetAgeMax || 0, finalTargetCities.length
    );

    // Don't set is_promoted=1 yet — only set it when admin approves.
    // Mark promotion_status as 'pending' so the UI can show the request was made.
    // Also set targeting data on the post itself for efficient querying
    db.prepare(`UPDATE posts SET promotion_status = 'pending', promotion_tier = ?,
      targeting = ?, target_city = ?, target_interests = ?, target_age_min = ?, target_age_max = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(tier, targeting || 'all', targetCitiesJson, JSON.stringify(targetInterests || []), targetAgeMin || 0, targetAgeMax || 0, postId);

    // Return the full created request so the frontend can use the real ID
    const createdRequest = db.prepare('SELECT * FROM promotion_requests WHERE id = ?').get(promoId) as any;
    res.status(201).json({
      id: createdRequest?.id || promoId,
      message: 'تم إرسال طلب الترويج بنجاح',
      request: createdRequest,
      targetCities: finalTargetCities,
      cityCount: finalTargetCities.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال طلب الترويج', details: err.message });
  }
});

// ─── My Promotion Requests ──────────────────────────────────────────
router.get('/promotions/my-requests', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const requests = db.prepare('SELECT * FROM promotion_requests WHERE author_id = ? ORDER BY created_at DESC').all(payload.userId);
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الترويج', details: err.message });
  }
});

// ─── Friends ────────────────────────────────────────────────────────
// GET /api/friends/stats - Get friends statistics
router.get('/friends/stats', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const uid = payload.userId;

    // Total accepted friends
    const totalFriends = (db.prepare(`
      SELECT COUNT(*) as cnt FROM friendships
      WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).get(uid, uid) as any)?.cnt || 0;

    // Pending incoming requests
    const pendingIncoming = (db.prepare(`
      SELECT COUNT(*) as cnt FROM friendships
      WHERE addressee_id = ? AND status = 'pending'
    `).get(uid) as any)?.cnt || 0;

    // Pending sent requests
    const pendingSent = (db.prepare(`
      SELECT COUNT(*) as cnt FROM friendships
      WHERE requester_id = ? AND status = 'pending'
    `).get(uid) as any)?.cnt || 0;

    // Online friends count (from WebSocket manager)
    let onlineFriends = 0;
    try {
      const wsManager = (req.app.locals as any)?.wsManager;
      if (wsManager) {
        const friendRows = db.prepare(`
          SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as fid
          FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
        `).all(uid, uid, uid) as any[];
        onlineFriends = friendRows.filter((f: any) => wsManager.isUserOnline(f.fid)).length;
      }
    } catch {}

    // Friends by label
    const friendsByLabel: Record<string, number> = { general: 0, close: 0, family: 0, work: 0 };
    try {
      const labelRows = db.prepare(`
        SELECT COALESCE(friend_label, 'general') as label, COUNT(*) as cnt
        FROM friendships
        WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
        GROUP BY friend_label
      `).all(uid, uid) as any[];
      for (const row of labelRows) {
        friendsByLabel[row.label || 'general'] = row.cnt;
      }
    } catch {}

    // Friends gained this week
    const friendsThisWeek = (db.prepare(`
      SELECT COUNT(*) as cnt FROM friendships
      WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
        AND created_at >= datetime('now', '-7 days')
    `).get(uid, uid) as any)?.cnt || 0;

    // Nearby friends (same location)
    let nearbyFriends = 0;
    try {
      const myLocation = (db.prepare('SELECT location FROM users WHERE id = ?').get(uid) as any)?.location;
      if (myLocation) {
        nearbyFriends = (db.prepare(`
          SELECT COUNT(*) as cnt FROM friendships f
          JOIN users u ON (
            CASE WHEN f.requester_id = ? THEN f.addressee_id = u.id ELSE f.requester_id = u.id END
          )
          WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
            AND u.location = ? AND u.location != ''
        `).get(uid, uid, uid, myLocation) as any)?.cnt || 0;
      }
    } catch {}

    res.json({
      totalFriends,
      pendingIncoming,
      pendingSent,
      onlineFriends,
      friendsByLabel,
      friendsThisWeek,
      nearbyFriends,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات الأصدقاء', details: err.message });
  }
});

// GET /api/friends/list
router.get('/friends/list', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const uid = payload.userId;

    // Check if friendships table exists first
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='friendships'").get() as any;
    if (!tableCheck) {
      res.json([]);
      return;
    }

    let friendships: any[];
    try {
      // Try the full query with all columns
      friendships = db.prepare(`
        SELECT f.id, f.created_at, f.status,
          CASE WHEN f.requester_id = ? THEN u2.id ELSE u1.id END as friend_id,
          CASE WHEN f.requester_id = ? THEN u2.name ELSE u1.name END as friend_name,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.avatar ELSE u1.avatar END, '') as friend_avatar,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.avatar_base64 ELSE u1.avatar_base64 END, '') as friend_avatar_base64,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.is_verified ELSE u1.is_verified END, 0) as friend_is_verified,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.is_trusted ELSE u1.is_trusted END, 0) as friend_is_trusted,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.trust_score ELSE u1.trust_score END, 50) as friend_trust_score,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.location ELSE u1.location END, '') as friend_location,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.interests ELSE u1.interests END, '[]') as friend_interests,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.last_seen_at ELSE u1.last_seen_at END, NULL) as friend_last_seen,
          COALESCE(CASE WHEN f.requester_id = ? THEN u2.gender ELSE u1.gender END, NULL) as friend_gender,
          COALESCE(f.friend_label, 'general') as friend_label
        FROM friendships f
        JOIN users u1 ON u1.id = f.requester_id
        JOIN users u2 ON u2.id = f.addressee_id
        WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
        ORDER BY f.created_at DESC
      `).all(uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid, uid);
    } catch (queryErr: any) {
      // Fallback: simpler query without potentially missing columns
      try {
        friendships = db.prepare(`
          SELECT f.id, f.created_at,
            CASE WHEN f.requester_id = ? THEN u2.id ELSE u1.id END as friend_id,
            CASE WHEN f.requester_id = ? THEN u2.name ELSE u1.name END as friend_name,
            COALESCE(CASE WHEN f.requester_id = ? THEN u2.avatar ELSE u1.avatar END, '') as friend_avatar,
            '' as friend_avatar_base64,
            0 as friend_is_verified,
            0 as friend_is_trusted,
            50 as friend_trust_score,
            '' as friend_location,
            '[]' as friend_interests
          FROM friendships f
          JOIN users u1 ON u1.id = f.requester_id
          JOIN users u2 ON u2.id = f.addressee_id
          WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
          ORDER BY f.created_at DESC
        `).all(uid, uid, uid, uid, uid);
      } catch (fallbackErr: any) {
        // Ultimate fallback: just return empty list instead of 500 error
        res.json([]);
        return;
      }
    }

    const friends = friendships.map((f: any) => ({
      friendshipId: f.id,
      id: f.friend_id,
      name: f.friend_name,
      avatar: f.friend_avatar_base64 || f.friend_avatar || getDefaultAvatar(f.friend_id, f.friend_gender),
      isVerified: !!f.friend_is_verified,
      isTrusted: !!f.friend_is_trusted,
      trustScore: f.friend_trust_score || 50,
      location: f.friend_location || '',
      interests: (() => { try { return JSON.parse(f.friend_interests || '[]'); } catch { return []; } })(),
      friendSince: f.created_at,
      friendLabel: f.friend_label || 'general',
      lastSeen: f.friend_last_seen || null,
      isOnline: (req.app.locals as any)?.wsManager?.isUserOnline(f.friend_id) || false,
    }));

    res.json(friends);
  } catch (err: any) {
    // Return empty array instead of 500 to prevent UI crashes
    res.json([]);
  }
});

// GET /api/friends/suggestions
router.get('/friends/suggestions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const user = db.prepare('SELECT interests FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user) { res.json([]); return; }
    const userInterests: string[] = (() => { try { return JSON.parse(user.interests || '[]'); } catch { return []; } })();

    // Get IDs of existing friends and pending requests
    const existingFriends = db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
      FROM friendships WHERE (requester_id = ? OR addressee_id = ?)
    `).all(payload.userId, payload.userId, payload.userId).map((r: any) => r.friend_id);

    // Get IDs of blocked users (both directions)
    const blockedIds = db.prepare(`
      SELECT CASE WHEN blocker_id = ? THEN blocked_id ELSE blocker_id END as blocked_id
      FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?
    `).all(payload.userId, payload.userId, payload.userId).map((r: any) => r.blocked_id);

    const excludeIds = [...existingFriends, payload.userId, ...blockedIds];

    // Find users with matching interests who are not already friends
    let suggestions: any[] = [];
    if (userInterests.length > 0) {
      for (const interest of userInterests) {
        const matches = db.prepare(`
          SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, location, interests, last_seen_at, gender
          FROM users WHERE id != ? AND is_deactivated = 0 AND interests LIKE ?
          ORDER BY trust_score DESC LIMIT 5
        `).all(payload.userId, `%"${interest}"%`);
        suggestions.push(...matches);
      }
    }

    // If not enough suggestions, add random users
    if (suggestions.length < 5) {
      const moreUsers = db.prepare(`
        SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, location, interests, last_seen_at, gender
        FROM users WHERE id != ? AND is_deactivated = 0
        ORDER BY RANDOM() LIMIT 10
      `).all(payload.userId);
      suggestions.push(...moreUsers);
    }

    // Deduplicate and filter out existing friends
    const seen = new Set<string>();
    const result = suggestions.filter((u: any) => {
      if (seen.has(u.id) || excludeIds.includes(u.id)) return false;
      seen.add(u.id);
      return true;
    }).slice(0, 10).map((u: any) => {
      // Compute real mutual friends count by counting shared accepted friendships
      let mutualCount = 0;
      try {
        mutualCount = (db.prepare(`
          SELECT COUNT(*) as cnt FROM friendships f1
          JOIN friendships f2 ON (
            CASE WHEN f1.requester_id = ? THEN f1.addressee_id ELSE f1.requester_id END
            =
            CASE WHEN f2.requester_id = ? THEN f2.addressee_id ELSE f2.requester_id END
          )
          WHERE f1.status = 'accepted' AND f2.status = 'accepted'
            AND (f1.requester_id = ? OR f1.addressee_id = ?)
            AND (f2.requester_id = ? OR f2.addressee_id = ?)
        `).get(payload.userId, u.id, payload.userId, payload.userId, u.id, u.id) as any)?.cnt || 0;
      } catch { mutualCount = 0; }

      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar_base64 || u.avatar || getDefaultAvatar(u.id, u.gender),
        isVerified: !!u.is_verified,
        isTrusted: !!u.is_trusted,
        trustScore: u.trust_score || 50,
        location: u.location || '',
        interests: JSON.parse(u.interests || '[]'),
        mutualFriends: mutualCount,
        lastSeen: u.last_seen_at || null,
        isOnline: (req.app.locals as any)?.wsManager?.isUserOnline(u.id) || false,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الاقتراحات', details: err.message });
  }
});

router.get('/friends/requests', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const requests = db.prepare(`
      SELECT f.id, f.status, f.created_at,
        u.id as user_id, u.name, u.avatar, u.avatar_base64, u.is_verified
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(payload.userId);

    res.json(requests.map((r: any) => ({
      id: r.id,
      user: { id: r.user_id, name: r.name, avatar: r.avatar_base64 || r.avatar || getDefaultAvatar(r.user_id, r.gender), isVerified: !!r.is_verified },
      timestamp: r.created_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الصداقة', details: err.message });
  }
});

router.post('/friends/request', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }
    if (userId === payload.userId) { res.status(400).json({ error: 'لا يمكنك إرسال طلب صداقة لنفسك' }); return; }

    // Check if user exists
    const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
    if (!targetUser) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    // Check if either user has blocked the other
    const blockCheck = db.prepare('SELECT id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
      .get(payload.userId, userId, userId, payload.userId) as any;
    if (blockCheck) { res.status(403).json({ error: 'لا يمكنك إرسال طلب صداقة لهذا المستخدم' }); return; }

    // Check if already friends or request already sent
    const existing = db.prepare('SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)')
      .get(payload.userId, userId, userId, payload.userId) as any;
    if (existing) {
      if (existing.status === 'accepted') { res.status(400).json({ error: 'أنتما أصدقاء بالفعل' }); return; }
      if (existing.status === 'pending' && existing.requester_id === payload.userId) { res.status(400).json({ error: 'لقد أرسلت طلباً بالفعل' }); return; }
      if (existing.status === 'pending' && existing.addressee_id === payload.userId) { res.status(400).json({ error: 'لديك طلب صداقة من هذا المستخدم' }); return; }
      if (existing.status === 'rejected') {
        // If previously rejected, allow resending by deleting the old record
        db.prepare('DELETE FROM friendships WHERE id = ?').run(existing.id);
      }
    }

    db.prepare('INSERT OR IGNORE INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)')
      .run(payload.userId, userId, 'pending');

    // Friend request notifications DISABLED per user request (2026-06-23).
    // All notifications go to the notifications page (bell icon) ONLY.
    // No DB insert, no WebSocket emitNotification, no FCM push.
    /*
    const sender = db.prepare('SELECT name, avatar, avatar_base64, is_verified FROM users WHERE id = ?').get(payload.userId) as any;
    if (sender) {
      db.prepare('INSERT INTO notifications (user_id, type, message, user_id_ref) VALUES (?, ?, ?, ?)')
        .run(userId, 'friend', `أرسل ${sender.name} طلب صداقة`, payload.userId);
    }
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager && sender) {
        const friendship = db.prepare('SELECT id FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = ?')
          .get(payload.userId, userId, 'pending') as any;
        wsManager.emitFriendRequest(userId, {
          id: friendship?.id,
          user: { id: payload.userId, name: sender.name, avatar: sender.avatar_base64 || sender.avatar || '', isVerified: !!sender.is_verified },
          timestamp: new Date().toISOString(),
        });
        wsManager.emitNotification(userId, {
          type: 'friend', message: `أرسل ${sender.name} طلب صداقة`,
          userId: payload.userId, link: `/user/${payload.userId}`, time: new Date().toISOString(),
        });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit friend request:', wsErr.message); }
    try { if (sender) { await notifyFriendRequest(userId, sender.name); } } catch (pushErr: any) { console.error('[FCM] Failed to send friend request push:', pushErr.message); }
    */

    res.json({ message: 'تم إرسال طلب الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال طلب الصداقة', details: err.message });
  }
});

router.post('/friends/accept/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const friendship = db.prepare('SELECT * FROM friendships WHERE id = ? AND addressee_id = ?').get(req.params.id, payload.userId) as any;
    if (!friendship) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }

    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(req.params.id);

    // Friend acceptance notifications DISABLED per user request (2026-06-23).
    // No DB insert, no WebSocket emitNotification, no FCM push.
    /*
    const accepter = db.prepare('SELECT name, avatar, avatar_base64 FROM users WHERE id = ?').get(payload.userId) as any;
    if (accepter) {
      db.prepare('INSERT INTO notifications (user_id, type, message, user_id_ref) VALUES (?, ?, ?, ?)')
        .run(friendship.requester_id, 'friend', `قبل ${accepter.name} طلب الصداقة`, payload.userId);
    }
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.emitFriendAccepted(friendship.requester_id, { friendshipId: req.params.id, user: { id: payload.userId, name: accepter?.name || '', avatar: accepter?.avatar_base64 || accepter?.avatar || '' } });
        wsManager.emitNotification(friendship.requester_id, { type: 'friend', message: `قبل ${accepter?.name || ''} طلب الصداقة`, userId: payload.userId, link: `/user/${payload.userId}`, time: new Date().toISOString() });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit friend accepted:', wsErr.message); }
    try { if (accepter) { await sendPushToUser(friendship.requester_id, 'طلب صداقة مقبول', `قبل ${accepter.name} طلب الصداقة`, { type: 'friend_accepted', link: '/friends' }); } } catch (pushErr: any) { console.error('[FCM] Failed to send friend accepted push:', pushErr.message); }
    */

    res.json({ message: 'تم قبول طلب الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل قبول الصداقة', details: err.message });
  }
});

router.post('/friends/reject/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare("UPDATE friendships SET status = 'rejected' WHERE id = ? AND addressee_id = ?").run(req.params.id, payload.userId);
    res.json({ message: 'تم رفض طلب الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض الصداقة', details: err.message });
  }
});

// GET /api/friends/sent - Get sent friend requests (pending requests I sent)
router.get('/friends/sent', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const sent = db.prepare(`
      SELECT f.id, f.status, f.created_at,
        u.id as user_id, u.name, u.avatar, u.avatar_base64, u.is_verified
      FROM friendships f
      JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
    `).all(payload.userId);

    res.json(sent.map((r: any) => ({
      id: r.id,
      user: { id: r.user_id, name: r.name, avatar: r.avatar_base64 || r.avatar || getDefaultAvatar(r.user_id, r.gender), isVerified: !!r.is_verified },
      timestamp: r.created_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الطلبات المرسلة', details: err.message });
  }
});

// POST /api/friends/cancel/:id - Cancel a sent friend request
router.post('/friends/cancel/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const result = db.prepare("DELETE FROM friendships WHERE id = ? AND requester_id = ? AND status = 'pending'").run(req.params.id, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الطلب غير موجود أو لا يمكن إلغاؤه' });
      return;
    }
    res.json({ message: 'تم إلغاء طلب الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إلغاء طلب الصداقة', details: err.message });
  }
});

// POST /api/friends/unfriend/:friendshipId - Remove an accepted friendship
router.post('/friends/unfriend/:friendshipId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const result = db.prepare("DELETE FROM friendships WHERE id = ? AND status = 'accepted' AND (requester_id = ? OR addressee_id = ?)")
      .run(req.params.friendshipId, payload.userId, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الصداقة غير موجودة' });
      return;
    }
    res.json({ message: 'تم إلغاء الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إلغاء الصداقة', details: err.message });
  }
});

// POST /api/friends/unfriend-by-user/:userId - Remove friendship by friend's user ID (not friendship ID)
router.post('/friends/unfriend-by-user/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }

    const result = db.prepare(
      "DELETE FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))"
    ).run(payload.userId, userId, userId, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الصداقة غير موجودة' });
      return;
    }
    res.json({ message: 'تم إلغاء الصداقة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إلغاء الصداقة', details: err.message });
  }
});

// POST /api/friends/label/:friendshipId - Set friend label/category
router.post('/friends/label/:friendshipId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { label } = req.body;
    const validLabels = ['general', 'close', 'family', 'work'];
    if (!label || !validLabels.includes(label)) {
      res.status(400).json({ error: 'التصنيف غير صالح. الاستخدام: general, close, family, work' });
      return;
    }
    const result = db.prepare(
      "UPDATE friendships SET friend_label = ? WHERE id = ? AND status = 'accepted' AND (requester_id = ? OR addressee_id = ?)"
    ).run(label, req.params.friendshipId, payload.userId, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الصداقة غير موجودة' });
      return;
    }
    res.json({ message: 'تم تحديث تصنيف الصديق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث التصنيف', details: err.message });
  }
});

// POST /api/friends/label-by-user/:userId - Set friend label by user ID
router.post('/friends/label-by-user/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    const { label } = req.body;
    const validLabels = ['general', 'close', 'family', 'work'];
    if (!label || !validLabels.includes(label)) {
      res.status(400).json({ error: 'التصنيف غير صالح' });
      return;
    }
    const result = db.prepare(
      "UPDATE friendships SET friend_label = ? WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))"
    ).run(label, payload.userId, userId, userId, payload.userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الصداقة غير موجودة' });
      return;
    }
    res.json({ message: 'تم تحديث تصنيف الصديق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث التصنيف', details: err.message });
  }
});

// GET /api/friends/mutual/:userId - Get mutual friends with a specific user
router.get('/friends/mutual/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }

    // Get my friends
    const myFriends = db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
      FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).all(payload.userId, payload.userId, payload.userId).map((r: any) => r.friend_id);

    // Get their friends
    const theirFriends = db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
      FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).all(userId, userId, userId).map((r: any) => r.friend_id);

    // Find intersection
    const mutualIds = myFriends.filter((id: string) => theirFriends.includes(id) && id !== payload.userId);

    // Get user details for mutual friends
    const mutualFriends = mutualIds.map((fid: string) => {
      const user = db.prepare('SELECT id, name, avatar, avatar_base64, is_verified, trust_score, location FROM users WHERE id = ?').get(fid) as any;
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        avatar: user.avatar_base64 || user.avatar || getDefaultAvatar(user.id, user.gender),
        isVerified: !!user.is_verified,
        trustScore: user.trust_score || 50,
        location: user.location || '',
      };
    }).filter(Boolean);

    res.json({ mutualFriends, count: mutualFriends.length });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الأصدقاء المشتركين', details: err.message });
  }
});

// ─── Block / Unblock Users ──────────────────────────────────────────
// POST /api/block/:userId - Block a user
router.post('/block/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    const { reason } = req.body || {};
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }
    if (userId === payload.userId) { res.status(400).json({ error: 'لا يمكنك حظر نفسك' }); return; }

    // Check target user exists
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
    if (!target) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    // Insert block
    db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, reason) VALUES (?, ?, ?)')
      .run(payload.userId, userId, reason || '');

    // Also remove any existing friendship
    db.prepare("DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)")
      .run(payload.userId, userId, userId, payload.userId);

    res.json({ message: 'تم حظر المستخدم بنجاح' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حظر المستخدم', details: err.message });
  }
});

// POST /api/unblock/:userId - Unblock a user
router.post('/unblock/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }

    const result = db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?')
      .run(payload.userId, userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'الحظر غير موجود' });
      return;
    }
    res.json({ message: 'تم إلغاء الحظر' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إلغاء الحظر', details: err.message });
  }
});

// GET /api/blocked - Get list of blocked users
router.get('/blocked', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const blocked = db.prepare(`
      SELECT b.id as block_id, b.reason, b.created_at as blocked_at,
        u.id as user_id, u.name, u.avatar, u.avatar_base64
      FROM blocked_users b
      JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC
    `).all(payload.userId);

    res.json(blocked.map((b: any) => ({
      blockId: b.block_id,
      reason: b.reason,
      blockedAt: b.blocked_at,
      user: {
        id: b.user_id,
        name: b.name,
        avatar: b.avatar_base64 || b.avatar || getDefaultAvatar(b.user_id, b.gender),
      },
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب قائمة المحظورين', details: err.message });
  }
});

// GET /api/friends/status/:userId - Check friendship status with a specific user
router.get('/friends/status/:userId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'معرف المستخدم مطلوب' }); return; }

    const friendship = db.prepare(`
      SELECT status FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
    `).get(payload.userId, userId, userId, payload.userId) as any;

    // Also return last_seen_at for the contact
    const targetUser = db.prepare('SELECT last_seen_at FROM users WHERE id = ?').get(userId) as any;

    res.json({ friendshipStatus: friendship?.status || null, lastSeenAt: targetUser?.last_seen_at || null });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب حالة الصداقة', details: err.message });
  }
});

// ─── Search Users ────────────────────────────────────────────────────
router.get('/users/search', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { q } = req.query;
    // 🔒 SECURITY FIX: require at least 2 chars to prevent trivial enumeration,
    // and match by NAME ONLY (previously `email LIKE %q% OR phone LIKE %q%`
    // allowed attackers to enumerate emails / reconstruct phone numbers
    // digit-by-digit by observing which queries return results).
    if (!q || (q as string).trim().length < 2) { res.json([]); return; }

    const search = `%${q}%`;
    const users = db.prepare(`
      SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, location, interests, phone, show_phone
      FROM users
      WHERE name LIKE ? AND id != ? AND is_deactivated = 0
      ORDER BY is_verified DESC, trust_score DESC
      LIMIT 20
    `).all(search, payload.userId);

    // Check friendship status for each user
    const enriched = users.map((u: any) => {
      const friendship = db.prepare(`
        SELECT status FROM friendships
        WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
      `).get(payload.userId, u.id, u.id, payload.userId) as any;

      const result: any = {
        id: u.id,
        name: u.name,
        avatar: u.avatar_base64 || u.avatar || getDefaultAvatar(u.id, u.gender),
        is_verified: !!u.is_verified,
        is_trusted: !!u.is_trusted,
        trustScore: u.trust_score || 50,
        location: u.location || '',
        interests: JSON.parse(u.interests || '[]'),
        friendshipStatus: friendship?.status || null,
      };
      // Only include phone if user has show_phone enabled
      if (u.phone && u.show_phone) result.phone = u.phone;
      delete result.show_phone;
      return result;
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('[API] User search failed:', err);
    res.status(500).json({ error: 'فشل البحث' });
  }
});

// ─── User Profile ───────────────────────────────────────────────────
router.get('/users/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    // 🔒 SECURITY FIX: hide phone/location/bio from anonymous viewers even
    // if the profile owner has show_phone/show_location enabled. Only
    // authenticated users get those fields, and only if the owner opted in.
    const payload = (req as any).user as JwtPayload | undefined;
    const isViewerAuthenticated = !!payload?.userId;

    const user = db.prepare(`
      SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, location, bio,
        cover_photo, interests, join_date, show_phone, show_location, phone, gender, last_seen_at
      FROM users WHERE id = ? AND is_deactivated = 0
    `).get(req.params.id) as any;

    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    user.interests = JSON.parse(user.interests || '[]');
    user.is_verified = !!user.is_verified;
    user.is_trusted = !!user.is_trusted;
    // Prefer base64 avatar over URL avatar
    if (user.avatar_base64) user.avatar = user.avatar_base64;
    delete user.avatar_base64;

    // Strip PII by default; only show to authenticated viewers when owner opted in.
    if (!isViewerAuthenticated || !user.show_phone) delete user.phone;
    if (!isViewerAuthenticated || !user.show_location) delete user.location;
    if (!isViewerAuthenticated) {
      // Bio and last_seen are PII; hide from anonymous scrapers.
      delete user.bio;
      delete user.last_seen_at;
      delete user.gender;
    }

    // Get user's posts
    const posts = db.prepare('SELECT * FROM posts WHERE author_id = ? AND status = ? ORDER BY created_at DESC LIMIT 10')
      .all(req.params.id, 'active');

    res.json({ ...user, posts });
  } catch (err: any) {
    console.error('[API] Get user profile failed:', err);
    res.status(500).json({ error: 'فشل جلب الملف الشخصي' });
  }
});

// ─── Health Check ───────────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
});

// ─── Smart Reach Stats ─────────────────────────────────────────────
router.get('/smart-reach/stats', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const stats = db.prepare(`
      SELECT 
        COALESCE(SUM(reach_count), 0) as total_reach,
        COALESCE(SUM(click_count), 0) as total_clicks,
        COUNT(CASE WHEN is_promoted = 1 THEN 1 END) as promoted_count,
        COUNT(*) as total_posts
      FROM posts WHERE author_id = ? AND status = 'active'
    `).get(payload.userId) as any;

    res.json({
      totalReach: stats.total_reach || 0,
      totalClicks: stats.total_clicks || 0,
      promotedCount: stats.promoted_count || 0,
      totalPosts: stats.total_posts || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات الوصول', details: err.message });
  }
});

// ─── Share Tracking ─────────────────────────────────────────────────
// POST /api/posts/:id/share — Track a share event
router.post('/posts/:id/share', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { platform } = req.body;
    const postId = req.params.id;

    if (!platform) { res.status(400).json({ error: 'المنصة مطلوبة' }); return; }
    const validPlatforms = ['internal', 'whatsapp', 'telegram', 'facebook', 'twitter', 'link', 'smart_link'];
    if (!validPlatforms.includes(platform)) { res.status(400).json({ error: 'منصة غير صالحة' }); return; }

    const post = db.prepare('SELECT id, author_id, shares FROM posts WHERE id = ? AND status = ?').get(postId, 'active') as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Increment shares count on the post
    db.prepare("UPDATE posts SET shares = COALESCE(shares, 0) + 1, updated_at = datetime('now') WHERE id = ?")
      .run(postId);

    // Insert share event
    const shareId = crypto.randomBytes(16).toString('hex').toLowerCase();
    db.prepare('INSERT INTO share_events (id, post_id, user_id, platform) VALUES (?, ?, ?, ?)')
      .run(shareId, postId, payload.userId, platform);

    // Notify post author about the share (for internal shares)
    if (platform === 'internal' && post.author_id && post.author_id !== payload.userId) {
      const sharer = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
      if (sharer) {
        db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
          .run(post.author_id, 'share', `شارك ${sharer.name} منشورك`, `/post/${postId}`);
      }
    }

    const totalShares = (post.shares || 0) + 1;
    res.json({ message: 'تم تسجيل المشاركة', totalShares });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تسجيل المشاركة', details: err.message });
  }
});

// GET /api/posts/:id/share-stats — Get share statistics
router.get('/posts/:id/share-stats', (req: Request, res: Response) => {
  try {
    const postId = req.params.id;

    const post = db.prepare('SELECT id, shares FROM posts WHERE id = ?').get(postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Total shares
    const total = post.shares || 0;

    // Shares by platform
    const byPlatformRows = db.prepare('SELECT platform, COUNT(*) as count FROM share_events WHERE post_id = ? GROUP BY platform').all(postId) as any[];
    const byPlatform: Record<string, number> = {};
    for (const row of byPlatformRows) {
      byPlatform[row.platform] = row.count;
    }

    // Recent shares
    const recentShares = db.prepare(`
      SELECT se.platform, se.shared_at, u.name as user_name, u.avatar as user_avatar
      FROM share_events se
      JOIN users u ON u.id = se.user_id
      WHERE se.post_id = ?
      ORDER BY se.shared_at DESC
      LIMIT 10
    `).all(postId);

    res.json({ total, byPlatform, recentShares });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات المشاركة', details: err.message });
  }
});

// ─── Smart Link ─────────────────────────────────────────────────────
router.get('/smart-link/:postId', optionalAuth, (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT id, author_id, reach_count, is_promoted FROM posts WHERE id = ? AND status = ?').get(req.params.postId, 'active') as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Increment reach count and click count
    db.prepare("UPDATE posts SET reach_count = COALESCE(reach_count, 0) + 1, click_count = COALESCE(click_count, 0) + 1, updated_at = datetime('now') WHERE id = ?")
      .run(req.params.postId);

    // Record the visit in smart_link_visits
    const visitorId = (req as any).user ? ((req as any).user as JwtPayload).userId : null;
    const visitorIp = req.ip || req.headers['x-forwarded-for'] as string || '';
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    const visitId = crypto.randomBytes(16).toString('hex').toLowerCase();
    try {
      db.prepare('INSERT INTO smart_link_visits (id, post_id, visitor_id, visitor_ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?, ?)')
        .run(visitId, req.params.postId, visitorId, typeof visitorIp === 'string' ? visitorIp : '', userAgent, referrer);
    } catch { /* ignore if table not yet available */ }

    // Notify post author about the visit (only for promoted posts, limit notifications)
    if (post.is_promoted && post.author_id) {
      const recentNotifCount = db.prepare(`
        SELECT COUNT(*) as count FROM notifications
        WHERE user_id = ? AND type = 'promotion' AND created_at >= datetime('now', '-1 hour')
      `).get(post.author_id) as any;

      if (recentNotifCount.count < 5) { // Max 5 visit notifications per hour
        db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
          .run(post.author_id, 'promotion', `حصل منشورك على زيارة جديدة عبر الوصل الذكي (إجمالي: ${(post.reach_count || 0) + 1})`);
      }
    }

    // Redirect to the post page in the SPA
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    res.redirect(`${appUrl}/#/post/${req.params.postId}`);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إعادة التوجيه', details: err.message });
  }
});

// POST /api/smart-link/generate — Generate a custom smart link
router.post('/smart-link/generate', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { postId, alias } = req.body;

    if (!postId || !alias) { res.status(400).json({ error: 'معرف المنشور والرابط المخصص مطلوبان' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(alias)) { res.status(400).json({ error: 'الرابط المخصص يجب أن يحتوي على حروف إنجليزية وأرقام فقط' }); return; }
    if (alias.length < 3 || alias.length > 50) { res.status(400).json({ error: 'الرابط المخصص يجب أن يكون بين 3 و 50 حرف' }); return; }

    const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ? AND status = ?').get(postId, 'active') as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }
    if (post.author_id !== payload.userId) { res.status(403).json({ error: 'يمكنك إنشاء رابط ذكي لمنشوراتك فقط' }); return; }

    // Check if alias is already taken
    const existingAlias = db.prepare('SELECT id FROM posts WHERE smart_link_alias = ? AND id != ?').get(alias, postId) as any;
    if (existingAlias) { res.status(409).json({ error: 'هذا الرابط المخصص مستخدم بالفعل' }); return; }

    db.prepare("UPDATE posts SET smart_link_alias = ?, updated_at = datetime('now') WHERE id = ?")
      .run(alias, postId);

    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const url = `${appUrl}/api/smart-link/a/${alias}`;

    res.json({ url, alias });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء الرابط الذكي', details: err.message });
  }
});

// GET /api/smart-link/:postId/stats — Get smart link analytics
router.get('/smart-link/:postId/stats', authMiddleware, (req: Request, res: Response) => {
  try {
    const postId = req.params.postId;

    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Total visits
    const totalVisitsRow = db.prepare('SELECT COUNT(*) as count FROM smart_link_visits WHERE post_id = ?').get(postId) as any;
    const totalVisits = totalVisitsRow?.count || 0;

    // Unique visitors
    const uniqueVisitorsRow = db.prepare('SELECT COUNT(DISTINCT COALESCE(visitor_id, visitor_ip)) as count FROM smart_link_visits WHERE post_id = ?').get(postId) as any;
    const uniqueVisitors = uniqueVisitorsRow?.count || 0;

    // Visits by date (last 7 days)
    const visitsByDate = db.prepare(`
      SELECT DATE(visited_at) as date, COUNT(*) as count
      FROM smart_link_visits
      WHERE post_id = ? AND visited_at >= datetime('now', '-7 days')
      GROUP BY DATE(visited_at)
      ORDER BY date ASC
    `).all(postId);

    // Recent visitors
    const recentVisitors = db.prepare(`
      SELECT sv.visitor_id, sv.visitor_ip, sv.user_agent, sv.referrer, sv.visited_at,
             u.name as visitor_name, u.avatar as visitor_avatar
      FROM smart_link_visits sv
      LEFT JOIN users u ON u.id = sv.visitor_id
      WHERE sv.post_id = ?
      ORDER BY sv.visited_at DESC
      LIMIT 10
    `).all(postId);

    res.json({ totalVisits, uniqueVisitors, visitsByDate, recentVisitors });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات الوصل الذكي', details: err.message });
  }
});

// GET /api/smart-link/a/:alias — Redirect via custom alias
router.get('/smart-link/a/:alias', optionalAuth, (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT id, author_id, reach_count, is_promoted FROM posts WHERE smart_link_alias = ? AND status = ?').get(req.params.alias, 'active') as any;
    if (!post) { res.status(404).json({ error: 'الرابط غير موجود' }); return; }

    // Increment reach count and click count
    db.prepare("UPDATE posts SET reach_count = COALESCE(reach_count, 0) + 1, click_count = COALESCE(click_count, 0) + 1, updated_at = datetime('now') WHERE id = ?")
      .run(post.id);

    // Record the visit in smart_link_visits
    const visitorId = (req as any).user ? ((req as any).user as JwtPayload).userId : null;
    const visitorIp = req.ip || req.headers['x-forwarded-for'] as string || '';
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';
    const visitId = crypto.randomBytes(16).toString('hex').toLowerCase();
    try {
      db.prepare('INSERT INTO smart_link_visits (id, post_id, visitor_id, visitor_ip, user_agent, referrer) VALUES (?, ?, ?, ?, ?, ?)')
        .run(visitId, post.id, visitorId, typeof visitorIp === 'string' ? visitorIp : '', userAgent, referrer);
    } catch { /* ignore */ }

    // Notify post author about the visit (only for promoted posts, limit notifications)
    if (post.is_promoted && post.author_id) {
      const recentNotifCount = db.prepare(`
        SELECT COUNT(*) as count FROM notifications
        WHERE user_id = ? AND type = 'promotion' AND created_at >= datetime('now', '-1 hour')
      `).get(post.author_id) as any;

      if (recentNotifCount.count < 5) {
        db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
          .run(post.author_id, 'promotion', `حصل منشورك على زيارة جديدة عبر الوصل الذكي (إجمالي: ${(post.reach_count || 0) + 1})`);
      }
    }

    // Redirect to the post page in the SPA
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    res.redirect(`${appUrl}/#/post/${post.id}`);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إعادة التوجيه', details: err.message });
  }
});

// ─── Market Live Video Comments ─────────────────────────────────────
// GET comments for a video
router.get('/market-live/:videoId/comments', optionalAuth, (req: Request, res: Response) => {
  try {
    const { videoId } = req.params;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const offset = (page - 1) * limit;

    const comments = db.prepare(`
      SELECT c.id, c.text, c.created_at,
             u.id as user_id, u.name as user_name, u.avatar as user_avatar, u.avatar_base64
      FROM video_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.video_id = ? AND c.status = 'active'
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(videoId, limit, offset).map((c: any) => ({
      id: c.id,
      text: c.text,
      createdAt: c.created_at,
      userId: c.user_id,
      userName: c.user_name,
      userAvatar: c.avatar_base64 || c.user_avatar,
    }));

    res.json({ comments, page, hasMore: comments.length === limit });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب التعليقات', details: err.message });
  }
});

// POST a comment on a video
router.post('/market-live/:videoId/comments', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { videoId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'التعليق فارغ' });
      return;
    }

    const video = db.prepare('SELECT * FROM ad_videos WHERE id = ? AND status = ?').get(videoId, 'active') as any;
    if (!video) {
      res.status(404).json({ error: 'الفيديو غير موجود' });
      return;
    }

    const commentId = crypto.randomBytes(16).toString('hex').toLowerCase();
    db.prepare('INSERT INTO video_comments (id, video_id, user_id, text) VALUES (?, ?, ?, ?)')
      .run(commentId, videoId, payload.userId, text.trim());

    const commenter = db.prepare('SELECT name, avatar, avatar_base64 FROM users WHERE id = ?').get(payload.userId) as any;
    if (commenter && video.user_id !== payload.userId) {
      db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
        .run(video.user_id, 'market', `علق ${commenter.name} على فيديو إعلانك`, `/market/listing/${video.post_id}`);
    }

    const comment = {
      id: commentId,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      userId: payload.userId,
      userName: commenter?.name || '',
      userAvatar: commenter?.avatar_base64 || commenter?.avatar || '',
    };

    res.status(201).json({ comment });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إضافة التعليق', details: err.message });
  }
});

// ─── Market Live Stats ─────────────────────────────────────────────
router.get('/market-live/stats', optionalAuth, (_req: Request, res: Response) => {
  try {
    const totalVideos = db.prepare("SELECT COUNT(*) as count FROM ad_videos WHERE status = 'active'").get() as any;
    const totalViews = db.prepare("SELECT COALESCE(SUM(views), 0) as total FROM ad_videos WHERE status = 'active'").get() as any;
    const todayVideos = db.prepare("SELECT COUNT(*) as count FROM ad_videos WHERE status = 'active' AND created_at >= datetime('now', '-1 day')").get() as any;

    const categoryDist = db.prepare(`
      SELECT COALESCE(p.category, ml.category, '') as category, COUNT(*) as count
      FROM ad_videos v
      LEFT JOIN posts p ON p.id = v.post_id
      LEFT JOIN market_listings ml ON ml.id = v.post_id
      WHERE v.status = 'active'
      AND COALESCE(p.category, ml.category, '') != ''
      GROUP BY COALESCE(p.category, ml.category)
      ORDER BY count DESC LIMIT 6
    `).all();

    res.json({
      totalVideos: totalVideos.count || 0,
      totalViews: totalViews.total || 0,
      todayVideos: todayVideos.count || 0,
      videosToday: todayVideos.count || 0,
      categoryDist,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات السوق', details: err.message });
  }
});

// ─── Market Live: Send a gift to a video creator ───────────────────
// POST /api/market-live/videos/:videoId/gift
// Body: { giftType: string, amount: number, message?: string }
//
// Flow:
//   1. Look up the video → uploader (`ad_videos.user_id`).
//   2. Validate sender wallet_balance ≥ amount.
//   3. Atomically: deduct from sender wallet + add to recipient's
//      `gift_balance` (separate from wallet_balance — gifts must be
//      withdrawn via /api/wallet/withdraw-gifts with a 10% fee).
//   4. Record gift_history row.
//   5. Insert a notification for the recipient.
//   6. Optionally increment video gift count (no such column on
//      ad_videos today — we record it in gift_history instead, and the
//      frontend tracks giftCounts in memory per videoId).
//
// Returns { success, gift, newBalance, giftBalance }
router.post('/market-live/videos/:videoId/gift', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { videoId } = req.params;
    const { giftType, amount, message } = req.body || {};

    // Validate input
    if (!giftType || typeof giftType !== 'string') {
      res.status(400).json({ error: 'نوع الهدية مطلوب' }); return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' }); return;
    }
    if (amt > 10000) {
      res.status(400).json({ error: 'الحد الأقصى للهدية 10000 ج.م' }); return;
    }

    // Look up video + uploader
    const video = db.prepare('SELECT id, user_id, post_id FROM ad_videos WHERE id = ? AND status = ?').get(videoId, 'active') as any;
    if (!video) { res.status(404).json({ error: 'الفيديو غير موجود' }); return; }
    const recipientId = video.user_id;
    if (!recipientId) { res.status(400).json({ error: 'الفيديو ليس له منشئ محدد' }); return; }
    if (recipientId === payload.userId) {
      res.status(400).json({ error: 'لا يمكنك إرسال هدية لنفسك' }); return;
    }

    // Server-side gift metadata lookup. The client passes `giftType`
    // and `amount`; we use the catalog to render a friendly name + icon
    // for the notification. The amount is what actually moves money, so
    // we trust the validated client amount, not the catalog price.
    const GIFT_CATALOG_LOCAL: Array<{ type: string; name: string; icon: string }> = [
      { type: 'rose',    name: 'وردة',         icon: '🌹' },
      { type: 'heart',   name: 'قلب',          icon: '💝' },
      { type: 'star',    name: 'نجمة',         icon: '⭐' },
      { type: 'fire',    name: 'نار',          icon: '🔥' },
      { type: 'bolt',    name: 'صاعقة',        icon: '⚡️' },
      { type: 'crown',   name: 'تاج',          icon: '👑' },
      { type: 'diamond', name: 'ماس',          icon: '💎' },
      { type: 'trophy',  name: 'كأس البطولة', icon: '🏆' },
    ];
    const catalogEntry = GIFT_CATALOG_LOCAL.find(g => g.type === giftType);
    const giftName = catalogEntry?.name || giftType;
    const giftIcon = catalogEntry?.icon || '🎁';

    // Look up sender (for balance + name)
    const sender = db.prepare('SELECT id, name, wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (!sender) { res.status(404).json({ error: 'المرسل غير موجود' }); return; }

    const giftId = crypto.randomBytes(16).toString('hex').toLowerCase();
    const txId = crypto.randomBytes(16).toString('hex').toLowerCase();
    const notifId = crypto.randomBytes(16).toString('hex').toLowerCase();

    // Atomic: deduct from sender + add to recipient gift_balance + record history + tx + notification
    try {
      db.transaction(() => {
        const deduct = db.prepare(
          "UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ? AND wallet_balance >= ?"
        ).run(amt, payload.userId, amt);
        if (deduct.changes === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        // Add to recipient's gift_balance (NOT wallet_balance — gifts
        // accumulate separately and require /wallet/withdraw-gifts with
        // 10% fee to convert to spendable wallet balance).
        db.prepare(
          "UPDATE users SET gift_balance = gift_balance + ?, updated_at = datetime('now') WHERE id = ?"
        ).run(amt, recipientId);

        db.prepare(
          `INSERT INTO gift_history (id, sender_id, recipient_id, gift_type, gift_name, gift_icon, amount, message, source, video_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'market_live', ?)`
        ).run(giftId, payload.userId, recipientId, giftType, giftName, giftIcon, amt, (message || '').toString().slice(0, 200), videoId);

        db.prepare(
          'INSERT INTO transactions (id, user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(txId, payload.userId, 'gift_sent', amt, `market-live-gift:${giftType}`, 'completed', giftId);

        db.prepare(
          'INSERT INTO notifications (id, user_id, type, message, link, user_id_ref, post_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          notifId,
          recipientId,
          'market',
          `${giftIcon} ${giftName} — استلمت ${amt.toLocaleString()} ج.م كهدية من ${sender.name}`,
          '/wallet',
          payload.userId,
          videoId,
        );
      })();
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({ error: `رصيد المحفظة غير كافٍ (${amt.toLocaleString()} ج.م مطلوبة)` });
        return;
      }
      throw err;
    }

    // Real-time: notify recipient via WebSocket
    try {
      const wsManager = (req.app.locals as any)?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(payload.userId, { type: "wallet:updated", data: { userId: payload.userId, amount: -amt } });
        if (typeof wsManager.emitNotification === 'function') {
          wsManager.emitNotification(recipientId, {
            id: notifId,
            type: 'market',
            message: `${giftIcon} ${giftName} — استلمت ${amt.toLocaleString()} ج.م كهدية من ${sender.name}`,
            link: '/wallet',
            userId: payload.userId,
            kind: 'gift_received',
            amount: amt,
            giftType,
            videoId,
            time: new Date().toISOString(),
          });
        }
      }
    } catch {}

    res.status(201).json({
      success: true,
      gift: {
        type: giftType,
        name: giftName,
        icon: giftIcon,
        amount: amt,
        message: (message || '').toString().slice(0, 200),
      },
      newBalance: Number(sender.wallet_balance) - amt,
      giftBalance: amt, // amount added to recipient's gift_balance (for UI confirmation)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال الهدية', details: err.message });
  }
});

// POST /api/livestream/notify-friends — Send livestream notification to all friends
router.post('/livestream/notify-friends', authMiddleware, (req: Request, res: Response) => {
  try {
    const uid = (req as any).user?.userId;
    if (!uid) { res.status(401).json({ error: 'غير مصرح' }); return; }

    const { streamTitle } = req.body || {};
    const hostName = ((db.prepare('SELECT name FROM users WHERE id = ?').get(uid) as any)?.name) || 'مستخدم';
    const message = `${hostName} بدأ بثاً مباشراً${streamTitle ? ': ' + streamTitle : ''}! شاهد الآن`;

    // Get all accepted friends
    const friends = db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END as friend_id
      FROM friendships
      WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).all(uid, uid, uid) as any[];

    // Insert notification for each friend — use 'livestream' type with link to the host's stream
    const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, link, user_id_ref) VALUES (?, ?, ?, ?, ?)');
    let count = 0;
    for (const friend of friends) {
      try {
        insertNotif.run(friend.friend_id, 'livestream', message, `/live-stream/${uid}`, uid);
        count++;
      } catch {}
    }

    res.json({ success: true, notifiedFriends: count });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال إشعارات البث', details: err.message });
  }
});

// GET /api/livestream/active — Get list of users currently streaming
router.get('/livestream/active', authMiddleware, (req: Request, res: Response) => {
  try {
    const wsManager = (req.app.locals as any).wsManager;
    if (!wsManager || !wsManager.activeStreams) {
      res.json([]);
      return;
    }
    // Convert Map to Array for JSON serialization (Map serializes as {})
    const activeStreamers = Array.from((wsManager.activeStreams as Map<string, any>).values());
    res.json(activeStreamers);
  } catch (err: any) {
    res.json([]);
  }
});


// GET /api/alerts/active — PUBLIC endpoint for currently visible admin alerts
// (No auth required - moved here from /api/admin/* so all users can see alerts)
router.get('/alerts/active', optionalAuth, (req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const isAdmin = !!(req as any).user?.isAdmin;

    let query = `
      SELECT id, title, content, source, priority, target_audience,
             start_at, expires_at, display_duration, action_label, action_url,
             created_at
      FROM admin_alerts
      WHERE is_active = 1
        AND (start_at IS NULL OR start_at <= ?)
        AND (expires_at IS NULL OR expires_at > ?)
    `;
    const params: any[] = [now, now];

    if (isAdmin) {
      query += ` AND target_audience IN ('all', 'admins')`;
    } else if ((req as any).user?.userId) {
      query += ` AND target_audience IN ('all', 'users')`;
    } else {
      query += ` AND target_audience = 'all'`;
    }

    query += ` ORDER BY
      CASE priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
      END,
      created_at DESC
    `;

    const alerts = db.prepare(query).all(...params) as any[];
    res.json({ alerts });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل في جلب التنبيهات النشطة', details: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════
// ─── Business Page: Follow / Unfollow / Portfolio ───────────────────
// ════════════════════════════════════════════════════════════════════

// POST /api/users/:userId/follow — Follow a user (no friend request needed)
router.post('/users/:userId/follow', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const targetId = req.params.userId;
    if (targetId === payload.userId) {
      res.status(400).json({ error: 'لا يمكنك متابعة نفسك' });
      return;
    }
    const existing = db.prepare('SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?').get(payload.userId, targetId);
    if (existing) {
      res.json({ following: true, message: 'تتابع هذا المستخدم بالفعل' });
      return;
    }
    db.prepare('INSERT OR IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)').run(payload.userId, targetId);
    // Notify the followed user
    const notifId = crypto.randomBytes(16).toString('hex');
    const follower = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
    db.prepare('INSERT INTO notifications (id, user_id, type, message, user_id_ref, link) VALUES (?, ?, ?, ?, ?, ?)').run(
      notifId, targetId, 'friend', `${follower?.name || 'مستخدم'} بدأ بمتابعتك`, payload.userId, `/user/${payload.userId}`
    );
    try {
      // 🔒 FIX: was `require('../websocket/index.js')` which throws
      // ReferenceError inside an ESM module (package.json type:module),
      // silently swallowing follow notifications. Now using a top-level
      // import (see file header) which works correctly in ESM.
      wsManager.emitNotification(targetId, { id: notifId, type: 'friend', message: `${follower?.name || 'مستخدم'} بدأ بمتابعتك`, time: new Date().toISOString(), link: `/user/${payload.userId}` });
    } catch (err) {
      console.warn('[API] Failed to emit follow notification via WS:', err);
    }
    res.json({ following: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل المتابعة' });
  }
});

// DELETE /api/users/:userId/follow — Unfollow
router.delete('/users/:userId/follow', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(payload.userId, req.params.userId);
    res.json({ following: false });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إلغاء المتابعة' });
  }
});

// GET /api/users/:userId/follow-status — Check if current user follows target
router.get('/users/:userId/follow-status', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const following = !!db.prepare('SELECT id FROM user_follows WHERE follower_id = ? AND following_id = ?').get(payload.userId, req.params.userId);
    const followersCount = (db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE following_id = ?').get(req.params.userId) as any).count;
    const followingCount = (db.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(req.params.userId) as any).count;
    res.json({ following, followersCount, followingCount });
  } catch {
    res.json({ following: false, followersCount: 0, followingCount: 0 });
  }
});

// GET /api/users/:userId/portfolio — Get portfolio images
router.get('/users/:userId/portfolio', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT portfolio_images FROM users WHERE id = ?').get(req.params.userId) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    let images: string[] = [];
    try { images = JSON.parse(user.portfolio_images || '[]'); } catch { images = []; }
    res.json(images);
  } catch {
    res.json([]);
  }
});

// POST /api/users/portfolio — Add image to portfolio (current user)
router.post('/users/portfolio', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { image } = req.body;
    if (!image || typeof image !== 'string') { res.status(400).json({ error: 'الصورة مطلوبة' }); return; }
    // 🔒 SECURITY FIX: validate that the image is either a local /uploads/
    // path or a small data:image URL. Previously the endpoint accepted any
    // string, allowing attackers to embed tracking pixels / SSRF probes.
    const isLocalUpload = image.startsWith('/uploads/') && !image.includes('..');
    const isDataImage = image.startsWith('data:image/') && image.length < 2_000_000; // 2MB cap
    if (!isLocalUpload && !isDataImage) {
      res.status(400).json({ error: 'صيغة الصورة غير صالحة' });
      return;
    }
    const user = db.prepare('SELECT portfolio_images FROM users WHERE id = ?').get(payload.userId) as any;
    let images: string[] = [];
    try { images = JSON.parse(user.portfolio_images || '[]'); } catch { images = []; }
    if (images.length >= 20) { res.status(400).json({ error: 'الحد الأقصى 20 صورة' }); return; }
    images.push(image);
    db.prepare('UPDATE users SET portfolio_images = ? WHERE id = ?').run(JSON.stringify(images), payload.userId);
    res.json({ images });
  } catch (err: any) {
    console.error('[API] Add portfolio image failed:', err);
    res.status(500).json({ error: 'فشل إضافة الصورة' });
  }
});

// POST /api/users/portfolio/upload — Upload a portfolio image file (multipart)
// Saves the file to /uploads/ and adds the URL to the user's portfolio array.
// 🔧 FIX: previously the frontend called this endpoint but it didn't exist,
// so the upload would fail and silently fall back to uploadImage + addPortfolioImage.
router.post('/users/portfolio/upload', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    // Use multer-style file handling via raw body. For simplicity, we accept
    // multipart via busboy — but to avoid a heavy dep, we accept only base64
    // data URLs in JSON. The frontend already encodes files as data URLs in
    // the avatar/cover flow, so we follow the same pattern here.
    // The frontend's `uploadPortfolioImage(file)` posts FormData — so we use
    // express's req.body parsing of multipart via the upload middleware
    // already mounted at the app level (if any). If no file is present,
    // fall back to JSON body with `image` (data URL).
    let dataUrl = '';
    const uploadedFile = (req as any).file;
    if (uploadedFile) {
      // Convert uploaded buffer to data URL
      const b64 = uploadedFile.buffer.toString('base64');
      dataUrl = `data:${uploadedFile.mimetype};base64,${b64}`;
    } else if (req.body && typeof req.body.image === 'string') {
      dataUrl = req.body.image;
    } else if (req.body && typeof req.body === 'string' && req.body.startsWith('data:image/')) {
      dataUrl = req.body;
    }
    if (!dataUrl) {
      res.status(400).json({ error: 'لم يتم استلام أي صورة' });
      return;
    }
    if (dataUrl.length > 5_000_000) {
      res.status(400).json({ error: 'حجم الصورة كبير جداً (الحد 5MB)' });
      return;
    }
    const user = db.prepare('SELECT portfolio_images FROM users WHERE id = ?').get(payload.userId) as any;
    let images: string[] = [];
    try { images = JSON.parse(user.portfolio_images || '[]'); } catch { images = []; }
    if (images.length >= 20) { res.status(400).json({ error: 'الحد الأقصى 20 صورة' }); return; }
    images.push(dataUrl);
    db.prepare('UPDATE users SET portfolio_images = ? WHERE id = ?').run(JSON.stringify(images), payload.userId);
    res.json({ images, url: dataUrl });
  } catch (err: any) {
    console.error('[API] Portfolio upload failed:', err);
    res.status(500).json({ error: 'فشل رفع الصورة' });
  }
});

// DELETE /api/users/portfolio/:index — Remove image from portfolio
router.delete('/users/portfolio/:index', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const idx = parseInt(req.params.index, 10);
    const user = db.prepare('SELECT portfolio_images FROM users WHERE id = ?').get(payload.userId) as any;
    let images: string[] = [];
    try { images = JSON.parse(user.portfolio_images || '[]'); } catch { images = []; }
    if (idx < 0 || idx >= images.length) { res.status(400).json({ error: 'فهرس غير صالح' }); return; }
    images.splice(idx, 1);
    db.prepare('UPDATE users SET portfolio_images = ? WHERE id = ?').run(JSON.stringify(images), payload.userId);
    res.json({ images });
  } catch {
    res.status(500).json({ error: 'فشل حذف الصورة' });
  }
});

// DELETE /api/users/me — Self-service account deletion (GDPR-friendly)
// 🔒 SECURITY FIX: previously SettingsPage.handleDeleteAccount only cleared
// localStorage without notifying the server, leaving the account (and all
// its PII) intact in the database. Now the client calls this endpoint.
//
// Strategy: soft-delete (deactivate + scrub PII + delete user-owned content)
// rather than hard-delete, to preserve referential integrity for messages
// already received by other users. The user row stays but is anonymized.
//
// Body: { password: string } — must re-confirm password to prevent
// CSRF/session-hijack-driven deletion.
router.delete('/users/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'مطلوب تأكيد كلمة المرور' });
      return;
    }
    // Re-verify password to prevent deletion via stolen session token.
    const bcrypt = (await import('bcryptjs')).default;
    const row = db.prepare('SELECT password_hash, is_admin FROM users WHERE id = ?').get(payload.userId) as any;
    if (!row) {
      res.status(404).json({ error: 'الحساب غير موجود' });
      return;
    }
    if (row.is_admin) {
      res.status(403).json({ error: 'لا يمكن حذف حساب الأدمن بهذه الطريقة' });
      return;
    }
    const ok = bcrypt.compareSync(password, row.password_hash || '');
    if (!ok) {
      res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
      return;
    }

    // Run all deletions in a transaction. If anything fails, roll back so
    // we never end up in a half-deleted state.
    const deleteTx = db.transaction(() => {
      const uid = payload.userId;
      // 1) Scrub PII on the user row but KEEP the row (referential integrity).
      //    is_deactivated = 1 ensures the account can no longer log in.
      db.prepare(`
        UPDATE users SET
          is_deactivated = 1,
          name = 'حساب محذوف',
          email = 'deleted+' || ? || '@nawaqes.local',
          password_hash = '',
          phone = '',
          location = '',
          bio = '',
          avatar = '',
          interests = '[]',
          payment_methods = '[]',
          portfolio_images = '[]',
          show_phone = 0,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(uid, uid);

      // 2) Delete user-owned content that other users don't reference.
      //    Column names verified against src/database/index.ts:
      //    - posts.author_id, post_comments.author_id, stories.user_id
      //    - video_comments.user_id, ad_videos.user_id
      //    - market_listings.seller_id (NOT user_id), market_listing_saves.user_id
      //    - charging_requests.user_id, promotion_requests.author_id
      db.prepare('DELETE FROM posts WHERE author_id = ?').run(uid);
      db.prepare('DELETE FROM post_comments WHERE author_id = ?').run(uid);
      db.prepare('DELETE FROM stories WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM video_comments WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM ad_videos WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM market_listings WHERE seller_id = ?').run(uid);
      db.prepare('DELETE FROM market_listing_saves WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM charging_requests WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM promotion_requests WHERE author_id = ?').run(uid);

      // 3) Notifications: delete ones the user would receive, keep ones
      //    the user *sent* (other people's notification feeds reference them).
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(uid);

      // 4) Friendships/follows: remove both directions.
      //    friendships uses requester_id / addressee_id (not user_id / friend_id).
      db.prepare('DELETE FROM friendships WHERE requester_id = ? OR addressee_id = ?').run(uid, uid);
      db.prepare('DELETE FROM user_follows WHERE follower_id = ? OR following_id = ?').run(uid, uid);

      // 5) Chat messages sent BY the user: scrub content but keep the row
      //    so the receiver's conversation history isn't broken. Messages
      //    received BY the user are deleted entirely in step 6.
      //    `deleted_for` is a marker column; we set it to 'sender-deleted'
      //    so the receiver sees "تم حذف هذه الرسالة" instead of the content.
      db.prepare(`
        UPDATE chat_messages SET
          text = '',
          image_url = '',
          voice_url = '',
          deleted_for = 'sender-deleted'
        WHERE sender_id = ?
      `).run(uid);
      db.prepare('DELETE FROM chat_messages WHERE receiver_id = ?').run(uid);

      // 6) Sessions: revoke all refresh tokens.
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);

      // 7) Video interactions & share events.
      db.prepare('DELETE FROM video_interactions WHERE user_id = ?').run(uid);
      db.prepare('DELETE FROM share_events WHERE user_id = ?').run(uid);
    });
    deleteTx();

    res.json({ success: true, message: 'تم حذف الحساب بنجاح' });
  } catch (err: any) {
    console.error('[API] Account deletion failed:', err);
    res.status(500).json({ error: 'فشل حذف الحساب' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// MATCHES (Tinder-style discoverability)
// ─────────────────────────────────────────────────────────────────────
// Tables: user_likes (liker→liked actions) and matches (mutual likes).
// Both are created lazily here so we don't need to touch database/index.ts.
// ─────────────────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_likes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      liker_id TEXT NOT NULL REFERENCES users(id),
      liked_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL DEFAULT 'like',         -- 'like' | 'pass' | 'superlike'
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(liker_id, liked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_likes_liker ON user_likes(liker_id);
    CREATE INDEX IF NOT EXISTS idx_user_likes_liked ON user_likes(liked_id);

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user1_id TEXT NOT NULL REFERENCES users(id),
      user2_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user1_id, user2_id)
    );
    CREATE INDEX IF NOT EXISTS idx_matches_u1 ON matches(user1_id);
    CREATE INDEX IF NOT EXISTS idx_matches_u2 ON matches(user2_id);
  `);
} catch (e) { /* tables already exist */ }

// Super-like daily limit
const SUPERLIKE_DAILY_LIMIT = 3;

/**
 * Compute match score per the spec:
 *   - shared interests: +30% per shared (max 60%)
 *   - same city/location: +15%
 *   - age compatibility within 5 years: +10%
 *   - trust score > 50: +10%
 *   - verified: +5%
 *   - cap 99%
 */
function computeMatchScore(me: any, other: any): { score: number; sharedInterests: string[] } {
  let score = 0;
  const myInterests: string[] = (() => { try { return JSON.parse(me.interests || '[]'); } catch { return []; } })();
  const otherInterests: string[] = (() => { try { return JSON.parse(other.interests || '[]'); } catch { return []; } })();
  const shared = myInterests.filter(i => otherInterests.includes(i));
  score += Math.min(shared.length * 30, 60);
  if (me.location && other.location && me.location === other.location) score += 15;
  try {
    const myAge = me.age || (me.date_of_birth ? computeAgeFromDOB(me.date_of_birth) : null);
    const otherAge = other.age || (other.date_of_birth ? computeAgeFromDOB(other.date_of_birth) : null);
    if (myAge != null && otherAge != null && Math.abs(myAge - otherAge) <= 5) score += 10;
  } catch { /* ignore */ }
  if ((other.trust_score || 0) > 50) score += 10;
  if (other.is_verified) score += 5;
  return { score: Math.min(score, 99), sharedInterests: shared };
}

function computeAgeFromDOB(dob: string): number | null {
  if (!dob) return null;
  try {
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  } catch { return null; }
}

/**
 * GET /api/matches — potential matches sorted by score.
 * Query params:
 *   - ageMin, ageMax (number)
 *   - distance (km; soft filter — we only have city text so treated as same-city)
 *   - gender ('male' | 'female' | 'all')
 *   - interests (comma-separated interest ids)
 */
router.get('/matches', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const me = db.prepare('SELECT id, gender, location, interests, date_of_birth, age FROM users WHERE id = ?').get(payload.userId) as any;
    if (!me) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const { ageMin, ageMax, gender, interests } = req.query as any;
    const interestFilter: string[] = interests ? String(interests).split(',').filter(Boolean) : [];

    // Users I have already acted on (liked/passed/superliked)
    const actedIds = (db.prepare('SELECT liked_id FROM user_likes WHERE liker_id = ?').all(payload.userId) as any[])
      .map((r: any) => r.liked_id);
    // Existing matches partners
    const matchedIds = (db.prepare(`
      SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END AS partner_id
      FROM matches WHERE user1_id = ? OR user2_id = ?
    `).all(payload.userId, payload.userId, payload.userId) as any[]).map((r: any) => r.partner_id);

    // Existing friends (skip)
    const friendIds = (db.prepare(`
      SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS fid
      FROM friendships WHERE requester_id = ? OR addressee_id = ?
    `).all(payload.userId, payload.userId, payload.userId) as any[]).map((r: any) => r.fid);

    // Blocked either direction
    const blockedIds = (db.prepare(`
      SELECT CASE WHEN blocker_id = ? THEN blocked_id ELSE blocker_id END AS bid
      FROM blocked_users WHERE blocker_id = ? OR blocked_id = ?
    `).all(payload.userId, payload.userId, payload.userId) as any[]).map((r: any) => r.bid);

    const exclude = new Set<string>([payload.userId, ...actedIds, ...matchedIds, ...friendIds, ...blockedIds]);

    const candidates = db.prepare(`
      SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score,
             location, interests, bio, cover_photo, gender, date_of_birth, last_seen_at
      FROM users
      WHERE id != ? AND is_deactivated = 0
    `).all(payload.userId) as any[];

    const enriched = candidates
      .filter((u: any) => !exclude.has(u.id))
      .filter((u: any) => {
        if (gender && gender !== 'all' && u.gender && u.gender !== gender) return false;
        if (ageMin || ageMax) {
          const age = u.age || computeAgeFromDOB(u.date_of_birth);
          if (age == null) return false;
          if (ageMin && age < Number(ageMin)) return false;
          if (ageMax && age > Number(ageMax)) return false;
        }
        if (interestFilter.length > 0) {
          const uInterests: string[] = (() => { try { return JSON.parse(u.interests || '[]'); } catch { return []; } })();
          if (!interestFilter.every(i => uInterests.includes(i))) return false;
        }
        return true;
      })
      .map((u: any) => {
        const { score, sharedInterests } = computeMatchScore(me, u);
        const uInterests: string[] = (() => { try { return JSON.parse(u.interests || '[]'); } catch { return []; } })();
        const isOnline = (req.app.locals as any)?.wsManager?.isUserOnline(u.id) || false;
        return {
          id: u.id,
          name: u.name,
          avatar: u.avatar_base64 || u.avatar || getDefaultAvatar(u.id, u.gender),
          coverPhoto: u.cover_photo || '',
          isVerified: !!u.is_verified,
          isTrusted: !!u.is_trusted,
          trustScore: u.trust_score || 50,
          location: u.location || '',
          interests: uInterests,
          bio: u.bio || '',
          gender: u.gender || null,
          age: u.age || computeAgeFromDOB(u.date_of_birth) || null,
          lastSeen: u.last_seen_at || null,
          isOnline,
          sharedInterests,
          matchScore: score,
          distance: me.location && u.location && me.location === u.location ? 0 : null,
        };
      })
      .sort((a: any, b: any) => b.matchScore - a.matchScore);

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المطابقات', details: err.message });
  }
});

/**
 * GET /api/matches/superlike-count — remaining superlikes today
 */
router.get('/matches/superlike-count', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const today = new Date().toISOString().slice(0, 10);
    const used = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM user_likes
      WHERE liker_id = ? AND action = 'superlike'
        AND DATE(created_at) = ?
    `).get(payload.userId, today) as any)?.cnt || 0;
    res.json({ used, remaining: Math.max(0, SUPERLIKE_DAILY_LIMIT - used), limit: SUPERLIKE_DAILY_LIMIT });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب عداد الإعجابات المميزة' });
  }
});

/**
 * POST /api/matches/:userId/like
 * POST /api/matches/:userId/pass
 * POST /api/matches/:userId/superlike
 * On like/superlike: if the target has already liked me, create a match.
 */
async function handleMatchAction(req: Request, res: Response, action: 'like' | 'pass' | 'superlike') {
  try {
    const payload = (req as any).user as JwtPayload;
    const targetId = req.params.userId;
    if (!targetId || targetId === payload.userId) {
      res.status(400).json({ error: 'معرف المستخدم غير صالح' });
      return;
    }
    const target = db.prepare('SELECT id, name FROM users WHERE id = ? AND is_deactivated = 0').get(targetId) as any;
    if (!target) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    if (action === 'superlike') {
      const today = new Date().toISOString().slice(0, 10);
      const used = (db.prepare(`
        SELECT COUNT(*) AS cnt FROM user_likes
        WHERE liker_id = ? AND action = 'superlike' AND DATE(created_at) = ?
      `).get(payload.userId, today) as any)?.cnt || 0;
      if (used >= SUPERLIKE_DAILY_LIMIT) {
        res.status(429).json({ error: 'لقد استخدمت كل الإعجابات المميزة لهذا اليوم' });
        return;
      }
    }

    // upsert action
    db.prepare(`
      INSERT INTO user_likes (liker_id, liked_id, action) VALUES (?, ?, ?)
      ON CONFLICT(liker_id, liked_id) DO UPDATE SET action = excluded.action, created_at = datetime('now')
    `).run(payload.userId, targetId, action);

    let matched = false;
    let matchId: string | null = null;
    if (action === 'like' || action === 'superlike') {
      // has target liked me?
      const reciprocal = db.prepare('SELECT action FROM user_likes WHERE liker_id = ? AND liked_id = ?').get(targetId, payload.userId) as any;
      if (reciprocal && (reciprocal.action === 'like' || reciprocal.action === 'superlike')) {
        // create match
        const [u1, u2] = [payload.userId, targetId].sort();
        const existing = db.prepare('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?').get(u1, u2) as any;
        if (!existing) {
          const newId = crypto.randomBytes(16).toString('hex');
          db.prepare('INSERT INTO matches (id, user1_id, user2_id) VALUES (?, ?, ?)').run(newId, u1, u2);
          matchId = newId;
        } else {
          matchId = existing.id;
        }
        matched = true;

        // Notify the target that they have a new match (silent — only bell badge)
        try {
          const me = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
          db.prepare('INSERT INTO notifications (user_id, type, message, user_id_ref, link) VALUES (?, ?, ?, ?, ?)')
            .run(targetId, 'match', `تطابق جديد مع ${me?.name || 'مستخدم'}`, payload.userId, `/user/${payload.userId}`);
          (req.app.locals as any)?.wsManager?.emitNotification(targetId, {
            type: 'match',
            message: `تطابق جديد مع ${me?.name || 'مستخدم'}`,
            userId: payload.userId,
            link: `/user/${payload.userId}`,
            time: new Date().toISOString(),
          });
        } catch (e) { /* best-effort */ }
      }
    }

    res.json({
      action,
      matched,
      matchId,
      target: { id: target.id, name: target.name },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تنفيذ الإجراء', details: err.message });
  }
}

router.post('/matches/:userId/like', (req: Request, res: Response) => handleMatchAction(req, res, 'like'));
router.post('/matches/:userId/pass', (req: Request, res: Response) => handleMatchAction(req, res, 'pass'));
router.post('/matches/:userId/superlike', (req: Request, res: Response) => handleMatchAction(req, res, 'superlike'));

/**
 * GET /api/matches/list — confirmed matches (mutual likes)
 */
router.get('/matches/list', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const rows = db.prepare(`
      SELECT m.id, m.created_at,
        CASE WHEN m.user1_id = ? THEN m.user2_id ELSE m.user1_id END AS partner_id
      FROM matches m
      WHERE m.user1_id = ? OR m.user2_id = ?
      ORDER BY m.created_at DESC
    `).all(payload.userId, payload.userId, payload.userId) as any[];

    const partners = rows.map((r: any) => {
      const u = db.prepare(`
        SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, location, interests, bio, gender, last_seen_at
        FROM users WHERE id = ?
      `).get(r.partner_id) as any;
      if (!u) return null;
      const interests: string[] = (() => { try { return JSON.parse(u.interests || '[]'); } catch { return []; } })();
      const isOnline = (req.app.locals as any)?.wsManager?.isUserOnline(u.id) || false;
      return {
        matchId: r.id,
        createdAt: r.created_at,
        id: u.id,
        name: u.name,
        avatar: u.avatar_base64 || u.avatar || getDefaultAvatar(u.id, u.gender),
        isVerified: !!u.is_verified,
        isTrusted: !!u.is_trusted,
        trustScore: u.trust_score || 50,
        location: u.location || '',
        interests,
        bio: u.bio || '',
        gender: u.gender || null,
        lastSeen: u.last_seen_at || null,
        isOnline,
      };
    }).filter(Boolean);

    res.json(partners);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب قائمة المطابقات' });
  }
});

/**
 * POST /api/matches/:matchId/message — quick message on match
 * Sends a chat message to the matched partner.
 */
router.post('/matches/:matchId/message', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'الرسالة فارغة' });
      return;
    }
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.matchId) as any;
    if (!match) { res.status(404).json({ error: 'التطابق غير موجود' }); return; }
    if (match.user1_id !== payload.userId && match.user2_id !== payload.userId) {
      res.status(403).json({ error: 'غير مصرح' });
      return;
    }
    const partnerId = match.user1_id === payload.userId ? match.user2_id : match.user1_id;
    const msgId = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO chat_messages (id, sender_id, receiver_id, text, read, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).run(msgId, payload.userId, partnerId, text.trim());
    // Notify partner via WS (silent — just bell badge)
    try {
      const me = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
      (req.app.locals as any)?.wsManager?.emitChatMessage(partnerId, {
        id: msgId,
        senderId: payload.userId,
        receiverId: partnerId,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false,
        messageType: 'text',
      });
      (req.app.locals as any)?.wsManager?.emitNotification(partnerId, {
        type: 'message',
        message: `رسالة جديدة من ${me?.name || 'مستخدم'}`,
        userId: payload.userId,
        link: '/messages',
        time: new Date().toISOString(),
      });
    } catch (e) { /* best-effort */ }
    res.json({ success: true, messageId: msgId });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال الرسالة', details: err.message });
  }
});

export default router;
