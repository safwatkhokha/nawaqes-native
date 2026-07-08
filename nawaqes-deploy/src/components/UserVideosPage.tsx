// ─── User Videos Page — عرض فيديوهات المستخدم بنفس طريقة سوق لايف ──
// TikTok-style full-screen vertical video feed showing all videos by a
// specific user. Swipe up/down to navigate between videos. Same UX as
// MarketLivePage but filtered to one user's videos only.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import {
  ArrowRight, Play, Eye, Heart, Video, RefreshCw, Plus,
  MessageCircle, Share2, Bookmark, BadgeCheck, ShieldCheck,
  MapPin, ShoppingBag, Volume2, VolumeX, Star, ShoppingCart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useSafeBack } from '../hooks/useSafeBack';

const formatCompact = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num || 0);
};

// ─── Inline Video Card (same design as MarketLivePage VideoCard) ────
// We inline a simplified version here to avoid exporting VideoCard from
// MarketLivePage (which would require refactoring its props). This card
// supports: like, save, share, comment (via toast), add-to-cart, rating,
// follow button on avatar, mute toggle, double-tap heart.
const UserVideoCard: React.FC<{
  video: any;
  isActive: boolean;
  darkMode: boolean;
  dir: string;
  isMuted: boolean;
  onToggleMute: () => void;
  authorInfo: any;
}> = ({ video, isActive, darkMode, dir, isMuted, onToggleMute, authorInfo }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTapRef = useRef<number>(0);
  const [videoError, setVideoError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [cartFlash, setCartFlash] = useState(false);

  const authorId = authorInfo?.id || video.authorId;
  const authorName = authorInfo?.name || video.authorName || 'بائع نواقص';
  const authorAvatar = authorInfo?.avatar || video.authorAvatar || '';
  const isVerified = !!authorInfo?.is_verified;
  const isTrusted = !!authorInfo?.is_trusted;

  // Auto-play/pause
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (isActive && video.videoUrl) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
  }, [isActive, video.videoUrl]);

  // Check follow status
  useEffect(() => {
    if (!currentUser || !authorId || currentUser.id === authorId) {
      setIsFollowing(false);
      return;
    }
    api.getFollowStatus(authorId)
      .then((data: any) => setIsFollowing(!!data.following))
      .catch(() => setIsFollowing(false));
  }, [authorId, currentUser]);

  const handleToggleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !authorId || followLoading || currentUser.id === authorId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await api.unfollowUser(authorId);
        setIsFollowing(false);
        toast.success('تم إلغاء المتابعة');
      } else {
        await api.followUser(authorId);
        setIsFollowing(true);
        toast.success('تمت المتابعة');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل تحديث المتابعة');
    } finally {
      setFollowLoading(false);
    }
  }, [currentUser, authorId, isFollowing, followLoading]);

  const handleTap = () => {
    const now = Date.now();
    const diff = now - lastTapRef.current;
    if (diff < 300) {
      // Double tap = like
      setLiked(true);
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 800);
    } else {
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= 300) {
          const videoEl = videoRef.current;
          if (videoEl) {
            if (videoEl.paused) videoEl.play().catch(() => {});
            else videoEl.pause();
          }
        }
      }, 300);
    }
    lastTapRef.current = now;
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCartFlash(true);
    setTimeout(() => setCartFlash(false), 600);
    toast.success('تمت الإضافة للسلة');
  };

  const handleRate = (e: React.MouseEvent, stars: number) => {
    e.stopPropagation();
    setRating(stars);
    toast.success(`تم تقييم المنتج بـ ${stars} نجوم`);
  };

  const hasVideo = video.videoUrl && video.videoUrl.length > 5 && !videoError;
  const thumb = video.thumbnailUrl;

  return (
    <div
      className="relative w-full h-[100vh] overflow-hidden snap-start flex-shrink-0 bg-black"
      onClick={handleTap}
    >
      {/* Video or thumbnail */}
      {hasVideo ? (
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="absolute inset-0 w-full h-full object-contain"
          loop
          muted={isMuted}
          playsInline
          onError={() => setVideoError(true)}
        />
      ) : thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <ShoppingBag className="w-16 h-16 text-orange-500/40" />
        </div>
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

      {/* Double-tap heart */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <Heart className="w-24 h-24 text-red-500 fill-red-500 drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute toggle (top-left) */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
        className="absolute top-4 left-4 z-20 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
      >
        {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
      </button>

      {/* ─── Left side: Author info & product details ─── */}
      <div className="absolute bottom-6 left-4 right-16 z-10 flex flex-col gap-2.5" dir={dir}>
        {/* Author info */}
        <div className="flex items-center gap-3">
          <div
            className="relative cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (authorId) navigate(`/user/${authorId}`);
            }}
          >
            <img
              src={authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${authorId || 'default'}`}
              alt={authorName}
              className="w-11 h-11 rounded-full border-2 border-white/30 object-cover"
            />
            {isVerified && (
              <BadgeCheck className="absolute -bottom-0.5 -right-0.5 w-4 h-4 text-blue-400 fill-blue-500" />
            )}
            {/* Follow button on avatar */}
            {currentUser && authorId && currentUser.id !== authorId && !isFollowing && (
              <button
                onClick={handleToggleFollow}
                disabled={followLoading}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-black shadow-lg hover:bg-red-600 active:scale-90 transition-all disabled:opacity-50"
                title="متابعة"
              >+</button>
            )}
            {isFollowing && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
          {/* Author name (clickable) */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (authorId) navigate(`/user/${authorId}`);
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-white font-black text-sm truncate drop-shadow-lg">{authorName}</span>
              {isTrusted && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </div>
            {video.location && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-white/50" />
                <span className="text-white/50 text-[10px] font-medium">{video.location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Product description */}
        {video.title && (
          <p className="text-white/90 text-sm leading-relaxed line-clamp-2 font-medium">{video.title}</p>
        )}

        {/* Price */}
        {video.price != null && (
          <div className="flex items-center gap-2">
            <span className="text-orange-400 font-black text-lg drop-shadow-lg">
              {Number(video.price).toLocaleString('ar-EG')} {video.currency || 'ج.م'}
            </span>
          </div>
        )}
      </div>

      {/* ─── Right side: Action buttons ─── */}
      <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-3.5" dir={dir}>
        {/* Like */}
        <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setLiked(!liked); }}
          className="flex flex-col items-center gap-0.5">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm ${liked ? 'bg-red-500/20' : 'bg-white/10'}`}>
            <Heart className={`w-6 h-6 ${liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
          </div>
          <span className="text-white/80 text-[9px] font-bold">{formatCompact(video.likes + (liked ? 1 : 0))}</span>
        </motion.button>
        {/* Comment */}
        <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); toast.info('التعليقات قريباً'); }}
          className="flex flex-col items-center gap-0.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-sm">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white/80 text-[9px] font-bold">0</span>
        </motion.button>
        {/* Save */}
        <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); setSaved(!saved); toast.success(saved ? 'تمت الإزالة' : 'تم الحفظ'); }}
          className="flex flex-col items-center gap-0.5">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm ${saved ? 'bg-amber-500/20' : 'bg-white/10'}`}>
            <Bookmark className={`w-6 h-6 ${saved ? 'text-amber-400 fill-amber-400' : 'text-white'}`} />
          </div>
          <span className="text-white/80 text-[9px] font-bold">حفظ</span>
        </motion.button>
        {/* Share */}
        <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => { e.stopPropagation(); toast.success('تم نسخ الرابط'); }}
          className="flex flex-col items-center gap-0.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-sm">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white/80 text-[9px] font-bold">مشاركة</span>
        </motion.button>
        {/* Add to cart */}
        <motion.button whileTap={{ scale: 0.85 }} onClick={handleAddToCart}
          className="flex flex-col items-center gap-0.5">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm shadow-lg transition-all ${cartFlash ? 'bg-green-500 scale-110' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
            <ShoppingCart className="w-6 h-6 text-white" />
          </div>
          <span className="text-white/80 text-[9px] font-bold">سلة</span>
        </motion.button>
        {/* Views */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-sm">
            <Eye className="w-6 h-6 text-white" />
          </div>
          <span className="text-white/80 text-[9px] font-bold">{formatCompact(video.views)}</span>
        </div>
      </div>

      {/* Rating stars (bottom-left) */}
      <div className="absolute bottom-24 left-3 z-10 flex flex-col items-center gap-1" dir={dir}>
        <div className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} onClick={(e) => handleRate(e, star)} className="p-0.5 active:scale-90 transition-transform">
              <Star className={`w-3.5 h-3.5 ${star <= rating ? 'text-amber-400 fill-amber-400' : 'text-white/40 hover:text-white/70'}`} />
            </button>
          ))}
        </div>
        <span className="text-white/60 text-[8px] font-bold">قيّم المنتج</span>
      </div>
    </div>
  );
};

