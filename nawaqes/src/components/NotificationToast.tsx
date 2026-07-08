// ─── Notification Toast - Enhanced Notification System ──────────
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageCircle, CreditCard, Megaphone, AlertTriangle, UserPlus, Settings, Bell, X, Target, Share2, ShoppingBag, Zap, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Notification } from '../types';

// ─── Notification type config (with more types and better colors) ───
const notifConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; accent: string }> = {
  like:      { icon: <Heart className="w-5 h-5" />,         color: 'text-rose-500',    bg: 'bg-rose-500/15',  accent: 'border-l-rose-500' },
  comment:   { icon: <MessageCircle className="w-5 h-5" />,  color: 'text-teal-500',    bg: 'bg-teal-500/15',  accent: 'border-l-teal-500' },
  message:   { icon: <MessageCircle className="w-5 h-5" />,  color: 'text-green-500',   bg: 'bg-green-500/15', accent: 'border-l-green-500' },
  promotion: { icon: <Megaphone className="w-5 h-5" />,      color: 'text-orange-500',  bg: 'bg-orange-500/15',accent: 'border-l-orange-500' },
  payment:   { icon: <CreditCard className="w-5 h-5" />,     color: 'text-emerald-500', bg: 'bg-emerald-500/15',accent: 'border-l-emerald-500' },
  alert:     { icon: <AlertTriangle className="w-5 h-5" />,  color: 'text-red-500',     bg: 'bg-red-500/15',   accent: 'border-l-red-500' },
  friend:    { icon: <UserPlus className="w-5 h-5" />,       color: 'text-purple-500',  bg: 'bg-purple-500/15',accent: 'border-l-purple-500' },
  system:    { icon: <Settings className="w-5 h-5" />,       color: 'text-gray-500',    bg: 'bg-gray-500/15',  accent: 'border-l-gray-500' },
  match:     { icon: <Target className="w-5 h-5" />,         color: 'text-blue-500',    bg: 'bg-blue-500/15',  accent: 'border-l-blue-500' },
  share:     { icon: <Share2 className="w-5 h-5" />,         color: 'text-cyan-500',    bg: 'bg-cyan-500/15',  accent: 'border-l-cyan-500' },
  market:    { icon: <ShoppingBag className="w-5 h-5" />,     color: 'text-amber-500',   bg: 'bg-amber-500/15', accent: 'border-l-amber-500' },
  warning:   { icon: <AlertTriangle className="w-5 h-5" />,  color: 'text-yellow-500',  bg: 'bg-yellow-500/15',accent: 'border-l-yellow-500' },
  livestream:{ icon: <Radio className="w-5 h-5" />,          color: 'text-red-500',     bg: 'bg-red-500/15',   accent: 'border-l-red-500' },
};

const defaultConfig = notifConfig.system;

// ─── Pleasant notification sound (soft two-tone chime) ────────────
let lastSoundTime = 0;
const playNotificationSound = () => {
  try {
    const now = Date.now();
    // Don't play sound more than once every 3 seconds (prevents spam)
    if (now - lastSoundTime < 3000) return;
    lastSoundTime = now;

    // Check if sounds are muted
    if (localStorage.getItem('nawaqes_notif_sound_muted') === 'true') return;

    const ctx = new AudioContext();
    const nowCtx = ctx.currentTime;

    // First tone - a soft chime (E5 = 659 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(659, nowCtx);
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0, nowCtx);
    gain1.gain.linearRampToValueAtTime(0.06, nowCtx + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, nowCtx + 0.25);
    osc1.start(nowCtx);
    osc1.stop(nowCtx + 0.25);

    // Second tone - slightly higher (G5 = 784 Hz) for a pleasant ring
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(784, nowCtx + 0.1);
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0, nowCtx + 0.1);
    gain2.gain.linearRampToValueAtTime(0.04, nowCtx + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, nowCtx + 0.35);
    osc2.start(nowCtx + 0.1);
    osc2.stop(nowCtx + 0.35);

    setTimeout(() => ctx.close(), 500);
  } catch {}
};

// ─── Enhanced Toast Item ─────────────────────────────────────────
interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onClick: (notification: Notification) => void;
  darkMode: boolean;
  dir: 'rtl' | 'ltr';
}

const AUTO_DISMISS_MS = 4000;

