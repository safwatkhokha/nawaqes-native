// ─── Market Listing Routes ──────────────────────────────────────────
import { Router, Request, Response } from 'express';
import db from '../database/index.js';
import { authMiddleware, optionalAuth, JwtPayload } from '../middleware/auth.js';
import { getDefaultAvatar } from '../utils/serverAvatar.js';

const router = Router();

// ─── Ensure Market Tables Exist ─────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      seller_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      images TEXT DEFAULT '[]',
      price REAL,
      currency TEXT DEFAULT 'ج.م',
      category TEXT NOT NULL DEFAULT '',
      subcategory TEXT DEFAULT '',
      condition TEXT DEFAULT 'used',
      location TEXT DEFAULT '',
      city TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      payment_methods TEXT DEFAULT '[]',
      is_featured INTEGER DEFAULT 0,
      is_promoted INTEGER DEFAULT 0,
      promotion_status TEXT,
      promotion_tier TEXT,
      promotion_package TEXT,
      promotion_started_at TEXT,
      promotion_expires_at TEXT,
      views_count INTEGER DEFAULT 0,
      saves_count INTEGER DEFAULT 0,
      inquiries_count INTEGER DEFAULT 0,
      shares_count INTEGER DEFAULT 0,
      estimated_reach INTEGER,
      reach_count INTEGER DEFAULT 0,
      targeting TEXT DEFAULT 'all',
      target_city TEXT DEFAULT '',
      target_interests TEXT DEFAULT '[]',
      target_age_min INTEGER DEFAULT 0,
      target_age_max INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS market_listing_saves (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id),
      listing_id TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, listing_id)
    );

    CREATE TABLE IF NOT EXISTS market_promotion_requests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      listing_id TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
      seller_id TEXT NOT NULL REFERENCES users(id),
      listing_title TEXT NOT NULL,
      tier TEXT NOT NULL,
      package_name TEXT,
      duration INTEGER,
      estimated_reach INTEGER,
      price REAL NOT NULL,
      targeting TEXT DEFAULT 'all',
      target_city TEXT DEFAULT '',
      target_interests TEXT DEFAULT '[]',
      target_age_min INTEGER DEFAULT 0,
      target_age_max INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
    CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
    CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings(category);
    CREATE INDEX IF NOT EXISTS idx_market_listings_city ON market_listings(city);
    CREATE INDEX IF NOT EXISTS idx_market_listings_promoted ON market_listings(is_promoted);
    CREATE INDEX IF NOT EXISTS idx_market_listing_saves_listing ON market_listing_saves(listing_id);
    CREATE INDEX IF NOT EXISTS idx_market_listing_saves_user ON market_listing_saves(user_id);
    CREATE INDEX IF NOT EXISTS idx_market_promotion_requests_seller ON market_promotion_requests(seller_id);
  `);
} catch { /* tables or indexes already exist */ }

// ─── Helper: Parse listing row ──────────────────────────────────────
function parseListing(row: any) {
  if (!row) return null;
  let images: string[] = [];
  try {
    const parsed = JSON.parse(row.images || '[]');
    if (Array.isArray(parsed)) images = parsed;
  } catch { images = []; }
  let paymentMethods: any[] = [];
  try {
    const parsed = JSON.parse(row.payment_methods || '[]');
    if (Array.isArray(parsed)) paymentMethods = parsed;
  } catch { paymentMethods = []; }
  let targetInterests: string[] = [];
  try {
    const parsed = JSON.parse(row.target_interests || '[]');
    if (Array.isArray(parsed)) targetInterests = parsed;
  } catch { targetInterests = []; }
  return {
    ...row,
    images,
    payment_methods: paymentMethods,
    target_interests: targetInterests,
    is_promoted: !!row.is_promoted,
  };
}

// ─── Helper: Attach seller info ─────────────────────────────────────
function attachSeller(listing: any) {
  if (!listing || !listing.seller_id) return { ...listing, seller: null };
  try {
    const seller = db.prepare('SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score FROM users WHERE id = ?').get(listing.seller_id) as any;
    if (seller) {
      seller.is_verified = !!seller.is_verified;
      seller.is_trusted = !!seller.is_trusted;
      if (seller.avatar_base64) seller.avatar = seller.avatar_base64;
      delete seller.avatar_base64;
    }
    return { ...listing, seller };
  } catch {
    return { ...listing, seller: { id: listing.seller_id, name: 'مستخدم', avatar: getDefaultAvatar(listing.seller_id), is_verified: false, is_trusted: false, trust_score: 50 } };
  }
}

// ─── 1. GET /api/market/listings — Get all listings with filtering ──
router.get('/listings', optionalAuth, (req: Request, res: Response) => {
  try {
    // Auto-expire promotions that have passed their expiration date
    try {
      db.prepare(`
        UPDATE market_listings SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
        WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
      `).run();
    } catch { /* ignore auto-expire errors */ }

    const { category, city, condition, min_price, max_price, search, sort, page = '1', limit = '20' } = req.query;

    // Get the current user's info for targeting (if authenticated)
    const userId = (req as any).user?.userId || null;
    let userLocation = '';
    let userInterests: string[] = [];
    let userAge = 0;
    if (userId) {
      try {
        const userInfo = db.prepare('SELECT location, interests, date_of_birth FROM users WHERE id = ?').get(userId) as any;
        if (userInfo) {
          userLocation = userInfo.location || '';
          try { userInterests = JSON.parse(userInfo.interests || '[]'); } catch { userInterests = []; }
          if (userInfo.date_of_birth) {
            const birthDate = new Date(userInfo.date_of_birth);
            const today = new Date();
            userAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              userAge--;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Build query with filters
    let query = 'SELECT * FROM market_listings WHERE status = ?';
    const params: any[] = ['active'];

    if (category) { query += ' AND category = ?'; params.push(category as string); }
    if (city) { query += ' AND city = ?'; params.push(city as string); }
    if (condition) { query += ' AND condition = ?'; params.push(condition as string); }
    if (min_price) { query += ' AND price >= ?'; params.push(parseFloat(min_price as string)); }
    if (max_price) { query += ' AND price <= ?'; params.push(parseFloat(max_price as string)); }
    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Smart ordering: promoted/featured first, then by sort preference
    switch (sort) {
      case 'cheapest':
        query += ' ORDER BY is_promoted DESC, price ASC';
        break;
      case 'expensive':
        query += ' ORDER BY is_promoted DESC, price DESC';
        break;
      case 'featured':
        query += ' ORDER BY is_promoted DESC, saves_count DESC, views_count DESC';
        break;
      case 'newest':
      default:
        query += ' ORDER BY is_promoted DESC, created_at DESC';
        break;
    }

    // Count total before pagination
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.prepare(countQuery).get(...params) as any;
    const total = totalResult?.count || 0;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), offset);

    const rawListings = db.prepare(query).all(...params);

    // Post-filter: Apply targeting logic to promoted listings
    const filteredListings = rawListings.map((row: any) => {
      try {
        const parsed = parseListing(row);
        if (!parsed) return null;

        // If this is a promoted listing with targeting, check if current user should see it
        if (parsed.is_promoted && parsed.promotion_tier) {
          const targeting = parsed.targeting || 'all';

          // City-targeted: Only show to users in the targeted cities
          if (targeting === 'city' && parsed.target_city) {
            let targetCities: string[] = [];
            try {
              const parsedCities = JSON.parse(parsed.target_city);
              if (Array.isArray(parsedCities)) targetCities = parsedCities;
            } catch {
              if (parsed.target_city) targetCities = [parsed.target_city];
            }

            if (userId && userLocation && targetCities.length > 0) {
              const cityMatch = targetCities.some(tc =>
                userLocation.includes(tc) || tc.includes(userLocation)
              );
              if (!cityMatch) return null;
            }
          }

          // Interest-targeted: Only show to users with matching interests
          if (targeting === 'interests' && parsed.target_interests && parsed.target_interests.length > 0) {
            if (userId && userInterests.length > 0) {
              const hasMatch = parsed.target_interests.some((interest: string) =>
                userInterests.includes(interest)
              );
              if (!hasMatch) return null;
            }
          }

          // Age-targeted: Only show to users within the age range
          if (parsed.target_age_min && parsed.target_age_max &&
              parsed.target_age_min > 0 && parsed.target_age_max > 0) {
            if (userId && userAge > 0) {
              if (userAge < parsed.target_age_min || userAge > parsed.target_age_max) {
                return null;
              }
            }
          }
        }

        return attachSeller(parsed);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Get category counts
    const categories = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM market_listings
      WHERE status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({ listings: filteredListings, total, page: parseInt(page as string), categories });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإعلانات', details: err.message });
  }
});

// ─── 2. GET /api/market/listings/:id — Get single listing detail ───
router.get('/listings/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND status = ?').get(req.params.id, 'active') as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }

    // Increment views count
    try {
      db.prepare("UPDATE market_listings SET views_count = views_count + 1, updated_at = datetime('now') WHERE id = ?")
        .run(req.params.id);
      // Also increment reach_count for promoted listings
      if (listing.is_promoted) {
        db.prepare("UPDATE market_listings SET reach_count = reach_count + 1 WHERE id = ?")
          .run(req.params.id);
      }
    } catch { /* ignore tracking errors */ }

    const parsed = parseListing(listing);
    const result = attachSeller(parsed);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإعلان', details: err.message });
  }
});

// ─── 3. POST /api/market/listings — Create new listing ─────────────
router.post('/listings', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { title, description, images, category, price, currency, condition, location, city, phone, whatsapp, payment_methods } = req.body;

    if (!title) { res.status(400).json({ error: 'عنوان الإعلان مطلوب' }); return; }
    if (!description) { res.status(400).json({ error: 'وصف الإعلان مطلوب' }); return; }
    if (!category) { res.status(400).json({ error: 'التصنيف مطلوب' }); return; }

    db.prepare(`
      INSERT INTO market_listings (seller_id, title, description, images, price, currency, category, subcategory, condition, location, city, phone, whatsapp, payment_methods)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.userId,
      title,
      description,
      JSON.stringify(images || []),
      price || null,
      currency || 'ج.م',
      category,
      req.body.subcategory || '',
      condition || 'new',
      location || '',
      city || '',
      phone || '',
      whatsapp || '',
      JSON.stringify(payment_methods || [])
    );

    const listing = db.prepare('SELECT * FROM market_listings WHERE seller_id = ? ORDER BY created_at DESC LIMIT 1').get(payload.userId) as any;
    res.status(201).json(attachSeller(parseListing(listing)));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء الإعلان', details: err.message });
  }
});

