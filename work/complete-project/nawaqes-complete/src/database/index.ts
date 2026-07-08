// ─── Database Setup (better-sqlite3 + SQLite) ────────────────────────
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';

// Use /data (HF Spaces persistent volume) when available, fallback to ./data for local dev
const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(PERSISTENT_DIR, 'nawaqes.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

console.log(`[DB] Database path: ${DB_PATH}`);
console.log(`[DB] Using persistent storage: ${PERSISTENT_DIR === '/data'}`);

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// ─── SQLite concurrency & durability tuning (fixes HIGH H1) ───────────
// busy_timeout: wait up to 5s instead of throwing SQLITE_BUSY immediately
db.pragma('busy_timeout = 5000');
// synchronous=NORMAL is safe under WAL and avoids an fsync per commit
db.pragma('synchronous = NORMAL');
// Auto-checkpoint WAL every 1000 pages (default), helps avoid WAL growth
db.pragma('wal_autocheckpoint = 1000');
// Larger cache reduces disk I/O for hot reads
db.pragma('cache_size = -64000'); // ~64MB

// ─── Schema Initialization ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    avatar_base64 TEXT,
    is_verified INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    is_trusted INTEGER DEFAULT 0,
    is_deactivated INTEGER DEFAULT 0,
    wallet_balance REAL DEFAULT 0,
    trust_score INTEGER DEFAULT 50,
    show_phone INTEGER DEFAULT 0,
    show_location INTEGER DEFAULT 1,
    gender TEXT DEFAULT 'male',
    phone TEXT NOT NULL DEFAULT '',
    date_of_birth TEXT DEFAULT '',
    location TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    cover_photo TEXT DEFAULT '',
    interests TEXT DEFAULT '[]',
    payment_methods TEXT DEFAULT '[]',
    join_date TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    type TEXT DEFAULT 'ad',
    price REAL,
    currency TEXT DEFAULT 'ج.م',
    location TEXT DEFAULT '',
    payment_methods TEXT DEFAULT '[]',
    is_boosted INTEGER DEFAULT 0,
    is_promoted INTEGER DEFAULT 0,
    promotion_tier TEXT,
    promotion_status TEXT,
    promotion_package TEXT,
    promotion_started_at TEXT,
    promotion_expires_at TEXT,
    reach_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    estimated_reach INTEGER,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    category TEXT DEFAULT '',
    feeling TEXT DEFAULT '',
    activity TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS post_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_avatar TEXT DEFAULT '',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sender_id TEXT NOT NULL REFERENCES users(id),
    receiver_id TEXT REFERENCES users(id),
    text TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    post_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    image TEXT DEFAULT '',
    type TEXT DEFAULT 'image',
    text TEXT DEFAULT '',
    background_color TEXT DEFAULT '',
    is_seen INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT DEFAULT 'system',
    message TEXT NOT NULL,
    post_id TEXT,
    user_id_ref TEXT,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promotion_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL,
    post_content TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id),
    author_name TEXT NOT NULL,
    author_avatar TEXT DEFAULT '',
    tier TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    package_name TEXT,
    duration INTEGER,
    estimated_reach INTEGER,
    max_notifications INTEGER,
    include_messages INTEGER DEFAULT 0,
    targeting TEXT,
    target_city TEXT DEFAULT '',
    target_interests TEXT DEFAULT '[]',
    notifications_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS charging_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    user_name TEXT NOT NULL,
    user_avatar TEXT DEFAULT '',
    user_phone TEXT DEFAULT '',
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    receipt_image TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    requester_id TEXT NOT NULL REFERENCES users(id),
    addressee_id TEXT NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    sort INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS news_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    is_alert INTEGER DEFAULT 0,
    category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_alerts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    title TEXT NOT NULL,
    content TEXT,
    source TEXT DEFAULT 'إدارة نواقص',
    priority TEXT DEFAULT 'medium',
    target_audience TEXT DEFAULT 'all',
    is_active INTEGER DEFAULT 1,
    start_at TEXT,
    expires_at TEXT,
    display_duration INTEGER DEFAULT 5000,
    action_label TEXT,
    action_url TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_alerts_active ON admin_alerts(is_active, start_at, expires_at);

  CREATE TABLE IF NOT EXISTS market_trends (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    item TEXT NOT NULL,
    trend TEXT DEFAULT 'stable',
    change TEXT DEFAULT '0%',
    category TEXT DEFAULT '',
    price REAL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ad_videos (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    video_url TEXT NOT NULL,
    thumbnail_url TEXT DEFAULT '',
    duration INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS video_interactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    video_id TEXT NOT NULL REFERENCES ad_videos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    interaction_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(video_id, user_id, interaction_type)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);
  CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
  CREATE INDEX IF NOT EXISTS idx_chat_sender ON chat_messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_videos_post ON ad_videos(post_id);
  CREATE INDEX IF NOT EXISTS idx_ad_videos_user ON ad_videos(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_videos_status ON ad_videos(status);
  CREATE INDEX IF NOT EXISTS idx_video_interactions_video ON video_interactions(video_id);
  CREATE INDEX IF NOT EXISTS idx_video_interactions_user ON video_interactions(user_id);

  CREATE TABLE IF NOT EXISTS video_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    video_id TEXT NOT NULL REFERENCES ad_videos(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
  CREATE INDEX IF NOT EXISTS idx_video_comments_user ON video_comments(user_id);

  CREATE TABLE IF NOT EXISTS share_events (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    platform TEXT NOT NULL,
    shared_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_share_events_post ON share_events(post_id);
  CREATE INDEX IF NOT EXISTS idx_share_events_user ON share_events(user_id);

  CREATE TABLE IF NOT EXISTS smart_link_visits (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    visitor_id TEXT,
    visitor_ip TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    referrer TEXT DEFAULT '',
    visited_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_smart_link_visits_post ON smart_link_visits(post_id);

  CREATE TABLE IF NOT EXISTS cities_lookup (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'delta',
    population REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS market_listings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    seller_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    images TEXT DEFAULT '[]',
    price REAL,
    currency TEXT DEFAULT 'ج.م',
    category TEXT DEFAULT '',
    subcategory TEXT DEFAULT '',
    condition TEXT DEFAULT 'used',
    location TEXT DEFAULT '',
    city TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    payment_methods TEXT DEFAULT '[]',
    is_featured INTEGER DEFAULT 0,
    is_promoted INTEGER DEFAULT 0,
    promotion_tier TEXT,
    promotion_status TEXT,
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

  CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
  CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings(category);
  CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
  CREATE INDEX IF NOT EXISTS idx_market_listings_promoted ON market_listings(is_promoted);
  CREATE INDEX IF NOT EXISTS idx_market_listings_city ON market_listings(city);
  CREATE INDEX IF NOT EXISTS idx_market_listings_featured ON market_listings(is_featured);
  CREATE INDEX IF NOT EXISTS idx_market_listings_price ON market_listings(price);
  CREATE INDEX IF NOT EXISTS idx_market_listings_condition ON market_listings(condition);

  CREATE TABLE IF NOT EXISTS market_listing_saves (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    listing_id TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, listing_id)
  );
  CREATE INDEX IF NOT EXISTS idx_market_saves_user ON market_listing_saves(user_id);
  CREATE INDEX IF NOT EXISTS idx_market_saves_listing ON market_listing_saves(listing_id);

  CREATE TABLE IF NOT EXISTS market_promotion_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    listing_id TEXT NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
    seller_id TEXT NOT NULL REFERENCES users(id),
    listing_title TEXT NOT NULL,
    tier TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    package_name TEXT,
    duration INTEGER,
    estimated_reach INTEGER,
    targeting TEXT DEFAULT 'all',
    target_city TEXT DEFAULT '',
    target_interests TEXT DEFAULT '[]',
    target_age_min INTEGER DEFAULT 0,
    target_age_max INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_market_promo_listing ON market_promotion_requests(listing_id);
  CREATE INDEX IF NOT EXISTS idx_market_promo_seller ON market_promotion_requests(seller_id);
  CREATE INDEX IF NOT EXISTS idx_market_promo_status ON market_promotion_requests(status);

  CREATE TABLE IF NOT EXISTS post_views (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT,
    visitor_ip TEXT DEFAULT '',
    viewed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
  CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id);
`);

// Add video_url column to posts if missing
try {
  db.prepare('ALTER TABLE posts ADD COLUMN video_url TEXT DEFAULT ""').run();
} catch { /* column already exists */ }

// ─── Chat Messages table migrations ─────────────────────────────────
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN message_type TEXT DEFAULT 'text'").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN image_url TEXT DEFAULT ''").run(); } catch { /* column already exists */ }
try { db.prepare('ALTER TABLE chat_messages ADD COLUMN reply_to_id TEXT').run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN reactions TEXT DEFAULT '{}'").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN deleted_for TEXT DEFAULT ''").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN is_edited INTEGER DEFAULT 0").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN is_pinned INTEGER DEFAULT 0").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN delivered INTEGER DEFAULT 0").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN voice_url TEXT DEFAULT ''").run(); } catch { /* column already exists */ }
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN voice_duration REAL DEFAULT 0").run(); } catch { /* column already exists */ }

// ─── Post Comments Migrations ──────────────────────────────────────
// Add new columns for threaded comments, likes, images, and timestamps
const commentMigrations: [string, string][] = [
  ['parent_id', "TEXT DEFAULT ''"],
  ['likes', 'INTEGER DEFAULT 0'],
  ['image_url', "TEXT DEFAULT ''"],
  ['updated_at', "TEXT DEFAULT ''"],
];
for (const [col, def] of commentMigrations) {
  try { db.prepare(`ALTER TABLE post_comments ADD COLUMN ${col} ${def}`).run(); } catch { /* already exists */ }
}

// Create comment_likes table for toggling likes on comments
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_likes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      comment_id TEXT NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(comment_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
    CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id);
  `);
} catch { /* table or index already exists */ }

// Create post_likes table for toggling likes on posts (prevents double-liking)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_id);
  `);
} catch { /* table or index already exists */ }

// Add post_views table for unique view tracking (migration for existing databases)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_views (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT,
      visitor_ip TEXT DEFAULT '',
      viewed_at TEXT DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_views_user ON post_views(user_id);
  `);
} catch { /* table or index already exists */ }

// ─── Promotion Engagement Tracking Table ─────────────────────────────
// Tracks how users interact with promoted posts at specific positions
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_engagement (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      feed_position INTEGER NOT NULL DEFAULT 0,
      feed_type TEXT NOT NULL DEFAULT 'home',
      action TEXT NOT NULL DEFAULT 'impression',
      time_on_screen REAL DEFAULT 0,
      scroll_depth REAL DEFAULT 0,
      session_id TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_post ON promotion_engagement(post_id);
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_user ON promotion_engagement(user_id);
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_action ON promotion_engagement(action);
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_feed_type ON promotion_engagement(feed_type);
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_position ON promotion_engagement(feed_position);
    CREATE INDEX IF NOT EXISTS idx_promo_engagement_created ON promotion_engagement(created_at);
  `);
} catch { /* table or index already exists */ }

// ─── AI Placement Strategy Cache Table ──────────────────────────────
// Caches AI-generated placement strategies to avoid repeated AI calls
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_placement_cache (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      cache_key TEXT NOT NULL UNIQUE,
      strategy TEXT NOT NULL,
      feed_type TEXT NOT NULL DEFAULT 'home',
      user_id TEXT,
      hit_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_placement_key ON ai_placement_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_ai_placement_expires ON ai_placement_cache(expires_at);
  `);
} catch { /* table or index already exists */ }

