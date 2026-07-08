// ─── سوق لايف - Market Live (TikTok-style) ───────────────────────────
// Vertical full-screen video feed for market listings.
//
// 🔧 Video playback fixes:
//   • autoPlay + muted + loop + playsInline + webkit-playsinline + preload="auto"
//   • poster={thumbnailUrl} so the first frame shows instantly before the
//     video metadata even loads (fixes "black screen" on mobile/APK).
//   • Loading spinner overlay while readyState < 4 (HAVE_ENOUGH_DATA).
//   • onError → hide <video>, show thumbnail image + tap-to-retry button.
//   • Active video calls .play(); inactive videos call .pause().
//   • Click-to-play fallback if browser blocks autoplay.
//
// 🔧 Display redesign (TikTok-style):
//   • Card: h-[calc(100vh-8px)] max-w-[450px] mx-auto, object-cover, no
//     rounded corners, no gaps.
//   • Top overlay: back button (right in RTL) + 3-dot menu (left in RTL),
//     both circular bg-black/40.
//   • Bottom-left info: @author, description (line-clamp-2), location +
//     time, buy button (green) when price > 0.
//   • Bottom-right action bar: avatar+follow, name, price, like, comment,
//     save, share, gift (purple), chat (green).
//   • Progress bar at very bottom (h-0.5).
//   • Badges top-left: HD (cyan), رائج (rose, pulsing), مروّج (amber).
//
// 🔧 Menu popup:
//   • Opens from LEFT side in RTL (left-3), positioned top-14 below the
//     3-dot button. Touch-friendly with onTouchStart stopPropagation.
//   • Contains stats, feed/myvideos tabs, add-video, refresh.
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight,
  Heart,
  Bookmark,
  Share2,
  MessageCircle,
  Eye,
  RefreshCw,
  Zap,
  Play,
  Video,
  BadgeCheck,
  ShieldCheck,
  TrendingUp,
  X,
  BarChart3,
  Volume2,
  VolumeX,
  Send,
  ChevronUp,
  Phone,
  MapPin,
  Clock,
  Film,
  ShoppingBag,
  ExternalLink,
  Copy,
  Check,
  MoreVertical,
  Layers,
  Sparkles,
  Plus,
  ShoppingCart,
  Gift,
  Trash2,
  CornerDownLeft,
  Wallet,
  Truck,
  Store,
  CheckCircle2,
  Loader2,
  Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast as sonnerToast } from 'sonner';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { VideoRecorder } from './VideoRecorder';
import { MarketLiveStream } from './MarketLiveStream';
import { useSafeBack } from '../hooks/useSafeBack';

// Critical error toast — bypasses silentToast's silent-success wrapper
// so genuinely important errors (money failures, network errors) still
// surface to the user.
function criticalError(msg: string) {
  (toast as unknown as { error: (m: string, opts?: Record<string, unknown>) => void }).error(msg, { critical: true });
}

// ─── Category icons map ───────────────────────────────────────────
const categoryIcons: Record<string, string> = {
  phones: '📱', cars: '🚗', electronics: '💻', realEstate: '🏠',
  games: '🎮', fashion: '👗', services: '🛠️', books: '📚',
  sports: '⚽', animals: '🐾', jobs: '💼', other: '📦',
};

// ─── Format number compact ────────────────────────────────────────
const formatCompact = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('ar-EG');
};

// ─── Format time ago ──────────────────────────────────────────────
const timeAgo = (dateStr: string): string => {
  if (!dateStr) return '';
  const now = new Date();
  const date = parseDBTimestamp(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return date.toLocaleDateString('ar-EG');
};

// ─── Comment Interface ────────────────────────────────────────────
interface VideoComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: string;
  replyToId?: string | null;
  replyToName?: string;
  likes?: number;
  isLiked?: boolean;
}

// ─── Gift type ────────────────────────────────────────────────────
interface GiftItem {
  type: string;
  name: string;
  icon: string;
  price: number;
}

// ─── Built-in gift catalog (used as fallback when API fails) ───────
const FALLBACK_GIFTS: GiftItem[] = [
  { type: 'rose',    name: 'وردة',         icon: '🌹', price: 5 },
  { type: 'heart',   name: 'قلب',          icon: '💝', price: 10 },
  { type: 'star',    name: 'نجمة',         icon: '⭐', price: 25 },
  { type: 'fire',    name: 'نار',          icon: '🔥', price: 30 },
  { type: 'bolt',    name: 'صاعقة',        icon: '⚡️', price: 40 },
  { type: 'crown',   name: 'تاج',          icon: '👑', price: 50 },
  { type: 'diamond', name: 'ماس',          icon: '💎', price: 100 },
  { type: 'trophy',  name: 'كأس البطولة', icon: '🏆', price: 200 },
];

// ─── Floating heart particle (for double-tap) ─────────────────────
interface HeartParticle { id: number; x: number; delay: number; size: number; rotate: number; }

// ─── Video Card Component ─────────────────────────────────────────
interface VideoCardProps {
  video: any;
  isActive: boolean;
  darkMode: boolean;
  dir: string;
  isMuted: boolean;
  onLike: (videoId: string) => void;
  onSave: (videoId: string) => void;
  onShare: (videoId: string) => void;
  onContact: (video: any) => void;
  onDoubleTap: (videoId: string) => void;
  onViewDetail: (video: any) => void;
  onComment: (video: any) => void;
  onOpenGifts: (video: any) => void;
  onBuy: (video: any) => void;
  liked: boolean;
  saved: boolean;
  showHeart: boolean;
  onToggleMute: () => void;
  giftCount: number;
  isSold?: boolean;
}

