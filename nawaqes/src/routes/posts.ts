// ─── Posts Routes ────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import db from '../database/index.js';
import { authMiddleware, optionalAuth, JwtPayload } from '../middleware/auth.js';
import { getDefaultAvatar } from '../utils/serverAvatar.js';

const router = Router();

function parsePost(row: any) {
  if (!row) return null;
  let paymentMethods: any[] = [];
  try {
    paymentMethods = JSON.parse(row.payment_methods || '[]');
  } catch { paymentMethods = []; }
  let targetInterests: string[] = [];
  try {
    targetInterests = JSON.parse(row.target_interests || '[]');
  } catch { targetInterests = []; }
  return {
    ...row,
    payment_methods: Array.isArray(paymentMethods) ? paymentMethods : [],
    is_boosted: !!row.is_boosted,
    is_promoted: !!row.is_promoted,
    target_interests: targetInterests,
  };
}

function attachAuthor(post: any) {
  if (!post || !post.author_id) return { ...post, author: null };
  try {
    const author = db.prepare('SELECT id, name, avatar, avatar_base64, is_verified, is_trusted, trust_score, interests FROM users WHERE id = ?').get(post.author_id) as any;
    if (author) {
      try { author.interests = JSON.parse(author.interests || '[]'); } catch { author.interests = []; }
      author.is_verified = !!author.is_verified;
      author.is_trusted = !!author.is_trusted;
      // Prefer base64 avatar over URL
      if (author.avatar_base64) author.avatar = author.avatar_base64;
      delete author.avatar_base64;
    }
    return { ...post, author };
  } catch {
    return { ...post, author: { id: post.author_id, name: 'مستخدم', avatar: getDefaultAvatar(post.author_id), is_verified: false, is_trusted: false, trust_score: 50, interests: [] } };
  }
}

