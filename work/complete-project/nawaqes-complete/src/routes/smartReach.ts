// ─── Smart Reach (الوصول الذكي) Routes ─────────────────────────────────
// Comprehensive analytics, suggestions, and real-time monitoring for
// promoted posts and market listings on the Nawaqes platform.
import { Router, Request, Response } from 'express';
import db from '../database/index.js';
import { authMiddleware, JwtPayload } from '../middleware/auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
//  Helper Types & Constants
// ═══════════════════════════════════════════════════════════════════════

interface PromotionRow {
  id: string;
  type: 'post' | 'market';
  title: string;
  tier: string;
  reach_count: number;
  total_engagement: number;
  total_spent: number;
  targeting: string;
  target_city: string;
  target_interests: string;
  promotion_started_at: string | null;
  promotion_expires_at: string | null;
  created_at: string;
}

const TIER_ORDER: Record<string, number> = {
  vip: 4,
  premium: 3,
  standard: 2,
  basic: 1,
};

const TIER_NAMES_AR: Record<string, string> = {
  vip: 'VIP',
  premium: 'بريميوم',
  standard: 'ستاندر',
  basic: 'أساسي',
};

const TARGETING_NAMES_AR: Record<string, string> = {
  all: 'الكل',
  city: 'حسب المدينة',
  interests: 'حسب الاهتمامات',
};

const ARABIC_INTEREST_MAP: Record<string, string> = {
  phones: 'هواتف',
  electronics: 'إلكترونيات',
  games: 'ألعاب',
  cars: 'سيارات',
  realEstate: 'عقارات',
  fashion: 'أزياء',
  beauty: 'تجميل',
  sports: 'رياضة',
  food: 'طعام ومطاعم',
  jobs: 'وظائف',
  services: 'خدمات',
  education: 'تعليم',
  books: 'كتب',
  animals: 'حيوانات',
  travel: 'سفر وسياحة',
  photography: 'تصوير',
  health: 'صحة',
  other: 'أخرى',
  تقنية: 'تقنية',
  عقارات: 'عقارات',
  سيارات: 'سيارات',
  هواتف: 'هواتف',
  إلكترونيات: 'إلكترونيات',
};

// ═══════════════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════════════

/** Safely parse a JSON string, returning fallback on failure */
function safeJsonParse<T>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    const parsed = JSON.parse(jsonStr);
    return (Array.isArray(parsed) ? parsed : fallback) as T;
  } catch {
    return fallback;
  }
}

/** Calculate age from date_of_birth string */
function calculateAge(dob: string | null | undefined): number {
  if (!dob) return 0;
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? age : 0;
  } catch {
    return 0;
  }
}

/** Map age to a range label in Arabic */
function ageToRange(age: number): string {
  if (age < 18) return 'أقل من 18';
  if (age <= 24) return '18-24';
  if (age <= 34) return '25-34';
  if (age <= 44) return '35-44';
  if (age <= 54) return '45-54';
  return '55+';
}

/** Get all promoted posts for a user (including expired for accurate stats) */
function getUserPromotedPosts(userId: string, includeExpired: boolean = false): any[] {
  const statusFilter = includeExpired
    ? "promotion_status IN ('approved', 'expired')"
    : "is_promoted = 1 AND promotion_status = 'approved'";
  return db.prepare(`
    SELECT
      id, content as title, promotion_tier as tier, reach_count,
      (COALESCE(likes, 0) + COALESCE(comments, 0) + COALESCE(shares, 0)) as total_engagement,
      targeting, target_city, target_interests,
      promotion_started_at, promotion_expires_at, is_promoted,
      promotion_status, created_at, 'post' as source_type
    FROM posts
    WHERE author_id = ? AND ${statusFilter}
      AND status = 'active'
  `).all(userId) as any[];
}

/** Get all promoted market listings for a user (including expired for accurate stats) */
function getUserPromotedListings(userId: string, includeExpired: boolean = false): any[] {
  const statusFilter = includeExpired
    ? "promotion_status IN ('approved', 'expired')"
    : "is_promoted = 1 AND promotion_status = 'approved'";
  return db.prepare(`
    SELECT
      id, title, promotion_tier as tier, reach_count,
      (COALESCE(saves_count, 0) + COALESCE(inquiries_count, 0) + COALESCE(shares_count, 0)) as total_engagement,
      targeting, target_city, target_interests,
      promotion_started_at, promotion_expires_at, is_promoted,
      promotion_status, created_at, 'market' as source_type,
      views_count, saves_count, inquiries_count, shares_count
    FROM market_listings
    WHERE seller_id = ? AND ${statusFilter}
      AND status = 'active'
  `).all(userId) as any[];
}

/** Get spending data from promotion_requests for posts */
function getPostPromotionSpending(userId: string): any[] {
  return db.prepare(`
    SELECT post_id, tier, price, targeting, target_city, target_interests,
           estimated_reach, status, created_at
    FROM promotion_requests
    WHERE author_id = ? AND status = 'approved'
  `).all(userId) as any[];
}

/** Get spending data from market_promotion_requests for listings */
function getMarketPromotionSpending(userId: string): any[] {
  return db.prepare(`
    SELECT listing_id, tier, price, targeting, target_city, target_interests,
           estimated_reach, status, created_at
    FROM market_promotion_requests
    WHERE seller_id = ? AND status = 'approved'
  `).all(userId) as any[];
}

