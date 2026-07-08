// --- Nawaqes Server (Production-Ready Secure) ---
// 🔒 FIX: import dotenv + fs + path FIRST and call dotenv.config() before
// any imports that touch process.env (database/index.ts needs
// ADMIN_PASSWORD at import time to seed the admin user). Previously
// `import { wsManager } from './websocket/index.js'` ran before
// dotenv.config() — that chain pulls in database/index.ts which reads
// process.env.ADMIN_PASSWORD, getting the placeholder/empty value and
// refusing to start. Now dotenv.config() runs first, and wsManager is
// imported dynamically AFTER env is loaded.
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const rootDir = process.cwd();

// --- Detect persistent storage (HF Spaces uses /data) ---
const PERSISTENT_DIR = fs.existsSync('/data') ? '/data' : path.resolve(rootDir, 'data');
console.log(`[SETUP] Persistent storage: ${PERSISTENT_DIR}`);

// --- Auto-setup: Create .env and directories if missing ---
// Use persistent storage for .env to prevent JWT_SECRET reset on container rebuild
const envPath = fs.existsSync(path.resolve(PERSISTENT_DIR, '.env'))
  ? path.resolve(PERSISTENT_DIR, '.env')
  : path.resolve(rootDir, '.env');
const envExamplePath = path.resolve(rootDir, '.env.example');
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
  console.log(`[SETUP] Created .env at ${envPath}`);
}
for (const dir of ['uploads', 'data', 'backups']) {
  const dirPath = path.resolve(rootDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[SETUP] Created ${dir}/ directory`);
  }
}
// Ensure persistent storage subdirectories exist
for (const dir of ['uploads', 'uploads/videos', 'backups']) {
  const dirPath = path.resolve(PERSISTENT_DIR, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[SETUP] Created persistent ${dir}/ directory`);
  }
}

// Load environment variables — MUST happen BEFORE imports that touch process.env
dotenv.config({ path: envPath });
dotenv.config({ path: path.resolve(rootDir, '.env.local') });

// --- Now safe to import modules that depend on process.env ---
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import crypto from 'crypto';
// 🔒 NOTE: wsManager is imported DYNAMICALLY inside startServer() to ensure
// all env vars are loaded first. The static import below would trigger
// database/index.ts initialization before dotenv.config() runs.

// --- Auto-configure missing env vars (write to .env silently) ---
// NOTE: This function is kept for non-secret env vars only (e.g., APP_URL).
// It MUST NOT be used for secrets (JWT_SECRET, ADMIN_PASSWORD, etc.) —
// secrets must be provided via the environment / mounted /data/.env file
// and the server will refuse to start without them in production.
function autoSetEnv(key: string, value: string) {
  process.env[key] = value;
  try {
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const lines = envContent.split('\n');
    const keyPattern = new RegExp(`^${key}=`);
    const existingIndex = lines.findIndex(l => keyPattern.test(l));
    if (existingIndex >= 0) {
      lines[existingIndex] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
    }
    fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
    // Also save to persistent .env if different from main .env
    const persistentEnvPath = path.resolve(PERSISTENT_DIR, '.env');
    if (persistentEnvPath !== envPath) {
      try {
        const pEnvContent = fs.existsSync(persistentEnvPath) ? fs.readFileSync(persistentEnvPath, 'utf-8') : '';
        const pLines = pEnvContent.split('\n');
        const pExistingIndex = pLines.findIndex(l => keyPattern.test(l));
        if (pExistingIndex >= 0) {
          pLines[pExistingIndex] = `${key}=${value}`;
        } else {
          pLines.push(`${key}=${value}`);
        }
        fs.writeFileSync(persistentEnvPath, pLines.join('\n'), 'utf-8');
      } catch { /* ignore */ }
    }
  } catch { /* ignore write errors */ }
}

// 🔒 SECURITY: JWT_SECRET must be set by the operator. Refuse to start in
// production if missing. In development, generate an ephemeral one (NOT
// persisted) so the developer sees the warning loudly on every restart.
const jwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const isEphemeralSecret = !jwtSecret
  || jwtSecret === 'REPLACE-WITH-YOUR-OWN-SECURE-RANDOM-STRING'
  || jwtSecret === 'CHANGE_ME_TO_A_RANDOM_64_PLUS_CHAR_HEX_STRING'
  || jwtSecret === 'nawaqes_secret_2024_xK9pL2mN8qR3wY6'; // known leaked value
if (isEphemeralSecret) {
  if (isProduction) {
    console.error('[CONFIG] ❌ JWT_SECRET is missing or looks like a placeholder/known-leaked value.');
    console.error('[CONFIG] ❌ Refusing to start in production. Set JWT_SECRET in your environment / .env');
    console.error('[CONFIG] ❌ Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  } else {
    const ephemeral = crypto.randomBytes(64).toString('hex');
    process.env.JWT_SECRET = ephemeral;
    console.warn('[CONFIG] ⚠️  JWT_SECRET not set — using EPHEMERAL secret for this dev session only.');
    console.warn('[CONFIG] ⚠️  All tokens will be invalidated on restart. Set JWT_SECRET in .env for persistence.');
  }
}

// 🔒 SECURITY: In production, ADMIN_PASSWORD / OWNER_PASSWORD must be set
// (the database module re-checks, but fail fast here for clearer errors).
if (isProduction) {
  const missing: string[] = [];
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    missing.push('ADMIN_EMAIL / ADMIN_PASSWORD (min 8 chars)');
  }
  if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD || process.env.OWNER_PASSWORD.length < 8) {
    missing.push('OWNER_EMAIL / OWNER_PASSWORD (min 8 chars)');
  }
  if (missing.length > 0) {
    console.error('[CONFIG] ❌ Missing required environment variables for production:');
    for (const m of missing) console.error(`[CONFIG]   - ${m}`);
    console.error('[CONFIG] ❌ Refusing to start. Set these in .env or platform secrets.');
    process.exit(1);
  }
}

// Import middleware
import { validateInput, rateLimit, securityHeaders } from './middleware/validation.js';

