// =====================================================
// Firebase Integration for Nawaqes
// =====================================================
// Web Push notifications using Firebase JS SDK + VAPID key.
// Works in both:
//   - PWA (browser: Chrome, Edge, Firefox, Safari 16.4+)
//   - APK (WebView: same Firebase JS SDK runs inside WebView)
//
// No google-services.json needed — that's only for native Android FCM.
// =====================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  onMessage,
  getToken,
  deleteToken,
  isSupported,
  type Messaging,
} from 'firebase/messaging';

let firebaseApp: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;
let initPromise: Promise<boolean> | null = null;

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  vapidKey: string;
}

let cachedConfig: FirebaseConfig | null = null;

/** Load Firebase config from server (no secrets in client bundle) */
async function loadConfig(): Promise<FirebaseConfig | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch('/api/notifications/firebase-config');
    if (!res.ok) {
      console.warn('[FCM] Could not load Firebase config:', res.status);
      return null;
    }
    const cfg = await res.json();
    if (!cfg.apiKey || !cfg.vapidKey) {
      console.warn('[FCM] Incomplete Firebase config:', cfg);
      return null;
    }
    cachedConfig = cfg;
    return cfg;
  } catch (err) {
    console.warn('[FCM] Failed to fetch config:', err);
    return null;
  }
}

/** Check if browser/WebView supports Firebase Messaging */
async function checkSupported(): Promise<boolean> {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/** Initialize Firebase Messaging (called once on app start) */
export async function initFirebaseMessaging(): Promise<boolean> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1. Check support
    if (!(await checkSupported())) {
      console.log('[FCM] Firebase Messaging not supported in this browser');
      return false;
    }

    if (!('Notification' in window)) {
      console.log('[FCM] Notifications API not available');
      return false;
    }

    if (!('serviceWorker' in navigator)) {
      console.log('[FCM] Service Worker not available');
      return false;
    }

    // 2. Load config
    const cfg = await loadConfig();
    if (!cfg) return false;

    // 3. Initialize Firebase
    try {
      firebaseApp = initializeApp(cfg);
      messagingInstance = getMessaging(firebaseApp);

      // 4. Listen for foreground messages
      onMessage(messagingInstance, (payload) => {
        console.log('[FCM] Foreground message received:', payload);
        showLocalNotification(payload);
      });

      console.log('[FCM] Firebase Messaging initialized successfully');
      return true;
    } catch (err) {
      console.error('[FCM] Initialization failed:', err);
      return false;
    }
  })();

  return initPromise;
}

/** Request notification permission and get device token */
export async function requestNotificationPermission(): Promise<string | null> {
  if (!messagingInstance) {
    const ok = await initFirebaseMessaging();
    if (!ok) return null;
  }

  // Request permission
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Permission not granted');
      return null;
    }
  } else if (Notification.permission !== 'granted') {
    console.log('[FCM] Permission denied previously');
    return null;
  }

  // Get token
  try {
    const cfg = cachedConfig!;
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messagingInstance!, {
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (token) {
      console.log('[FCM] Device token:', token);
      // Register with server
      await registerTokenWithServer(token);
    }
    return token;
  } catch (err) {
    console.error('[FCM] Failed to get token:', err);
    return null;
  }
}

/** Send device token to server for storage */
async function registerTokenWithServer(token: string): Promise<void> {
  try {
    const authToken = localStorage.getItem('nawaqes_token') || '';
    await fetch('/api/notifications/register-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token,
        platform: /Android/i.test(navigator.userAgent) ? 'android-webview' : 'web',
      }),
    });
    console.log('[FCM] Device registered with server');
  } catch (err) {
    console.warn('[FCM] Failed to register with server:', err);
  }
}

/** Show a local notification when app is in foreground.
 *
 * DISABLED per product decision (2026-06-23): OS-level FCM notifications
 * that pop up over the app (like "أضفني إلى قائمتك / أعجبني") are no
 * longer shown when the app is open in the foreground. The WebSocket
 * real-time channel + in-app sonner toasts are the only notification
 * surface now.
 *
 * Background notifications (when the app is closed) still work normally
 * via the FCM service worker — those are useful and not intrusive.
 */
function showLocalNotification(_payload: any): void {
  // Foreground OS notifications disabled.
  return;
}

/** Unsubscribe from notifications (logout, settings) */
export async function unsubscribeFromNotifications(): Promise<boolean> {
  if (!messagingInstance) return false;
  try {
    await deleteToken(messagingInstance);
    console.log('[FCM] Token deleted');
    return true;
  } catch (err) {
    console.error('[FCM] Failed to delete token:', err);
    return false;
  }
}

/** Get current permission state */
export function getPermissionState(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/** Auto-init on first user interaction (improves UX & permission grant rate) */
let autoInitAttempted = false;
export function setupAutoInit(): void {
  if (autoInitAttempted) return;
  autoInitAttempted = true;

  // Initialize on first user interaction
  const initOnInteraction = () => {
    initFirebaseMessaging().then((ok) => {
      if (ok) {
        console.log('[FCM] Auto-initialized after user interaction');
      }
    });
    document.removeEventListener('click', initOnInteraction);
    document.removeEventListener('touchstart', initOnInteraction);
  };

  document.addEventListener('click', initOnInteraction, { once: true });
  document.addEventListener('touchstart', initOnInteraction, { once: true });

  // Also try on window load (in case user is already engaged)
  if (document.readyState === 'complete') {
    setTimeout(() => initFirebaseMessaging(), 2000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => initFirebaseMessaging(), 2000);
    });
  }
}
