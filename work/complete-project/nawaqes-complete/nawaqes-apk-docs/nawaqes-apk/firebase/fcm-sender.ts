// =====================================================
// Nawaqes — Server-side FCM sender (V1 API)
// =====================================================
// Sends push notifications via Firebase Cloud Messaging V1
// using a service account for authentication.
//
// Usage:
//   import { sendPushNotification, sendTopicNotification } from './fcm-sender';
//   await sendPushNotification(deviceToken, { title: 'نواقص', body: 'رسالة جديدة', url: '/messages' });
// =====================================================

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { createSign } from 'crypto';

// ---------- Config ----------
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/data/firebase-service-account.json';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nawaqes-app';

let cachedServiceAccount: any = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

// ---------- Load service account ----------
function loadServiceAccount(): any {
  if (cachedServiceAccount) return cachedServiceAccount;
  try {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
      console.warn('[FCM] Service account file not found at:', SERVICE_ACCOUNT_PATH);
      return null;
    }
    cachedServiceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    return cachedServiceAccount;
  } catch (err) {
    console.error('[FCM] Failed to load service account:', err);
    return null;
  }
}

// ---------- Generate OAuth2 access token (JWT) ----------
async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }

  const sa = loadServiceAccount();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // Encode JWT
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${body}`);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${body}.${signature}`;

  // Exchange JWT for access token
  return new Promise((resolve) => {
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            cachedAccessToken = {
              token: json.access_token,
              expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
            };
            resolve(json.access_token);
          } else {
            console.error('[FCM] Token exchange failed:', data);
            resolve(null);
          }
        } catch (err) {
          console.error('[FCM] Token parse error:', err);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[FCM] Token request error:', err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// ---------- Send to single device ----------
export async function sendPushNotification(
  token: string,
  notification: { title: string; body: string; url?: string; data?: Record<string, string> }
): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;

  const message = {
    message: {
      token,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        url: notification.url || '/',
        ...(notification.data || {}),
      },
      android: {
        priority: 'high' as const,
        notification: {
          icon: 'ic_launcher',
          color: '#DC2626',
          sound: 'default',
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
          channel_id: 'nawaqes_default',
        },
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/favicon-32.png',
          vibrate: [100, 50, 100],
          dir: 'rtl' as const,
          lang: 'ar',
        },
      },
    },
  };

  return sendToFCM(message, accessToken);
}

// ---------- Send to topic ----------
export async function sendTopicNotification(
  topic: string,
  notification: { title: string; body: string; url?: string }
): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;

  const message = {
    message: {
      topic,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: { url: notification.url || '/' },
      android: {
        priority: 'high' as const,
        notification: {
          icon: 'ic_launcher',
          color: '#DC2626',
          channel_id: 'nawaqes_topic',
        },
      },
    },
  };

  return sendToFCM(message, accessToken);
}

// ---------- Send to multiple devices ----------
export async function sendMulticastNotification(
  tokens: string[],
  notification: { title: string; body: string; url?: string }
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;

  // FCM V1 doesn't support multicast natively, so send individually (parallelized)
  const batchSize = 50;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(token => sendPushNotification(token, notification))
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) successCount++;
      else failureCount++;
    }
  }

  return { successCount, failureCount };
}

// ---------- Internal HTTP call ----------
function sendToFCM(message: any, accessToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const postData = JSON.stringify(message);
    const req = https.request({
      hostname: 'fcm.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/messages:send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error('[FCM] Send failed:', res.statusCode, data);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('[FCM] Request error:', err);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}
