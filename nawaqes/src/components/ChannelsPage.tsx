// ─── Channels Page (TikTok-style vertical feed) ──────────────────────
// Full-screen live streams + recorded videos in a vertical scrolling feed.
// Right-side action bar (avatar+follow, like, comment, save, gift, share).
// Bottom host info card (avatar, name, verified, followers, follow + msg).
// Top LIVE badge + search.
//
// 🔧 Backend is being rebuilt — this UI gracefully handles empty state
//    and will start working once /api/channels/feed is implemented.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Search, X, Heart, MessageCircle, Bookmark, Share2,
  UserPlus, Mail, BadgeCheck, Gift, Video, Play, Eye, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────
interface StreamItem {
  id: string;
  type: 'live' | 'video';
  title: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  // Host info
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  hostVerified?: boolean;
  followersCount?: number;
  isFollowing?: boolean;
  // Engagement
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  viewers?: number;
  // Gifts
  giftCount?: number;
  // State
  liked?: boolean;
  saved?: boolean;
}

// ─── Mock data (used until backend is implemented) ───────────────────
const MOCK_STREAMS: StreamItem[] = [];

// ─── Gift catalog (will be fetched from /api/channels/gifts/catalog) ──
const GIFT_CATALOG = [
  { id: 'heart',   icon: '❤️', name: 'قلب',     amount: 5 },
  { id: 'rose',    icon: '🌹', name: 'وردة',    amount: 10 },
  { id: 'star',    icon: '⭐', name: 'نجمة',    amount: 25 },
  { id: 'coffee',  icon: '☕', name: 'قهوة',    amount: 50 },
  { id: 'fire',    icon: '🔥', name: 'نار',     amount: 100 },
  { id: 'rocket',  icon: '🚀', name: 'صاروخ',  amount: 250 },
  { id: 'crown',   icon: '👑', name: 'تاج',     amount: 500 },
  { id: 'diamond', icon: '💎', name: 'ماس',     amount: 1000 },
];

