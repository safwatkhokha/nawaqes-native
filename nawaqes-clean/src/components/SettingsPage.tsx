// ─── SettingsPage — iOS-style comprehensive redesign ─────────────────
// 7 grouped sections (Account & Security / Privacy / Notifications /
// Appearance / Security / About / Danger Zone) with search bar,
// animated toggles, color icons per row, modals for change-password /
// 2FA QR / change-phone / legal / deactivate / multi-step delete.
// Full RTL + dark-mode support. All labels are Arabic.
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { CheckUpdatesButton } from './AppUpdateBanner';
import {
  User, Wallet, Shield, Bell, Lock, Moon, Sun, Trash2, HardDrive,
  ChevronLeft, ChevronRight, Eye, EyeOff, Smartphone, MapPin, Key,
  AlertTriangle, CheckCircle, Globe, Type, Monitor, Info, FileText,
  HelpCircle, Mail, Ban, MessageSquare, Heart, Megaphone, Volume2,
  Crown, X, Loader2, LogOut, History, Phone, ShieldCheck, UserPlus,
  ShoppingBag, Radio, Palette, Sparkles, LayoutGrid, Clock, Star,
  Share2, Copy, Fingerprint, Search, PauseCircle, AlertOctagon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────
type PrivacyLevel = 'everyone' | 'friends' | 'no_one';

interface NotifPrefs {
  push: boolean;
  email: boolean;
  messages: boolean;
  likes_comments: boolean;
  friend_requests: boolean;
  promotions: boolean;
  market: boolean;
  livestream: boolean;
  preview: boolean;
  dnd: boolean;
  dndFrom: string;   // "22:00"
  dndTo: string;     // "07:00"
  sound: 'default' | 'chime' | 'ding' | 'silent';
}

interface PrivacyPrefs {
  showPhoneTo: PrivacyLevel;
  showLocation: boolean;
  showOnlineStatus: boolean;
  whoCanMessage: PrivacyLevel;
  whoCanSeePosts: PrivacyLevel;
  readReceipts: boolean;
  lastSeen: PrivacyLevel;
}

interface AppearancePrefs {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  themeColor: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'pink';
  reducedMotion: boolean;
  compactMode: boolean;
}

// ─── iOS-style animated toggle (RTL-aware) ────────────────────────────
const Toggle: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
  accentColor?: string; // tailwind class for "on" color
  darkMode: boolean;
  reducedMotion?: boolean;
}> = ({ enabled, onToggle, ariaLabel, accentColor = 'bg-green-500', darkMode, reducedMotion }) => {
  const { dir } = useLanguage();
  return (
    <button
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={ariaLabel}
      role="switch"
      className={`relative w-[51px] h-[31px] rounded-full transition-colors duration-200 flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-500 ${
        enabled ? accentColor : darkMode ? 'bg-gray-600' : 'bg-gray-300'
      }`}
    >
      <motion.div
        className="absolute top-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-md"
        animate={{ left: enabled ? (dir === 'rtl' ? '2px' : '22px') : (dir === 'rtl' ? '22px' : '2px') }}
        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 32 }}
      />
    </button>
  );
};

// ─── Section header (small uppercase gray label, iOS style) ───────────
const SectionLabel: React.FC<{ children: React.ReactNode; darkMode: boolean }> = ({ children, darkMode }) => (
  <p className={`px-4 pt-5 pb-2 text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
    {children}
  </p>
);

// ─── Grouped card (iOS rounded white/dark) ────────────────────────────
const Group: React.FC<{ darkMode: boolean; children: React.ReactNode }> = ({ darkMode, children }) => (
  <div
    className={`rounded-2xl overflow-hidden shadow-sm border ${
      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200/70'
    }`}
  >
    <div className={`divide-y ${darkMode ? 'divide-gray-700/60' : 'divide-gray-100'}`}>{children}</div>
  </div>
);

// ─── iOS-style row ────────────────────────────────────────────────────
const Row: React.FC<{
  darkMode: boolean;
  icon: React.ReactNode;
  iconBg: string; // tailwind class, e.g. "bg-blue-500 text-white"
  label: string;
  sublabel?: React.ReactNode;
  onClick?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
  showChevron?: boolean;
}> = ({ darkMode, icon, iconBg, label, sublabel, onClick, trailing, danger, showChevron = true }) => {
  const { dir } = useLanguage();
  const isRtl = dir === 'rtl';
  // 🔧 FIX: If onClick is undefined but trailing has a Toggle, make the row
  // clickable and call the toggle's onToggle when the row is clicked.
  // This fixes the issue where clicking the row text did nothing (only the
  // toggle switch itself was clickable). Now the entire row is tappable.
  const trailingToggle = trailing as any;
  const hasToggle = trailingToggle?.props?.onToggle;
  const effectiveOnClick = onClick || (hasToggle ? () => trailingToggle.props.onToggle() : undefined);
  return (
    <button
      onClick={effectiveOnClick}
      disabled={!effectiveOnClick}
      type="button"
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors ${
        effectiveOnClick ? (darkMode ? 'hover:bg-gray-700/40 cursor-pointer active:bg-gray-700/70' : 'hover:bg-gray-50 cursor-pointer active:bg-gray-100') : ''
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-[15px] font-semibold leading-tight truncate ${danger ? (darkMode ? 'text-red-400' : 'text-red-600') : darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {label}
        </p>
        {sublabel && (
          <p className={`text-[12px] mt-0.5 truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{sublabel}</p>
        )}
      </div>
      {trailing !== undefined ? (
        trailing
      ) : (
        onClick && showChevron && (
          isRtl
            ? <ChevronLeft className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            : <ChevronRight className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        )
      )}
    </button>
  );
};

// ─── 3-button selector (Everyone / Friends / No one) ──────────────────
const TriSelector: React.FC<{
  value: PrivacyLevel;
  onChange: (v: PrivacyLevel) => void;
  darkMode: boolean;
  accentClass?: string;
}> = ({ value, onChange, darkMode, accentClass = 'bg-orange-600 text-white' }) => {
  const opts: [PrivacyLevel, string][] = [
    ['everyone', 'الجميع'],
    ['friends', 'الأصدقاء'],
    ['no_one', 'لا أحد'],
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map(([val, lbl]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val)}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
            value === val
              ? accentClass
              : darkMode
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {lbl}
        </button>
      ))}
    </div>
  );
};