// ─── Data Migrations ──────────────────────────────────────────────────
// Add missing columns to existing databases (safe ALTER TABLE for each new column)

// Users table migrations
const userMigrations: [string, string][] = [
  ['avatar_base64', 'TEXT'],
  ['is_deactivated', 'INTEGER DEFAULT 0'],
  ['bio', "TEXT DEFAULT ''"],
  ['cover_photo', "TEXT DEFAULT ''"],
  ['trust_score', 'INTEGER DEFAULT 50'],
  ['show_phone', 'INTEGER DEFAULT 0'],
  ['show_location', 'INTEGER DEFAULT 1'],
  ['phone', "TEXT DEFAULT ''"],
  ['location', "TEXT DEFAULT ''"],
  ['interests', "TEXT DEFAULT '[]'"],
  ['payment_methods', "TEXT DEFAULT '[]'"],
  ['wallet_balance', 'REAL DEFAULT 0'],
  ['is_verified', 'INTEGER DEFAULT 0'],
  ['is_admin', 'INTEGER DEFAULT 0'],
  ['is_trusted', 'INTEGER DEFAULT 0'],
  ['gender', "TEXT DEFAULT 'male'"],
  ['date_of_birth', "TEXT DEFAULT ''"],
  ['join_date', "TEXT DEFAULT (datetime('now'))"],
  ['last_seen_at', "TEXT DEFAULT (datetime('now'))"],
];
for (const [col, def] of userMigrations) {
  try { db.prepare(`ALTER TABLE users ADD COLUMN ${col} ${def}`).run(); } catch { /* already exists */ }
}

// Posts table migrations
const postMigrations: [string, string][] = [
  ['promotion_tier', 'TEXT'],
  ['promotion_status', 'TEXT'],
  ['promotion_package', 'TEXT'],
  ['promotion_started_at', 'TEXT'],
  ['promotion_expires_at', 'TEXT'],
  ['estimated_reach', 'INTEGER'],
  ['reach_count', 'INTEGER DEFAULT 0'],
  ['shares', 'INTEGER DEFAULT 0'],
  ['category', "TEXT DEFAULT ''"],
  ['feeling', "TEXT DEFAULT ''"],
  ['activity', "TEXT DEFAULT ''"],
  ['currency', "TEXT DEFAULT 'ج.م'"],
  ['payment_methods', "TEXT DEFAULT '[]'"],
  ['is_boosted', 'INTEGER DEFAULT 0'],
  ['is_promoted', 'INTEGER DEFAULT 0'],
  ['click_count', 'INTEGER DEFAULT 0'],
  ['smart_link_alias', "TEXT DEFAULT ''"],
  ['target_city', "TEXT DEFAULT ''"],
  ['target_interests', "TEXT DEFAULT '[]'"],
  ['targeting', "TEXT DEFAULT 'all'"],
  ['target_age_min', 'INTEGER DEFAULT 0'],
  ['target_age_max', 'INTEGER DEFAULT 0'],
];
for (const [col, def] of postMigrations) {
  try { db.prepare(`ALTER TABLE posts ADD COLUMN ${col} ${def}`).run(); } catch { /* already exists */ }
}

// ─── Food-specific fields on posts ──────────────────────────────────
// Used by the "هتاكل" food marketplace. These are only meaningful when
// posts.type='food', but we store them on every post row (NULL for non-
// food posts) to avoid a separate food_items table.
//   - delivery_available: 1/0 — does this restaurant/dish offer delivery?
//   - delivery_fee: REAL — cost of delivery in EGP
//   - working_hours: TEXT — human-readable hours, e.g. "10:00 - 23:00"
//   - prep_time: TEXT — human-readable prep time, e.g. "20-30 دقيقة"
//   - contact_phone: TEXT — phone for reservations/orders (distinct from sender_phone which is for support tickets)
try { db.prepare("ALTER TABLE posts ADD COLUMN delivery_available INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE posts ADD COLUMN delivery_fee REAL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE posts ADD COLUMN working_hours TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE posts ADD COLUMN prep_time TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE posts ADD COLUMN contact_phone TEXT DEFAULT ''").run(); } catch {}

// Add target_city and target_interests columns to promotion_requests if missing
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN target_city TEXT DEFAULT ""').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN target_interests TEXT DEFAULT "[]"').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN notifications_sent INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN target_age_min INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN target_age_max INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE promotion_requests ADD COLUMN city_count INTEGER DEFAULT 1').run();
} catch { /* column already exists */ }

// Add receipt_image column to charging_requests if missing
try {
  db.prepare('ALTER TABLE charging_requests ADD COLUMN receipt_image TEXT DEFAULT ""').run();
} catch { /* column already exists */ }

// Add user_phone column to charging_requests if missing
try {
  db.prepare('ALTER TABLE charging_requests ADD COLUMN user_phone TEXT DEFAULT ""').run();
} catch { /* column already exists */ }

// Add sender_phone column to posts if missing (for support tickets and complaints)
try {
  db.prepare('ALTER TABLE posts ADD COLUMN sender_phone TEXT DEFAULT ""').run();
} catch { /* column already exists */ }

