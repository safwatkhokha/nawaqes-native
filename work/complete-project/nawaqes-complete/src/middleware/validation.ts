// ─── Validation & Security Middleware (Production-Secure) ────────────
import { Request, Response, NextFunction } from 'express';

// Enhanced XSS patterns - covers more attack vectors
const XSS_PATTERNS = /<script|javascript:|on\w+=|eval\(|document\.|window\.|alert\(|prompt\(|confirm\(|expression\(|url\(|import\(|require\(|fetch\(|xmlhttprequest|\.cookie|\.location|\.href|data:\s*text\/html|vbscript:|livescript:|mocha:|<iframe|<object|<embed|<link|<meta|<base|<form/i;

// Email validation regex
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Password strength: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export function validateInput(req: Request, res: Response, next: NextFunction) {
  // Check JSON body size (increased for base64-encoded images/videos)
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 50 * 1024 * 1024) { // 50MB limit
    res.status(413).json({ error: 'حجم البيانات كبير جداً' });
    return;
  }

  // Validate POST/PUT body
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.is('application/json')) {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'بيانات غير صالحة' });
      return;
    }

    // Check for XSS patterns
    const bodyStr = JSON.stringify(req.body);
    if (XSS_PATTERNS.test(bodyStr)) {
      res.status(400).json({ error: 'يحتوي النص على محتوى غير مسموح به' });
      return;
    }

    // Validate email fields
    if (req.body.email && !EMAIL_REGEX.test(req.body.email)) {
      res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
      return;
    }

    // Validate password strength on registration/password change routes
    if (req.body.password && (req.path.includes('register') || req.path.includes('signup') || req.path.includes('change-password'))) {
      if (!PASSWORD_REGEX.test(req.body.password)) {
        res.status(400).json({ 
          error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وحرف صغير ورقم' 
        });
        return;
      }
    }

    // Validate phone number format (Egyptian)
    if (req.body.phone && req.body.phone.trim() !== '') {
      const phone = req.body.phone.replace(/[\s\-+]/g, '');
      if (!/^(01[0-9]{9}|0[2-9][0-9]{7,8})$/.test(phone)) {
        res.status(400).json({ error: 'رقم الهاتف غير صالح' });
        return;
      }
    }

    // Sanitize string lengths to prevent abuse
    const MAX_STRING_LENGTH = 5000;
    const MAX_CONTENT_LENGTH = 20000;
    const MAX_IMAGE_LENGTH = 70_000_000; // ~50MB base64 encoded (supports large videos too)
    const IMAGE_FIELDS = new Set([
      'image', 'avatar', 'avatarBase64', 'avatar_base64',
      'coverPhoto', 'cover_photo', 'imageUrl', 'image_url',
      'receipt_image', 'thumbnail_url', 'video_url', 'videoUrl',
      'video', 'videoUrl', 'media', 'mediaUrl',
    ]);
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (typeof val === 'string') {
        let maxLen: number;
        if (IMAGE_FIELDS.has(key) || val.startsWith('data:image/') || val.startsWith('data:video/')) {
          maxLen = MAX_IMAGE_LENGTH;
        } else if (key === 'content' || key === 'bio' || key === 'description' || key === 'text' || key === 'message') {
          maxLen = MAX_CONTENT_LENGTH;
        } else {
          maxLen = MAX_STRING_LENGTH;
        }
        if (val.length > maxLen) {
          res.status(400).json({ error: `الحقل "${key}" يتجاوز الحد المسموح` });
          return;
        }
      }
    }

    // Trim all string values
    req.body = trimStrings(req.body);
  }
  next();
}

function trimStrings(obj: any, skipTrim: Set<string> = new Set(['content', 'bio', 'text', 'message', 'password', 'image', 'avatar', 'avatarBase64', 'avatar_base64', 'coverPhoto', 'cover_photo', 'imageUrl', 'image_url'])): any {
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(item => trimStrings(item, skipTrim));
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string' && !skipTrim.has(key)) {
        result[key] = val.trim();
      } else if (typeof val === 'object' && val !== null) {
        result[key] = trimStrings(val, skipTrim);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
  return obj;
}

// Rate limiting (in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>;

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  // Skip rate limiting for Vite HMR and static asset requests in development
  const vitePaths = ['/@', '/node_modules', '/src/', '/@id/', '/@fs/', '/@vite/', '/@react-refresh'];
  if (process.env.NODE_ENV !== 'production' && vitePaths.some(p => req.path.startsWith(p))) {
    next();
    return;
  }
  // Skip for static assets
  if (req.path.match(/\.(js|css|map|ico|png|jpg|svg|woff2?|ttf|eot)$/)) {
    next();
    return;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const isDev = process.env.NODE_ENV !== 'production';
  const windowMs = isDev ? 10_000 : 60_000; // 10 sec in dev, 1 min in prod
  const maxRequests = isDev ? 500 : 100;    // 500 in dev, 100 in prod

  // Sweep stale entries on EVERY request so the Map can't grow unbounded
  // under a distributed attack (the previous code only swept when size > 1000).
  // The sweep is O(n) but n stays small because we sweep on every request.
  if (rateLimitMap.size > 100) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key);
    }
  }

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));

  if (entry.count > maxRequests) {
    res.status(429).json({ error: 'طلبات كثيرة جداً، حاول بعد دقيقة' });
    return;
  }
  next();
}

// Security headers (enhanced)
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Allow HF Spaces iframe embedding
  const frameAncestors = process.env.NODE_ENV === 'production'
    ? "frame-ancestors 'self' https://*.huggingface.co https://huggingface.co"
    : "frame-ancestors 'self'";
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Allow camera and microphone for WebRTC calls — previously blocked which caused permission errors
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  // CSP: in dev, Vite HMR + React Refresh need 'unsafe-eval' and 'unsafe-inline'.
  // In production we drop 'unsafe-eval' so attackers can't use eval() even if
  // they manage to inject a <script>. 'unsafe-inline' is still required
  // because the app uses inline styles (Tailwind generates some) — that's
  // a much smaller risk than 'unsafe-eval'.
  const isProd = process.env.NODE_ENV === 'production';
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  res.setHeader('Content-Security-Policy', `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' ws: wss: https:; ${frameAncestors};`);
  // Remove server identification
  res.removeHeader('X-Powered-By');
  // Add HSTS header in production
  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
}

// Validate that required fields exist in request body
export function requireFields(...fields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = fields.filter(f => !req.body[f] && req.body[f] !== 0);
    if (missing.length > 0) {
      res.status(400).json({ error: `حقول مطلوبة: ${missing.join(', ')}` });
      return;
    }
    next();
  };
}
