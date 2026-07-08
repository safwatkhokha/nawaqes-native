// ─── Push Notification Service (firebase-admin) ────────────────────
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage, type TopicMessage } from 'firebase-admin/messaging';
import db from '../database/index.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Initialize Firebase Admin SDK (lazy, supports both service account JSON and env vars)
let firebaseApp: App | null = null;
let initAttempted = false;
let fcmAvailable = false;

function initializeFirebase() {
  if (initAttempted) return;
  initAttempted = true;

  try {
    // Method 1: Service account JSON file
    const serviceAccountPath = path.resolve('/data/nawaqes-firebase-admin.json');
    const localServiceAccountPath = path.resolve(process.cwd(), 'nawaqes-firebase-admin.json');

    let serviceAccount: any = null;
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    } else if (fs.existsSync(localServiceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(localServiceAccountPath, 'utf-8'));
    }

    // Method 2: Environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
    if (!serviceAccount && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
      // Handle escaped newlines in env var
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: privateKey,
      };
    }

    if (serviceAccount) {
      // Only initialize if no apps exist yet
      if (getApps().length === 0) {
        firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        firebaseApp = getApps()[0];
      }
      fcmAvailable = true;
      console.log('[FCM] Firebase Admin SDK initialized successfully');
    } else {
      console.log('[FCM] No Firebase credentials found. Using WebSocket fallback only.');
      console.log('[FCM] To enable FCM, set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY env vars, or place nawaqes-firebase-admin.json in /data/ or project root.');
    }
  } catch (err: any) {
    console.warn('[FCM] Firebase Admin init failed:', err.message);
    console.warn('[FCM] Push notifications will use WebSocket fallback only.');
  }
}

// Check if FCM is available
export function isFCMAvailable(): boolean {
  initializeFirebase();
  return fcmAvailable;
}

// Get FCM status for diagnostics
export function getFCMStatus(): { available: boolean; appName: string | null; projectId: string | null } {
  initializeFirebase();
  return {
    available: fcmAvailable,
    appName: firebaseApp?.name || null,
    projectId: firebaseApp?.options?.projectId || process.env.FIREBASE_PROJECT_ID || null,
  };
}

// Send push notification to a specific user.
//
// Sends via:
//   1. Database (in-app notifications page)
//   2. WebSocket (real-time for online users — uses emitNotification
//      which sends the correct { type: 'notification:new', data: {...} }
//      shape that the client expects)
//   3. FCM (background push for offline users — re-enabled)
export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>): Promise<{ sent: number; push: number; ws: number }> {
  initializeFirebase();
  let pushSent = 0;
  let wsSent = 0;

  // 1. Save as in-app notification
  try {
    const notifId = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)').run(
      notifId, userId, data?.type || 'system', body, data?.link || null
    );

    // 2. Send via WebSocket (real-time for online users)
    // Use emitNotification (not sendToUser) so the payload is shaped as
    // { type: 'notification:new', data: {...} } and not double-encoded.
    try {
      const { wsManager } = await import('../websocket/index.js');
      wsManager.emitNotification(userId, {
        id: notifId,
        type: data?.type || 'system',
        message: body,
        time: new Date().toISOString(),
        link: data?.link,
      });
      wsSent = 1;
    } catch {}

    // 3. FCM push (background push for offline users)
    if (firebaseApp && fcmAvailable) {
      try {
        const devices = db.prepare('SELECT token FROM devices WHERE user_id = ?').all(userId) as any[];
        if (devices.length > 0) {
          const tokens = devices.map(d => d.token);
          const message: MulticastMessage = {
            tokens,
            notification: { title, body },
            data: data || {},
            android: { priority: 'high' },
            webpush: {
              notification: { title, body, icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', vibrate: [100, 50, 100] }
            }
          };
          const messaging = getMessaging(firebaseApp);
          const response = await messaging.sendEachForMulticast(message);
          pushSent = response.successCount;

          // Clean invalid tokens
          if (response.failureCount > 0) {
            response.responses.forEach((resp: any, idx: number) => {
              if (!resp.success && tokens[idx]) {
                try { db.prepare('DELETE FROM devices WHERE token = ?').run(tokens[idx]); } catch {}
              }
            });
          }
        }
      } catch (fcmErr: any) {
        console.warn('[FCM] Push send failed:', fcmErr.message);
      }
    }
  } catch (err: any) {
    console.error('[Push] Error:', err.message);
  }

  return { sent: pushSent + wsSent, push: pushSent, ws: wsSent };
}

// Send to multiple users — FCM DISABLED (2026-06-23).
// Only saves to DB + sends via WebSocket. No OS-level push.
export async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>): Promise<{ sent: number }> {
  let totalSent = 0;
  // Just delegate to individual sends (which now only do DB + WebSocket)
  for (const userId of userIds) {
    const result = await sendPushToUser(userId, title, body, data);
    totalSent += result.sent;
  }
  return { sent: totalSent };
}

