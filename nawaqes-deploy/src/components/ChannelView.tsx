// ─── Channel View (TikTok-style single channel page) ───────────────
// Header: cover photo + logo + name + description + subscriber count +
// Subscribe button.
// Tabs: Live / Videos / About
//   - Live: full-screen live stream panel + chat sidebar (ChannelLiveStream)
//   - Videos: grid of video thumbnails from posts with media_type=video
//   - About: channel info + stats + analytics + scheduled streams

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { motion, AnimatePresence } from 'motion/react';
import { ChannelLiveStream } from './ChannelLiveStream';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import {
  ArrowRight, Users, Megaphone, Crown, Check, Loader2, Plus, X,
  Image as ImageIcon, Send, Eye, MessageCircle, Pin, Trash2, MoreVertical,
  Lock, Heart, Radio, Video as VideoIcon, Info, BarChart3, Calendar,
  Clock, Sparkles, PlayCircle, Share2, Bell, Settings as SettingsIcon, Camera, RefreshCw,
} from 'lucide-react';

// Common reactions (Telegram-style) — pure emoji
const REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Haha' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '😡', label: 'Angry' },
];

type ChannelTab = 'live' | 'videos' | 'about' | 'posts';

const COVER_GRADIENTS = [
  'from-orange-500 via-amber-500 to-orange-600',
  'from-purple-500 via-pink-500 to-orange-400',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-rose-500 via-red-500 to-orange-500',
  'from-fuchsia-500 via-rose-500 to-amber-500',
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n || 0);
}

function formatDuration(d: string): string {
  try {
    const date = new Date(d);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} س`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} ي`;
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  } catch { return d; }
}