const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss, onClick, darkMode, dir }) => {
  const config = notifConfig[notification.type] || defaultConfig;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ y: -30, opacity: 0, scale: 0.95, x: dir === 'rtl' ? 50 : -50 }}
      animate={{ y: 0, opacity: 1, scale: 1, x: 0 }}
      exit={{ y: -15, opacity: 0, scale: 0.95, x: dir === 'rtl' ? 30 : -30 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={() => { onClick(notification); onDismiss(notification.id); }}
      className={`cursor-pointer rounded-2xl shadow-lg overflow-hidden border-l-4 ${config.accent} ${
        darkMode
          ? 'bg-gray-800/98 border-gray-700/40'
          : 'bg-white/98 border-gray-200/60'
      } backdrop-blur-md`}
      dir={dir}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Icon with animation */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${config.bg} ${config.color}`}
        >
          {config.icon}
        </motion.div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-semibold leading-snug line-clamp-2 ${
            darkMode ? 'text-gray-100' : 'text-gray-800'
          }`}>
            {notification.message}
          </p>
          <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {notification.type === 'like' ? 'إعجاب' :
             notification.type === 'comment' ? 'تعليق' :
             notification.type === 'message' ? 'رسالة' :
             notification.type === 'friend' ? 'صداقة' :
             notification.type === 'payment' ? 'دفعة' :
             notification.type === 'alert' ? 'تنبيه' :
             notification.type === 'match' ? 'توافق' :
             notification.type === 'share' ? 'مشاركة' :
             notification.type === 'market' ? 'سوق' :
             notification.type === 'promotion' ? 'ترويج' :
             notification.type === 'warning' ? 'تحذير' : 'نظام'}
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
            darkMode ? 'hover:bg-gray-600 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
          } hover:scale-110`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar for auto-dismiss */}
      <motion.div
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
        className={`h-0.5 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}
      />
    </motion.div>
  );
};

// ─── NotificationToast Component ──────────────────────────────────
export const NotificationToast: React.FC = () => {
  const { notifications, readNotificationIds, darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const navigate = useNavigate();

  const [activeToasts, setActiveToasts] = useState<Notification[]>([]);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const lastToastTimeRef = useRef(0);

  // ─── DISABLED per user request (2026-06-24) ───
  // In-app notification popups are no longer shown. The user wants to
  // rely on:
  //   1. The bell badge counter in the Navbar (red number)
  //   2. The Notifications page (as the central hub)
  //   3. OS-level push notifications (FCM) for important events
  //
  // The new-notification detection logic below still MARKS notifications
  // as "shown" (so the badge counter doesn't keep incrementing on every
  // render), but it does NOT add them to `activeToasts` and does NOT
  // play a sound. The rendered toast UI is also short-circuited (returns
  // null at the bottom of this component).
  useEffect(() => {
    const unreadNotifs = notifications.filter(n => !readNotificationIds.has(n.id));
    const newNotifs = unreadNotifs.filter(n => !shownIdsRef.current.has(n.id));

    if (newNotifs.length > 0) {
      // Mark all new notifs as "seen by the toast system" so the bell
      // badge counter doesn't re-trigger sound/popup logic for them.
      // The actual visual indicator is the red badge number on the bell
      // icon in the Navbar — that's controlled by `readNotificationIds`
      // and the unread count, not by this component.
      newNotifs.forEach(n => shownIdsRef.current.add(n.id));
    }
  }, [notifications, readNotificationIds]);

  // Short-circuit: never render any toast UI.
  // (The component is still mounted so the dedup logic above keeps
  // running, but nothing visual is shown.)

  const dismissToast = useCallback((id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleToastClick = useCallback((notif: Notification) => {
    // Priority: link > postId > userId > type-based routing
    if (notif.link) {
      navigate(notif.link);
    } else if (notif.postId) {
      // Check if this is a market notification
      if (notif.type === 'match' || notif.type === 'promotion') {
        navigate(`/market/listing/${notif.postId}`);
      } else {
        navigate(`/post/${notif.postId}`);
      }
    } else if (notif.userId && notif.userId !== currentUser?.id) {
      if (notif.type === 'message') {
        navigate('/connect');
      } else {
        navigate(`/user/${notif.userId}`);
      }
    } else {
      // Type-based fallback routing
      switch (notif.type) {
        case 'match': navigate('/market'); break;
        case 'payment': navigate('/wallet'); break;
        case 'promotion': navigate('/promotions'); break;
        case 'message': navigate('/connect'); break;
        case 'friend': navigate('/friends?tab=requests'); break;
        case 'livestream': navigate('/channels'); break; // 🔧 redirect to Channels (standalone /live-stream deprecated)
        case 'alert': navigate('/market-pulse'); break;
        case 'like': navigate('/connect'); break;
        case 'comment': navigate('/connect'); break;
        case 'share': navigate('/connect'); break;
        default: navigate('/notifications'); break;
      }
    }
  }, [navigate, currentUser?.id]);

  // ─── DISABLED per user request (2026-06-24) ───
  // Never render any toast popups. The bell badge counter in the Navbar
  // is the only in-app notification indicator.
  return null;

  // (Code below is unreachable — kept for reference in case we want to
  // re-enable popups later via a per-user setting.)
  if (activeToasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[200] flex justify-center pointer-events-none" dir={dir}>
      <div className="w-full max-w-sm pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {activeToasts.map(toast => (
            <ToastItem
              key={toast.id}
              notification={toast}
              onDismiss={dismissToast}
              onClick={handleToastClick}
              darkMode={darkMode}
              dir={dir}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

// Export the sound toggle utility for use in NotificationsPage
export const isNotificationSoundMuted = () => localStorage.getItem('nawaqes_notif_sound_muted') === 'true';
export const toggleNotificationSound = () => {
  const current = isNotificationSoundMuted();
  localStorage.setItem('nawaqes_notif_sound_muted', String(!current));
  return !current;
};