// ─── Password strength calculator ─────────────────────────────────────
function calcStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4 | 5; label: string; color: string; textColor: string } {
  if (!pw) return { score: 0, label: '', color: 'bg-gray-300', textColor: 'text-gray-400' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  if (pw.length >= 12 && s >= 3) s++;
  const map = [
    { label: 'ضعيفة جداً', color: 'bg-red-500', textColor: 'text-red-500' },
    { label: 'ضعيفة',     color: 'bg-red-500',    textColor: 'text-red-500' },
    { label: 'متوسطة',    color: 'bg-amber-500',  textColor: 'text-amber-500' },
    { label: 'جيدة',      color: 'bg-yellow-500', textColor: 'text-yellow-600' },
    { label: 'قوية',      color: 'bg-green-500',  textColor: 'text-green-600' },
    { label: 'قوية جداً', color: 'bg-green-600',  textColor: 'text-green-700' },
  ];
  return { score: Math.min(s, 5) as 0 | 1 | 2 | 3 | 4 | 5, ...map[Math.min(s, 5)] };
}

// ─── Modal shell ──────────────────────────────────────────────────────
const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  darkMode: boolean;
  children: React.ReactNode;
  maxWidth?: string;
}> = ({ open, onClose, title, darkMode, children, maxWidth = 'max-w-md' }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className={`rounded-t-3xl sm:rounded-2xl w-full ${maxWidth} shadow-2xl overflow-hidden max-h-[92vh] flex flex-col ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <h3 className={`font-black text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto">{children}</div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ─── Password input with show/hide ────────────────────────────────────
const PwInput: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  darkMode: boolean;
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
}> = ({ label, value, onChange, show, onToggle, darkMode, placeholder, dir = 'ltr' }) => (
  <div>
    <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold ${
          darkMode
            ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500 placeholder-gray-500'
            : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400 placeholder-gray-400'
        }`}
      />
      <button
        type="button"
        onClick={onToggle}
        className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'left-3' : 'right-3'} ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────
export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode: ctxToggleDarkMode, smartAlertsEnabled, enableSmartAlerts, disableSmartAlerts } = useAppContext();
  // 🔧 FIX: ensure toggleDarkMode is always a function (fallback to localStorage toggle)
  const toggleDarkMode = ctxToggleDarkMode || (() => {
    const isDark = localStorage.getItem('nawaqes_dark_mode') === 'true';
    localStorage.setItem('nawaqes_dark_mode', String(!isDark));
    document.documentElement.classList.toggle('dark', !isDark);
    window.location.reload();
  });
  const { currentUser, updateProfile, logout } = useAuth();
  const { t } = useTranslation();
  const { dir, language, setLanguage } = useLanguage();

  // ── Search ──
  const [query, setQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);

  // ── Account: profile edits + password ──
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');
  const [editLocation, setEditLocation] = useState(currentUser?.location || '');
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [showPwModal, setShowPwModal] = useState(false);

  // 2FA
  const [twoFA, setTwoFA] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [qr2FA, setQr2FA] = useState<{ url?: string; secret?: string } | null>(null);
  const [verifying2FA, setVerifying2FA] = useState(false);

  // Email + phone verification
  const [emailVerified, setEmailVerified] = useState<boolean>(!!currentUser?.email_verified);
  const [phoneVerified, setPhoneVerified] = useState<boolean>(!!(currentUser?.phone));
  const [showChangePhone, setShowChangePhone] = useState(false);

  // Delete-account confirmation (multi-step)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [deletePw, setDeletePw] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Deactivate (temporarily)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivatePw, setDeactivatePw] = useState('');
  const [isDeactivating, setIsDeactivating] = useState(false);

  // ── Privacy ──
  const [privacy, setPrivacy] = useState<PrivacyPrefs>({
    showPhoneTo: 'everyone',
    showLocation: true,
    showOnlineStatus: true,
    whoCanMessage: 'everyone',
    whoCanSeePosts: 'everyone',
    readReceipts: true,
    lastSeen: 'everyone',
  });

  // ── Notifications ──
  const [notif, setNotif] = useState<NotifPrefs>({
    push: smartAlertsEnabled,
    email: true,
    messages: true,
    likes_comments: true,
    friend_requests: true,
    promotions: true,
    market: true,
    livestream: true,
    preview: true,
    dnd: false,
    dndFrom: '22:00',
    dndTo: '07:00',
    sound: 'default',
  });

  // ── Appearance ──
  const [appearance, setAppearance] = useState<AppearancePrefs>({
    fontSize: 'medium',
    themeColor: 'orange',
    reducedMotion: false,
    compactMode: false,
  });

  // ── Security ──
  const [sessions, setSessions] = useState<any[]>([]);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loginAlerts, setLoginAlerts] = useState(true);
  const [revokingAll, setRevokingAll] = useState(false);

  // ── About ──
  const [legalModal, setLegalModal] = useState<null | 'terms' | 'privacy' | 'community'>(null);
  const [appRating, setAppRating] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  // ── Persistence ──
  const storageKey = currentUser ? `nawaqes_settings_${currentUser.id}` : '';
  useEffect(() => {
    if (!currentUser) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.privacy) setPrivacy((p) => ({ ...p, ...parsed.privacy }));
        if (parsed.notif) setNotif((p) => ({ ...p, ...parsed.notif, push: smartAlertsEnabled }));
        if (parsed.appearance) setAppearance((p) => ({ ...p, ...parsed.appearance }));
        if (typeof parsed.loginAlerts === 'boolean') setLoginAlerts(parsed.loginAlerts);
        if (typeof parsed.appRating === 'number') setAppRating(parsed.appRating);
      } else {
        setPrivacy((p) => ({
          ...p,
          showLocation: (currentUser as any).showLocation ?? true,
          showPhoneTo: (currentUser as any).showPhone ? 'everyone' : 'friends',
        }));
      }
    } catch {
      /* ignore */
    }
    setEmailVerified(!!(currentUser as any)?.email_verified);
    setPhoneVerified(!!currentUser?.phone);
  }, [currentUser, storageKey, smartAlertsEnabled]);

  useEffect(() => {
    if (!currentUser || !storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ privacy, notif, appearance, loginAlerts, appRating }));
    } catch {
      /* ignore */
    }
  }, [privacy, notif, appearance, loginAlerts, appRating, currentUser, storageKey]);

  // Apply font-size CSS variable
  useEffect(() => {
    const root = document.documentElement;
    const sizeMap: Record<AppearancePrefs['fontSize'], string> = {
      small: '13px',
      medium: '16px',
      large: '19px',
      xlarge: '22px',
    };
    root.style.setProperty('--app-font-size', sizeMap[appearance.fontSize]);
  }, [appearance.fontSize]);

  // Apply accent color CSS variable
  useEffect(() => {
    const root = document.documentElement;
    const colorMap: Record<AppearancePrefs['themeColor'], string> = {
      orange: '#f97316',
      blue: '#3b82f6',
      green: '#22c55e',
      purple: '#a855f7',
      red: '#ef4444',
      pink: '#ec4899',
    };
    root.style.setProperty('--app-accent', colorMap[appearance.themeColor]);
  }, [appearance.themeColor]);

  // Apply reduced motion class
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', appearance.reducedMotion);
  }, [appearance.reducedMotion]);

  // Apply compact-mode class on <html> so the CSS rules in index.css
  // can tighten paddings/gaps site-wide.
  useEffect(() => {
    document.documentElement.classList.toggle('compact-mode', appearance.compactMode);
  }, [appearance.compactMode]);

  // Load security/sessions/blocked lazily
  useEffect(() => {
    api.getActiveSessions().then((s) => Array.isArray(s) && setSessions(s)).catch(() => {});
    api.getLoginHistory().then((h) => Array.isArray(h) && setLoginHistory(h)).catch(() => {});
    api.getConnectedDevices().then((d) => Array.isArray(d) && setDevices(d)).catch(() => {});
    api.get2FAStatus().then((s) => setTwoFA(!!s?.enabled)).catch(() => {});
    api.getBlockedUsers().then((list) => Array.isArray(list) && setBlockedUsers(list)).catch(() => {});
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleNotifToggle = (key: keyof Omit<NotifPrefs, 'sound' | 'dndFrom' | 'dndTo'>) => {
    if (key === 'push') {
      if (notif.push) {
        disableSmartAlerts();
        setNotif((p) => ({ ...p, push: false }));
        toast.success('تم إيقاف الإشعارات الفورية');
      } else {
        import('../lib/firebase').then(async ({ requestNotificationPermission }) => {
          const token = await requestNotificationPermission();
          if (token) {
            const ok = await enableSmartAlerts();
            if (ok) {
              setNotif((p) => ({ ...p, push: true }));
              toast.success('تم تفعيل الإشعارات الفورية');
            }
          } else {
            toast.error('تعذّر الحصول على إذن الإشعارات');
          }
        }).catch(() => toast.error('تعذّر تفعيل الإشعارات'));
      }
      return;
    }
    const newVal = !notif[key];
    setNotif((p) => ({ ...p, [key]: newVal }));
    api.updateNotificationPreferences({ [key]: newVal }).catch(() => {});
    toast.success(t('settings.settingsUpdated'));
  };

  const handlePrivacyToggle = (key: 'showLocation' | 'showOnlineStatus' | 'readReceipts') => {
    const newVal = !privacy[key];
    setPrivacy((p) => ({ ...p, [key]: newVal }));
    if (key === 'showLocation') {
      updateProfile({ showLocation: newVal } as any);
      toast.success(newVal ? t('settings.locationShown') : t('settings.locationHidden'));
    } else {
      api.updateNotificationPreferences({ [key]: newVal }).catch(() => {});
      toast.success(t('settings.settingsUpdated'));
    }
  };

  const handlePrivacySelect = (key: 'showPhoneTo' | 'whoCanMessage' | 'whoCanSeePosts' | 'lastSeen', value: PrivacyLevel) => {
    setPrivacy((p) => ({ ...p, [key]: value }));
    if (key === 'showPhoneTo') {
      updateProfile({ showPhone: value === 'everyone' } as any);
    }
    api.updateNotificationPreferences({ [key]: value }).catch(() => {});
    toast.success(t('settings.settingsUpdated'));
  };

  const handleSaveProfileEdits = async () => {
    try {
      await updateProfile({ name: editName, bio: editBio, location: editLocation } as any);
      setShowProfileEditor(false);
      toast.success(t('profile.profileUpdated'));
    } catch {
      toast.error(t('profile.profileUpdateFailed', 'فشل التحديث'));
    }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }
    if (newPw.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setChangingPw(true);
    try {
      try {
        await api.changeMyPassword(oldPw, newPw);
      } catch {
        await api.changePassword(oldPw, newPw);
      }
      toast.success('تم تغيير كلمة المرور بنجاح');
      setShowPwModal(false);
      setOldPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      toast.error(err?.message || 'فشل تغيير كلمة المرور');
    } finally {
      setChangingPw(false);
    }
  };

  // 2FA flow: when enabling, fetch QR first via toggle2FA(true) (backend
  // returns qrUrl/secret), then ask user for 6-digit code & verify.
  const handleToggle2FA = async () => {
    if (twoFA) {
      try {
        await api.toggle2FA(false);
        setTwoFA(false);
        toast.success('تم إيقاف التحقق بخطوتين');
      } catch {
        toast.error('فشل إيقاف التحقق بخطوتين');
      }
    } else {
      setShow2FAModal(true);
      setVerifying2FA(false);
      setQr2FA(null);
      try {
        // Some backends require code upfront; if call fails we just open
        // the modal and let the user input code.
        const r = await api.toggle2FA(true).catch(() => null as any);
        if (r && (r.qrUrl || r.secret)) setQr2FA({ url: r.qrUrl, secret: r.secret });
      } catch { /* ignore */ }
    }
  };

  const handleConfirmEnable2FA = async (code: string) => {
    setVerifying2FA(true);
    try {
      const res = await api.toggle2FA(true, code);
      if (res?.enabled) {
        setTwoFA(true);
        setShow2FAModal(false);
        toast.success('تم تفعيل التحقق بخطوتين');
      } else {
        toast.error('الرمز غير صحيح');
      }
    } catch {
      toast.error('فشل تفعيل التحقق بخطوتين');
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleResendEmailVerification = async () => {
    try {
      await api.sendEmailVerification();
      toast.success(t('emailVerification.codeSent'));
      navigate('/verify-email');
    } catch (err: any) {
      toast.error(err?.message || 'تعذّر إرسال رمز التحقق');
    }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await api.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success('تم إنهاء الجلسة');
    } catch {
      toast.error('فشل إنهاء الجلسة');
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setRevokingAll(true);
    try {
      await api.revokeAllOtherSessions();
      setSessions((prev) => prev.filter((s) => s.current));
      toast.success('تم إنهاء جميع الجلسات الأخرى');
    } catch {
      // Fallback: revoke each non-current session individually
      const others = sessions.filter((s) => !s.current);
      await Promise.all(others.map((s) => api.revokeSession(s.id).catch(() => {})));
      setSessions((prev) => prev.filter((s) => s.current));
      toast.success('تم إنهاء جميع الجلسات الأخرى');
    } finally {
      setRevokingAll(false);
    }
  };

  const handleUnblock = async (id: string) => {
    try {
      await api.unblockUser(id);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success('تم إلغاء الحظر');
    } catch {
      toast.error('فشل إلغاء الحظر');
    }
  };

  const handleClearCache = () => {
    if (currentUser) {
      const keysToKeep = [
        'nawaqes_session',
        `nawaqes_settings_${currentUser.id}`,
        `nawaqes_saved_${currentUser.id}`,
        `nawaqes_read_notifs_${currentUser.id}`,
        `nawaqes_friend_requests_${currentUser.id}`,
        `nawaqes_transactions_${currentUser.id}`,
        'nawaqes_users',
        'nawaqes_darkmode',
        'nawaqes_lang',
      ];
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nawaqes_') && !keysToKeep.includes(k)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }
    toast.success(t('settings.cacheCleared'));
  };

  const handleDeactivate = async () => {
    if (!deactivatePw) {
      toast.error('أدخل كلمة المرور');
      return;
    }
    setIsDeactivating(true);
    try {
      try {
        await api.deactivateMyAccount(deactivatePw);
      } catch {
        // Fallback: mark via profile update
        await updateProfile({ is_deactivated: true } as any);
      }
      toast.success('تم تعطيل الحساب مؤقتاً');
      logout();
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.message || 'فشل تعطيل الحساب');
    } finally {
      setIsDeactivating(false);
      setShowDeactivateModal(false);
      setDeactivatePw('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePw) {
      toast.error('أدخل كلمة المرور');
      return;
    }
    if (deleteStep < 3) {
      setDeleteStep((s) => (s + 1) as 1 | 2 | 3);
      return;
    }
    setIsDeletingAccount(true);
    try {
      await api.deleteMyAccount(deletePw);
      try {
        [
          `nawaqes_settings_${currentUser?.id}`,
          `nawaqes_saved_${currentUser?.id}`,
          `nawaqes_read_notifs_${currentUser?.id}`,
          `nawaqes_friend_requests_${currentUser?.id}`,
          `nawaqes_transactions_${currentUser?.id}`,
        ].forEach((k) => localStorage.removeItem(k));
        localStorage.removeItem('nawaqes_session');
        api.setToken(null);
      } catch { /* ignore */ }
      logout();
      toast.success(t('settings.accountDeleted'));
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.message || t('settings.deleteAccountFailed') || 'فشل حذف الحساب');
    } finally {
      setIsDeletingAccount(false);
      setShowDeleteModal(false);
      setDeleteStep(1);
      setDeletePw('');
      setDeleteReason('');
    }
  };

  const handleSubmitRating = async (r: number) => {
    setAppRating(r);
    setSubmittingRating(true);
    try {
      await api.submitAppRating(r).catch(() => {});
      toast.success('شكراً لتقييمك!');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleShareApp = async () => {
    const shareUrl = window.location.origin;
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: 'نواقص — Nawaqes',
          text: 'جرّب تطبيق نواقص الآن!',
          url: shareUrl,
        });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('تم نسخ رابط التطبيق');
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  };

  // ─── Search ─────────────────────────────────────────────────────────
  const filterMatch = (text: string) => !query || text.toLowerCase().includes(query.toLowerCase());

  const sectionsVisible = useMemo(() => {
    if (!query) return { account: true, privacy: true, notifications: true, appearance: true, security: true, about: true, danger: true };
    const q = query.toLowerCase();
    const labels = {
      account: ['الحساب', 'الأمان', 'كلمة المرور', 'التحقق بخطوتين', 'البريد', 'الهاتف', 'profile', 'password', '2fa'],
      privacy: ['الخصوصية', 'الهاتف', 'الموقع', 'الاتصال', 'الرسائل', 'المنشورات', 'المحظورون', 'الإيصالات', 'آخر ظهور'],
      notifications: ['الإشعارات', 'الدفع', 'الرسائل', 'الإعجابات', 'الأصدقاء', 'الترويج', 'السوق', 'البث', 'البريد', 'المعاينة', 'عدم الإزعاج', 'الصوت'],
      appearance: ['المظهر', 'الوضع الداكن', 'اللغة', 'الخط', 'اللون', 'الحركة', 'الوضع المضغوط'],
      security: ['الأمان', 'الجلسات', 'الدخول', 'الأجهزة', 'تنبيهات'],
      about: ['حول', 'الإصدار', 'الشروط', 'الخصوصية', 'الدعم', 'التواصل', 'تقييم', 'مشاركة', 'الإرشادات'],
      danger: ['المنطقة الخطرة', 'التعطيل', 'الحذف', 'مسح'],
    };
    const out: Record<string, boolean> = {};
    (Object.keys(labels) as (keyof typeof labels)[]).forEach((k) => {
      out[k] = labels[k].some((l) => l.toLowerCase().includes(q));
    });
    return out;
  }, [query]);

  const strength = useMemo(() => calcStrength(newPw), [newPw]);

  // ─── iOS-style trailing "chevron-or-value" helpers ──────────────────
  const TrailingValue: React.FC<{ children: React.ReactNode; darkMode: boolean }> = ({ children, darkMode }) => (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className={`text-[13px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{children}</span>
      {dir === 'rtl' ? (
        <ChevronLeft className={`w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
      ) : (
        <ChevronRight className={`w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
      )}
    </div>
  );

  const StatusBadge: React.FC<{ ok: boolean; okLabel: string; notOkLabel: string; darkMode: boolean }> = ({ ok, okLabel, notOkLabel, darkMode }) => (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ok ? (darkMode ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700')}`}>
      {ok ? okLabel : notOkLabel}
    </span>
  );

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-12" dir={dir}>
      {/* Title row + search */}
      <div className="space-y-3 mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/my-page')}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
            aria-label="رجوع"
          >
            {dir === 'rtl' ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('settings.title')}</h1>
            <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('settings.titleDesc')}</p>
          </div>
        </div>

        {/* Search bar */}
        <div className={`relative flex items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
          searchFocus
            ? (darkMode ? 'border-orange-500 bg-gray-800' : 'border-orange-400 bg-white')
            : (darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50')
        }`}>
          <Search className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            placeholder="ابحث في الإعدادات..."
            className={`flex-1 bg-transparent outline-none text-sm font-medium ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
          />
          {query && (
            <button onClick={() => setQuery('')} className={`${darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Check-for-updates banner */}
      <div className="mb-2">
        <CheckUpdatesButton darkMode={darkMode} />
      </div>

      {/* ───────── 1. ACCOUNT & SECURITY ───────── */}
      {sectionsVisible.account && (
        <>
          <SectionLabel darkMode={darkMode}>الحساب والأمان</SectionLabel>
          <Group darkMode={darkMode}>
            {/* Profile card */}
            <div className={`px-4 py-3 flex items-center gap-3 ${darkMode ? '' : ''}`}>
              <img
                src={currentUser?.avatarBase64 || currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'me'}`}
                alt={currentUser?.name}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-offset-2 ring-orange-500 ring-offset-transparent"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-base font-bold truncate flex items-center gap-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {currentUser?.name}
                  {currentUser?.isVerified && <ShieldCheck className="w-4 h-4 text-orange-500 flex-shrink-0" />}
                </p>
                <p className={`text-[12px] truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{currentUser?.email || '—'}</p>
              </div>
              <button
                onClick={() => {
                  setEditName(currentUser?.name || '');
                  setEditBio(currentUser?.bio || '');
                  setEditLocation(currentUser?.location || '');
                  setShowProfileEditor(true);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all"
              >
                تعديل
              </button>
            </div>

            <Row darkMode={darkMode}
              icon={<Key className="w-4 h-4" />}
              iconBg="bg-amber-500 text-white"
              label="تغيير كلمة المرور"
              sublabel="حدّث كلمة المرور بانتظام لحماية حسابك"
              onClick={() => setShowPwModal(true)}
            />

            <Row darkMode={darkMode}
              icon={<Fingerprint className="w-4 h-4" />}
              iconBg="bg-green-500 text-white"
              label="التحقق بخطوتين (2FA)"
              sublabel={twoFA ? 'مُفعّل ✓' : 'غير مُفعّل — أضف طبقة حماية إضافية'}
              trailing={
                <Toggle
                  enabled={twoFA}
                  onToggle={handleToggle2FA}
                  ariaLabel="التحقق بخطوتين"
                  darkMode={darkMode}
                  reducedMotion={appearance.reducedMotion}
                />
              }
              onClick={undefined}
            />

            <Row darkMode={darkMode}
              icon={<Mail className="w-4 h-4" />}
              iconBg="bg-violet-500 text-white"
              label="التحقق من البريد الإلكتروني"
              sublabel={emailVerified ? currentUser?.email : 'بريدك غير مُفعّل'}
              trailing={
                emailVerified
                  ? <StatusBadge ok okLabel="مُفعّل" notOkLabel="غير مُفعّل" darkMode={darkMode} />
                  : <button onClick={handleResendEmailVerification} className="text-[11px] font-bold text-orange-500 hover:text-orange-600">إرسال الرمز</button>
              }
              onClick={emailVerified ? undefined : handleResendEmailVerification}
              showChevron={false}
            />

            <Row darkMode={darkMode}
              icon={<Phone className="w-4 h-4" />}
              iconBg="bg-teal-500 text-white"
              label="التحقق من الهاتف"
              sublabel={phoneVerified ? currentUser?.phone : 'لا يوجد رقم'}
              trailing={
                <div className="flex items-center gap-2">
                  <StatusBadge ok={phoneVerified} okLabel="مُفعّل" notOkLabel="غير مُفعّل" darkMode={darkMode} />
                </div>
              }
              onClick={() => setShowChangePhone(true)}
              showChevron
            />

            <Row darkMode={darkMode}
              icon={<Wallet className="w-4 h-4" />}
              iconBg="bg-emerald-500 text-white"
              label="المحفظة"
              sublabel={t('settings.balance', { balance: (currentUser?.walletBalance || 0).toLocaleString() })}
              onClick={() => navigate('/wallet')}
            />

            <Row darkMode={darkMode}
              icon={<Trash2 className="w-4 h-4" />}
              iconBg="bg-red-500 text-white"
              label="حذف الحساب"
              danger
              onClick={() => { setShowDeleteModal(true); setDeleteStep(1); }}
            />
          </Group>
        </>
      )}

      {/* ───────── 2. PRIVACY ───────── */}
      {sectionsVisible.privacy && (
        <>
          <SectionLabel darkMode={darkMode}>الخصوصية</SectionLabel>
          <Group darkMode={darkMode}>
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500 text-white"><Phone className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>إظهار رقم الهاتف</p>
              </div>
              <TriSelector value={privacy.showPhoneTo} onChange={(v) => handlePrivacySelect('showPhoneTo', v)} darkMode={darkMode} />
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-500 text-white"><MessageSquare className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>من يستطيع مراسلتي</p>
              </div>
              <TriSelector value={privacy.whoCanMessage} onChange={(v) => handlePrivacySelect('whoCanMessage', v)} darkMode={darkMode} />
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-500 text-white"><Heart className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>من يرى منشوراتي</p>
              </div>
              <TriSelector value={privacy.whoCanSeePosts} onChange={(v) => handlePrivacySelect('whoCanSeePosts', v)} darkMode={darkMode} />
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-500 text-white"><Clock className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>آخر ظهور</p>
              </div>
              <TriSelector value={privacy.lastSeen} onChange={(v) => handlePrivacySelect('lastSeen', v)} darkMode={darkMode} />
            </div>

            <Row darkMode={darkMode}
              icon={<MapPin className="w-4 h-4" />}
              iconBg="bg-green-500 text-white"
              label="إظهار موقعي"
              sublabel="عرض موقعك على المنشورات والملف الشخصي"
              trailing={
                <Toggle enabled={privacy.showLocation} onToggle={() => handlePrivacyToggle('showLocation')} ariaLabel="إظهار موقعي" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              }
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Eye className="w-4 h-4" />}
              iconBg="bg-purple-500 text-white"
              label="إظهار حالة الاتصال"
              sublabel="السماح للآخرين برؤية متى كنت متصلاً"
              trailing={
                <Toggle enabled={privacy.showOnlineStatus} onToggle={() => handlePrivacyToggle('showOnlineStatus')} ariaLabel="إظهار حالة الاتصال" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              }
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<CheckCircle className="w-4 h-4" />}
              iconBg="bg-cyan-500 text-white"
              label="إيصالات القراءة"
              sublabel="إظهار علامة القراءة بعد قراءة الرسائل"
              trailing={
                <Toggle enabled={privacy.readReceipts} onToggle={() => handlePrivacyToggle('readReceipts')} ariaLabel="إيصالات القراءة" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              }
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Ban className="w-4 h-4" />}
              iconBg="bg-red-500 text-white"
              label="المستخدمون المحظورون"
              sublabel={`${blockedUsers.length} مستخدم محظور`}
              onClick={() => navigate('/friends')}
            />
          </Group>

          {/* Blocked users preview (first 3) */}
          {blockedUsers.length > 0 && (
            <Group darkMode={darkMode}>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>المحظورون</p>
                <button onClick={() => navigate('/friends')} className="text-[11px] font-bold text-orange-500 hover:text-orange-600">عرض الكل</button>
              </div>
              <div className={`max-h-64 overflow-y-auto ${darkMode ? 'divide-y divide-gray-700/60' : 'divide-y divide-gray-100'}`}>
                {blockedUsers.slice(0, 3).map((u: any) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <img src={u.avatarBase64 || u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-9 h-9 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{u.name}</p>
                    </div>
                    <button onClick={() => handleUnblock(u.id)} className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all">
                      إلغاء الحظر
                    </button>
                  </div>
                ))}
              </div>
            </Group>
          )}
        </>
      )}

      {/* ───────── 3. NOTIFICATIONS ───────── */}
      {sectionsVisible.notifications && (
        <>
          <SectionLabel darkMode={darkMode}>الإشعارات</SectionLabel>
          <Group darkMode={darkMode}>
            <Row darkMode={darkMode}
              icon={<Bell className="w-4 h-4" />}
              iconBg="bg-red-500 text-white"
              label="الإشعارات الفورية"
              sublabel={notif.push ? 'مُفعّل لكل التنبيهات' : 'متوقف — لن تستقبل أي تنبيه'}
              trailing={
                <Toggle enabled={notif.push} onToggle={() => handleNotifToggle('push')} ariaLabel="الإشعارات الفورية" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              }
              onClick={undefined}
            />
            {/* Message notif + sound */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500 text-white"><MessageSquare className="w-4 h-4" /></div>
                <div className="flex-1">
                  <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>رسائل المحادثة</p>
                </div>
                <Toggle enabled={notif.messages} onToggle={() => handleNotifToggle('messages')} ariaLabel="إشعارات الرسائل" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              </div>
              {notif.messages && (
                <div className="mt-2">
                  <p className={`text-[11px] font-bold mb-1.5 flex items-center gap-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><Volume2 className="w-3.5 h-3.5" /> صوت الإشعارات</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([['default', 'افتراضي'], ['chime', 'نغمة'], ['ding', 'دينج'], ['silent', 'صامت']] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setNotif((p) => ({ ...p, sound: val }));
                          api.updateNotificationPreferences({ sound: val }).catch(() => {});
                          toast.success('تم تحديث صوت الإشعارات');
                        }}
                        className={`py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${notif.sound === val ? 'bg-orange-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Row darkMode={darkMode}
              icon={<Heart className="w-4 h-4" />}
              iconBg="bg-pink-500 text-white"
              label="الإعجابات والتعليقات"
              trailing={<Toggle enabled={notif.likes_comments} onToggle={() => handleNotifToggle('likes_comments')} ariaLabel="إشعارات الإعجابات" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<UserPlus className="w-4 h-4" />}
              iconBg="bg-orange-500 text-white"
              label="طلبات الصداقة"
              trailing={<Toggle enabled={notif.friend_requests} onToggle={() => handleNotifToggle('friend_requests')} ariaLabel="إشعارات طلبات الصداقة" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Megaphone className="w-4 h-4" />}
              iconBg="bg-green-500 text-white"
              label="إشعارات الترويج"
              trailing={<Toggle enabled={notif.promotions} onToggle={() => handleNotifToggle('promotions')} ariaLabel="إشعارات الترويج" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<ShoppingBag className="w-4 h-4" />}
              iconBg="bg-emerald-500 text-white"
              label="إشعارات السوق"
              sublabel="إعلانات جديدة في التصنيفات المحفوظة"
              trailing={<Toggle enabled={notif.market} onToggle={() => handleNotifToggle('market')} ariaLabel="إشعارات السوق" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Radio className="w-4 h-4" />}
              iconBg="bg-rose-500 text-white"
              label="البث المباشر"
              sublabel="عند بدء بث من حسابات تتابعها"
              trailing={<Toggle enabled={notif.livestream} onToggle={() => handleNotifToggle('livestream')} ariaLabel="إشعارات البث" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Mail className="w-4 h-4" />}
              iconBg="bg-cyan-500 text-white"
              label="إشعارات البريد الإلكتروني"
              trailing={<Toggle enabled={notif.email} onToggle={() => handleNotifToggle('email')} ariaLabel="إشعارات البريد" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<Eye className="w-4 h-4" />}
              iconBg="bg-violet-500 text-white"
              label="معاينة الإشعارات"
              sublabel="عرض محتوى الرسالة في الإشعار"
              trailing={<Toggle enabled={notif.preview} onToggle={() => handleNotifToggle('preview')} ariaLabel="معاينة الإشعارات" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            {/* DND */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500 text-white"><Moon className="w-4 h-4" /></div>
                <div className="flex-1">
                  <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>عدم الإزعاج</p>
                  <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>كتم كل الإشعارات مؤقتاً</p>
                </div>
                <Toggle enabled={notif.dnd} onToggle={() => { setNotif((p) => ({ ...p, dnd: !p.dnd })); toast.success(t('settings.settingsUpdated')); }} ariaLabel="عدم الإزعاج" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
              </div>
              {notif.dnd && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 flex items-center gap-3">
                  <label className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>من</label>
                  <input
                    type="time"
                    value={notif.dndFrom}
                    onChange={(e) => setNotif((p) => ({ ...p, dndFrom: e.target.value }))}
                    className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                  <label className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>إلى</label>
                  <input
                    type="time"
                    value={notif.dndTo}
                    onChange={(e) => setNotif((p) => ({ ...p, dndTo: e.target.value }))}
                    className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  />
                </motion.div>
              )}
            </div>
          </Group>
        </>
      )}

      {/* ───────── 4. APPEARANCE ───────── */}
      {sectionsVisible.appearance && (
        <>
          <SectionLabel darkMode={darkMode}>المظهر</SectionLabel>
          <Group darkMode={darkMode}>
            <Row darkMode={darkMode}
              icon={darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              iconBg="bg-blue-500 text-white"
              label="الوضع الداكن"
              onClick={toggleDarkMode}
              sublabel="تقليل إجهاد العين في الإضاءة المنخفضة"
              trailing={
                <div className="relative">
                  <Toggle enabled={darkMode} onToggle={toggleDarkMode} ariaLabel="الوضع الداكن" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />
                  <AnimatePresence>
                    {darkMode && (
                      <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="absolute -top-1 -left-1 pointer-events-none">
                        <Moon className="w-3 h-3 text-blue-200" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              }
            />
            {/* Language */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-green-500 text-white"><Globe className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>اللغة</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLanguage('ar')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${language === 'ar' ? 'bg-orange-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  <span>🇪🇬</span> العربية
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2 ${language === 'en' ? 'bg-orange-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  <span>🇬🇧</span> English
                </button>
              </div>
            </div>
            {/* Font size with live preview */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500 text-white"><Type className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>حجم الخط</p>
              </div>
              <div className={`rounded-lg p-3 mb-2 text-center ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <p className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`} style={{ fontSize: { small: '13px', medium: '16px', large: '19px', xlarge: '22px' }[appearance.fontSize] }}>
                  هذا نص تجريبي للمعاينة — نواقص
                </p>
              </div>
              <div className="flex gap-1.5">
                {([['small', 'صغير'], ['medium', 'متوسط'], ['large', 'كبير'], ['xlarge', 'ضخم']] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setAppearance((p) => ({ ...p, fontSize: val })); toast.success(t('settings.settingsUpdated')); }}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${appearance.fontSize === val ? 'bg-orange-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            {/* Theme color */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-500 text-white"><Palette className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>لون التطبيق</p>
              </div>
              <div className="flex gap-2">
                {([
                  ['orange', 'bg-orange-500'], ['blue', 'bg-blue-500'], ['green', 'bg-green-500'],
                  ['purple', 'bg-purple-500'], ['red', 'bg-red-500'], ['pink', 'bg-pink-500'],
                ] as const).map(([val, cls]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setAppearance((p) => ({ ...p, themeColor: val })); toast.success('تم تحديث لون التطبيق'); }}
                    className={`w-9 h-9 rounded-full ${cls} flex items-center justify-center transition-all active:scale-90 ${appearance.themeColor === val ? 'ring-2 ring-offset-2 ring-offset-transparent ring-gray-400 scale-110' : 'opacity-70 hover:opacity-100'}`}
                    aria-label={`لون ${val}`}
                  >
                    {appearance.themeColor === val && <CheckCircle className="w-4 h-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <Row darkMode={darkMode}
              icon={<Sparkles className="w-4 h-4" />}
              iconBg="bg-cyan-500 text-white"
              label="تقليل الحركة"
              sublabel="إيقاف الرسوم المتحركة"
              trailing={<Toggle enabled={appearance.reducedMotion} onToggle={() => { setAppearance((p) => ({ ...p, reducedMotion: !p.reducedMotion })); toast.success(t('settings.settingsUpdated')); }} ariaLabel="تقليل الحركة" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<LayoutGrid className="w-4 h-4" />}
              iconBg="bg-gray-500 text-white"
              label="الوضع المضغوط"
              sublabel="بطاقات أصغر، محتوى أكثر لكل شاشة"
              trailing={<Toggle enabled={appearance.compactMode} onToggle={() => { setAppearance((p) => ({ ...p, compactMode: !p.compactMode })); toast.success(t('settings.settingsUpdated')); }} ariaLabel="الوضع المضغوط" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
          </Group>
        </>
      )}

      {/* ───────── 5. SECURITY ───────── */}
      {sectionsVisible.security && (
        <>
          <SectionLabel darkMode={darkMode}>الأمان</SectionLabel>
          <Group darkMode={darkMode}>
            {/* Active sessions */}
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>الجلسات النشطة</p>
              {sessions.length > 1 && (
                <button onClick={handleRevokeAllOtherSessions} disabled={revokingAll}
                  className="text-[11px] font-bold text-red-500 hover:text-red-600 disabled:opacity-50 flex items-center gap-1">
                  {revokingAll && <Loader2 className="w-3 h-3 animate-spin" />}
                  إنهاء جميع الجلسات الأخرى
                </button>
              )}
            </div>
            <div className={`max-h-72 overflow-y-auto ${darkMode ? 'divide-y divide-gray-700/60' : 'divide-y divide-gray-100'}`}>
              {sessions.length > 0 ? sessions.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate flex items-center gap-1.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {s.device || s.userAgent || 'جهاز'}
                      {s.current && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500 text-white">الحالي</span>}
                    </p>
                    <p className={`text-[11px] truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.location || s.ip || ''} · {s.lastActive || ''}</p>
                  </div>
                  {!s.current && (
                    <button onClick={() => handleRevokeSession(s.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                      إنهاء
                    </button>
                  )}
                </div>
              )) : (
                <div className="px-4 py-8 text-center">
                  <Monitor className={`w-7 h-7 mx-auto mb-1.5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-[12px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>جلسة واحدة نشطة على الأقل (هذا الجهاز)</p>
                </div>
              )}
            </div>

            {/* Login history */}
            <div className="px-4 pt-3 pb-1">
              <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>سجل تسجيل الدخول</p>
            </div>
            <div className={`max-h-72 overflow-y-auto ${darkMode ? 'divide-y divide-gray-700/60' : 'divide-y divide-gray-100'}`}>
              {loginHistory.length > 0 ? loginHistory.slice(0, 10).map((h: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${h.success === false ? 'bg-red-500/15 text-red-500' : darkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-600'}`}>
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{h.device || h.ip || 'تسجيل دخول'}</p>
                    <p className={`text-[11px] truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {h.timestamp || h.time || ''}{h.location ? ` · ${h.location}` : ''}{h.ip ? ` · ${h.ip}` : ''}
                    </p>
                  </div>
                  {h.success === false && <span className="text-[10px] font-bold text-red-500">فشل</span>}
                </div>
              )) : (
                <div className="px-4 py-8 text-center">
                  <History className={`w-7 h-7 mx-auto mb-1.5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-[12px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>لا يوجد سجل دخول متاح</p>
                </div>
              )}
            </div>

            {/* Connected devices */}
            <div className="px-4 pt-3 pb-1">
              <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>الأجهزة المتصلة</p>
            </div>
            <div className={`max-h-64 overflow-y-auto ${darkMode ? 'divide-y divide-gray-700/60' : 'divide-y divide-gray-100'}`}>
              {devices.length > 0 ? devices.map((d: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{d.name || d.platform || 'جهاز'}</p>
                    <p className={`text-[11px] truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{d.lastUsed || d.registeredAt || ''}</p>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-8 text-center">
                  <Smartphone className={`w-7 h-7 mx-auto mb-1.5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-[12px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>لا توجد أجهزة مسجّلة</p>
                </div>
              )}
            </div>

            <Row darkMode={darkMode}
              icon={<Bell className="w-4 h-4" />}
              iconBg="bg-red-500 text-white"
              label="تنبيهات تسجيل الدخول"
              sublabel="إشعار عند الدخول من جهاز جديد"
              trailing={<Toggle enabled={loginAlerts} onToggle={() => { setLoginAlerts((v) => !v); toast.success(t('settings.settingsUpdated')); }} ariaLabel="تنبيهات تسجيل الدخول" darkMode={darkMode} reducedMotion={appearance.reducedMotion} />}
              onClick={undefined}
            />
          </Group>
        </>
      )}

      {/* ───────── 6. ABOUT ───────── */}
      {sectionsVisible.about && (
        <>
          <SectionLabel darkMode={darkMode}>حول التطبيق</SectionLabel>
          <Group darkMode={darkMode}>
            <Row darkMode={darkMode}
              icon={<Crown className="w-4 h-4" />}
              iconBg="bg-orange-500 text-white"
              label="نواقص — Nawaqes"
              trailing={<TrailingValue darkMode={darkMode}>2.0.0 (build 1)</TrailingValue>}
              onClick={undefined}
            />
            <Row darkMode={darkMode}
              icon={<FileText className="w-4 h-4" />}
              iconBg="bg-blue-500 text-white"
              label="شروط الخدمة"
              onClick={() => setLegalModal('terms')}
            />
            <Row darkMode={darkMode}
              icon={<Lock className="w-4 h-4" />}
              iconBg="bg-purple-500 text-white"
              label="سياسة الخصوصية"
              onClick={() => setLegalModal('privacy')}
            />
            <Row darkMode={darkMode}
              icon={<Shield className="w-4 h-4" />}
              iconBg="bg-green-500 text-white"
              label="إرشادات المجتمع"
              onClick={() => setLegalModal('community')}
            />
            <Row darkMode={darkMode}
              icon={<HelpCircle className="w-4 h-4" />}
              iconBg="bg-teal-500 text-white"
              label="مركز المساعدة والدعم"
              onClick={() => navigate('/help')}
            />
            <Row darkMode={darkMode}
              icon={<Mail className="w-4 h-4" />}
              iconBg="bg-rose-500 text-white"
              label="تواصل معنا"
              sublabel="support@nawaqes.com"
              onClick={() => navigate('/complaint')}
            />
            <Row darkMode={darkMode}
              icon={<Share2 className="w-4 h-4" />}
              iconBg="bg-cyan-500 text-white"
              label="شارك التطبيق"
              onClick={handleShareApp}
            />
          </Group>

          {/* Rate the app */}
          <Group darkMode={darkMode}>
            <div className="px-4 py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500 text-white"><Star className="w-4 h-4" /></div>
                <p className={`text-[15px] font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>قيّم التطبيق</p>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleSubmitRating(star)}
                    onMouseEnter={() => setRatingHover(star)}
                    onMouseLeave={() => setRatingHover(0)}
                    disabled={submittingRating}
                    className="transition-transform active:scale-90 disabled:opacity-50"
                    aria-label={`${star} نجوم`}
                  >
                    <Star
                      className={`w-7 h-7 ${(ratingHover || appRating) >= star ? 'fill-amber-400 text-amber-400' : darkMode ? 'text-gray-600' : 'text-gray-300'}`}
                    />
                  </button>
                ))}
                {appRating > 0 && (
                  <span className={`text-xs font-bold mr-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>شكراً لتقييمك ({appRating}/5)</span>
                )}
              </div>
            </div>
          </Group>
        </>
      )}

      {/* ───────── 7. DANGER ZONE ───────── */}
      {sectionsVisible.danger && (
        <>
          <SectionLabel darkMode={darkMode}>منطقة الخطر</SectionLabel>
          <Group darkMode={darkMode}>
            <Row darkMode={darkMode}
              icon={<HardDrive className="w-4 h-4" />}
              iconBg="bg-yellow-500 text-white"
              label={t('settings.clearCache')}
              sublabel={t('settings.clearCacheDesc')}
              onClick={handleClearCache}
            />
            <Row darkMode={darkMode}
              icon={<PauseCircle className="w-4 h-4" />}
              iconBg="bg-amber-500 text-white"
              label="تعطيل الحساب مؤقتاً"
              sublabel="إخفاء حسابك مع إمكانية الاستعادة لاحقاً"
              onClick={() => setShowDeactivateModal(true)}
            />
            <Row darkMode={darkMode}
              icon={<Trash2 className="w-4 h-4" />}
              iconBg="bg-red-500 text-white"
              label="حذف الحساب نهائياً"
              sublabel="إجراء لا يمكن التراجع عنه"
              danger
              onClick={() => { setShowDeleteModal(true); setDeleteStep(1); }}
            />
          </Group>
        </>
      )}

      {/* Footer note */}
      <div className="text-center mt-6">
        <p className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          نواقص — Nawaqes · الإصدار 2.0.0 · جميع الحقوق محفوظة © {new Date().getFullYear()}
        </p>
      </div>

      {/* ─── Modals ───────────────────────────────────────────────────── */}

      {/* Profile Editor */}
      <Modal open={showProfileEditor} onClose={() => setShowProfileEditor(false)} title="تعديل الحساب" darkMode={darkMode}>
        <div className="p-5 space-y-3">
          <div>
            <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>الاسم</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`} />
          </div>
          <div>
            <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>النبذة</label>
            <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3}
              className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`} />
          </div>
          <div>
            <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>الموقع</label>
            <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`} />
          </div>
          <button onClick={handleSaveProfileEdits} type="button"
            className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all">
            {t('common.save')}
          </button>
        </div>
      </Modal>

      {/* Change Password */}
      <Modal open={showPwModal} onClose={() => setShowPwModal(false)} title="تغيير كلمة المرور" darkMode={darkMode}>
        <div className="p-5 space-y-3">
          <PwInput label="كلمة المرور الحالية" value={oldPw} onChange={setOldPw} show={showPw} onToggle={() => setShowPw(!showPw)} darkMode={darkMode} />
          <PwInput label="كلمة المرور الجديدة" value={newPw} onChange={setNewPw} show={showPw} onToggle={() => setShowPw(!showPw)} darkMode={darkMode} placeholder="8+ أحرف، أرقام، رموز" />
          {newPw && (
            <div>
              <div className="flex gap-1 mb-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < strength.score ? strength.color : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                ))}
              </div>
              <p className={`text-[11px] font-bold ${strength.textColor}`}>{strength.label}</p>
            </div>
          )}
          <PwInput label="تأكيد كلمة المرور" value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(!showPw)} darkMode={darkMode} />
          {confirmPw && confirmPw !== newPw && (
            <p className="text-[11px] font-bold text-red-500">كلمتا المرور غير متطابقتين</p>
          )}
          <button onClick={handleChangePassword} type="button" disabled={changingPw || !oldPw || !newPw || newPw !== confirmPw}
            className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {changingPw && <Loader2 className="w-4 h-4 animate-spin" />}
            {changingPw ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}
          </button>
        </div>
      </Modal>

      {/* 2FA Modal with QR + code */}
      <TwoFAModal
        open={show2FAModal}
        onClose={() => setShow2FAModal(false)}
        onConfirm={handleConfirmEnable2FA}
        darkMode={darkMode}
        qr={qr2FA}
        verifying={verifying2FA}
      />

      {/* Change Phone Modal */}
      <ChangePhoneModal
        open={showChangePhone}
        onClose={() => setShowChangePhone(false)}
        darkMode={darkMode}
        currentPhone={currentUser?.phone || ''}
        onSaved={(newPhone) => {
          setPhoneVerified(!!newPhone);
          updateProfile({ phone: newPhone } as any);
          toast.success('تم تحديث رقم الهاتف');
        }}
      />

      {/* Legal modal */}
      <Modal open={legalModal !== null} onClose={() => setLegalModal(null)} title={
        legalModal === 'terms' ? 'شروط الخدمة' :
        legalModal === 'privacy' ? 'سياسة الخصوصية' :
        'إرشادات المجتمع'
      } darkMode={darkMode} maxWidth="max-w-lg">
        <div className="p-5">
          <LegalContent kind={legalModal} darkMode={darkMode} />
        </div>
      </Modal>

      {/* Deactivate confirmation */}
      <Modal open={showDeactivateModal} onClose={() => setShowDeactivateModal(false)} title="تعطيل الحساب مؤقتاً" darkMode={darkMode}>
        <div className="p-5 space-y-3">
          <div className={`rounded-xl p-4 border flex items-start gap-2 ${darkMode ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className={`text-xs leading-relaxed ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
              سيتم إخفاء حسابك ومنشوراتك مؤقتاً. يمكنك استعادة الحساب في أي وقت بتسجيل الدخول مرة أخرى.
            </p>
          </div>
          <PwInput label="كلمة المرور للتأكيد" value={deactivatePw} onChange={setDeactivatePw} show={showPw} onToggle={() => setShowPw(!showPw)} darkMode={darkMode} />
          <div className="flex gap-2">
            <button onClick={handleDeactivate} disabled={isDeactivating || !deactivatePw} type="button"
              className="flex-1 bg-amber-600 text-white py-3 rounded-xl text-sm font-black hover:bg-amber-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {isDeactivating && <Loader2 className="w-4 h-4 animate-spin" />}
              تعطيل الحساب
            </button>
            <button onClick={() => setShowDeactivateModal(false)} type="button"
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete account multi-step */}
      <Modal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setDeleteStep(1); }} title="حذف الحساب نهائياً" darkMode={darkMode}>
        <div className="p-5 space-y-4">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full ${deleteStep >= s ? 'bg-red-500' : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            ))}
          </div>

          {deleteStep === 1 && (
            <div className="space-y-3">
              <div className={`rounded-xl p-4 border flex items-start gap-2 ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                <AlertOctagon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className={`text-xs leading-relaxed ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                  <p className="font-bold mb-1">تحذير نهائي</p>
                  <p>سيتم حذف حسابك وكل بياناتك بشكل دائم لا يمكن استرجاعه: المنشورات، الإعلانات، الرسائل، المحفظة، المتابعين، والمحادثات.</p>
                </div>
              </div>
              <PwInput label="أدخل كلمة المرور للتأكيد" value={deletePw} onChange={setDeletePw} show={showPw} onToggle={() => setShowPw(!showPw)} darkMode={darkMode} />
              <button onClick={handleDeleteAccount} type="button" disabled={!deletePw}
                className="w-full bg-red-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50">
                متابعة
              </button>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="space-y-3">
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>أخبرنا السبب (اختياري):</p>
              <div className="space-y-2">
                {['لا أستخدم التطبيق', 'لديّ حساب آخر', 'قلّة المتابعين', 'مخاوف تتعلق بالخصوصية', 'صعوبة الاستخدام', 'سبب آخر'].map((r) => (
                  <button key={r} onClick={() => setDeleteReason(r)} type="button"
                    className={`w-full text-start px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all ${deleteReason === r ? (darkMode ? 'bg-red-900/30 border-red-700 text-red-300' : 'bg-red-50 border-red-300 text-red-700') : (darkMode ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-500' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300')}`}>
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeleteStep(1)} type="button"
                  className={`flex-1 py-3 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  السابق
                </button>
                <button onClick={handleDeleteAccount} type="button"
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-black hover:bg-red-700 active:scale-95 transition-all">
                  التالي
                </button>
              </div>
            </div>
          )}

          {deleteStep === 3 && (
            <div className="space-y-3">
              <div className={`rounded-xl p-4 border ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                <p className={`text-xs leading-relaxed font-bold text-center ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                  اضغط على «حذف نهائي» لتأكيد حذف حسابك. هذا الإجراء لا يمكن التراجع عنه.
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDeleteStep(2)} type="button"
                  className={`flex-1 py-3 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  السابق
                </button>
                <button onClick={handleDeleteAccount} disabled={isDeletingAccount} type="button"
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-black hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {isDeletingAccount && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isDeletingAccount ? 'جارٍ الحذف...' : 'حذف نهائي'}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

// ─── 2FA Modal with QR + verification code ────────────────────────────
const TwoFAModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (code: string) => void;
  darkMode: boolean;
  qr: { url?: string; secret?: string } | null;
  verifying: boolean;
}> = ({ open, onClose, onConfirm, darkMode, qr, verifying }) => {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!open) { setCode(''); setCopied(false); } }, [open]);

  // Build a fake QR placeholder using SVG grid when no real url provided
  const QrPlaceholder: React.FC = () => (
    <div className={`w-44 h-44 mx-auto rounded-xl p-2 ${darkMode ? 'bg-white' : 'bg-white border border-gray-200'}`}>
      <svg viewBox="0 0 21 21" className="w-full h-full">
        {/* corner markers */}
        <rect x="0" y="0" width="7" height="7" fill="black" />
        <rect x="1" y="1" width="5" height="5" fill="white" />
        <rect x="2" y="2" width="3" height="3" fill="black" />
        <rect x="14" y="0" width="7" height="7" fill="black" />
        <rect x="15" y="1" width="5" height="5" fill="white" />
        <rect x="16" y="2" width="3" height="3" fill="black" />
        <rect x="0" y="14" width="7" height="7" fill="black" />
        <rect x="1" y="15" width="5" height="5" fill="white" />
        <rect x="2" y="16" width="3" height="3" fill="black" />
        {/* pseudo-random pattern */}
        {Array.from({ length: 21 * 21 }).map((_, i) => {
          const x = i % 21;
          const y = Math.floor(i / 21);
          if ((x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13)) return null;
          return (x * 7 + y * 11 + x * y) % 3 === 0 ? <rect key={i} x={x} y={y} width="1" height="1" fill="black" /> : null;
        })}
      </svg>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="تفعيل التحقق بخطوتين" darkMode={darkMode}>
      <div className="p-5 space-y-4">
        <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          امسح رمز الاستجابة السريعة (QR) بتطبيق المصادقة لديك مثل Google Authenticator أو Authy، ثم أدخل الرمز المكوّن من 6 أرقام.
        </p>

        {/* QR code area */}
        {qr?.url ? (
          <div className="flex justify-center">
            <img src={qr.url} alt="QR Code" className="w-44 h-44 rounded-xl border border-gray-200 bg-white p-2" />
          </div>
        ) : (
          <QrPlaceholder />
        )}

        {/* Secret */}
        {qr?.secret && (
          <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-[10px] font-bold uppercase ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>المفتاح السري</p>
                <p className={`text-xs font-mono truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{qr.secret}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(qr.secret || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className={`flex-shrink-0 p-2 rounded-lg ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-white border border-gray-200 hover:bg-gray-100 text-gray-600'}`}
                aria-label="نسخ المفتاح"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Code input */}
        <div>
          <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>رمز التحقق (6 أرقام)</label>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            dir="ltr"
            className={`w-full px-4 py-3 rounded-xl border outline-none text-2xl font-black text-center tracking-[0.3em] ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
          />
        </div>

        <button
          type="button"
          onClick={() => onConfirm(code)}
          disabled={code.length < 6 || verifying}
          className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
          {verifying ? 'جارٍ التحقق...' : 'تأكيد الرمز'}
        </button>
      </div>
    </Modal>
  );
};

// ─── Change Phone Modal ───────────────────────────────────────────────
const ChangePhoneModal: React.FC<{
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  currentPhone: string;
  onSaved: (newPhone: string) => void;
}> = ({ open, onClose, darkMode, currentPhone, onSaved }) => {
  const [phone, setPhone] = useState(currentPhone);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => { if (open) { setPhone(currentPhone); setCode(''); setCodeSent(false); } }, [open, currentPhone]);

  const sendCode = async () => {
    if (!phone || phone.length < 8) {
      toast.error('أدخل رقم هاتف صحيح');
      return;
    }
    setSending(true);
    try {
      await api.sendPhoneVerification(phone);
      setCodeSent(true);
      toast.success('تم إرسال رمز التحقق إلى رقمك');
    } catch (err: any) {
      toast.error(err?.message || 'تعذّر إرسال الرمز');
    } finally {
      setSending(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateMyPhone(phone, code || undefined);
      onSaved(phone);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تحديث رقم الهاتف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="تغيير رقم الهاتف" darkMode={darkMode}>
      <div className="p-5 space-y-3">
        <div>
          <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>رقم الهاتف الجديد</label>
          <input
            type="tel"
            value={phone}
            dir="ltr"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+20 1xxxxxxxxx"
            className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
          />
        </div>
        <button onClick={sendCode} disabled={sending || !phone} type="button"
          className="w-full py-2.5 rounded-xl text-sm font-bold bg-gray-500 text-white hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {sending && <Loader2 className="w-4 h-4 animate-spin" />}
          {codeSent ? 'إعادة إرسال الرمز' : 'إرسال رمز التحقق'}
        </button>
        {codeSent && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>رمز التحقق</label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              dir="ltr"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className={`w-full px-4 py-3 rounded-xl border outline-none text-xl font-black text-center tracking-[0.3em] ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
            />
          </motion.div>
        )}
        <button onClick={save} disabled={saving || !phone} type="button"
          className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          حفظ
        </button>
      </div>
    </Modal>
  );
};

// ─── Legal content (Terms / Privacy / Community) ──────────────────────
const LegalContent: React.FC<{ kind: 'terms' | 'privacy' | 'community' | null; darkMode: boolean }> = ({ kind, darkMode }) => {
  if (!kind) return null;
  const content: Record<string, { title: string; body: string[] }> = {
    terms: {
      title: 'شروط الخدمة',
      body: [
        'باستخدامك لتطبيق نواقص فإنك توافق على الالتزام بهذه الشروط. يُمنع استخدام التطبيق لأي أغراض غير قانونية أو مخالفة للآداب العامة.',
        'يحتفظ إدارة التطبيق بحق إيقاف أو حذف أي حساب يخالف الشروط دون إشعار مسبق.',
        'المحتوى المنشور من قِبلك يبقى ملكيتك، ولكنك تمنحنا ترخيصاً لعرضه ضمن خدمة نواقص.',
        'نواقص غير مسؤول عن أي تعاملات مالية تتم بين المستخدمين خارج إطار المنصة الرسمي.',
        'نحتفظ بحق تعديل هذه الشروط في أي وقت، وسيتم إشعارك بأي تغييرات جوهرية.',
      ],
    },
    privacy: {
      title: 'سياسة الخصوصية',
      body: [
        'نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. نجمع فقط المعلومات الضرورية لتقديم الخدمة.',
        'لا نبيع بياناتك لأي طرف ثالث. قد نشاركها فقط عند الضرورة القانونية أو لمنع الاحتيال.',
        'يمكنك التحكم الكامل في ظهور بياناتك من خلال إعدادات الخصوصية في حسابك.',
        'نستخدم ملفات تعريف الارتباط (cookies) لتحسين تجربتك وتذكر تفضيلاتك.',
        'لديك حق الوصول إلى بياناتك أو تعديلها أو حذفها في أي وقت.',
      ],
    },
    community: {
      title: 'إرشادات المجتمع',
      body: [
        'كن محترماً: لا تنشر محتوى مسيئاً أو عنصرياً أو يحض على الكراهية.',
        'لا تنشر معلومات شخصية للآخرين دون إذنهم.',
        'الإعلانات المضللة أو الاحتيالية ممنوعة، وسيتم حذفها فوراً.',
        'احترم حقوق الملكية الفكرية ولا تنشر محتوى محمي بحقوق غير لك.',
        'ساعد في الحفاظ على مجتمع آمن للجميع بالإبلاغ عن أي محتوى مخالف.',
      ],
    },
  };
  const c = content[kind];
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
          <FileText className="w-5 h-5" />
        </div>
        <h3 className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.title}</h3>
      </div>
      <ol className="space-y-3 list-decimal list-inside">
        {c.body.map((p, i) => (
          <li key={i} className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{p}</li>
        ))}
      </ol>
      <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>آخر تحديث: يناير 2026 · نواقص — Nawaqes</p>
      </div>
    </div>
  );
};
// Settings fix v2
