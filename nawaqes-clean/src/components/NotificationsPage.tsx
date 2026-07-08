// ─── Notifications Page - Restructured ────────────────────────────────
import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Bell,
  Zap,
  MessageCircle,
  Sparkles,
  Shield,
  Target,
  CheckCheck,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Heart,
  Users,
  Share2,
  ShoppingBag,
  RefreshCw,
  Volume2,
  VolumeX,
  Check,
  Trash2,
  ChevronDown,
  Radio,
  CheckCircle2,
  X as XIcon,
  Wallet,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast as sonnerToast } from 'sonner';
import { toast } from '../lib/silentToast';
import type { Notification as AppNotification } from '../types';
import { formatRelativeTimeAr } from '../utils/time';
import { isNotificationSoundMuted, toggleNotificationSound } from './NotificationToast';
import { useSafeBack } from '../hooks/useSafeBack';

// Critical error toast — bypasses silentToast's silent-success wrapper
// so genuinely important errors (money failures, network errors) still
// surface to the user.
function criticalError(msg: string) {
  (toast as unknown as { error: (m: string, opts?: Record<string, unknown>) => void }).error(msg, { critical: true });
}

type FilterType = 'all' | 'system' | 'promotion' | 'payment' | 'message' | 'match' | 'alert' | 'friend' | 'like' | 'comment' | 'share' | 'market' | 'warning' | 'livestream' | 'story_reaction';

// ─── Grouping utility ──────────────────────────────────────────────
interface GroupedNotification {
  type: 'single' | 'group';
  id: string; // unique key for React
  notification: AppNotification;
  groupedNotifications?: AppNotification[];
  groupCount?: number;
  groupLabel?: string;
}