// Add additional_phone column to charging_requests if missing (for alternative sender phone)
try {
  db.prepare('ALTER TABLE charging_requests ADD COLUMN additional_phone TEXT DEFAULT ""').run();
} catch { /* column already exists */ }

// Add UNIQUE index on phone for non-empty values (SQLite doesn't support ALTER TABLE ADD CONSTRAINT)
try {
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone != \'\'').run();
} catch { /* index already exists */ }

// News items table migrations - add category column
try {
  db.prepare("ALTER TABLE news_items ADD COLUMN category TEXT DEFAULT 'general'").run();
} catch { /* column already exists */ }

// Notifications table migrations - add user_id_ref and link columns
try {
  db.prepare('ALTER TABLE notifications ADD COLUMN user_id_ref TEXT').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE notifications ADD COLUMN link TEXT').run();
} catch { /* column already exists */ }

// Ensure friendships table exists (for databases created before it was added)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      requester_id TEXT NOT NULL REFERENCES users(id),
      addressee_id TEXT NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(requester_id, addressee_id)
    )
  `);
} catch { /* table already exists */ }

// Ensure friendship indexes exist
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
  `);
} catch { /* index already exists */ }

// Add status column to friendships if missing (for older databases)
try {
  db.prepare("ALTER TABLE friendships ADD COLUMN status TEXT DEFAULT 'pending'").run();
} catch { /* column already exists */ }

// Add created_at column to friendships if missing
try {
  db.prepare("ALTER TABLE friendships ADD COLUMN created_at TEXT DEFAULT (datetime('now'))").run();
} catch { /* column already exists */ }

// Add friend_label column to friendships for categorizing friends
try {
  db.prepare("ALTER TABLE friendships ADD COLUMN friend_label TEXT DEFAULT 'general'").run();
} catch { /* column already exists */ }