// GET /api/posts/promoted — Fetch ALL promoted posts for the carousel (separate from main feed)
// This endpoint ensures promoted posts are always visible to users they target,
// independent of the main feed pagination and filtering.
router.get('/promoted', optionalAuth, (req: Request, res: Response) => {
  try {
    // Auto-expire promotions that have passed their expiration date
    try {
      db.prepare(`
        UPDATE posts SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
        WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
      `).run();
    } catch { /* ignore auto-expire errors */ }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

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

    // Fetch ALL promoted + approved posts (not expired)
    const allPromoted = db.prepare(`
      SELECT * FROM posts
      WHERE status = 'active' AND is_promoted = 1 AND promotion_status = 'approved'
        AND (promotion_expires_at IS NULL OR promotion_expires_at >= datetime('now'))
      ORDER BY promotion_tier = 'vip' DESC, promotion_tier = 'premium' DESC,
               promotion_tier = 'standard' DESC, promotion_tier = 'basic' DESC,
               reach_count DESC, created_at DESC
      LIMIT ?
    `).all(limit * 3) as any[]; // Fetch more than needed to account for targeting filter

    // Separate into targeted-matching and non-targeted (targeting='all')
    const matchedPosts: any[] = [];
    const allTargetingPosts: any[] = [];

    for (const row of allPromoted) {
      const parsed = parsePost(row);
      if (!parsed) continue;

      const targeting = parsed.targeting || 'all';
      let isMatch = true;
      let matchScore = 0; // Higher = more relevant

      // City targeting check
      if (targeting === 'city' && parsed.target_city) {
        let targetCities: string[] = [];
        try {
          const parsedCities = JSON.parse(parsed.target_city);
          if (Array.isArray(parsedCities)) targetCities = parsedCities;
        } catch {
          if (parsed.target_city) targetCities = [parsed.target_city];
        }

        if (targetCities.length > 0) {
          if (userId && userLocation) {
            const cityMatch = targetCities.some(tc =>
              userLocation.includes(tc) || tc.includes(userLocation)
            );
            if (cityMatch) {
              isMatch = true;
              matchScore += 10;
            } else {
              // City doesn't match - still include but with lower priority
              isMatch = false;
            }
          }
          // If user has no location, show the post (benefit of the doubt)
        }
      }

      // Interest targeting check - more flexible matching
      if (targeting === 'interests' && parsed.target_interests && parsed.target_interests.length > 0) {
        if (userId && userInterests.length > 0) {
          // Flexible matching: check both exact and category-level matches
          const hasExactMatch = parsed.target_interests.some((interest: string) =>
            userInterests.some(ui =>
              ui === interest || // Exact match
              ui.toLowerCase() === interest.toLowerCase() || // Case-insensitive
              ui.includes(interest) || interest.includes(ui) || // Substring
              (ui === 'هواتف' && interest === 'phones') || // Arabic-English mapping
              (ui === 'phones' && interest === 'هواتف') ||
              (ui === 'سيارات' && interest === 'cars') ||
              (ui === 'cars' && interest === 'سيارات') ||
              (ui === 'إلكترونيات' && interest === 'electronics') ||
              (ui === 'electronics' && interest === 'إلكترونيات') ||
              (ui === 'عقارات' && interest === 'realEstate') ||
              (ui === 'realEstate' && interest === 'عقارات') ||
              (ui === 'أزياء' && interest === 'fashion') ||
              (ui === 'fashion' && interest === 'أزياء') ||
              (ui === 'ألعاب' && interest === 'games') ||
              (ui === 'games' && interest === 'ألعاب') ||
              (ui === 'رياضة' && interest === 'sports') ||
              (ui === 'sports' && interest === 'رياضة') ||
              (ui === 'كتب' && interest === 'books') ||
              (ui === 'books' && interest === 'كتب') ||
              (ui === 'وظائف' && interest === 'jobs') ||
              (ui === 'jobs' && interest === 'وظائف') ||
              (ui === 'خدمات' && interest === 'services') ||
              (ui === 'services' && interest === 'خدمات') ||
              (ui === 'حيوانات' && interest === 'animals') ||
              (ui === 'animals' && interest === 'حيوانات')
            )
          );
          // Also check if the post's category matches user's interests
          const categoryMatch = parsed.category && userInterests.includes(parsed.category);

          if (hasExactMatch || categoryMatch) {
            isMatch = true;
            matchScore += 20;
          } else {
            isMatch = false;
          }
        }
        // If user has no interests set, show the post (benefit of the doubt)
      }

      // Age targeting check
      if (parsed.target_age_min && parsed.target_age_max &&
          parsed.target_age_min > 0 && parsed.target_age_max > 0) {
        if (userId && userAge > 0) {
          if (userAge >= parsed.target_age_min && userAge <= parsed.target_age_max) {
            isMatch = true;
            matchScore += 5;
          } else {
            isMatch = false;
          }
        }
        // If user has no age info, show the post
      }

      // targeting='all' always matches
      if (targeting === 'all') {
        isMatch = true;
        matchScore += 30; // Highest priority for universal targeting
      }

      const postWithAuthor = attachAuthor(parsed);
      const enrichedPost = { ...postWithAuthor, _matchScore: matchScore, _isTargetMatch: isMatch };

      if (isMatch) {
        matchedPosts.push(enrichedPost);
      } else {
        allTargetingPosts.push(enrichedPost);
      }
    }

    // Sort matched posts by score (highest first), then by tier/reach
    matchedPosts.sort((a: any, b: any) => {
      if (b._matchScore !== a._matchScore) return b._matchScore - a._matchScore;
      return new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime();
    });

    // Fill remaining slots with non-matched targeted posts (with lower visibility)
    // This ensures ALL promoted posts are visible, but targeted ones show first
    const remaining = limit - matchedPosts.length;
    if (remaining > 0 && allTargetingPosts.length > 0) {
      allTargetingPosts.sort((a: any, b: any) =>
        new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime()
      );
      matchedPosts.push(...allTargetingPosts.slice(0, remaining));
    }

    // Clean up internal fields
    const finalPosts = matchedPosts.slice(0, limit).map((p: any) => {
      const { _matchScore, _isTargetMatch, ...rest } = p;
      return rest;
    });

    res.json({ posts: finalPosts });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب الإعلانات المروجة', details: err.message });
  }
});