function groupNotifications(notifications: AppNotification[]): GroupedNotification[] {
  const ONE_HOUR = 60 * 60 * 1000;
  const result: GroupedNotification[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < notifications.length; i++) {
    const notif = notifications[i];
    if (processed.has(notif.id)) continue;

    // Try to group with subsequent notifications of the same type within 1 hour
    // that share the same postId (e.g., multiple likes on the same post)
    const group: AppNotification[] = [notif];
    const notifTime = new Date(notif.time).getTime();

    for (let j = i + 1; j < notifications.length; j++) {
      const other = notifications[j];
      if (processed.has(other.id)) continue;

      const otherTime = new Date(other.time).getTime();
      if (Math.abs(notifTime - otherTime) > ONE_HOUR) break;

      if (other.type === notif.type && other.postId && other.postId === notif.postId) {
        group.push(other);
        processed.add(other.id);
      }
    }

    if (group.length >= 3) {
      // Create a grouped notification
      const typeLabelMap: Record<string, string> = {
        like: 'أعجبوا بمنشورك',
        comment: 'علّقوا على منشورك',
        share: 'شاركوا منشورك',
        friend: 'أرسلوا طلب صداقة',
      };
      result.push({
        type: 'group',
        id: `group_${notif.id}`,
        notification: notif,
        groupedNotifications: group,
        groupCount: group.length,
        groupLabel: `${group.length} ${typeLabelMap[notif.type] || notif.message}`,
      });
    } else {
      result.push({
        type: 'single',
        id: notif.id,
        notification: notif,
      });
    }
  }

  return result;
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { currentUser } = useAuth();
  const { notifications, readNotificationIds, markAllNotificationsRead, markNotificationRead, deleteNotification, darkMode, adminAlerts, refreshData } = useAppContext();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [highlightedNewsId, setHighlightedNewsId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [soundMuted, setSoundMuted] = useState(isNotificationSoundMuted());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ─── Wallet transfer acceptance state ────────────────────────────
  // Tracks which transfer notifications the user has already acted on
  // (accepted/rejected) so we can hide the Accept/Reject buttons after
  // the action is taken. Maps transferId → 'accepting' | 'rejecting' | 'done'.
  const [transferActionState, setTransferActionState] = useState<Record<string, 'accepting' | 'rejecting' | 'done'>>({});

  // Detect whether a notification is a wallet-transfer request that
  // needs Accept/Reject buttons. The backend stores the transfer id in
  // the notification's post_id column AND encodes it in the link as
  // `/wallet?transfer=<transferId>`.
  const isTransferRequest = useCallback((notif: AppNotification): boolean => {
    if (notif.type !== 'payment') return false;
    // The transfer id is in post_id (legacy column reuse) and also in
    // the link as ?transfer=<id>. We check the link because it's the
    // most stable signal.
    if (notif.link && notif.link.includes('?transfer=')) return true;
    // Fallback: detect by message pattern (Arabic).
    if (notif.message && notif.message.startsWith('لديك تحويل بقيمة')) return true;
    return false;
  }, []);

  const getTransferId = (notif: AppNotification): string | undefined => {
    if (notif.link && notif.link.includes('?transfer=')) {
      try {
        const url = new URL(notif.link, window.location.origin);
        return url.searchParams.get('transfer') || undefined;
      } catch {
        // Fall back to manual split
        const idx = notif.link.indexOf('?transfer=');
        if (idx >= 0) return notif.link.slice(idx + '?transfer='.length);
      }
    }
    return notif.postId;
  };

  const handleAcceptTransfer = async (notif: AppNotification) => {
    const transferId = getTransferId(notif);
    if (!transferId) return;
    setTransferActionState(prev => ({ ...prev, [transferId]: 'accepting' }));
    try {
      await api.acceptTransfer(transferId);
      // Use sonner directly so the success toast actually shows.
      sonnerToast.success('تم قبول التحويل وإضافة المبلغ إلى محفظتك');
      markNotificationRead(notif.id);
      setTransferActionState(prev => ({ ...prev, [transferId]: 'done' }));
      // Refresh notifications so the bell badge + notifications list
      // reflect the new state (the original "لديك تحويل..." notification
      // stays but is now read; the sender will have received a new
      // "تم قبول تحويلك..." notification on their side).
      refreshData().catch(() => {});
    } catch (err: any) {
      criticalError(err?.message || 'فشل قبول التحويل');
      setTransferActionState(prev => ({ ...prev, [transferId]: 'done' }));
    }
  };

  const handleRejectTransfer = async (notif: AppNotification) => {
    const transferId = getTransferId(notif);
    if (!transferId) return;
    setTransferActionState(prev => ({ ...prev, [transferId]: 'rejecting' }));
    try {
      await api.rejectTransfer(transferId);
      sonnerToast.success('تم رفض التحويل واسترجاع المبلغ للمرسل');
      markNotificationRead(notif.id);
      setTransferActionState(prev => ({ ...prev, [transferId]: 'done' }));
      refreshData().catch(() => {});
    } catch (err: any) {
      criticalError(err?.message || 'فشل رفض التحويل');
      setTransferActionState(prev => ({ ...prev, [transferId]: 'done' }));
    }
  };

  // Handle deep-linking from breaking news clicks
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const filterParam = params.get('filter');
    const newsIdParam = params.get('newsId');

    if (filterParam && ['all', 'system', 'promotion', 'payment', 'message', 'match', 'alert', 'friend', 'like', 'comment', 'share', 'market', 'warning', 'livestream'].includes(filterParam)) {
      setActiveFilter(filterParam as FilterType);
    }
    if (newsIdParam) {
      setHighlightedNewsId(newsIdParam);
      window.history.replaceState(null, '', window.location.hash.split('?')[0]);
    }
  }, []);

  const filters: { id: FilterType; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: t('notifications.filterAll'), icon: <Bell className="w-3 h-3" /> },
    { id: 'alert', label: t('notifications.filterAlert'), icon: <AlertTriangle className="w-3 h-3" /> },
    { id: 'warning', label: t('notifications.filterWarning', 'تحذيرات'), icon: <AlertTriangle className="w-3 h-3" /> },
    { id: 'system', label: t('notifications.filterSystem'), icon: <Shield className="w-3 h-3" /> },
    { id: 'friend', label: t('notifications.filterFriend'), icon: <Users className="w-3 h-3" /> },
    { id: 'like', label: t('notifications.filterLike'), icon: <Heart className="w-3 h-3" /> },
    { id: 'comment', label: t('notifications.filterComment'), icon: <MessageCircle className="w-3 h-3" /> },
    { id: 'promotion', label: t('notifications.filterPromotion'), icon: <Sparkles className="w-3 h-3" /> },
    { id: 'payment', label: t('notifications.filterPayment'), icon: <Zap className="w-3 h-3" /> },
    { id: 'message', label: t('notifications.filterMessage'), icon: <MessageCircle className="w-3 h-3" /> },
    { id: 'share', label: t('notifications.filterShare', 'مشاركة'), icon: <Share2 className="w-3 h-3" /> },
    { id: 'market', label: t('notifications.filterMarket', 'سوق'), icon: <ShoppingBag className="w-3 h-3" /> },
    { id: 'match', label: t('notifications.filterMatch'), icon: <Target className="w-3 h-3" /> },
    { id: 'livestream', label: t('notifications.filterLivestream', 'بث مباشر'), icon: <Radio className="w-3 h-3" /> },
    { id: 'story_reaction', label: t('notifications.filterStoryReaction', 'تفاعلات القصص'), icon: <Heart className="w-3 h-3" /> },
  ];

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    return notifications.filter(n => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const groupedNotifications = useMemo(() => {
    return groupNotifications(filteredNotifications);
  }, [filteredNotifications]);

  const unreadCount = notifications.filter(n => !readNotificationIds.has(n.id)).length;
  const filteredUnreadCount = filteredNotifications.filter(n => !readNotificationIds.has(n.id)).length;

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'match': return <Target className="w-4 h-4 text-blue-500" />;
      case 'payment': return <Zap className="w-4 h-4 text-green-500" />;
      case 'promotion': return <Sparkles className="w-4 h-4 text-purple-500" />;
      case 'message': return <MessageCircle className="w-4 h-4 text-orange-500" />;
      case 'alert': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'friend': return <Users className="w-4 h-4 text-indigo-500" />;
      case 'like': return <Heart className="w-4 h-4 text-pink-500" />;
      case 'comment': return <MessageCircle className="w-4 h-4 text-teal-500" />;
      case 'share': return <Share2 className="w-4 h-4 text-cyan-500" />;
      case 'market': return <ShoppingBag className="w-4 h-4 text-amber-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'livestream': return <Radio className="w-4 h-4 text-red-500" />;
      default: return <Bell className="w-4 h-4 text-gray-500" />;
    }
  };

  const getNotifBg = (type: string, isRead: boolean) => {
    if (isRead) {
      return darkMode ? 'bg-gray-800/50' : 'bg-white';
    }
    switch (type) {
      case 'match': return darkMode ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100';
      case 'payment': return darkMode ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-100';
      case 'promotion': return darkMode ? 'bg-purple-900/20 border-purple-800/30' : 'bg-purple-50 border-purple-100';
      case 'message': return darkMode ? 'bg-orange-900/20 border-orange-800/30' : 'bg-orange-50 border-orange-100';
      case 'alert': return darkMode ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-100';
      case 'friend': return darkMode ? 'bg-indigo-900/20 border-indigo-800/30' : 'bg-indigo-50 border-indigo-100';
      case 'like': return darkMode ? 'bg-pink-900/20 border-pink-800/30' : 'bg-pink-50 border-pink-100';
      case 'comment': return darkMode ? 'bg-teal-900/20 border-teal-800/30' : 'bg-teal-50 border-teal-100';
      case 'share': return darkMode ? 'bg-cyan-900/20 border-cyan-800/30' : 'bg-cyan-50 border-cyan-100';
      case 'market': return darkMode ? 'bg-amber-900/20 border-amber-800/30' : 'bg-amber-50 border-amber-100';
      case 'warning': return darkMode ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-yellow-50 border-yellow-100';
      case 'livestream': return darkMode ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-100';
      default: return darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100';
    }
  };

  const getNotifIconBg = (type: string) => {
    switch (type) {
      case 'match': return darkMode ? 'bg-blue-900/40' : 'bg-blue-100';
      case 'payment': return darkMode ? 'bg-green-900/40' : 'bg-green-100';
      case 'promotion': return darkMode ? 'bg-purple-900/40' : 'bg-purple-100';
      case 'message': return darkMode ? 'bg-orange-900/40' : 'bg-orange-100';
      case 'alert': return darkMode ? 'bg-red-900/40' : 'bg-red-100';
      case 'friend': return darkMode ? 'bg-indigo-900/40' : 'bg-indigo-100';
      case 'like': return darkMode ? 'bg-pink-900/40' : 'bg-pink-100';
      case 'comment': return darkMode ? 'bg-teal-900/40' : 'bg-teal-100';
      case 'share': return darkMode ? 'bg-cyan-900/40' : 'bg-cyan-100';
      case 'market': return darkMode ? 'bg-amber-900/40' : 'bg-amber-100';
      case 'warning': return darkMode ? 'bg-yellow-900/40' : 'bg-yellow-100';
      case 'livestream': return darkMode ? 'bg-red-900/40' : 'bg-red-100';
      default: return darkMode ? 'bg-gray-700' : 'bg-gray-100';
    }
  };

  const formatTime = (timeStr: string) => {
    return formatRelativeTimeAr(timeStr);
  };

  const handleNotifClick = async (notif: AppNotification) => {
    // Transfer-request notifications: do NOT navigate away — the user
    // needs to click Accept/Reject buttons on this page.
    if (isTransferRequest(notif)) {
      markNotificationRead(notif.id);
      return;
    }

    markNotificationRead(notif.id);

    // 1. If there's an explicit link, follow it
    if (notif.link) {
      navigate(notif.link);
      return;
    }

    // 2. If there's a postId, navigate to the post (not the user profile)
    if (notif.postId) {
      if (notif.type === 'match' || notif.type === 'promotion' || notif.type === 'market') {
        navigate(`/market/listing/${notif.postId}`);
        return;
      }
      navigate(`/post/${notif.postId}`);
      return;
    }

    // 3. Type-specific navigation (before userId check to avoid unwanted profile redirects)
    switch (notif.type) {
      case 'message':
        if (notif.userId && notif.userId !== currentUser?.id) {
          navigate('/messages');
        } else {
          navigate('/messages');
        }
        return;
      case 'friend':
        if (notif.userId && notif.userId !== currentUser?.id) {
          navigate(`/user/${notif.userId}`);
        } else {
          navigate('/friends?tab=requests');
        }
        return;
      case 'livestream':
        // 🔧 REDIRECT to Channels — standalone /live-stream is deprecated.
        if (notif.link && !notif.link.includes('/live-stream')) {
          navigate(notif.link);
        } else {
          navigate('/channels');
        }
        return;
      case 'like':
      case 'comment':
      case 'share':
        navigate('/');
        return;
      case 'match': navigate('/market'); return;
      case 'payment': navigate('/wallet'); return;
      case 'promotion': navigate('/promotions'); return;
      case 'market': navigate('/market'); return;
      case 'alert': navigate('/market-pulse'); return;
      case 'warning': return; // Stay on notifications page
      case 'system': return; // Stay on notifications page - don't redirect to profile
      default: return; // Stay on notifications page by default
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    toast.success(t('notifications.allMarkedRead'));
  };

  const handleMarkSingleRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    markNotificationRead(id);
    toast.success(t('notifications.markedRead', 'تم تعليم الإشعار كمقروء'));
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    // Short delay for visual feedback
    setTimeout(() => {
      deleteNotification(id);
      setDeletingId(null);
      toast.success(t('notifications.deleted', 'تم حذف الإشعار'));
    }, 200);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Use the context's refreshData which re-fetches notifications and
      // syncs readNotificationIds from the DB `read` column.
      await refreshData();
      toast.success(t('notifications.refreshed', 'تم تحديث الإشعارات'));
    } catch {
      toast.error(t('notifications.refreshFailed', 'فشل تحديث الإشعارات'));
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshData, t]);

  const handleToggleSound = () => {
    const newMuted = toggleNotificationSound();
    setSoundMuted(newMuted);
    toast.success(newMuted
      ? t('notifications.soundMuted', 'تم كتم صوت الإشعارات')
      : t('notifications.soundUnmuted', 'تم تشغيل صوت الإشعارات')
    );
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-[#f8f9fa]'}`} dir={dir}>
      {/* Header - Redesigned */}
      <div className={`sticky top-0 z-20 ${darkMode ? 'bg-gray-900/95' : 'bg-white/95'} backdrop-blur-md border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => safeBack()}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <ArrowLeft className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
            </button>
            <div className="flex items-center gap-2">
              <h1 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('notifications.title')}
              </h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-orange-500 text-white min-w-[22px] text-center">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Sound toggle */}
            <button
              onClick={handleToggleSound}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
              } ${soundMuted ? 'opacity-50' : ''}`}
              title={soundMuted ? t('notifications.soundUnmuted', 'تشغيل الصوت') : t('notifications.soundMuted', 'كتم الصوت')}
            >
              {soundMuted
                ? <VolumeX className={`w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                : <Volume2 className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
              }
            </button>
            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
              } ${isRefreshing ? 'opacity-50' : ''}`}
              title={t('notifications.refresh', 'تحديث')}
            >
              <RefreshCw className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'} ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {/* Mark all read */}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('notifications.markAllRead')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact Filter Tabs - scrollable, smaller on mobile */}
        <div className="flex gap-1 px-3 pb-2.5 overflow-x-auto hide-scrollbar">
          {filters.map(filter => {
            const count = filter.id === 'all'
              ? unreadCount
              : notifications.filter(n => n.type === filter.id && !readNotificationIds.has(n.id)).length;
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? darkMode
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-900/30'
                      : 'bg-orange-600 text-white shadow-md shadow-orange-200'
                    : darkMode
                      ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {filter.icon}
                <span>{filter.label}</span>
                {count > 0 && (
                  <span className={`px-1 py-0.5 rounded-full text-[9px] font-black leading-none ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : darkMode
                        ? 'bg-orange-900/30 text-orange-400'
                        : 'bg-orange-100 text-orange-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {isRefreshing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 40 }}
          exit={{ opacity: 0, height: 0 }}
          className={`flex items-center justify-center ${darkMode ? 'bg-gray-800' : 'bg-orange-50'}`}
        >
          <RefreshCw className={`w-4 h-4 animate-spin ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
          <span className={`ms-2 text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            {t('notifications.refreshing', 'جاري التحديث...')}
          </span>
        </motion.div>
      )}

      {/* Notifications List */}
      <div className="px-4 py-3">
        {/* Highlighted Alert Detail (from deep-link) */}
        {highlightedNewsId && (() => {
          const alertItem = adminAlerts.find(a => String(a.id) === String(highlightedNewsId));
          if (!alertItem) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-4 rounded-2xl border overflow-hidden ${
                darkMode ? 'bg-red-900/20 border-red-800/40' : 'bg-red-50 border-red-100'
              }`}
            >
              <div className={`px-4 py-3 flex items-center gap-2 ${darkMode ? 'bg-red-900/30' : 'bg-red-100'}`}>
                <AlertTriangle className={`w-4 h-4 ${darkMode ? 'text-red-400' : 'text-red-600'} animate-pulse`} />
                <span className={`text-xs font-black ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{t('notifications.urgentAlert')}</span>
                <button onClick={() => setHighlightedNewsId(null)} className={`ms-auto text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>✕</button>
              </div>
              <div className="p-4">
                <h3 className={`text-base font-black mb-2 ${darkMode ? 'text-red-300' : 'text-red-800'}`}>{alertItem.title}</h3>
                {alertItem.content && (
                  <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{alertItem.content}</p>
                )}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>[{alertItem.source}]</span>
                  {alertItem.createdAt && (
                    <span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      {new Date(alertItem.createdAt).toLocaleDateString('ar-EG')}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}

        {filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col items-center justify-center py-20 rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <Bell className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
            </div>
            <p className={`font-bold text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {activeFilter === 'all' ? t('notifications.noNotifications') : t('notifications.noNotificationsFilter', { filter: filters.find(f => f.id === activeFilter)?.label })}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              {t('notifications.newNotificationsWillAppear')}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            <div className="space-y-2">
              {groupedNotifications.map((grouped, idx) => {
                if (grouped.type === 'group') {
                  const isExpanded = expandedGroups.has(grouped.id);
                  const isRead = grouped.groupedNotifications!.every(n => readNotificationIds.has(n.id));
                  return (
                    <div key={grouped.id}>
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                        className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border transition-all text-right ${getNotifBg(grouped.notification.type, isRead)}`}
                      >
                        {/* Group icon with count badge */}
                        <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${getNotifIconBg(grouped.notification.type)}`}>
                          {getNotifIcon(grouped.notification.type)}
                          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-orange-500 text-white text-[9px] font-black flex items-center justify-center">
                            {grouped.groupCount}
                          </span>
                        </div>
                        {/* Group content */}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => toggleGroupExpand(grouped.id)}
                            className="w-full text-right"
                          >
                            <p className={`text-sm font-bold leading-relaxed ${
                              isRead
                                ? (darkMode ? 'text-gray-400' : 'text-gray-600')
                                : (darkMode ? 'text-gray-100' : 'text-gray-900')
                            }`}>
                              {grouped.groupLabel}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className={`w-3 h-3 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                              <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                                {formatTime(grouped.notification.time)}
                              </span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''} ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                            </div>
                          </button>
                        </div>
                        {/* Mark group as read */}
                        {!isRead && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              grouped.groupedNotifications!.forEach(n => markNotificationRead(n.id));
                              toast.success(t('notifications.markedRead', 'تم تعليم الإشعارات كمقروءة'));
                            }}
                            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                              darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                            }`}
                            title={t('notifications.markRead', 'تعليم كمقروء')}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </motion.div>
                      {/* Expanded group items */}
                      <AnimatePresence>
                        {isExpanded && grouped.groupedNotifications!.map(subNotif => {
                          const subRead = readNotificationIds.has(subNotif.id);
                          return (
                            <motion.div
                              key={subNotif.id}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="ms-6 mt-1"
                            >
                              <div
                                onClick={() => handleNotifClick(subNotif)}
                                className={`w-full flex items-start gap-2.5 p-3 rounded-xl border transition-all text-right cursor-pointer hover:scale-[1.005] active:scale-[0.995] ${getNotifBg(subNotif.type, subRead)}`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getNotifIconBg(subNotif.type)}`}>
                                  {getNotifIcon(subNotif.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-bold leading-relaxed ${
                                    subRead ? (darkMode ? 'text-gray-400' : 'text-gray-600') : (darkMode ? 'text-gray-100' : 'text-gray-900')
                                  }`}>
                                    {subNotif.message}
                                  </p>
                                  <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                                    {formatTime(subNotif.time)}
                                  </span>
                                </div>
                                {!subRead && <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 mt-2" />}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  );
                }

                // Single notification
                const notif = grouped.notification;
                const isRead = readNotificationIds.has(notif.id);
                const isDeleting = deletingId === notif.id;
                const isTransfer = isTransferRequest(notif);
                const transferId = isTransfer ? getTransferId(notif) : undefined;
                const transferState = transferId ? transferActionState[transferId] : undefined;
                const transferDone = transferState === 'done';
                return (
                  <motion.div
                    key={grouped.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: isDeleting ? 0 : 1, x: 0, scale: isDeleting ? 0.9 : 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.9 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    onClick={() => handleNotifClick(notif)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border transition-all text-right group cursor-pointer hover:scale-[1.005] active:scale-[0.99] ${getNotifBg(notif.type, isRead)} ${isDeleting ? 'pointer-events-none' : ''}`}
                  >
                    {/* Icon — for transfer requests we show a wallet/transfer icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isTransfer ? (darkMode ? 'bg-blue-900/40' : 'bg-blue-100') : getNotifIconBg(notif.type)}`}>
                      {isTransfer ? <Wallet className="w-4 h-4 text-blue-500" /> : getNotifIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-bold leading-relaxed ${
                          isRead
                            ? (darkMode ? 'text-gray-400' : 'text-gray-600')
                            : (darkMode ? 'text-gray-100' : 'text-gray-900')
                        }`}>
                          {notif.message}
                        </p>
                        {!isRead && (
                          <div className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0 mt-1.5 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Clock className={`w-3 h-3 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                        <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                          {formatTime(notif.time)}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                          notif.type === 'match' ? (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600') :
                          notif.type === 'payment' ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600') :
                          notif.type === 'promotion' ? (darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600') :
                          notif.type === 'message' ? (darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600') :
                          notif.type === 'alert' ? (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600') :
                          notif.type === 'friend' ? (darkMode ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-50 text-indigo-600') :
                          notif.type === 'like' ? (darkMode ? 'bg-pink-900/30 text-pink-400' : 'bg-pink-50 text-pink-600') :
                          notif.type === 'comment' ? (darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-600') :
                          (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500')
                        }`}>
                          {filters.find(f => f.id === notif.type)?.label || t('notifications.system')}
                        </span>
                        {/* Navigation hint (hide for transfer requests — they have inline actions) */}
                        {!isTransfer && (notif.postId || notif.userId || notif.link) && (
                          <span className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>
                            {dir === 'rtl' ? '←' : '→'} {t('notifications.clickToNavigate')}
                          </span>
                        )}
                      </div>

                      {/* ─── Transfer Accept/Reject buttons (inline) ─── */}
                      {isTransfer && transferId && !transferDone && (
                        <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAcceptTransfer(notif); }}
                            disabled={transferState === 'accepting' || transferState === 'rejecting'}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                          >
                            {transferState === 'accepting'
                              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> جارٍ القبول…</>
                              : <><CheckCircle2 className="w-3.5 h-3.5" /> قبول</>}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRejectTransfer(notif); }}
                            disabled={transferState === 'accepting' || transferState === 'rejecting'}
                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 ${
                              darkMode ? 'bg-gray-700 hover:bg-red-900/50 text-gray-200' : 'bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600'
                            }`}
                          >
                            {transferState === 'rejecting'
                              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> جارٍ الرفض…</>
                              : <><XIcon className="w-3.5 h-3.5" /> رفض</>}
                          </button>
                        </div>
                      )}
                      {isTransfer && transferDone && (
                        <div className={`mt-3 flex items-center gap-1.5 text-[11px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Check className="w-3.5 h-3.5" />
                          <span>تمت معالجة هذا التحويل</span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons - individual mark read & delete */}
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {!isRead && (
                        <button
                          onClick={(e) => handleMarkSingleRead(e, notif.id)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-60 group-hover:opacity-100 ${
                            darkMode ? 'bg-gray-700 hover:bg-gray-600 text-green-400' : 'bg-green-50 hover:bg-green-100 text-green-600'
                          }`}
                          title={t('notifications.markRead', 'تعليم كمقروء')}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(e, notif.id)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-40 group-hover:opacity-100 ${
                          darkMode ? 'bg-gray-700 hover:bg-red-900/40 text-gray-400 hover:text-red-400' : 'bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500'
                        }`}
                        title={t('notifications.deleteNotif', 'حذف الإشعار')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </AnimatePresence>
        )}

        {/* Bottom Stats */}
        {notifications.length > 0 && (
          <div className={`mt-6 p-3 rounded-xl text-center ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
            <p className={`text-xs font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('notifications.totalNotifications', { total: notifications.length, unread: unreadCount })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