// ─── Blocked Users Table ─────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocked_users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      blocker_id TEXT NOT NULL REFERENCES users(id),
      blocked_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(blocker_id, blocked_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked_blocker ON blocked_users(blocker_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id)`);
} catch { /* table already exists */ }

// Fix existing posts that have promotion_status='pending' but no promotion_tier
// (i.e., they were created before the schema fix and never actually requested promotion)
db.prepare("UPDATE posts SET promotion_status = NULL WHERE promotion_status = 'pending' AND promotion_tier IS NULL").run();
// Fix any posts that have promotion_status set but no corresponding promotion request
db.prepare("UPDATE posts SET promotion_status = NULL, is_promoted = 0 WHERE promotion_status IS NOT NULL AND promotion_status != 'approved' AND promotion_status != 'rejected' AND id NOT IN (SELECT post_id FROM promotion_requests)").run();
// Fix any posts with stale promotion_status='pending' from Prisma's default
db.prepare("UPDATE posts SET promotion_status = NULL WHERE promotion_status = 'pending' AND promotion_tier IS NULL").run();

// ─── Data Integrity Checks ──────────────────────────────────────────
// Fix any posts with missing or corrupted author_id (references non-existent user)
try {
  const orphanPosts = db.prepare(`
    SELECT p.id FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE u.id IS NULL AND p.author_id IS NOT NULL
  `).all() as any[];
  if (orphanPosts.length > 0) {
    console.log(`[DB] Found ${orphanPosts.length} orphan posts with missing authors, marking as deleted`);
    const markDeleted = db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?");
    for (const p of orphanPosts) {
      markDeleted.run(p.id);
    }
  }
} catch (err: any) {
  console.log('[DB] Orphan post check skipped:', err.message);
}

// Fix any posts with corrupted payment_methods JSON
try {
  const allPosts = db.prepare('SELECT id, payment_methods FROM posts WHERE status = ?').all('active') as any[];
  let fixedCount = 0;
  const fixPayment = db.prepare("UPDATE posts SET payment_methods = '[]' WHERE id = ?");
  for (const post of allPosts) {
    try {
      const parsed = JSON.parse(post.payment_methods || '[]');
      if (!Array.isArray(parsed)) throw new Error('not array');
    } catch {
      fixPayment.run(post.id);
      fixedCount++;
    }
  }
  if (fixedCount > 0) {
    console.log(`[DB] Fixed ${fixedCount} posts with corrupted payment_methods`);
  }
} catch (err: any) {
  console.log('[DB] Payment methods check skipped:', err.message);
}

// Fix any users with corrupted interests/payment_methods JSON
try {
  const allUsers = db.prepare('SELECT id, interests, payment_methods FROM users').all() as any[];
  let fixedUsers = 0;
  const fixInterests = db.prepare("UPDATE users SET interests = '[]' WHERE id = ?");
  const fixPayments = db.prepare("UPDATE users SET payment_methods = '[]' WHERE id = ?");
  for (const user of allUsers) {
    try {
      const parsed = JSON.parse(user.interests || '[]');
      if (!Array.isArray(parsed)) throw new Error('not array');
    } catch {
      fixInterests.run(user.id);
      fixedUsers++;
    }
    try {
      const parsed = JSON.parse(user.payment_methods || '[]');
      if (!Array.isArray(parsed)) throw new Error('not array');
    } catch {
      fixPayments.run(user.id);
      fixedUsers++;
    }
  }
  if (fixedUsers > 0) {
    console.log(`[DB] Fixed ${fixedUsers} corrupted JSON fields in users`);
  }
} catch (err: any) {
  console.log('[DB] User data check skipped:', err.message);
}

// ─── Seed Default Data ──────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  // Read admin credentials from environment variables.
  // 🔒 SECURITY: NO default passwords — server refuses to seed admin/owner
  // accounts if ADMIN_PASSWORD / OWNER_PASSWORD are missing or look like placeholders.
  // The server's startup logic (server.ts) enforces this before reaching here.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    console.error('[DB] ❌ ADMIN_EMAIL and ADMIN_PASSWORD (min 8 chars) must be set in environment to seed the database.');
    console.error('[DB] ❌ Refusing to create admin account with missing/weak credentials.');
    throw new Error('ADMIN_EMAIL/ADMIN_PASSWORD not configured or too weak (min 8 chars).');
  }
  const adminHash = bcrypt.hashSync(adminPassword, 12);

  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar, is_verified, is_admin, is_trusted, wallet_balance, trust_score, interests, payment_methods, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('admin', 'مدير نواقص', adminEmail, adminHash,
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
    1, 1, 1, 5000, 100,
    '["تقنية","عقارات","سيارات"]',
    '[{"id":"vfc","name":"Vodafone Cash","icon":"📱","details":"N/A"},{"id":"instapay","name":"InstaPay","icon":"💸","details":"N/A"}]',
    '01000000000'
  );

  console.log('[DB] Admin account created with email:', adminEmail);

  // Seed categories only
  const insertCat = db.prepare('INSERT INTO categories (id, name, icon, sort) VALUES (?, ?, ?, ?)');
  insertCat.run('market', 'السوق الذكي', '🚀', 1);
  insertCat.run('matches', 'متوافق معي', '🎯', 2);
  insertCat.run('wallet', 'محفظتي', '💳', 3);
  insertCat.run('saved', 'المحفوظات', '🔖', 4);

  console.log('[DB] Database seeded with admin user and categories');
}

// --- Ensure owner admin account exists (from env variables) ---
// 🔒 SECURITY FIX (was: SELECT ... WHERE email = ? OR phone = ? → privilege escalation):
//   A regular user who registered with the owner's phone number was silently
//   promoted to admin. Now we match by EMAIL ONLY and only promote a row
//   whose id is already 'owner' (i.e. the legitimate seeded owner account).
//   Phone collisions with regular users no longer trigger promotion.
try {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerPhone = process.env.OWNER_PHONE || '01000000001';
  if (!ownerEmail || !ownerPassword || ownerPassword.length < 8) {
    console.error('[DB] ❌ OWNER_EMAIL and OWNER_PASSWORD (min 8 chars) must be set in environment.');
    console.error('[DB] ❌ Refusing to create owner account with missing/weak credentials.');
    throw new Error('OWNER_EMAIL/OWNER_PASSWORD not configured or too weak (min 8 chars).');
  }
  // Match by EMAIL ONLY — never by phone (prevents privilege escalation).
  const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail) as { id: string } | undefined;
  if (!existingOwner) {
    const ownerHash = bcrypt.hashSync(ownerPassword, 12);
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, avatar, is_verified, is_admin, is_trusted, wallet_balance, trust_score, interests, payment_methods, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('owner', 'صاحب نواقص', ownerEmail, ownerHash,
      'https://api.dicebear.com/7.x/avataaars/svg?seed=Owner',
      1, 1, 1, 10000, 100,
      '["تقنية","عقارات","سيارات","هواتف","إلكترونيات"]',
      '[{"id":"vfc","name":"Vodafone Cash","icon":"📱","details":"N/A"},{"id":"instapay","name":"InstaPay","icon":"💸","details":"N/A"}]',
      ownerPhone
    );
    console.log('[DB] Owner account created');
  } else if (existingOwner.id === 'owner') {
    // Only promote if this is the legitimate owner account (matched by email).
    // A regular user who happens to share the owner email is impossible (UNIQUE constraint).
    db.prepare('UPDATE users SET is_admin = 1, is_verified = 1 WHERE id = ?').run(existingOwner.id);
  } else {
    console.warn('[DB] ⚠️ Email matches a non-owner row — refusing to promote. Possible data inconsistency.');
  }
} catch (err: any) {
  // Only log non-UNIQUE-constraint errors
  if (!err.message?.includes('UNIQUE constraint')) {
    console.log('[DB] Owner account setup:', err.message);
  }
}

// ─── Seed News Data (Egyptian, World, and Breaking News) ────────────
const newsCount = db.prepare('SELECT COUNT(*) as count FROM news_items').get() as { count: number };
if (newsCount.count === 0) {
  const insertNews = db.prepare('INSERT INTO news_items (id, title, content, source, is_alert, category) VALUES (?, ?, ?, ?, ?, ?)');

  // Egyptian News
  insertNews.run('news-eg-1', 'البنك المركزي المصري يقرر تثبيت سعر الفائدة', 'قرر البنك المركزي المصري تثبيت سعر الفائدة عند مستوياتها الحالية خلال اجتماع اللجنة النقدية، مع التأكيد على مراقبة تطورات التضخم عالميا ومحليا واتخاذ السياسات اللازمة لضمان استقرار الأسعار', 'الأهرام', 0, 'egypt');
  insertNews.run('news-eg-2', 'مصر تعلن عن مشروع قومي جديد لتطوير البنية التحتية الرقمية', 'أعلنت الحكومة المصرية عن إطلاق مشروع قومي طموح لتطوير البنية التحتية الرقمية يشمل توسيع شبكات الألياف الضوئية وتحسين خدمات الإنترنت في جميع المحافظات، بتكلفة إجمالية تتجاوز 10 مليارات جنيه', 'المصري اليوم', 0, 'egypt');
  insertNews.run('news-eg-3', 'ارتفاع ملحوظ في حركة السياحة الوافدة إلى مصر خلال الربع الأول', 'شهدت حركة السياحة الوافدة إلى مصر ارتفاعا ملحوظا خلال الربع الأول من العام الجاري، حيث بلغ عدد السياح الوافدين أكثر من 3 ملايين سائح بزيادة قدرها 25% مقارنة بالفترة ذاتها من العام الماضي', 'الوفد', 0, 'egypt');
  insertNews.run('news-eg-4', 'إطلاق مبادرة وطنية لدعم المشروعات الصغيرة والمتوسطة', 'أطلقت وزارة التجارة والصناعة مبادرة وطنية جديدة لدعم المشروعات الصغيرة والمتوسطة تتضمن توفير تمويل ميسر بقيمة 5 مليارات جنيه وتقديم حوافز ضريبية وتدريب مهني لرواد الأعمال في جميع المحافظات', 'الجمهورية', 0, 'egypt');
  insertNews.run('news-eg-5', 'تشغيل أول قطار كهربائي سريع يربط القاهرة بالعاصمة الإدارية الجديدة', 'بدأ تشغيل أول قطار كهربائي سريع يربط بين القاهرة والعاصمة الإدارية الجديدة بطول 90 كيلومترا، بسعة نقل تصل إلى 50 ألف راكب يوميا وسرعة قصوى تبلغ 160 كيلومترا في الساعة', 'الأخبار', 0, 'egypt');

  // World News
  insertNews.run('news-wr-1', 'الأسواق العالمية تشهد تقلبات حادة وسط مخاوف من تباطؤ النمو الاقتصادي', 'شهدت الأسواق المالية العالمية تقلبات حادة خلال تعاملات الأسبوع وسط مخاوف متزايدة من تباطؤ النمو الاقتصادي العالمي، حيث تراجعت المؤشرات الرئيسية في بورصات أوروبا وآسيا بشكل ملحوظ مع ارتفاع أسعار النفط', 'رويترز', 0, 'world');
  insertNews.run('news-wr-2', 'تطورات جديدة في مساعي السلام بالشرق الأوسط', 'شهدت المنطقة تطورات دبلوماسية مكثفة مع استمرار الجهود الدولية لتهدئة الأوضاع واستئناف مسار التفاوض، حيث أجرت عواصم عالمية عدة اتصالات مكثفة لدعم استقرار المنطقة', 'الجزيرة', 0, 'world');
  insertNews.run('news-wr-3', 'الذكاء الاصطناعي يحدث ثورة في قطاع الرعاية الصحية عالميا', 'أحدثت تقنيات الذكاء الاصطناعي طفرة نوعية في قطاع الرعاية الصحية العالمي، حيث أصبحت التطبيقات الذكية قادرة على تشخيص الأمراض بدقة عالية وتطوير علاجات مخصصة وتسريع اكتشاف الأدوية الجديدة', 'بي بي سي', 0, 'world');
  insertNews.run('news-wr-4', 'أوبك تقرر تعديل إنتاج النفط استجابة لمتغيرات السوق العالمية', 'قررت منظمة أوبك تعديل مستويات إنتاج النفط استجابة للتحولات في أسواق الطاقة العالمية، مع التأكيد على التزام المنظمة بضمان استقرار السوق وتلبية الطلب العالمي بشكل مستدام', 'العربية', 0, 'world');
  insertNews.run('news-wr-5', 'اتفاقية دولية جديدة لمكافحة تغير المناخ تعتمد في قمة عالمية', 'تم اعتماد اتفاقية دولية جديدة لمكافحة تغير المناخ خلال قمة عالمية حضرها قادة أكثر من 150 دولة، تتضمن التزامات ملزمة بخفض الانبعاثات الكربونية وتمويل مشاريع الطاقة المتجددة في الدول النامية بمبلغ 100 مليار دولار سنويا', 'فرانس 24', 0, 'world');

  // Urgent/Breaking News
  insertNews.run('news-ur-1', 'تحديث عاجل: تعطل خدمات الدفع الإلكتروني في بعض البنوك المصرية', 'تعرف بعض خدمات الدفع الإلكتروني في عدد من البنوك المصرية على تعطل مؤقت بسبب تحديثات فنية جارية، ويتوقع استئناف الخدمات خلال الساعات القليلة القادمة. ننصح باستخدام البدائل المتاحة حتى عودة الخدمة', 'نواقص عاجل', 1, 'urgent');
  insertNews.run('news-ur-2', 'تنبيه هام: تحديث سياسة الخصوصية وشروط الاستخدام', 'تم تحديث سياسة الخصوصية وشروط الاستخدام على منصة نواقص لحماية بياناتكم بشكل أفضل. يرجى مراجعة التحديثات الجديدة في صفحة الإعدادات للمتابعة', 'نواقص', 1, 'urgent');

  console.log('[DB] Database seeded with Egyptian, World, and Breaking news');
}

// ─── Seed Cities Lookup Table ────────────────────────────────────────
const citiesCount = db.prepare('SELECT COUNT(*) as count FROM cities_lookup').get() as { count: number };
if (citiesCount.count === 0) {
  const insertCity = db.prepare('INSERT INTO cities_lookup (id, name_ar, name_en, region, population) VALUES (?, ?, ?, ?, ?)');
  // Greater Cairo
  insertCity.run('cairo', 'القاهرة', 'Cairo', 'cairo', 10.0);
  insertCity.run('giza', 'الجيزة', 'Giza', 'cairo', 8.8);
  insertCity.run('qalyubia', 'القليوبية', 'Qalyubia', 'cairo', 5.5);
  // Alexandria
  insertCity.run('alexandria', 'الإسكندرية', 'Alexandria', 'alexandria', 5.4);
  // Delta
  insertCity.run('beheira', 'البحيرة', 'Beheira', 'delta', 6.1);
  insertCity.run('kafr_elsheikh', 'كفر الشيخ', 'Kafr El Sheikh', 'delta', 3.2);
  insertCity.run('damietta', 'دمياط', 'Damietta', 'delta', 1.4);
  insertCity.run('dakahlia', 'الدقهلية', 'Dakahlia', 'delta', 6.0);
  insertCity.run('sharqia', 'الشرقية', 'Sharqia', 'delta', 6.7);
  insertCity.run('monufia', 'المنوفية', 'Monufia', 'delta', 4.2);
  insertCity.run('gharbia', 'الغربية', 'Gharbia', 'delta', 4.8);
  // Canal & Sinai
  insertCity.run('suez', 'السويس', 'Suez', 'canal', 0.7);
  insertCity.run('ismailia', 'الإسماعيلية', 'Ismailia', 'canal', 1.3);
  insertCity.run('port_said', 'بورسعيد', 'Port Said', 'canal', 0.7);
  insertCity.run('north_sinai', 'شمال سيناء', 'North Sinai', 'canal', 0.4);
  insertCity.run('south_sinai', 'جنوب سيناء', 'South Sinai', 'canal', 0.1);
  // Upper Egypt
  insertCity.run('fayoum', 'الفيوم', 'Fayoum', 'upper', 3.5);
  insertCity.run('benisuef', 'بني سويف', 'Beni Suef', 'upper', 3.1);
  insertCity.run('minya', 'المنيا', 'Minya', 'upper', 5.5);
  insertCity.run('asyut', 'أسيوط', 'Asyut', 'upper', 4.3);
  insertCity.run('sohag', 'سوهاج', 'Sohag', 'upper', 4.6);
  insertCity.run('qena', 'قنا', 'Qena', 'upper', 3.0);
  insertCity.run('luxor', 'الأقصر', 'Luxor', 'upper', 1.1);
  insertCity.run('aswan', 'أسوان', 'Aswan', 'upper', 1.4);
  // Border
  insertCity.run('new_valley', 'الوادي الجديد', 'New Valley', 'border', 0.2);
  insertCity.run('red_sea', 'البحر الأحمر', 'Red Sea', 'border', 0.4);
  insertCity.run('matrouh', 'مطروح', 'Matrouh', 'border', 0.5);
  console.log('[DB] Database seeded with Egyptian cities lookup table');
}

// ─── Auto-Update Market Trends from Real Post Data ──────────────────
// This function computes trends dynamically from actual posts in the database
function updateMarketTrendsFromRealData() {
  try {
    // Compute category-level stats from real posts
    const categoryStats = db.prepare(`
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(AVG(price), 0) as avg_price,
        COALESCE(MIN(price), 0) as min_price,
        COALESCE(MAX(price), 0) as max_price,
        COALESCE(SUM(likes), 0) as total_likes
      FROM posts 
      WHERE type = 'ad' AND status = 'active' AND category != '' AND category IS NOT NULL
      GROUP BY category 
      ORDER BY count DESC
    `).all() as any[];

    // Count posts in last 7 days vs previous 7 days per category for trend direction
    const categoryTrendData: Record<string, { recent: number; previous: number; avgPrice: number; count: number; totalLikes: number }> = {};
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
        totalLikes: cat.total_likes,
      };
    }

    // Category display names in Arabic
    const categoryNames: Record<string, string> = {
      phones: 'هواتف', cars: 'سيارات', electronics: 'إلكترونيات', realEstate: 'عقارات',
      games: 'ألعاب', fashion: 'أزياء', services: 'خدمات', books: 'كتب',
      sports: 'رياضة', animals: 'حيوانات', jobs: 'وظائف', other: 'أخرى',
      beauty: 'تجميل', education: 'تعليم', health: 'صحة', food: 'طعام ومطاعم',
      travel: 'سفر وسياحة', photography: 'تصوير',
    };

    // Clear existing trends and repopulate with real data
    db.prepare('DELETE FROM market_trends').run();
    const insertTrend = db.prepare("INSERT INTO market_trends (id, item, trend, change, category, price, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))");

    for (const [cat, data] of Object.entries(categoryTrendData)) {
      if (data.count < 1) continue; // Skip empty categories

      // Determine trend direction based on activity change
      let trend: 'up' | 'down' | 'stable' = 'stable';
      let changePercent = 0;
      if (data.previous > 0) {
        changePercent = Math.round(((data.recent - data.previous) / data.previous) * 100);
        if (changePercent > 3) trend = 'up';
        else if (changePercent < -3) trend = 'down';
      } else if (data.recent > 0) {
        changePercent = 100; // New category activity
        trend = 'up';
      }

      const changeStr = changePercent >= 0 ? `+${changePercent}%` : `${changePercent}%`;
      const displayName = categoryNames[cat] || cat;

      insertTrend.run(
        `trend-real-${cat}`,
        displayName,
        trend,
        changeStr,
        cat,
        Math.round(data.avgPrice)
      );
    }

    // If no real trends exist yet, add placeholder entries
    const newTrendCount = db.prepare('SELECT COUNT(*) as count FROM market_trends').get() as { count: number };
    if (newTrendCount.count === 0) {
      // No posts in database yet - add minimal placeholder
      insertTrend.run('trend-placeholder', 'السوق', 'stable', '0%', '', 0);
    }

    console.log(`[DB] Updated market trends from real data: ${newTrendCount.count} trends`);
  } catch (err: any) {
    console.log('[DB] Market trends update failed:', err.message);
  }
}

// Run the trends update on startup
updateMarketTrendsFromRealData();

// ─── Seed Market Trends Data (only if empty after real-data update) ───
const trendCount = db.prepare('SELECT COUNT(*) as count FROM market_trends').get() as { count: number };
if (trendCount.count === 0) {
  // Only seed with sample data if the real-data update didn't produce any trends
  // (i.e., the database has no posts yet)
  console.log('[DB] No real post data for trends, using placeholder');
}

// ─── Add missing columns to market_trends ───────────────────────────
try {
  db.prepare('ALTER TABLE market_trends ADD COLUMN category TEXT DEFAULT ""').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE market_trends ADD COLUMN price REAL').run();
} catch { /* column already exists */ }
try {
  db.prepare("ALTER TABLE market_trends ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))").run();
} catch { /* column already exists */ }

// ─── Add missing columns to market_listings ─────────────────────────
try {
  db.prepare('ALTER TABLE market_listings ADD COLUMN is_featured INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE market_listings ADD COLUMN shares_count INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }
try {
  db.prepare('ALTER TABLE market_listings ADD COLUMN reach_count INTEGER DEFAULT 0').run();
} catch { /* column already exists */ }

// ─── Add missing columns to market_promotion_requests ───────────────
try {
  db.prepare("ALTER TABLE market_promotion_requests ADD COLUMN listing_title TEXT NOT NULL DEFAULT ''").run();
} catch { /* column already exists */ }

// ─── Phase 3: Group chats, forwarding, mute, block ────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_groups (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    description TEXT DEFAULT '',
    creator_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_group_members (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    group_id TEXT NOT NULL REFERENCES chat_groups(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(group_id, user_id)
  )
`); } catch {}