// ─── Page ─────────────────────────────────────────────────────────────
export const ChannelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [streams, setStreams] = useState<StreamItem[]>(MOCK_STREAMS);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Engagement state per stream (in-memory)
  const [engagement, setEngagement] = useState<Record<string, { liked: boolean; saved: boolean; likes: number; saves: number; comments: number; shares: number }>>({});
  const [followState, setFollowState] = useState<Record<string, boolean>>({});

  // Gift modal
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftSending, setGiftSending] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Floating gifts (animation when sending)
  const [floatingGifts, setFloatingGifts] = useState<{ id: number; icon: string; name: string }[]>([]);

  // Chat (comments)
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; user: string; text: string; avatar?: string }[]>([]);
  const [chatText, setChatText] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Load feed ─────────────────────────────────────────────────────
  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // 🔧 TODO: replace with real backend once it's rebuilt
      // const res = await fetch('/api/channels/feed');
      // const data = await res.json();
      // setStreams(data.streams || []);
      setStreams(MOCK_STREAMS);
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Fetch wallet balance for gift modal
  useEffect(() => {
    if (showGiftModal) {
      // 🔧 TODO: api.getWalletBalance()
      setWalletBalance(0);
    }
  }, [showGiftModal]);

  // ─── Engagement handlers ───────────────────────────────────────────
  const currentStream = streams[currentIndex];

  const handleLike = () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    const liked = !cur.liked;
    setEngagement(prev => ({
      ...prev,
      [currentStream.id]: { ...cur, liked, likes: cur.likes + (liked ? 1 : -1) },
    }));
    // 🔧 TODO: api.likeStream(currentStream.id)
  };

  const handleSave = () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    const saved = !cur.saved;
    setEngagement(prev => ({
      ...prev,
      [currentStream.id]: { ...cur, saved, saves: cur.saves + (saved ? 1 : -1) },
    }));
    // 🔧 TODO: api.saveStream(currentStream.id)
    toast.success(saved ? 'تم الحفظ ✓' : 'تم إزالة الحفظ');
  };

  const handleShare = async () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    setEngagement(prev => ({
      ...prev,
      [currentStream.id]: { ...cur, shares: cur.shares + 1 },
    }));
    try {
      if (navigator.share) {
        await navigator.share({
          title: currentStream.title || 'بث مباشر على نواقص',
          url: window.location.href,
        });
      } else {
        navigator.clipboard?.writeText(window.location.href);
        toast.success('تم نسخ الرابط ✓');
      }
    } catch {}
  };

  const handleFollow = () => {
    if (!currentStream) return;
    const isFollowing = !followState[currentStream.hostId];
    setFollowState(prev => ({ ...prev, [currentStream.hostId]: isFollowing }));
    // 🔧 TODO: api.followUser(currentStream.hostId)
    toast.success(isFollowing ? `تتابع ${currentStream.hostName} الآن ✓` : 'تم إلغاء المتابعة');
  };

  const handleMessage = () => {
    if (!currentStream) return;
    // 🔧 TODO: api.startChatWithUser(currentStream.hostId) → navigate(`/messages/${chatId}`)
    toast.info('سيتم تفعيل الرسائل قريباً');
  };

  const handleSendGift = async (gift: typeof GIFT_CATALOG[0]) => {
    if (!currentStream) return;
    if (walletBalance !== null && walletBalance < gift.amount) {
      toast.error(`رصيد غير كافٍ — تحتاج ${gift.amount} ج.م`);
      return;
    }
    setGiftSending(true);
    try {
      // 🔧 TODO: api.sendStreamGift(currentStream.id, gift.id, gift.amount)
      await new Promise(r => setTimeout(r, 600)); // simulate API
      if (walletBalance !== null) setWalletBalance(walletBalance - gift.amount);
      // Spawn floating gift animation
      const id = Date.now() + Math.random();
      setFloatingGifts(prev => [...prev, { id, icon: gift.icon, name: gift.name }]);
      setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== id)), 4000);
      toast.success(`تم إرسال ${gift.icon} ${gift.name}!`);
      setShowGiftModal(false);
    } catch (err: any) {
      toast.error('فشل إرسال الهدية');
    } finally {
      setGiftSending(false);
    }
  };

  const handleSendChat = () => {
    if (!chatText.trim() || !currentStream) return;
    const msg = { id: Date.now().toString(), user: 'أنت', text: chatText.trim() };
    setChatMessages(prev => [...prev, msg]);
    setChatText('');
    // 🔧 TODO: api.sendStreamChat(currentStream.id, text)
  };

  // ─── Vertical scroll (between streams) ─────────────────────────────
  const goToStream = (idx: number) => {
    if (idx < 0 || idx >= streams.length) return;
    setCurrentIndex(idx);
    setShowChat(false);
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToStream(currentIndex + (e.key === 'ArrowDown' ? 1 : -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, streams.length]);

  // ─── Format helpers ────────────────────────────────────────────────
  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black overflow-hidden select-none"
      dir={dir}
      style={{ touchAction: 'pan-y' }}
    >
      {/* ═══ Top bar ═══ */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 pt-4 pb-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center active:scale-90"
            aria-label="رجوع"
          >
            <ChevronDown className="w-5 h-5 text-white rotate-45" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full">
            <Radio className="w-4 h-4 text-white animate-pulse" />
            <span className="text-white text-xs font-black">LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(s => !s)}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center active:scale-90"
            aria-label="بحث"
          >
            <Search className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 inset-x-4 z-40 bg-gray-900/95 backdrop-blur rounded-2xl p-3 border border-gray-700"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن بث أو قناة..."
                className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
              />
              <button onClick={() => { setShowSearch(false); setSearch(''); }}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Empty state (no streams) ═══ */}
      {streams.length === 0 && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center mb-6"
          >
            <Radio className="w-12 h-12 text-purple-400" />
          </motion.div>
          <h2 className="text-white text-2xl font-black mb-2">لا يوجد بث مباشر الآن</h2>
          <p className="text-gray-400 text-sm mb-8">كن أول من يبدأ البث على نواقص!</p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => toast.info('سيتم تفعيل البث المباشر قريباً')}
            className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-600 text-white font-black text-sm shadow-lg shadow-purple-500/30 flex items-center gap-2"
          >
            <Video className="w-5 h-5" />
            ابدأ بثك المباشر
          </motion.button>
        </div>
      )}

      {/* ═══ Loading state ═══ */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        </div>
      )}

      {/* ═══ Current stream (full-screen video) ═══ */}
      {currentStream && (
        <div className="absolute inset-0">
          {/* Video / thumbnail */}
          {currentStream.videoUrl ? (
            <video
              key={currentStream.id}
              src={currentStream.videoUrl}
              poster={currentStream.thumbnailUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full bg-gradient-to-br from-purple-900 via-gray-900 to-pink-900"
              style={currentStream.thumbnailUrl ? {
                backgroundImage: `url(${currentStream.thumbnailUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            />
          )}
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

          {/* LIVE badge top-center */}
          {currentStream.type === 'live' && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
              <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full shadow-lg">
                <Radio className="w-3.5 h-3.5 text-white animate-pulse" />
                <span className="text-white text-xs font-black">مباشر</span>
                {currentStream.viewers !== undefined && (
                  <span className="text-white/80 text-xs">· {formatCount(currentStream.viewers)}</span>
                )}
              </div>
            </div>
          )}

          {/* ═══ Right-side vertical action bar (TikTok style) ═══ */}
          <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center gap-5">
            {/* Avatar + follow */}
            <div className="relative mb-2">
              <img
                src={currentStream.hostAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentStream.hostId}`}
                alt={currentStream.hostName}
                className="w-12 h-12 rounded-full border-2 border-white object-cover bg-gray-700"
              />
              {!followState[currentStream.hostId] && (
                <button
                  onClick={handleFollow}
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center shadow-lg active:scale-90"
                  aria-label="متابعة"
                >
                  <UserPlus className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>

            {/* Like */}
            <button onClick={handleLike} className="flex flex-col items-center gap-1 active:scale-90">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                <Heart
                  className={`w-7 h-7 ${(engagement[currentStream.id]?.liked) ? 'text-red-500 fill-red-500' : 'text-white'}`}
                />
              </div>
              <span className="text-white text-[11px] font-bold drop-shadow-lg">
                {formatCount(engagement[currentStream.id]?.likes ?? currentStream.likes)}
              </span>
            </button>

            {/* Comment */}
            <button onClick={() => setShowChat(s => !s)} className="flex flex-col items-center gap-1 active:scale-90">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <span className="text-white text-[11px] font-bold drop-shadow-lg">
                {formatCount(engagement[currentStream.id]?.comments ?? currentStream.comments)}
              </span>
            </button>

            {/* Save */}
            <button onClick={handleSave} className="flex flex-col items-center gap-1 active:scale-90">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                <Bookmark
                  className={`w-7 h-7 ${(engagement[currentStream.id]?.saved) ? 'text-yellow-400 fill-yellow-400' : 'text-white'}`}
                />
              </div>
              <span className="text-white text-[11px] font-bold drop-shadow-lg">
                {formatCount(engagement[currentStream.id]?.saves ?? currentStream.saves)}
              </span>
            </button>

            {/* Gift (purple) */}
            <button
              onClick={() => setShowGiftModal(true)}
              className="flex flex-col items-center gap-1 active:scale-90"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/40">
                <Gift className="w-7 h-7 text-white" />
              </div>
              <span className="text-white text-[11px] font-bold drop-shadow-lg">هدية</span>
            </button>

            {/* Share */}
            <button onClick={handleShare} className="flex flex-col items-center gap-1 active:scale-90">
              <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
                <Share2 className="w-7 h-7 text-white" />
              </div>
              <span className="text-white text-[11px] font-bold drop-shadow-lg">
                {formatCount(engagement[currentStream.id]?.shares ?? currentStream.shares)}
              </span>
            </button>
          </div>

          {/* ═══ Bottom host info card ═══ */}
          <div className="absolute bottom-0 inset-x-0 z-20 p-4 pb-6">
            <div className="flex items-center gap-3 mb-3">
              <img
                src={currentStream.hostAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentStream.hostId}`}
                alt={currentStream.hostName}
                className="w-10 h-10 rounded-full border-2 border-purple-500 object-cover bg-gray-700"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-white text-sm font-black truncate">@{currentStream.hostName}</span>
                  {currentStream.hostVerified && <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0" />}
                </div>
                <span className="text-gray-300 text-xs">{formatCount(currentStream.followersCount ?? 0)} متابع</span>
              </div>
              <button
                onClick={handleFollow}
                className={`px-4 py-1.5 rounded-full text-xs font-black ${
                  followState[currentStream.hostId]
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                }`}
              >
                {followState[currentStream.hostId] ? 'متابَع' : 'متابعة'}
              </button>
              <button
                onClick={handleMessage}
                className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow-lg active:scale-90"
                aria-label="رسالة"
              >
                <Mail className="w-4 h-4 text-white" />
              </button>
            </div>
            {currentStream.title && (
              <p className="text-white text-sm font-bold mb-1 line-clamp-2">{currentStream.title}</p>
            )}
            {currentStream.description && (
              <p className="text-gray-300 text-xs line-clamp-2">{currentStream.description}</p>
            )}
          </div>

          {/* ═══ Floating gifts (animation) ═══ */}
          {floatingGifts.map(g => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 100, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -200, scale: 0.3 }}
              transition={{ duration: 4, ease: 'easeOut' }}
              className="absolute left-1/2 -translate-x-1/2 top-1/3 z-30 flex flex-col items-center pointer-events-none"
            >
              <span className="text-6xl drop-shadow-2xl">{g.icon}</span>
              <span className="mt-2 px-3 py-1 rounded-full bg-black/70 text-white text-xs font-bold">
                {g.name}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* ═══ Navigation arrows (desktop / large screens) ═══ */}
      {streams.length > 1 && (
        <>
          <button
            onClick={() => goToStream(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur items-center justify-center disabled:opacity-30 active:scale-90"
          >
            <ChevronUp className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={() => goToStream(currentIndex + 1)}
            disabled={currentIndex === streams.length - 1}
            className="hidden md:flex absolute left-4 bottom-1/2 translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/40 backdrop-blur items-center justify-center disabled:opacity-30 active:scale-90"
          >
            <ChevronDown className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {/* ═══ Stream index indicator ═══ */}
      {streams.length > 0 && (
        <div className="absolute top-16 right-4 z-20 flex flex-col gap-1.5">
          {streams.map((_, i) => (
            <button
              key={i}
              onClick={() => goToStream(i)}
              className={`w-1 rounded-full transition-all ${
                i === currentIndex ? 'h-6 bg-pink-500' : 'h-2 bg-white/40'
              }`}
              aria-label={`البث ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* ═══ Chat panel (slide-up from bottom) ═══ */}
      <AnimatePresence>
        {showChat && currentStream && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 inset-x-0 z-40 bg-gray-900/95 backdrop-blur rounded-t-3xl border-t border-gray-700 max-h-[60vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <span className="text-white text-sm font-black">التعليقات ({chatMessages.length})</span>
              <button onClick={() => setShowChat(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 text-center text-sm py-8">لا توجد تعليقات بعد — كن أول من يعلق!</p>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <img
                      src={msg.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user}`}
                      className="w-7 h-7 rounded-full bg-gray-700 shrink-0"
                      alt={msg.user}
                    />
                    <div>
                      <span className="text-pink-400 text-xs font-bold">{msg.user}</span>
                      <p className="text-white text-sm">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-700 flex items-center gap-2">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                placeholder="أضف تعليقاً..."
                className="flex-1 bg-gray-800 text-white text-sm rounded-full px-4 py-2.5 outline-none placeholder-gray-500"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatText.trim()}
                className="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center disabled:opacity-40 active:scale-90"
              >
                <MessageCircle className="w-4 h-4 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Gift modal ═══ */}
      <AnimatePresence>
        {showGiftModal && currentStream && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGiftModal(false)}
            className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center"
          >
            <motion.div
              initial={{ y: 400 }}
              animate={{ y: 0 }}
              exit={{ y: 400 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-gray-900 rounded-t-3xl border-t border-gray-700 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-pink-400" />
                  <span className="text-white text-sm font-black">إرسال هدية إلى @{currentStream.hostName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 rounded-full bg-pink-500/10">
                    <span className="text-pink-400 text-xs font-bold">رصيدك: {walletBalance ?? '...'} ج.م</span>
                  </div>
                  <button onClick={() => setShowGiftModal(false)}>
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-4 gap-3">
                  {GIFT_CATALOG.map(gift => {
                    const canAfford = walletBalance === null || walletBalance >= gift.amount;
                    return (
                      <motion.button
                        key={gift.id}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handleSendGift(gift)}
                        disabled={!canAfford || giftSending}
                        className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all ${
                          canAfford
                            ? 'border-gray-700 bg-gray-800/50 hover:border-pink-500/50'
                            : 'border-gray-800 bg-gray-900/30 opacity-40'
                        }`}
                      >
                        <span className="text-3xl">{gift.icon}</span>
                        <span className="text-white text-[10px] font-black">{gift.name}</span>
                        <span className="text-pink-400 text-[10px] font-bold">{gift.amount} ج.م</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
