// =====================================================
// Nawaqes — FCM Test Script
// Sends a test push notification to verify setup.
// =====================================================
// Usage:
//   node test-push.js <DEVICE_TOKEN> [TITLE] [BODY]
// =====================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/data/firebase-service-account.json';
const PROJECT_ID = 'nawaqes-app';

const deviceToken = process.argv[2];
const title = process.argv[3] || '🎉 نواقص';
const body = process.argv[4] || 'مرحباً بك! نظام الإشعارات يعمل بنجاح';

if (!deviceToken) {
  console.error('Usage: node test-push.js <DEVICE_TOKEN> [TITLE] [BODY]');
  console.error('Get your device token from the browser console after enabling notifications.');
  process.exit(1);
}

function loadSA() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('ERROR: Service account file not found at:', SERVICE_ACCOUNT_PATH);
    console.error('Download it from Firebase Console > Project Settings > Service Accounts > Generate New Private Key');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
}

async function getAccessToken() {
  const sa = loadSA();
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${header}.${payload}.${signature}`;

  const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
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
        const json = JSON.parse(data);
        if (json.access_token) resolve(json.access_token);
        else reject(new Error(`Token exchange failed: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendPush() {
  console.log('Loading service account from:', SERVICE_ACCOUNT_PATH);
  const accessToken = await getAccessToken();
  console.log('Got access token ✓');

  const message = {
    message: {
      token: deviceToken,
      notification: { title, body },
      data: { url: '/' },
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_launcher',
          color: '#DC2626',
          channel_id: 'nawaqes_default',
        },
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/favicon-32.png',
          vibrate: [100, 50, 100],
          dir: 'rtl',
          lang: 'ar',
        },
      },
    },
  };

  return new Promise((resolve, reject) => {
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
          console.log('\n✅ Push sent successfully!');
          console.log('Response:', data);
          resolve();
        } else {
          console.error(`\n❌ Push failed (${res.statusCode}):`, data);
          reject(new Error(data));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

sendPush().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
