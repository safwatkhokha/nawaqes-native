// ─── Admin Routes ────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../database/index.js';
import { authMiddleware, adminMiddleware, clearDeactivationCache } from '../middleware/auth.js';

// Database file path for optimization operations
const dbPath = path.resolve(process.cwd(), 'data', 'nawaqes.db');

const router = Router();

// All admin routes require auth + admin
router.use(authMiddleware, adminMiddleware);

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/stats
// ═══════════════════════════════════════════════════════════════════════
router.get('/stats', (req: Request, res: Response) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_deactivated = 0').get() as any;
    const activeAds = db.prepare("SELECT COUNT(*) as count FROM posts WHERE type = 'ad' AND status = 'active'").get() as any;
    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as any;
    const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'promotion_debit' AND status = 'completed'").get() as any;
    const pendingCharging = db.prepare("SELECT COUNT(*) as count FROM charging_requests WHERE status = 'pending'").get() as any;
    const pendingPromotions = db.prepare("SELECT COUNT(*) as count FROM promotion_requests WHERE status = 'pending'").get() as any;
    const pendingMarketPromotions = db.prepare("SELECT COUNT(*) as count FROM market_promotion_requests WHERE status = 'pending'").get() as any;
    const newsItems = db.prepare('SELECT COUNT(*) as count FROM news_items').get() as any;

    res.json({
      totalUsers: totalUsers.count,
      activeAds: activeAds.count,
      totalTransactions: totalTransactions.count,
      revenue: revenue.total,
      pendingCharging: pendingCharging.count,
      pendingPromotions: pendingPromotions.count,
      pendingMarketPromotions: pendingMarketPromotions.count,
      newsItems: newsItems.count,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإحصائيات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/detailed-stats
// ═══════════════════════════════════════════════════════════════════════
router.get('/detailed-stats', (req: Request, res: Response) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_deactivated = 0').get() as any;
    const deactivatedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_deactivated = 1').get() as any;
    const verifiedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_verified = 1').get() as any;
    const adminUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get() as any;
    const activeAds = db.prepare("SELECT COUNT(*) as count FROM posts WHERE type = 'ad' AND status = 'active'").get() as any;
    const flaggedPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'flagged'").get() as any;
    const featuredPosts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE is_featured = 1').get() as any;
    const promotedPosts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE is_promoted = 1').get() as any;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'promotion_debit' AND status = 'completed'").get() as any;
    const pendingCharging = db.prepare("SELECT COUNT(*) as count FROM charging_requests WHERE status = 'pending'").get() as any;
    const pendingChargingAmount = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM charging_requests WHERE status = 'pending'").get() as any;
    const pendingPromotions = db.prepare("SELECT COUNT(*) as count FROM promotion_requests WHERE status = 'pending'").get() as any;
    const pendingMarketPromotions = db.prepare("SELECT COUNT(*) as count FROM market_promotion_requests WHERE status = 'pending'").get() as any;
    const newsCount = db.prepare('SELECT COUNT(*) as count FROM news_items').get() as any;
    const alertCount = db.prepare('SELECT COUNT(*) as count FROM news_items WHERE is_alert = 1').get() as any;
    const totalWalletBalance = db.prepare('SELECT COALESCE(SUM(wallet_balance), 0) as total FROM users').get() as any;

    // Daily new users (last 7 days)
    const dailyNewUsers = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY date DESC
    `).all();

    // Daily new posts (last 7 days)
    const dailyNewPosts = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM posts WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY date DESC
    `).all();

    res.json({
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      deactivatedUsers: deactivatedUsers.count,
      verifiedUsers: verifiedUsers.count,
      adminUsers: adminUsers.count,
      activeAds: activeAds.count,
      flaggedPosts: flaggedPosts.count,
      featuredPosts: featuredPosts.count,
      promotedPosts: promotedPosts.count,
      totalRevenue: totalRevenue.total,
      pendingCharging: pendingCharging.count,
      pendingChargingAmount: pendingChargingAmount.total,
      pendingPromotions: pendingPromotions.count,
      pendingMarketPromotions: pendingMarketPromotions.count,
      newsItems: newsCount.count,
      alertItems: alertCount.count,
      totalWalletBalance: totalWalletBalance.total,
      dailyNewUsers,
      dailyNewPosts,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإحصائيات التفصيلية', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/chart
// ═══════════════════════════════════════════════════════════════════════
router.get('/chart', (req: Request, res: Response) => {
  try {
    const chartData = db.prepare(`
      SELECT strftime('%w', created_at) as day_num,
        CASE strftime('%w', created_at)
          WHEN '6' THEN 'السبت' WHEN '0' THEN 'الأحد' WHEN '1' THEN 'الاثنين'
          WHEN '2' THEN 'الثلاثاء' WHEN '3' THEN 'الأربعاء' WHEN '4' THEN 'الخميس'
          WHEN '5' THEN 'الجمعة'
        END as name,
        COUNT(*) as ads
      FROM posts WHERE created_at >= datetime('now', '-7 days') AND status = 'active'
      GROUP BY day_num ORDER BY day_num
    `).all();
    res.json(chartData);
  } catch (err: any) {
    // Return empty real data instead of fake fabricated data
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/promotion-requests
// ═══════════════════════════════════════════════════════════════════════
router.get('/promotion-requests', (req: Request, res: Response) => {
  try {
    const requests = db.prepare('SELECT * FROM promotion_requests ORDER BY created_at DESC').all();
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الترويج', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/promotion-requests/:id/approve
// ═══════════════════════════════════════════════════════════════════════
router.post('/promotion-requests/:id/approve', (req: Request, res: Response) => {
  try {
    const pr = db.prepare('SELECT * FROM promotion_requests WHERE id = ?').get(req.params.id) as any;
    if (!pr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    // Status guard (C4 fix): only pending requests can be approved.
    // Without this, an admin could approve an already-rejected request,
    // giving the user a free promotion (they were already refunded).
    if (pr.status !== 'pending') {
      res.status(400).json({ error: 'تمت معالجة هذا الطلب بالفعل' });
      return;
    }

    db.prepare("UPDATE promotion_requests SET status = 'approved' WHERE id = ?").run(req.params.id);

    const expiresAt = new Date(Date.now() + (pr.duration || 3) * 86400000).toISOString();
    db.prepare(`UPDATE posts SET is_promoted = 1, promotion_status = 'approved', promotion_tier = ?,
      promotion_package = ?, promotion_started_at = datetime('now'), promotion_expires_at = ?,
      estimated_reach = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(pr.tier, pr.package_name, expiresAt, pr.estimated_reach, pr.post_id);

    // Notify the post author about approval
    db.prepare('INSERT INTO notifications (user_id, type, message, post_id, link) VALUES (?, ?, ?, ?, ?)')
      .run(pr.author_id, 'promotion', `تم الموافقة على ترويج منشورك - باقة ${pr.package_name}`, pr.post_id, `/post/${pr.post_id}`);

    // ─── Send notifications to targeted users ───
    // Find users matching the targeting criteria and notify them
    try {
      const maxNotifications = pr.max_notifications || 100;
      let targetUsers: any[] = [];

      // Build targeting query based on promotion type
      let targetingQuery = 'SELECT id FROM users WHERE id != ? AND is_deactivated = 0';
      const targetParams: any[] = [pr.author_id];

      // City targeting
      if (pr.targeting === 'city' && pr.target_city) {
        let cities: string[] = [];
        try {
          const parsed = JSON.parse(pr.target_city);
          if (Array.isArray(parsed)) cities = parsed;
        } catch {
          cities = [pr.target_city];
        }
        if (cities.length > 0) {
          const cityConditions = cities.map(() => '(location LIKE ? OR location LIKE ?)').join(' OR ');
          targetingQuery += ` AND (${cityConditions})`;
          for (const city of cities) {
            targetParams.push(`%${city}%`, `${city}%`);
          }
        }
      }

      // Interest targeting (flexible: matches both Arabic and English interest names)
      if (pr.targeting === 'interests' && pr.target_interests) {
        let interests: string[] = [];
        try {
          const parsed = JSON.parse(pr.target_interests);
          if (Array.isArray(parsed)) interests = parsed;
        } catch {
          interests = [pr.target_interests];
        }
        if (interests.length > 0) {
          // Build conditions for each interest, including Arabic-English equivalents
          const interestConditions: string[] = [];
          for (const interest of interests) {
            interestConditions.push('interests LIKE ?');
            targetParams.push(`%"${interest}"%`);
            // Add Arabic-English equivalent matches for broader reach
            const equivalents: Record<string, string[]> = {
              'phones': ['هواتف'], 'هواتف': ['phones'],
              'cars': ['سيارات'], 'سيارات': ['cars'],
              'electronics': ['إلكترونيات'], 'إلكترونيات': ['electronics'],
              'realEstate': ['عقارات'], 'عقارات': ['realEstate'],
              'fashion': ['أزياء'], 'أزياء': ['fashion'],
              'games': ['ألعاب'], 'ألعاب': ['games'],
              'sports': ['رياضة'], 'رياضة': ['sports'],
              'books': ['كتب'], 'كتب': ['books'],
              'jobs': ['وظائف'], 'وظائف': ['jobs'],
              'services': ['خدمات'], 'خدمات': ['services'],
              'animals': ['حيوانات'], 'حيوانات': ['animals'],
            };
            if (equivalents[interest]) {
              for (const eq of equivalents[interest]) {
                interestConditions.push('interests LIKE ?');
                targetParams.push(`%"${eq}"%`);
              }
            }
          }
          targetingQuery += ` AND (${interestConditions.join(' OR ')})`;
        }
      }

      // Age targeting
      if (pr.target_age_min && pr.target_age_max && pr.target_age_min > 0 && pr.target_age_max > 0) {
        // Calculate birth date range from age
        const today = new Date();
        const maxBirthYear = today.getFullYear() - pr.target_age_min;
        const minBirthYear = today.getFullYear() - pr.target_age_max;
        targetingQuery += " AND date_of_birth IS NOT NULL AND date_of_birth != ''";
        targetingQuery += ` AND strftime('%Y', date_of_birth) <= ? AND strftime('%Y', date_of_birth) >= ?`;
        targetParams.push(String(maxBirthYear), String(minBirthYear));
      }

      targetingQuery += ` ORDER BY RANDOM() LIMIT ?`;
      targetParams.push(String(maxNotifications));

      targetUsers = db.prepare(targetingQuery).all(...targetParams);

      // Send notification to each targeted user
      const postContent = pr.post_content || '';
      const shortContent = postContent.length > 50 ? postContent.substring(0, 50) + '...' : postContent;
      const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, post_id, link) VALUES (?, ?, ?, ?, ?)');
      for (const user of targetUsers) {
        insertNotif.run(user.id, 'promotion', `إعلان جديد قد يهمك: ${shortContent}`, pr.post_id, `/post/${pr.post_id}`);
      }

      // Update notifications_sent count
      db.prepare("UPDATE promotion_requests SET notifications_sent = ? WHERE id = ?")
        .run(targetUsers.length, req.params.id);

    } catch (notifErr: any) {
      console.error('Error sending targeted notifications:', notifErr.message);
      // Don't fail the approval if notification sending fails
    }

    // Emit WebSocket event for real-time admin dashboard update
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.emitAdminEvent('promotion-approved', { id: req.params.id, postId: pr?.post_id });
        // Also notify the post author via WebSocket
        wsManager.emitNotification(pr?.author_id, {
          type: 'promotion',
          message: `تم الموافقة على ترويج منشورك - باقة ${pr?.package_name}`,
          postId: pr?.post_id,
          time: new Date().toISOString(),
        });
        // 🔧 BROADCAST to ALL users to refresh their feed (promotion is now visible)
        wsManager.broadcast({
          type: 'data:refresh',
          data: { reason: 'promotion-approved', postId: pr?.post_id },
        });
      }
    } catch (wsErr: any) {
      console.error('[WS] Failed to emit admin event:', wsErr.message);
    }

    res.json({ message: 'تم الموافقة على طلب الترويج' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل الموافقة على الترويج', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/promotion-requests/:id/reject
// ═══════════════════════════════════════════════════════════════════════
router.post('/promotion-requests/:id/reject', (req: Request, res: Response) => {
  try {
    const pr = db.prepare('SELECT * FROM promotion_requests WHERE id = ?').get(req.params.id) as any;
    if (!pr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    // Status guard (C3 fix): only pending requests can be rejected.
    // Without this, an admin could reject the same request multiple times,
    // each call refunding the user's wallet — unlimited money creation.
    if (pr.status !== 'pending') {
      res.status(400).json({ error: 'تمت معالجة هذا الطلب بالفعل' });
      return;
    }

    // Use a transaction so the status update + post update + refund +
    // transaction record are atomic (H1 fix). If any step fails, the
    // whole operation rolls back — no partial refunds.
    const txId = crypto.randomBytes(16).toString('hex');
    db.transaction(() => {
      db.prepare("UPDATE promotion_requests SET status = 'rejected' WHERE id = ?").run(req.params.id);
      db.prepare("UPDATE posts SET promotion_status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(pr.post_id);

      // Refund wallet balance
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
        .run(pr.price, pr.author_id);

      db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(txId, pr.author_id, 'promotion_refund', pr.price, 'محفظة', 'completed');
    })();

    db.prepare('INSERT INTO notifications (user_id, type, message, post_id, link) VALUES (?, ?, ?, ?, ?)')
      .run(pr.author_id, 'promotion', `تم رفض طلب ترويج منشورك وتم استرداد ${pr.price} ج.م`, pr.post_id, `/post/${pr.post_id}`);

    res.json({ message: 'تم رفض طلب الترويج' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض الترويج', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/users
// ═══════════════════════════════════════════════════════════════════════
router.get('/users', (req: Request, res: Response) => {
  try {
    const users = db.prepare('SELECT id, name, email, avatar, is_verified, is_admin, is_trusted, trust_score, wallet_balance, is_deactivated, phone, location, join_date, show_phone, gender, date_of_birth, interests FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المستخدمين', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/admin/users/:id/verify - Toggle user verification
// ═══════════════════════════════════════════════════════════════════════
router.patch('/users/:id/verify', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    const newStatus = user.is_verified ? 0 : 1;
    db.prepare('UPDATE users SET is_verified = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id);
    res.json({ id: req.params.id, is_verified: !!newStatus, message: newStatus ? 'تم توثيق المستخدم' : 'تم إلغاء توثيق المستخدم' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة التوثيق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/admin/users/:id/toggle-admin - Toggle admin status
// ═══════════════════════════════════════════════════════════════════════
router.patch('/users/:id/toggle-admin', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    const newStatus = user.is_admin ? 0 : 1;
    db.prepare('UPDATE users SET is_admin = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id);
    res.json({ id: req.params.id, is_admin: !!newStatus, message: newStatus ? 'تم منح صلاحيات المدير' : 'تم إلغاء صلاحيات المدير' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث صلاحيات المدير', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/admin/users/:id/toggle-active - Toggle active/deactivated
// ═══════════════════════════════════════════════════════════════════════
router.patch('/users/:id/toggle-active', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT is_deactivated FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    const newStatus = user.is_deactivated ? 0 : 1;
    db.prepare('UPDATE users SET is_deactivated = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id);
    // 🔒 FIX: clear the deactivation cache so the change takes effect immediately
    // (otherwise a re-activated user keeps getting 403 for up to 60 seconds).
    clearDeactivationCache(req.params.id);
    res.json({ id: req.params.id, is_deactivated: !!newStatus, message: newStatus ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الحساب' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/users/:id/adjust-wallet - Adjust user wallet
// ═══════════════════════════════════════════════════════════════════════
router.post('/users/:id/adjust-wallet', (req: Request, res: Response) => {
  try {
    const { amount, reason } = req.body;
    if (typeof amount !== 'number' || amount === 0) {
      res.status(400).json({ error: 'يجب تحديد مبلغ صحيح (غير صفري)' });
      return;
    }

    const user = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const newBalance = (user.wallet_balance || 0) + amount;
    if (newBalance < 0) {
      res.status(400).json({ error: 'الرصيد لا يمكن أن يكون سالباً' });
      return;
    }

    db.prepare('UPDATE users SET wallet_balance = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newBalance, req.params.id);

    // Record transaction
    const txType = amount > 0 ? 'admin_deposit' : 'admin_withdrawal';
    db.prepare('INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, txType, Math.abs(amount), reason || 'تعديل يدوي من المدير', 'completed');

    // Notify user
    const notifyMsg = amount > 0
      ? `تم إضافة ${amount} ج.م لمحفظتك${reason ? ` (${reason})` : ''}`
      : `تم خصم ${Math.abs(amount)} ج.م من محفظتك${reason ? ` (${reason})` : ''}`;
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
      .run(req.params.id, 'payment', notifyMsg, '/wallet');

    // Broadcast wallet update to user via WebSocket
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(req.params.id, { type: "wallet:updated", data: { userId: req.params.id, amount } });
      }
    } catch {}

    res.json({
      message: amount > 0 ? `تم إضافة ${amount} ج.م للمحفظة` : `تم خصم ${Math.abs(amount)} ج.م من المحفظة`,
      newBalance,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تعديل المحفظة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/users/:id - Delete a user (with full cascade cleanup)
// ═══════════════════════════════════════════════════════════════════════
// This deletes ALL user data across ALL tables before deleting the user,
// to avoid FOREIGN KEY constraint failures.
router.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = db.prepare('SELECT is_admin, name FROM users WHERE id = ?').get(userId) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    if (user.is_admin) { res.status(403).json({ error: 'لا يمكن حذف مدير' }); return; }

    // Temporarily disable foreign keys so we can delete in any order.
    // This is safe because we're explicitly cleaning up ALL related data.
    db.pragma('foreign_keys = OFF');

    try {
      // Get all tables in the database
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'").all() as any[];

      // For each table, check which columns might reference users and delete
      // matching rows. We check for common user-reference column names.
      const userColumns = ['user_id', 'author_id', 'sender_id', 'receiver_id', 'seller_id',
        'requester_id', 'addressee_id', 'blocker_id', 'blocked_id', 'creator_id',
        'host_id', 'owner_id', 'reporter_id', 'reviewer_id', 'user_id_ref'];

      let deletedRows = 0;
      for (const { name: tableName } of tables) {
        if (tableName === 'users') continue; // Don't delete from users yet
        try {
          // Get table columns
          const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all() as any[];
          const colNames = cols.map(c => c.name);

          // Find which user-reference columns exist in this table
          const matchingCols = colNames.filter(c => userColumns.includes(c));
          if (matchingCols.length === 0) continue;

          // Build DELETE query: DELETE FROM table WHERE col1 = ? OR col2 = ? OR ...
          const conditions = matchingCols.map(c => `"${c}" = ?`).join(' OR ');
          const params = matchingCols.map(() => userId);
          const result = db.prepare(`DELETE FROM "${tableName}" WHERE ${conditions}`).run(...params);
          if (result.changes > 0) {
            deletedRows += result.changes;
          }
        } catch {
          // Skip tables that can't be queried
        }
      }

      // Now delete the channels OWNED by this user (with their sub-data)
      try {
        const ownedChannels = db.prepare('SELECT id FROM channels WHERE owner_id = ?').all(userId) as any[];
        for (const ch of ownedChannels) {
          try {
            db.prepare('DELETE FROM channel_subscribers WHERE channel_id = ?').run(ch.id);
            db.prepare('DELETE FROM channel_posts WHERE channel_id = ?').run(ch.id);
            db.prepare('DELETE FROM channel_livestreams WHERE channel_id = ?').run(ch.id);
            db.prepare('DELETE FROM channel_scheduled_streams WHERE channel_id = ?').run(ch.id);
            db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
          } catch {}
        }
      } catch {}

      // Finally, delete the user
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'لم يتم حذف المستخدم' });
      } else {
        res.json({ message: `تم حذف المستخدم "${user.name}" بنجاح`, deletedRows });
      }
    } finally {
      // Re-enable foreign keys
      db.pragma('foreign_keys = ON');
    }
  } catch (err: any) {
    console.error('[ADMIN] Delete user failed:', err.message);
    try { db.pragma('foreign_keys = ON'); } catch {}
    res.status(500).json({ error: 'فشل حذف المستخدم', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/alerts
// ═══════════════════════════════════════════════════════════════════════
router.post('/alerts', (req: Request, res: Response) => {
  try {
    const { title, content, source, category } = req.body;
    if (!title || !content) { res.status(400).json({ error: 'العنوان والمحتوى مطلوبان' }); return; }
    const newsCategory = category || 'urgent';
    const result = db.prepare('INSERT INTO news_items (title, content, source, is_alert, category) VALUES (?, ?, ?, 1, ?)')
      .run(title, content, source || 'إدارة نواقص', newsCategory);

    const alertId = result.lastInsertRowid;

    // Notify all users via DB notifications
    try {
      const users = db.prepare('SELECT id FROM users WHERE is_deactivated = 0').all() as any[];
      const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');
      const insertMany = db.transaction((userList: any[]) => {
        for (const user of userList) {
          insertNotif.run(user.id, 'alert', `تنبيه إداري: ${title}`, '/notifications?filter=alert');
        }
      });
      insertMany(users);
    } catch { /* notifications table may not exist */ }

    // Push admin alert to ALL connected users via WebSocket for real-time display
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.emitAdminAlert({
          id: String(alertId),
          title,
          content,
          source: source || 'إدارة نواقص',
          isAlert: true,
          category: newsCategory,
          createdAt: new Date().toISOString(),
        });
      }
    } catch { /* WebSocket push failed */ }

    res.status(201).json({ id: alertId, message: 'تم إنشاء التنبيه' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء التنبيه', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/alerts/:id
// ═══════════════════════════════════════════════════════════════════════
router.delete('/alerts/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM news_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف التنبيه' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف التنبيه', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/news - Add news item
// ═══════════════════════════════════════════════════════════════════════
router.post('/news', (req: Request, res: Response) => {
  try {
    const { title, content, source, category, isAlert } = req.body;
    if (!title || !content) { res.status(400).json({ error: 'العنوان والمحتوى مطلوبان' }); return; }
    const newsCategory = category || 'general';
    const alertFlag = isAlert ? 1 : 0;
    const result = db.prepare('INSERT INTO news_items (title, content, source, is_alert, category) VALUES (?, ?, ?, ?, ?)')
      .run(title, content, source || 'نواقص', alertFlag, newsCategory);

    const newsId = result.lastInsertRowid;

    // If this is an alert, notify all users
    if (alertFlag) {
      try {
        const users = db.prepare('SELECT id FROM users WHERE is_deactivated = 0').all() as any[];
        const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');
        const insertMany = db.transaction((userList: any[]) => {
          for (const user of userList) {
            insertNotif.run(user.id, 'alert', `تنبيه إداري: ${title}`, '/notifications?filter=alert');
          }
        });
        insertMany(users);
      } catch { /* notifications table may not exist */ }

      // Push admin alert to ALL connected users via WebSocket for real-time display
      try {
        const wsManager = (req.app.locals as any).wsManager;
        if (wsManager) {
          wsManager.emitAdminAlert({
            id: String(newsId),
            title,
            content,
            source: source || 'نواقص',
            isAlert: true,
            category: newsCategory,
            createdAt: new Date().toISOString(),
          });
        }
      } catch { /* WebSocket push failed */ }
    }

    res.status(201).json({ id: newsId, message: 'تم إضافة الخبر' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إضافة الخبر', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/admin/news/:id - Update news item
// ═══════════════════════════════════════════════════════════════════════
router.put('/news/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM news_items WHERE id = ?').get(req.params.id) as any;
    if (!existing) { res.status(404).json({ error: 'الخبر غير موجود' }); return; }

    const { title, content, source, category, isAlert } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (source !== undefined) { updates.push('source = ?'); values.push(source); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (isAlert !== undefined) { updates.push('is_alert = ?'); values.push(isAlert ? 1 : 0); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'لم يتم تقديم أي تحديثات' });
      return;
    }

    values.push(req.params.id);
    db.prepare(`UPDATE news_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: 'تم تحديث الخبر' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الخبر', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/news/:id - Delete news item
// ═══════════════════════════════════════════════════════════════════════
router.delete('/news/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM news_items WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف الخبر' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الخبر', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/reports - Get reported posts/content
// ═══════════════════════════════════════════════════════════════════════
router.get('/reports', (req: Request, res: Response) => {
  try {
    // Get flagged posts as reports
    const flaggedPosts = db.prepare(`
      SELECT p.id, p.content as post_content, p.author_id as user_id, u.name as user_name,
             p.status, p.created_at, 'محتوى مخالف' as reason
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      WHERE p.status = 'flagged'
      ORDER BY p.created_at DESC
    `).all();

    // Also check if we have a reports table
    let manualReports: any[] = [];
    try {
      manualReports = db.prepare(`
        SELECT r.id, r.post_id, r.user_id, r.reporter_id, u.name as reporter_name,
               r.reason, r.status, r.created_at,
               p.content as post_content, p2.name as user_name
        FROM reports r
        LEFT JOIN users u ON u.id = r.reporter_id
        LEFT JOIN posts p ON p.id = r.post_id
        LEFT JOIN users p2 ON p2.id = r.user_id
        ORDER BY r.created_at DESC
      `).all();
    } catch {
      // reports table may not exist yet
    }

    const combined = [
      ...flaggedPosts.map((fp: any) => ({
        id: `flagged_${fp.id}`,
        post_id: fp.id,
        user_id: fp.user_id,
        user_name: fp.user_name,
        post_content: fp.post_content,
        reason: fp.reason,
        status: 'flagged',
        created_at: fp.created_at,
      })),
      ...manualReports,
    ];

    res.json(combined);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب البلاغات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/reports/:id/dismiss - Dismiss a report
// ═══════════════════════════════════════════════════════════════════════
router.delete('/reports/:id/dismiss', (req: Request, res: Response) => {
  try {
    const reportId = req.params.id;

    // If it's a flagged post reference, unflag it
    if (reportId.startsWith('flagged_')) {
      const postId = reportId.replace('flagged_', '');
      db.prepare("UPDATE posts SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(postId);
      res.json({ message: 'تم رفض البلاغ وإعادة المنشور' });
      return;
    }

    // Try to delete from reports table
    try {
      db.prepare('DELETE FROM reports WHERE id = ?').run(reportId);
      res.json({ message: 'تم رفض البلاغ' });
    } catch {
      // If reports table doesn't exist, just return success
      res.json({ message: 'تم رفض البلاغ' });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض البلاغ', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/categories - Add new category
// ═══════════════════════════════════════════════════════════════════════
router.post('/categories', (req: Request, res: Response) => {
  try {
    const { name, icon, sort } = req.body;
    if (!name) { res.status(400).json({ error: 'اسم الفئة مطلوب' }); return; }

    // Get max sort value
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort), 0) as maxSort FROM categories').get() as any;
    const sortValue = sort || maxSort.maxSort + 1;

    const result = db.prepare('INSERT INTO categories (name, icon, sort) VALUES (?, ?, ?)')
      .run(name, icon || '📁', sortValue);

    res.status(201).json({ id: result.lastInsertRowid, name, icon: icon || '📁', sort: sortValue, message: 'تم إضافة الفئة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إضافة الفئة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/admin/categories/:id - Update category
// ═══════════════════════════════════════════════════════════════════════
router.put('/categories/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id) as any;
    if (!existing) { res.status(404).json({ error: 'الفئة غير موجودة' }); return; }

    const { name, icon, sort } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
    if (sort !== undefined) { updates.push('sort = ?'); values.push(sort); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'لم يتم تقديم أي تحديثات' });
      return;
    }

    values.push(req.params.id);
    db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ message: 'تم تحديث الفئة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الفئة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/categories/:id - Delete category
// ═══════════════════════════════════════════════════════════════════════
router.delete('/categories/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(req.params.id) as any;
    if (!existing) { res.status(404).json({ error: 'الفئة غير موجودة' }); return; }
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف الفئة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الفئة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/admin/posts/:id/feature - Feature a post
// ═══════════════════════════════════════════════════════════════════════
router.put('/posts/:id/feature', (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    // Add is_featured column if not exists
    try {
      db.prepare('ALTER TABLE posts ADD COLUMN is_featured INTEGER DEFAULT 0').run();
    } catch { /* column already exists */ }

    db.prepare('UPDATE posts SET is_featured = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم تمييز المنشور' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تمييز المنشور', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/posts/:id/feature - Remove feature from post
// ═══════════════════════════════════════════════════════════════════════
router.delete('/posts/:id/feature', (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    db.prepare('UPDATE posts SET is_featured = 0, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم إزالة التمييز من المنشور' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إزالة التمييز', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/admin/posts/:id/flag - Flag a post
// ═══════════════════════════════════════════════════════════════════════
router.patch('/posts/:id/flag', (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    db.prepare("UPDATE posts SET status = 'flagged', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ message: 'تم وضع علامة على المنشور' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل وضع العلامة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/settings - Get site settings
// ═══════════════════════════════════════════════════════════════════════
router.get('/settings', (req: Request, res: Response) => {
  try {
    // Create settings table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const settings = db.prepare('SELECT key, value FROM site_settings').all() as any[];

    const defaults: Record<string, string> = {
      siteName: 'نواقص',
      maintenanceMode: 'false',
      maxUploadSize: '5',
      defaultWalletBalance: '0',
    };

    const result: Record<string, any> = {};
    for (const row of settings) {
      result[row.key] = row.value;
    }

    // Apply defaults for missing keys
    for (const [key, defaultValue] of Object.entries(defaults)) {
      if (!(key in result)) {
        result[key] = defaultValue;
        try {
          db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)').run(key, defaultValue);
        } catch {}
      }
    }

    // Convert boolean strings
    result.maintenanceMode = result.maintenanceMode === 'true';
    result.maxUploadSize = parseInt(result.maxUploadSize) || 5;
    result.defaultWalletBalance = parseFloat(result.defaultWalletBalance) || 0;

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإعدادات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PUT /api/admin/settings - Update site settings
// ═══════════════════════════════════════════════════════════════════════
router.put('/settings', (req: Request, res: Response) => {
  try {
    // Ensure settings table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);

    const upsert = db.prepare(`
      INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    const allowedKeys = ['siteName', 'maintenanceMode', 'maxUploadSize', 'defaultWalletBalance'];

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedKeys.includes(key)) {
        const stringValue = typeof value === 'boolean' ? String(value) : String(value);
        upsert.run(key, stringValue);
      }
    }

    // If defaultWalletBalance changed, update future users (existing users keep their balance)
    if (req.body.defaultWalletBalance !== undefined) {
      // This only affects new registrations - handled in auth route
    }

    res.json({ message: 'تم حفظ الإعدادات بنجاح' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ الإعدادات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Database migration: Add is_featured column to posts if missing
// ═══════════════════════════════════════════════════════════════════════
try {
  db.prepare('ALTER TABLE posts ADD COLUMN is_featured INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }

// Add gender column to users if missing
try {
  db.prepare('ALTER TABLE users ADD COLUMN gender TEXT DEFAULT \'male\'').run();
} catch { /* column already exists */ }

// Create reports table if not exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      post_id TEXT,
      user_id TEXT,
      reporter_id TEXT NOT NULL,
      reason TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
} catch { /* table already exists */ }

// Create site_settings table if not exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
} catch { /* table already exists */ }

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/all-posts - Get all posts with full details for admin
// ═══════════════════════════════════════════════════════════════════════
router.get('/all-posts', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const search = req.query.search as string;

    let whereClause = '1=1';
    const params: any[] = [];

    if (status && status !== 'all') {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      whereClause += ' AND p.type = ?';
      params.push(type);
    }
    if (search) {
      whereClause += ' AND (p.content LIKE ? OR u.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const posts = db.prepare(`
      SELECT p.*, u.name as author_name, u.avatar as author_avatar, u.is_verified as author_verified,
             u.phone as author_phone,
             c.name as category_name
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      LEFT JOIN categories c ON c.id = p.category
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      WHERE ${whereClause}
    `).get(...params) as any;

    res.json({ posts, total: total.count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المنشورات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/transactions - Get all transactions
// ═══════════════════════════════════════════════════════════════════════
router.get('/transactions', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const type = req.query.type as string;

    let whereClause = '1=1';
    const params: any[] = [];

    if (type && type !== 'all') {
      whereClause += ' AND t.type = ?';
      params.push(type);
    }

    const transactions = db.prepare(`
      SELECT t.*, u.name as user_name, u.email as user_email
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM transactions t WHERE ${whereClause}
    `).get(...params) as any;

    res.json({ transactions, total: total.count, page, limit });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المعاملات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/activity-log - Get recent activity log
// ═══════════════════════════════════════════════════════════════════════
router.get('/activity-log', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const activities: any[] = [];

    // Recent posts
    const recentPosts = db.prepare(`
      SELECT p.id, p.content, p.type, p.status, p.created_at,
             u.name as user_name, u.id as user_id, 'post' as activity_type
      FROM posts p LEFT JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at DESC LIMIT ?
    `).all(limit);

    // Recent users
    const recentUsers = db.prepare(`
      SELECT id, name, email, created_at, 'user_register' as activity_type
      FROM users ORDER BY created_at DESC LIMIT ?
    `).all(limit);

    // Recent transactions
    const recentTx = db.prepare(`
      SELECT t.id, t.type, t.amount, t.status, t.created_at,
             u.name as user_name, t.type as tx_type, 'transaction' as activity_type
      FROM transactions t LEFT JOIN users u ON u.id = t.user_id
      ORDER BY t.created_at DESC LIMIT ?
    `).all(limit);

    // Recent promotion requests
    const recentPromos = db.prepare(`
      SELECT pr.id, pr.status, pr.created_at, pr.price, pr.package_name,
             u.name as user_name, 'promotion' as activity_type
      FROM promotion_requests pr LEFT JOIN users u ON u.id = pr.author_id
      ORDER BY pr.created_at DESC LIMIT ?
    `).all(limit);

    // Merge and sort by date
    const all = [
      ...recentPosts.map((p: any) => ({ ...p, sortDate: new Date(p.created_at).getTime() })),
      ...recentUsers.map((u: any) => ({ ...u, sortDate: new Date(u.created_at).getTime() })),
      ...recentTx.map((t: any) => ({ ...t, sortDate: new Date(t.created_at).getTime() })),
      ...recentPromos.map((p: any) => ({ ...p, sortDate: new Date(p.created_at).getTime() })),
    ].sort((a, b) => b.sortDate - a.sortDate).slice(0, limit);

    res.json(all);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب سجل النشاط', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/stories - Get all stories for management
// ═══════════════════════════════════════════════════════════════════════
router.get('/stories', (req: Request, res: Response) => {
  try {
    const stories = db.prepare(`
      SELECT s.*, u.name as user_name, u.avatar as user_avatar
      FROM stories s LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC
    `).all();
    res.json(stories);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب القصص', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/stories/:id - Delete a story
// ═══════════════════════════════════════════════════════════════════════
router.delete('/stories/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف القصة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف القصة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/chat-messages - Get recent chat messages for monitoring
// ═══════════════════════════════════════════════════════════════════════
router.get('/chat-messages', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const messages = db.prepare(`
      SELECT cm.*, u1.name as sender_name, u2.name as receiver_name
      FROM chat_messages cm
      LEFT JOIN users u1 ON u1.id = cm.sender_id
      LEFT JOIN users u2 ON u2.id = cm.receiver_id
      ORDER BY cm.created_at DESC LIMIT ?
    `).all(limit);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الرسائل', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/chat-messages/:id - Delete a chat message
// ═══════════════════════════════════════════════════════════════════════
router.delete('/chat-messages/:id', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM chat_messages WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف الرسالة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الرسالة', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/database-info - Get database stats and info
// ═══════════════════════════════════════════════════════════════════════
router.get('/database-info', (req: Request, res: Response) => {
  try {
    // 🔧 FIX: dynamically list ALL tables from sqlite_master instead of
    // a hardcoded list that was missing ~44 newer tables (channels,
    // live_streams, market_listings, chat_groups, etc.)
    const allTables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%' ORDER BY name"
    ).all() as any[];
    const tables = allTables.map(t => t.name);

    const tableCounts: Record<string, number> = {};
    for (const table of tables) {
      try {
        const result = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as any;
        tableCounts[table] = result.count;
      } catch {
        tableCounts[table] = -1;
      }
    }

    // Database file size (approximate)
    let dbSize = 0;
    try {
      // Use the fs / path already imported at the top of this module.
      // (`require` is not defined in ESM — see package.json "type": "module".)
      // Also fall back to /data/nawaqes.db (HF Spaces persistent volume).
      const candidates = [
        dbPath,
        path.resolve(process.cwd(), 'data', 'nawaqes.db'),
        '/data/nawaqes.db',
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          dbSize = fs.statSync(p).size;
          break;
        }
      }
    } catch {}

    res.json({
      tables: tableCounts,
      totalTables: Object.values(tableCounts).filter(v => v >= 0).length,
      dbSize,
      dbSizeFormatted: dbSize > 1048576 ? `${(dbSize / 1048576).toFixed(2)} MB` : `${(dbSize / 1024).toFixed(2)} KB`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب معلومات قاعدة البيانات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/broadcast - Send notification to all users
// ═══════════════════════════════════════════════════════════════════════
router.post('/broadcast', (req: Request, res: Response) => {
  try {
    const { title, message, type } = req.body;
    if (!message) { res.status(400).json({ error: 'الرسالة مطلوبة' }); return; }

    const users = db.prepare('SELECT id FROM users WHERE is_deactivated = 0').all() as any[];
    const notifType = type || 'system';
    // Add appropriate link based on notification type
    const notifLink = notifType === 'alert' ? '/notifications?filter=alert' : notifType === 'promotion' ? '/promotions' : notifType === 'payment' ? '/wallet' : '';
    const insert = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');

    const insertMany = db.transaction((userList: any[]) => {
      for (const user of userList) {
        insert.run(user.id, notifType, message, notifLink);
      }
    });

    insertMany(users);

    // Push broadcast notification to ALL connected users via WebSocket
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        // If the broadcast is an alert type, also push as admin alert for the alert bar
        if (notifType === 'alert') {
          wsManager.emitAdminAlert({
            id: `broadcast_${Date.now()}`,
            title: title || message.slice(0, 50),
            content: message,
            source: 'إدارة نواقص',
            isAlert: true,
            category: 'urgent',
            createdAt: new Date().toISOString(),
          });
        }
        // Also push as regular notification to all connected users
        for (const user of users) {
          wsManager.emitNotification(user.id, {
            type: notifType,
            message,
            link: notifLink,
            time: new Date().toISOString(),
          });
        }
      }
    } catch { /* WebSocket push failed */ }

    res.json({ message: `تم إرسال الإشعار إلى ${users.length} مستخدم`, count: users.length });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال الإشعار', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/cleanup - Clean up old data
// ═══════════════════════════════════════════════════════════════════════
router.post('/cleanup', (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    let result: Record<string, any> = {};

    switch (action) {
      case 'expired_promotions': {
        const r = db.prepare(`
          UPDATE posts SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
          WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
        `).run();
        result = { message: `تم إنهاء ${r.changes} ترويج منتهي`, count: r.changes };
        break;
      }
      case 'old_notifications': {
        const r = db.prepare("DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')").run();
        result = { message: `تم حذف ${r.changes} إشعار قديم`, count: r.changes };
        break;
      }
      case 'sessions':
      case 'old_sessions': {
        const r = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
        result = { message: `تم حذف ${r.changes} جلسة منتهية`, count: r.changes };
        break;
      }
      case 'orphan_data':
      case 'orphan_posts': {
        // Delete orphan posts (no matching user)
        const r1 = db.prepare('DELETE FROM posts WHERE author_id IS NOT NULL AND author_id NOT IN (SELECT id FROM users)').run();
        // Delete orphan comments (no matching post)
        const r2 = db.prepare('DELETE FROM post_comments WHERE post_id NOT IN (SELECT id FROM posts)').run();
        // Delete orphan chat messages (no matching sender)
        const r3 = db.prepare('DELETE FROM chat_messages WHERE sender_id NOT IN (SELECT id FROM users)').run();
        const total = r1.changes + r2.changes + r3.changes;
        result = { message: `تم حذف ${total} بيانات يتيمة (${r1.changes} منشور، ${r2.changes} تعليق، ${r3.changes} رسالة)`, count: total };
        break;
      }
      case 'old_stories':
      case 'expired_stories': {
        // Stories expire after 24 hours based on created_at (no expires_at column)
        const r = db.prepare("DELETE FROM stories WHERE created_at < datetime('now', '-1 day')").run();
        result = { message: `تم حذف ${r.changes} قصة منتهية`, count: r.changes };
        break;
      }
      case 'optimize': {
        // SQLite VACUUM to reclaim space and optimize the database
        const beforeSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
        const afterSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        const savedMB = ((beforeSize - afterSize) / 1024 / 1024).toFixed(2);
        result = { message: `تم تحسين القاعدة وتوفير ${savedMB} MB`, count: beforeSize > 0 ? Math.round((afterSize / beforeSize) * 100) : 100 };
        break;
      }
      default:
        res.status(400).json({ error: 'إجراء تنظيف غير معروف' });
        return;
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل عملية التنظيف', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/user-details/:id - Get full user details
// ═══════════════════════════════════════════════════════════════════════
router.get('/user-details/:id', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = ?').get(req.params.id) as any;
    // post_comments uses author_id (not user_id)
    const comments = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE author_id = ?').get(req.params.id) as any;
    const transactions = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(req.params.id);
    // notifications uses `read` (not is_read)
    const notifications = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.params.id) as any;
    // friendships uses requester_id / addressee_id (not user_id / friend_id)
    const friends = db.prepare(`
      SELECT COUNT(*) as count FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
    `).get(req.params.id, req.params.id) as any;

    res.json({
      ...user,
      stats: {
        postsCount: posts.count,
        commentsCount: comments.count,
        unreadNotifications: notifications.count,
        friendsCount: friends.count,
      },
      recentTransactions: transactions,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب تفاصيل المستخدم', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/reports/:id/action - Take action on a report
// ═══════════════════════════════════════════════════════════════════════
router.post('/reports/:id/action', (req: Request, res: Response) => {
  try {
    const { action } = req.body;
    const reportId = req.params.id;

    if (!action) { res.status(400).json({ error: 'يجب تحديد الإجراء' }); return; }

    // If it's a flagged post reference
    if (reportId.startsWith('flagged_')) {
      const postId = reportId.replace('flagged_', '');

      if (action === 'dismiss' || action === 'unflag') {
        db.prepare("UPDATE posts SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(postId);
        res.json({ message: 'تم رفض البلاغ وإعادة المنشور' });
        return;
      }

      if (action === 'delete_post') {
        db.prepare("UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(postId);
        // Broadcast to ALL users so feeds sync (website + app)
        try {
          const wsManager = (req.app.locals as any).wsManager;
          if (wsManager) {
            wsManager.broadcast({ type: 'post:deleted', data: { postId } });
            wsManager.broadcast({ type: 'data:refresh', data: { reason: 'post-deleted' } });
          }
        } catch {}
        res.json({ message: 'تم حذف المنشور المخالف' });
        return;
      }

      if (action === 'warn_user') {
        const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(postId) as any;
        if (post) {
          db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
            .run(post.author_id, 'warning', 'تحذير: تم الإبلاغ عن منشورك لمخالفته سياسات المجتمع. يرجى الالتزام بالقواعد.');
        }
        db.prepare("UPDATE posts SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(postId);
        res.json({ message: 'تم تحذير المستخدم' });
        return;
      }

      if (action === 'ban_user') {
        const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(postId) as any;
        if (post) {
          db.prepare('UPDATE users SET is_deactivated = 1, updated_at = datetime(\'now\') WHERE id = ?').run(post.author_id);
          clearDeactivationCache(post.author_id);
        }
        db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
        // Broadcast to sync all clients
        try {
          const wsManager = (req.app.locals as any).wsManager;
          if (wsManager) {
            wsManager.broadcast({ type: 'post:deleted', data: { postId } });
            wsManager.broadcast({ type: 'data:refresh', data: { reason: 'user-banned' } });
          }
        } catch {}
        res.json({ message: 'تم حظر المستخدم وحذف المنشور' });
        return;
      }
    }

    // Handle reports table entries
    if (action === 'dismiss') {
      try { db.prepare('DELETE FROM reports WHERE id = ?').run(reportId); } catch {}
      res.json({ message: 'تم رفض البلاغ' });
      return;
    }

    // Get report details for further actions
    let report: any = null;
    try {
      report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as any;
    } catch { /* reports table may not exist */ }

    if (!report) {
      res.status(404).json({ error: 'البلاغ غير موجود' });
      return;
    }

    if (action === 'delete_post' && report.post_id) {
      db.prepare("UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(report.post_id);
      try { db.prepare('DELETE FROM reports WHERE id = ?').run(reportId); } catch {}
      res.json({ message: 'تم حذف المنشور المخالف' });
      return;
    }

    if (action === 'warn_user' && report.user_id) {
      db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
        .run(report.user_id, 'warning', 'تحذير: تم الإبلاغ عن نشاطك لمخالفته سياسات المجتمع. يرجى الالتزام بالقواعد.');
      try { db.prepare('DELETE FROM reports WHERE id = ?').run(reportId); } catch {}
      res.json({ message: 'تم تحذير المستخدم' });
      return;
    }

    if (action === 'ban_user' && report.user_id) {
      db.prepare('UPDATE users SET is_deactivated = 1, updated_at = datetime(\'now\') WHERE id = ?').run(report.user_id);
      clearDeactivationCache(report.user_id);
      if (report.post_id) {
        db.prepare("UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(report.post_id);
      }
      try { db.prepare('DELETE FROM reports WHERE id = ?').run(reportId); } catch {}
      res.json({ message: 'تم حظر المستخدم' });
      return;
    }

    res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تنفيذ الإجراء', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/smart-links - Smart link analytics overview
// ═══════════════════════════════════════════════════════════════════════
router.get('/smart-links', (req: Request, res: Response) => {
  try {
    const totalLinks = db.prepare("SELECT COUNT(DISTINCT post_id) as count FROM smart_link_visits WHERE post_id IN (SELECT id FROM posts WHERE smart_link_alias != '')").get() as any;
    const totalVisits = db.prepare('SELECT COUNT(*) as count FROM smart_link_visits').get() as any;
    const uniqueVisitors = db.prepare('SELECT COUNT(DISTINCT COALESCE(visitor_id, visitor_ip)) as count FROM smart_link_visits').get() as any;

    const topLinks = db.prepare(`
      SELECT p.id, p.content, p.smart_link_alias, COUNT(v.id) as visit_count,
             COUNT(DISTINCT COALESCE(v.visitor_id, v.visitor_ip)) as unique_visitors
      FROM smart_link_visits v
      JOIN posts p ON p.id = v.post_id
      GROUP BY v.post_id
      ORDER BY visit_count DESC
      LIMIT 10
    `).all();

    // Visits by date (last 30 days)
    const visitsByDate = db.prepare(`
      SELECT DATE(visited_at) as date, COUNT(*) as count
      FROM smart_link_visits
      WHERE visited_at >= datetime('now', '-30 days')
      GROUP BY DATE(visited_at)
      ORDER BY date ASC
    `).all();

    res.json({
      totalLinks: totalLinks.count || 0,
      totalVisits: totalVisits.count || 0,
      uniqueVisitors: uniqueVisitors.count || 0,
      topLinks,
      visitsByDate,
    });
  } catch (err: any) {
    // If smart_link_visits doesn't exist yet, return empty data
    res.json({
      totalLinks: 0,
      totalVisits: 0,
      uniqueVisitors: 0,
      topLinks: [],
      visitsByDate: [],
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/comments - Recent comments for moderation
// ═══════════════════════════════════════════════════════════════════════
router.get('/comments', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const postId = req.query.postId as string;

    let query = `
      SELECT pc.*, u.name as author_name, u.avatar as author_avatar, u.is_verified as author_verified,
             p.content as post_content, p.id as post_id
      FROM post_comments pc
      LEFT JOIN users u ON u.id = pc.author_id
      LEFT JOIN posts p ON p.id = pc.post_id
    `;
    const params: any[] = [];

    if (postId) {
      query += ' WHERE pc.post_id = ?';
      params.push(postId);
    }

    query += ' ORDER BY pc.created_at DESC LIMIT ?';
    params.push(limit);

    const comments = db.prepare(query).all(...params);
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب التعليقات', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/comments/:id - Delete a comment
// ═══════════════════════════════════════════════════════════════════════
router.delete('/comments/:id', (req: Request, res: Response) => {
  try {
    const comment = db.prepare('SELECT id, post_id FROM post_comments WHERE id = ?').get(req.params.id) as any;
    if (!comment) { res.status(404).json({ error: 'التعليق غير موجود' }); return; }

    db.prepare('DELETE FROM post_comments WHERE id = ?').run(req.params.id);

    // Update comments count on the post
    try {
      db.prepare('UPDATE posts SET comments = (SELECT COUNT(*) FROM post_comments WHERE post_id = ?) WHERE id = ?')
        .run(comment.post_id, comment.post_id);
    } catch {}

    res.json({ message: 'تم حذف التعليق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف التعليق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/admin/users/:id/toggle-trusted - Toggle trusted status
// ═══════════════════════════════════════════════════════════════════════
router.patch('/users/:id/toggle-trusted', (req: Request, res: Response) => {
  try {
    const user = db.prepare('SELECT is_trusted FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }
    const newStatus = user.is_trusted ? 0 : 1;
    db.prepare('UPDATE users SET is_trusted = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id);
    res.json({ id: req.params.id, is_trusted: !!newStatus, message: newStatus ? 'تم منح حالة الموثوق' : 'تم إلغاء حالة الموثوق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الموثوق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/users/:id/send-warning - Send warning notification to user
// ═══════════════════════════════════════════════════════════════════════
router.post('/users/:id/send-warning', (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(req.params.id) as any;
    if (!user) { res.status(404).json({ error: 'المستخدم غير موجود' }); return; }

    const warningMessage = reason
      ? `تحذير من الإدارة: ${reason}`
      : 'تحذير من الإدارة: تم تنبيهك لمخالفة سياسات المجتمع. يرجى الالتزام بالقواعد.';

    db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
      .run(req.params.id, 'warning', warningMessage);

    res.json({ message: 'تم إرسال التحذير للمستخدم' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال التحذير', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/dashboard/realtime - Realtime stats for live dashboard
// ═══════════════════════════════════════════════════════════════════════
router.get('/dashboard/realtime', (req: Request, res: Response) => {
  try {
    // Count users with active sessions (last 15 minutes)
    const onlineUsers = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE expires_at > datetime('now')").get() as any;

    // Posts created today
    const newPostsToday = db.prepare("SELECT COUNT(*) as count FROM posts WHERE created_at >= datetime('now', '-1 day')").get() as any;

    // Users registered today
    const newUsersToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-1 day')").get() as any;

    // Pending items
    const pendingCharging = db.prepare("SELECT COUNT(*) as count FROM charging_requests WHERE status = 'pending'").get() as any;
    const pendingPromotions = db.prepare("SELECT COUNT(*) as count FROM promotion_requests WHERE status = 'pending'").get() as any;
    const flaggedPosts = db.prepare("SELECT COUNT(*) as count FROM posts WHERE status = 'flagged'").get() as any;

    // Recent activity (last 5 items)
    const recentActivity: any[] = [];

    const recentUsers = db.prepare("SELECT name, created_at FROM users ORDER BY created_at DESC LIMIT 2").all() as any[];
    for (const u of recentUsers) {
      recentActivity.push({ type: 'user', description: `مستخدم جديد: ${u.name}`, created_at: u.created_at });
    }

    const recentPosts = db.prepare("SELECT p.content, u.name, p.created_at FROM posts p LEFT JOIN users u ON u.id = p.author_id ORDER BY p.created_at DESC LIMIT 2").all() as any[];
    for (const p of recentPosts) {
      recentActivity.push({ type: 'post', description: `منشور جديد من ${p.name || 'مجهول'}`, created_at: p.created_at });
    }

    const recentTransactions = db.prepare("SELECT t.amount, t.type, u.name, t.created_at FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 2").all() as any[];
    for (const t of recentTransactions) {
      recentActivity.push({ type: 'transaction', description: `معاملة ${t.type} - ${t.amount} ج.م (${t.name || 'مجهول'})`, created_at: t.created_at });
    }

    // Sort by date
    recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      onlineUsers: onlineUsers.count || 0,
      wsOnlineUsers: (req.app.locals as any).wsManager?.getConnectionCount() || 0,
      newPostsToday: newPostsToday.count || 0,
      newUsersToday: newUsersToday.count || 0,
      pendingItems: (pendingCharging.count || 0) + (pendingPromotions.count || 0) + (flaggedPosts.count || 0),
      recentActivity: recentActivity.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإحصائيات الحية', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Market Promotion Request routes (see below — duplicates removed)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/market-listings - Get ALL market listings (for admin management)
// Supports ?status=active|paused|sold|deleted and ?search=query
// ═══════════════════════════════════════════════════════════════════════
router.get('/market-listings', (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || '';
    const search = (req.query.search as string) || '';
    let query = `
      SELECT ml.*, u.name as seller_name, u.avatar as seller_avatar, u.phone as seller_phone
      FROM market_listings ml
      LEFT JOIN users u ON u.id = ml.seller_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (status) {
      query += ' AND ml.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (ml.title LIKE ? OR ml.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY ml.created_at DESC LIMIT 200';
    const listings = db.prepare(query).all(...params);
    res.json(listings);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إعلانات السوق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/admin/market-listings/:id - Admin deletes a market listing
// ═══════════════════════════════════════════════════════════════════════
router.delete('/market-listings/:id', (req: Request, res: Response) => {
  try {
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    db.prepare("UPDATE market_listings SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ message: 'تم حذف الإعلان' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الإعلان', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/market-listings/:id/feature - Admin toggles featured status
// ═══════════════════════════════════════════════════════════════════════
router.post('/market-listings/:id/feature', (req: Request, res: Response) => {
  try {
    const listing = db.prepare('SELECT is_featured FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    const newFeatured = listing.is_featured ? 0 : 1;
    db.prepare('UPDATE market_listings SET is_featured = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newFeatured, req.params.id);
    res.json({ message: newFeatured ? 'تم تمييز الإعلان كمميز' : 'تم إلغاء تمييز الإعلان', is_featured: !!newFeatured });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث التمييز', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GET /api/admin/market-promotion-requests - Get market promotion requests
// ═══════════════════════════════════════════════════════════════════════
router.get('/market-promotion-requests', (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    let query = 'SELECT mpr.*, ml.title as listing_title, u.name as seller_name, u.avatar as seller_avatar FROM market_promotion_requests mpr LEFT JOIN market_listings ml ON ml.id = mpr.listing_id LEFT JOIN users u ON u.id = mpr.seller_id';
    const params: any[] = [];
    if (status && ['pending', 'approved', 'rejected', 'expired'].includes(status)) {
      query += ' WHERE mpr.status = ?';
      params.push(status);
    }
    query += ' ORDER BY mpr.created_at DESC';
    const requests = db.prepare(query).all(...params);
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات ترويج السوق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/market-promotion-requests/:id/approve - Approve market promotion
// ═══════════════════════════════════════════════════════════════════════
router.post('/market-promotion-requests/:id/approve', (req: Request, res: Response) => {
  try {
    const pr = db.prepare('SELECT * FROM market_promotion_requests WHERE id = ?').get(req.params.id) as any;
    if (!pr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    // Status guard (C4 fix): only pending requests can be approved.
    if (pr.status !== 'pending') {
      res.status(400).json({ error: 'تمت معالجة هذا الطلب بالفعل' });
      return;
    }

    // Update promotion request status
    db.prepare("UPDATE market_promotion_requests SET status = 'approved' WHERE id = ?").run(req.params.id);

    // Calculate duration in days (duration field stores hours in market packages)
    const durationDays = pr.duration ? Math.ceil(pr.duration / 24) : 3;
    const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

    // Activate the listing promotion
    db.prepare(`UPDATE market_listings SET
      is_promoted = 1,
      promotion_status = 'approved',
      promotion_tier = ?,
      promotion_package = ?,
      promotion_started_at = datetime('now'),
      promotion_expires_at = ?,
      estimated_reach = ?,
      updated_at = datetime('now')
      WHERE id = ?`).run(
      pr.tier, pr.package_name || '', expiresAt, pr.estimated_reach || 0, pr.listing_id
    );

    // Notify the seller about approval
    db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
      .run(pr.seller_id, 'promotion', `تم الموافقة على ترويج إعلانك في السوق الذكي - باقة ${pr.package_name || pr.tier}`);
    // 🔧 BROADCAST to ALL users to refresh
    try { const wsManager = (req.app.locals as any).wsManager; if (wsManager) wsManager.broadcast({ type: "data:refresh", data: { reason: "market-promotion-approved" } }); } catch {}

    // ─── Send notifications to targeted users ───
    try {
      const maxNotifications = pr.estimated_reach ? Math.min(Math.floor(pr.estimated_reach / 10), 500) : 50;
      let targetUsers: any[] = [];

      let targetingQuery = 'SELECT id FROM users WHERE id != ? AND is_deactivated = 0';
      const targetParams: any[] = [pr.seller_id];

      // City targeting
      if (pr.targeting === 'city' && pr.target_city) {
        let cities: string[] = [];
        try {
          const parsed = JSON.parse(pr.target_city);
          if (Array.isArray(parsed)) cities = parsed;
        } catch {
          cities = [pr.target_city];
        }
        if (cities.length > 0) {
          const cityConditions = cities.map(() => '(location LIKE ? OR location LIKE ?)').join(' OR ');
          targetingQuery += ` AND (${cityConditions})`;
          for (const city of cities) {
            targetParams.push(`%${city}%`, `${city}%`);
          }
        }
      }

      // Interest targeting
      if (pr.targeting === 'interests' && pr.target_interests) {
        let interests: string[] = [];
        try {
          const parsed = JSON.parse(pr.target_interests);
          if (Array.isArray(parsed)) interests = parsed;
        } catch {
          interests = [pr.target_interests];
        }
        if (interests.length > 0) {
          const interestConditions = interests.map(() => 'interests LIKE ?').join(' OR ');
          targetingQuery += ` AND (${interestConditions})`;
          for (const interest of interests) {
            targetParams.push(`%"${interest}"%`);
          }
        }
      }

      targetingQuery += ` ORDER BY RANDOM() LIMIT ?`;
      targetParams.push(String(maxNotifications));

      targetUsers = db.prepare(targetingQuery).all(...targetParams);

      // Send notification to each targeted user
      const listingTitle = pr.listing_title || 'إعلان';
      const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)');
      for (const user of targetUsers) {
        insertNotif.run(user.id, 'promotion', `إعلان جديد في السوق الذكي قد يهمك: ${listingTitle}`);
      }
    } catch (notifErr: any) {
      console.error('Error sending targeted notifications for market promotion:', notifErr.message);
    }

    res.json({ message: 'تم الموافقة على طلب ترويج السوق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل الموافقة على ترويج السوق', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/admin/market-promotion-requests/:id/reject - Reject market promotion
// ═══════════════════════════════════════════════════════════════════════
router.post('/market-promotion-requests/:id/reject', (req: Request, res: Response) => {
  try {
    const pr = db.prepare('SELECT * FROM market_promotion_requests WHERE id = ?').get(req.params.id) as any;
    if (!pr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    // Status guard (C3 fix): only pending requests can be rejected.
    if (pr.status !== 'pending') {
      res.status(400).json({ error: 'تمت معالجة هذا الطلب بالفعل' });
      return;
    }

    // Use a transaction so the status update + listing update + refund +
    // transaction record are atomic (H1 fix).
    const txId = crypto.randomBytes(16).toString('hex');
    db.transaction(() => {
      db.prepare("UPDATE market_promotion_requests SET status = 'rejected' WHERE id = ?").run(req.params.id);
      db.prepare("UPDATE market_listings SET promotion_status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(pr.listing_id);
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
        .run(pr.price, pr.seller_id);
      db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(txId, pr.seller_id, 'promotion_refund', pr.price, 'محفظة', 'completed');
    })();

    // Notify the seller about rejection (M1 fix: use 'promotion' type + link)
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
      .run(pr.seller_id, 'promotion', `تم رفض طلب ترويج إعلانك وتم استرداد ${pr.price} ج.م`, `/market/listing/${pr.listing_id}`);

    res.json({ message: 'تم رفض طلب ترويج السوق' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض ترويج السوق', details: err.message });
  }
});

// 🔒 RADICAL FIX: Manual uploads backup endpoint — backs up ALL files in
// /data/uploads to HF Dataset immediately. Useful for recovering existing
// images after a rebuild. Runs in background (non-blocking).
router.post('/backup-uploads', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, message: 'بدأ النسخ الاحتياطي للصور في الخلفية' });
    // Import dynamically to avoid circular dependency
    const { backupUploadsToHF } = await import('../database/backup-system.js');
    backupUploadsToHF();
  } catch (err: any) {
    console.error('[ADMIN] backup-uploads failed:', err.message);
  }
});

// Backup stats endpoint
router.get('/backup-stats', (_req: Request, res: Response) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    let uploadCount = 0;
    let uploadSize = 0;
    const sampleFiles: string[] = [];
    if (fs.existsSync(uploadsDir)) {
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.isFile()) { uploadCount++; try { uploadSize += fs.statSync(full).size; if (sampleFiles.length < 5) sampleFiles.push(full); } catch {} }
        }
      };
      walk(uploadsDir);
    }
    const hfToken = !!process.env.HF_TOKEN;
    res.json({
      uploadCount,
      uploadSize,
      uploadSizeMB: Math.round(uploadSize / 1024 / 1024 * 100) / 100,
      hfConfigured: hfToken,
      hfRepo: process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backups',
      uploadsDir,
      cwd: process.cwd(),
      sampleFiles,
      envHFToken: process.env.HF_TOKEN ? 'SET (len=' + process.env.HF_TOKEN.length + ')' : 'NOT SET',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإحصائيات', details: err.message });
  }
});

// Debug endpoint: test HF backup for a specific file — RETURNS the error
router.post('/test-hf-backup', async (req: Request, res: Response) => {
  try {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    // Find first file (non-cache)
    let testFile = '';
    if (fs.existsSync(uploadsDir)) {
      const walk = (dir: string): string => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === '.cache') continue;
            const found = walk(full);
            if (found) return found;
          } else if (e.isFile()) {
            return full;
          }
        }
        return '';
      };
      testFile = walk(uploadsDir);
    }
    if (!testFile) { res.json({ error: 'No files to test' }); return; }

    // Run the backup SYNCHRONOUSLY and capture output
    const { execFileSync } = await import('child_process');
    const filename = path.basename(testFile);
    const pathInRepo = `uploads/${filename}`;
    const HF_TOKEN = process.env.HF_TOKEN || '';
    const HF_BACKUP_REPO = process.env.HF_BACKUP_REPO || 'safwatkhokha/nawaqes-backups';

    const uploadScript = `
import os, sys
from huggingface_hub import upload_file
try:
    upload_file(
        path_or_fileobj=os.environ['LOCAL_FILE'],
        path_in_repo=os.environ['PATH_IN_REPO'],
        repo_id=os.environ['HF_BACKUP_REPO'],
        repo_type='dataset',
        token=os.environ.get('HF_TOKEN', ''),
        commit_message='Test backup',
    )
    print('OK')
except Exception as e:
    print('ERROR:', repr(e), file=sys.stderr)
    sys.exit(1)
`;
    let result = '';
    let error = '';
    try {
      result = execFileSync('python3', ['-c', uploadScript], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          LOCAL_FILE: testFile,
          PATH_IN_REPO: pathInRepo,
          HF_BACKUP_REPO,
          HF_TOKEN,
        },
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      error = err.stderr?.toString() || err.message;
    }
    res.json({
      testFile,
      pathInRepo,
      hfTokenSet: !!HF_TOKEN,
      hfTokenLen: HF_TOKEN.length,
      result: result.trim(),
      error: error.slice(0, 500),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// MARKET LIVE VIDEO MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// GET /api/admin/market-live — List all videos with stats
router.get('/market-live', (_req: Request, res: Response) => {
  try {
    const videos = db.prepare(`
      SELECT v.*, u.name as author_name, u.avatar as author_avatar, u.avatar_base64,
             COALESCE(ml.title, p.content, '') as linked_title,
             (SELECT COUNT(*) FROM video_interactions vi WHERE vi.video_id = v.id AND vi.interaction_type = 'view') as view_count,
             (SELECT COUNT(*) FROM video_interactions vi WHERE vi.video_id = v.id AND vi.interaction_type = 'like') as like_count,
             (SELECT COUNT(*) FROM video_interactions vi WHERE vi.video_id = v.id AND vi.interaction_type = 'save') as save_count
      FROM ad_videos v
      LEFT JOIN users u ON v.user_id = u.id
      LEFT JOIN market_listings ml ON ml.id = v.post_id
      LEFT JOIN posts p ON p.id = v.post_id
      ORDER BY v.created_at DESC
      LIMIT 100
    `).all() as any[];

    const stats = {
      total: videos.length,
      active: videos.filter(v => v.status === 'active').length,
      featured: videos.filter(v => v.is_featured).length,
      totalViews: videos.reduce((s, v) => s + (v.views || v.view_count || 0), 0),
      totalLikes: videos.reduce((s, v) => s + (v.likes || v.like_count || 0), 0),
    };

    res.json({ videos, stats });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب فيديوهات السوق', details: err.message });
  }
});

// PATCH /api/admin/market-live/:id/feature — Toggle featured status
router.patch('/market-live/:id/feature', (req: Request, res: Response) => {
  try {
    const video = db.prepare('SELECT is_featured FROM ad_videos WHERE id = ?').get(req.params.id) as any;
    if (!video) { res.status(404).json({ error: 'الفيديو غير موجود' }); return; }
    const newStatus = video.is_featured ? 0 : 1;
    db.prepare("UPDATE ad_videos SET is_featured = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, req.params.id);
    res.json({ message: newStatus ? 'تم تمييز الفيديو' : 'تم إزالة التمييز', isFeatured: !!newStatus });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الفيديو', details: err.message });
  }
});

// PATCH /api/admin/market-live/:id/status — Update video status
router.patch('/market-live/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['active', 'hidden', 'deleted'].includes(status)) {
      res.status(400).json({ error: 'حالة غير صالحة' }); return;
    }
    const result = db.prepare("UPDATE ad_videos SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'الفيديو غير موجود' }); return; }
    res.json({ message: 'تم تحديث حالة الفيديو', status });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الحالة', details: err.message });
  }
});

// DELETE /api/admin/market-live/:id — Delete video
router.delete('/market-live/:id', (req: Request, res: Response) => {
  try {
    // Get video URL before deleting (to remove the file)
    const video = db.prepare('SELECT video_url, thumbnail_url FROM ad_videos WHERE id = ?').get(req.params.id) as any;
    if (!video) { res.status(404).json({ error: 'الفيديو غير موجود' }); return; }

    // Delete from database (CASCADE will remove interactions)
    db.prepare('DELETE FROM ad_videos WHERE id = ?').run(req.params.id);

    // Try to delete the actual video file (best-effort)
    try {
      if (video.video_url && video.video_url.startsWith('/uploads/')) {
        const filePath = path.resolve(video.video_url.replace(/^\//, ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      if (video.thumbnail_url && video.thumbnail_url.startsWith('/uploads/')) {
        const thumbPath = path.resolve(video.thumbnail_url.replace(/^\//, ''));
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
      }
    } catch {}

    res.json({ message: 'تم حذف الفيديو' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الفيديو', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH — Search across users, posts, listings, videos, channels
// ═══════════════════════════════════════════════════════════════════════

router.get('/search', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) { res.json({ users: [], posts: [], listings: [], videos: [], channels: [] }); return; }
    const like = `%${q}%`;

    // Search users (by name, email, phone)
    const users = db.prepare(`
      SELECT id, name, email, phone, avatar, avatar_base64, is_admin, is_verified, is_deactivated, wallet_balance
      FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
      ORDER BY name ASC LIMIT 10
    `).all(like, like, like) as any[];

    // Search posts (by content)
    const posts = db.prepare(`
      SELECT p.id, p.content, p.type, p.price, p.image, p.created_at, p.status,
             u.name as author_name, u.avatar as author_avatar
      FROM posts p LEFT JOIN users u ON p.author_id = u.id
      WHERE p.content LIKE ? AND p.status = 'active'
      ORDER BY p.created_at DESC LIMIT 10
    `).all(like) as any[];

    // Search market listings (by title, description)
    const listings = db.prepare(`
      SELECT ml.id, ml.title, ml.price, ml.currency, ml.category, ml.status, ml.created_at,
             u.name as seller_name
      FROM market_listings ml LEFT JOIN users u ON ml.seller_id = u.id
      WHERE ml.title LIKE ? OR ml.description LIKE ?
      ORDER BY ml.created_at DESC LIMIT 10
    `).all(like, like) as any[];

    // Search videos (by title/description in ad_videos)
    const videos = db.prepare(`
      SELECT v.id, v.video_url, v.thumbnail_url, v.views, v.likes, v.created_at, v.status,
             u.name as author_name
      FROM ad_videos v LEFT JOIN users u ON v.user_id = u.id
      WHERE v.thumbnail_url LIKE ? OR CAST(v.id AS TEXT) LIKE ?
      ORDER BY v.created_at DESC LIMIT 5
    `).all(like, like) as any[];

    // Search channels (by name, handle, description)
    const channels = db.prepare(`
      SELECT c.id, c.name, c.handle, c.avatar, c.is_verified,
             (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count
      FROM channels c
      WHERE c.name LIKE ? OR c.handle LIKE ? OR c.description LIKE ?
      ORDER BY c.created_at DESC LIMIT 10
    `).all(like, like, like) as any[];

    res.json({
      users: users.map(u => ({
        id: u.id, name: u.name, email: u.email, phone: u.phone,
        avatar: u.avatar_base64 || u.avatar,
        isAdmin: !!u.is_admin, isVerified: !!u.is_verified,
        isDeactivated: !!u.is_deactivated, walletBalance: u.wallet_balance || 0,
      })),
      posts: posts.map(p => ({
        id: p.id, content: (p.content || '').slice(0, 80), type: p.type,
        price: p.price, hasImage: !!(p.image && p.image !== '[]'),
        authorName: p.author_name, authorAvatar: p.author_avatar,
        createdAt: p.created_at,
      })),
      listings: listings.map(l => ({
        id: l.id, title: l.title, price: l.price, currency: l.currency,
        category: l.category, status: l.status, sellerName: l.seller_name,
        createdAt: l.created_at,
      })),
      videos: videos.map(v => ({
        id: v.id, thumbnailUrl: v.thumbnail_url, views: v.views || 0,
        likes: v.likes || 0, authorName: v.author_name, status: v.status,
        createdAt: v.created_at,
      })),
      channels: channels.map(c => ({
        id: c.id, name: c.name, handle: c.handle, avatar: c.avatar,
        isVerified: !!c.is_verified,
        subscriberCount: c.subscriber_count || 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل البحث', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CHANNELS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

// GET /api/admin/channels — List all channels with stats
router.get('/channels', (_req: Request, res: Response) => {
  try {
    const channels = db.prepare(`
      SELECT c.*,
             u.name as owner_name, u.avatar as owner_avatar, u.avatar_base64 as owner_avatar_base64,
             (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = c.id) as subscriber_count,
             (SELECT COUNT(*) FROM channel_posts WHERE channel_id = c.id) as post_count,
             (SELECT COUNT(*) FROM channel_livestreams WHERE channel_id = c.id) as stream_count
      FROM channels c
      LEFT JOIN users u ON c.owner_id = u.id
      ORDER BY c.created_at DESC
      LIMIT 100
    `).all() as any[];

    const stats = {
      total: channels.length,
      verified: channels.filter(c => c.is_verified).length,
      public: channels.filter(c => c.is_public).length,
      totalSubscribers: channels.reduce((s, c) => s + (c.subscriber_count || 0), 0),
      totalPosts: channels.reduce((s, c) => s + (c.post_count || 0), 0),
    };

    res.json({ channels, stats });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب القنوات', details: err.message });
  }
});

// PATCH /api/admin/channels/:id/verify — Toggle verified status
router.patch('/channels/:id/verify', (req: Request, res: Response) => {
  try {
    const channel = db.prepare('SELECT is_verified FROM channels WHERE id = ?').get(req.params.id) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }
    const newStatus = channel.is_verified ? 0 : 1;
    db.prepare("UPDATE channels SET is_verified = ?, updated_at = datetime('now') WHERE id = ?")
      .run(newStatus, req.params.id);
    res.json({ message: newStatus ? 'تم توثيق القناة' : 'تم إلغاء توثيق القناة', isVerified: !!newStatus });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث القناة', details: err.message });
  }
});

// PATCH /api/admin/channels/:id/status — Hide/unhide channel
router.patch('/channels/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['active', 'hidden', 'suspended'].includes(status)) {
      res.status(400).json({ error: 'حالة غير صالحة' }); return;
    }
    const result = db.prepare("UPDATE channels SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, req.params.id);
    if (result.changes === 0) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }
    res.json({ message: 'تم تحديث حالة القناة', status });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الحالة', details: err.message });
  }
});

// DELETE /api/admin/channels/:id — Delete channel + all its data
router.delete('/channels/:id', (req: Request, res: Response) => {
  try {
    const channel = db.prepare('SELECT id, name FROM channels WHERE id = ?').get(req.params.id) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }

    const channelId = req.params.id;

    // Helper: run a delete statement, ignore errors if the table doesn't exist
    const safeDelete = (sql: string) => {
      try { db.prepare(sql).run(channelId); } catch { /* table may not exist */ }
    };

    // Delete all channel data — some tables use channel_id directly,
    // others use post_id or stream_id (need subquery).
    // Each delete is wrapped in safeDelete to handle missing tables gracefully.
    safeDelete('DELETE FROM channel_subscribers WHERE channel_id = ?');
    safeDelete('DELETE FROM channel_post_reactions WHERE post_id IN (SELECT id FROM channel_posts WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_post_views WHERE post_id IN (SELECT id FROM channel_posts WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_comments WHERE post_id IN (SELECT id FROM channel_posts WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_posts WHERE channel_id = ?');
    safeDelete('DELETE FROM channel_livestream_chat WHERE stream_id IN (SELECT id FROM channel_livestreams WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_livestream_viewers WHERE stream_id IN (SELECT id FROM channel_livestreams WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_livestreams WHERE channel_id = ?');
    safeDelete('DELETE FROM channel_gifts WHERE channel_id = ?');
    safeDelete('DELETE FROM channel_scheduled_stream_reminders WHERE stream_id IN (SELECT id FROM channel_scheduled_streams WHERE channel_id = ?)');
    safeDelete('DELETE FROM channel_scheduled_streams WHERE channel_id = ?');
    safeDelete('DELETE FROM channel_live_polls WHERE channel_id = ?');
    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);

    res.json({ message: `تم حذف القناة "${channel.name}" بنجاح` });
  } catch (err: any) {
    console.error('[ADMIN] Channel delete error:', err);
    res.status(500).json({ error: 'فشل حذف القناة', details: err.message });
  }
});

// PATCH /api/admin/channels/:id/reactivate — Reactivate a suspended channel
router.patch('/channels/:id/reactivate', (req: Request, res: Response) => {
  try {
    const channel = db.prepare('SELECT id, name FROM channels WHERE id = ?').get(req.params.id) as any;
    if (!channel) { res.status(404).json({ error: 'القناة غير موجودة' }); return; }

    db.prepare('UPDATE channels SET status = ?, last_activity = datetime(\'now\') WHERE id = ?').run('active', req.params.id);
    res.json({ message: `تم تفعيل القناة "${channel.name}" بنجاح` });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تفعيل القناة' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── Withdrawal Requests (admin approval flow) ────────────────────────
// Users create withdrawal requests via POST /api/wallet/withdraw (5% fee
// deducted). Admins approve (mark sent externally) or reject (refund the
// held amount back to the wallet). These endpoints are aliased from the
// legacy /api/wallet/withdrawals/:id/:action for cleaner URL semantics.
// ═══════════════════════════════════════════════════════════════════════

// GET /api/admin/withdrawal-requests — all withdrawal requests (newest first)
router.get('/withdrawal-requests', (req: Request, res: Response) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = statusFilter
      ? db.prepare(`
          SELECT w.*, u.name AS user_name, u.avatar AS user_avatar, u.avatar_base64 AS user_avatar_base64, u.phone AS user_phone
          FROM withdrawal_requests w
          JOIN users u ON u.id = w.user_id
          WHERE w.status = ?
          ORDER BY w.created_at DESC
        `).all(statusFilter) as any[]
      : db.prepare(`
          SELECT w.*, u.name AS user_name, u.avatar AS user_avatar, u.avatar_base64 AS user_avatar_base64, u.phone AS user_phone
          FROM withdrawal_requests w
          JOIN users u ON u.id = w.user_id
          ORDER BY w.created_at DESC
        `).all() as any[];

    res.json(rows.map((w: any) => ({
      id: w.id,
      userId: w.user_id,
      userName: w.user_name,
      userAvatar: w.user_avatar_base64 || w.user_avatar,
      userPhone: w.user_phone,
      amount: Number(w.amount || 0),
      fee: Number(w.fee || 0),
      netAmount: Number(w.net_amount || 0),
      network: w.network || w.method || '',
      accountNumber: w.account_number || w.account_details || '',
      method: w.method || '',
      accountDetails: w.account_details || '',
      status: w.status,
      adminNote: w.admin_note || '',
      createdAt: w.created_at,
      processedAt: w.processed_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات السحب', details: err.message });
  }
});

// POST /api/admin/withdrawal-requests/:id/approve — mark withdrawal as completed
// (the held amount is NOT refunded — it has been sent out externally).
router.post('/withdrawal-requests/:id/approve', (req: Request, res: Response) => {
  try {
    const { adminNote } = req.body || {};
    const withdrawal = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(req.params.id) as any;
    if (!withdrawal) { res.status(404).json({ error: 'طلب السحب غير موجود' }); return; }
    if (withdrawal.status !== 'pending') {
      res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return;
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE withdrawal_requests SET status = 'approved', admin_note = ?, processed_at = datetime('now') WHERE id = ?"
      ).run(adminNote || '', req.params.id);

      // Update the linked pending 'withdrawal' transaction → completed
      const tx = db.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' AND reference_id = ?"
      ).get(withdrawal.user_id, req.params.id) as any;
      if (tx) {
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(tx.id);
      }
    });

    // Notify user
    const net = Number(withdrawal.net_amount || (withdrawal.amount - (withdrawal.fee || 0)));
    const notifMsg = `تمت الموافقة على طلب السحب بقيمة ${Number(withdrawal.amount).toLocaleString()} ج.م — سيصلك ${net.toLocaleString()} ج.م على حسابك الخارجي${adminNote ? ` (${adminNote})` : ''}`;
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)').run(
      withdrawal.user_id, 'payment', notifMsg, '/wallet',
    );

    // 🔧 FIX: Broadcast notification:new + wallet:updated to user via WebSocket
    // so the user sees the notification in real-time (not just on page refresh).
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(withdrawal.user_id, {
          type: "notification:new",
          data: { type: 'payment', message: notifMsg, link: '/wallet' },
        });
        wsManager.sendToUser(withdrawal.user_id, { type: "wallet:updated", data: { userId: withdrawal.user_id } });
      }
    } catch {}

    res.json({ success: true, message: 'تمت الموافقة على طلب السحب' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشلت الموافقة على طلب السحب', details: err.message });
  }
});

// POST /api/admin/withdrawal-requests/:id/reject — refund the held amount to wallet
router.post('/withdrawal-requests/:id/reject', (req: Request, res: Response) => {
  try {
    const { adminNote } = req.body || {};
    const withdrawal = db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').get(req.params.id) as any;
    if (!withdrawal) { res.status(404).json({ error: 'طلب السحب غير موجود' }); return; }
    if (withdrawal.status !== 'pending') {
      res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return;
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE withdrawal_requests SET status = 'rejected', admin_note = ?, processed_at = datetime('now') WHERE id = ?"
      ).run(adminNote || '', req.params.id);

      // Refund the FULL held amount (the user was deducted `amount` at
      // request time, so we refund `amount` — no fee taken on rejection).
      db.prepare(
        "UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(withdrawal.amount, withdrawal.user_id);

      // Update the linked pending 'withdrawal' transaction → failed (refunded)
      const tx = db.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'withdrawal' AND status = 'pending' AND reference_id = ?"
      ).get(withdrawal.user_id, req.params.id) as any;
      if (tx) {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(tx.id);
      }
    });

    // Notify user
    const rejectMsg = `تم رفض طلب السحب بقيمة ${Number(withdrawal.amount).toLocaleString()} ج.م${adminNote ? `: ${adminNote}` : ''} — تم استرجاع المبلغ إلى محفظتك`;
    db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)').run(
      withdrawal.user_id, 'payment', rejectMsg, '/wallet',
    );

    // 🔧 FIX: Broadcast notification:new + wallet:updated to user
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(withdrawal.user_id, {
          type: "notification:new",
          data: { type: 'payment', message: rejectMsg, link: '/wallet' },
        });
        wsManager.sendToUser(withdrawal.user_id, { type: "wallet:updated", data: { userId: withdrawal.user_id, amount: withdrawal.amount } });
      }
    } catch {}

    res.json({ success: true, message: 'تم رفض طلب السحب واسترجاع المبلغ للمستخدم' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض طلب السحب', details: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ─── Charge Requests (admin confirmation flow — aliases) ──────────────
// The legacy endpoints live at /api/wallet/admin/charging-requests/:id/:action.
// These aliases provide a cleaner /api/admin/charge-requests/... URL for
// the new combined "طلبات السحب والشحن" admin tab.
// ═══════════════════════════════════════════════════════════════════════

// GET /api/admin/charge-requests — all charging requests (newest first)
router.get('/charge-requests', (req: Request, res: Response) => {
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = statusFilter
      ? db.prepare('SELECT * FROM charging_requests WHERE status = ? ORDER BY created_at DESC').all(statusFilter)
      : db.prepare('SELECT * FROM charging_requests ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الشحن', details: err.message });
  }
});

// POST /api/admin/charge-requests/:id/approve — confirm charge (add to wallet)
router.post('/charge-requests/:id/approve', (req: Request, res: Response) => {
  try {
    const cr = db.prepare('SELECT * FROM charging_requests WHERE id = ?').get(req.params.id) as any;
    if (!cr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (cr.status !== 'pending') { res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return; }

    db.transaction(() => {
      db.prepare("UPDATE charging_requests SET status = 'approved', processed_at = datetime('now') WHERE id = ?").run(req.params.id);

      // Update the linked pending 'charge_request' transaction → approved
      let pendingTx = db.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' AND reference_id = ?"
      ).get(cr.user_id, req.params.id) as any;
      if (!pendingTx) {
        pendingTx = db.prepare(
          "SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
        ).get(cr.user_id) as any;
      }
      if (pendingTx) {
        db.prepare("UPDATE transactions SET status = 'approved' WHERE id = ?").run(pendingTx.id);
      }

      // Add to wallet balance
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = datetime('now') WHERE id = ?")
        .run(cr.amount, cr.user_id);

      // Create deposit transaction linked to this charging request
      db.prepare('INSERT INTO transactions (user_id, type, amount, method, status, reference_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(cr.user_id, 'deposit', cr.amount, cr.method, 'completed', req.params.id);

      // Notify user
      const chargeMsg = `تم شحن ${Number(cr.amount).toLocaleString()} ج.م في محفظتك بنجاح`;
      db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
        .run(cr.user_id, 'payment', chargeMsg, '/wallet');
    });

    // 🔧 FIX: Broadcast notification:new + wallet:updated to user
    try {
      const wsManager = (req.app as any).locals?.wsManager;
      if (wsManager) {
        wsManager.sendToUser(cr.user_id, {
          type: "notification:new",
          data: { type: 'payment', message: `تم شحن ${Number(cr.amount).toLocaleString()} ج.م في محفظتك بنجاح`, link: '/wallet' },
        });
        wsManager.sendToUser(cr.user_id, { type: "wallet:updated", data: { userId: cr.user_id, amount: cr.amount } });
      }
    } catch {}

    res.json({ success: true, message: 'تم تأكيد طلب الشحن وإضافة المبلغ للمحفظة' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تأكيد طلب الشحن', details: err.message });
  }
});

// POST /api/admin/charge-requests/:id/reject — reject charge (no wallet change)
router.post('/charge-requests/:id/reject', (req: Request, res: Response) => {
  try {
    const cr = db.prepare('SELECT * FROM charging_requests WHERE id = ?').get(req.params.id) as any;
    if (!cr) { res.status(404).json({ error: 'الطلب غير موجود' }); return; }
    if (cr.status !== 'pending') { res.status(400).json({ error: 'تم معالجة هذا الطلب بالفعل' }); return; }

    db.transaction(() => {
      db.prepare("UPDATE charging_requests SET status = 'rejected', processed_at = datetime('now') WHERE id = ?").run(req.params.id);

      let pendingTx = db.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' AND reference_id = ?"
      ).get(cr.user_id, req.params.id) as any;
      if (!pendingTx) {
        pendingTx = db.prepare(
          "SELECT id FROM transactions WHERE user_id = ? AND type = 'charge_request' AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
        ).get(cr.user_id) as any;
      }
      if (pendingTx) {
        db.prepare("UPDATE transactions SET status = 'rejected' WHERE id = ?").run(pendingTx.id);
      }

      db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)')
        .run(cr.user_id, 'payment', `تم رفض طلب شحن ${Number(cr.amount).toLocaleString()} ج.م`, '/wallet');
    });

    res.json({ success: true, message: 'تم رفض طلب الشحن' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل رفض الطلب', details: err.message });
  }
});

export default router;
