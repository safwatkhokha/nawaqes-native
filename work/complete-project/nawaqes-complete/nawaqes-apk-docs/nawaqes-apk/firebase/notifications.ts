// =====================================================
// Nawaqes - Firebase Push Notification Integration
// =====================================================
// Drop-in module for both PWA (Web Push) and Capacitor (Native FCM).
// Usage:
//   import { initNotifications, requestPermission, subscribeToTopic }
//     from './firebase/notifications';
//
//   // On app startup:
//   await initNotifications();
//
//   // When user logs in:
//   const token = await requestPermission();
//   await fetch('/api/notifications/register-device', {
//     method: 'POST', body: JSON.stringify({ token, platform: 'web' })
//   });
// =====================================================

// ---------- Config ----------
type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  vapidKey: string;
};

// Loaded from server to avoid hard-coding in the bundle
let firebaseConfig: FirebaseConfig | null = null;
let messaging: any = null;
let isCapacitor = false;

// Detect Capacitor runtime (native Android)
if (typeof window !== 'undefined') {
  isCapacitor = (window as any).Capacitor?.isNativePlatform?.() ?? false;
}

// ---------- Init ----------
export async function loadFirebaseConfig(): Promise<FirebaseConfig | null> {
  try {
    const res = await fetch('/api/notifications/firebase-config');
    if (!res.ok) return null;
    const cfg = await res.json();
    firebaseConfig = cfg;
    return cfg;
  } catch (err) {
    console.warn('[Notifications] Could not load Firebase config:', err);
    return null;
  }
}

export async function initNotifications(): Promise<void> {
  if (isCapacitor) {
    return initCapacitorNotifications();
  }
  return initWebNotifications();
}

// ---------- Web (PWA) ----------
async function initWebNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('[Notifications] Web Notifications API not supported');
    return;
  }

  const cfg = await loadFirebaseConfig();
  if (!cfg) {
    console.warn('[Notifications] No Firebase config — push disabled');
    return;
  }

  try {
    // Lazy-load Firebase
    const { initializeApp } = await import('firebase/app');
    const { getMessaging, onMessage, getToken } = await import('firebase/messaging');

    const app = initializeApp(cfg);
    messaging = getMessaging(app);

    // Foreound message handler
    onMessage(messaging, (payload: any) => {
      console.log('[FCM] Foreground message:', payload);
      showLocalNotification(payload);
    });

    console.log('[Notifications] Firebase Messaging initialized (web)');
  } catch (err) {
    console.error('[Notifications] Firebase init failed:', err);
  }
}

// ---------- Capacitor (Native Android) ----------
async function initCapacitorNotifications() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    await PushNotifications.requestPermissions();
    await PushNotifications.register();

    PushNotifications.addListener('registration', (token: any) => {
      console.log('[FCM] Native device token:', token.value);
      sendTokenToServer(token.value, 'android-native');
    });

    PushNotifications.addListener('registrationError', (err: any) => {
      console.error('[FCM] Native registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      console.log('[FCM] Native notification received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      console.log('[FCM] Native notification action:', action);
      const data = action.notification?.data || {};
      if (data.url) {
        // 🔒 SECURITY FIX: validate URL before navigating. Previously an
        // attacker-controlled FCM payload with url: "javascript:..." would
        // execute arbitrary JS in the WebView. Only allow http(s) URLs,
        // and only same-origin or app-internal paths.
        const raw = String(data.url);
        try {
          const u = new URL(raw, window.location.origin);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            // For absolute URLs, require same origin to prevent open-redirect
            // abuse via FCM. Relative URLs are resolved against current origin.
            if (u.origin === window.location.origin || raw.startsWith('/') || raw.startsWith('?') || raw.startsWith('#')) {
              window.location.href = u.toString();
            } else {
              console.warn('[FCM] Refusing cross-origin navigation URL from push payload:', raw);
            }
          } else {
            console.warn('[FCM] Refusing non-http(s) URL from push payload:', raw);
          }
        } catch {
          console.warn('[FCM] Invalid URL in push payload:', raw);
        }
      }
    });

    console.log('[Notifications] Capacitor Push registered');
  } catch (err) {
    console.error('[Notifications] Capacitor init failed:', err);
  }
}

// ---------- Permission & Token ----------
export async function requestPermission(): Promise<string | null> {
  if (isCapacitor) {
    // On native, registration happens in initNotifications()
    return null;
  }

  if (!('Notification' in window)) return null;
  if (!messaging || !firebaseConfig) {
    await initWebNotifications();
  }
  if (!messaging) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('[Notifications] Permission denied');
    return null;
  }

  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey: firebaseConfig!.vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });
    if (token) {
      console.log('[FCM] Web device token:', token);
      await sendTokenToServer(token, 'web-pwa');
    }
    return token;
  } catch (err) {
    console.error('[FCM] getToken failed:', err);
    return null;
  }
}

// ---------- Server Registration ----------
async function sendTokenToServer(token: string, platform: string) {
  try {
    const authToken = localStorage.getItem('nawaqes_token') || '';
    await fetch('/api/notifications/register-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token, platform }),
    });
  } catch (err) {
    console.error('[FCM] Failed to register device:', err);
  }
}

// ---------- Topic Subscription ----------
export async function subscribeToTopic(topic: string): Promise<boolean> {
  if (!firebaseConfig) await loadFirebaseConfig();
  try {
    const authToken = localStorage.getItem('nawaqes_token') || '';
    const res = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ topic }),
    });
    return res.ok;
  } catch (err) {
    console.error('[FCM] subscribe failed:', err);
    return false;
  }
}

// ---------- Local Notification (foreground) ----------
function showLocalNotification(payload: any) {
  const title = payload.notification?.title || payload.data?.title || 'نواقص';
  const body = payload.notification?.body || payload.data?.body || '';
  const url = payload.data?.url || '/';

  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/favicon-32.png',
        vibrate: [100, 50, 100],
        dir: 'rtl',
        lang: 'ar',
        data: { url },
        actions: [
          { action: 'open', title: 'فتح' },
          { action: 'dismiss', title: 'إغلاق' }
        ]
      });
    });
  }
}