// Add group_id to chat_messages
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN group_id TEXT").run(); } catch {}
// Add forwarded fields
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN is_forwarded INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN forwarded_from TEXT DEFAULT ''").run(); } catch {}

// ─── Chat v2: disappearing messages + scheduled messages ──────────
// Disappearing: expires_at = when the message should auto-delete (NULL = forever)
// Scheduled: scheduled_at = when a drafted message should auto-send (NULL = immediate)
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN expires_at TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN scheduled_at TEXT").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN is_scheduled INTEGER DEFAULT 0").run(); } catch {}

// ─── Chat v3: AI Assistant + Payments + Translation ───────────────
// payment_amount: for in-chat money transfers (message_type='payment')
// payment_status: 'pending' | 'completed' | 'rejected'
// translated_text: cached translation of the message
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN payment_amount REAL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN payment_status TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN translated_text TEXT DEFAULT ''").run(); } catch {}

// AI reminders extracted from chat context
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_ai_reminders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    content TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    is_fired INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_reminders_user ON chat_ai_reminders(user_id, is_fired);
`); } catch {}

// ─── Channel v2: Scheduled streams + Live polls + Analytics + Gifts ─
try { db.exec(`
  -- Scheduled channel live streams (separate from user-level scheduled_streams)
  CREATE TABLE IF NOT EXISTS channel_scheduled_streams (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled',  -- 'scheduled' | 'live' | 'ended' | 'cancelled'
    actual_stream_id TEXT,
    reminder_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ch_scheduled_channel ON channel_scheduled_streams(channel_id);
  CREATE INDEX IF NOT EXISTS idx_ch_scheduled_time ON channel_scheduled_streams(scheduled_at);

  -- Reminders for scheduled streams
  CREATE TABLE IF NOT EXISTS channel_stream_reminders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    stream_id TEXT NOT NULL REFERENCES channel_scheduled_streams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(stream_id, user_id)
  );

  -- Live polls during a stream
  CREATE TABLE IF NOT EXISTS channel_live_polls (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    stream_id TEXT NOT NULL REFERENCES channel_livestreams(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    status TEXT DEFAULT 'active',  -- 'active' | 'closed'
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_live_polls_stream ON channel_live_polls(stream_id);

  CREATE TABLE IF NOT EXISTS channel_live_poll_options (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    poll_id TEXT NOT NULL REFERENCES channel_live_polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    vote_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS channel_live_poll_votes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    poll_id TEXT NOT NULL REFERENCES channel_live_polls(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES channel_live_poll_options(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(poll_id, user_id)
  );

  -- Channel gifts (purchased with wallet, sent during live streams)
  CREATE TABLE IF NOT EXISTS channel_gifts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    stream_id TEXT NOT NULL REFERENCES channel_livestreams(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_type TEXT NOT NULL,  -- 'rose' | 'heart' | 'star' | 'crown' | 'diamond' | 'trophy'
    gift_name TEXT NOT NULL,
    gift_icon TEXT NOT NULL,
    amount REAL NOT NULL,  -- price in EGP
    message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_channel_gifts_stream ON channel_gifts(stream_id);
  CREATE INDEX IF NOT EXISTS idx_channel_gifts_sender ON channel_gifts(sender_id);

  -- Channel analytics snapshot (updated when stream ends)
  CREATE TABLE IF NOT EXISTS channel_analytics_snapshots (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    stream_id TEXT,
    snapshot_type TEXT NOT NULL,  -- 'stream_end' | 'daily' | 'weekly'
    subscriber_count INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_gifts_amount REAL DEFAULT 0,
    total_polls INTEGER DEFAULT 0,
    peak_viewers INTEGER DEFAULT 0,
    avg_watch_time INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ch_analytics_channel ON channel_analytics_snapshots(channel_id, created_at DESC);
`); } catch (e: any) {
  console.log('[DB] Channel v2 tables creation skipped:', e.message);
}

// ─── Gift types catalog (built-in constants) ──
// Used by the API to validate gift purchases and deduct from wallet.

// Translation cache (avoid re-translating the same text)
try { db.exec(`
  CREATE TABLE IF NOT EXISTS translation_cache (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    source_text_hash TEXT NOT NULL,
    source_lang TEXT DEFAULT 'auto',
    target_lang TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source_text_hash, target_lang)
  );
  CREATE INDEX IF NOT EXISTS idx_trans_hash ON translation_cache(source_text_hash, target_lang);
`); } catch {}

// ─── Chat conversations settings (per user-pair or group) ────────
// Stores disappearing-message TTL and other per-conversation settings.
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_conversation_settings (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    conversation_key TEXT NOT NULL UNIQUE,
    disappearing_ttl INTEGER DEFAULT 0,
    muted INTEGER DEFAULT 0,
    pinned INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conv_settings_key ON chat_conversation_settings(conversation_key);
`); } catch {}

// ─── AI smart reply cache (avoids hitting the LLM for the same context) ──
try { db.exec(`
  CREATE TABLE IF NOT EXISTS ai_reply_cache (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    context_hash TEXT NOT NULL,
    replies TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ai_reply_hash ON ai_reply_cache(context_hash);
`); } catch {}

// ─── Chat V3: In-chat payments + AI reminders + translations ──────
// Chat payments: money transfers inside a conversation
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_payments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',  -- 'pending' | 'completed' | 'rejected' | 'cancelled'
    note TEXT DEFAULT '',
    message_id TEXT,  -- link to the chat_messages row that contained the payment
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chat_payments_sender ON chat_payments(sender_id);
  CREATE INDEX IF NOT EXISTS idx_chat_payments_receiver ON chat_payments(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_chat_payments_status ON chat_payments(status);
`); } catch {}

// AI reminders extracted from chat context
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_reminders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT,  -- the other user's id (for context)
    title TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    is_fired INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_user ON chat_reminders(user_id, is_fired);
  CREATE INDEX IF NOT EXISTS idx_reminders_fire ON chat_reminders(remind_at, is_fired);
`); } catch {}

// Message translations cache
try { db.exec(`
  CREATE TABLE IF NOT EXISTS message_translations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    message_id TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, target_lang)
  );
  CREATE INDEX IF NOT EXISTS idx_translations_msg ON message_translations(message_id);
`); } catch {}

// Add payment_id column to chat_messages (for payment-type messages)
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN payment_id TEXT").run(); } catch {}
// Add translated flag
try { db.prepare("ALTER TABLE chat_messages ADD COLUMN translated_text TEXT DEFAULT ''").run(); } catch {}

// ─── Migration: make chat_messages.receiver_id nullable for group messages ───
// The original schema had `receiver_id TEXT NOT NULL REFERENCES users(id)`,
// which blocks group messages (where receiver_id is NULL and group_id is set).
// SQLite can't ALTER COLUMN in place, so we recreate the table.
// IMPORTANT: preserve ALL extended-column data (message_type, image_url,
// reactions, voice_url, group_id, etc.) by copying them in the same
// INSERT … SELECT — the previous version dropped them silently.
try {
  const tableInfo = db.prepare("PRAGMA table_info(chat_messages)").all() as any[];
  const receiverCol = tableInfo.find(c => c.name === 'receiver_id');
  if (receiverCol && receiverCol.notnull === 1) {
    console.log('[DB] Migrating chat_messages: making receiver_id nullable for group chat support...');
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`
      CREATE TABLE chat_messages_new (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        sender_id TEXT NOT NULL REFERENCES users(id),
        receiver_id TEXT REFERENCES users(id),
        text TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        post_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    // Re-add every extended column that existed on the old table so the
    // INSERT … SELECT below can copy them. This list must cover every
    // ALTER TABLE ever applied to chat_messages.
    const extendedCols: Array<[string, string]> = [
      ['message_type', "TEXT DEFAULT 'text'"],
      ['image_url', "TEXT DEFAULT ''"],
      ['reply_to_id', 'TEXT'],
      ['reactions', "TEXT DEFAULT '{}'"],
      ['deleted_for', "TEXT DEFAULT ''"],
      ['is_edited', 'INTEGER DEFAULT 0'],
      ['is_pinned', 'INTEGER DEFAULT 0'],
      ['delivered', 'INTEGER DEFAULT 0'],
      ['voice_url', "TEXT DEFAULT ''"],
      ['voice_duration', 'REAL DEFAULT 0'],
      ['group_id', 'TEXT'],
      ['is_forwarded', 'INTEGER DEFAULT 0'],
      ['forwarded_from', "TEXT DEFAULT ''"],
    ];
    const presentExtended = extendedCols.filter(([col]) => tableInfo.find(c => c.name === col));
    for (const [col, def] of presentExtended) {
      db.exec(`ALTER TABLE chat_messages_new ADD COLUMN ${col} ${def}`);
    }
    // Build the column list for the copy. Use COALESCE on receiver_id to
    // convert the legacy 'group' sentinel to NULL (the new schema is
    // nullable, and 'group' would violate the FK constraint).
    const allCols = ['id', 'sender_id', 'text', 'read', 'post_id', 'created_at', ...presentExtended.map(([c]) => c)];
    const selectCols = ['id', 'sender_id', "CASE WHEN receiver_id = 'group' THEN NULL ELSE receiver_id END AS receiver_id", 'text', 'read', 'post_id', 'created_at', ...presentExtended.map(([c]) => c)];
    const insertColsStr = allCols.join(', ');
    const selectColsStr = selectCols.join(', ');
    db.exec(`INSERT INTO chat_messages_new (${insertColsStr}) SELECT ${selectColsStr} FROM chat_messages`);
    db.exec('DROP TABLE chat_messages');
    db.exec('ALTER TABLE chat_messages_new RENAME TO chat_messages');
    db.exec('PRAGMA foreign_keys = ON');
    console.log(`[DB] ✅ chat_messages.receiver_id is now nullable (preserved ${presentExtended.length} extended columns)`);
  }
} catch (err: any) {
  console.warn('[DB] chat_messages migration skipped:', err.message);
  try { db.exec('PRAGMA foreign_keys = ON'); } catch {}
}

// Chat mutes
try { db.exec(`
  CREATE TABLE IF NOT EXISTS chat_mutes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    target_id TEXT NOT NULL,
    is_group INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, target_id)
  )
`); } catch {}

// User blocks — unified: user_blocks is a legacy alias for blocked_users.
// We keep `blocked_users` as the canonical table (see line ~684) and
// migrate any rows from `user_blocks` into it so blocking works
// consistently across chat and profile UIs.
try {
  // Try to copy any rows from the legacy `user_blocks` table into `blocked_users`.
  let migratedCount = 0;
  try {
    const legacyRows = db.prepare('SELECT blocker_id, blocked_id, created_at FROM user_blocks').all() as any[];
    if (legacyRows.length > 0) {
      const insertLegacy = db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, ?)');
      for (const r of legacyRows) {
        insertLegacy.run(r.blocker_id, r.blocked_id, '', r.created_at);
        migratedCount++;
      }
      console.log(`[DB] Migrated ${migratedCount} rows from user_blocks → blocked_users`);
    }
  } catch { /* user_blocks doesn't exist or isn't a table — nothing to migrate */ }
  // Always drop the legacy table if it exists so we can replace it with a VIEW.
  db.exec('DROP TABLE IF EXISTS user_blocks');
  // Create a VIEW named `user_blocks` that aliases `blocked_users`, so any
  // stale code that still references `user_blocks` keeps working.
  db.exec(`CREATE VIEW IF NOT EXISTS user_blocks AS SELECT * FROM blocked_users`);
} catch (err: any) {
  console.log('[DB] user_blocks unification skipped:', err.message);
}

// ─── Phase 3: Devices table for FCM push notifications ───
try { db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    platform TEXT DEFAULT 'web',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
  CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(token);
`); } catch {}