// GET /api/posts — Fetch posts with smart targeting for promoted posts
router.get('/', optionalAuth, (req: Request, res: Response) => {
  try {
    // Auto-expire promotions that have passed their expiration date
    try {
      db.prepare(`
        UPDATE posts SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
        WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
      `).run();
    } catch { /* ignore auto-expire errors */ }

    const { type, location, category, min_price, max_price, sort, page = '1', limit = '20' } = req.query;

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
          // Calculate user age from date_of_birth
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

    // Build the query with targeting-aware promoted post logic
    let query = 'SELECT * FROM posts WHERE status = ?';
    const params: any[] = ['active'];

    if (type) { query += ' AND type = ?'; params.push(type as string); }
    if (location) { query += ' AND location = ?'; params.push(location as string); }
    if (category) { query += ' AND category = ?'; params.push(category as string); }
    if (min_price) { query += ' AND price >= ?'; params.push(parseFloat(min_price as string)); }
    if (max_price) { query += ' AND price <= ?'; params.push(parseFloat(max_price as string)); }

    // Smart ordering: Promoted posts that match user's targeting come first,
    // then other promoted posts, then regular posts
    // This ensures users see the most relevant promoted content first
    query += ' ORDER BY is_promoted DESC, created_at DESC';

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), offset);

    const rawPosts = db.prepare(query).all(...params);

    // Post-filter: Apply targeting logic to promoted posts with smart scoring
    // Promoted posts are ALWAYS shown (never removed) — they just get sorted by relevance.
    // The post author's own posts always appear at top regardless of targeting.
    // Non-matching promoted posts appear after matching ones but before regular posts.
    const filteredPosts = rawPosts.map((row: any) => {
      try {
        const parsed = parsePost(row);
        if (!parsed) return null;

        let targetMatchScore = 0; // 0 = regular post, >0 = promoted with match, -1 = promoted without match
        const isOwnPost = userId && parsed.author_id === userId;

        // If this is a promoted post with targeting, calculate match score
        if (parsed.is_promoted && parsed.promotion_tier) {
          const targeting = parsed.targeting || 'all';
          targetMatchScore = 1; // Base promoted score

          // targeting='all' always gets highest match
          if (targeting === 'all') {
            targetMatchScore = 30; // Highest priority
          } else {
            let matched = false;

            // City-targeted: check if user is in targeted cities
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
                if (cityMatch) { matched = true; targetMatchScore += 10; }
              } else {
                // User has no location — benefit of the doubt
                matched = true; targetMatchScore += 5;
              }
            }

            // Interest-targeted: flexible matching
            if (targeting === 'interests' && parsed.target_interests && parsed.target_interests.length > 0) {
              if (userId && userInterests.length > 0) {
                const hasMatch = parsed.target_interests.some((interest: string) =>
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
                const categoryMatch = parsed.category && userInterests.includes(parsed.category);
                if (hasMatch || categoryMatch) { matched = true; targetMatchScore += 20; }
              } else {
                // User has no interests — benefit of the doubt
                matched = true; targetMatchScore += 5;
              }
            }

            // Age-targeted: check if user is within age range
            if (parsed.target_age_min && parsed.target_age_max &&
                parsed.target_age_min > 0 && parsed.target_age_max > 0) {
              if (userId && userAge > 0) {
                if (userAge >= parsed.target_age_min && userAge <= parsed.target_age_max) {
                  matched = true; targetMatchScore += 5;
                }
              } else {
                // User has no age info — benefit of the doubt
                matched = true; targetMatchScore += 2;
              }
            }

            // If no targeting criteria matched, mark as non-matching promoted
            if (!matched && targeting !== 'all') {
              targetMatchScore = -1; // Still shown, but after matching promoted posts
            }
          }

          // Post author always sees their own promoted post at top
          if (isOwnPost) {
            targetMatchScore = 50; // Highest possible score for own posts
          }
        }

        const postWithAuthor = attachAuthor(parsed);
        return { ...postWithAuthor, _targetMatchScore: targetMatchScore, _isOwnPost: isOwnPost };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Sort: own promoted > matching promoted > non-matching promoted > regular posts > by date
    filteredPosts.sort((a: any, b: any) => {
      const scoreA = a._targetMatchScore || 0;
      const scoreB = b._targetMatchScore || 0;
      // Higher match score first
      if (scoreA !== scoreB) return scoreB - scoreA;
      // Then by date
      return new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime();
    });

    // Clean up internal fields before sending
    const finalFilteredPosts = filteredPosts.map((p: any) => {
      const { _targetMatchScore, _isOwnPost, ...rest } = p;
      return rest;
    });

    const total = db.prepare('SELECT COUNT(*) as count FROM posts WHERE status = ?').get('active') as any;

    res.json({ posts: finalFilteredPosts, total: total.count, page: parseInt(page as string) });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المنشورات', details: err.message });
  }
});