// 🔧 NOTE: route imports are deferred to inside startServer() because each
// route module transitively imports src/database/index.ts, which reads
// process.env.ADMIN_PASSWORD / OWNER_PASSWORD at module-load time to seed
// the admin/owner accounts. ESM hoists static imports, so if we import
// them at the top of this file, database/index.ts runs BEFORE
// dotenv.config() (called above) and sees empty env vars — causing the
// server to refuse to start. Dynamic imports inside startServer()
// guarantee the env is fully loaded first.
let authRoutes: typeof import('./routes/auth.js').default;
let postRoutes: typeof import('./routes/posts.js').default;
let chatRoutes: typeof import('./routes/chat.js').default;
let walletRoutes: typeof import('./routes/wallet.js').default;
let adminRoutes: typeof import('./routes/admin.js').default;
let apiRoutes: typeof import('./routes/api.js').default;
let marketRoutes: typeof import('./routes/market.js').default;
let smartReachRoutes: typeof import('./routes/smartReach.js').default;
let aiRoutes: typeof import('./routes/ai.js').default;
let channelRoutes: typeof import('./routes/channels.js').default;

async function startServer() {
  // 🔧 Safety net: also try to restore from HF backup if needed.
  // The PRIMARY restore happens via `dist/restore.mjs` BEFORE this
  // server starts (see Dockerfile CMD). This call here is a fallback
  // for dev mode / non-Docker environments. In production it will
  // typically skip because the DB will already exist and be fresh.
  try {
    const { autoRestoreDB } = await import('./database/auto-restore.js');
    await autoRestoreDB();
  } catch (err: any) {
    console.warn('[RESTORE] Failed:', err.message);
  }

  // ─── Cleanup: delete OLD like/comment/friend notifications (>7 days) ───
  // Previously this deleted ALL of these types on every boot, which wiped
  // legitimate notifications. Now scoped to old rows only.
  try {
    const db = (await import('./database/index.js')).default;
    const result = db.prepare(
      "DELETE FROM notifications WHERE type IN ('like', 'comment', 'friend') AND created_at < datetime('now', '-7 days')"
    ).run();
    if (result.changes > 0) {
      console.log(`[CLEANUP] Deleted ${result.changes} old (>7d) like/comment/friend notifications`);
    }
  } catch {}

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isDev = process.env.NODE_ENV !== 'production';

  // 🔧 Dynamically import routes NOW (after env is loaded). This triggers
  // database/index.ts initialization with the correct env vars.
  authRoutes = (await import('./routes/auth.js')).default;
  postRoutes = (await import('./routes/posts.js')).default;
  chatRoutes = (await import('./routes/chat.js')).default;
  walletRoutes = (await import('./routes/wallet.js')).default;
  adminRoutes = (await import('./routes/admin.js')).default;
  apiRoutes = (await import('./routes/api.js')).default;
  marketRoutes = (await import('./routes/market.js')).default;
  smartReachRoutes = (await import('./routes/smartReach.js')).default;
  aiRoutes = (await import('./routes/ai.js')).default;
  channelRoutes = (await import('./routes/channels.js')).default;

  // 🔒 SECURITY: Trust the first proxy hop so req.ip reflects the real client IP
  // when running behind a reverse proxy (HF Spaces / Render / Koyeb / nginx).
  // Without this, rate limiting and per-IP view deduplication are broken —
  // all requests appear to come from the proxy's IP.
  app.set('trust proxy', 1);

  // --- Global error handling ---
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err.message);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
  });

  // =====================================================
  // MIDDLEWARE ORDER MATTERS!
  // 1. CORS           - must be first
  // 2. Security       - sets headers on ALL responses (including Vite pages)
  // 3. JSON parser    - parses request bodies
  // 4. Rate limit     - skips Vite/asset paths
  // 5. Validation     - only checks POST/PUT JSON bodies
  // 6. Uploads        - serves uploaded files
  // 7. API routes     - handles /api/* requests
  // 8. Vite / Static  - serves frontend (catch-all)
  // =====================================================

  // 1. CORS (must be first)
  const allowedOrigins = isDev
    ? true
    : [
        process.env.APP_URL || `http://localhost:${PORT}`,
        'https://huggingface.co',
        'https://*.huggingface.co',
        /^https:\/\/[a-zA-Z0-9-]+\.huggingface\.co$/,
        /^https:\/\/[a-zA-Z0-9-]+\.hf\.space$/,
        /^https:\/\/[a-zA-Z0-9-]+-[a-zA-Z0-9-]+\.hf\.space$/,
      ];
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  // 2. Security headers - MUST come before Vite so CSP is set on ALL responses
  app.use(securityHeaders);

  // 3. Parse JSON bodies.
  // 🔒 SECURITY FIX: previously the global limit was 50mb which let any
  // endpoint (including /api/auth/login) be abused as a memory-exhaustion
  // vector. We use a safe default of 1mb globally, and a larger 50mb limit
  // ONLY on the specific upload routes that need it.
  app.use(express.json({ limit: '5mb' }));

  // 3b. Disable caching for ALL API responses.
  // Without this, the Android WebView caches API responses and serves
  // stale data (different posts on app vs website).
  app.use('/api', (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // JSON parse error handler
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'بيانات غير صالحة' });
      return;
    }
    next(err);
  });

  // 4. Rate limiting (skips Vite HMR paths and static assets)
  app.use(rateLimit);

  // 5. Input validation (only affects POST/PUT/PATCH with JSON)
  app.use(validateInput);

  // 6. Serve uploaded files (with caching headers)
  app.use('/uploads', express.static(path.resolve('uploads'), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
  }));
  // Also ensure videos directory exists
  const videosDir = path.resolve('uploads/videos');
  if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

  // 7. API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/smart-reach', smartReachRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/channels', channelRoutes);
  app.use('/api', apiRoutes);

  // Health check endpoint (no auth required)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      ts: new Date().toISOString(),
      version: '1.1.0',
    });
  });

  // ─── WebRTC ICE configuration endpoint ─────────────────────────────
  // 🔒 SECURITY FIX: previously this endpoint was PUBLIC and returned
  // long-lived TURN credentials hardcoded as defaults. Now:
  //   1. Requires authentication (any logged-in user).
  //   2. Removes hardcoded defaults — server refuses to return TURN
  //      servers if METERED_TURN_URL / USERNAME / CREDENTIAL are unset.
  //   3. The frontend already calls this with the user's JWT.
  app.get('/api/webrtc/config', async (req, res) => {
    // Require auth — refuse anonymous TURN-credential harvesting.
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { verifyToken } = await import('./middleware/auth.js');
    const payload = verifyToken(authHeader.split(' ')[1]);
    if (!payload?.userId) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const turnUrl = process.env.METERED_TURN_URL;
    const turnUsername = process.env.METERED_TURN_USERNAME;
    const turnCredential = process.env.METERED_TURN_CREDENTIAL;

    const iceServers: any[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Only include TURN if all three env vars are configured (no defaults).
    if (turnUrl && turnUsername && turnCredential
        && turnUsername !== turnCredential // reject obvious copy-paste config
    ) {
      iceServers.push({
        urls: [
          `turn:${turnUrl}:80`,
          `turn:${turnUrl}:443?transport=tcp`,
          `turns:${turnUrl}:443`,
        ],
        username: turnUsername,
        credential: turnCredential,
      });
    } else if (isDev) {
      console.warn('[WEBRTC] ⚠️ TURN credentials not configured — calls will fall back to STUN-only.');
    }

    res.json({
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
  });

  // Log all registered API routes for debugging
  const registeredRoutes: string[] = [];
  app._router?.stack?.forEach((layer: any) => {
    if (layer.route) {
      registeredRoutes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
    } else if (layer.name === 'router' && layer.regexp) {
      const match = layer.regexp.toString().match(/\/api\/\w+/);
      if (match) registeredRoutes.push(`Router: ${match[0]}`);
    }
  });
  console.log('[API] Registered routes:', registeredRoutes.join(', '));

  // Diagnostics endpoint (admin only in production)
  app.get('/api/diagnostics', async (req, res) => {
    if (!isDev) {
      // In production, require admin auth for diagnostics - properly validate JWT token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      // Verify the JWT token
      const { verifyToken } = await import('./middleware/auth.js');
      const token = authHeader.split(' ')[1];
      const payload = verifyToken(token);
      if (!payload || !payload.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
    }
    const routes: string[] = [];
    app._router?.stack?.forEach((layer: any) => {
      if (layer.route) {
        routes.push(`${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.regexp) {
        const match = layer.regexp.toString().match(/\/api\/\w+/);
        if (match) routes.push(`Router: ${match[0]}`);
      }
    });
    res.json({
      status: 'ok',
      env: process.env.NODE_ENV || 'development',
      port: PORT,
      uptime: process.uptime(),
      routes,
      ts: new Date().toISOString(),
    });
  });

  // 7b. APK download endpoint (serves APK file)
  // Place APKs in /data/downloads/ or ./downloads/
  const downloadsDir = fs.existsSync('/data/downloads')
    ? '/data/downloads'
    : path.resolve(rootDir, 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log(`[SETUP] Created downloads/ directory at ${downloadsDir}`);
  }
  app.use('/download', express.static(downloadsDir, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  }));

  // Download landing page (public)
  app.get('/get-app', (_req, res) => {
    const downloadPagePath = path.resolve(rootDir, 'public', 'download.html');
    const distDownloadPath = path.resolve(rootDir, 'dist', 'client', 'download.html');
    if (fs.existsSync(distDownloadPath)) {
      res.sendFile(distDownloadPath);
    } else if (fs.existsSync(downloadPagePath)) {
      res.sendFile(downloadPagePath);
    } else {
      res.redirect('/');
    }
  });

  // ─── /download page (same as /get-app) ────────────────────────────
  // Serves the download landing page. This is separate from the
  // express.static('/download', ...) which serves APK files — that
  // only matches /download/<filename>, not /download/ by itself.
  app.get('/download', (_req, res) => {
    const downloadPagePath = path.resolve(rootDir, 'public', 'download.html');
    const distDownloadPath = path.resolve(rootDir, 'dist', 'client', 'download.html');
    if (fs.existsSync(distDownloadPath)) {
      res.sendFile(distDownloadPath);
    } else if (fs.existsSync(downloadPagePath)) {
      res.sendFile(downloadPagePath);
    } else {
      res.redirect('/get-app');
    }
  });

  // Smart install page (auto-detects platform: iOS/Android/Desktop)
  app.get('/install', (_req, res) => {
    const installPagePath = path.resolve(rootDir, 'public', 'install.html');
    const distInstallPath = path.resolve(rootDir, 'dist', 'client', 'install.html');
    if (fs.existsSync(distInstallPath)) {
      res.sendFile(distInstallPath);
    } else if (fs.existsSync(installPagePath)) {
      res.sendFile(installPagePath);
    } else {
      res.redirect('/get-app');
    }
  });

  // ─── Standalone Chat App (lightweight, Messenger-like) ────────────
  // Serves chat.html which loads only chat-related code (~15KB vs 1.2MB
  // for the full app). Used by the "Nawaqes Chat" APK.
  app.get('/chat-app', (_req, res) => {
    res.redirect('/#/chat-app');
  });

  // Firebase setup guide page (interactive Arabic guide)
  app.get('/firebase-setup', (_req, res) => {
    const setupPagePath = path.resolve(rootDir, 'public', 'firebase-setup.html');
    const distSetupPath = path.resolve(rootDir, 'dist', 'client', 'firebase-setup.html');
    if (fs.existsSync(distSetupPath)) {
      res.sendFile(distSetupPath);
    } else if (fs.existsSync(setupPagePath)) {
      res.sendFile(setupPagePath);
    } else {
      res.redirect('/get-app');
    }
  });

  // Interactive Firebase config collector (auto-generates config JSON)
  app.get('/firebase-setup-interactive', (_req, res) => {
    const setupPagePath = path.resolve(rootDir, 'public', 'firebase-setup-interactive.html');
    const distSetupPath = path.resolve(rootDir, 'dist', 'client', 'firebase-setup-interactive.html');
    if (fs.existsSync(distSetupPath)) {
      res.sendFile(distSetupPath);
    } else if (fs.existsSync(setupPagePath)) {
      res.sendFile(setupPagePath);
    } else {
      res.redirect('/firebase-setup');
    }
  });

  // Serve download.html at /download too (for cleaner URL)
  app.get('/download.html', (_req, res) => {
    const downloadPagePath = path.resolve(rootDir, 'public', 'download.html');
    const distDownloadPath = path.resolve(rootDir, 'dist', 'client', 'download.html');
    if (fs.existsSync(distDownloadPath)) {
      res.sendFile(distDownloadPath);
    } else if (fs.existsSync(downloadPagePath)) {
      res.sendFile(downloadPagePath);
    } else {
      res.redirect('/get-app');
    }
  });

  // ===========================================
  // 7c. Firebase config endpoint (public, no secrets)
  // ===========================================
  app.get('/api/notifications/firebase-config', (_req, res) => {
    res.json({
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID || 'nawaqes-app'}.firebaseapp.com`,
      projectId: process.env.FIREBASE_PROJECT_ID || 'nawaqes-app',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID || 'nawaqes-app'}.appspot.com`,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
      vapidKey: process.env.FIREBASE_VAPID_KEY || '',
    });
  });

  // ===========================================
  // 7d. Device registration for push notifications
  // Auth is required: an unauthenticated caller must not be able to
  // supply an arbitrary token and DELETE/UPDATE rows belonging to other
  // users. Guest (anonymous) device registration is intentionally removed
  // — only logged-in users receive push notifications anyway.
  // ===========================================
  app.post('/api/notifications/register-device', async (req, res) => {
    try {
      const { token, platform } = req.body;
      if (!token || !platform) {
        res.status(400).json({ error: 'token and platform required' });
        return;
      }
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      const userId: string = payload.userId || payload.sub || '';
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      // Save or update device token in database
      try {
        const db = (await import('./database/index.js')).default;
        // Remove token from any other user (a token can only belong to one user)
        db.prepare('DELETE FROM devices WHERE token = ? AND user_id != ?').run(token, userId);
        // Upsert device token
        const existing = db.prepare('SELECT id FROM devices WHERE token = ?').get(token) as any;
        if (existing) {
          db.prepare('UPDATE devices SET user_id = ?, platform = ?, updated_at = datetime(\'now\') WHERE token = ?').run(userId, platform, token);
        } else {
          db.prepare('INSERT INTO devices (user_id, token, platform) VALUES (?, ?, ?)').run(userId, token, platform);
        }
      } catch (dbErr: any) {
        console.warn('[FCM] Failed to save device token:', dbErr.message);
      }
      console.log(`[FCM] Device registered: platform=${platform}, user=${userId}`);
      res.json({ success: true, registered: true });
    } catch (err: any) {
      console.error('[FCM] register-device error:', err.message);
      res.status(500).json({ error: 'Failed to register device' });
    }
  });

  // Topic subscription
  app.post('/api/notifications/subscribe', async (req, res) => {
    try {
      const { topic } = req.body;
      if (!topic) {
        res.status(400).json({ error: 'topic required' });
        return;
      }
      console.log(`[FCM] Topic subscription: ${topic}`);
      res.json({ success: true, subscribed: true, topic });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to subscribe' });
    }
  });

  // Send push notification to a specific user or broadcast to all
  app.post('/api/notifications/send', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload?.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
      const { userId: targetUserId, userIds: targetUserIds, title, body, data, topic } = req.body;
      if (!title || !body) {
        res.status(400).json({ error: 'title and body required' });
        return;
      }

      // Broadcast to all users
      if (targetUserId === 'all' || (targetUserIds && targetUserIds.length === 0)) {
        const db = (await import('./database/index.js')).default;
        const allUsers = db.prepare('SELECT id FROM users WHERE is_deactivated = 0').all() as any[];
        const { sendPushToUsers } = await import('./services/pushNotifications.js');
        const result = await sendPushToUsers(allUsers.map(u => u.id), title, body, data);
        res.json({ success: true, broadcast: true, totalUsers: allUsers.length, ...result });
        return;
      }

      // Send to specific user IDs list
      if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
        const { sendPushToUsers } = await import('./services/pushNotifications.js');
        const result = await sendPushToUsers(targetUserIds, title, body, data);
        res.json({ success: true, ...result });
        return;
      }

      // Send to a topic
      if (topic) {
        const { sendPushToTopic } = await import('./services/pushNotifications.js');
        const result = await sendPushToTopic(topic, title, body, data);
        res.json({ success: true, ...result });
        return;
      }

      // Send to a single user
      if (!targetUserId) {
        res.status(400).json({ error: 'userId, userIds, or topic required' });
        return;
      }
      const { sendPushToUser } = await import('./services/pushNotifications.js');
      const result = await sendPushToUser(targetUserId, title, body, data);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // FCM diagnostics endpoint (admin only)
  app.get('/api/notifications/fcm-status', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload?.isAdmin) { res.status(403).json({ error: 'Admin access required' }); return; }
      const { getFCMStatus } = await import('./services/pushNotifications.js');
      const db = (await import('./database/index.js')).default;
      const deviceCount = (db.prepare('SELECT COUNT(*) as count FROM devices').get() as any).count;
      const status = getFCMStatus();
      res.json({ ...status, registeredDevices: deviceCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Story API Endpoints ───
  app.get('/api/stories', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      let userId = '';
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const { verifyToken } = await import('./middleware/auth.js');
          const p = verifyToken(authHeader.split(' ')[1]);
          if (p) userId = p.userId || p.sub || '';
        } catch {}
      }
      // Get stories from last 24 hours only
      const stories = db.prepare(`
        SELECT s.*, u.name as user_name, u.avatar as user_avatar,
          (SELECT COUNT(*) FROM story_views WHERE story_id = s.id) as view_count,
          CASE WHEN sv.id IS NOT NULL THEN 1 ELSE 0 END as is_seen
        FROM stories s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN story_views sv ON sv.story_id = s.id AND sv.user_id = ?
        WHERE s.created_at >= datetime('now', '-24 hours')
        ORDER BY s.created_at DESC
      `).all(userId) as any[];
      
      const result = stories.map(s => ({
        id: s.id,
        user: { id: s.user_id, name: s.user_name, avatar: s.user_avatar },
        image: s.image || '',
        type: s.type || 'image',
        text: s.text || '',
        backgroundColor: s.background_color || '',
        videoUrl: s.video_url || '',
        isSeen: !!s.is_seen,
        viewCount: s.view_count,
        createdAt: s.created_at,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/stories/:id/view', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const storyId = req.params.id;
      db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id) VALUES (?, ?)').run(storyId, userId);
      db.prepare('UPDATE stories SET is_seen = 1 WHERE id = ?').run(storyId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/stories/:id/reply', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const storyId = req.params.id;
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: 'text required' }); return; }
      const id = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO story_replies (id, story_id, user_id, text) VALUES (?, ?, ?, ?)').run(id, storyId, userId, text);
      // Notify story owner
      const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(storyId) as any;
      if (story && story.user_id !== userId) {
        const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
        const notifId = crypto.randomBytes(16).toString('hex');
        const notifMsg = `${user?.name || 'مستخدم'} رد على قصتك`;
        const notifLink = `/messages?contact=${userId}`;
        db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
          notifId, story.user_id, 'message', notifMsg, notifLink
        );
        try {
          const { wsManager } = await import('./websocket/index.js');
          wsManager.emitNotification(story.user_id, {
            id: notifId,
            type: 'message',
            message: notifMsg,
            time: new Date().toISOString(),
            link: notifLink,
          });
        } catch {}
      }
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/stories/:id/react', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const storyId = req.params.id;
      const { emoji } = req.body;
      if (!emoji) { res.status(400).json({ error: 'emoji required' }); return; }
      // Toggle reaction
      const existing = db.prepare('SELECT id FROM story_reactions WHERE story_id = ? AND user_id = ? AND emoji = ?').get(storyId, userId, emoji) as any;
      if (existing) {
        db.prepare('DELETE FROM story_reactions WHERE id = ?').run(existing.id);
        res.json({ success: true, reacted: false });
      } else {
        const id = crypto.randomBytes(16).toString('hex');
        db.prepare('INSERT INTO story_reactions (id, story_id, user_id, emoji) VALUES (?, ?, ?, ?)').run(id, storyId, userId, emoji);
        // Notify story owner
        const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(storyId) as any;
        if (story && story.user_id !== userId) {
          const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
          const notifId = crypto.randomBytes(16).toString('hex');
          const notifMsg = `${user?.name || 'مستخدم'} تفاعل مع قصتك ${emoji}`;
          // Use type='story_reaction' (not 'like') so it shows up in the
          // notifications list — GET /api/notifications filters out 'like'.
          db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
            notifId, story.user_id, 'story_reaction', notifMsg, null
          );
          try {
            const { wsManager } = await import('./websocket/index.js');
            wsManager.emitNotification(story.user_id, {
              id: notifId,
              type: 'story_reaction',
              message: notifMsg,
              time: new Date().toISOString(),
              link: null,
            });
          } catch {}
        }
        res.json({ success: true, reacted: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stories/:id/viewers', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const storyId = req.params.id;
      // Verify story belongs to user
      const story = db.prepare('SELECT user_id FROM stories WHERE id = ?').get(storyId) as any;
      if (!story) { res.status(404).json({ error: 'Story not found' }); return; }
      const userId = payload.userId || payload.sub;
      if (story.user_id !== userId && !payload.isAdmin) {
        res.status(403).json({ error: 'Not your story' }); return;
      }
      const viewers = db.prepare(`
        SELECT sv.*, u.name, u.avatar FROM story_views sv
        JOIN users u ON u.id = sv.user_id
        WHERE sv.story_id = ?
        ORDER BY sv.created_at DESC
      `).all(storyId) as any[];
      res.json(viewers);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Withdrawal API now handled in routes/wallet.ts ───

  // ─── Story Highlights API ───
  app.get('/api/users/:userId/highlights', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const { userId } = req.params;
      const highlights = db.prepare(`
        SELECT h.*, 
          (SELECT COUNT(*) FROM highlight_stories WHERE highlight_id = h.id) as story_count,
          (SELECT s.image FROM highlight_stories hs JOIN stories s ON s.id = hs.story_id WHERE hs.highlight_id = h.id LIMIT 1) as cover_image
        FROM story_highlights h
        WHERE h.user_id = ?
        ORDER BY h.created_at DESC
      `).all(userId) as any[];
      res.json(highlights);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/highlights', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const { name, storyIds } = req.body;
      if (!name || !storyIds?.length) { res.status(400).json({ error: 'name and storyIds required' }); return; }
      const id = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO story_highlights (id, user_id, name) VALUES (?, ?, ?)').run(id, userId, name);
      const insertHS = db.prepare('INSERT OR IGNORE INTO highlight_stories (highlight_id, story_id) VALUES (?, ?)');
      for (const sid of storyIds) { insertHS.run(id, sid); }
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Delete expired stories (24h) ───
  app.delete('/api/stories/expired', async (_req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const result = db.prepare("DELETE FROM stories WHERE created_at < datetime('now', '-24 hours')").run();
      res.json({ success: true, deleted: result.changes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Report user from chat ───
  app.post('/api/report', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const { targetUserId, reason, details } = req.body;
      if (!targetUserId || !reason) { res.status(400).json({ error: 'targetUserId and reason required' }); return; }
      // Create a complaint post (reuse existing complaints system)
      const id = crypto.randomBytes(16).toString('hex');
      const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
      const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId) as any;
      db.prepare('INSERT INTO posts (id, author_id, content, type, category, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, userId, `بلاغ ضد ${targetUser?.name || 'مستخدم'}: ${reason}${details ? ' - ' + details : ''}`, 'status', 'complaint', 'active'
      );
      // Notify admins (loop over all admin users to avoid FK violation
      // when no user with id='admin' exists — users use random hex IDs).
      const notifMsg = `بلاغ جديد من ${user?.name || 'مستخدم'} ضد ${targetUser?.name || 'مستخدم'}`;
      const admins = db.prepare('SELECT id FROM users WHERE is_admin = 1 AND is_deactivated = 0').all() as any[];
      const insertNotif = db.prepare('INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)');
      for (const admin of admins) {
        const notifId = crypto.randomBytes(16).toString('hex');
        insertNotif.run(notifId, admin.id, 'warning', notifMsg);
        // Also push via WebSocket for real-time admin alert
        try {
          const { wsManager } = await import('./websocket/index.js');
          wsManager.emitNotification(admin.id, {
            id: notifId,
            type: 'warning',
            message: notifMsg,
            time: new Date().toISOString(),
            link: '/admin',
          });
        } catch {}
      }
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Scheduled Streams API ──────────────────────────────────────────
  app.get('/api/livestream/scheduled', async (_req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const streams = db.prepare(`
        SELECT ss.*, u.name as user_name, u.avatar as user_avatar
        FROM scheduled_streams ss
        JOIN users u ON u.id = ss.user_id
        WHERE ss.scheduled_at >= datetime('now')
        ORDER BY ss.scheduled_at ASC
        LIMIT 50
      `).all() as any[];
      res.json(streams);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/livestream/schedule', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const { title, description, scheduledAt, durationMinutes, category } = req.body;
      if (!title || !scheduledAt) { res.status(400).json({ error: 'title and scheduledAt required' }); return; }
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) { res.status(400).json({ error: 'يجب أن يكون الموعد في المستقبل' }); return; }
      const id = crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO scheduled_streams (id, user_id, title, description, scheduled_at, duration_minutes, category) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id, userId, title, description || '', scheduledAt, durationMinutes || 60, category || ''
      );
      // Notify friends about scheduled stream
      try {
        const { sendPushToUsers } = await import('./services/pushNotifications.js');
        const friends = db.prepare('SELECT requester_id as fid FROM friendships WHERE addressee_id = ? AND status = ? UNION SELECT addressee_id as fid FROM friendships WHERE requester_id = ? AND status = ?').all(userId, 'accepted', userId, 'accepted') as any[];
        if (friends.length > 0) {
          const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
          const friendIds = friends.map((f: any) => f.fid);
          sendPushToUsers(friendIds, 'بث مباشر مجدول', `${user?.name || 'مستخدم'} جدول بث مباشر: ${title}`, { type: 'livestream', link: `/live-stream/${userId}` }).catch(() => {});
        }
      } catch {}
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/livestream/schedule/:id/remind', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const streamId = req.params.id;
      // Save reminder in stream_reminders table
      try {
        db.prepare('INSERT OR IGNORE INTO stream_reminders (stream_id, user_id) VALUES (?, ?)').run(streamId, userId);
      } catch {}
      db.prepare('UPDATE scheduled_streams SET reminder_count = reminder_count + 1 WHERE id = ?').run(streamId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/api/livestream/schedule/:id', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const streamId = req.params.id;
      const stream = db.prepare('SELECT user_id FROM scheduled_streams WHERE id = ?').get(streamId) as any;
      if (!stream) { res.status(404).json({ error: 'Not found' }); return; }
      if (stream.user_id !== userId && !payload.isAdmin) { res.status(403).json({ error: 'Not your stream' }); return; }
      db.prepare('DELETE FROM scheduled_streams WHERE id = ?').run(streamId);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ─── Stream Gifts/Tips API ──────────────────────────────────────
  const GIFT_TYPES = [
    { id: 'rose', name: '🌹 وردة', amount: 5 },
    { id: 'heart', name: '❤️ قلب', amount: 10 },
    { id: 'star', name: '⭐ نجمة', amount: 25 },
    { id: 'crown', name: '👑 تاج', amount: 50 },
    { id: 'diamond', name: '💎 ألماسة', amount: 100 },
    { id: 'rocket', name: '🚀 صاروخ', amount: 200 },
  ];

  app.get('/api/livestream/gifts', (_req, res) => {
    res.json(GIFT_TYPES);
  });

  app.post('/api/livestream/gift', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return; }
      const { verifyToken } = await import('./middleware/auth.js');
      const payload = verifyToken(authHeader.split(' ')[1]);
      if (!payload) { res.status(401).json({ error: 'Invalid token' }); return; }
      const userId = payload.userId || payload.sub;
      const { streamId, receiverId, giftType, message } = req.body;
      if (!streamId || !receiverId || !giftType) { res.status(400).json({ error: 'streamId, receiverId, giftType required' }); return; }

      const gift = GIFT_TYPES.find(g => g.id === giftType);
      if (!gift) { res.status(400).json({ error: 'Invalid gift type' }); return; }

      // Atomic balance check + deduction + receiver credit + gift record + tx records.
      // All five operations must either succeed together or fail together so
      // we never lose or duplicate money on a partial failure.
      const sender = db.prepare('SELECT wallet_balance, name FROM users WHERE id = ?').get(userId) as any;
      if (!sender || sender.wallet_balance < gift.amount) { res.status(400).json({ error: 'رصيد غير كافي' }); return; }

      const receiverAmount = gift.amount * 0.9;
      const giftId = crypto.randomBytes(16).toString('hex');
      const txId1 = crypto.randomBytes(16).toString('hex');
      const txId2 = crypto.randomBytes(16).toString('hex');
      const notifId = crypto.randomBytes(16).toString('hex');

      db.transaction(() => {
        // Conditional UPDATE: only succeeds if balance is still ≥ amount.
        // Closes the race where two concurrent gifts both pass the outer check.
        const deductResult = db.prepare(
          'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?'
        ).run(gift.amount, userId, gift.amount);
        if (deductResult.changes === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        db.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?').run(receiverAmount, receiverId);

        db.prepare('INSERT INTO stream_gifts (id, stream_id, sender_id, receiver_id, gift_type, gift_name, amount, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          giftId, streamId, userId, receiverId, giftType, gift.name, gift.amount, message || ''
        );

        db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?, ?)').run(
          txId1, userId, 'gift_sent', gift.amount, 'wallet', 'completed'
        );
        db.prepare('INSERT INTO transactions (id, user_id, type, amount, method, status) VALUES (?, ?, ?, ?, ?, ?)').run(
          txId2, receiverId, 'gift_received', receiverAmount, 'wallet', 'completed'
        );

        db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
          notifId, receiverId, 'payment', `استلمت ${gift.name} من ${sender.name}`, '/wallet'
        );
      })();

      // Notify receiver via WebSocket (outside the transaction).
      // Use sendToUser with a raw object (NOT pre-stringified) so the
      // WS layer's internal JSON.stringify produces the correct shape.
      try {
        const { wsManager } = await import('./websocket/index.js');
        wsManager.sendToUser(receiverId, {
          type: 'livestream:gift',
          data: { gift: { id: giftId, giftType, giftName: gift.name, amount: gift.amount, senderName: sender.name, message } }
        });
      } catch {}

      res.json({ success: true, id: giftId, amount: gift.amount, giftName: gift.name });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/livestream/:streamId/gifts', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const streamId = req.params.streamId;
      const gifts = db.prepare(`
        SELECT sg.*, u.name as sender_name, u.avatar as sender_avatar
        FROM stream_gifts sg
        JOIN users u ON u.id = sg.sender_id
        WHERE sg.stream_id = ?
        ORDER BY sg.created_at DESC
        LIMIT 100
      `).all(streamId) as any[];
      res.json(gifts);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/livestream/:streamId/gift-stats', async (req, res) => {
    try {
      const db = (await import('./database/index.js')).default;
      const streamId = req.params.streamId;
      const stats = db.prepare(`
        SELECT gift_type, gift_name, COUNT(*) as count, SUM(amount) as total_amount
        FROM stream_gifts
        WHERE stream_id = ?
        GROUP BY gift_type
        ORDER BY count DESC
      `).all(streamId) as any[];
      const total = db.prepare('SELECT SUM(amount) as total FROM stream_gifts WHERE stream_id = ?').get(streamId) as any;
      res.json({ stats, total: total?.total || 0 });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // 7e. API 404 handler (MUST be after all /api/* routes, before Vite catch-all)
  app.use('/api', (req, res) => {
    console.log(`[404] API route not found: ${req.method} ${req.path}`);
    res.status(404).json({ error: 'API endpoint not found', path: req.path, method: req.method });
  });

  // ════════════════════════════════════════════════════════════════════
  // 7f. Social Media Share — Server-side OG meta tags for /post/:id
  // ════════════════════════════════════════════════════════════════════
  // When a post link is shared on WhatsApp/Facebook/Twitter, their crawlers
  // DON'T execute JavaScript. With hash-based routing (/#/post/:id), the
  // server only sees '/' and returns the generic index.html — so the share
  // preview is empty.
  //
  // This route (/post/:id — no hash) returns HTML with dynamic Open Graph
  // meta tags (title, description, image) for the specific post. Social
  // media crawlers will read these tags and show a rich preview.
  //
  // The HTML includes a redirect to /#/post/:id so real users land on the
  // SPA page, while crawlers read the OG tags.
  app.get('/post/:id', async (req, res) => {
    try {
      const postId = req.params.id;
      const db = (await import('./database/index.js')).default;

      // Get post with author info
      const post = db.prepare(`
        SELECT p.id, p.content, p.image, p.type, p.price, p.currency, p.created_at,
               u.name as author_name, u.avatar, u.avatar_base64
        FROM posts p
        LEFT JOIN users u ON p.author_id = u.id
        WHERE p.id = ? AND p.status = 'active'
      `).get(postId) as any;

      const origin = `https://${req.headers.host}`;
      const appUrl = origin; // Always use the actual host, not APP_URL env

      // Default OG values (if post not found)
      let ogTitle = 'نواقص | Nawaqes - منصة الإعلانات الذكية';
      let ogDescription = 'منصة الإعلانات الذكية الأولى - مساعد ذكاء اصطناعي، محفظة إلكترونية، وسوق متكامل';
      let ogImage = `${origin}/icons/og-image.png`;
      let ogUrl = `${appUrl}/#/post/${postId}`;

      if (post) {
        // Build dynamic OG tags from post data
        const authorName = post.author_name || 'مستخدم نواقص';
        const contentPreview = (post.content || '').slice(0, 200);
        const priceText = post.price ? ` — ${post.price} ${post.currency || 'ج.م'}` : '';

        ogTitle = `${authorName}${priceText}`;
        ogDescription = contentPreview || 'منشور على نواقص';
        ogUrl = `${appUrl}/#/post/${postId}`;

        // Get first image from post
        if (post.image) {
          try {
            const parsed = JSON.parse(post.image);
            const images = Array.isArray(parsed) ? parsed : [post.image];
            if (images.length > 0 && images[0]) {
              const img = images[0];
              ogImage = img.startsWith('http') ? img : `${origin}${img}`;
            }
          } catch {
            if (post.image.startsWith('http')) {
              ogImage = post.image;
            } else {
              ogImage = `${origin}${post.image}`;
            }
          }
        } else if (post.avatar_base64) {
          ogImage = post.avatar_base64;
        } else if (post.avatar && post.avatar.startsWith('http')) {
          ogImage = post.avatar;
        }
      }

      // Return HTML with OG meta tags + redirect for real users
      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Open Graph (Facebook, WhatsApp, LinkedIn) -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${ogTitle.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${ogDescription.replace(/"/g, '&quot;')}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:site_name" content="نواقص" />
  <meta property="og:locale" content="ar_AR" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${ogDescription.replace(/"/g, '&quot;')}" />
  <meta name="twitter:image" content="${ogImage}" />

  <title>${ogTitle.replace(/</g, '&lt;')}</title>

  <!-- Redirect real users to the SPA -->
  <script>
    window.location.href = '${ogUrl}';
  </script>
  <meta http-equiv="refresh" content="0;url=${ogUrl}" />
</head>
<body>
  <p>جارٍ التحويل... <a href="${ogUrl}">اضغط هنا</a></p>
</body>
</html>`;

      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (err: any) {
      console.error('[OG] Post share error:', err.message);
      res.redirect(`/#/post/${req.params.id}`);
    }
  });

  // 8. Vite middleware (dev) / Static files (prod)
  // This is LAST because it acts as a catch-all for non-API requests
  if (isDev) {
    const vite = await createViteServer({
      root: rootDir,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve built frontend from dist/client
    const clientPath = path.resolve(rootDir, 'dist', 'client');
    // Fallback to dist/ if dist/client doesn't exist (local builds)
    const distPath = fs.existsSync(clientPath) ? clientPath : path.resolve(rootDir, 'dist');
    console.log(`[PROD] Serving static files from: ${distPath}`);
    app.use(express.static(distPath, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
      // index.html should NOT be cached — it references the latest
      // hashed JS bundle. Cached HTML = stale content after deploys.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));

    // SPA fallback: only for routes that don't match a static file
    // Excludes: /api/*, /download/*, /uploads/*, /get-app, /health
    app.get('*', (req, res, next) => {
      // Skip API and known paths
      if (req.path.startsWith('/api/') ||
          req.path.startsWith('/download/') ||
          req.path.startsWith('/uploads/') ||
          req.path === '/get-app' ||
          req.path === '/health' ||
          req.path === '/manifest.webmanifest' ||
          req.path === '/sw.js' ||
          req.path === '/offline.html' ||
          req.path.startsWith('/icons/')) {
        return next();
      }
      // CRITICAL: index.html must NEVER be cached — it contains the
      // reference to the latest hashed JS bundle. If cached, users
      // see stale content after deploys.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // General error handler
  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    res.status(err.status || 500).json({
      error: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack }),
    });
  });

  // --- Create HTTP server and attach WebSocket ---
  const server = createHttpServer(app);

  // 🔒 Dynamic import here (after env loaded + DB initialized) to avoid
  // pulling database/index.ts into the module graph before dotenv.config().
  const { wsManager } = await import('./websocket/index.js');

  // Initialize WebSocket server
  wsManager.initialize(server);

  // Make wsManager available to route handlers via app.locals
  app.locals.wsManager = wsManager;

  // --- Start Server ---
  server.listen(PORT, '0.0.0.0', async () => {
    console.log('');
    console.log('================================================');
    console.log(`  Nawaqes Server running on http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log('================================================');
    console.log('');

    if (isDev) {
      console.log('[DEV] Vite HMR is active. Rate limit: 500/10s.');
    } else {
      console.log('[PROD] Security headers enabled. Rate limit: 100/min.');
      console.log('[PROD] JWT_SECRET: ✅ Configured');
      console.log('[PROD] HSTS: ✅ Enabled');
    }

    // 🔧 Initialize auto-backup system
    try {
      const { initAutoBackup, createManualBackup, getBackupStats, createEventBackup, backupUploadsToHF } = await import('./database/backup-system.js');
      const { authMiddleware: authMid } = await import('./middleware/auth.js');
      initAutoBackup();

      // ─── Chat v2 cron jobs ───────────────────────────────────────
      // 1. Delete expired (disappearing) messages every 30 seconds
      // 2. Publish scheduled messages every 30 seconds
      setInterval(async () => {
        try {
          const dbMod = (await import('./database/index.js')).default;
          // Delete expired messages
          const expired = dbMod.prepare("DELETE FROM chat_messages WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run();
          if (expired.changes > 0) console.log(`[CHAT] Deleted ${expired.changes} expired messages`);
          // Publish scheduled messages
          const due = dbMod.prepare("SELECT * FROM chat_messages WHERE is_scheduled = 1 AND scheduled_at <= datetime('now')").all() as any[];
          for (const msg of due) {
            dbMod.prepare('UPDATE chat_messages SET is_scheduled = 0 WHERE id = ?').run(msg.id);
            try {
              const { wsManager } = await import('./websocket/index.js');
              if (msg.group_id) {
                wsManager.broadcast({ type: 'chat:message', data: { ...msg, is_scheduled: 0 } });
              } else if (msg.receiver_id) {
                wsManager.sendToUser(msg.receiver_id, { type: 'chat:message', data: { ...msg, is_scheduled: 0 } });
              }
            } catch {}
          }
          if (due.length > 0) console.log(`[CHAT] Published ${due.length} scheduled messages`);
        } catch {}
      }, 30000);

      // ─── Channel auto-verify + auto-deactivate cron ──────────────
      // Runs every 5 minutes:
      // 1. Auto-verify channels that reach 10,000 subscribers
      // 2. Auto-deactivate channels with no activity for 30 days
      setInterval(async () => {
        try {
          const dbMod = (await import('./database/index.js')).default;

          // 1. Auto-verify at 10,000 subscribers
          const toVerify = dbMod.prepare(`
            UPDATE channels
            SET is_verified = 1
            WHERE is_verified = 0
              AND (SELECT COUNT(*) FROM channel_subscribers WHERE channel_id = channels.id) >= 10000
          `).run();
          if (toVerify.changes > 0) console.log(`[CHANNELS] Auto-verified ${toVerify.changes} channels (reached 10K subs)`);

          // 2. Auto-deactivate after 30 days of inactivity
          // "last_activity" column tracks the last post/stream/subscription event.
          // If no activity for 30 days, set status to 'inactive'.
          const toDeactivate = dbMod.prepare(`
            UPDATE channels
            SET status = 'inactive'
            WHERE status = 'active'
              AND last_activity IS NOT NULL
              AND last_activity < datetime('now', '-30 days')
          `).run();
          if (toDeactivate.changes > 0) console.log(`[CHANNELS] Auto-deactivated ${toDeactivate.changes} channels (30 days inactive)`);
        } catch (err: any) {
          console.warn('[CHANNELS] Auto cron error:', err.message);
        }
      }, 5 * 60 * 1000); // every 5 minutes

      // Manual backup endpoint (admin only)
      app.post('/api/admin/backup', authMid, async (req: express.Request, res: express.Response) => {
        try {
          const payload = (req as any).user as any;
          if (!payload.isAdmin) { res.status(403).json({ error: 'ممنوع' }); return; }
          createManualBackup();
          res.json({ success: true, message: 'تم إنشاء نسخة احتياطية' });
        } catch (err: any) {
          res.status(500).json({ error: 'فشل النسخ الاحتياطي', details: err.message });
        }
      });

      // Backup stats endpoint (admin only)
      app.get('/api/admin/backup-stats', authMid, async (req: express.Request, res: express.Response) => {
        try {
          const payload = (req as any).user as any;
          if (!payload.isAdmin) { res.status(403).json({ error: 'ممنوع' }); return; }
          res.json(getBackupStats());
        } catch (err: any) {
          res.status(500).json({ error: 'فشل جلب الإحصائيات', details: err.message });
        }
      });

      // 🔒 RADICAL FIX: Manual uploads backup endpoint (admin only)
      // Backs up ALL files in /data/uploads to HF Dataset immediately.
      // Use this after server restart to ensure all existing images are safe.
      app.post('/api/admin/backup-uploads', authMid, async (req: express.Request, res: express.Response) => {
        try {
          const payload = (req as any).user as any;
          if (!payload.isAdmin) { res.status(403).json({ error: 'ممنوع' }); return; }
          // Run in background — don't block the response
          res.json({ success: true, message: 'بدأ النسخ الاحتياطي للصور في الخلفية' });
          backupUploadsToHF();
        } catch (err: any) {
          res.status(500).json({ error: 'فشل النسخ الاحتياطي', details: err.message });
        }
      });

      // Save .env to persistent storage so it survives rebuilds
      app.post('/api/admin/persist-env', authMid, async (req: express.Request, res: express.Response) => {
        try {
          const payload = (req as any).user as any;
          if (!payload.isAdmin) { res.status(403).json({ error: 'ممنوع' }); return; }
          const fs2 = await import('fs');
          const envPath = path.resolve(process.cwd(), '.env');
          const persistentEnvPath = '/data/.env';
          if (fs2.existsSync(envPath)) {
            fs2.copyFileSync(envPath, persistentEnvPath);
            res.json({ success: true, message: 'تم حفظ الإعدادات بشكل دائم' });
          } else {
            res.status(404).json({ error: 'ملف .env غير موجود' });
          }
        } catch (err: any) {
          res.status(500).json({ error: 'فشل حفظ الإعدادات', details: err.message });
        }
      });

    } catch (err: any) {
      console.warn('[BACKUP] Init failed:', err.message);
    }
  });
}

startServer().catch((err) => {
  console.error('[STARTUP] Failed to start server:', err);
  process.exit(1);
});