export const ChannelView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [channel, setChannel] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [activeTab, setActiveTab] = useState<ChannelTab>('live');
  const [analytics, setAnalytics] = useState<any>(null);
  const [scheduledStreams, setScheduledStreams] = useState<any[]>([]);
  // Channel settings modal (per-user preferences: notifications, mute, block, report)
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Post composer state
  const [composerText, setComposerText] = useState('');
  const [composerMedia, setComposerMedia] = useState<File | null>(null);
  const [composerMediaPreview, setComposerMediaPreview] = useState('');
  const [posting, setPosting] = useState(false);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showComments, setShowComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Avatar + cover direct upload (admin/owner only) ──────────────
  // Facebook-style: a small 📷 button on the avatar + cover that lets
  // the admin upload a new image directly from the channel header —
  // without having to open the Settings modal. The upload uses the same
  // PATCH /api/channels/:id endpoint as the Settings modal.
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input value so the same file can be re-selected later
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة كبير (الحد 5MB)');
      return;
    }
    setUploadingAvatar(true);
    try {
      // updateChannel sends multipart/form-data with avatar + cover fields.
      // We pass an empty object for data (no name/description changes) so
      // only the avatar field is uploaded.
      const updated = await api.updateChannel(channel.id, {}, file, undefined);
      setChannel(updated);
      toast.success('تم تحديث الصورة الشخصية');
    } catch (err: any) {
      toast.error(err?.message || 'فشل رفع الصورة');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة كبير (الحد 5MB)');
      return;
    }
    setUploadingCover(true);
    try {
      const updated = await api.updateChannel(channel.id, {}, undefined, file);
      setChannel(updated);
      toast.success('تم تحديث صورة الغلاف');
    } catch (err: any) {
      toast.error(err?.message || 'فشل رفع الصورة');
    } finally {
      setUploadingCover(false);
    }
  };

  const loadChannel = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getChannel(id);
      setChannel(data);
    } catch (err: any) {
      toast.error(err.message || t('channels.notFound'));
      navigate('/channels');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, t]);

  const loadPosts = useCallback(async () => {
    if (!id) return;
    setLoadingPosts(true);
    try {
      const data = await api.getChannelPosts(id, { limit: 30 });
      setPosts(data);
      // Pull videos out for the Videos tab
      setVideos(data.filter((p: any) => p.media_type === 'video' && p.media_url));
      // Record a view for each post (fire-and-forget)
      if (currentUser) {
        data.forEach((post: any) => {
          if (!post.has_viewed) {
            api.viewChannelPost(post.id).catch(() => {});
          }
        });
      }
    } catch (err: any) {
      toast.error(err.message || t('channels.loadPostsFailed'));
    } finally {
      setLoadingPosts(false);
    }
  }, [id, currentUser, t]);

  const loadAnalytics = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getChannelAnalytics(id);
      setAnalytics(data);
    } catch { /* ignore — non-admin */ }
  }, [id]);

  const loadScheduled = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getScheduledChannelStreams(id);
      setScheduledStreams(data);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { loadChannel(); }, [loadChannel]);
  useEffect(() => { if (channel) { loadPosts(); loadScheduled(); } }, [channel, loadPosts, loadScheduled]);

  // 🔄 Refresh handler — reloads everything (channel metadata + posts +
  // scheduled streams). Used by:
  //   1. The manual "🔄" refresh button in the channel header
  //   2. The pull-to-refresh gesture on the posts feed
  const handleRefresh = useCallback(async () => {
    await Promise.all([loadChannel(), loadPosts(), loadScheduled()]);
  }, [loadChannel, loadPosts, loadScheduled]);

  // 📱 Pull-to-refresh — only active on the posts tab (where it makes sense;
  // pulling on the Live tab would interfere with the live stream UI, and
  // pulling on About has nothing to refresh). The hook returns touch
  // handlers we spread on the scroll container + the pull distance for the
  // spinner indicator.
  const isPostsTab = activeTab === 'posts';
  const { pullDistance, isRefreshing, touchHandlers, setScrollRef } = usePullToRefresh({
    onRefresh: handleRefresh,
    // Only enable pull when on the posts tab — otherwise the touch handlers
    // would hijack scrolling on tabs that don't need refresh.
    ...(isPostsTab ? {} : { threshold: 9999 }),
  });
  useEffect(() => {
    // Load analytics only when About tab is opened (admin-only endpoint)
    if (activeTab === 'about' && channel?.is_admin && !analytics) {
      loadAnalytics();
    }
  }, [activeTab, channel, analytics, loadAnalytics]);

  // Refresh channel header periodically so LIVE badge + viewer count stay live.
  // 🔧 FIX: skip refresh while the user is on the Live tab — the
  // ChannelLiveStream component holds its own state (showLivePanel,
  // localStream, peer connections) and a parent re-render that flips
  // channel.is_live could still cause subtle issues. The Live tab gets
  // its own real-time updates via WebSocket, so polling is redundant there.
  useEffect(() => {
    if (!channel) return;
    const interval = setInterval(async () => {
      if (activeTab === 'live') return; // skip polling on live tab
      try {
        const data = await api.getChannel(id!);
        setChannel(data);
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [channel?.id, id, activeTab]);

  const handleSubscribeToggle = async () => {
    if (!channel) return;
    try {
      if (channel.is_subscribed) {
        await api.unsubscribeFromChannel(channel.id);
        toast.success(t('channels.unsubscribed'));
      } else {
        await api.subscribeToChannel(channel.id);
        toast.success(t('channels.subscribed'));
      }
      loadChannel();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerText.trim() && !composerMedia) return;
    setPosting(true);
    try {
      const newPost = await api.createChannelPost(channel.id, {
        content: composerText.trim(),
      }, composerMedia || undefined);
      setPosts(prev => [newPost, ...prev]);
      if (newPost.media_type === 'video') {
        setVideos(prev => [newPost, ...prev]);
      }
      setComposerText('');
      setComposerMedia(null);
      setComposerMediaPreview('');
      toast.success(t('channels.postPublished'));
    } catch (err: any) {
      toast.error(err.message || t('channels.postFailed'));
    } finally {
      setPosting(false);
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposerMedia(file);
    const reader = new FileReader();
    reader.onload = (ev) => setComposerMediaPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleReact = async (postId: string, emoji: string) => {
    try {
      await api.reactToChannelPost(postId, emoji);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        const wasReacted = p.my_reaction === emoji;
        const hadDiff = p.my_reaction && p.my_reaction !== emoji;
        let newReactionsCount = p.reactions_count;
        if (wasReacted) newReactionsCount = Math.max(newReactionsCount - 1, 0);
        else if (!hadDiff) newReactionsCount += 1;
        return {
          ...p,
          my_reaction: wasReacted ? null : emoji,
          reactions_count: newReactionsCount,
        };
      }));
      setShowReactions(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTogglePin = async (postId: string) => {
    try {
      const result = await api.pinChannelPost(postId);
      setPosts(prev => prev.map(p => ({ ...p, is_pinned: p.id === postId ? result.is_pinned : false })));
      toast.success(result.is_pinned ? t('channels.pinned') : t('channels.unpinned'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm(t('channels.confirmDelete'))) return;
    try {
      await api.deleteChannelPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
      setVideos(prev => prev.filter(v => v.id !== postId));
      toast.success(t('channels.postDeleted'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadComments = async (postId: string) => {
    try {
      const data = await api.getChannelPostComments(postId);
      setComments(prev => ({ ...prev, [postId]: data }));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!newComment.trim()) return;
    try {
      const c = await api.addChannelPostComment(postId, newComment.trim());
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), c] }));
      setNewComment('');
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleShare = () => {
    if (!channel) return;
    const url = `${window.location.origin}/channels/${channel.id}`;
    if (navigator.share) {
      navigator.share({ title: channel.name, text: channel.description || '', url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      toast.success('تم نسخ الرابط');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!channel) return null;

  const isAdmin = channel.is_admin;
  const isLive = !!channel.is_live;
  const BackIcon = ArrowRight;
  const coverGradient = pickGradient(channel.id || channel.handle || channel.name);

  const tabs: { id: ChannelTab; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    { id: 'live', label: 'مباشر', icon: <Radio className="w-4 h-4" />, badge: isLive },
    { id: 'videos', label: 'الفيديوهات', icon: <VideoIcon className="w-4 h-4" /> },
    { id: 'about', label: 'حول', icon: <Info className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4" dir={dir}>
      {/* Back button + refresh button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/channels')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <BackIcon className="w-4 h-4" />
          {t('channels.backToList')}
        </button>
        {/* 🔄 Manual refresh button — reloads channel metadata + posts +
            scheduled streams. Spinner animates while refreshing. */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="تحديث القناة"
          aria-label="تحديث القناة"
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'} disabled:opacity-50`}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Channel header (TikTok-style) */}
      <div className={`rounded-2xl overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        {/* Hidden file inputs for direct avatar + cover uploads (admin only) */}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarUpload}
        />
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCoverUpload}
        />

        {/* Cover photo */}
        <div className="relative h-32 sm:h-40 group">
          {channel.cover_photo ? (
            <img src={channel.cover_photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-l ${coverGradient}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Admin: cover upload button (camera icon, bottom-right of cover).
              Facebook-style — appears on hover or always on mobile. */}
          {isAdmin && (
            <button
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              title="تغيير صورة الغلاف"
              aria-label="تغيير صورة الغلاف"
              className="absolute bottom-2 left-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur text-white text-xs font-bold hover:bg-black/80 transition-colors disabled:opacity-50"
            >
              {uploadingCover ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              {uploadingCover ? 'جاري الرفع...' : 'تغيير الغلاف'}
            </button>
          )}

          {/* Share button */}
          <button
            onClick={handleShare}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="مشاركة"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {/* Settings button — opens the per-user Channel Settings modal
              (notification level, mute, block, report, unsubscribe) */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-3 right-14 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title="إعدادات القناة"
            aria-label="إعدادات القناة"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
          {/* LIVE pill over cover */}
          {isLive && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-black shadow-lg">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              مباشر الآن
              {channel.live_stream && (
                <span className="flex items-center gap-1 ms-1">
                  <Eye className="w-3 h-3" />
                  {formatCount(channel.live_stream.viewer_count)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 -mt-10">
          <div className="flex items-end gap-3">
            {/* Avatar — with admin upload overlay */}
            <div className="relative shrink-0">
              {channel.avatar ? (
                <img src={channel.avatar} alt={channel.name} className="w-20 h-20 rounded-2xl object-cover border-4 border-white dark:border-gray-800" />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-3xl font-black border-4 border-white dark:border-gray-800">
                  {channel.name.charAt(0)}
                </div>
              )}
              {channel.is_verified && (
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              {/* Admin: avatar upload overlay (camera button on bottom-left) */}
              {isAdmin && (
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  title="تغيير الصورة الشخصية"
                  aria-label="تغيير الصورة الشخصية"
                  className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center border-2 border-white dark:border-gray-800 shadow-md transition-colors disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{channel.name}</h1>
                {!channel.is_public && <Lock className="w-4 h-4 text-gray-400" />}
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>@{channel.handle}</p>
            </div>
          </div>

          {channel.description && (
            <p className={`text-sm mt-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {channel.description}
            </p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
            <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Users className="w-4 h-4" />
              <strong className={darkMode ? 'text-white' : 'text-gray-900'}>{formatCount(channel.subscriber_count)}</strong>
              {t('channels.subscribers')}
            </span>
            <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Megaphone className="w-4 h-4" />
              <strong className={darkMode ? 'text-white' : 'text-gray-900'}>{formatCount(channel.post_count)}</strong>
              {t('channels.posts')}
            </span>
            {videos.length > 0 && (
              <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <VideoIcon className="w-4 h-4" />
                <strong className={darkMode ? 'text-white' : 'text-gray-900'}>{formatCount(videos.length)}</strong>
                فيديو
              </span>
            )}
            {channel.is_owner && (
              <span className="flex items-center gap-1 text-orange-500 font-bold">
                <Crown className="w-4 h-4" />
                {channel.role === 'owner' ? t('channels.ownerRole') : t('channels.adminRole')}
              </span>
            )}
          </div>

          {/* Subscribe / Manage button */}
          {!channel.is_owner && (
            <button
              onClick={handleSubscribeToggle}
              className={`w-full mt-4 py-2.5 rounded-xl text-sm font-black transition-all active:scale-95 ${
                channel.is_subscribed
                  ? darkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-red-900/50 hover:text-red-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                  : 'bg-orange-600 text-white hover:bg-orange-700 shadow-md shadow-orange-200'
              }`}
            >
              {channel.is_subscribed ? t('channels.subscribed') : t('channels.subscribe')}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab.id
                ? darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900 shadow-sm'
                : darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'live' && (
            <LiveTab
              channel={channel}
              isAdmin={isAdmin}
              darkMode={darkMode}
              t={t}
              onStreamEnd={loadPosts}
            />
          )}

          {activeTab === 'videos' && (
            <VideosTab
              videos={videos}
              loading={loadingPosts}
              darkMode={darkMode}
              t={t}
            />
          )}

          {activeTab === 'about' && (
            <AboutTab
              channel={channel}
              analytics={analytics}
              scheduledStreams={scheduledStreams}
              isAdmin={isAdmin}
              darkMode={darkMode}
              t={t}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ─── Posts feed (always visible below tabs — TikTok-style feed) ─── */}
      {activeTab !== 'about' && (
        <div
          ref={setScrollRef}
          {...touchHandlers}
        >
          {/* 📱 Pull-to-refresh indicator — appears at the top of the feed
              when the user pulls down. Shows a spinner while refreshing. */}
          {(pullDistance > 0 || isRefreshing) && isPostsTab && (
            <div className="flex flex-col items-center justify-center py-2" style={{ opacity: Math.min(pullDistance / 70, 1) }}>
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-orange-500' : darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <span className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {isRefreshing ? 'جاري التحديث...' : 'اسحب للتحديث'}
              </span>
            </div>
          )}

          {/* Post composer (admin only) */}
          {isAdmin && (
            <form onSubmit={handleCreatePost} className={`rounded-2xl p-4 border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-start gap-3">
                <img
                  src={currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id}`}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
                <div className="flex-1">
                  <textarea
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={t('channels.postPlaceholder')}
                    rows={3}
                    className={`w-full px-3 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-orange-200 resize-none ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                  {composerMediaPreview && (
                    <div className="relative mt-2">
                      {composerMedia?.type.startsWith('video/') ? (
                        <video src={composerMediaPreview} className="max-h-48 rounded-xl" controls />
                      ) : (
                        <img src={composerMediaPreview} alt="" className="max-h-48 rounded-xl" />
                      )}
                      <button
                        type="button"
                        onClick={() => { setComposerMedia(null); setComposerMediaPreview(''); }}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                      <ImageIcon className="w-5 h-5" />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
                    <button
                      type="submit"
                      disabled={posting || (!composerText.trim() && !composerMedia)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                    >
                      {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t('channels.publish')}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Posts feed */}
          {loadingPosts ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : posts.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">{t('channels.noPosts')}</p>
              {isAdmin && <p className="text-xs mt-1">{t('channels.noPostsHint')}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  darkMode={darkMode}
                  t={t}
                  isAdmin={isAdmin}
                  showReactions={showReactions === post.id}
                  onToggleReactions={() => setShowReactions(prev => prev === post.id ? null : post.id)}
                  onReact={(emoji: string) => handleReact(post.id, emoji)}
                  onPin={() => handleTogglePin(post.id)}
                  onDelete={() => handleDeletePost(post.id)}
                  showComments={showComments === post.id}
                  onToggleComments={() => {
                    if (showComments !== post.id) {
                      setShowComments(post.id);
                      if (!comments[post.id]) loadComments(post.id);
                    } else {
                      setShowComments(null);
                    }
                  }}
                  comments={comments[post.id] || []}
                  newComment={showComments === post.id ? newComment : ''}
                  onNewCommentChange={setNewComment}
                  onAddComment={() => handleAddComment(post.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Channel Settings Modal (per-user) ─── */}
      {/* Opens from the gear button on the cover. Lets the subscriber
          configure notification level, mute duration, auto-load media,
          share, report, block, and unsubscribe. */}
      <ChannelSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        channel={channel}
        darkMode={darkMode}
        onSettingsChanged={loadChannel}
        onUnsubscribed={loadChannel}
        onBlocked={() => navigate('/channels')}
      />
    </div>
  );
};

// ─── Live Tab ──────────────────────────────────────────────────────
function LiveTab({ channel, isAdmin, darkMode, t, onStreamEnd }: {
  channel: any;
  isAdmin: boolean;
  darkMode: boolean;
  t: (key: string, opts?: any) => string;
  onStreamEnd: () => void;
}) {
  const { dir } = useLanguage();
  // 🔧 FIX: previously this component had an early `if (isLive) return <ChannelLiveStream/>`
  // branch SEPARATE from the non-live branch. When the host started a stream,
  // the parent's 10s polling would eventually flip `channel.is_live` from
  // false → true, causing React to unmount the "no-live" ChannelLiveStream
  // (which held the active broadcast state: showLivePanel, localStream,
  // peer connections) and mount a FRESH one in the "is-live" branch.
  // The fresh instance had showLivePanel=false → the host's full-screen
  // panel disappeared and was replaced by a "join stream" badge.
  //
  // Fix: always render <ChannelLiveStream/> in the SAME JSX position
  // regardless of isLive, so it never unmounts on the live-state flip.
  // ChannelLiveStream internally handles both states (no-stream CTA +
  // active-stream panel) so we don't need the branch here.
  return (
    <div className="space-y-3" dir={dir}>
      <ChannelLiveStream
        channelId={channel.id}
        isAdmin={isAdmin}
        darkMode={darkMode}
        t={t}
        onStreamEnd={onStreamEnd}
      />
      {!channel.is_live && !isAdmin && (
        <div className={`text-center py-8 rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <Radio className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>لا يوجد بث مباشر حاليًا</p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>عُد لاحقًا أو فعّل الإشعارات لتصلك البثوث القادمة</p>
        </div>
      )}
    </div>
  );
}

// ─── Videos Tab (grid of video thumbnails) ─────────────────────────
function VideosTab({ videos, loading, darkMode, t }: {
  videos: any[];
  loading: boolean;
  darkMode: boolean;
  t: (key: string, opts?: any) => string;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }
  if (videos.length === 0) {
    return (
      <div className={`text-center py-12 rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <VideoIcon className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
        <p className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>لا توجد فيديوهات بعد</p>
        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>ستظهر الفيديوهات المنشورة في القناة هنا</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {videos.map(v => (
        <div
          key={v.id}
          className={`relative aspect-[9/16] rounded-xl overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'} group cursor-pointer`}
        >
          <video
            src={v.media_url}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
          />
          {/* Play overlay */}
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <PlayCircle className="w-10 h-10 text-white drop-shadow-lg" />
          </div>
          {/* Duration / time-ago badge */}
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
              <Eye className="w-2.5 h-2.5" />
              {formatCount(v.views_count || 0)}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
              {formatDuration(v.created_at)}
            </span>
          </div>
          {/* Title (if any) */}
          {v.content && (
            <div className="absolute bottom-7 left-1.5 right-1.5">
              <p className="text-white text-xs font-bold line-clamp-2 drop-shadow">{v.content}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── About Tab ─────────────────────────────────────────────────────
function AboutTab({ channel, analytics, scheduledStreams, isAdmin, darkMode, t }: {
  channel: any;
  analytics: any;
  scheduledStreams: any[];
  isAdmin: boolean;
  darkMode: boolean;
  t: (key: string, opts?: any) => string;
}) {
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const labelClass = darkMode ? 'text-gray-400' : 'text-gray-500';
  const valueClass = darkMode ? 'text-white' : 'text-gray-900';
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-3">
      {/* Channel info */}
      <div className={`rounded-2xl p-4 border ${cardClass}`}>
        <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${valueClass}`}>
          <Info className="w-4 h-4 text-orange-500" />
          معلومات القناة
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className={labelClass}>@{channel.handle}</span>
            <span className={valueClass}>{channel.name}</span>
          </div>
          {channel.category && (
            <div className="flex items-center justify-between">
              <span className={labelClass}>التصنيف</span>
              <span className={valueClass}>{channel.category}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className={labelClass}>تاريخ الإنشاء</span>
            <span className={valueClass}>{new Date(channel.created_at).toLocaleDateString('ar-EG', { dateStyle: 'medium' })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={labelClass}>الخصوصية</span>
            <span className={valueClass}>{channel.is_public ? 'عامة' : 'خاصة'}</span>
          </div>
          {channel.owner_name && (
            <div className="flex items-center justify-between">
              <span className={labelClass}>المالك</span>
              <span className={valueClass}>{channel.owner_name}</span>
            </div>
          )}
        </div>
        {channel.description && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className={`text-xs font-bold mb-1 ${labelClass}`}>الوصف</p>
            <p className={`text-sm ${valueClass} leading-relaxed`}>{channel.description}</p>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className={`rounded-2xl p-4 border ${cardClass}`}>
        <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${valueClass}`}>
          <BarChart3 className="w-4 h-4 text-orange-500" />
          إحصائيات
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="مشترك" value={channel.subscriber_count || 0} color="text-emerald-500" darkMode={darkMode} />
          <StatBox label="منشور" value={channel.post_count || 0} color="text-orange-500" darkMode={darkMode} />
          <StatBox label="مشاهدة" value={analytics?.totals?.views || channel.view_count || 0} color="text-blue-500" darkMode={darkMode} />
        </div>
      </div>

      {/* Analytics (admin only) */}
      {isAdmin && analytics && (
        <div className={`rounded-2xl p-4 border ${cardClass}`}>
          <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${valueClass}`}>
            <Sparkles className="w-4 h-4 text-purple-500" />
            تحليلات متقدمة
          </h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <StatBox label="بث مباشر" value={analytics.totals?.streams || 0} color="text-red-500" darkMode={darkMode} />
            <StatBox label="هدايا (ج.م)" value={analytics.totals?.gifts_amount || 0} color="text-amber-500" darkMode={darkMode} />
            <StatBox label="استطلاع" value={analytics.totals?.polls || 0} color="text-purple-500" darkMode={darkMode} />
          </div>

          {/* Recent streams */}
          {analytics.recentStreams?.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-bold mb-2 ${labelClass}`}>آخر البثوث</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {analytics.recentStreams.map((s: any) => (
                  <div key={s.id} className={`p-2 rounded-lg text-xs flex items-center justify-between ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <span className={`font-bold truncate ${valueClass}`}>{s.title || 'بث'}</span>
                    <span className="flex items-center gap-2">
                      <span className={mutedClass}>👁 {s.viewer_peak || 0}</span>
                      <span className={mutedClass}>💬 {s.chat_count || 0}</span>
                      <span className={s.status === 'live' ? 'text-red-500 font-bold' : mutedClass}>
                        {s.status === 'live' ? 'مباشر' : 'انتهى'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top gifters */}
          {analytics.topGifters?.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-bold mb-2 ${labelClass}`}>أكثر المهديين</p>
              <div className="space-y-1.5">
                {analytics.topGifters.map((g: any, i: number) => (
                  <div key={g.sender_id} className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <span className="text-sm font-bold text-amber-500">#{i + 1}</span>
                    <img src={g.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${g.sender_id}`} alt="" className="w-6 h-6 rounded-full" />
                    <span className={`text-xs font-bold flex-1 truncate ${valueClass}`}>{g.name}</span>
                    <span className="text-xs font-bold text-emerald-500">{g.total_amount} ج.م</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduled streams */}
      {scheduledStreams.length > 0 && (
        <div className={`rounded-2xl p-4 border ${cardClass}`}>
          <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${valueClass}`}>
            <Calendar className="w-4 h-4 text-emerald-500" />
            بثوث مجدولة
          </h3>
          <div className="space-y-2">
            {scheduledStreams.map(ss => (
              <div key={ss.id} className={`p-3 rounded-xl border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${valueClass}`}>{ss.title}</p>
                    <p className={`text-xs ${mutedClass}`}>
                      {new Date(ss.scheduled_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  {!isAdmin && (
                    <button
                      onClick={() => api.setStreamReminder(ss.id).then(() => toast.success('تم تفعيل التذكير 🔔')).catch(() => {})}
                      className="text-xs px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1"
                    >
                      <Bell className="w-3 h-3" />
                      ذكّرني
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => api.cancelScheduledStream(ss.id).then(() => {
                        toast.success('تم الإلغاء');
                      }).catch(() => {})}
                      className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-bold"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color, darkMode }: { label: string; value: number; color: string; darkMode: boolean }) {
  return (
    <div className={`p-3 rounded-xl text-center ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
      <p className={`text-lg font-black ${color}`}>{formatCount(value)}</p>
      <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────
function PostCard({ post, darkMode, t, isAdmin, showReactions, onToggleReactions, onReact, onPin, onDelete, showComments, onToggleComments, comments, newComment, onNewCommentChange, onAddComment }: any) {
  const [showMenu, setShowMenu] = useState(false);
  const formatDate = (d: string) => formatDuration(d);

  return (
    <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      {post.is_pinned && (
        <div className="bg-orange-500/10 px-4 py-1.5 flex items-center gap-1 text-xs font-bold text-orange-600">
          <Pin className="w-3 h-3" />
          {t('channels.pinnedPost')}
        </div>
      )}

      <div className="p-4">
        {/* Author */}
        <div className="flex items-center gap-2 mb-3">
          <img src={post.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`} alt="" className="w-9 h-9 rounded-full" />
          <div className="flex-1">
            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{post.author_name}</p>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{formatDate(post.created_at)}</p>
          </div>
          {isAdmin && (
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <MoreVertical className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
              {showMenu && (
                <div className={`absolute top-8 left-0 z-10 rounded-xl border shadow-lg py-1 min-w-[140px] ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}>
                  <button onClick={() => { onPin(); setShowMenu(false); }} className={`w-full text-start px-3 py-2 text-xs flex items-center gap-2 ${darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'}`}>
                    <Pin className="w-3 h-3" />
                    {post.is_pinned ? t('channels.unpin') : t('channels.pin')}
                  </button>
                  <button onClick={() => { onDelete(); setShowMenu(false); }} className="w-full text-start px-3 py-2 text-xs flex items-center gap-2 text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3 h-3" />
                    {t('channels.delete')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {post.content && (
          <p className={`text-sm whitespace-pre-wrap ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            {post.content}
          </p>
        )}

        {/* Media */}
        {post.media_url && (
          <div className="mt-3 rounded-xl overflow-hidden">
            {post.media_type === 'video' ? (
              <video src={post.media_url} controls className="w-full max-h-96 object-contain bg-black" />
            ) : (
              <img src={post.media_url} alt="" className="w-full max-h-96 object-contain" />
            )}
            {post.media_caption && (
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{post.media_caption}</p>
            )}
          </div>
        )}

        {/* Link preview */}
        {post.link_url && (
          <a href={post.link_url} target="_blank" rel="noopener noreferrer" className={`block mt-3 p-3 rounded-xl border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
            {post.link_image && <img src={post.link_image} alt="" className="w-full h-32 object-cover rounded-lg mb-2" />}
            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{post.link_title || post.link_url}</p>
            {post.link_description && <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{post.link_description}</p>}
          </a>
        )}

        {/* Stats + actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4 text-xs">
            <button onClick={onToggleReactions} className={`flex items-center gap-1 ${post.my_reaction ? 'text-orange-500' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Heart className={`w-4 h-4 ${post.my_reaction ? 'fill-current' : ''}`} />
              <strong>{post.reactions_count}</strong>
            </button>
            <button onClick={onToggleComments} className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <MessageCircle className="w-4 h-4" />
              <strong>{post.comments_count}</strong>
            </button>
            <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Eye className="w-4 h-4" />
              <strong>{post.views_count}</strong>
            </span>
          </div>
        </div>

        {/* Reactions picker */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className={`flex items-center gap-1 mt-2 p-2 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                {REACTIONS.map(r => (
                  <button
                    key={r.emoji}
                    onClick={() => onReact(r.emoji)}
                    className={`text-2xl p-1.5 rounded-lg transition-all active:scale-125 hover:bg-white dark:hover:bg-gray-600 ${post.my_reaction === r.emoji ? 'bg-orange-500/20' : ''}`}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active reactions breakdown */}
        {post.reactions && post.reactions.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {post.reactions.map((r: any) => (
              <span key={r.emoji} className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                {r.emoji} {r.count}
              </span>
            ))}
          </div>
        )}

        {/* Comments section */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
            >
              <div className="space-y-2 mb-3">
                {comments.length === 0 ? (
                  <p className={`text-xs text-center py-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t('channels.noComments')}
                  </p>
                ) : comments.map((c: any) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <img src={c.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`} alt="" className="w-7 h-7 rounded-full mt-0.5" />
                    <div className={`flex-1 p-2 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <p className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.author_name}</p>
                      <p className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => onNewCommentChange(e.target.value)}
                  placeholder={t('channels.commentPlaceholder')}
                  className={`flex-1 px-3 py-2 rounded-xl border outline-none text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  onKeyDown={(e) => { if (e.key === 'Enter') onAddComment(); }}
                />
                <button onClick={onAddComment} className="p-2 rounded-xl bg-orange-600 text-white">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