// ─── Phase 3: Story interaction tables ───
try { db.exec(`
  CREATE TABLE IF NOT EXISTS story_replies (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_story_replies_story ON story_replies(story_id);
  CREATE INDEX IF NOT EXISTS idx_story_replies_user ON story_replies(user_id);
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS story_reactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(story_id, user_id, emoji)
  );
  CREATE INDEX IF NOT EXISTS idx_story_reactions_story ON story_reactions(story_id);
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS story_views (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(story_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id);
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS story_highlights (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    cover_image TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_story_highlights_user ON story_highlights(user_id);
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS highlight_stories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    highlight_id TEXT NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
    story_id TEXT NOT NULL REFERENCES stories(id),
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(highlight_id, story_id)
  );
  CREATE INDEX IF NOT EXISTS idx_highlight_stories_highlight ON highlight_stories(highlight_id);
`); } catch {}

// ─── Phase 3: Withdrawal requests table ───
try { db.exec(`
  CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    account_details TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    admin_note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status);
`); } catch {}

// ─── Withdrawal requests: extra columns for external-network withdrawals ───
// `network`        — external payout network (vodafone_cash, instapay, fawry,
//                    etisalat_cash, orange_cash, bank_transfer). Older rows
//                    fall back to `method` for display.
// `account_number` — the user's phone/handle/code/account on that network.
// `fee`            — 5% platform fee deducted from `amount`.
// `net_amount`     — amount - fee (what the user actually receives outside).
try { db.prepare("ALTER TABLE withdrawal_requests ADD COLUMN network TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE withdrawal_requests ADD COLUMN account_number TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE withdrawal_requests ADD COLUMN fee REAL DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE withdrawal_requests ADD COLUMN net_amount REAL DEFAULT 0").run(); } catch {}