// GET /api/posts/:id
router.get('/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT * FROM posts WHERE id = ? AND status = ?').get(req.params.id, 'active') as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    const parsed = parsePost(post);
    const result = attachAuthor(parsed);

    // Track view for promoted posts - only count unique views from other users
    if (post.is_promoted) {
      const userId = (req as any).user?.userId || null;
      const visitorIp = req.ip || req.socket.remoteAddress || '';
      // Skip counting views from the post author or admin
      const isAuthor = userId && userId === post.author_id;
      const isAdmin = userId && (() => { try { const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as any; return !!u?.is_admin; } catch { return false; } })();
      try {
        if (!isAuthor && !isAdmin) {
          if (userId) {
            // Authenticated user: check if they've already viewed
            const existingView = db.prepare('SELECT id FROM post_views WHERE post_id = ? AND user_id = ?').get(req.params.id, userId) as any;
            if (!existingView) {
              db.prepare('INSERT OR IGNORE INTO post_views (post_id, user_id, visitor_ip) VALUES (?, ?, ?)').run(req.params.id, userId, visitorIp);
              db.prepare("UPDATE posts SET reach_count = COALESCE(reach_count, 0) + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
            }
          } else {
            // Anonymous: use IP-based deduplication (less precise but better than nothing)
            const existingAnonView = db.prepare('SELECT id FROM post_views WHERE post_id = ? AND user_id IS NULL AND visitor_ip = ?').get(req.params.id, visitorIp) as any;
            if (!existingAnonView) {
              db.prepare('INSERT OR IGNORE INTO post_views (post_id, user_id, visitor_ip) VALUES (?, NULL, ?)').run(req.params.id, visitorIp);
              db.prepare("UPDATE posts SET reach_count = COALESCE(reach_count, 0) + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
            }
          }
        }
      } catch { /* ignore tracking errors */ }
    }

    // Get comments
    const comments = db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at DESC').all(req.params.id);

    res.json({ ...result, commentsList: comments });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب المنشور', details: err.message });
  }
});