// ─── 4. PUT /api/market/listings/:id — Update listing ──────────────
router.put('/listings/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    if (listing.seller_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية تعديل هذا الإعلان' }); return;
    }

    const allowed = ['title', 'description', 'images', 'price', 'currency', 'category', 'subcategory', 'condition', 'location', 'city', 'phone', 'whatsapp', 'payment_methods', 'status'];
    const updates: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key]);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(req.params.id);
      db.prepare(`UPDATE market_listings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id);
    res.json(attachSeller(parseListing(updated)));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث الإعلان', details: err.message });
  }
});

// ─── 5. DELETE /api/market/listings/:id — Soft delete listing ──────
router.delete('/listings/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    if (listing.seller_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية حذف هذا الإعلان' }); return;
    }

    db.prepare("UPDATE market_listings SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    res.json({ message: 'تم حذف الإعلان بنجاح' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف الإعلان', details: err.message });
  }
});

// ─── 5b. PATCH /api/market/listings/:id/status — Update listing status ──
// Allows the seller (or admin) to change a listing's status:
//   'active'    — visible in market (default)
//   'paused'    — hidden from market (seller can re-activate)
//   'sold'      — marked as sold (moved to "expired" tab in MyMarketListings)
// This gives users control over their listings without deleting them.
router.patch('/listings/:id/status', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { status } = req.body;
    const validStatuses = ['active', 'paused', 'sold', 'deleted'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'حالة غير صالحة' });
      return;
    }
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    if (listing.seller_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية تعديل هذا الإعلان' }); return;
    }

    db.prepare("UPDATE market_listings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
    const updated = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id);
    res.json(attachSeller(parseListing(updated)));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث حالة الإعلان', details: err.message });
  }
});

// ─── 6. POST /api/market/listings/:id/save — Toggle save/bookmark ─
router.post('/listings/:id/save', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }

    const existing = db.prepare('SELECT id FROM market_listing_saves WHERE listing_id = ? AND user_id = ?').get(req.params.id, payload.userId) as any;

    if (existing) {
      // Unsave
      db.prepare('DELETE FROM market_listing_saves WHERE id = ?').run(existing.id);
      db.prepare('UPDATE market_listings SET saves_count = MAX(0, saves_count - 1), updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
      const updated = db.prepare('SELECT saves_count FROM market_listings WHERE id = ?').get(req.params.id) as any;
      res.json({ saved: false, savesCount: updated?.saves_count || 0 });
    } else {
      // Save
      db.prepare('INSERT INTO market_listing_saves (listing_id, user_id) VALUES (?, ?)').run(req.params.id, payload.userId);
      db.prepare("UPDATE market_listings SET saves_count = saves_count + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
      const updated = db.prepare('SELECT saves_count FROM market_listings WHERE id = ?').get(req.params.id) as any;
      res.json({ saved: true, savesCount: updated?.saves_count || 1 });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حفظ الإعلان', details: err.message });
  }
});

// ─── 7. GET /api/market/saved — Get user's saved listings ──────────
router.get('/saved', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const savedListings = db.prepare(`
      SELECT ml.*, s.created_at as saved_at
      FROM market_listing_saves s
      JOIN market_listings ml ON ml.id = s.listing_id
      WHERE s.user_id = ? AND ml.status = 'active'
      ORDER BY s.created_at DESC
    `).all(payload.userId);

    const listings = savedListings.map((row: any) => attachSeller(parseListing(row)));
    res.json(listings);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإعلانات المحفوظة', details: err.message });
  }
});

// ─── 8. GET /api/market/my-listings — Get user's own listings ──────
router.get('/my-listings', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const listings = db.prepare(`
      SELECT * FROM market_listings
      WHERE seller_id = ? AND status != 'deleted'
      ORDER BY created_at DESC
    `).all(payload.userId);

    const parsed = listings.map((row: any) => attachSeller(parseListing(row)));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إعلاناتي', details: err.message });
  }
});

// ─── 9. POST /api/market/listings/:id/inquire — Track inquiry ─────
router.post('/listings/:id/inquire', authMiddleware, (req: Request, res: Response) => {
  try {
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(req.params.id) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }

    db.prepare("UPDATE market_listings SET inquiries_count = inquiries_count + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    const updated = db.prepare('SELECT inquiries_count FROM market_listings WHERE id = ?').get(req.params.id) as any;
    res.json({ inquiriesCount: updated?.inquiries_count || 1 });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تسجيل الاستفسار', details: err.message });
  }
});

// ─── 10. POST /api/market/promote — Request promotion for a listing ─
router.post('/promote', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { listingId, tier, packageName, duration, estimatedReach, targeting, targetCity, targetCities, targetInterests, targetAgeMin, targetAgeMax, price } = req.body;

    if (!listingId) { res.status(400).json({ error: 'معرف الإعلان مطلوب' }); return; }
    if (!tier) { res.status(400).json({ error: 'مستوى الترويج مطلوب' }); return; }
    if (!price || price <= 0) { res.status(400).json({ error: 'سعر الترويج مطلوب' }); return; }

    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?').get(listingId) as any;
    if (!listing) { res.status(404).json({ error: 'الإعلان غير موجود' }); return; }
    if (listing.seller_id !== payload.userId) { res.status(403).json({ error: 'يمكنك ترويج إعلاناتك فقط' }); return; }

    // Check if there's already an active or pending promotion for this listing
    const existingPromotion = db.prepare(
      "SELECT * FROM market_promotion_requests WHERE listing_id = ? AND seller_id = ? AND status IN ('pending', 'approved') ORDER BY created_at DESC LIMIT 1"
    ).get(listingId, payload.userId) as any;

    if (existingPromotion) {
      // If there's an active or pending promotion, reject the new request
      if (existingPromotion.status === 'pending') {
        res.status(400).json({ error: 'يوجد طلب ترويج قيد المراجعة لهذا الإعلان بالفعل' }); return;
      }
      if (existingPromotion.status === 'approved') {
        res.status(400).json({ error: 'هذا الإعلان مروّج بالفعل ولا يزال نشطاً' }); return;
      }
    }

    // Check wallet balance and deduct immediately to prevent double-spending
    const wallet = db.prepare('SELECT wallet_balance FROM users WHERE id = ?').get(payload.userId) as any;
    if (!wallet || wallet.wallet_balance < price) {
      res.status(400).json({ error: 'رصيدك غير كافٍ للترويج' }); return;
    }

    // Deduct wallet balance immediately
    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ?, updated_at = datetime('now') WHERE id = ?")
      .run(price, payload.userId);

    // Record the promotion debit transaction
    db.prepare('INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?)')
      .run(payload.userId, 'promotion_debit', price, 'محفظة', 'completed');

    // Handle targetCities (new field) or fallback to targetCity
    const resolvedTargetCities = targetCities && targetCities.length > 0
      ? targetCities
      : targetCity
        ? (Array.isArray(targetCity) ? targetCity : [targetCity])
        : [];

    // Create promotion request (pending - awaiting admin approval)
    // Include listing_title for the database schema that requires it
    const listingTitle = listing.title || '';
    db.prepare(`
      INSERT INTO market_promotion_requests (listing_id, seller_id, listing_title, tier, package_name, duration, estimated_reach, price, targeting, target_city, target_interests, target_age_min, target_age_max)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      listingId, payload.userId, listingTitle, tier, packageName || '', duration || 0, estimatedReach || 0, price,
      targeting || 'all', JSON.stringify(resolvedTargetCities), JSON.stringify(targetInterests || []),
      targetAgeMin || 0, targetAgeMax || 0
    );

    // Update listing: mark promotion status as pending (but don't set is_promoted=1 yet)
    db.prepare(`
      UPDATE market_listings SET
        promotion_status = 'pending',
        promotion_tier = ?,
        promotion_package = ?,
        estimated_reach = ?,
        targeting = ?,
        target_city = ?,
        target_interests = ?,
        target_age_min = ?,
        target_age_max = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tier, packageName || '', estimatedReach || 0,
      targeting || 'all', JSON.stringify(resolvedTargetCities), JSON.stringify(targetInterests || []),
      targetAgeMin || 0, targetAgeMax || 0, listingId
    );

    // Notify admins about the new promotion request
    try {
      const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1').all() as any[];
      const insertNotif = db.prepare('INSERT INTO notifications (user_id, type, message, post_id, link) VALUES (?, ?, ?, ?, ?)');
      for (const admin of admins) {
        insertNotif.run(admin.id, 'promotion', `طلب ترويج جديد في السوق الذكي: "${listing.title}" - باقة ${packageName || tier} (${price} ج.م)`, listingId, `/market/listing/${listingId}`);
      }
    } catch { /* notifications table may not exist */ }

    // Notify seller that their request is pending
    try {
      db.prepare('INSERT INTO notifications (user_id, type, message, post_id, link) VALUES (?, ?, ?, ?, ?)')
        .run(payload.userId, 'promotion', `تم إرسال طلب ترويج إعلانك "${listing.title}" وسيتم مراجعته من الإدارة`, listingId, `/market/listing/${listingId}`);
    } catch { /* notifications table may not exist */ }

    const promoRequest = db.prepare('SELECT * FROM market_promotion_requests WHERE listing_id = ? AND seller_id = ? ORDER BY created_at DESC LIMIT 1').get(listingId, payload.userId) as any;
    res.status(201).json(promoRequest);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إرسال طلب الترويج', details: err.message });
  }
});

// ─── 11. GET /api/market/my-promotions — Get user's promotions ─────
router.get('/my-promotions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const promotions = db.prepare(`
      SELECT mpr.*,
        ml.reach_count, ml.views_count, ml.saves_count, ml.inquiries_count,
        ml.promotion_status as listing_promotion_status,
        ml.promotion_started_at, ml.promotion_expires_at
      FROM market_promotion_requests mpr
      LEFT JOIN market_listings ml ON ml.id = mpr.listing_id
      WHERE mpr.seller_id = ?
      ORDER BY mpr.created_at DESC
    `).all(payload.userId);
    res.json(promotions);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب طلبات الترويج', details: err.message });
  }
});

// ─── 12. GET /api/market/stats — Market statistics ─────────────────
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const totalListings = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active'").get() as any;
    const totalSellers = db.prepare("SELECT COUNT(DISTINCT seller_id) as count FROM market_listings WHERE status = 'active'").get() as any;
    const avgPrice = db.prepare("SELECT COALESCE(AVG(price), 0) as avg FROM market_listings WHERE status = 'active' AND price > 0").get() as any;
    const newToday = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active' AND created_at >= datetime('now', '-1 day')").get() as any;

    const categoryBreakdown = db.prepare(`
      SELECT category, COUNT(*) as count, COALESCE(AVG(price), 0) as avg_price
      FROM market_listings
      WHERE status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();

    res.json({
      totalListings: totalListings.count || 0,
      totalSellers: totalSellers.count || 0,
      averagePrice: Math.round(avgPrice.avg || 0),
      newToday: newToday.count || 0,
      categoryBreakdown,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات السوق', details: err.message });
  }
});

