// ─── App Update Checker ────────────────────────────────────────────
// Checks /apk-status.json for new APK versions and shows a dismissible
// banner prompting the user to update.
//
// Works on both web and Android WebView. The banner shows:
//   - New version number
//   - Download button (links to the APK URL)
//   - Dismiss button (remembers dismissal in localStorage until a newer version)
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw, Loader2 } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';

interface ApkStatus {
  version: string;
  version_code: number;
  apk_url: string;
  apk_size_mb?: number;
  release_date?: string;
  changelog?: string[];
  min_supported_version_code?: number;
}

const STORAGE_KEY = 'nawaqes_last_seen_version_code';
const STATUS_URL = '/apk-status.json';

export const AppUpdateChecker: React.FC = () => {
  const { darkMode } = useAppContext();
  const [update, setUpdate] = useState<ApkStatus | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const res = await fetch(STATUS_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const status: ApkStatus = await res.json();

        if (cancelled) return;

        // Get the last seen version code from localStorage
        const lastSeen = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
        const currentCode = status.version_code || 0;

        // If there's a newer version we haven't seen, show the banner
        if (currentCode > lastSeen) {
          setUpdate(status);
        }
      } catch (err) {
        // Silently fail — don't bother user with update check errors
        console.warn('[UpdateCheck] Failed:', err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    // Check after a short delay (don't block initial render)
    const timer = setTimeout(checkForUpdate, 3000);

    // Re-check every 10 minutes (in case user keeps app open)
    const interval = setInterval(checkForUpdate, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleDismiss = () => {
    if (update) {
      // Remember that user saw this version — don't show again until a newer one
      localStorage.setItem(STORAGE_KEY, String(update.version_code));
    }
    setUpdate(null);
  };

  const handleDownload = () => {
    if (update) {
      // Mark as seen so it doesn't pop up again
      localStorage.setItem(STORAGE_KEY, String(update.version_code));
      // Open download URL
      window.open(update.apk_url, '_blank');
    }
  };

  if (checking || !update) return null;

  const bgClass = darkMode
    ? 'bg-gradient-to-r from-orange-600 to-amber-600'
    : 'bg-gradient-to-r from-orange-500 to-amber-500';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`fixed top-0 left-0 right-0 z-[5000] ${bgClass} text-white shadow-lg`}
        dir="rtl"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm">
              تحديث متاح! v{update.version}
            </p>
            <p className="text-xs text-white/80 truncate">
              {update.changelog?.[0] || 'تحديث جديد متاح للتحميل'}
            </p>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-orange-600 font-black text-sm hover:bg-orange-50 active:scale-95 transition-all flex-shrink-0"
          >
            <Download className="w-4 h-4" />
            تحديث
          </button>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