// POST /api/posts
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { content, image, type, price, currency, location, payment_methods, category, feeling, activity, sender_phone,
            // 🍔 Food-specific fields (only used when type='food')
            delivery_available, delivery_fee, working_hours, prep_time, contact_phone } = req.body;

    if (!content) { res.status(400).json({ error: 'محتوى المنشور مطلوب' }); return; }

    // If sender_phone not provided but this is a support ticket or complaint, try to get from user profile
    let finalSenderPhone = sender_phone || '';
    if (!finalSenderPhone && (category === 'support_ticket' || (category && category.startsWith('complaint_')))) {
      try {
        const user = db.prepare('SELECT phone FROM users WHERE id = ?').get(payload.userId) as any;
        if (user && user.phone) finalSenderPhone = user.phone;
      } catch { /* ignore */ }
    }

    db.prepare(`
      INSERT INTO posts (author_id, content, image, type, price, currency, location, payment_methods, category, feeling, activity, sender_phone,
        delivery_available, delivery_fee, working_hours, prep_time, contact_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.userId, content, image || '', type || 'ad', price || null, currency || 'ج.م',
      location || '', JSON.stringify(payment_methods || []), category || '', feeling || '', activity || '', finalSenderPhone,
      // Food fields — coerced to safe defaults for non-food posts
      delivery_available ? 1 : 0,
      Number(delivery_fee) || 0,
      (working_hours || '').slice(0, 100),
      (prep_time || '').slice(0, 50),
      (contact_phone || '').slice(0, 30)
    );

    const post = db.prepare('SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 1').get(payload.userId) as any;
    const postWithAuthor = attachAuthor(parsePost(post));

    // Emit WebSocket event so other users' feeds update in real-time
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.broadcast({ type: 'post:created', data: postWithAuthor }, { excludeUserId: payload.userId });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit post created:', wsErr.message); }

    // 🔧 Trigger an event backup so new posts are saved to HF Datasets
    // (prevents data loss if the container is rebuilt before the next periodic backup)
    try {
      const { createEventBackup } = await import('../database/backup-system.js');
      createEventBackup('post_created');
    } catch {}

    res.status(201).json(postWithAuthor);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إنشاء المنشور', details: err.message });
  }
});

// PUT /api/posts/:id
router.put('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }
    if (post.author_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية تعديل هذا المنشور' }); return;
    }

    const allowed = ['content', 'image', 'type', 'price', 'currency', 'location', 'payment_methods', 'category', 'feeling', 'activity', 'status',
      // 🍔 Food-specific fields (also editable on PUT)
      'delivery_available', 'delivery_fee', 'working_hours', 'prep_time', 'contact_phone'];
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
      db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    res.json(attachAuthor(parsePost(updated)));
  } catch (err: any) {
    res.status(500).json({ error: 'فشل تحديث المنشور', details: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id) as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }
    if (post.author_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية حذف هذا المنشور' }); return;
    }

    db.prepare("UPDATE posts SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    // 🔧 FIX: Also delete all related data when a post is deleted:
    // - promotion_requests (so admin dashboard doesn't show orphan requests)
    // - post_comments
    // - post_likes
    // - saved_posts references
    try { db.prepare("UPDATE promotion_requests SET status = 'rejected' WHERE post_id = ? AND status = 'pending'").run(req.params.id); } catch {}
    try { db.prepare("DELETE FROM post_comments WHERE post_id = ?").run(req.params.id); } catch {}
    try { db.prepare("DELETE FROM post_likes WHERE post_id = ?").run(req.params.id); } catch {}
    try { db.prepare("DELETE FROM share_events WHERE post_id = ?").run(req.params.id); } catch {}
    try { db.prepare("DELETE FROM post_views WHERE post_id = ?").run(req.params.id); } catch {}

    // Emit WebSocket event so ALL users' feeds update (including the deleter).
    // We broadcast WITHOUT excludeUserId so the deleting user's own feed
    // removes the post immediately via handleWSPostDeleted.
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.broadcast({ type: 'post:deleted', data: { postId: req.params.id } });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit post deleted:', wsErr.message); }

    res.json({ message: 'تم حذف المنشور بنجاح' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف المنشور', details: err.message });
  }
});

// POST /api/posts/:id/like
router.post('/:id/like', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    // Check if user already liked this post (prevent double-liking)
    const existing = db.prepare('SELECT id FROM post_likes WHERE user_id = ? AND post_id = ?').get(payload.userId, req.params.id) as any;
    
    let liked: boolean;
    if (existing) {
      // Unlike: remove the like and decrement
      db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(payload.userId, req.params.id);
      db.prepare("UPDATE posts SET likes = MAX(likes - 1, 0), updated_at = datetime('now') WHERE id = ?").run(req.params.id);
      liked = false;
    } else {
      // Like: add the like and increment
      db.prepare('INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)').run(payload.userId, req.params.id);
      db.prepare("UPDATE posts SET likes = likes + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
      liked = true;

      // Like notifications DISABLED per user request (2026-06-23).
      // The "أعجب X بمنشورك" notification was too frequent and annoying.
      // The like count on the post itself is still updated.
      // (The code below is commented out but preserved for reference.)
      /*
      const post = db.prepare('SELECT likes, author_id FROM posts WHERE id = ?').get(req.params.id) as any;
      if (post && post.author_id !== payload.userId) {
        const user = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
        if (user) {
          db.prepare('INSERT INTO notifications (user_id, type, message, post_id, user_id_ref) VALUES (?, ?, ?, ?, ?)')
            .run(post.author_id, 'like', `أعجب ${user.name} بمنشورك`, req.params.id, payload.userId);
        }
        try {
          const wsManager = (req.app.locals as any).wsManager;
          if (wsManager) {
            wsManager.emitNotification(post.author_id, {
              type: 'like',
              message: `أعجب ${user?.name || 'مستخدم'} بمنشورك`,
              postId: req.params.id,
              userId: payload.userId,
              link: `/post/${req.params.id}`,
              time: new Date().toISOString(),
            });
          }
        } catch (wsErr: any) { console.error('[WS] Failed to emit like notification:', wsErr.message); }
      }
      */
    }

    const post = db.prepare('SELECT likes FROM posts WHERE id = ?').get(req.params.id) as any;
    res.json({ likes: post?.likes || 0, liked });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل الإعجاب', details: err.message });
  }
});

// POST /api/posts/:id/comment
router.post('/:id/comment', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { content, parentId, imageUrl } = req.body;
    if (!content && !imageUrl) { res.status(400).json({ error: 'محتوى التعليق مطلوب' }); return; }

    const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(payload.userId) as any;
    const parent_id = parentId || '';
    const image_url = imageUrl || '';
    const comment_content = content || ''; // Allow empty text if image is provided
    db.prepare('INSERT INTO post_comments (post_id, author_id, author_name, author_avatar, content, parent_id, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.id, payload.userId, user.name, user.avatar, comment_content, parent_id, image_url);
    db.prepare("UPDATE posts SET comments = comments + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    // Comment notifications DISABLED per user request (2026-06-23).
    // All notifications go to the notifications page (bell icon) ONLY.
    // No DB insert, no WebSocket emitNotification.
    // The post:commented broadcast is kept so the comment appears in real-time
    // on the post page (without a popup notification).
    /*
    const post = db.prepare('SELECT author_id FROM posts WHERE id = ?').get(req.params.id) as any;
    if (post && post.author_id !== payload.userId) {
      db.prepare('INSERT INTO notifications (user_id, type, message, post_id, user_id_ref) VALUES (?, ?, ?, ?, ?)')
        .run(post.author_id, 'comment', `علق ${user.name} على منشورك`, req.params.id, payload.userId);
    }
    if (parent_id) {
      const parentComment = db.prepare('SELECT author_id FROM post_comments WHERE id = ?').get(parent_id) as any;
      if (parentComment && parentComment.author_id !== payload.userId) {
        db.prepare('INSERT INTO notifications (user_id, type, message, post_id, user_id_ref) VALUES (?, ?, ?, ?, ?)')
          .run(parentComment.author_id, 'comment', `رد ${user.name} على تعليقك`, req.params.id, payload.userId);
      }
    }
    */

    const comment = db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.id);

    // Broadcast comment to all users viewing this post (real-time UI update, NOT a notification)
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.broadcast({ type: 'post:commented', data: { postId: req.params.id, comment } }, { excludeUserId: payload.userId });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit comment notification:', wsErr.message); }

    res.status(201).json(comment);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل إضافة التعليق', details: err.message });
  }
});

// POST /api/posts/:id/comment/:commentId/like — Like/unlike a comment
router.post('/:id/comment/:commentId/like', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { commentId } = req.params;

    // Check if already liked
    const existing = db.prepare('SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(commentId, payload.userId) as any;

    if (existing) {
      // Unlike: remove the like and decrement count
      db.prepare('DELETE FROM comment_likes WHERE id = ?').run(existing.id);
      db.prepare('UPDATE post_comments SET likes = MAX(0, likes - 1) WHERE id = ?').run(commentId);
      const updated = db.prepare('SELECT likes FROM post_comments WHERE id = ?').get(commentId) as any;
      res.json({ liked: false, likes: updated?.likes || 0 });
    } else {
      // Like: add the like and increment count
      db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)').run(commentId, payload.userId);
      db.prepare('UPDATE post_comments SET likes = likes + 1 WHERE id = ?').run(commentId);

      // Comment like notifications DISABLED per user request (2026-06-23).
      // The like count on the comment is still updated.
      /*
      const comment = db.prepare('SELECT author_id FROM post_comments WHERE id = ?').get(commentId) as any;
      if (comment && comment.author_id !== payload.userId) {
        const user = db.prepare('SELECT name FROM users WHERE id = ?').get(payload.userId) as any;
        if (user) {
          db.prepare('INSERT INTO notifications (user_id, type, message, post_id, user_id_ref) VALUES (?, ?, ?, ?, ?)')
            .run(comment.author_id, 'like', `أعجب ${user.name} بتعليقك`, req.params.id, payload.userId);
        }
        try {
          const wsManager = (req.app.locals as any).wsManager;
          if (wsManager) {
            wsManager.emitNotification(comment.author_id, {
              type: 'like',
              message: `أعجب ${user?.name || 'مستخدم'} بتعليقك`,
              postId: req.params.id,
              userId: payload.userId,
              link: `/post/${req.params.id}`,
              time: new Date().toISOString(),
            });
          }
        } catch (wsErr: any) { console.error('[WS] Failed to emit comment like notification:', wsErr.message); }
      }
      */

      const updated = db.prepare('SELECT likes FROM post_comments WHERE id = ?').get(commentId) as any;
      res.json({ liked: true, likes: updated?.likes || 1 });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'فشل الإعجاب بالتعليق', details: err.message });
  }
});

// DELETE /api/posts/:id/comment/:commentId — Delete own comment
router.delete('/:id/comment/:commentId', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const { commentId } = req.params;

    const comment = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(commentId) as any;
    if (!comment) { res.status(404).json({ error: 'التعليق غير موجود' }); return; }
    if (comment.author_id !== payload.userId && !payload.isAdmin) {
      res.status(403).json({ error: 'ليس لديك صلاحية حذف هذا التعليق' }); return;
    }

    // Count replies to this comment so we can decrement the post comment count properly
    const replyCount = (db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE parent_id = ?').get(commentId) as any).count;

    // Delete likes for this comment and its replies
    db.prepare('DELETE FROM comment_likes WHERE comment_id = ?').run(commentId);
    // Delete replies first
    if (replyCount > 0) {
      const replies = db.prepare('SELECT id FROM post_comments WHERE parent_id = ?').all(commentId) as any[];
      for (const reply of replies) {
        db.prepare('DELETE FROM comment_likes WHERE comment_id = ?').run(reply.id);
      }
      db.prepare('DELETE FROM post_comments WHERE parent_id = ?').run(commentId);
    }
    // Delete the comment itself
    db.prepare('DELETE FROM post_comments WHERE id = ?').run(commentId);

    // Decrement post comment count (1 for the comment + replies)
    const totalDeleted = 1 + replyCount;
    db.prepare(`UPDATE posts SET comments = MAX(0, comments - ?), updated_at = datetime('now') WHERE id = ?`).run(totalDeleted, req.params.id);

    // Emit WebSocket event so feeds update comment counts in real-time
    try {
      const wsManager = (req.app.locals as any).wsManager;
      if (wsManager) {
        wsManager.broadcast({ type: 'post:comment_deleted', data: { postId: req.params.id, commentId } }, { excludeUserId: payload.userId });
      }
    } catch (wsErr: any) { console.error('[WS] Failed to emit comment deleted:', wsErr.message); }

    res.json({ message: 'تم حذف التعليق بنجاح' });
  } catch (err: any) {
    res.status(500).json({ error: 'فشل حذف التعليق', details: err.message });
  }
});

// GET /api/posts/:id/comments — Get all comments with nested structure
router.get('/:id/comments', optionalAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId || null;
    const allComments = db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').all(req.params.id) as any[];

    // Get user's likes on these comments
    const commentIds = allComments.map((c: any) => c.id);
    let userLikes: Set<string> = new Set();
    if (userId && commentIds.length > 0) {
      const placeholders = commentIds.map(() => '?').join(',');
      const likes = db.prepare(`SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${placeholders})`).all(userId, ...commentIds) as any[];
      userLikes = new Set(likes.map((l: any) => l.comment_id));
    }

    // Build nested structure
    const commentMap = new Map<string, any>();
    const topLevel: any[] = [];

    for (const c of allComments) {
      commentMap.set(c.id, {
        ...c,
        isLiked: userLikes.has(c.id),
        replies: [],
      });
    }

    for (const c of allComments) {
      const node = commentMap.get(c.id);
      if (c.parent_id && commentMap.has(c.parent_id)) {
        commentMap.get(c.parent_id).replies.push(node);
      } else {
        topLevel.push(node);
      }
    }

    res.json(topLevel);
  } catch (err: any) {
    res.status(500).json({ error: 'فشل جلب التعليقات', details: err.message });
  }
});

// POST /api/posts/:id/click — Track click on promoted post
router.post('/:id/click', authMiddleware, (req: Request, res: Response) => {
  try {
    const post = db.prepare('SELECT is_promoted, click_count FROM posts WHERE id = ? AND status = ?').get(req.params.id, 'active') as any;
    if (!post) { res.status(404).json({ error: 'المنشور غير موجود' }); return; }

    if (post.is_promoted) {
      db.prepare("UPDATE posts SET click_count = COALESCE(click_count, 0) + 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    }

    const updated = db.prepare('SELECT click_count FROM posts WHERE id = ?').get(req.params.id) as any;
    res.json({ clicks: updated?.click_count || 0 });
  } catch (err: any) {
    res.json({ clicks: 0 }); // Silent fail
  }
});

// POST /api/posts/track-impressions — Track impressions for promoted posts shown in feed
router.post('/track-impressions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;
    const { postIds } = req.body;
    if (!Array.isArray(postIds) || postIds.length === 0) {
      res.json({ tracked: 0 });
      return;
    }
    // Only track unique impressions for promoted posts - exclude author & admin
    const placeholders = postIds.map(() => '?').join(',');
    const promotedIds = db.prepare(
      `SELECT id, author_id FROM posts WHERE id IN (${placeholders}) AND is_promoted = 1 AND status = 'active'`
    ).all(...postIds) as any[];

    // Check if current user is admin
    let isUserAdmin = false;
    try { const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId) as any; isUserAdmin = !!u?.is_admin; } catch {}

    let trackedCount = 0;
    for (const p of promotedIds) {
      try {
        // Skip counting impressions for the post author or admin
        if (p.author_id === userId || isUserAdmin) continue;
        // Check if this user already viewed this post
        const existingView = db.prepare('SELECT id FROM post_views WHERE post_id = ? AND user_id = ?').get(p.id, userId) as any;
        if (!existingView) {
          db.prepare('INSERT OR IGNORE INTO post_views (post_id, user_id) VALUES (?, ?)').run(p.id, userId);
          db.prepare("UPDATE posts SET reach_count = COALESCE(reach_count, 0) + 1, updated_at = datetime('now') WHERE id = ? AND is_promoted = 1").run(p.id);
          trackedCount++;
        }
      } catch { /* ignore individual tracking errors */ }
    }
    res.json({ tracked: trackedCount });
  } catch (err: any) {
    res.json({ tracked: 0 }); // Silent fail - tracking shouldn't break the app
  }
});

export default router;