// Send push notification to a topic (e.g., "new_posts", "promotions")
export async function sendPushToTopic(topic: string, title: string, body: string, data?: Record<string, string>): Promise<{ sent: number }> {
  initializeFirebase();

  if (!firebaseApp || !fcmAvailable) {
    console.warn('[FCM] Cannot send to topic: FCM not available');
    return { sent: 0 };
  }

  try {
    const message: TopicMessage = {
      topic,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' },
      webpush: {
        notification: { title, body, icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', vibrate: [100, 50, 100] }
      }
    };
    const messaging = getMessaging(firebaseApp);
    const response = await messaging.send(message);
    console.log('[FCM] Topic message sent:', response);
    return { sent: 1 };
  } catch (err: any) {
    console.warn('[FCM] Topic send failed:', err.message);
    return { sent: 0 };
  }
}

// ─── Auto-notification helpers ─────────────────────────────────────
// These functions send push notifications automatically for common events

// Notify user of a new like on their post
export async function notifyPostLike(postId: string, postOwnerId: string, likerName: string): Promise<void> {
  try {
    await sendPushToUser(postOwnerId, 'إعجاب جديد', `${likerName} أعجب بمنشورك`, { type: 'like', link: `/post/${postId}` });
  } catch {}
}

// Notify user of a new comment on their post
export async function notifyPostComment(postId: string, postOwnerId: string, commenterName: string, commentText: string): Promise<void> {
  try {
    const preview = commentText.length > 50 ? commentText.substring(0, 50) + '...' : commentText;
    await sendPushToUser(postOwnerId, 'تعليق جديد', `${commenterName}: ${preview}`, { type: 'comment', link: `/post/${postId}` });
  } catch {}
}

// Notify user of a new friend request
export async function notifyFriendRequest(targetUserId: string, requesterName: string): Promise<void> {
  try {
    await sendPushToUser(targetUserId, 'طلب صداقة', `${requesterName} أرسل لك طلب صداقة`, { type: 'friend_request', link: '/friends' });
  } catch {}
}

// Notify user of a new chat message
export async function notifyChatMessage(receiverId: string, senderName: string, messageText: string): Promise<void> {
  try {
    const preview = messageText.length > 40 ? messageText.substring(0, 40) + '...' : messageText;
    await sendPushToUser(receiverId, senderName, preview, { type: 'message', link: '/messages' });
  } catch {}
}

// Notify user of wallet transaction (charge approved, withdrawal processed)
export async function notifyWalletEvent(userId: string, event: string, amount: number): Promise<void> {
  try {
    const formattedAmount = amount.toLocaleString('ar-EG');
    if (event === 'charge_approved') {
      await sendPushToUser(userId, 'شحن المحفظة', `تم شحن محفظتك بمبلغ ${formattedAmount} ج.م`, { type: 'payment', link: '/wallet' });
    } else if (event === 'withdrawal_approved') {
      await sendPushToUser(userId, 'سحب معتمد', `تم اعتماد سحب ${formattedAmount} ج.م من محفظتك`, { type: 'payment', link: '/wallet' });
    } else if (event === 'withdrawal_rejected') {
      await sendPushToUser(userId, 'سحب مرفوض', `تم رفض طلب سحب ${formattedAmount} ج.م`, { type: 'payment', link: '/wallet' });
    }
  } catch {}
}

// Notify user of promotion approval/rejection
export async function notifyPromotionEvent(userId: string, event: 'approved' | 'rejected', postContent: string): Promise<void> {
  try {
    const preview = postContent.length > 30 ? postContent.substring(0, 30) + '...' : postContent;
    if (event === 'approved') {
      await sendPushToUser(userId, 'تم قبول الترويج', `تم قبول ترويج: ${preview}`, { type: 'promotion', link: '/smart-reach' });
    } else {
      await sendPushToUser(userId, 'تم رفض الترويج', `تم رفض ترويج: ${preview}`, { type: 'promotion', link: '/smart-reach' });
    }
  } catch {}
}

// Notify friends of a scheduled livestream
export async function notifyScheduledStream(userId: string, streamTitle: string): Promise<void> {
  try {
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
    const friends = db.prepare('SELECT requester_id as fid FROM friendships WHERE addressee_id = ? AND status = ? UNION SELECT addressee_id as fid FROM friendships WHERE requester_id = ? AND status = ?').all(userId, 'accepted', userId, 'accepted') as any[];
    if (friends.length > 0) {
      const friendIds = friends.map((f: any) => f.fid);
      await sendPushToUsers(friendIds, 'بث مباشر مجدول', `${user?.name || 'مستخدم'} جدول بث مباشر: ${streamTitle}`, { type: 'livestream', link: `/live-stream/${userId}` });
    }
  } catch {}
}

// Notify when a scheduled stream is about to start (called by a cron job)
export async function notifyStreamStarting(streamId: string): Promise<void> {
  try {
    const stream = db.prepare('SELECT ss.*, u.name as user_name FROM scheduled_streams ss JOIN users u ON u.id = ss.user_id WHERE ss.id = ?').get(streamId) as any;
    if (!stream) return;
    // Notify all users who set reminders
    // For now, notify the stream owner
    await sendPushToUser(stream.user_id, 'البث على وشك البدء!', `بثك "${stream.title}" سيبدأ خلال 15 دقيقة`, { type: 'livestream', link: `/live-stream/${stream.user_id}` });
  } catch {}
}

export { firebaseApp };