/** Get total spending from transactions */
function getTotalPromotionSpent(userId: string): number {
  const result = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE user_id = ? AND type = 'promotion_debit' AND status = 'completed'
  `).get(userId) as any;
  return result?.total || 0;
}

/** Auto-expire promotions that have passed their expiration date */
function autoExpirePromotions(): void {
  try {
    db.prepare(`
      UPDATE posts SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
      WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
    `).run();
  } catch { /* ignore */ }

  try {
    db.prepare(`
      UPDATE market_listings SET is_promoted = 0, promotion_status = 'expired', updated_at = datetime('now')
      WHERE is_promoted = 1 AND promotion_expires_at IS NOT NULL AND promotion_expires_at < datetime('now')
    `).run();
  } catch { /* ignore */ }
}

/** Get daily reach data for the last N days (simulated from cumulative reach, includes expired) */
function getReachByDay(userId: string, days: number = 14): { date: string; reach: number }[] {
  const result: { date: string; reach: number }[] = [];

  // Get all promoted content for the user (including expired for accurate stats)
  const posts = getUserPromotedPosts(userId, true);
  const listings = getUserPromotedListings(userId, true);
  const allPromotions = [...posts, ...listings];

  // Generate daily data points from the last N days
  for (let i = days - 1; i >= 0; i--) {
    const dateStr = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    let dayReach = 0;

    for (const promo of allPromotions) {
      const createdAt = new Date(promo.created_at).toISOString().split('T')[0];
      const expiresAt = promo.promotion_expires_at
        ? new Date(promo.promotion_expires_at).toISOString().split('T')[0]
        : null;

      // If promotion was active on this date
      if (createdAt <= dateStr && (!expiresAt || expiresAt >= dateStr)) {
        // Estimate daily reach as proportional share of total reach
        const totalDays = Math.max(1, Math.ceil(
          (Date.now() - new Date(promo.created_at).getTime()) / 86400000
        ));
        dayReach += Math.round((promo.reach_count || 0) / totalDays);
      }
    }

    result.push({ date: dateStr, reach: dayReach });
  }

  return result;
}

/** Build demographics breakdown from user viewing data (includes expired promotions) */
function buildDemographics(userId: string): {
  byCity: { city: string; count: number }[];
  byInterest: { interest: string; count: number }[];
  byAge: { range: string; count: number }[];
} {
  // Get viewers of the user's promoted content (including expired) via smart_link_visits
  const postIds = db.prepare(`
    SELECT id FROM posts WHERE author_id = ? AND promotion_status IN ('approved', 'expired')
  `).all(userId) as any[];

  const listingIds = db.prepare(`
    SELECT id FROM market_listings WHERE seller_id = ? AND promotion_status IN ('approved', 'expired')
  `).all(userId) as any[];

  const allPromoIds = [
    ...postIds.map((p: any) => p.id),
    ...listingIds.map((l: any) => l.id),
  ];

  // Collect visitor user IDs from smart_link_visits
  let visitorIds: string[] = [];
  if (allPromoIds.length > 0) {
    const placeholders = allPromoIds.map(() => '?').join(',');
    const visitors = db.prepare(`
      SELECT DISTINCT visitor_id FROM smart_link_visits
      WHERE post_id IN (${placeholders}) AND visitor_id IS NOT NULL
    `).all(...allPromoIds) as any[];
    visitorIds = visitors.map((v: any) => v.visitor_id).filter(Boolean);
  }

  // If no visitor tracking data, use a broader approach:
  // Get user location/interests/age data from viewers of their content
  // For a richer result, we also count interactions (likes, comments, saves)
  const interactionUserIds = new Set<string>(visitorIds);

  // Add users who liked/commented on promoted posts
  if (postIds.length > 0) {
    const postPlaceholders = postIds.map(() => '?').join(',');
    try {
      const commenters = db.prepare(`
        SELECT DISTINCT author_id FROM post_comments
        WHERE post_id IN (${postPlaceholders})
      `).all(...postIds.map((p: any) => p.id)) as any[];
      commenters.forEach((c: any) => interactionUserIds.add(c.author_id));
    } catch { /* ignore */ }
  }

  // Add users who saved/inquired about promoted listings
  if (listingIds.length > 0) {
    const listPlaceholders = listingIds.map(() => '?').join(',');
    try {
      const savers = db.prepare(`
        SELECT DISTINCT user_id FROM market_listing_saves
        WHERE listing_id IN (${listPlaceholders})
      `).all(...listingIds.map((l: any) => l.id)) as any[];
      savers.forEach((s: any) => interactionUserIds.add(s.user_id));
    } catch { /* ignore */ }
  }

  // If still no interaction data, use the user's own city/interests as a baseline hint
  if (interactionUserIds.size === 0) {
    // Return empty demographics with a note that data will populate over time
    return { byCity: [], byInterest: [], byAge: [] };
  }

  // Query demographics for all interaction users
  const interactionIdArray = Array.from(interactionUserIds);
  const idPlaceholders = interactionIdArray.map(() => '?').join(',');

  // By City
  const cityData = db.prepare(`
    SELECT location as city, COUNT(*) as count
    FROM users
    WHERE id IN (${idPlaceholders}) AND location IS NOT NULL AND location != ''
    GROUP BY location
    ORDER BY count DESC
    LIMIT 10
  `).all(...interactionIdArray) as any[];

  // By Interest
  const interestUsers = db.prepare(`
    SELECT interests FROM users
    WHERE id IN (${idPlaceholders}) AND interests IS NOT NULL AND interests != '[]'
  `).all(...interactionIdArray) as any[];

  const interestCounts: Record<string, number> = {};
  for (const user of interestUsers) {
    const interests: string[] = safeJsonParse(user.interests, []);
    for (const interest of interests) {
      const displayName = ARABIC_INTEREST_MAP[interest] || interest;
      interestCounts[displayName] = (interestCounts[displayName] || 0) + 1;
    }
  }
  const byInterest = Object.entries(interestCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([interest, count]) => ({ interest, count }));

  // By Age
  const ageUsers = db.prepare(`
    SELECT date_of_birth FROM users
    WHERE id IN (${idPlaceholders}) AND date_of_birth IS NOT NULL AND date_of_birth != ''
  `).all(...interactionIdArray) as any[];

  const ageCounts: Record<string, number> = {};
  for (const user of ageUsers) {
    const age = calculateAge(user.date_of_birth);
    if (age > 0) {
      const range = ageToRange(age);
      ageCounts[range] = (ageCounts[range] || 0) + 1;
    }
  }
  const ageOrder = ['أقل من 18', '18-24', '25-34', '35-44', '45-54', '55+'];
  const byAge = ageOrder
    .filter(range => ageCounts[range])
    .map(range => ({ range, count: ageCounts[range] }));

  return {
    byCity: cityData.map(c => ({ city: c.city, count: c.count })),
    byInterest,
    byAge,
  };
}


// ═══════════════════════════════════════════════════════════════════════
//  1. GET /api/smart-reach/stats
//  Get comprehensive smart reach statistics for the authenticated user
// ═══════════════════════════════════════════════════════════════════════
router.get('/stats', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;

    // Auto-expire stale promotions
    autoExpirePromotions();

    // ── Gather all promoted content (including expired for accurate stats) ──
    const promotedPosts = getUserPromotedPosts(userId, true);
    const promotedListings = getUserPromotedListings(userId, true);
    const allPromotions = [
      ...promotedPosts.map((p: any) => ({ ...p, source_type: 'post' })),
      ...promotedListings.map((l: any) => ({ ...l, source_type: 'market' })),
    ];

    // ── Spending data ────────────────────────────────────────────────
    const postSpending = getPostPromotionSpending(userId);
    const marketSpending = getMarketPromotionSpending(userId);
    const allSpending = [...postSpending, ...marketSpending];
    const totalSpent = getTotalPromotionSpent(userId);

    // ── Core stats (including expired promotions for accurate totals) ──
    const totalPromotions = allSpending.length; // all approved promotion requests
    const activePromotions = allPromotions.filter((p: any) => p.promotion_status === 'approved' && p.is_promoted === 1).length;
    const totalReach = allPromotions.reduce((sum: number, p: any) => sum + (p.reach_count || 0), 0);
    const avgReachPerPromotion = totalPromotions > 0 ? Math.round(totalReach / totalPromotions) : 0;
    const reachEfficiency = totalSpent > 0 ? Math.round(totalReach / totalSpent) : 0;

    // ── Reach by day (last 14 days) ──────────────────────────────────
    const reachByDay = getReachByDay(userId, 14);

    // ── Demographics ─────────────────────────────────────────────────
    const demographics = buildDemographics(userId);

    // ── Promotion breakdown by tier ──────────────────────────────────
    const tierBreakdown: Record<string, { count: number; totalReach: number; totalSpent: number }> = {};
    for (const promo of allSpending) {
      const tier = promo.tier || 'basic';
      if (!tierBreakdown[tier]) {
        tierBreakdown[tier] = { count: 0, totalReach: 0, totalSpent: 0 };
      }
      tierBreakdown[tier].count++;
      tierBreakdown[tier].totalSpent += promo.price || 0;
    }
    // Enrich with reach data from actual promoted items
    for (const promo of allPromotions) {
      const tier = promo.tier || 'basic';
      if (tierBreakdown[tier]) {
        tierBreakdown[tier].totalReach += promo.reach_count || 0;
      }
    }

    const promotionBreakdown = Object.entries(tierBreakdown).map(([tier, data]) => ({
      tier: TIER_NAMES_AR[tier] || tier,
      tierRaw: tier,
      count: data.count,
      totalReach: data.totalReach,
      avgReach: data.count > 0 ? Math.round(data.totalReach / data.count) : 0,
      totalSpent: Math.round(data.totalSpent),
    })).sort((a, b) => (TIER_ORDER[b.tierRaw] || 0) - (TIER_ORDER[a.tierRaw] || 0));

    // ── Best performing promotion ────────────────────────────────────
    let bestPerformingPromotion: any = null;
    if (allPromotions.length > 0) {
      const best = allPromotions.reduce((max: any, p: any) =>
        (p.reach_count || 0) > (max.reach_count || 0) ? p : max
      , allPromotions[0]);

      bestPerformingPromotion = {
        id: best.id,
        type: best.source_type,
        title: best.title || 'منشور بدون عنوان',
        tier: TIER_NAMES_AR[best.tier] || best.tier,
        reach: best.reach_count || 0,
        engagement: best.total_engagement || 0,
        targeting: TARGETING_NAMES_AR[best.targeting] || best.targeting,
        createdAt: best.created_at,
      };
    }

    // ── Targeting effectiveness ──────────────────────────────────────
    const targetingGroups: Record<string, { count: number; totalReach: number }> = {
      all: { count: 0, totalReach: 0 },
      city: { count: 0, totalReach: 0 },
      interests: { count: 0, totalReach: 0 },
    };

    for (const promo of allPromotions) {
      const targeting = promo.targeting || 'all';
      if (targetingGroups[targeting]) {
        targetingGroups[targeting].count++;
        targetingGroups[targeting].totalReach += promo.reach_count || 0;
      }
    }

    const targetingEffectiveness = Object.fromEntries(
      Object.entries(targetingGroups).map(([key, data]) => [
        key,
        {
          count: data.count,
          avgReach: data.count > 0 ? Math.round(data.totalReach / data.count) : 0,
        },
      ])
    );

    // ── Total clicks across all promotions ──
    const totalClicks = allPromotions.reduce((sum: number, p: any) => sum + (p.click_count || 0), 0);

    // ── Response ─────────────────────────────────────────────────────
    res.json({
      totalPromotions,
      activePromotions,
      totalReach,
      totalClicks,
      promotedCount: activePromotions,
      totalPosts: allPromotions.filter((p: any) => p.source_type === 'post').length + allPromotions.filter((p: any) => p.source_type === 'market').length,
      totalSpent: Math.round(totalSpent),
      avgReachPerPromotion,
      reachEfficiency,
      demographics,
      reachByDay,
      promotionBreakdown,
      bestPerformingPromotion,
      targetingEffectiveness,
    });
  } catch (err: any) {
    console.error('[SmartReach] Stats error:', err.message);
    res.status(500).json({ error: 'فشل جلب إحصائيات الوصول الذكي', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════
//  2. GET /api/smart-reach/promotion/:id/analytics
//  Detailed analytics for a specific promotion (post or market listing)
// ═══════════════════════════════════════════════════════════════════════
router.get('/promotion/:id/analytics', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;
    const promoId = req.params.id;

    // Auto-expire stale promotions
    autoExpirePromotions();

    // ── Try to find as a post first ─────────────────────────────────
    let promotion: any = null;
    let promotionType: 'post' | 'market' = 'post';
    let spending: number = 0;
    let estimatedReach: number = 0;

    const post = db.prepare(`
      SELECT p.*,
        (COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.shares, 0)) as total_engagement
      FROM posts p
      WHERE p.id = ? AND p.author_id = ? AND p.promotion_status IN ('approved', 'expired') AND p.status = 'active'
    `).get(promoId, userId) as any;

    if (post) {
      promotion = post;
      promotionType = 'post';

      // Get spending from promotion_requests
      const promoReq = db.prepare(`
        SELECT price, estimated_reach FROM promotion_requests
        WHERE post_id = ? AND author_id = ? AND status = 'approved'
        ORDER BY created_at DESC LIMIT 1
      `).get(promoId, userId) as any;
      spending = promoReq?.price || 0;
      estimatedReach = promoReq?.estimated_reach || post.estimated_reach || 0;
    } else {
      // Try as a market listing
      const listing = db.prepare(`
        SELECT ml.*,
          (COALESCE(ml.saves_count, 0) + COALESCE(ml.inquiries_count, 0) + COALESCE(ml.shares_count, 0)) as total_engagement
        FROM market_listings ml
        WHERE ml.id = ? AND ml.seller_id = ? AND ml.promotion_status IN ('approved', 'expired') AND ml.status = 'active'
      `).get(promoId, userId) as any;

      if (listing) {
        promotion = listing;
        promotionType = 'market';

        // Get spending from market_promotion_requests
        const promoReq = db.prepare(`
          SELECT price, estimated_reach FROM market_promotion_requests
          WHERE listing_id = ? AND seller_id = ? AND status = 'approved'
          ORDER BY created_at DESC LIMIT 1
        `).get(promoId, userId) as any;
        spending = promoReq?.price || 0;
        estimatedReach = promoReq?.estimated_reach || listing.estimated_reach || 0;
      }
    }

    if (!promotion) {
      res.status(404).json({ error: 'الترويج غير موجود أو ليس لديك صلاحية عرضه' });
      return;
    }

    // ── Promotion details ────────────────────────────────────────────
    const reachCount = promotion.reach_count || 0;
    const engagement = promotion.total_engagement || 0;

    const promotionDetails = {
      id: promotion.id,
      type: promotionType,
      title: promotionType === 'post' ? (promotion.content || '') : (promotion.title || ''),
      tier: TIER_NAMES_AR[promotion.promotion_tier] || promotion.promotion_tier,
      tierRaw: promotion.promotion_tier,
      status: promotion.promotion_status,
      targeting: TARGETING_NAMES_AR[promotion.targeting] || promotion.targeting,
      targetingRaw: promotion.targeting || 'all',
      targetCity: promotion.target_city || '',
      targetInterests: safeJsonParse<string[]>(promotion.target_interests, []),
      startedAt: promotion.promotion_started_at,
      expiresAt: promotion.promotion_expires_at,
      createdAt: promotion.created_at,
      reachCount,
      estimatedReach,
      spending: Math.round(spending),
    };

    // ── Reach over time (daily for last 14 days) ─────────────────────
    const reachOverTime: { date: string; reach: number }[] = [];
    const createdDate = new Date(promotion.created_at);
    const totalDaysActive = Math.max(1, Math.ceil(
      (Date.now() - createdDate.getTime()) / 86400000
    ));

    for (let i = 13; i >= 0; i--) {
      const dateStr = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      const expiresAt = promotion.promotion_expires_at
        ? new Date(promotion.promotion_expires_at).toISOString().split('T')[0]
        : null;
      const createdAtStr = createdDate.toISOString().split('T')[0];

      let dayReach = 0;
      if (createdAtStr <= dateStr && (!expiresAt || expiresAt >= dateStr)) {
        // Estimate daily reach as proportional
        dayReach = Math.round(reachCount / totalDaysActive);
      }

      reachOverTime.push({ date: dateStr, reach: dayReach });
    }

    // ── Demographics breakdown ──────────────────────────────────────
    let demographics: {
      byCity: { city: string; count: number }[];
      byInterest: { interest: string; count: number }[];
      byAge: { range: string; count: number }[];
    } = { byCity: [], byInterest: [], byAge: [] };

    // Get visitor data specific to this promotion
    const visitors = db.prepare(`
      SELECT DISTINCT visitor_id FROM smart_link_visits
      WHERE post_id = ? AND visitor_id IS NOT NULL
    `).all(promoId) as any[];

    const visitorIds = visitors.map((v: any) => v.visitor_id).filter(Boolean);

    if (visitorIds.length > 0) {
      const placeholders = visitorIds.map(() => '?').join(',');

      // City breakdown
      demographics.byCity = (db.prepare(`
        SELECT location as city, COUNT(*) as count
        FROM users WHERE id IN (${placeholders}) AND location IS NOT NULL AND location != ''
        GROUP BY location ORDER BY count DESC LIMIT 10
      `).all(...visitorIds) as any[]).map(c => ({ city: c.city, count: c.count }));

      // Interest breakdown
      const interestUsers = db.prepare(`
        SELECT interests FROM users WHERE id IN (${placeholders}) AND interests IS NOT NULL AND interests != '[]'
      `).all(...visitorIds) as any[];

      const interestCounts: Record<string, number> = {};
      for (const user of interestUsers) {
        const interests: string[] = safeJsonParse(user.interests, []);
        for (const interest of interests) {
          const displayName = ARABIC_INTEREST_MAP[interest] || interest;
          interestCounts[displayName] = (interestCounts[displayName] || 0) + 1;
        }
      }
      demographics.byInterest = Object.entries(interestCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([interest, count]) => ({ interest, count }));

      // Age breakdown
      const ageUsers = db.prepare(`
        SELECT date_of_birth FROM users WHERE id IN (${placeholders}) AND date_of_birth IS NOT NULL AND date_of_birth != ''
      `).all(...visitorIds) as any[];

      const ageCounts: Record<string, number> = {};
      for (const user of ageUsers) {
        const age = calculateAge(user.date_of_birth);
        if (age > 0) {
          const range = ageToRange(age);
          ageCounts[range] = (ageCounts[range] || 0) + 1;
        }
      }
      const ageOrder = ['أقل من 18', '18-24', '25-34', '35-44', '45-54', '55+'];
      demographics.byAge = ageOrder
        .filter(range => ageCounts[range])
        .map(range => ({ range, count: ageCounts[range] }));
    }

    // ── Engagement metrics ───────────────────────────────────────────
    let engagementMetrics: any = {};

    if (promotionType === 'post') {
      engagementMetrics = {
        likes: promotion.likes || 0,
        comments: promotion.comments || 0,
        shares: promotion.shares || 0,
        saves: 0, // Posts don't have saves
        inquiries: 0, // Posts don't have inquiries
        clicks: promotion.click_count || 0,
      };
    } else {
      engagementMetrics = {
        likes: 0, // Market listings don't have likes
        comments: 0, // Market listings don't have comments
        shares: promotion.shares_count || 0,
        saves: promotion.saves_count || 0,
        inquiries: promotion.inquiries_count || 0,
        views: promotion.views_count || 0,
      };
    }

    // ── Cost analysis ────────────────────────────────────────────────
    const costPerImpression = reachCount > 0 && spending > 0
      ? Math.round((spending / reachCount) * 100) / 100
      : 0;
    const costPerEngagement = engagement > 0 && spending > 0
      ? Math.round((spending / engagement) * 100) / 100
      : 0;

    // ── Response ─────────────────────────────────────────────────────
    res.json({
      promotion: promotionDetails,
      reachOverTime,
      demographics,
      engagementMetrics,
      costAnalysis: {
        totalSpent: Math.round(spending),
        costPerImpression,
        costPerEngagement,
        estimatedReach,
        actualReach: reachCount,
        reachVsEstimated: estimatedReach > 0
          ? Math.round((reachCount / estimatedReach) * 100)
          : 0,
      },
    });
  } catch (err: any) {
    console.error('[SmartReach] Promotion analytics error:', err.message);
    res.status(500).json({ error: 'فشل جلب تحليلات الترويج', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════
//  3. GET /api/smart-reach/suggestions
//  AI-powered suggestions for improving reach based on past performance
// ═══════════════════════════════════════════════════════════════════════
router.get('/suggestions', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;

    // Auto-expire stale promotions
    autoExpirePromotions();

    // ── Gather historical data (including expired for accurate suggestions) ──
    const promotedPosts = getUserPromotedPosts(userId, true);
    const promotedListings = getUserPromotedListings(userId, true);
    const allPromotions = [
      ...promotedPosts.map((p: any) => ({ ...p, source_type: 'post' })),
      ...promotedListings.map((l: any) => ({ ...l, source_type: 'market' })),
    ];

    const postSpending = getPostPromotionSpending(userId);
    const marketSpending = getMarketPromotionSpending(userId);
    const allSpending = [...postSpending, ...marketSpending];
    const totalSpent = getTotalPromotionSpent(userId);

    // ── 1. Best performing tier ──────────────────────────────────────
    let bestTier: string | null = null;
    let bestTierAvgReach = 0;
    const tierStats: Record<string, { count: number; totalReach: number }> = {};

    for (const promo of allPromotions) {
      const tier = promo.tier || 'basic';
      if (!tierStats[tier]) {
        tierStats[tier] = { count: 0, totalReach: 0 };
      }
      tierStats[tier].count++;
      tierStats[tier].totalReach += promo.reach_count || 0;
    }

    for (const [tier, data] of Object.entries(tierStats)) {
      const avgReach = data.count > 0 ? data.totalReach / data.count : 0;
      if (avgReach > bestTierAvgReach) {
        bestTierAvgReach = avgReach;
        bestTier = tier;
      }
    }

    // If no promotions yet, recommend based on platform averages
    if (!bestTier) {
      bestTier = 'standard';
      bestTierAvgReach = 0;
    }

    const bestTierSuggestion = {
      tier: bestTier,
      tierName: TIER_NAMES_AR[bestTier] || bestTier,
      avgReach: Math.round(bestTierAvgReach),
      reason: allPromotions.length > 0
        ? `حققت باقة ${TIER_NAMES_AR[bestTier] || bestTier} أفضل متوسط وصول (${Math.round(bestTierAvgReach)} مشاهدة) مقارنة بالباقات الأخرى`
        : `نوصي بالبدء باقة ${TIER_NAMES_AR[bestTier] || bestTier} كخيار متوازن بين التكلفة والوصول`,
    };

    // ── 2. Recommended targeting ─────────────────────────────────────
    const demographics = buildDemographics(userId);

    // Find the most common city and interest among audience
    const topCity = demographics.byCity.length > 0 ? demographics.byCity[0].city : null;
    const topInterest = demographics.byInterest.length > 0 ? demographics.byInterest[0].interest : null;

    // Also check targeting effectiveness from past promotions
    const targetingStats: Record<string, { count: number; totalReach: number }> = {
      all: { count: 0, totalReach: 0 },
      city: { count: 0, totalReach: 0 },
      interests: { count: 0, totalReach: 0 },
    };

    for (const promo of allPromotions) {
      const targeting = promo.targeting || 'all';
      if (targetingStats[targeting]) {
        targetingStats[targeting].count++;
        targetingStats[targeting].totalReach += promo.reach_count || 0;
      }
    }

    let bestTargetingType = 'all';
    let bestTargetingAvgReach = 0;
    for (const [type, data] of Object.entries(targetingStats)) {
      const avg = data.count > 0 ? data.totalReach / data.count : 0;
      if (avg > bestTargetingAvgReach) {
        bestTargetingAvgReach = avg;
        bestTargetingType = type;
      }
    }

    const recommendedTargeting = {
      type: bestTargetingType,
      typeName: TARGETING_NAMES_AR[bestTargetingType] || bestTargetingType,
      suggestedCity: topCity || '',
      suggestedInterests: demographics.byInterest.slice(0, 5).map(i => i.interest),
      reason: allPromotions.length > 0
        ? topCity
          ? `أفضل أداء كان مع الاستهداف حسب المدينة (${topCity}). جمهورك يتركز في هذه المنطقة`
          : `الاستهداف العام يحقق أفضل وصول حالياً. يمكنك تجربة الاستهداف حسب الاهتمامات لتحسين الجودة`
        : 'ابدأ بالاستهداف العام للوصول لأكبر شريحة، ثم جرّب الاستهداف حسب المدينة أو الاهتمامات',
    };

    // ── 3. Optimal posting times ─────────────────────────────────────
    // Analyze which hours/days perform best based on engagement data
    const hourlyEngagement: Record<number, number> = {};
    const dailyEngagement: Record<number, number> = {};

    for (const promo of allPromotions) {
      if (promo.created_at) {
        const date = new Date(promo.created_at);
        const hour = date.getHours();
        const day = date.getDay();

        hourlyEngagement[hour] = (hourlyEngagement[hour] || 0) + (promo.reach_count || 0);
        dailyEngagement[day] = (dailyEngagement[day] || 0) + (promo.reach_count || 0);
      }
    }

    // Find peak hours (top 3)
    const peakHours = Object.entries(hourlyEngagement)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    // If no data, use platform defaults (evening hours are best for Egyptian audience)
    const defaultPeakHours = [20, 21, 19]; // 8 PM, 9 PM, 7 PM Cairo time
    const recommendedHours = peakHours.length > 0 ? peakHours : defaultPeakHours;

    const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const peakDays = Object.entries(dailyEngagement)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => parseInt(day));
    const defaultPeakDays = [4, 0, 5]; // Thursday, Sunday, Friday
    const recommendedDays = peakDays.length > 0 ? peakDays : defaultPeakDays;

    const optimalPostingTimes = {
      bestHours: recommendedHours.map(h => `${h}:00`),
      bestDays: recommendedDays.map(d => dayNamesAr[d]),
      reason: allPromotions.length > 0
        ? `بناءً على بياناتك، أفضل أوقات النشر هي ${recommendedHours.map(h => `الساعة ${h}:00`).join('، ')} في أيام ${recommendedDays.map(d => dayNamesAr[d]).join(' و')}`
        : 'أفضل أوقات النشر للجمهور المصري هي من 7 مساءً إلى 10 مساءً، خاصة أيام الخميس والأحد',
    };

    // ── 4. Budget recommendations ────────────────────────────────────
    const avgSpendPerPromotion = allSpending.length > 0
      ? totalSpent / allSpending.length
      : 0;

    const avgReachPerEGP = totalSpent > 0
      ? allPromotions.reduce((sum: number, p: any) => sum + (p.reach_count || 0), 0) / totalSpent
      : 0;

    // Recommend budget based on tier and desired reach
    const tierPrices: Record<string, { min: number; recommended: number; max: number }> = {
      basic: { min: 25, recommended: 50, max: 100 },
      standard: { min: 75, recommended: 150, max: 300 },
      premium: { min: 200, recommended: 400, max: 800 },
      vip: { min: 500, recommended: 1000, max: 2000 },
    };

    const recommendedBudget = tierPrices[bestTier] || tierPrices.standard;

    const budgetRecommendations = {
      currentAvgSpendPerPromotion: Math.round(avgSpendPerPromotion),
      estimatedReachPerEGP: Math.round(avgReachPerEGP * 10) / 10,
      recommended: {
        tier: bestTier,
        tierName: TIER_NAMES_AR[bestTier] || bestTier,
        minBudget: recommendedBudget.min,
        recommendedBudget: recommendedBudget.recommended,
        maxBudget: recommendedBudget.max,
        estimatedReachAtRecommended: Math.round(recommendedBudget.recommended * (avgReachPerEGP || 5)),
      },
      reason: allPromotions.length > 0
        ? `بناءً على أدائك الحالي، نوصي بميزانية ${recommendedBudget.recommended} ج.م للحصول على أفضل عائد على الاستثمار في باقة ${TIER_NAMES_AR[bestTier]}`
        : `نوصي بالبدء بميزانية ${recommendedBudget.recommended} ج.م في باقة ${TIER_NAMES_AR[bestTier]} لتحقيق توازن بين التكلفة والوصول`,
    };

    // ── 5. Additional tips ───────────────────────────────────────────
    const tips: { tip: string; priority: 'high' | 'medium' | 'low' }[] = [];

    // Tip: Add images if not doing so
    if (allPromotions.length > 0) {
      const postsWithoutImages = promotedPosts.filter((p: any) => !p.image || p.image === '');
      if (postsWithoutImages.length > promotedPosts.length * 0.5) {
        tips.push({
          tip: 'المنشورات بالصور تحصل على وصول أعلى بنسبة تصل إلى 150%. أضف صوراً جذابة لمنشوراتك المروّجة',
          priority: 'high',
        });
      }
    }

    // Tip: Try targeted promotions if only using 'all'
    const allTargetingCount = targetingStats.all?.count || 0;
    const targetedCount = (targetingStats.city?.count || 0) + (targetingStats.interests?.count || 0);
    if (allTargetingCount > 0 && targetedCount === 0) {
      tips.push({
        tip: 'جرّب الاستهداف حسب المدينة أو الاهتمامات للوصول لجمهور أكثر تفاعلاً مع محتواك',
        priority: 'medium',
      });
    }

    // Tip: Budget optimization
    if (avgSpendPerPromotion > 0 && avgSpendPerPromotion < recommendedBudget.recommended * 0.5) {
      tips.push({
        tip: `متوسط إنفاقك (${Math.round(avgSpendPerPromotion)} ج.م) أقل من الموصى به. زيادة الميزانية يمكن أن تحسّن الوصول بشكل كبير`,
        priority: 'medium',
      });
    }

    // Tip: Consistency
    if (allSpending.length < 3) {
      tips.push({
        tip: 'الاستمرارية مفتاح النجاح. روّج محتواك بانتظام لبناء جمهور مستقر ومتزايد',
        priority: 'low',
      });
    }

    // Tip: Market listings
    if (promotedPosts.length > 0 && promotedListings.length === 0) {
      tips.push({
        tip: 'جرّب ترويج إعلاناتك في السوق الذكي! إعلانات السوق تحقق تفاعلاً أعلى من المنشورات العادية',
        priority: 'medium',
      });
    }

    // ── Response ─────────────────────────────────────────────────────
    res.json({
      bestPerformingTier: bestTierSuggestion,
      recommendedTargeting,
      optimalPostingTimes,
      budgetRecommendations,
      tips,
      dataPoints: allPromotions.length,
    });
  } catch (err: any) {
    console.error('[SmartReach] Suggestions error:', err.message);
    res.status(500).json({ error: 'فشل جلب اقتراحات الوصول الذكي', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════
//  4. GET /api/smart-reach/compare
//  Compare performance across different targeting types and tiers
// ═══════════════════════════════════════════════════════════════════════
router.get('/compare', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;

    // Auto-expire stale promotions
    autoExpirePromotions();

    // ── Gather all data ──────────────────────────────────────────────
    const promotedPosts = getUserPromotedPosts(userId);
    const promotedListings = getUserPromotedListings(userId);
    const allPromotions = [
      ...promotedPosts.map((p: any) => ({ ...p, source_type: 'post' })),
      ...promotedListings.map((l: any) => ({ ...l, source_type: 'market' })),
    ];

    const postSpending = getPostPromotionSpending(userId);
    const marketSpending = getMarketPromotionSpending(userId);
    const allSpending = [...postSpending, ...marketSpending];

    // Build a map from promo id → spending
    const spendingMap: Record<string, number> = {};
    for (const s of allSpending) {
      const promoId = s.post_id || s.listing_id;
      if (promoId) {
        spendingMap[promoId] = (spendingMap[promoId] || 0) + (s.price || 0);
      }
    }

    // ── Compare by tier ──────────────────────────────────────────────
    const tierComparison: Record<string, {
      count: number;
      totalReach: number;
      avgReach: number;
      totalEngagement: number;
      avgEngagement: number;
      totalSpent: number;
      avgSpent: number;
      reachPerEGP: number;
    }> = {};

    for (const promo of allPromotions) {
      const tier = promo.tier || 'basic';
      if (!tierComparison[tier]) {
        tierComparison[tier] = {
          count: 0, totalReach: 0, avgReach: 0,
          totalEngagement: 0, avgEngagement: 0,
          totalSpent: 0, avgSpent: 0, reachPerEGP: 0,
        };
      }
      tierComparison[tier].count++;
      tierComparison[tier].totalReach += promo.reach_count || 0;
      tierComparison[tier].totalEngagement += promo.total_engagement || 0;
    }

    // Add spending data
    for (const s of allSpending) {
      const tier = s.tier || 'basic';
      if (tierComparison[tier]) {
        tierComparison[tier].totalSpent += s.price || 0;
      }
    }

    // Calculate averages
    const tierComparisonResult = Object.entries(tierComparison).map(([tier, data]) => ({
      tier: TIER_NAMES_AR[tier] || tier,
      tierRaw: tier,
      count: data.count,
      totalReach: data.totalReach,
      avgReach: data.count > 0 ? Math.round(data.totalReach / data.count) : 0,
      totalEngagement: data.totalEngagement,
      avgEngagement: data.count > 0 ? Math.round(data.totalEngagement / data.count) : 0,
      totalSpent: Math.round(data.totalSpent),
      avgSpent: data.count > 0 ? Math.round(data.totalSpent / data.count) : 0,
      reachPerEGP: data.totalSpent > 0 ? Math.round((data.totalReach / data.totalSpent) * 100) / 100 : 0,
    })).sort((a, b) => (TIER_ORDER[b.tierRaw] || 0) - (TIER_ORDER[a.tierRaw] || 0));

    // ── Compare by targeting type ────────────────────────────────────
    const targetingComparison: Record<string, {
      count: number;
      totalReach: number;
      avgReach: number;
      totalEngagement: number;
      avgEngagement: number;
    }> = {};

    for (const promo of allPromotions) {
      const targeting = promo.targeting || 'all';
      if (!targetingComparison[targeting]) {
        targetingComparison[targeting] = {
          count: 0, totalReach: 0, avgReach: 0,
          totalEngagement: 0, avgEngagement: 0,
        };
      }
      targetingComparison[targeting].count++;
      targetingComparison[targeting].totalReach += promo.reach_count || 0;
      targetingComparison[targeting].totalEngagement += promo.total_engagement || 0;
    }

    const targetingComparisonResult = Object.entries(targetingComparison).map(([type, data]) => ({
      type,
      typeName: TARGETING_NAMES_AR[type] || type,
      count: data.count,
      totalReach: data.totalReach,
      avgReach: data.count > 0 ? Math.round(data.totalReach / data.count) : 0,
      totalEngagement: data.totalEngagement,
      avgEngagement: data.count > 0 ? Math.round(data.totalEngagement / data.count) : 0,
    }));

    // ── Compare by content type (post vs market) ─────────────────────
    const contentTypeComparison = {
      post: {
        count: promotedPosts.length,
        totalReach: promotedPosts.reduce((sum: number, p: any) => sum + (p.reach_count || 0), 0),
        avgReach: promotedPosts.length > 0
          ? Math.round(promotedPosts.reduce((sum: number, p: any) => sum + (p.reach_count || 0), 0) / promotedPosts.length)
          : 0,
        totalEngagement: promotedPosts.reduce((sum: number, p: any) => sum + (p.total_engagement || 0), 0),
        avgEngagement: promotedPosts.length > 0
          ? Math.round(promotedPosts.reduce((sum: number, p: any) => sum + (p.total_engagement || 0), 0) / promotedPosts.length)
          : 0,
      },
      market: {
        count: promotedListings.length,
        totalReach: promotedListings.reduce((sum: number, l: any) => sum + (l.reach_count || 0), 0),
        avgReach: promotedListings.length > 0
          ? Math.round(promotedListings.reduce((sum: number, l: any) => sum + (l.reach_count || 0), 0) / promotedListings.length)
          : 0,
        totalEngagement: promotedListings.reduce((sum: number, l: any) => sum + (l.total_engagement || 0), 0),
        avgEngagement: promotedListings.length > 0
          ? Math.round(promotedListings.reduce((sum: number, l: any) => sum + (l.total_engagement || 0), 0) / promotedListings.length)
          : 0,
      },
    };

    // ── Cross-comparison: tier × targeting ───────────────────────────
    const crossComparison: Record<string, Record<string, { count: number; avgReach: number }>> = {};

    for (const promo of allPromotions) {
      const tier = promo.tier || 'basic';
      const targeting = promo.targeting || 'all';

      if (!crossComparison[tier]) crossComparison[tier] = {};
      if (!crossComparison[tier][targeting]) {
        crossComparison[tier][targeting] = { count: 0, avgReach: 0 };
      }

      crossComparison[tier][targeting].count++;
      crossComparison[tier][targeting].avgReach += promo.reach_count || 0;
    }

    // Calculate averages for cross-comparison
    const crossComparisonResult = Object.entries(crossComparison).map(([tier, targetingData]) => ({
      tier: TIER_NAMES_AR[tier] || tier,
      tierRaw: tier,
      targeting: Object.entries(targetingData).map(([targeting, data]) => ({
        type: targeting,
        typeName: TARGETING_NAMES_AR[targeting] || targeting,
        count: data.count,
        avgReach: data.count > 0 ? Math.round(data.avgReach / data.count) : 0,
      })),
    })).sort((a, b) => (TIER_ORDER[b.tierRaw] || 0) - (TIER_ORDER[a.tierRaw] || 0));

    // ── Response ─────────────────────────────────────────────────────
    res.json({
      tierComparison: tierComparisonResult,
      targetingComparison: targetingComparisonResult,
      contentTypeComparison,
      crossComparison: crossComparisonResult,
      summary: {
        totalPromotions: allPromotions.length,
        bestTier: tierComparisonResult.length > 0
          ? tierComparisonResult.reduce((best, curr) =>
              curr.avgReach > best.avgReach ? curr : best
            ).tier
          : null,
        bestTargeting: targetingComparisonResult.length > 0
          ? targetingComparisonResult.reduce((best, curr) =>
              curr.avgReach > best.avgReach ? curr : best
            ).typeName
          : null,
        bestContentType: contentTypeComparison.post.avgReach > contentTypeComparison.market.avgReach
          ? 'منشورات'
          : contentTypeComparison.market.count > 0 ? 'إعلانات السوق' : 'لا توجد بيانات كافية',
      },
    });
  } catch (err: any) {
    console.error('[SmartReach] Compare error:', err.message);
    res.status(500).json({ error: 'فشل جلب مقارنة الأداء', details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════
//  5. GET /api/smart-reach/realtime
//  Real-time stats: currently active promotions with live reach counters
// ═══════════════════════════════════════════════════════════════════════
router.get('/realtime', authMiddleware, (req: Request, res: Response) => {
  try {
    const payload = (req as any).user as JwtPayload;
    const userId = payload.userId;

    // Auto-expire stale promotions
    autoExpirePromotions();

    // ── Active promoted posts ────────────────────────────────────────
    const activePostPromotions = db.prepare(`
      SELECT
        p.id,
        p.content as title,
        p.promotion_tier as tier,
        p.reach_count,
        p.click_count,
        (COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.shares, 0)) as total_engagement,
        p.promotion_started_at as startedAt,
        p.promotion_expires_at as expiresAt,
        p.targeting,
        p.target_city,
        p.target_interests,
        p.estimated_reach,
        p.created_at,
        'post' as source_type,
        u.name as author_name,
        u.avatar as author_avatar
      FROM posts p
      LEFT JOIN users u ON u.id = p.author_id
      WHERE p.author_id = ? AND p.is_promoted = 1 AND p.promotion_status = 'approved'
        AND p.status = 'active'
        AND (p.promotion_expires_at IS NULL OR p.promotion_expires_at >= datetime('now'))
      ORDER BY p.promotion_tier = 'vip' DESC, p.promotion_tier = 'premium' DESC,
               p.promotion_tier = 'standard' DESC, p.promotion_tier = 'basic' DESC,
               p.reach_count DESC
    `).all(userId) as any[];

    // ── Active promoted market listings ──────────────────────────────
    const activeMarketPromotions = db.prepare(`
      SELECT
        ml.id,
        ml.title,
        ml.promotion_tier as tier,
        ml.reach_count,
        ml.views_count,
        ml.saves_count,
        ml.inquiries_count,
        ml.shares_count,
        (COALESCE(ml.saves_count, 0) + COALESCE(ml.inquiries_count, 0) + COALESCE(ml.shares_count, 0)) as total_engagement,
        ml.promotion_started_at as startedAt,
        ml.promotion_expires_at as expiresAt,
        ml.targeting,
        ml.target_city,
        ml.target_interests,
        ml.estimated_reach,
        ml.created_at,
        'market' as source_type,
        u.name as author_name,
        u.avatar as author_avatar
      FROM market_listings ml
      LEFT JOIN users u ON u.id = ml.seller_id
      WHERE ml.seller_id = ? AND ml.is_promoted = 1 AND ml.promotion_status = 'approved'
        AND ml.status = 'active'
        AND (ml.promotion_expires_at IS NULL OR ml.promotion_expires_at >= datetime('now'))
      ORDER BY ml.promotion_tier = 'vip' DESC, ml.promotion_tier = 'premium' DESC,
               ml.promotion_tier = 'standard' DESC, ml.promotion_tier = 'basic' DESC,
               ml.reach_count DESC
    `).all(userId) as any[];

    // ── Format real-time data ────────────────────────────────────────
    const formatPromotion = (promo: any) => {
      const expiresAt = promo.expiresAt ? new Date(promo.expiresAt) : null;
      const now = new Date();
      const timeRemaining = expiresAt ? Math.max(0, expiresAt.getTime() - now.getTime()) : null;

      let remainingStr = 'نشط';
      if (timeRemaining !== null) {
        const hours = Math.floor(timeRemaining / 3600000);
        const minutes = Math.floor((timeRemaining % 3600000) / 60000);
        if (hours > 24) {
          remainingStr = `${Math.floor(hours / 24)} يوم ${hours % 24} ساعة`;
        } else if (hours > 0) {
          remainingStr = `${hours} ساعة ${minutes} دقيقة`;
        } else {
          remainingStr = `${minutes} دقيقة`;
        }
      }

      // Calculate progress toward estimated reach
      const estimatedReach = promo.estimated_reach || 0;
      const reachProgress = estimatedReach > 0
        ? Math.min(100, Math.round(((promo.reach_count || 0) / estimatedReach) * 100))
        : 0;

      return {
        id: promo.id,
        type: promo.source_type,
        title: promo.source_type === 'post'
          ? (promo.title?.substring(0, 80) || 'منشور بدون محتوى')
          : (promo.title || 'إعلان بدون عنوان'),
        tier: TIER_NAMES_AR[promo.tier] || promo.tier,
        tierRaw: promo.tier,
        reachCount: promo.reach_count || 0,
        engagement: promo.total_engagement || 0,
        estimatedReach,
        reachProgress,
        targeting: TARGETING_NAMES_AR[promo.targeting] || promo.targeting,
        targetCity: promo.target_city || '',
        targetInterests: safeJsonParse<string[]>(promo.target_interests, []),
        startedAt: promo.startedAt || promo.created_at,
        expiresAt: promo.expiresAt,
        timeRemaining: remainingStr,
        isExpired: timeRemaining !== null && timeRemaining <= 0,
        authorName: promo.author_name || '',
        authorAvatar: promo.author_avatar || '',
        // Market-specific fields
        ...(promo.source_type === 'market' ? {
          viewsCount: promo.views_count || 0,
          savesCount: promo.saves_count || 0,
          inquiriesCount: promo.inquiries_count || 0,
        } : {
          clickCount: promo.click_count || 0,
        }),
      };
    };

    const activePromotions = [
      ...activePostPromotions.map(formatPromotion),
      ...activeMarketPromotions.map(formatPromotion),
    ].sort((a, b) => (TIER_ORDER[b.tierRaw] || 0) - (TIER_ORDER[a.tierRaw] || 0));

    // ── Aggregate real-time counters ─────────────────────────────────
    const totalActiveReach = activePromotions.reduce((sum, p) => sum + p.reachCount, 0);
    const totalActiveEngagement = activePromotions.reduce((sum, p) => sum + p.engagement, 0);

    // ── Recently expired promotions (last 24 hours) ─────────────────
    const recentlyExpiredPosts = db.prepare(`
      SELECT id, content as title, reach_count, promotion_tier as tier,
             promotion_expires_at, 'post' as source_type
      FROM posts
      WHERE author_id = ? AND promotion_status = 'expired'
        AND promotion_expires_at >= datetime('now', '-1 day')
        AND status = 'active'
    `).all(userId) as any[];

    const recentlyExpiredListings = db.prepare(`
      SELECT id, title, reach_count, promotion_tier as tier,
             promotion_expires_at, 'market' as source_type
      FROM market_listings
      WHERE seller_id = ? AND promotion_status = 'expired'
        AND promotion_expires_at >= datetime('now', '-1 day')
        AND status = 'active'
    `).all(userId) as any[];

    const recentlyExpired = [
      ...recentlyExpiredPosts.map((p: any) => ({
        id: p.id,
        type: p.source_type,
        title: p.source_type === 'post'
          ? (p.title?.substring(0, 80) || 'منشور')
          : (p.title || 'إعلان'),
        tier: TIER_NAMES_AR[p.tier] || p.tier,
        finalReach: p.reach_count || 0,
        expiredAt: p.promotion_expires_at,
      })),
      ...recentlyExpiredListings.map((l: any) => ({
        id: l.id,
        type: l.source_type,
        title: l.title || 'إعلان',
        tier: TIER_NAMES_AR[l.tier] || l.tier,
        finalReach: l.reach_count || 0,
        expiredAt: l.promotion_expires_at,
      })),
    ];

    // ── Response ─────────────────────────────────────────────────────
    res.json({
      activePromotions,
      recentlyExpired,
      aggregate: {
        totalActive: activePromotions.length,
        totalActiveReach,
        totalActiveEngagement,
        avgReachPerPromotion: activePromotions.length > 0
          ? Math.round(totalActiveReach / activePromotions.length)
          : 0,
        avgEngagementPerPromotion: activePromotions.length > 0
          ? Math.round(totalActiveEngagement / activePromotions.length)
          : 0,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[SmartReach] Realtime error:', err.message);
    res.status(500).json({ error: 'فشل جلب البيانات المباشرة', details: err.message });
  }
});


export default router;