// ─── Main UserVideosPage Component ──────────────────────────────────
export const UserVideosPage: React.FC = () => {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const safeBack = useSafeBack();

  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const feedRef = useRef<HTMLDivElement>(null);

  const loadVideos = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [profileRes, videosRes] = await Promise.all([
        api.getUserProfile(userId).catch(() => null),
        api.getUserVideos(userId).catch(() => ({ videos: [], total: 0 })),
      ]);
      if (profileRes) setUserInfo(profileRes);
      setVideos((videosRes as any)?.videos || []);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  // Track current video index on scroll
  const handleScroll = useCallback(() => {
    if (!feedRef.current) return;
    const container = feedRef.current;
    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const newIndex = Math.round(scrollTop / containerHeight);
    if (newIndex !== currentVideoIndex) setCurrentVideoIndex(newIndex);
  }, [currentVideoIndex]);

  const isOwnProfile = currentUser?.id === userId;

  return (
    <div className="w-full h-[100vh] overflow-hidden bg-black" dir={dir}>
      {/* Top bar — overlay on the video (like TikTok) */}
      <div className="fixed top-0 left-0 right-0 z-[50] flex items-center gap-3 px-3 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button
          onClick={safeBack}
          className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-sm flex items-center gap-1.5 drop-shadow-lg">
            <Video className="w-4 h-4 text-orange-500" />
            {userInfo?.name || 'مستخدم'}
          </h1>
          <p className="text-white/70 text-[10px] drop-shadow-lg">
            {videos.length} فيديو
          </p>
        </div>
        <button
          onClick={loadVideos}
          className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex items-center justify-center h-full px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <Video className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-white font-bold text-sm mb-1">لا توجد فيديوهات</p>
            <p className="text-white/50 text-xs mb-6">
              {isOwnProfile ? 'ابدأ بنشر فيديوهاتك في سوق لايف' : 'هذا المستخدم لم ينشر فيديوهات بعد'}
            </p>
            {isOwnProfile && (
              <button
                onClick={() => navigate('/market-live')}
                className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                نشر فيديو
              </button>
            )}
          </motion.div>
        </div>
      ) : (
        /* ─── TikTok-style full-screen snap scrolling feed ─── */
        <div
          ref={feedRef}
          onScroll={handleScroll}
          className="overflow-y-auto snap-y snap-mandatory scrollbar-hide h-[100vh]"
          style={{
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {videos.map((video, index) => (
            <div key={video.id || index} style={{ scrollSnapAlign: 'start' }}>
              <UserVideoCard
                video={video}
                isActive={index === currentVideoIndex}
                darkMode={darkMode}
                dir={dir}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted(prev => !prev)}
                authorInfo={userInfo}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