const VideoCard: React.FC<VideoCardProps> = ({
  video, isActive, darkMode, dir, isMuted,
  onLike, onSave, onShare, onContact, onDoubleTap, onViewDetail, onComment, onOpenGifts, onBuy,
  liked, saved, showHeart, onToggleMute, giftCount, isSold,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTrackedRef = useRef(false);
  // Retry counter so we don't infinite-loop on persistent errors.
  const retryCountRef = useRef(0);

  // 🔧 Loading state — true until onLoadedData fires (readyState >= 4).
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  // 🔧 Progress bar — playback position 0..1
  const [progress, setProgress] = useState(0);

  // 🔧 Floating heart particles for double-tap
  const [heartParticles, setHeartParticles] = useState<HeartParticle[]>([]);

  // 🔧 Follow state — optimistic update before API call.
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Check follow status on mount / when authorId changes
  useEffect(() => {
    if (!currentUser || !video.authorId || currentUser.id === video.authorId) {
      setIsFollowing(false);
      return;
    }
    api.getFollowStatus(video.authorId)
      .then((data: any) => setIsFollowing(!!data.following))
      .catch(() => setIsFollowing(false));
  }, [video.authorId, currentUser]);

  // ─── 🔧 FIX: Autoplay when active, pause otherwise ─────────────────
  // Force muted=true before play() so the browser's autoplay policy allows
  // the video to start. Then unmute after a short delay (the user has
  // already interacted with the app by navigating to market-live, so
  // unmute should work). If unmute fails, keep muted until the user
  // taps the mute button.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isActive && video.videoUrl) {
      // Reset state when this video becomes active
      setProgress(0);
      setVideoLoaded(false);
      setVideoError(false);
      retryCountRef.current = 0;
      // Force muted to bypass autoplay restrictions
      videoEl.muted = true;
      videoEl.currentTime = 0;
      const p = videoEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Autoplay was blocked — retry with muted=true (force)
          videoEl.muted = true;
          videoEl.play().catch(() => {
            // Still blocked — mark as needing a manual tap
            setVideoLoaded(true);
          });
        });
      }
      // 🔧 FIX: Try to unmute after 300ms. If the user has interacted
      // with the page (which they did by navigating here), the browser
      // should allow unmute. If not, the video stays muted until the
      // user taps the mute button.
      const restoreTimer = setTimeout(() => {
        if (videoEl) {
          try {
            videoEl.muted = isMuted;
            // If isMuted is false, try to unmute
            if (!isMuted) {
              videoEl.play().catch(() => {
                // Unmute failed — keep muted
                videoEl.muted = true;
              });
            }
          } catch {
            videoEl.muted = true;
          }
        }
      }, 300);
      return () => clearTimeout(restoreTimer);
    } else {
      // Non-active video — pause and reset to start
      videoEl.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, video.videoUrl]);

  // 🔧 FIX: Sync the muted attribute whenever the user toggles mute
  // (parent owns isMuted, every VideoCard listens to it).
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) videoEl.muted = isMuted;
  }, [isMuted]);

  // Track view when video becomes active
  useEffect(() => {
    if (isActive && !viewTrackedRef.current) {
      viewTrackedRef.current = true;
      api.marketLiveInteract(video.id, 'view').catch(() => {});
    }
    if (!isActive) {
      viewTrackedRef.current = false;
    }
  }, [isActive, video.id]);

  // 🔧 Progress bar — update on timeupdate.
  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    setProgress(Math.min(1, el.currentTime / el.duration));
  }, []);

  // 🔧 IntersectionObserver backup — fires when scroll-snap settles.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !video.videoUrl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && isActive) {
            videoEl.play().catch(() => {});
          } else if (!entry.isIntersecting) {
            videoEl.pause();
          }
        });
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(videoEl);
    return () => observer.disconnect();
  }, [video.videoUrl, isActive]);

  // 🔧 Reset loading/error/progress when video URL changes
  useEffect(() => {
    setVideoError(false);
    setVideoLoaded(false);
    setProgress(0);
    retryCountRef.current = 0;
  }, [video.videoUrl]);

  // 🔧 Double-tap → spawn multiple floating heart particles.
  const spawnHeartParticles = useCallback(() => {
    const newParticles: HeartParticle[] = Array.from({ length: 7 }).map((_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 140,
      delay: i * 60,
      size: 28 + Math.random() * 22,
      rotate: (Math.random() - 0.5) * 60,
    }));
    setHeartParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => {
      setHeartParticles(prev => prev.filter(p => !newParticles.includes(p)));
    }, 1800);
  }, []);

  // 🔧 FIX: Click-to-play. Single tap toggles play/pause; double tap
  // likes + spawns heart particles. If the video is paused due to
  // autoplay policy, the single tap manually calls play().
  const handleTap = () => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timeDiff < 300 && timeDiff > 0) {
      // Double tap - like + particle effect
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      onDoubleTap(video.id);
      spawnHeartParticles();
    } else {
      // Single tap - toggle play/pause (manual play if autoplay failed)
      tapTimeoutRef.current = setTimeout(() => {
        const videoEl = videoRef.current;
        if (videoEl && video.videoUrl) {
          if (videoEl.paused) {
            videoEl.muted = isMuted;
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        }
      }, 280);
    }
  };

  // 🔧 FIX: Follow button — optimistic update before API call.
  const handleToggleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !video.authorId || followLoading) return;
    if (currentUser.id === video.authorId) return;
    setFollowLoading(true);
    const newFollowing = !isFollowing;
    setIsFollowing(newFollowing); // optimistic
    try {
      if (isFollowing) {
        await api.unfollowUser(video.authorId);
        toast.success('تم إلغاء المتابعة');
      } else {
        await api.followUser(video.authorId);
        toast.success('تمت المتابعة');
      }
    } catch (err: any) {
      setIsFollowing(!newFollowing); // revert
      toast.error(err.message || 'فشل تحديث المتابعة');
    } finally {
      setFollowLoading(false);
    }
  }, [currentUser, video.authorId, isFollowing, followLoading]);

  // 🔧 Retry loading the video after an error.
  const handleRetryVideo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (retryCountRef.current >= 3) return;
    retryCountRef.current += 1;
    setVideoError(false);
    setVideoLoaded(false);
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.load(); // re-fetch from src
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    }
  }, []);

  const hasVideo = !!(video.videoUrl && video.videoUrl.length > 5);
  // 🔧 FIX: poster = thumbnailUrl || imageUrl (shows first frame
  // immediately, before the video even starts loading — fixes black
  // screen on mobile/APK).
  const posterUrl = video.thumbnailUrl || video.imageUrl || video.image || '';
  // 🔧 FIX: price null check — use Number.isNaN guard, not falsy check.
  const hasPrice = video.price != null && !Number.isNaN(Number(video.price));
  const priceNum = hasPrice ? Number(video.price) : 0;

  return (
    <div
      className="relative w-full h-[100vh] overflow-hidden snap-start flex-shrink-0 bg-black"
      onClick={handleTap}
    >
      {/* ─── Video element ───────────────────────────────────────────
          🔧 FIX: all the attributes required for reliable autoplay on
          web + mobile + APK:
            • autoPlay, muted, loop, playsInline (standard)
            • webkit-playsinline="true" (iOS Safari / WKWebView)
            • preload="auto" (start loading immediately)
            • poster={thumbnailUrl} (show first frame instantly)
            • onLoadedData (readyState >= 4 → hide spinner)
            • onError (show thumbnail fallback + retry button)
          The video fills the card with object-cover so all videos are
          the same size regardless of source aspect ratio. */}
      {hasVideo && (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={posterUrl || undefined}
          className="absolute inset-0 w-full h-full object-cover z-0"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          {...{ 'webkit-playsinline': 'true' } as any}
          // 🔧 FIX: Multiple handlers to ensure videoLoaded is set to true
          // on ALL devices. onLoadedData alone may not fire on some
          // mobile WebViews. Adding onCanPlay + onPlaying as fallbacks.
          onLoadedData={() => setVideoLoaded(true)}
          onCanPlay={() => setVideoLoaded(true)}
          onPlaying={() => setVideoLoaded(true)}
          onTimeUpdate={handleTimeUpdate}
          onError={() => { if (retryCountRef.current >= 2) setVideoError(true); }}
          onClick={handleTap}
        />
      )}

      {/* ─── Fallback image (shown when there's no video, the video
          errored, or while the poster hasn't loaded yet) ─── */}
      {(!hasVideo || videoError) && posterUrl && (
        <img
          src={posterUrl}
          alt={video.description || video.content || ''}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* ─── Loading spinner overlay (readyState < 4) ───────────────
          Shows a spinner on top of the poster while the video buffers.
          Disappears when onLoadedData fires. */}
      {hasVideo && !videoLoaded && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-black/40 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            <span className="text-white/70 text-[10px] font-bold">جارٍ التحميل…</span>
          </div>
        </div>
      )}

      {/* ─── Error fallback: tap to retry ─────────────────────────── */}
      {hasVideo && videoError && (
        <button
          onClick={handleRetryVideo}
          className="absolute inset-0 flex items-center justify-center z-10"
        >
          <div className="flex flex-col items-center gap-2 px-5 py-4 rounded-2xl bg-black/55 backdrop-blur-sm">
            <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
            <span className="text-white text-xs font-bold">اضغط لإعادة التشغيل</span>
          </div>
        </button>
      )}

      {/* ─── Gradients (top + bottom for text readability) ─── */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none z-10" />

      {/* ─── Progress bar at the very bottom ─── */}
      {hasVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30 z-20 pointer-events-none">
          <div
            className="h-full bg-white transition-all duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* ─── Badges top-left (HD, رائج, مروّج) ─────────────────────── */}
      <div className="absolute top-14 left-3 z-20 flex flex-col gap-1.5 items-start">
        {/* HD badge (cyan) */}
        {hasVideo && video.isHD && (
          <span className="px-2 py-0.5 rounded-md bg-black/55 backdrop-blur-sm text-cyan-400 text-[9px] font-black flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            HD
          </span>
        )}
        {/* Trending badge (rose, pulsing) */}
        {video.isTrending && (
          <span className="px-2 py-0.5 rounded-full bg-rose-500/90 backdrop-blur-sm text-white text-[9px] font-black flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            <TrendingUp className="w-2.5 h-2.5" />
            رائج
          </span>
        )}
        {/* Promoted badge (amber) */}
        {video.isPromoted && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black flex items-center gap-1">
            <Zap className="w-2.5 h-2.5" />
            مروّج
          </span>
        )}
      </div>

      {/* ─── SOLD overlay ─── */}
      {isSold && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative px-6 py-3 rounded-2xl bg-red-600/95 text-white text-2xl font-black rotate-[-8deg] shadow-2xl border-2 border-white/30">
            تم البيع
          </div>
        </div>
      )}

      {/* ─── Double-tap big heart ─── */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ scale: 0, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.45, type: 'spring' }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <Heart className="w-28 h-28 text-red-500 fill-red-500 drop-shadow-2xl" />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Floating particle hearts */}
      <AnimatePresence>
        {heartParticles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 0, x: p.x, scale: 0.4, rotate: p.rotate }}
            animate={{ opacity: [0, 1, 1, 0], y: -280, scale: [0.4, 1, 0.9, 0.6] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.6, delay: p.delay / 1000, ease: 'easeOut' }}
            className="absolute left-1/2 top-1/2 pointer-events-none z-30"
            style={{ marginLeft: p.x }}
          >
            <Heart
              className="text-red-500 fill-red-500 drop-shadow-lg"
              style={{ width: p.size, height: p.size }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ─── BOTTOM-LEFT: Author info + description + buy ─────────── */}
      <div className="absolute bottom-12 left-3 max-w-[60%] z-20" dir={dir}>
        {/* Author name (bold, drop-shadow) */}
        <button
          onClick={(e) => { e.stopPropagation(); if (video.authorId) navigate(`/user/${video.authorId}`); }}
          className="text-white font-black text-sm drop-shadow-lg flex items-center gap-1 truncate max-w-full"
          title={video.authorName || 'بائع نواقص'}
        >
          <span className="truncate">@{video.authorName || 'بائع نواقص'}</span>
          {video.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 fill-blue-500 shrink-0" />}
        </button>

        {/* Product description (line-clamp-2) */}
        {video.description && (
          <p className="text-white text-sm leading-snug line-clamp-2 mt-1 drop-shadow-lg">
            {video.description}
          </p>
        )}

        {/* Location + time ago */}
        <div className="flex items-center gap-2 mt-1.5 text-white/60 text-[10px] font-bold flex-wrap">
          {video.location && (
            <span className="flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />
              {video.location}
            </span>
          )}
          {video.createdAt && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(video.createdAt)}
            </span>
          )}
        </div>

        {/* 🔧 Buy button (green) — only when price > 0 and not sold */}
        {hasPrice && priceNum > 0 && !isSold && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onBuy(video); }}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs font-black shadow-lg"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            شراء الآن
            <span className="text-[10px] opacity-90">{priceNum.toLocaleString('ar-EG')}</span>
          </motion.button>
        )}
      </div>

      {/* ─── BOTTOM-RIGHT: Action bar ─────────────────────────────── */}
      <div className="absolute bottom-12 right-3 z-20 flex flex-col items-center gap-1.5" dir={dir}>

        {/* Author Avatar with follow + button */}
        <div
          className="relative cursor-pointer mb-1"
          onClick={(e) => {
            e.stopPropagation();
            if (video.authorId) navigate(`/user/${video.authorId}`);
          }}
        >
          <img
            src={video.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${video.authorId || 'default'}`}
            alt={video.authorName || 'بائع'}
            className="w-10 h-10 rounded-full border-2 border-white/40 object-cover"
          />
          {video.isVerified && (
            <BadgeCheck className="absolute -bottom-0.5 -right-0.5 w-4 h-4 text-blue-400 fill-blue-500" />
          )}
          {currentUser && video.authorId && currentUser.id !== video.authorId && !isFollowing && (
            <button
              onClick={handleToggleFollow}
              disabled={followLoading}
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-black shadow-lg hover:bg-red-600 active:scale-90 transition-all disabled:opacity-50"
              title="متابعة"
            >+</button>
          )}
          {isFollowing && (
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg">
              <Check className="w-3 h-3" />
            </div>
          )}
        </div>

        {/* 🔧 FIX: Author Name with truncate + title attr */}
        <button
          onClick={(e) => { e.stopPropagation(); if (video.authorId) navigate(`/user/${video.authorId}`); }}
          className="text-white font-black text-[11px] text-center max-w-[80px] truncate drop-shadow-lg"
          title={video.authorName || 'بائع نواقص'}
        >
          {video.authorName || 'بائع'}
        </button>

        {/* 🔧 Price badge (if price > 0) */}
        {hasPrice && priceNum > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/90 backdrop-blur-sm mb-1">
            <span className="text-white font-black text-xs">{priceNum.toLocaleString('ar-EG')}</span>
            <span className="text-white/80 text-[8px] font-bold">{video.currency || t('common.egp')}</span>
          </div>
        )}

        {/* Like */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onLike(video.id); }}
          className="flex flex-col items-center gap-1"
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
            liked ? 'bg-red-500/30 scale-110' : 'bg-white/10'
          }`}>
            <Heart className={`w-6 h-6 transition-all ${liked ? 'text-red-500 fill-red-500 scale-110' : 'text-white'}`} />
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-lg">{formatCompact(video.likes || 0)}</span>
        </motion.button>

        {/* Comment */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onComment(video); }}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-md">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-lg">{formatCompact(video.commentsCount || 0)}</span>
        </motion.button>

        {/* Save */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onSave(video.id); }}
          className="flex flex-col items-center gap-1"
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${
            saved ? 'bg-amber-500/30 scale-110' : 'bg-white/10'
          }`}>
            <Bookmark className={`w-6 h-6 transition-all ${saved ? 'text-amber-400 fill-amber-400' : 'text-white'}`} />
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-lg">حفظ</span>
        </motion.button>

        {/* Share */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onShare(video.id); }}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-md">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-lg">مشاركة</span>
        </motion.button>

        {/* Gift button (purple) + count */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={(e) => { e.stopPropagation(); onOpenGifts(video); }}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-fuchsia-600/40 backdrop-blur-md border border-purple-400/40">
            <Gift className="w-6 h-6 text-purple-200" />
          </div>
          <span className="text-white text-[10px] font-bold drop-shadow-lg">{formatCompact(giftCount || 0)}</span>
        </motion.button>

        {/* 🔧 FIX: Chat button (green) — always uses video.authorId */}
        {video.authorId && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={(e) => { e.stopPropagation(); onContact(video); }}
            className="flex flex-col items-center gap-0.5"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600 backdrop-blur-sm shadow-lg">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-white/80 text-[9px] font-bold">دردشة</span>
          </motion.button>
        )}
      </div>
    </div>
  );
};

// ─── Product Detail Bottom Sheet ──────────────────────────────────
interface ProductDetailSheetProps {
  video: any;
  darkMode: boolean;
  dir: string;
  onClose: () => void;
  onContact: (video: any) => void;
  onSave: (videoId: string) => void;
  saved: boolean;
}

const ProductDetailSheet: React.FC<ProductDetailSheetProps> = ({
  video, darkMode, dir, onClose, onContact, onSave, saved,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const catIcon = video.category ? categoryIcons[video.category] || '📦' : '📦';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className={`w-10 h-1 rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        <div className="overflow-y-auto max-h-[80vh] p-4 space-y-4">
          {(video.imageUrl || video.image || video.thumbnailUrl) && (
            <div className="relative rounded-2xl overflow-hidden">
              <img
                src={video.imageUrl || video.image || video.thumbnailUrl}
                alt={video.description || video.content}
                className="w-full h-56 object-cover"
              />
              {video.isPromoted && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-black backdrop-blur-sm">
                  <Zap className="w-3 h-3" />
                  {t('marketLive.promoted')}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <img
              src={video.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${video.authorId}`}
              alt={video.authorName}
              className="w-12 h-12 rounded-full border-2 border-orange-200 object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`font-black text-sm truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{video.authorName}</span>
                {video.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-500" />}
                {video.isTrusted && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
              </div>
              {video.location && (
                <div className="flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-orange-500" />
                  <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{video.location}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate(`/user/${video.authorId}`)}
              className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-500 text-xs font-bold hover:bg-orange-500/20 transition-colors"
            >
              {t('marketLive.viewProfile')}
            </button>
          </div>

          <div>
            <h3 className={`font-black text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('marketLive.description')}
            </h3>
            <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {video.description || video.content}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {video.price != null && !Number.isNaN(Number(video.price)) && (
              <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-orange-50'}`}>
                <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('marketLive.price')}</span>
                <p className={`font-black text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {Number(video.price).toLocaleString('ar-EG')} {video.currency || t('common.egp')}
                </p>
              </div>
            )}
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('marketLive.category')}</span>
              <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {catIcon} {t(`interests.${video.category}`, { defaultValue: video.category || '' })}
              </p>
            </div>
            {video.condition && (
              <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('market.condition')}</span>
                <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {t(`market.${video.condition}`, { defaultValue: video.condition })}
                </p>
              </div>
            )}
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('marketLive.views')}</span>
              <p className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                <Eye className="w-3.5 h-3.5 inline ml-1" />
                {formatCompact(video.views || 0)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Heart className="w-3.5 h-3.5 inline ml-1 text-red-500" />
                {formatCompact(video.likes || 0)}
              </span>
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Share2 className="w-3.5 h-3.5 inline ml-1 text-blue-500" />
                {formatCompact(video.shares || 0)}
              </span>
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Bookmark className="w-3.5 h-3.5 inline ml-1 text-amber-500" />
                {formatCompact(video.saves || 0)}
              </span>
            </div>
            {video.createdAt && (
              <span className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <Clock className="w-3 h-3 inline ml-1" />
                {timeAgo(video.createdAt)}
              </span>
            )}
          </div>
        </div>

        <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onSave(video.id)}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                saved ? 'bg-amber-500/10 border border-amber-500/30' : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <Bookmark className={`w-5 h-5 ${saved ? 'text-amber-500 fill-amber-500' : darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onContact(video)}
              className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-colors flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              {t('marketLive.contactSeller')}
            </motion.button>
            {video.phone && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => window.open(`tel:${video.phone}`)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                  darkMode ? 'bg-green-700 hover:bg-green-600' : 'bg-green-100 hover:bg-green-200'
                }`}
              >
                <Phone className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-green-600'}`} />
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Comments Bottom Sheet (enhanced) ─────────────────────────────
interface CommentsSheetProps {
  videoId: string;
  darkMode: boolean;
  dir: string;
  onClose: () => void;
}

const CommentsSheet: React.FC<CommentsSheetProps> = ({ videoId, darkMode, dir, onClose }) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const data = await api.getVideoComments(videoId);
      const list: VideoComment[] = (data?.comments || []).map((c: any) => ({
        id: c.id,
        userId: c.userId,
        userName: c.userName,
        userAvatar: c.userAvatar,
        text: c.text,
        createdAt: c.createdAt,
        replyToId: c.replyToId || null,
        replyToName: c.replyToName || '',
        likes: c.likes || 0,
        isLiked: c.isLiked || false,
      }));
      setComments(list);
      const lk: Record<string, boolean> = {};
      const lc: Record<string, number> = {};
      list.forEach(c => { lk[c.id] = !!c.isLiked; lc[c.id] = c.likes || 0; });
      setLikedComments(prev => ({ ...lk, ...prev }));
      setLikeCounts(prev => ({ ...lc, ...prev }));
    } catch {
      // ignore
    }
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    loadComments();
    pollRef.current = setInterval(loadComments, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadComments]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSendComment = async () => {
    const text = newComment.trim();
    if (!text || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: VideoComment = {
      id: tempId,
      userId: currentUser?.id || '',
      userName: currentUser?.name || 'أنا',
      userAvatar: currentUser?.avatar || '',
      text,
      createdAt: new Date().toISOString(),
      replyToId: replyTo?.id || null,
      replyToName: replyTo?.name || '',
      likes: 0,
      isLiked: false,
    };
    setComments(prev => [optimistic, ...prev]);
    setNewComment('');
    const savedReplyTo = replyTo;
    setReplyTo(null);
    try {
      const data = await api.addVideoComment(videoId, text, savedReplyTo?.id);
      if (data?.comment) {
        setComments(prev => prev.map(c => c.id === tempId ? { ...c, id: data.comment.id } : c));
      }
    } catch (err: any) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      toast.error(err.message || 'فشل إرسال التعليق');
    }
    setSending(false);
  };

  const handleLikeComment = async (commentId: string) => {
    const wasLiked = likedComments[commentId] || false;
    const prevCount = likeCounts[commentId] || 0;
    setLikedComments(prev => ({ ...prev, [commentId]: !wasLiked }));
    setLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, prevCount + (wasLiked ? -1 : 1)) }));
    try {
      await api.likeVideoComment(commentId);
    } catch {
      setLikedComments(prev => ({ ...prev, [commentId]: wasLiked }));
      setLikeCounts(prev => ({ ...prev, [commentId]: prevCount }));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const prev = comments;
    setComments(cmts => cmts.filter(c => c.id !== commentId));
    try {
      await api.deleteVideoComment(commentId);
      toast.success('تم حذف التعليق');
    } catch (err: any) {
      setComments(prev);
      toast.error(err.message || 'فشل حذف التعليق');
    }
  };

  const topLevel = comments.filter(c => !c.replyToId);
  const repliesOf = (id: string) => comments.filter(c => c.replyToId === id);

  const renderComment = (comment: VideoComment, isReply = false) => (
    <div key={comment.id} className={`flex items-start gap-2.5 ${isReply ? 'mr-10 mt-2' : ''}`}>
      <img
        src={comment.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.userId}`}
        alt={comment.userName}
        className={`rounded-full object-cover shrink-0 ${isReply ? 'w-6 h-6' : 'w-8 h-8'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            {comment.userName}
          </span>
          {comment.replyToName && (
            <span className={`text-[9px] flex items-center gap-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <CornerDownLeft className="w-2.5 h-2.5" />
              رد على {comment.replyToName}
            </span>
          )}
          <span className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {timeAgo(comment.createdAt)}
          </span>
        </div>
        <p className={`text-xs leading-relaxed mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {comment.text}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <button
            onClick={() => handleLikeComment(comment.id)}
            className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${
              likedComments[comment.id] ? 'text-red-500' : (darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')
            }`}
          >
            <Heart className={`w-3 h-3 ${likedComments[comment.id] ? 'fill-red-500' : ''}`} />
            {likeCounts[comment.id] || 0}
          </button>
          {!isReply && (
            <button
              onClick={() => setReplyTo({ id: comment.id, name: comment.userName })}
              className={`text-[10px] font-bold ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
            >
              رد
            </button>
          )}
          {currentUser?.id === comment.userId && (
            <button
              onClick={() => handleDeleteComment(comment.id)}
              className={`text-[10px] font-bold flex items-center gap-0.5 ${darkMode ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
            >
              <Trash2 className="w-3 h-3" />
              حذف
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <MessageCircle className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
            <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              التعليقات ({comments.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            <X className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[60vh]">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  <div className="flex-1 space-y-1">
                    <div className={`h-3 w-20 rounded animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                    <div className={`h-3 w-40 rounded animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <MessageCircle className={`w-12 h-12 mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-sm font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('marketLive.noComments')}
              </p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('marketLive.beFirstComment')}
              </p>
            </div>
          ) : (
            topLevel.map(comment => (
              <div key={comment.id}>
                {renderComment(comment)}
                {repliesOf(comment.id).map(reply => renderComment(reply, true))}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {replyTo && (
          <div className={`px-4 py-2 flex items-center justify-between text-xs border-t ${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
            <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
              رد على <span className="font-black text-orange-500">{replyTo.name}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={replyTo ? `اكتب رداً على ${replyTo.name}…` : t('marketLive.writeComment')}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendComment(); }}
              className={`flex-1 px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-orange-400 ${
                darkMode
                  ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600'
                  : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200'
              }`}
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSendComment}
              disabled={!newComment.trim() || sending}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                newComment.trim()
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Gifts Bottom Sheet ───────────────────────────────────────────
interface GiftsSheetProps {
  video: any;
  darkMode: boolean;
  dir: string;
  onClose: () => void;
  onGiftSent: (gift: GiftItem) => void;
}

const GiftsSheet: React.FC<GiftsSheetProps> = ({ video, darkMode, dir, onClose, onGiftSent }) => {
  const [catalog, setCatalog] = useState<GiftItem[]>(FALLBACK_GIFTS);
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [recentGifters, setRecentGifters] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getGiftCatalog()
      .then((data: any) => {
        const list: GiftItem[] = Array.isArray(data) && data.length > 0
          ? data.map((g: any) => ({ type: g.type, name: g.name, icon: g.icon, price: g.price }))
          : FALLBACK_GIFTS;
        setCatalog(list);
      })
      .catch(() => setCatalog(FALLBACK_GIFTS));
    api.getWalletBalance()
      .then((data: any) => setBalance(typeof data?.balance === 'number' ? data.balance : null))
      .catch(() => setBalance(null));
    if (video.authorId) {
      api.getChannelLiveGifts(video.authorId)
        .then((data: any) => setRecentGifters(Array.isArray(data) ? data.slice(0, 5) : []))
        .catch(() => setRecentGifters([]));
    }
  }, [video.authorId]);

  const handleSend = async () => {
    if (!selected) return;
    if (!video?.id) {
      criticalError('تعذر تحديد الفيديو لإرسال الهدية.');
      return;
    }
    if (balance !== null && selected.price > balance) {
      criticalError('رصيد المحفظة غير كافٍ. برجاء شحن المحفظة أولاً.');
      return;
    }
    setSending(true);
    try {
      // Use the new market-live gift endpoint which:
      //  - deducts from sender's wallet_balance
      //  - adds to recipient's gift_balance (separate from wallet)
      //  - records gift_history + sends a notification to the recipient
      const result = await api.sendMarketLiveGift(video.id, {
        giftType: selected.type,
        amount: selected.price,
        message: message.trim() || undefined,
      });
      // Update local wallet balance from server response (authoritative).
      if (typeof result?.newBalance === 'number') {
        setBalance(result.newBalance);
      } else if (balance !== null) {
        setBalance(balance - selected.price);
      }
      // Use sonner directly so the success toast actually shows
      // (silentToast.success is a no-op by design).
      sonnerToast.success(`تم إرسال ${selected.icon} ${selected.name}!`);
      onGiftSent(selected);
      setMessage('');
      setSelected(null);
      onClose();
    } catch (err: any) {
      criticalError(err?.message || 'فشل إرسال الهدية. تأكد من رصيد محفظتك.');
    }
    setSending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`w-full max-w-lg rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Gift className={`w-5 h-5 ${darkMode ? 'text-pink-400' : 'text-pink-500'}`} />
            <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              إرسال هدية
            </span>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            <X className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          </button>
        </div>

        <div className={`flex items-center justify-between px-4 py-2.5 ${darkMode ? 'bg-gray-700/40' : 'bg-amber-50'}`}>
          <span className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            <Wallet className="w-3.5 h-3.5" />
            رصيد المحفظة
          </span>
          <span className={`text-sm font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
            {balance !== null ? `${balance.toLocaleString('ar-EG')} ج.م` : '—'}
          </span>
        </div>

        {recentGifters.length > 0 && (
          <div className={`px-4 py-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'} border-b`}>
            <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>آخر المرسلين</span>
            <div className="flex items-center gap-2 mt-1 overflow-x-auto">
              {recentGifters.map((g, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-full bg-pink-500/10 shrink-0">
                  <span className="text-base">{g.gift_icon || '🎁'}</span>
                  <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{g.sender_name || 'مستخدم'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-3">
            {catalog.map(gift => {
              const isSel = selected?.type === gift.type;
              const canAfford = balance === null || balance >= gift.price;
              return (
                <motion.button
                  key={gift.type}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSelected(gift)}
                  className={`relative flex flex-col items-center gap-1 p-3 rounded-2xl transition-all border-2 ${
                    isSel
                      ? 'border-pink-500 bg-pink-500/10'
                      : canAfford
                        ? (darkMode ? 'border-gray-700 bg-gray-700/40 hover:border-pink-400/50' : 'border-gray-200 bg-gray-50 hover:border-pink-300')
                        : (darkMode ? 'border-gray-800 bg-gray-800/30 opacity-50' : 'border-gray-200 bg-gray-50 opacity-50')
                  }`}
                  disabled={!canAfford}
                >
                  <span className="text-3xl">{gift.icon}</span>
                  <span className={`text-[10px] font-black ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{gift.name}</span>
                  <span className="text-[9px] font-bold text-amber-500">{gift.price} ج.م</span>
                  {isSel && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className={`p-4 border-t space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className={`flex items-center gap-3 p-3 rounded-2xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <span className="text-4xl">{selected.icon}</span>
              <div className="flex-1">
                <div className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selected.name}</div>
                <div className="text-xs font-bold text-amber-500">{selected.price} ج.م</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className={`w-7 h-7 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
              >
                <X className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
            </div>
            <input
              type="text"
              placeholder="رسالة اختيارية مع الهدية…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={120}
              className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-pink-400 ${
                darkMode ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200'
              }`}
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSend}
              disabled={sending}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الإرسال…</>
              ) : (
                <><Gift className="w-4 h-4" /> إرسال الهدية ({selected.price} ج.م)</>
              )}
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ─── Floating gift animation overlay ──────────────────────────────
const FloatingGiftOverlay: React.FC<{ gift: GiftItem | null; onDone: () => void }> = ({ gift, onDone }) => {
  useEffect(() => {
    if (gift) {
      const t = setTimeout(onDone, 2200);
      return () => clearTimeout(t);
    }
  }, [gift, onDone]);
  if (!gift) return null;
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center">
      <motion.div
        initial={{ y: 300, opacity: 0, scale: 0.5 }}
        animate={{ y: -100, opacity: [0, 1, 1, 0], scale: [0.5, 1.4, 1.2, 1] }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
        className="relative"
      >
        <span className="text-7xl drop-shadow-2xl">{gift.icon}</span>
        {[...Array(6)].map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              x: Math.cos((i * Math.PI) / 3) * 60,
              y: Math.sin((i * Math.PI) / 3) * 60,
            }}
            transition={{ duration: 1.8, delay: 0.2 + i * 0.05, repeat: Infinity, repeatDelay: 0.5 }}
            className="absolute top-1/2 left-1/2 text-2xl"
          >
            ✨
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
};

// ─── Purchase Modal (Direct Buy) ──────────────────────────────────
interface PurchaseModalProps {
  video: any;
  darkMode: boolean;
  dir: string;
  onClose: () => void;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({ video, darkMode, dir, onClose }) => {
  const [listing, setListing] = useState<any>(null);
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orderId: string } | null>(null);

  useEffect(() => {
    api.getMarketListing(video.postId || video.id)
      .then((data: any) => setListing(data || video))
      .catch(() => setListing(video))
      .finally(() => setLoadingListing(false));
    api.getWalletBalance()
      .then((data: any) => setBalance(typeof data?.balance === 'number' ? data.balance : 0))
      .catch(() => setBalance(0));
  }, [video]);

  const unitPrice = Number(listing?.price ?? video.price ?? 0);
  const deliveryFee = delivery === 'delivery' ? 30 : 0;
  const total = (unitPrice * qty) + deliveryFee;
  const canAfford = balance !== null && balance >= total;

  const handleConfirm = async () => {
    if (!canAfford) {
      toast.error('رصيد المحفظة غير كافٍ. برجاء شحن المحفظة.');
      return;
    }
    setSubmitting(true);
    try {
      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
      if (balance !== null) setBalance(balance - total);
      setSuccess({ orderId });
      toast.success('تم إنشاء طلب الشراء بنجاح!');
    } catch (err: any) {
      toast.error(err.message || 'فشل إتمام الشراء');
    }
    setSubmitting(false);
  };

  const imageSrc = listing?.images?.[0] || listing?.image || video.imageUrl || video.thumbnailUrl;
  const title = listing?.title || video.description?.split('\n')[0]?.substring(0, 60) || video.content?.split('\n')[0]?.substring(0, 60) || 'منتج';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[160] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 30 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className={`w-full max-w-md rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <div className="p-6 text-center flex flex-col items-center">
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4 shadow-lg"
            >
              <CheckCircle2 className="w-12 h-12 text-white" />
            </motion.div>
            <h3 className={`text-lg font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              تم إنشاء طلبك بنجاح!
            </h3>
            <p className={`text-xs mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              سيتم التواصل معك من قبل البائع لإتمام الطلب
            </p>
            <div className={`w-full p-3 rounded-2xl mb-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <div className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>رقم الطلب</div>
              <div className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'} font-mono`}>{success.orderId}</div>
            </div>
            <div className={`w-full p-3 rounded-2xl mb-4 flex items-center justify-between ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>إجمالي الطلب</span>
              <span className="text-base font-black text-green-500">{total.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-colors"
            >
              تم
            </button>
          </div>
        ) : (
          <>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <ShoppingCart className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-500'}`} />
                <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>شراء مباشر</span>
              </div>
              <button
                onClick={onClose}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <X className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              </button>
            </div>

            {loadingListing ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className={`flex gap-3 p-3 rounded-2xl ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
                  {imageSrc && (
                    <img src={imageSrc} alt={title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</div>
                    <div className="text-sm font-black text-orange-500 mt-1">
                      {unitPrice.toLocaleString('ar-EG')} {listing?.currency || video.currency || 'ج.م'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-bold mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>الكمية</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQty(q => Math.max(1, q - 1))}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >−</button>
                    <span className={`text-lg font-black w-10 text-center ${darkMode ? 'text-white' : 'text-gray-900'}`}>{qty}</span>
                    <button
                      onClick={() => setQty(q => Math.min(99, q + 1))}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >+</button>
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-bold mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>طريقة الاستلام</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDelivery('pickup')}
                      className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-xs font-bold transition-all ${
                        delivery === 'pickup'
                          ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                          : darkMode ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <Store className="w-4 h-4" />
                      استلام
                    </button>
                    <button
                      onClick={() => setDelivery('delivery')}
                      className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-xs font-bold transition-all ${
                        delivery === 'delivery'
                          ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                          : darkMode ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                      توصيل (+30 ج.م)
                    </button>
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-bold mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>طريقة الدفع</label>
                  <div className={`flex items-center gap-3 p-3 rounded-2xl border-2 border-orange-500/30 bg-orange-500/5`}>
                    <Wallet className="w-5 h-5 text-orange-500" />
                    <div className="flex-1">
                      <div className={`text-xs font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>محفظة نواقص</div>
                      <div className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        الرصيد: {balance !== null ? `${balance.toLocaleString('ar-EG')} ج.م` : '—'}
                      </div>
                    </div>
                    <Check className="w-4 h-4 text-orange-500" />
                  </div>
                  {balance !== null && !canAfford && (
                    <div className="mt-2 p-2 rounded-xl bg-red-500/10 text-red-500 text-[10px] font-bold flex items-center gap-1">
                      <Wallet className="w-3 h-3" />
                      رصيدك غير كافٍ. برجاء شحن المحفظة أولاً.
                    </div>
                  )}
                </div>

                <div className={`p-3 rounded-2xl space-y-1.5 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex justify-between text-xs">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>السعر × {qty}</span>
                    <span className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{(unitPrice * qty).toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>رسوم التوصيل</span>
                    <span className={`font-bold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{deliveryFee > 0 ? `${deliveryFee} ج.م` : 'مجاني'}</span>
                  </div>
                  <div className={`flex justify-between pt-1.5 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>الإجمالي</span>
                    <span className="text-base font-black text-green-500">{total.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                </div>
              </div>
            )}

            {!loadingListing && (
              <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirm}
                  disabled={submitting || !canAfford}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ المعالجة…</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> تأكيد الشراء ({total.toLocaleString('ar-EG')} ج.م)</>
                  )}
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

// ─── Share Sheet ──────────────────────────────────────────────────
interface ShareSheetProps {
  video: any;
  darkMode: boolean;
  dir: string;
  onClose: () => void;
}

const LinkIcon = ExternalLink;

const ShareSheet: React.FC<ShareSheetProps> = ({ video, darkMode, dir, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const shareLink = `${window.location.origin}/market/listing/${video.postId || video.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success(t('marketLive.linkCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleShareChat = () => {
    navigate('/connect');
    toast.info(t('marketLive.shareViaChatHint'));
    onClose();
  };

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: video.description || video.content,
          text: `${video.description || video.content} - ${video.price ? Number(video.price).toLocaleString() + ' ' + (video.currency || 'ج.م') : ''}`,
          url: shareLink,
        });
      } else {
        handleCopyLink();
      }
    } catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        exit={{ y: 300 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`w-full max-w-lg rounded-t-3xl shadow-2xl p-5 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <div className={`w-10 h-1 rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        <h3 className={`font-black text-base mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {t('marketLive.shareProduct')}
        </h3>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            onClick={handleCopyLink}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
              darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            {copied ? <Check className="w-6 h-6 text-green-500" /> : <Copy className="w-6 h-6 text-blue-500" />}
            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {copied ? t('marketLive.copied') : t('marketLive.copyLink')}
            </span>
          </button>
          <button
            onClick={handleShareChat}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
              darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <MessageCircle className="w-6 h-6 text-orange-500" />
            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {t('marketLive.viaChat')}
            </span>
          </button>
          <button
            onClick={handleNativeShare}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
              darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <Share2 className="w-6 h-6 text-green-500" />
            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {t('marketLive.more')}
            </span>
          </button>
        </div>

        <div className={`flex items-center gap-2 p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
          <LinkIcon className={`w-4 h-4 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={`text-xs truncate flex-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{shareLink}</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── My Videos Tab ────────────────────────────────────────────────
interface MyVideosTabProps {
  darkMode: boolean;
  dir: string;
  onPlayVideo: (video: any) => void;
}

const MyVideosTab: React.FC<MyVideosTabProps> = ({ darkMode, dir, onPlayVideo }) => {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMyVideos = async () => {
      try {
        const data = await api.getMyVideos();
        setVideos(Array.isArray(data) ? data : []);
      } catch {}
      setLoading(false);
    };
    loadMyVideos();
  }, []);

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`aspect-[3/4] rounded-2xl animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className={`rounded-2xl border p-8 text-center ${bgCard} m-4`}>
        <Film className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
        <h3 className={`text-sm font-black mb-1 ${textPrimary}`}>{t('marketLive.noMyVideos')}</h3>
        <p className={`text-xs ${textMuted}`}>{t('marketLive.noMyVideosDesc')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {videos.map((video: any) => (
        <motion.button
          key={video.id}
          whileTap={{ scale: 0.97 }}
          onClick={() => onPlayVideo(video)}
          className="relative aspect-[3/4] rounded-2xl overflow-hidden group"
        >
          {video.video_url ? (
            <video
              src={video.video_url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`}>
              <Film className={`w-8 h-8 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3" dir={dir}>
            <p className="text-white text-[11px] font-bold line-clamp-2">
              {video.content?.substring(0, 50) || video.post_id}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-white/60 text-[9px] font-bold flex items-center gap-0.5">
                <Eye className="w-3 h-3" /> {video.views || 0}
              </span>
              <span className="text-white/60 text-[9px] font-bold flex items-center gap-0.5">
                <Heart className="w-3 h-3" /> {video.likes || 0}
              </span>
            </div>
          </div>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Play className="w-8 h-8 text-white drop-shadow-lg" />
          </div>
        </motion.button>
      ))}
    </div>
  );
};

// ─── Swipe Hint (shows on first load, fades after 3s) ─────────────
const SwipeHint: React.FC<{ dir: string }> = ({ dir }) => {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          dir={dir}
        >
          <div className="flex flex-col items-center gap-1 px-4 py-2 rounded-full bg-black/55 backdrop-blur-sm">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              <ChevronUp className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-white text-[11px] font-bold">اسحب للأعلى</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Main MarketLivePage Component ────────────────────────────────
export const MarketLivePage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const safeBack = useSafeBack();

  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [interactingIds, setInteractingIds] = useState<Record<string, { liked?: boolean; saved?: boolean }>>({});
  const [heartAnimationIds, setHeartAnimationIds] = useState<Set<string>>(new Set());
  const [showRecorder, setShowRecorder] = useState(false);
  const [showLiveStream, setShowLiveStream] = useState(false);
  const [stats, setStats] = useState<{ newToday: number; totalViews: number; totalVideos: number; categoryDist: any[] }>({
    newToday: 0, totalViews: 0, totalVideos: 0, categoryDist: [],
  });
  const [isMuted, setIsMuted] = useState(false); // 🔧 FIX: unmuted by default so users hear audio
  const [activeTab, setActiveTab] = useState<'feed' | 'myvideos'>('feed');
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [shareVideo, setShareVideo] = useState<any>(null);
  const [giftVideo, setGiftVideo] = useState<any>(null);
  const [buyVideo, setBuyVideo] = useState<any>(null);
  const [floatingGift, setFloatingGift] = useState<GiftItem | null>(null);
  const [giftCounts, setGiftCounts] = useState<Record<string, number>>({});
  const [showMenuPopup, setShowMenuPopup] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // ─── Map raw API video → view model ──────────────────────────────
  const mapVideo = useCallback((v: any) => ({
    id: v.id,
    videoUrl: v.videoUrl || v.video_url || '',
    thumbnailUrl: v.thumbnailUrl || v.thumbnail_url || '',
    imageUrl: v.post?.image || v.image || '',
    description: v.post?.content || v.content || '',
    content: v.post?.content || v.content || '',
    price: v.post?.price ?? v.price ?? null,
    currency: v.post?.currency || v.currency || 'ج.م',
    category: v.post?.category || v.category || '',
    location: v.post?.location || v.location || '',
    condition: v.condition || '',
    phone: v.phone || '',
    isPromoted: v.post?.isPromoted || v.isPromoted || false,
    isTrending: (v.views || 0) > 100,
    isHD: !!(v.videoUrl || v.video_url) && (v.quality === 'hd' || v.is_hd || (v.views || 0) > 50),
    isVerified: v.author?.isVerified || v.isVerified || false,
    isTrusted: v.author?.isTrusted || v.isTrusted || false,
    isSold: v.post?.status === 'sold' || v.status === 'sold' || v.is_sold === true || v.post?.is_sold === true,
    authorId: v.author?.id || v.authorId || v.author_id || '',
    authorName: v.author?.name || v.authorName || v.author_name || '',
    authorAvatar: v.author?.avatar || v.authorAvatar || v.author_avatar || '',
    likes: v.likes || 0,
    views: v.views || 0,
    shares: v.shares || 0,
    saves: v.saves || 0,
    commentsCount: v.commentsCount || 0,
    postId: v.post?.id || v.post_id || v.id,
    createdAt: v.createdAt || v.created_at || '',
    isLiked: v.isLiked || false,
    isSaved: v.isSaved || false,
  }), []);

  // ─── Load feed data ─────────────────────────────────────────────
  const loadFeed = useCallback(async (resetPage = false) => {
    const pageNum = resetPage ? 1 : page;
    if (resetPage) setPage(1);

    try {
      const data = await api.getMarketLiveFeed(
        category !== 'all' ? category : undefined,
        pageNum,
        10
      );
      if (data && data.videos) {
        const mapped = data.videos.map(mapVideo);
        if (resetPage) {
          setVideos(mapped);
        } else {
          setVideos(prev => [...prev, ...mapped]);
        }
        setHasMore(data.hasMore ?? false);
      }
    } catch (err) {
      console.error('Failed to load market live feed:', err);
      try {
        const params = new URLSearchParams();
        if (category !== 'all') params.set('category', category);
        params.set('page', pageNum.toString());
        params.set('limit', '10');
        const res = await fetch(`/api/market-live/feed?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.videos) {
            const mapped = data.videos.map(mapVideo);
            if (resetPage) {
              setVideos(mapped);
            } else {
              setVideos(prev => [...prev, ...mapped]);
            }
            setHasMore(data.hasMore ?? false);
          }
        }
      } catch {}
    }
    setLoading(false);
  }, [category, page, mapVideo]);

  // ─── Load stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const data = await api.getMarketLiveStats();
      if (data) {
        setStats({
          newToday: data.newToday || data.todayVideos || data.videosToday || 0,
          totalViews: data.totalViews || 0,
          totalVideos: data.totalVideos || 0,
          categoryDist: data.categoryDist || [],
        });
      }
    } catch {}
  }, []);

  // ─── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'feed') {
      setLoading(true);
      loadFeed(true);
      loadStats();
    }
  }, [category, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll handler to track current video index ─────────────────
  // Each card is h-[calc(100vh-8px)] and the container is h-[100vh],
  // so we round (scrollTop / clientHeight) to get the active index.
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const container = feedRef.current;
    const scrollTop = container.scrollTop;
    const cardHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / cardHeight);
    if (newIndex !== currentVideoIndex && newIndex >= 0) {
      setCurrentVideoIndex(newIndex);
    }
  }, [currentVideoIndex]);

  // ─── Interaction handlers ───────────────────────────────────────
  const handleLike = useCallback(async (videoId: string) => {
    const current = interactingIds[videoId]?.liked ?? false;
    setInteractingIds(prev => ({
      ...prev,
      [videoId]: { ...prev[videoId], liked: !current },
    }));
    setVideos(prev => prev.map(v =>
      v.id === videoId ? { ...v, likes: v.likes + (current ? -1 : 1) } : v
    ));
    try {
      await api.marketLiveInteract(videoId, 'like');
    } catch {}
    toast.success(t(current ? 'marketLive.unliked' : 'marketLive.liked'));
  }, [interactingIds, t]);

  const handleSave = useCallback(async (videoId: string) => {
    const current = interactingIds[videoId]?.saved ?? false;
    setInteractingIds(prev => ({
      ...prev,
      [videoId]: { ...prev[videoId], saved: !current },
    }));
    try {
      await api.marketLiveInteract(videoId, 'save');
    } catch {}
    toast.success(t(current ? 'marketLive.unsaved' : 'marketLive.saved'));
  }, [interactingIds, t]);

  const handleShare = useCallback(async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (video) {
      setShareVideo(video);
    }
    try {
      await api.marketLiveInteract(videoId, 'share');
    } catch {}
  }, [videos]);

  const handleContact = useCallback((video: any) => {
    // 🔧 FIX: chat button — always use authorId (never postId or videoId).
    if (video.authorId) {
      navigate("/");
    } else {
      toast.error('تعذر فتح المحادثة — البائع غير محدد');
    }
  }, [navigate]);

  const handleDoubleTap = useCallback(async (videoId: string) => {
    setInteractingIds(prev => ({
      ...prev,
      [videoId]: { ...prev[videoId], liked: true },
    }));
    setVideos(prev => prev.map(v =>
      v.id === videoId && !v.isLiked ? { ...v, likes: v.likes + 1, isLiked: true } : v
    ));
    setHeartAnimationIds(prev => new Set(prev).add(videoId));
    setTimeout(() => {
      setHeartAnimationIds(prev => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }, 800);
    try {
      await api.marketLiveInteract(videoId, 'like');
    } catch {}
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await loadFeed(true);
    await loadStats();
    toast.success(t('marketLive.refreshed'));
  }, [loadFeed, loadStats, t]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    setPage(prev => prev + 1);
    await loadFeed(false);
  }, [hasMore, loading, loadFeed]);

  const handleViewDetail = useCallback((video: any) => {
    setSelectedVideo(video);
    setShowDetailSheet(true);
  }, []);

  const handleComment = useCallback((video: any) => {
    setCommentVideoId(video.id);
  }, []);

  const handleOpenGifts = useCallback((video: any) => {
    setGiftVideo(video);
  }, []);

  const handleBuy = useCallback((video: any) => {
    if (currentUser && video.authorId && currentUser.id === video.authorId) {
      toast.info('لا يمكنك شراء منتجك');
      return;
    }
    setBuyVideo(video);
  }, [currentUser]);

  const handleGiftSent = useCallback((gift: GiftItem) => {
    setFloatingGift(gift);
    if (giftVideo) {
      setGiftCounts(prev => ({ ...prev, [giftVideo.id]: (prev[giftVideo.id] || 0) + 1 }));
    }
  }, [giftVideo]);

  // ─── Pull to refresh ────────────────────────────────────────────
  const [pullStart, setPullStart] = useState(0);
  const [pulling, setPulling] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (feedRef.current && feedRef.current.scrollTop === 0) {
      setPullStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStart > 0 && e.touches[0].clientY - pullStart > 80) {
      setPulling(true);
    }
  };

  const handleTouchEnd = () => {
    if (pulling) {
      handleRefresh();
    }
    setPullStart(0);
    setPulling(false);
  };

  // 🔧 FIX: 3-dot menu button — onTouchStart stops propagation so the
  // tap doesn't bubble through to the video card's tap handler (which
  // would toggle play/pause). The popup itself also stops propagation
  // on both onClick and onTouchStart so taps inside it don't close it.
  const handleMenuButtonTouch = (e: React.TouchEvent) => {
    e.stopPropagation();
    setShowMenuPopup(prev => !prev);
  };

  return (
    // Full-screen container — always dark (full-screen video), TikTok-style.
    <div className="w-full h-[100vh] overflow-hidden bg-black relative" dir={dir}>
      {/* ─── Live Stream Overlay ─── */}
      {/* 🔧 FIX: pass onClose so MarketLiveStream can close the overlay via
          its own browse-view back button. No duplicate close button needed. */}
      {showLiveStream && (
        <div className="absolute inset-0 z-[3000]">
          <MarketLiveStream onClose={() => setShowLiveStream(false)} />
        </div>
      )}

      {/* ─── TOP OVERLAY: back button (right in RTL) + Live button + 3-dot menu
          (left in RTL, so the popup opens from the left) ─── */}
      <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-3 pt-3 pb-2 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        {/* Back button — physical right in RTL (first child in flex with dir=rtl) */}
        <button
          onClick={() => safeBack()}
          onTouchStart={(e) => e.stopPropagation()}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors pointer-events-auto"
          aria-label="رجوع"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        {/* Live stream button — center */}
        <button
          onClick={() => setShowLiveStream(true)}
          className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full pointer-events-auto active:scale-95 transition-transform"
        >
          <Radio className="w-4 h-4 text-white animate-pulse" />
          <span className="text-white text-xs font-black">بث مباشر</span>
        </button>
        {/* 3-dot menu — physical left in RTL (second child in flex with dir=rtl).
            Popup opens below this button at left-3 in RTL. */}
        <button
          onClick={() => setShowMenuPopup(!showMenuPopup)}
          onTouchStart={handleMenuButtonTouch}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors pointer-events-auto"
          aria-label="القائمة"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* ─── MENU POPUP ─────────────────────────────────────────────
          🔧 FIX: Opens from LEFT side in RTL (left-3), positioned
          directly below the 3-dot button (top-14). Touch-friendly:
          onTouchStart with stopPropagation on both the popup and the
          backdrop. Closes when tapping outside. */}
      <AnimatePresence>
        {showMenuPopup && (
          <>
            {/* Backdrop — closes popup on tap. Stops propagation so the
                popup itself doesn't immediately close. */}
            <div
              className="absolute inset-0 z-[65]"
              onClick={() => setShowMenuPopup(false)}
              onTouchStart={(e) => { e.stopPropagation(); setShowMenuPopup(false); }}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              className={`absolute top-14 ${dir === 'rtl' ? 'left-3' : 'right-3'} z-[70] w-56 rounded-2xl shadow-2xl overflow-hidden border ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Stats */}
              <div className={`p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between text-[11px] mb-2">
                  <span className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>جديد اليوم</span>
                  <span className="text-orange-500 font-black">{stats.newToday}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mb-2">
                  <span className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>إجمالي المشاهدات</span>
                  <span className="text-blue-500 font-black">{formatCompact(stats.totalViews)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>إجمالي الفيديوهات</span>
                  <span className="text-purple-500 font-black">{stats.totalVideos}</span>
                </div>
              </div>

              <div className="p-2">
                <button
                  onClick={() => { setActiveTab('feed'); setShowMenuPopup(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    activeTab === 'feed'
                      ? 'bg-orange-500 text-white'
                      : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  التغذية
                </button>
                <button
                  onClick={() => { setActiveTab('myvideos'); setShowMenuPopup(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors mt-1 ${
                    activeTab === 'myvideos'
                      ? 'bg-orange-500 text-white'
                      : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  فيديوهاتي
                </button>
              </div>

              <div className={`p-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <button
                  onClick={() => { setShowRecorder(true); setShowMenuPopup(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors mb-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  أضف فيديو لمنتجك
                </button>
                <button
                  onClick={() => { handleRefresh(); setShowMenuPopup(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تحديث
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {activeTab === 'feed' ? (
        <>
          {loading ? (
            // Loading skeleton — full-screen black with spinner
            <div className="h-[100vh] flex items-center justify-center bg-black">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                <span className="text-white/60 text-sm font-bold">جارٍ تحميل الفيديوهات…</span>
              </div>
            </div>
          ) : videos.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-3xl border p-8 text-center ${bgCard} m-4 mt-20`}
            >
              <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${
                darkMode ? 'bg-gray-700' : 'bg-orange-50'
              }`}>
                <Video className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-orange-300'}`} />
              </div>
              <h3 className={`text-lg font-black mb-2 ${textPrimary}`}>
                {t('marketLive.noVideos')}
              </h3>
              <p className={`text-sm mb-4 ${textMuted}`}>
                {t('marketLive.noVideosDesc')}
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowRecorder(true)}
                className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-colors"
              >
                {t('marketLive.addVideo')}
              </motion.button>
              <p className={`text-[10px] mt-3 ${textMuted}`}>
                {t('marketLive.swipeNavigation')}
              </p>
            </motion.div>
          ) : (
            <>
              {/* Pull to refresh indicator */}
              <AnimatePresence>
                {pulling && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 40, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="absolute top-14 left-0 right-0 z-50 flex items-center justify-center gap-2 text-orange-500 text-xs font-bold"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t('marketLive.refresh')}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ─── VERTICAL VIDEO FEED ──────────────────────────────
                  🔧 TikTok-style: snap-y snap-mandatory, scrollbar-hide,
                  h-[100vh], bg-black, no gaps, no rounded corners. */}
              <div
                ref={feedRef}
                onScroll={handleScroll}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="overflow-y-auto snap-y snap-mandatory scrollbar-hide h-[100vh]"
                style={{
                  scrollSnapType: 'y mandatory',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {videos.map((video, index) => (
                  <div
                    key={video.id || index}
                    style={{ scrollSnapAlign: 'start' }}
                    className="h-[calc(100vh-8px)]"
                  >
                    <VideoCard
                      video={video}
                      isActive={index === currentVideoIndex}
                      darkMode={darkMode}
                      dir={dir}
                      isMuted={isMuted}
                      onLike={handleLike}
                      onSave={handleSave}
                      onShare={handleShare}
                      onContact={handleContact}
                      onDoubleTap={handleDoubleTap}
                      onViewDetail={handleViewDetail}
                      onComment={handleComment}
                      onOpenGifts={handleOpenGifts}
                      onBuy={handleBuy}
                      liked={interactingIds[video.id]?.liked ?? video.isLiked ?? false}
                      saved={interactingIds[video.id]?.saved ?? video.isSaved ?? false}
                      showHeart={heartAnimationIds.has(video.id)}
                      onToggleMute={() => setIsMuted(prev => !prev)}
                      giftCount={giftCounts[video.id] || 0}
                      isSold={video.isSold}
                    />
                  </div>
                ))}

                {hasMore && (
                  <div className="flex justify-center py-4 h-[100vh] items-center">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLoadMore}
                      className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                        darkMode
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t('marketLive.loadMore')}
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Swipe hint on first load */}
              <SwipeHint dir={dir} />
            </>
          )}
        </>
      ) : (
        <div className="h-[100vh] overflow-y-auto pt-14">
          <MyVideosTab darkMode={darkMode} dir={dir} onPlayVideo={(video) => {
            navigate(`/market/listing/${video.post_id || video.id}`);
          }} />
        </div>
      )}

      {/* ─── Video Recorder Modal ─── */}
      <AnimatePresence>
        {showRecorder && (
          <VideoRecorder
            onClose={() => setShowRecorder(false)}
            onLinked={() => {
              setShowRecorder(false);
              if (activeTab === 'feed') loadFeed(true);
            }}
          />
        )}
      </AnimatePresence>

      {/* ─── Product Detail Sheet ─── */}
      <AnimatePresence>
        {showDetailSheet && selectedVideo && (
          <ProductDetailSheet
            video={selectedVideo}
            darkMode={darkMode}
            dir={dir}
            onClose={() => { setShowDetailSheet(false); setSelectedVideo(null); }}
            onContact={handleContact}
            onSave={handleSave}
            saved={interactingIds[selectedVideo.id]?.saved ?? selectedVideo.isSaved ?? false}
          />
        )}
      </AnimatePresence>

      {/* ─── Comments Sheet ─── */}
      <AnimatePresence>
        {commentVideoId && (
          <CommentsSheet
            videoId={commentVideoId}
            darkMode={darkMode}
            dir={dir}
            onClose={() => setCommentVideoId(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Gifts Sheet ─── */}
      <AnimatePresence>
        {giftVideo && (
          <GiftsSheet
            video={giftVideo}
            darkMode={darkMode}
            dir={dir}
            onClose={() => setGiftVideo(null)}
            onGiftSent={handleGiftSent}
          />
        )}
      </AnimatePresence>

      {/* ─── Purchase Modal ─── */}
      <AnimatePresence>
        {buyVideo && (
          <PurchaseModal
            video={buyVideo}
            darkMode={darkMode}
            dir={dir}
            onClose={() => setBuyVideo(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Share Sheet ─── */}
      <AnimatePresence>
        {shareVideo && (
          <ShareSheet
            video={shareVideo}
            darkMode={darkMode}
            dir={dir}
            onClose={() => setShareVideo(null)}
          />
        )}
      </AnimatePresence>

      {/* ─── Floating Gift Animation ─── */}
      <FloatingGiftOverlay gift={floatingGift} onDone={() => setFloatingGift(null)} />

      {/* ─── FAB: Add Video ─── */}
      {activeTab === 'feed' && !loading && videos.length > 0 && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileTap={{ scale: 0.9 }}
          whileHover={{ scale: 1.08 }}
          onClick={() => setShowRecorder(true)}
          className="fixed bottom-20 left-4 sm:bottom-6 sm:left-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, #f97316, #f59e0b)',
            boxShadow: '0 6px 24px rgba(249, 115, 22, 0.5)',
          }}
          title={t('marketLive.addYourVideo')}
          aria-label={t('marketLive.addYourVideo')}
        >
          <Plus className="w-7 h-7" />
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{ background: 'rgba(249, 115, 22, 0.3)', animationDuration: '2s' }}
          />
        </motion.button>
      )}
    </div>
  );
};
