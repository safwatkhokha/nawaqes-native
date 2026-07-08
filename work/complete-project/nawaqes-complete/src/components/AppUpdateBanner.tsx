// ─── AppUpdateBanner ────────────────────────────────────────────────
// Shows a dismissible banner when a new APK version is available on the
// server. The check runs:
//   - On mount (immediately after login)
//   - Every 30 minutes while the app is open
//   - When the user manually opens Settings → "تحقق من التحديثات"
//
// Detection strategy:
//   The current APK version is injected by the Android WebView as
//   `window.NAWAQES_APK_VERSION` (set by MainActivity.java's onPageFinished).
//   For PWA/browser users (no window.NAWAQES_APK_VERSION), the banner
//   still works but compares against the last-known-installed version
//   stored in localStorage.
//
// The latest available version is read from /apk-status.json (public,
// no auth required). When the user taps "تحديث الآن", we open the APK
// download URL in a new tab and remember the new version so we don't
// re-prompt until the next release.

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

interface ApkStatus {
  version: string;
  version_code: number;
  apk_url: string;
  apk_size_mb: number;
  release_date?: string;
  changelog?: string[];
  min_supported_version_code?: number;
}

const INSTALLED_VERSION_KEY = 'nawaqes_installed_apk_version';
const DISMISSED_VERSION_KEY = 'nawaqes_dismissed_apk_version';
const LAST_CHECK_KEY = 'nawaqes_last_update_check';