// ─── charging_requests: processed_at (when admin acted) ───
try { db.prepare("ALTER TABLE charging_requests ADD COLUMN processed_at TEXT").run(); } catch {}

// ─── Wallet: Add reference_id to transactions for linking to charging/withdrawal requests ───
try { db.prepare("ALTER TABLE transactions ADD COLUMN reference_id TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id)").run(); } catch {}

// ─── Wallet: Savings goals table ───
try { db.exec(`
  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    deadline TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals(user_id);
`); } catch {}

// ─── Phase 3: Stories migrations for video_url and expires_at ───
try { db.prepare("ALTER TABLE stories ADD COLUMN video_url TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE stories ADD COLUMN expires_at TEXT").run(); } catch {}

// ─── Email verification ────────────────────────────────────────────
try { db.prepare("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN email_verification_code TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN email_verification_expires TEXT DEFAULT ''").run(); } catch {}

// ─── Scheduled streams ──────────────────────────────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_streams (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    scheduled_at TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    category TEXT DEFAULT '',
    is_active INTEGER DEFAULT 0,
    reminder_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_scheduled_streams_user ON scheduled_streams(user_id);
  CREATE INDEX IF NOT EXISTS idx_scheduled_streams_time ON scheduled_streams(scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_scheduled_streams_active ON scheduled_streams(is_active);
`); } catch {}

// ─── Stream gifts/tips ──────────────────────────────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS stream_gifts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    stream_id TEXT NOT NULL,
    sender_id TEXT NOT NULL REFERENCES users(id),
    receiver_id TEXT NOT NULL REFERENCES users(id),
    gift_type TEXT NOT NULL,
    gift_name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    message TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_stream_gifts_stream ON stream_gifts(stream_id);
  CREATE INDEX IF NOT EXISTS idx_stream_gifts_sender ON stream_gifts(sender_id);
  CREATE INDEX IF NOT EXISTS idx_stream_gifts_receiver ON stream_gifts(receiver_id);
`); } catch {}

// ─── Stream reminders ──────────────────────────────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS stream_reminders (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    stream_id TEXT NOT NULL REFERENCES scheduled_streams(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(stream_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_stream_reminders_stream ON stream_reminders(stream_id);
  CREATE INDEX IF NOT EXISTS idx_stream_reminders_user ON stream_reminders(user_id);
`); } catch {}

// ─── Notification Preferences (per-user opt-out per type) ──────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, type)
  );
  CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);
`); } catch {}

// ─── Business Page: profession + portfolio on users table ──────────
try { db.prepare("ALTER TABLE users ADD COLUMN profession TEXT DEFAULT ''").run(); } catch {}

// ─── Gift balance (separate from wallet_balance) ───────────────────
// Gift balance accumulates when other users send gifts to a content
// creator (e.g., via Market Live videos). The creator can later convert
// gift_balance to wallet_balance via /api/wallet/withdraw-gifts with a
// 10% platform fee deducted.
try { db.prepare("ALTER TABLE users ADD COLUMN gift_balance REAL DEFAULT 0").run(); } catch {}