// ─── 13. GET /api/market/categories — Categories with listing counts ─
router.get('/categories', (_req: Request, res: Response) => {
  try {
    // Use interest categories from the config and count listings per category
    const interestCategories = [
      { id: 'phones', name: 'هواتف', icon: '📱' },
      { id: 'electronics', name: 'إلكترونيات', icon: '💻' },
      { id: 'games', name: 'ألعاب', icon: '🎮' },
      { id: 'cars', name: 'سيارات', icon: '🚗' },
      { id: 'realEstate', name: 'عقارات', icon: '🏠' },
      { id: 'fashion', name: 'أزياء', icon: '👕' },
      { id: 'beauty', name: 'تجميل', icon: '💄' },
      { id: 'sports', name: 'رياضة', icon: '⚽' },
      { id: 'food', name: 'طعام ومطاعم', icon: '🍽️' },
      { id: 'jobs', name: 'وظائف', icon: '💼' },
      { id: 'services', name: 'خدمات', icon: '🛎️' },
      { id: 'education', name: 'تعليم', icon: '🎓' },
      { id: 'books', name: 'كتب', icon: '📚' },
      { id: 'animals', name: 'حيوانات', icon: '🐾' },
      { id: 'travel', name: 'سفر وسياحة', icon: '✈️' },
      { id: 'photography', name: 'تصوير', icon: '📷' },
      { id: 'health', name: 'صحة', icon: '🏥' },
      { id: 'other', name: 'أخرى', icon: '📦' },
    ];

    // Get counts from database
    const dbCounts = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM market_listings
      WHERE status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category
    `).all() as any[];

    const countMap = new Map<string, number>();
    for (const row of dbCounts) {
      countMap.set(row.category, row.count);
    }

    const categories = interestCategories.map(cat => ({
      ...cat,
      count: countMap.get(cat.id) || 0,
    }));

    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب التصنيفات', details: err.message });
  }
});

// ─── 14. GET /api/market/market-pulse/overview — Market pulse analytics ──
router.get('/market-pulse/overview', (_req: Request, res: Response) => {
  try {
    const totalActive = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active'").get() as any;
    const newToday = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active' AND created_at >= datetime('now', '-1 day')").get() as any;
    const newThisWeek = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active' AND created_at >= datetime('now', '-7 days')").get() as any;
    const totalUsers = db.prepare("SELECT COUNT(DISTINCT seller_id) as count FROM market_listings WHERE status = 'active'").get() as any;
    const avgPrice = db.prepare("SELECT COALESCE(AVG(price), 0) as avg FROM market_listings WHERE status = 'active' AND price > 0").get() as any;

    const categoryDist = db.prepare(`
      SELECT category, COUNT(*) as count, COALESCE(AVG(price), 0) as avg_price, 
             COALESCE(MIN(price), 0) as min_price, COALESCE(MAX(price), 0) as max_price
      FROM market_listings WHERE status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category ORDER BY count DESC
    `).all();

    // Weekly activity
    const weeklyActivity = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM market_listings
      WHERE status = 'active' AND created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all();

    // Supply & Demand simulation
    const supplyDemand = categoryDist.slice(0, 8).map((cat: any) => ({
      category: cat.category,
      supply: cat.count,
      demandScore: Math.round(cat.count * (0.5 + Math.random() * 1.5)),
      ratio: Math.round((cat.count * (0.5 + Math.random() * 1.5)) / Math.max(cat.count, 1) * 100) / 100,
    }));

    // Price ranges
    const priceRanges = categoryDist.slice(0, 8).map((cat: any) => ({
      category: cat.category,
      count: cat.count,
      minPrice: cat.min_price,
      maxPrice: cat.max_price,
      avgPrice: Math.round(cat.avg_price),
    }));

    // Top ads
    const topAds = db.prepare(`
      SELECT ml.*, u.name as author_name, u.avatar as author_avatar
      FROM market_listings ml
      LEFT JOIN users u ON ml.seller_id = u.id
      WHERE ml.status = 'active' AND ml.is_promoted = 1
      ORDER BY ml.views_count DESC LIMIT 5
    `).all();

    res.json({
      activeAds: totalActive.count || 0,
      newToday: newToday.count || 0,
      newThisWeek: newThisWeek.count || 0,
      totalUsers: totalUsers.count || 0,
      avgPrice: Math.round(avgPrice.avg || 0),
      categoryDist,
      supplyDemand,
      priceRanges,
      weeklyActivity,
      topAds: topAds.map((ad: any) => ({
        id: ad.id,
        content: ad.title,
        image: (() => { try { const imgs = JSON.parse(ad.images || '[]'); return Array.isArray(imgs) ? imgs[0] || '' : ''; } catch { return ''; } })(),
        price: ad.price,
        category: ad.category,
        location: ad.location,
        reachCount: ad.views_count || 0,
        likes: ad.saves_count || 0,
        authorName: ad.author_name || '',
        authorAvatar: ad.author_avatar || '',
        createdAt: ad.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب بيانات نبض السوق', details: err.message });
  }
});

// ─── 15. GET /api/market/market-live/feed — Market live video feed ──
router.get('/market-live/feed', optionalAuth, (req: Request, res: Response) => {
  try {
    const { category, page = '1', limit = '10' } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // First: Get actual videos from ad_videos table (with real video URLs)
    // 🔧 FIX: Use v.user_id as the primary author source (ad_videos.user_id
    // is NOT NULL and always points to the uploader). The previous query
    // used COALESCE(ml.seller_id, p.author_id) which returned NULL when
    // the post_id didn't match any market_listings or posts row — causing
    // "صفحة غير موجودة" when clicking the author's avatar.
    let videoQuery = `
      SELECT v.id as video_id, v.video_url, v.thumbnail_url, v.duration,
             v.views as video_views, v.likes as video_likes, v.saves as video_saves,
             v.is_featured, v.created_at as video_created_at,
             v.user_id as uploader_id,
             COALESCE(ml.id, p.id) as item_id,
             COALESCE(ml.title, p.content) as title,
             COALESCE(ml.description, '') as description,
             COALESCE(ml.price, p.price) as price,
             COALESCE(ml.currency, p.currency, 'ج.م') as currency,
             COALESCE(ml.category, p.category, '') as category,
             COALESCE(ml.location, p.location, '') as location,
             COALESCE(ml.images, '[]') as images,
             COALESCE(ml.is_promoted, p.is_promoted, 0) as is_promoted,
             COALESCE(ml.seller_id, p.author_id, v.user_id) as author_id,
             u.name as author_name, u.avatar as author_avatar,
             u.avatar_base64, u.is_verified, u.is_trusted
      FROM ad_videos v
      LEFT JOIN market_listings ml ON ml.id = v.post_id
      LEFT JOIN posts p ON p.id = v.post_id
      LEFT JOIN users u ON u.id = COALESCE(ml.seller_id, p.author_id, v.user_id)
      WHERE v.status = 'active'
    `;
    const videoParams: any[] = [];
    if (category) {
      videoQuery += ' AND COALESCE(ml.category, p.category) = ?';
      videoParams.push(category as string);
    }
    videoQuery += ' ORDER BY v.is_featured DESC, v.created_at DESC LIMIT ? OFFSET ?';
    videoParams.push(parseInt(limit as string), offset);

    const videoResults = db.prepare(videoQuery).all(...videoParams);

    // If we have actual videos, return them
    if (videoResults.length > 0) {
      // Get real comment counts for each video
      const videoIds = videoResults.map((r: any) => r.video_id);
      const commentCounts: Record<string, number> = {};
      if (videoIds.length > 0) {
        const placeholders = videoIds.map(() => '?').join(',');
        const countRows = db.prepare(
          `SELECT video_id, COUNT(*) as cnt FROM video_comments WHERE video_id IN (${placeholders}) AND status = 'active' GROUP BY video_id`
        ).all(...videoIds) as any[];
        for (const cr of countRows) {
          commentCounts[cr.video_id] = cr.cnt;
        }
      }

      const videos = videoResults.map((row: any) => {
        let images: string[] = [];
        try { const p = JSON.parse(row.images || '[]'); if (Array.isArray(p)) images = p; } catch { images = []; }

        return {
          id: row.video_id,
          videoUrl: row.video_url,
          thumbnailUrl: row.thumbnail_url || images[0] || '',
          description: row.title,
          content: row.description || '',
          price: row.price,
          currency: row.currency || 'ج.م',
          category: row.category,
          location: row.location,
          authorId: row.author_id,
          authorName: row.author_name || '',
          authorAvatar: row.avatar_base64 || row.author_avatar || '',
          isVerified: !!row.is_verified,
          isTrusted: !!row.is_trusted,
          isPromoted: !!row.is_promoted,
          isTrending: (row.video_views || 0) > 50,
          likes: row.video_likes || 0,
          views: row.video_views || 0,
          commentsCount: commentCounts[row.video_id] || 0,
          duration: row.duration || 0,
        };
      });

      res.json({
        videos,
        hasMore: videoResults.length >= parseInt(limit as string),
      });
      return;
    }

    // Fallback: Return market listings with images as video items (for listings without videos)
    let query = "SELECT * FROM market_listings WHERE status = 'active' AND images IS NOT NULL AND images != '[]'";
    const params: any[] = [];
    if (category) { query += ' AND category = ?'; params.push(category as string); }
    query += ' ORDER BY is_promoted DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), offset);

    const listings = db.prepare(query).all(...params);

    const videos = listings.map((row: any) => {
      const parsed = parseListing(row);
      const seller = attachSeller(parsed);
      let images: string[] = [];
      try { const p = JSON.parse(row.images || '[]'); if (Array.isArray(p)) images = p; } catch { images = []; }

      return {
        id: row.id,
        videoUrl: '',
        thumbnailUrl: images[0] || '',
        description: row.title,
        content: row.description,
        price: row.price,
        currency: row.currency || 'ج.م',
        category: row.category,
        location: row.location,
        authorId: row.seller_id,
        authorName: seller?.seller?.name || '',
        authorAvatar: seller?.seller?.avatar || '',
        isVerified: !!seller?.seller?.is_verified,
        isTrusted: !!seller?.seller?.is_trusted,
        isPromoted: !!row.is_promoted,
        isTrending: (row.views_count || 0) > 50,
        likes: row.saves_count || 0,
        views: row.views_count || 0,
      };
    });

    res.json({
      videos,
      hasMore: listings.length >= parseInt(limit as string),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب فيديوهات السوق', details: err.message });
  }
});

// ─── 16. GET /api/market/market-live/stats — Market live stats ──
router.get('/market-live/stats', (_req: Request, res: Response) => {
  try {
    const newToday = db.prepare("SELECT COUNT(*) as count FROM market_listings WHERE status = 'active' AND created_at >= datetime('now', '-1 day')").get() as any;
    const totalViews = db.prepare("SELECT COALESCE(SUM(views_count), 0) as total FROM market_listings WHERE status = 'active'").get() as any;

    res.json({
      newToday: newToday.count || 0,
      videosToday: newToday.count || 0,
      totalViews: totalViews.total || 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب إحصائيات السوق المباشر', details: err.message });
  }
});

// ─── 17. POST /api/market/market-live/interact — Market live interaction ──
router.post('/market-live/interact', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { videoId, interactionType } = req.body;

    if (!videoId || !interactionType) {
      res.status(400).json({ error: 'بيانات التفاعل مطلوبة' }); return;
    }

    // Check ad_videos table first (for standalone videos), then market_listings
    let ownerId: string | null = null;
    let isVideo = false;

    const video = db.prepare('SELECT user_id, post_id FROM ad_videos WHERE id = ?').get(videoId) as any;
    if (video) {
      isVideo = true;
      ownerId = video.user_id;
      // If video has a linked post/listing, get the owner from there
      if (!ownerId && video.post_id) {
        const ml = db.prepare('SELECT seller_id FROM market_listings WHERE id = ?').get(video.post_id) as any;
        if (ml) ownerId = ml.seller_id;
      }
    }

    if (!isVideo) {
      // Fallback: check market_listings directly
      const listing = db.prepare('SELECT seller_id FROM market_listings WHERE id = ?').get(videoId) as any;
      if (!listing) { res.status(404).json({ error: 'الفيديو غير موجود' }); return; }
      ownerId = listing.seller_id;
    }

    // Import sendPushToUser dynamically
    const { sendPushToUser } = await import('../services/pushNotifications.js');

    // Get interactor name
    const interactor = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
    const interactorName = interactor?.name || 'مستخدم';

    switch (interactionType) {
      case 'like': {
        // Toggle like in video_interactions
        const existing = db.prepare('SELECT id FROM video_interactions WHERE video_id = ? AND user_id = ? AND interaction_type = ?').get(videoId, payload.userId, 'like') as any;
        if (existing) {
          // Unlike
          db.prepare('DELETE FROM video_interactions WHERE id = ?').run(existing.id);
          if (isVideo) {
            db.prepare("UPDATE ad_videos SET likes = MAX(0, likes - 1), updated_at = datetime('now') WHERE id = ?").run(videoId);
          }
          res.json({ success: true, action: 'unliked' });
        } else {
          // Like
          db.prepare('INSERT INTO video_interactions (video_id, user_id, interaction_type) VALUES (?, ?, ?)').run(videoId, payload.userId, 'like');
          if (isVideo) {
            db.prepare("UPDATE ad_videos SET likes = likes + 1, updated_at = datetime('now') WHERE id = ?").run(videoId);
          }
          // Send notification to owner
          if (ownerId && ownerId !== payload.userId) {
            try {
              await sendPushToUser(ownerId, '❤️ إعجاب جديد', `${interactorName} أعجب بفيديوك`, {
                type: 'video_like',
                videoId,
                link: '/#/market-live',
              });
            } catch {}
          }
          res.json({ success: true, action: 'liked' });
        }
        return;
      }
      case 'save': {
        const existing = db.prepare('SELECT id FROM video_interactions WHERE video_id = ? AND user_id = ? AND interaction_type = ?').get(videoId, payload.userId, 'save') as any;
        if (existing) {
          db.prepare('DELETE FROM video_interactions WHERE id = ?').run(existing.id);
          if (isVideo) {
            db.prepare("UPDATE ad_videos SET saves = MAX(0, saves - 1), updated_at = datetime('now') WHERE id = ?").run(videoId);
          }
          res.json({ success: true, action: 'unsaved' });
        } else {
          db.prepare('INSERT INTO video_interactions (video_id, user_id, interaction_type) VALUES (?, ?, ?)').run(videoId, payload.userId, 'save');
          if (isVideo) {
            db.prepare("UPDATE ad_videos SET saves = saves + 1, updated_at = datetime('now') WHERE id = ?").run(videoId);
          }
          // Send notification to owner
          if (ownerId && ownerId !== payload.userId) {
            try {
              await sendPushToUser(ownerId, '🔖 حفظ جديد', `${interactorName} حفظ فيديوك`, {
                type: 'video_save',
                videoId,
                link: '/#/market-live',
              });
            } catch {}
          }
          res.json({ success: true, action: 'saved' });
        }
        return;
      }
      case 'share': {
        if (isVideo) {
          db.prepare("UPDATE ad_videos SET shares = shares + 1, updated_at = datetime('now') WHERE id = ?").run(videoId);
        }
        // Send notification to owner
        if (ownerId && ownerId !== payload.userId) {
          try {
            await sendPushToUser(ownerId, '📤 مشاركة جديدة', `${interactorName} شارك فيديوك`, {
              type: 'video_share',
              videoId,
              link: '/#/market-live',
            });
          } catch {}
        }
        res.json({ success: true, action: 'shared' });
        return;
      }
      case 'view': {
        if (isVideo) {
          db.prepare("UPDATE ad_videos SET views = views + 1, updated_at = datetime('now') WHERE id = ?").run(videoId);
        }
        res.json({ success: true, action: 'viewed' });
        return;
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تسجيل التفاعل', details: err.message });
  }
});

export default router;