// Compare semver-like version strings: "3.2.0" vs "3.3.0"
// Returns: 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a: string, b: string): number {
  const pa = (a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = (b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// Detect the currently-installed APK version.
// Priority:
//   1. window.NAWAQES_APK_VERSION (injected by Android WebView)
//   2. localStorage value (set when user clicks "تحديث الآن")
//   3. null (first run — no comparison possible)
function getInstalledVersion(): string | null {
  if (typeof window !== 'undefined') {
    const native = (window as any).NAWAQES_APK_VERSION;
    if (typeof native === 'string' && native.trim()) return native.trim();
  }
  try {
    return localStorage.getItem(INSTALLED_VERSION_KEY);
  } catch {
    return null;
  }
}

export const AppUpdateBanner: React.FC = () => {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const [status, setStatus] = useState<ApkStatus | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdates = useCallback(async (force: boolean = false) => {
    // Throttle: don't check more than once per 5 minutes unless forced
    try {
      const lastCheck = parseInt(localStorage.getItem(LAST_CHECK_KEY) || '0', 10);
      const now = Date.now();
      if (!force && now - lastCheck < 5 * 60 * 1000) return;
      localStorage.setItem(LAST_CHECK_KEY, String(now));
    } catch {}

    setIsChecking(true);
    try {
      // Cache-bust to always get the latest apk-status.json
      const res = await fetch(`/apk-status.json?_=${Date.now()}`, { cache: 'no-cache' });
      if (!res.ok) return;
      const data: ApkStatus = await res.json();
      setStatus(data);

      const installed = getInstalledVersion();
      const dismissed = (() => {
        try { return localStorage.getItem(DISMISSED_VERSION_KEY); } catch { return null; }
      })();

      if (!installed) {
        // First run — set installed = latest so we don't prompt on first install
        try { localStorage.setItem(INSTALLED_VERSION_KEY, data.version); } catch {}
        return;
      }

      // Show banner only if server version is newer than installed AND
      // the user hasn't dismissed this exact version
      if (
        compareVersions(data.version, installed) > 0 &&
        dismissed !== data.version
      ) {
        setShowBanner(true);
      }
    } catch {
      // Network error — fail silently, retry next cycle
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Initial check + periodic re-check every 30 minutes
  useEffect(() => {
    checkForUpdates();
    const interval = setInterval(() => checkForUpdates(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkForUpdates]);

  // Expose a global function so SettingsPage can trigger a manual check
  useEffect(() => {
    (window as any).__nawaqesCheckForUpdates = () => checkForUpdates(true);
    return () => { delete (window as any).__nawaqesCheckForUpdates; };
  }, [checkForUpdates]);

  const handleUpdate = useCallback(() => {
    if (!status) return;
    // Open the APK download URL — Android will download it and prompt
    // to install. iOS/Safari will just download the file.
    window.open(status.apk_url, '_blank');
    // Optimistically update the installed version so the banner hides
    // until the NEXT release. If the user cancels the install, they'll
    // need to manually open "تحقق من التحديثات" in Settings to re-trigger.
    try { localStorage.setItem(INSTALLED_VERSION_KEY, status.version); } catch {}
    setShowBanner(false);
  }, [status]);

  const handleDismiss = useCallback(() => {
    if (status) {
      try { localStorage.setItem(DISMISSED_VERSION_KEY, status.version); } catch {}
    }
    setShowBanner(false);
  }, [status]);

  if (!showBanner || !status) return null;

  const installedVersion = getInstalledVersion();
  const newFeatures = (status.changelog || []).slice(0, 3);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-[60] w-full"
        dir={dir}
      >
        <div className="mx-auto max-w-[1600px] px-3 py-2">
          <div className="relative overflow-hidden rounded-xl border border-orange-400/50 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 shadow-lg">
            {/* Decorative shine */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="relative flex items-center gap-3 px-3 py-2.5">
              {/* Icon */}
              <div className="shrink-0 w-9 h-9 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-sm">
                    {t('update.available', 'تحديث جديد متاح!')}
                  </span>
                  <span className="text-white/80 text-xs font-mono">
                    v{installedVersion || '?'} → v{status.version}
                  </span>
                  <span className="text-white/60 text-xs hidden sm:inline">
                    ({status.apk_size_mb} MB)
                  </span>
                </div>
                {newFeatures.length > 0 && (
                  <div className="text-white/85 text-xs mt-0.5 line-clamp-1">
                    {newFeatures.join(' • ')}
                  </div>
                )}
              </div>

              {/* Update button */}
              <button
                onClick={handleUpdate}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-orange-600 font-bold text-xs hover:bg-orange-50 transition-colors active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('update.now', 'تحديث الآن')}</span>
                <span className="sm:hidden">{t('update.now_short', 'تحديث')}</span>
              </button>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className="shrink-0 w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                aria-label={t('update.dismiss', 'لاحقاً')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Hook for SettingsPage to trigger a manual check ────────────────
export function useAppUpdateCheck() {
  return {
    checkNow: () => {
      if (typeof window !== 'undefined' && (window as any).__nawaqesCheckForUpdates) {
        (window as any).__nawaqesCheckForUpdates();
      }
    },
    isChecking: false, // populated by the banner's state
  };
}

// ─── Manual "check for updates" UI block (for SettingsPage) ─────────
interface CheckUpdatesButtonProps {
  darkMode: boolean;
}

export const CheckUpdatesButton: React.FC<CheckUpdatesButtonProps> = ({ darkMode }) => {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<null | { hasUpdate: boolean; version?: string; url?: string }>(null);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch(`/apk-status.json?_=${Date.now()}`, { cache: 'no-cache' });
      const data: ApkStatus = await res.json();
      const installed = getInstalledVersion() || '0.0.0';
      const hasUpdate = compareVersions(data.version, installed) > 0;
      setResult({ hasUpdate, version: data.version, url: data.apk_url });
      if (hasUpdate) {
        // Also trigger the banner if it was dismissed
        try { localStorage.removeItem(DISMISSED_VERSION_KEY); } catch {}
        if ((window as any).__nawaqesCheckForUpdates) (window as any).__nawaqesCheckForUpdates();
      }
    } catch {
      setResult({ hasUpdate: false });
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <div className={`rounded-xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('update.check_title', 'تحقق من تحديثات التطبيق')}
          </div>
          <div className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('update.check_desc', 'تحقق من توفر إصدار جديد من نواقص')}
          </div>
        </div>
        <button
          onClick={handleCheck}
          disabled={checking}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
            darkMode ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-orange-500 text-white hover:bg-orange-600'
          } disabled:opacity-60`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          {checking ? t('update.checking', 'جاري التحقق...') : t('update.check_button', 'تحقق الآن')}
        </button>
      </div>
      {result && (
        <div className={`mt-3 text-xs ${result.hasUpdate ? 'text-orange-500' : (darkMode ? 'text-gray-400' : 'text-gray-600')}`}>
          {result.hasUpdate ? (
            <div className="flex items-center justify-between gap-2">
              <span>{t('update.found', `إصدار جديد متاح: v${result.version}`)}</span>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1 px-3 py-1 rounded-md font-bold ${
                  darkMode ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                <Download className="w-3 h-3" />
                {t('update.download', 'تحميل')}
              </a>
            </div>
          ) : (
            <span>{t('update.latest', 'أنت تستخدم أحدث إصدار ✓')}</span>
          )}
        </div>
      )}
    </div>
  );
};