// ─── Wallet transfers (pending-acceptance flow) ────────────────────
// When user A transfers money to user B, the money is HELD (deducted
// from A, NOT yet credited to B) until B accepts. If B rejects, the
// held amount is refunded to A. This table tracks the lifecycle of a
// transfer: 'pending' → 'accepted' | 'rejected'.
try { db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_transfers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sender_id TEXT NOT NULL REFERENCES users(id),
    recipient_id TEXT NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    responded_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_wallet_transfers_sender ON wallet_transfers(sender_id);
  CREATE INDEX IF NOT EXISTS idx_wallet_transfers_recipient ON wallet_transfers(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_wallet_transfers_status ON wallet_transfers(status);
`); } catch {}

// ─── Gift history (received gifts) ─────────────────────────────────
// Records every gift sent to a user (e.g., from Market Live videos).
// recipient_id accumulates these as gift_balance. Used by
// /api/wallet/gifts to render the gift history list. The `source`
// column distinguishes where the gift came from ('market_live',
// 'livestream', 'chat', etc.).
try { db.exec(`
  CREATE TABLE IF NOT EXISTS gift_history (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sender_id TEXT NOT NULL REFERENCES users(id),
    recipient_id TEXT NOT NULL REFERENCES users(id),
    gift_type TEXT NOT NULL,
    gift_name TEXT DEFAULT '',
    gift_icon TEXT DEFAULT '',
    amount REAL NOT NULL DEFAULT 0,
    message TEXT DEFAULT '',
    source TEXT DEFAULT 'market_live',
    video_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gift_history_recipient ON gift_history(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_gift_history_sender ON gift_history(sender_id);
  CREATE INDEX IF NOT EXISTS idx_gift_history_video ON gift_history(video_id);
`); } catch {}

// ─── Migration: make ad_videos.post_id nullable (for standalone videos) ──
// SQLite can't ALTER COLUMN, so we recreate the table if the old schema
// has NOT NULL on post_id.
try {
  const colInfo = db.prepare("PRAGMA table_info(ad_videos)").all() as any[];
  const postIdCol = colInfo.find(c => c.name === 'post_id');
  if (postIdCol && postIdCol.notnull === 1) {
    // Old schema with NOT NULL → migrate
    db.exec(`
      CREATE TABLE IF NOT EXISTS ad_videos_new (
        id TEXT PRIMARY KEY,
        post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        video_url TEXT NOT NULL,
        thumbnail_url TEXT DEFAULT '',
        duration INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        saves INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO ad_videos_new SELECT * FROM ad_videos;
      DROP TABLE ad_videos;
      ALTER TABLE ad_videos_new RENAME TO ad_videos;
      CREATE INDEX IF NOT EXISTS idx_ad_videos_user ON ad_videos(user_id);
    `);
    console.log('[DB] ✅ Migrated ad_videos.post_id to nullable');
  }
} catch (e: any) {
  console.log('[DB] ad_videos migration skipped:', e.message);
}
try { db.prepare("ALTER TABLE users ADD COLUMN portfolio_images TEXT DEFAULT '[]'").run(); } catch {}

// ─── Followers system (follow without friend request) ──────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS user_follows (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
  );
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON user_follows(following_id);
`); } catch {}

// ─── Channels (Telegram-like broadcast channels) ─────────────────
// A channel is a one-to-many broadcast medium:
//   - Owner (creator): full control, can post, edit, delete, manage
//   - Admins (promoted by owner): can post + moderate
//   - Subscribers: can view, react, comment (if enabled)
//
// Channel posts are stored separately from chat_messages to allow
// richer metadata (views count, reactions aggregation, comments thread).
try { db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    handle TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    cover_photo TEXT DEFAULT '',
    is_public INTEGER DEFAULT 1,
    is_verified INTEGER DEFAULT 0,
    allow_comments INTEGER DEFAULT 1,
    allow_reactions INTEGER DEFAULT 1,
    category TEXT DEFAULT '',
    subscriber_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);
  CREATE INDEX IF NOT EXISTS idx_channels_handle ON channels(handle);
  CREATE INDEX IF NOT EXISTS idx_channels_public ON channels(is_public, subscriber_count DESC);

  CREATE TABLE IF NOT EXISTS channel_subscribers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'subscriber',
    muted INTEGER DEFAULT 0,
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(channel_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_subscribers_channel ON channel_subscribers(channel_id);
  CREATE INDEX IF NOT EXISTS idx_subscribers_user ON channel_subscribers(user_id);
`); } catch {}

// ─── Channel subscriber settings: notification level + muted-until + auto-media ─
// 🔧 FIX: previously `muted` was a boolean; now we have a richer model:
//   - notification_level: 'all' | 'live_only' | 'important' | 'none'
//   - muted_until: ISO timestamp (NULL = not muted, future = muted until)
//   - auto_load_media: 1/0 (whether to auto-load images/videos in the feed)
//   - blocked_at: ISO timestamp (user blocked this channel — won't appear
//     in suggestions/search). Stored in a SEPARATE table because a blocked
//     channel has no subscriber row.
try {
  db.prepare("ALTER TABLE channel_subscribers ADD COLUMN notification_level TEXT DEFAULT 'all'").run();
} catch {}
try {
  db.prepare("ALTER TABLE channel_subscribers ADD COLUMN muted_until TEXT DEFAULT NULL").run();
} catch {}
try {
  db.prepare("ALTER TABLE channel_subscribers ADD COLUMN auto_load_media INTEGER DEFAULT 1").run();
} catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS channel_blocks (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_at TEXT DEFAULT (datetime('now')),
    UNIQUE(channel_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_channel_blocks_user ON channel_blocks(user_id);
  CREATE INDEX IF NOT EXISTS idx_channel_blocks_channel ON channel_blocks(channel_id);
`); } catch {}

try { db.exec(`
  CREATE TABLE IF NOT EXISTS channel_reports (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(channel_id, reporter_id)
  );
  CREATE INDEX IF NOT EXISTS idx_channel_reports_channel ON channel_reports(channel_id);
  CREATE INDEX IF NOT EXISTS idx_channel_reports_status ON channel_reports(status);
`); } catch {}

// Continue the channels exec block (channel_posts and related tables)
try { db.exec(`
  CREATE TABLE IF NOT EXISTS channel_posts (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    media_type TEXT DEFAULT 'text',
    media_url TEXT DEFAULT '',
    media_caption TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    link_title TEXT DEFAULT '',
    link_description TEXT DEFAULT '',
    link_image TEXT DEFAULT '',
    views_count INTEGER DEFAULT 0,
    reactions_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    forwards_count INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    edited_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_posts_channel ON channel_posts(channel_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_author ON channel_posts(author_id);

  CREATE TABLE IF NOT EXISTS channel_post_reactions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id, emoji)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_post ON channel_post_reactions(post_id);

  CREATE TABLE IF NOT EXISTS channel_post_views (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_views_post ON channel_post_views(post_id);

  CREATE TABLE IF NOT EXISTS channel_comments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    post_id TEXT NOT NULL REFERENCES channel_posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    parent_id TEXT,
    likes_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_comments_post ON channel_comments(post_id, created_at DESC);
`); } catch (e: any) {
  console.log('[DB] Channels tables creation skipped:', e.message);
}

export default db;

// ─── Ensure admin/owner passwords are set ONLY when the account is fresh ──
// (i.e., the row has no password_hash OR has the placeholder 'PENDING_RESET').
// This prevents the previous bug where every server restart silently
// overwrote a password the user had changed via the UI.
// If you really need to reset the admin password, set the env var
// FORCE_RESET_ADMIN_PASSWORD=true (or FORCE_RESET_OWNER_PASSWORD=true)
// and restart; the password will be reset to the env/default value once.
try {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const forceReset = process.env.FORCE_RESET_ADMIN_PASSWORD === 'true';
  if (!adminEmail || !adminPassword || adminPassword.length < 8) {
    if (forceReset) {
      console.error('[DB] ❌ FORCE_RESET_ADMIN_PASSWORD=true but ADMIN_EMAIL/ADMIN_PASSWORD missing or too weak — refusing.');
    }
  } else {
    const adminRow = db.prepare("SELECT password_hash FROM users WHERE email = ? AND id = 'admin'").get(adminEmail) as any;
    if (adminRow && (forceReset || !adminRow.password_hash || adminRow.password_hash === 'PENDING_RESET')) {
      const adminHash = bcrypt.hashSync(adminPassword, 12);
      db.prepare("UPDATE users SET password_hash = ? WHERE email = ? AND id = 'admin'").run(adminHash, adminEmail);
      console.log(`[DB] ✅ Admin password ${forceReset ? 'force-reset' : 'initialized'} from env value`);
    }
  }
} catch (err: any) {
  console.log('[DB] Admin password check skipped:', err.message);
}

try {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const forceReset = process.env.FORCE_RESET_OWNER_PASSWORD === 'true';
  if (!ownerEmail || !ownerPassword || ownerPassword.length < 8) {
    if (forceReset) {
      console.error('[DB] ❌ FORCE_RESET_OWNER_PASSWORD=true but OWNER_EMAIL/OWNER_PASSWORD missing or too weak — refusing.');
    }
  } else {
    const ownerRow = db.prepare("SELECT password_hash FROM users WHERE email = ? AND id = 'owner'").get(ownerEmail) as any;
    if (ownerRow && (forceReset || !ownerRow.password_hash || ownerRow.password_hash === 'PENDING_RESET')) {
      const ownerHash = bcrypt.hashSync(ownerPassword, 12);
      db.prepare("UPDATE users SET password_hash = ? WHERE email = ? AND id = 'owner'").run(ownerHash, ownerEmail);
      console.log(`[DB] ✅ Owner password ${forceReset ? 'force-reset' : 'initialized'} from env value`);
    }
  }
} catch (err: any) {
  console.log('[DB] Owner password check skipped:', err.message);
}
