import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './i18n';
import App from './App.tsx';
import './index.css';

// ─── Auto-update checker ────────────────────────────────────────────
// 🔧 FIX: Ensures the APK / PWA always runs the latest version.
// The TWA (Android APK) wraps the remote website, but the WebView can
// cache the old JS bundle even after a deploy. This checker:
//   1. On app start and every 5 minutes, fetches the current index.html
//   2. Extracts the JS bundle filename (e.g. "index-AbCdEf.js")
//   3. Compares it with the currently-loaded bundle
//   4. If they differ → a new version was deployed → reload the page
// The HTML has Cache-Control: no-cache, so the fetch always gets the
// latest version. The JS bundle filename includes a content hash, so a
// mismatch means the server has a newer bundle.
const CURRENT_BUNDLE = (() => {
  const scripts = document.querySelectorAll('script[src*="/assets/index-"]');
  for (const s of scripts) {
    const match = s.getAttribute('src')?.match(/index-([a-zA-Z0-9]+)\.js/);
    if (match) return match[0];
  }
  return null;
})();

async function checkForUpdate() {
  if (!CURRENT_BUNDLE) return;
  try {
    const res = await fetch('/?t=' + Date.now(), { cache: 'no-store' });
    const html = await res.text();
    const match = html.match(/index-([a-zA-Z0-9]+)\.js/);
    if (match && match[0] !== CURRENT_BUNDLE) {
      console.log('[UPDATE] New version detected, reloading...', match[0]);
      window.location.reload();
    }
  } catch {
    // Network error — ignore, will retry next interval
  }
}

// Check 3 seconds after load (let the app settle first)
setTimeout(checkForUpdate, 3000);
// Then check every 5 minutes
setInterval(checkForUpdate, 5 * 60 * 1000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
