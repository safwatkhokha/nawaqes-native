import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight, SlidersHorizontal, X, Star, Heart, MessageCircle,
  MapPin, Shield, Crown, Sparkles, RefreshCw, MoreVertical,
  CheckCircle2, Ban, Flag, Eye, Send,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────
interface MatchUser {
  id: string;
  name: string;
  avatar: string;
  coverPhoto?: string;
  isVerified?: boolean;
  isTrusted?: boolean;
  trustScore?: number;
  location?: string;
  interests?: string[];
  bio?: string;
  gender?: 'male' | 'female' | null;
  age?: number | null;
  lastSeen?: string | null;
  isOnline?: boolean;
  sharedInterests?: string[];
  matchScore?: number;
  distance?: number | null;
}

interface Filters {
  ageMin: number;
  ageMax: number;
  distance: number;
  gender: 'male' | 'female' | 'all';
  interests: string[];
}

const DEFAULT_FILTERS: Filters = {
  ageMin: 18,
  ageMax: 99,
  distance: 100,
  gender: 'all',
  interests: [],
};

// ─── Component ────────────────────────────────────────────────────────
export const MatchesPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [users, setUsers] = useState<MatchUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragDirection, setDragDirection] = useState<'left' | 'right' | 'up' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Super-like quota
  const [superLikes, setSuperLikes] = useState<{ used: number; remaining: number; limit: number }>({ used: 0, remaining: 3, limit: 3 });

  // Match modal
  const [matchModal, setMatchModal] = useState<{
    matchId: string;
    user: MatchUser;
  } | null>(null);
  const [quickMessage, setQuickMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Card menu (3-dots)
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  // Profile preview modal
  const [profilePreview, setProfilePreview] = useState<MatchUser | null>(null);

  // Photo viewer (full-screen)
  const [photoViewer, setPhotoViewer] = useState<MatchUser | null>(null);

  // Action in-flight (prevents double swipe while the API call resolves)
  const [actingFor, setActingFor] = useState<string | null>(null);

  // ─── Theme helpers ────────────────────────────────────────────────
  const bg = darkMode ? 'bg-gray-950' : 'bg-gradient-to-b from-rose-50 via-orange-50 to-amber-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBorder = darkMode ? 'border-gray-700' : 'border-gray-200';
  const inputBg = darkMode
    ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500'
    : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400';

  // ─── Load potential matches ───────────────────────────────────────
  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMatches({
        ageMin: appliedFilters.ageMin,
        ageMax: appliedFilters.ageMax,
        distance: appliedFilters.distance,
        gender: appliedFilters.gender,
        interests: appliedFilters.interests,
      });
      setUsers(Array.isArray(list) ? list : []);
      setCurrentIndex(0);
    } catch (err: any) {
      criticalError(err?.message || 'فشل تحميل المطابقات');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  // ─── Load super-like quota ────────────────────────────────────────
  const loadSuperLikes = useCallback(async () => {
    try {
      const data = await api.getSuperLikeCount();
      setSuperLikes(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadMatches();
    loadSuperLikes();
  }, [loadMatches, loadSuperLikes]);

  // ─── Current candidate (top of stack) ─────────────────────────────
  const current = users[currentIndex];
  const next = users[currentIndex + 1];
  const after = users[currentIndex + 2];

  // ─── Shared interests helper ──────────────────────────────────────
  const myInterests = useMemo(() => currentUser?.interests || [], [currentUser?.interests]);
  const getSharedInterests = useCallback(
    (u?: MatchUser): string[] => {
      if (!u) return [];
      if (Array.isArray(u.sharedInterests) && u.sharedInterests.length) return u.sharedInterests;
      const theirs = u.interests || [];
      return myInterests.filter(i => theirs.includes(i));
    },
    [myInterests]
  );

  // ─── Swipe handlers ───────────────────────────────────────────────
  const advance = useCallback(() => {
    setDragDirection(null);
    setActingFor(null);
    setMenuOpenFor(null);
    setCurrentIndex(i => i + 1);
  }, []);

  const performAction = useCallback(
    async (user: MatchUser, action: 'like' | 'pass' | 'superlike') => {
      if (!user || actingFor === user.id) return;
      if (action === 'superlike' && superLikes.remaining <= 0) {
        criticalError('لقد استخدمت كل الإعجابات المميزة لهذا اليوم');
        return;
      }
      setActingFor(user.id);
      setDragDirection(action === 'like' ? 'right' : action === 'pass' ? 'left' : 'up');
      try {
        const res =
          action === 'like' ? await api.likeMatch(user.id)
          : action === 'pass' ? await api.passMatch(user.id)
          : await api.superLikeMatch(user.id);
        if (action === 'superlike') {
          setSuperLikes(s => ({ used: s.used + 1, remaining: Math.max(0, s.remaining - 1), limit: s.limit }));
        }
        if (res?.matched && res.matchId) {
          // Show match modal after the card flies away
          const matchId = res.matchId;
          const matchedUser = user;
          setTimeout(() => {
            setMatchModal({ matchId, user: matchedUser });
          }, 280);
        }
      } catch (err: any) {
        criticalError(err?.message || 'فشل تنفيذ الإجراء');
      } finally {
        // Give the fly-away animation time to play
        setTimeout(advance, 280);
      }
    },
    [actingFor, superLikes.remaining, advance]
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo, user: MatchUser) => {
      const threshold = 110;
      const dx = info.offset.x;
      const dy = info.offset.y;
      if (dy < -threshold && Math.abs(dy) > Math.abs(dx)) {
        performAction(user, 'superlike');
      } else if (dx > threshold) {
        performAction(user, 'like');
      } else if (dx < -threshold) {
        performAction(user, 'pass');
      } else {
        setDragDirection(null);
      }
    },
    [performAction]
  );

  // ─── Match modal: quick message ───────────────────────────────────
  const handleSendQuickMessage = async () => {
    if (!matchModal) return;
    if (!quickMessage.trim()) return;
    setSendingMessage(true);
    try {
      await api.sendMatchMessage(matchModal.matchId, quickMessage.trim());
      toast.success('تم إرسال الرسالة');
      setMatchModal(null);
      setQuickMessage('');
      navigate('/messages');
    } catch (err: any) {
      criticalError(err?.message || 'فشل إرسال الرسالة');
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Block / Report ───────────────────────────────────────────────
  const handleBlock = async (user: MatchUser) => {
    setMenuOpenFor(null);
    if (!user) return;
    if (!window.confirm(`حظر ${user.name}؟ لن يتمكن من التواصل معك.`)) return;
    try {
      await api.blockUser(user.id);
      toast.success('تم حظر المستخدم');
      // Remove from list
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (err: any) {
      criticalError(err?.message || 'فشل حظر المستخدم');
    }
  };

  const handleReport = (user: MatchUser) => {
    setMenuOpenFor(null);
    navigate('/complaint');
  };

  // ─── Filtered interest list ───────────────────────────────────────
  const interestOptions = useMemo(() => interestCategories.map(c => ({ id: c.id, nameKey: c.nameKey, icon: c.icon })), []);

  const toggleInterestFilter = (id: string) => {
    setFilters(f => ({
      ...f,
      interests: f.interests.includes(id) ? f.interests.filter(i => i !== id) : [...f.interests, id],
    }));
  };

  const applyFilters = () => {
    setAppliedFilters(filters);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setShowFilters(false);
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen flex flex-col ${bg} relative overflow-hidden`} dir={dir}>
      {/* ─── Top Bar ──────────────────────────────────────────────── */}
      <header className={`flex-shrink-0 px-3 sm:px-5 pt-3 sm:pt-4 pb-2 z-30 ${darkMode ? 'bg-gray-900/80' : 'bg-white/70'} backdrop-blur-xl border-b ${cardBorder}`}>
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            aria-label="رجوع"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center">
            <h1 className={`text-lg sm:text-xl font-black flex items-center justify-center gap-1.5 ${textPrimary}`}>
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
              متوافق معي
            </h1>
            <p className={`text-[10px] font-bold ${textMuted}`}>
              {users.length > 0 ? `${users.length - currentIndex} شخص متاح` : 'اكتشف أشخاصاً يشاركونك الاهتمامات'}
            </p>
          </div>
          <button
            onClick={() => { setFilters(appliedFilters); setShowFilters(true); }}
            className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            aria-label="فلاتر"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {appliedFilters.gender !== 'all' || appliedFilters.interests.length > 0 || appliedFilters.ageMax !== DEFAULT_FILTERS.ageMax || appliedFilters.ageMin !== DEFAULT_FILTERS.ageMin ? (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-rose-500 rounded-full border-2 border-white" />
            ) : null}
          </button>
        </div>
      </header>

      {/* ─── Card Stack ───────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-3 sm:px-5 py-3 min-h-0 relative">
        <div className="relative w-full max-w-md aspect-[3/4.4] sm:aspect-[3/4] max-h-[68vh] sm:max-h-[72vh]">
          {loading ? (
            <div className={`absolute inset-0 rounded-3xl border ${cardBorder} ${darkMode ? 'bg-gray-800' : 'bg-white'} flex flex-col items-center justify-center gap-3 shadow-2xl`}>
              <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
              <p className={`text-xs font-bold ${textMuted}`}>جاري تحميل المطابقات…</p>
            </div>
          ) : users.length === 0 || currentIndex >= users.length ? (
            <EmptyState
              darkMode={darkMode}
              onRefresh={() => { loadMatches(); loadSuperLikes(); }}
              hasInterests={myInterests.length > 0}
              onAddInterests={() => navigate('/profile')}
            />
          ) : (
            <>
              {/* Background cards (peek effect) */}
              {after && (
                <CardPeek key={`peek2-${after.id}`} user={after} darkMode={darkMode} depth={2} />
              )}
              {next && (
                <CardPeek key={`peek1-${next.id}`} user={next} darkMode={darkMode} depth={1} />
              )}

              {/* Top draggable card */}
              <AnimatePresence>
                {current && (
                  <SwipeCard
                    key={current.id}
                    user={current}
                    darkMode={darkMode}
                    dragDirection={actingFor === current.id ? dragDirection : null}
                    onDragEnd={(e, info) => handleDragEnd(e, info, current)}
                    onOpenMenu={() => setMenuOpenFor(menuOpenFor === current.id ? null : current.id)}
                    menuOpen={menuOpenFor === current.id}
                    onBlock={() => handleBlock(current)}
                    onReport={() => handleReport(current)}
                    onViewProfile={() => setProfilePreview(current)}
                    onPhotoClick={() => setPhotoViewer(current)}
                    myInterests={myInterests}
                    sharedInterests={getSharedInterests(current)}
                  />
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </main>

      {/* ─── Action Buttons ───────────────────────────────────────── */}
      {!loading && current && currentIndex < users.length && (
        <footer className="flex-shrink-0 px-3 sm:px-5 pb-4 sm:pb-6 pt-2 z-20">
          <div className="max-w-md mx-auto flex items-center justify-center gap-3 sm:gap-4">
            <ActionButton
              onClick={() => performAction(current, 'pass')}
              size="md"
              color="red"
              ariaLabel="رفض"
              icon={<X className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={3} />}
              disabled={actingFor === current.id}
            />
            <ActionButton
              onClick={() => performAction(current, 'superlike')}
              size="sm"
              color="blue"
              ariaLabel="إعجاب مميز"
              icon={<Star className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} fill={superLikes.remaining > 0 ? 'currentColor' : 'none'} />}
              disabled={actingFor === current.id || superLikes.remaining <= 0}
              badge={superLikes.remaining > 0 ? superLikes.remaining : undefined}
            />
            <ActionButton
              onClick={() => performAction(current, 'like')}
              size="lg"
              color="green"
              ariaLabel="إعجاب"
              icon={<Heart className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={2.5} fill="currentColor" />}
              disabled={actingFor === current.id}
            />
            <ActionButton
              onClick={() => navigate('/messages')}
              size="sm"
              color="sky"
              ariaLabel="رسائل"
              icon={<MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} />}
            />
          </div>
          <p className={`text-center text-[10px] font-bold mt-2.5 ${textMuted}`}>
            اسحب يميناً للإعجاب · يساراً للرفض · لأعلى للإعجاب المميز
          </p>
        </footer>
      )}

      {/* ─── Filters Sheet ────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilters && (
          <FiltersSheet
            darkMode={darkMode}
            filters={filters}
            setFilters={setFilters}
            interestOptions={interestOptions}
            onApply={applyFilters}
            onReset={resetFilters}
            onClose={() => setShowFilters(false)}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* ─── Match Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {matchModal && (
          <MatchModal
            darkMode={darkMode}
            me={currentUser}
            user={matchModal.user}
            quickMessage={quickMessage}
            setQuickMessage={setQuickMessage}
            sending={sendingMessage}
            onSend={handleSendQuickMessage}
            onClose={() => { setMatchModal(null); setQuickMessage(''); }}
            onChatLater={() => { setMatchModal(null); setQuickMessage(''); navigate('/messages'); }}
          />
        )}
      </AnimatePresence>

      {/* ─── Profile Preview Modal ────────────────────────────────── */}
      <AnimatePresence>
        {profilePreview && (
          <ProfilePreviewModal
            user={profilePreview}
            darkMode={darkMode}
            myInterests={myInterests}
            sharedInterests={getSharedInterests(profilePreview)}
            onClose={() => setProfilePreview(null)}
            onOpenPhoto={() => { setPhotoViewer(profilePreview); setProfilePreview(null); }}
            onMessage={() => { setProfilePreview(null); navigate('/messages'); }}
          />
        )}
      </AnimatePresence>

      {/* ─── Photo Viewer ─────────────────────────────────────────── */}
      <AnimatePresence>
        {photoViewer && (
          <PhotoViewer
            user={photoViewer}
            onClose={() => setPhotoViewer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Swipe Card Component ─────────────────────────────────────────────
const SwipeCard: React.FC<{
  user: MatchUser;
  darkMode: boolean;
  dragDirection: 'left' | 'right' | 'up' | null;
  onDragEnd: (e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onBlock: () => void;
  onReport: () => void;
  onViewProfile: () => void;
  onPhotoClick: () => void;
  myInterests: string[];
  sharedInterests: string[];
}> = ({ user, darkMode, dragDirection, onDragEnd, onOpenMenu, menuOpen, onBlock, onReport, onViewProfile, onPhotoClick, sharedInterests }) => {
  const { t } = useTranslation();
  const cover = user.coverPhoto || user.avatar;
  const score = user.matchScore ?? 0;
  const isSuperLikeDir = dragDirection === 'up';
  const isLikeDir = dragDirection === 'right';
  const isPassDir = dragDirection === 'left';

  const flyAway = dragDirection !== null;
  const flyX = flyAway ? (dragDirection === 'right' ? 600 : dragDirection === 'left' ? -600 : 0) : 0;
  const flyY = flyAway && dragDirection === 'up' ? -700 : 0;
  const flyRotate = flyAway ? (dragDirection === 'right' ? 30 : dragDirection === 'left' ? -30 : 0) : 0;

  return (
    <motion.div
      className="absolute inset-0"
      drag={flyAway ? false : true}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.7}
      onDragEnd={onDragEnd}
      initial={{ scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 }}
      animate={flyAway ? { x: flyX, y: flyY, rotate: flyRotate, opacity: 0, transition: { duration: 0.28, ease: 'easeIn' } } : { scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileTap={flyAway ? undefined : { cursor: 'grabbing' }}
      style={{ zIndex: 30 }}
    >
      <div className={`relative w-full h-full rounded-3xl overflow-hidden shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        {/* Cover Image (70% height) */}
        <button
          type="button"
          onClick={onPhotoClick}
          className="absolute inset-x-0 top-0 h-[70%] block overflow-hidden focus:outline-none"
          aria-label="عرض الصورة"
        >
          {cover ? (
            <img
              src={cover}
              alt={user.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-rose-400 via-orange-400 to-amber-400 flex items-center justify-center">
              <Heart className="w-24 h-24 text-white/40" />
            </div>
          )}
          {/* Gradient overlay for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/40" />
        </button>

        {/* Top badges row */}
        <div className="absolute top-3 inset-x-3 flex items-start justify-between pointer-events-none">
          {/* Match percentage */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600/95 text-white shadow-lg pointer-events-auto">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs font-black">{score}% متوافق</span>
          </div>
          {/* 3-dots menu */}
          <div className="relative pointer-events-auto">
            <button
              onClick={onOpenMenu}
              className="w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 transition-colors"
              aria-label="المزيد"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -6 }}
                  className={`absolute top-full mt-1 left-0 rounded-xl border shadow-2xl py-1 min-w-[160px] z-50 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                >
                  <MenuItem darkMode={darkMode} icon={<Eye className="w-4 h-4" />} label="عرض الملف" onClick={() => { onOpenMenu(); onViewProfile(); }} />
                  <MenuItem darkMode={darkMode} icon={<Ban className="w-4 h-4" />} label="حظر" danger onClick={() => { onOpenMenu(); onBlock(); }} />
                  <MenuItem darkMode={darkMode} icon={<Flag className="w-4 h-4" />} label="إبلاغ" danger onClick={() => { onOpenMenu(); onReport(); }} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Drag indicator overlays */}
        <AnimatePresence>
          {isLikeDir && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: -15 }}
              exit={{ opacity: 0 }}
              className="absolute top-12 left-6 z-40 px-4 py-2 rounded-2xl border-4 border-green-500 text-green-500 font-black text-2xl flex items-center gap-2"
            >
              <Heart className="w-7 h-7" fill="currentColor" /> إعجاب
            </motion.div>
          )}
          {isPassDir && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, rotate: 20 }}
              animate={{ opacity: 1, scale: 1, rotate: 15 }}
              exit={{ opacity: 0 }}
              className="absolute top-12 right-6 z-40 px-4 py-2 rounded-2xl border-4 border-red-500 text-red-500 font-black text-2xl flex items-center gap-2"
            >
              <X className="w-7 h-7" strokeWidth={3} /> رفض
            </motion.div>
          )}
          {isSuperLikeDir && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl border-4 border-blue-500 text-blue-500 font-black text-2xl flex items-center gap-2"
            >
              <Star className="w-7 h-7" fill="currentColor" /> مميز
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom info section */}
        <div className="absolute bottom-0 inset-x-0 p-4 text-white">
          {/* Name + age + verified */}
          <div className="flex items-center gap-2 mb-1.5">
            <h2 className="text-xl font-black truncate">{user.name}</h2>
            {user.age != null && <span className="text-base font-bold opacity-90">{user.age}</span>}
            {user.isVerified && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-sky-500 rounded-full" title="موثق">
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              </span>
            )}
            {user.isTrusted && (
              <span className="inline-flex items-center justify-center w-5 h-5 bg-amber-500 rounded-full" title="موثوق">
                <Crown className="w-3.5 h-3.5 text-white" />
              </span>
            )}
            {user.isOnline && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-300">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> متصل
              </span>
            )}
          </div>

          {/* Location + distance */}
          {(user.location || user.distance != null) && (
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold opacity-90">
              <MapPin className="w-3.5 h-3.5" />
              {user.location && <span>{user.location}</span>}
              {user.distance != null && (
                <span className="opacity-80">
                  {user.distance === 0 ? '· نفس المنطقة' : `· ${user.distance} كم`}
                </span>
              )}
            </div>
          )}

          {/* Bio */}
          {user.bio && (
            <p className="text-xs opacity-90 mb-2.5 line-clamp-2 leading-relaxed">{user.bio}</p>
          )}

          {/* Trust score */}
          {user.trustScore != null && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <Shield className="w-3.5 h-3.5 opacity-80" />
              <div className="flex-1 h-1.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(user.trustScore, 100)}%`,
                    background: user.trustScore >= 70 ? '#22c55e' : user.trustScore >= 40 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>
              <span className="text-[10px] font-black">ن الثقة {user.trustScore}%</span>
            </div>
          )}

          {/* Interests chips */}
          {user.interests && user.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {user.interests.slice(0, 6).map(interest => {
                const isShared = sharedInterests.includes(interest);
                const cfg = interestCategories.find(c => c.id === interest);
                return (
                  <span
                    key={interest}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                      isShared
                        ? 'bg-rose-500 text-white shadow'
                        : 'bg-white/15 text-white border border-white/20'
                    }`}
                  >
                    {cfg?.icon && <span>{cfg.icon}</span>}
                    {t(cfg?.nameKey || `interests.${interest}`, interest)}
                    {isShared && <Heart className="w-2.5 h-2.5" fill="currentColor" />}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Card Peek (background card) ──────────────────────────────────────
const CardPeek: React.FC<{ user: MatchUser; darkMode: boolean; depth: number }> = ({ user, darkMode, depth }) => {
  const scale = depth === 2 ? 0.88 : 0.94;
  const y = depth === 2 ? 24 : 12;
  const cover = user.coverPhoto || user.avatar;
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={false}
      animate={{ scale, y, opacity: depth === 2 ? 0.6 : 0.85 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      style={{ zIndex: 30 - depth * 5 }}
    >
      <div className={`relative w-full h-full rounded-3xl overflow-hidden shadow-xl ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border`}>
        {cover ? (
          <img src={cover} alt={user.name} className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-rose-300 via-orange-300 to-amber-300" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
    </motion.div>
  );
};

// ─── Action Button ────────────────────────────────────────────────────
const ACTION_SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-12 h-12 sm:w-14 sm:h-14',
  md: 'w-14 h-14 sm:w-16 sm:h-16',
  lg: 'w-16 h-16 sm:w-20 sm:h-20',
};
const ACTION_COLORS: Record<'red' | 'green' | 'blue' | 'sky', { bg: string; shadow: string; border: string }> = {
  red:   { bg: 'bg-gradient-to-br from-red-400 to-rose-500 text-white',         shadow: 'shadow-red-500/40',   border: 'border-white/60' },
  green: { bg: 'bg-gradient-to-br from-green-400 to-emerald-500 text-white',    shadow: 'shadow-green-500/40', border: 'border-white/30' },
  blue:  { bg: 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white',      shadow: 'shadow-blue-500/40',  border: 'border-white/30' },
  sky:   { bg: 'bg-gradient-to-br from-sky-400 to-cyan-500 text-white',         shadow: 'shadow-sky-500/40',   border: 'border-white/30' },
};
const ActionButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  size: 'sm' | 'md' | 'lg';
  color: 'red' | 'green' | 'blue' | 'sky';
  ariaLabel: string;
  disabled?: boolean;
  badge?: number;
}> = ({ onClick, icon, size, color, ariaLabel, disabled, badge }) => {
  const c = ACTION_COLORS[color];
  return (
    <div className="relative">
      <motion.button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        whileTap={{ scale: 0.85 }}
        whileHover={{ scale: disabled ? 1 : 1.06 }}
        className={`${ACTION_SIZES[size]} ${c.bg} ${c.shadow} shadow-xl rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 ${c.border}`}
      >
        {icon}
      </motion.button>
      {badge != null && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
          {badge}
        </span>
      )}
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────
const EmptyState: React.FC<{ darkMode: boolean; onRefresh: () => void; hasInterests: boolean; onAddInterests: () => void }> = ({ darkMode, onRefresh, hasInterests, onAddInterests }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`absolute inset-0 rounded-3xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} flex flex-col items-center justify-center gap-4 p-6 text-center shadow-2xl`}
  >
    <motion.div
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      className={`w-24 h-24 rounded-full flex items-center justify-center ${darkMode ? 'bg-rose-900/40' : 'bg-rose-100'}`}
    >
      <Heart className={`w-12 h-12 ${darkMode ? 'text-rose-400' : 'text-rose-500'}`} />
    </motion.div>
    <div>
      <h3 className={`text-lg font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>لا يوجد المزيد من المطابقات</h3>
      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        {hasInterests
          ? 'جرّب توسيع نطاق البحث أو تحديث الفلاتر لاكتشاف المزيد من الأشخاص'
          : 'أضف اهتماماتك أولاً من ملفك الشخصي لنطابقك مع أشخاص يشاركونك الاهتمامات'}
      </p>
    </div>
    <div className="flex flex-col gap-2 w-full max-w-xs">
      <button
        onClick={onRefresh}
        className="w-full bg-gradient-to-l from-rose-500 to-orange-500 text-white py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition"
      >
        <RefreshCw className="w-4 h-4" /> تحديث
      </button>
      {!hasInterests && (
        <button
          onClick={onAddInterests}
          className={`w-full py-2.5 rounded-2xl font-bold text-sm ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}
        >
          إضافة اهتمامات
        </button>
      )}
    </div>
  </motion.div>
);

// ─── Filters Sheet ────────────────────────────────────────────────────
const FiltersSheet: React.FC<{
  darkMode: boolean;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  interestOptions: { id: string; nameKey: string; icon: string }[];
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  t: any;
}> = ({ darkMode, filters, setFilters, interestOptions, onApply, onReset, onClose, t }) => {
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl ${cardBg} max-h-[88vh] flex flex-col`}
      >
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-rose-500" />
            <h3 className={`font-black text-base ${textPrimary}`}>الفلاتر</h3>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-5">
          {/* Age range */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-bold ${textMuted}`}>العمر</label>
              <span className={`text-xs font-black ${textPrimary}`}>{filters.ageMin} - {filters.ageMax === 99 ? '+99' : filters.ageMax}</span>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="range" min={18} max={99} value={filters.ageMin}
                onChange={e => setFilters(f => ({ ...f, ageMin: Math.min(Number(e.target.value), f.ageMax - 1) }))}
                className="flex-1 accent-rose-500"
              />
              <input
                type="range" min={18} max={99} value={filters.ageMax}
                onChange={e => setFilters(f => ({ ...f, ageMax: Math.max(Number(e.target.value), f.ageMin + 1) }))}
                className="flex-1 accent-rose-500"
              />
            </div>
          </div>

          {/* Distance */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-bold ${textMuted}`}>المسافة</label>
              <span className={`text-xs font-black ${textPrimary}`}>{filters.distance === 100 ? 'غير محدود' : `${filters.distance} كم`}</span>
            </div>
            <input
              type="range" min={1} max={100} value={filters.distance}
              onChange={e => setFilters(f => ({ ...f, distance: Number(e.target.value) }))}
              className="w-full accent-rose-500"
            />
          </div>

          {/* Gender */}
          <div>
            <label className={`text-xs font-bold ${textMuted} block mb-2`}>الجنس</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'all' as const, label: 'الكل' },
                { id: 'male' as const, label: 'رجال' },
                { id: 'female' as const, label: 'نساء' },
              ]).map(g => (
                <button
                  key={g.id}
                  onClick={() => setFilters(f => ({ ...f, gender: g.id }))}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    filters.gender === g.id
                      ? 'bg-gradient-to-l from-rose-500 to-orange-500 text-white shadow'
                      : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interests */}
          <div>
            <label className={`text-xs font-bold ${textMuted} block mb-2`}>الاهتمامات</label>
            <div className="flex flex-wrap gap-1.5">
              {interestOptions.map(opt => {
                const active = filters.interests.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setFilters(f => ({
                        ...f,
                        interests: f.interests.includes(opt.id)
                          ? f.interests.filter(i => i !== opt.id)
                          : [...f.interests, opt.id],
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-rose-500 text-white shadow'
                        : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span>{opt.icon}</span>
                    {t(opt.nameKey, opt.id)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button
            onClick={onReset}
            className={`flex-1 py-3 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
          >
            إعادة ضبط
          </button>
          <button
            onClick={onApply}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-l from-rose-500 to-orange-500 text-white shadow"
          >
            تطبيق
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Match Modal ──────────────────────────────────────────────────────
const MatchModal: React.FC<{
  darkMode: boolean;
  me: any;
  user: MatchUser;
  quickMessage: string;
  setQuickMessage: (s: string) => void;
  sending: boolean;
  onSend: () => void;
  onClose: () => void;
  onChatLater: () => void;
}> = ({ darkMode, me, user, quickMessage, setQuickMessage, sending, onSend, onClose, onChatLater }) => {
  const myAvatar = me?.avatar || '';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-gradient-to-br from-rose-600/95 via-pink-600/95 to-purple-700/95 backdrop-blur-md flex items-center justify-center p-4"
    >
      {/* Floating hearts */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => {
          const sizeCls = i % 3 === 0 ? 'w-6 h-6' : i % 3 === 1 ? 'w-8 h-8' : 'w-10 h-10';
          return (
            <motion.div
              key={i}
              initial={{ y: '110vh', x: `${(i * 8 + 5) % 100}%`, opacity: 0, rotate: 0 }}
              animate={{ y: '-20vh', opacity: [0, 1, 1, 0], rotate: 360 }}
              transition={{ duration: 3 + (i % 3), repeat: Infinity, delay: i * 0.4, ease: 'linear' }}
              className="absolute"
            >
              <Heart className={`${sizeCls} text-white/80`} fill="currentColor" />
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.5, opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-sm text-center text-white"
      >
        <motion.h2
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
          className="text-3xl font-black mb-1 drop-shadow-lg"
        >
          إنه تطابق! 🎉
        </motion.h2>
        <p className="text-white/90 text-sm font-bold mb-6">أنت و{user.name} أعجبتما ببعضكما</p>

        {/* Avatar pair */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <motion.div
            initial={{ x: -80, opacity: 0, rotate: -15 }}
            animate={{ x: 0, opacity: 1, rotate: -8 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="relative"
          >
            <img src={myAvatar} alt="أنت" className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-2xl" />
            <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-white text-rose-600 text-[10px] font-black">أنت</span>
          </motion.div>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.45, type: 'spring', stiffness: 250, damping: 12 }}
            className="text-white"
          >
            <Heart className="w-12 h-12" fill="currentColor" />
          </motion.div>
          <motion.div
            initial={{ x: 80, opacity: 0, rotate: 15 }}
            animate={{ x: 0, opacity: 1, rotate: 8 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="relative"
          >
            <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-2xl" />
            <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-white text-rose-600 text-[10px] font-black truncate max-w-[80px]">{user.name}</span>
          </motion.div>
        </div>

        {/* Quick message */}
        <div className="bg-white/95 rounded-2xl p-3 mb-4 shadow-xl">
          <p className="text-gray-700 text-xs font-bold mb-2">أرسل رسالة سريعة</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickMessage}
              onChange={e => setQuickMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !sending) onSend(); }}
              placeholder="مرحباً! يسعدني التعارف 👋"
              className="flex-1 bg-gray-100 text-gray-900 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-rose-400"
              autoFocus
            />
            <button
              onClick={onSend}
              disabled={sending || !quickMessage.trim()}
              className="bg-gradient-to-l from-rose-500 to-orange-500 text-white rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
              إرسال
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 bg-white/20 backdrop-blur text-white py-3 rounded-xl font-bold text-sm hover:bg-white/30 transition"
          >
            متابعة التصفح
          </button>
          <button
            onClick={onChatLater}
            className="flex-1 bg-white text-rose-600 py-3 rounded-xl font-bold text-sm hover:bg-rose-50 transition"
          >
            الذهاب للمحادثات
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Profile Preview Modal ────────────────────────────────────────────
const ProfilePreviewModal: React.FC<{
  user: MatchUser;
  darkMode: boolean;
  myInterests: string[];
  sharedInterests: string[];
  onClose: () => void;
  onOpenPhoto: () => void;
  onMessage: () => void;
}> = ({ user, darkMode, sharedInterests, onClose, onOpenPhoto, onMessage }) => {
  const { t } = useTranslation();
  const cover = user.coverPhoto || user.avatar;
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm rounded-3xl border shadow-2xl overflow-hidden ${cardBg} max-h-[90vh] flex flex-col`}
      >
        <div className="relative h-56 sm:h-64 overflow-hidden">
          {cover ? (
            <img src={cover} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-rose-400 via-orange-400 to-amber-400" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenPhoto}
            className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
            aria-label="عرض الصورة"
          >
            <Eye className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 inset-x-3 text-white">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-black">{user.name}</h3>
              {user.age != null && <span className="text-base font-bold">{user.age}</span>}
              {user.isVerified && <CheckCircle2 className="w-5 h-5 text-sky-400" />}
              {user.isTrusted && <Crown className="w-5 h-5 text-amber-400" />}
            </div>
            {(user.location || user.distance != null) && (
              <div className="flex items-center gap-1 text-xs font-bold opacity-90 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {user.location && <span>{user.location}</span>}
                {user.isOnline && <span className="text-green-300">· متصل الآن</span>}
              </div>
            )}
          </div>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {user.bio && (
            <div>
              <p className={`text-[10px] font-black ${textMuted} mb-1`}>نبذة</p>
              <p className={`text-sm leading-relaxed ${textPrimary}`}>{user.bio}</p>
            </div>
          )}
          <div>
            <p className={`text-[10px] font-black ${textMuted} mb-1.5`}>الاهتمامات</p>
            <div className="flex flex-wrap gap-1.5">
              {(user.interests || []).map(i => {
                const isShared = sharedInterests.includes(i);
                const cfg = interestCategories.find(c => c.id === i);
                return (
                  <span
                    key={i}
                    className={`text-[11px] px-2 py-1 rounded-full font-bold flex items-center gap-1 ${
                      isShared
                        ? 'bg-rose-500 text-white'
                        : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {cfg?.icon && <span>{cfg.icon}</span>}
                    {t(cfg?.nameKey || `interests.${i}`, i)}
                    {isShared && <Heart className="w-2.5 h-2.5" fill="currentColor" />}
                  </span>
                );
              })}
              {(!user.interests || user.interests.length === 0) && (
                <span className={`text-xs ${textMuted}`}>لا توجد اهتمامات</span>
              )}
            </div>
          </div>
          {user.trustScore != null && (
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${textMuted}`} />
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(user.trustScore, 100)}%`,
                    background: user.trustScore >= 70 ? '#22c55e' : user.trustScore >= 40 ? '#eab308' : '#ef4444',
                  }}
                />
              </div>
              <span className={`text-xs font-black ${textPrimary}`}>ن الثقة {user.trustScore}%</span>
            </div>
          )}
        </div>
        <div className={`p-3 border-t flex gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button
            onClick={onMessage}
            className="flex-1 bg-gradient-to-l from-rose-500 to-orange-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4" /> مراسلة
          </button>
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
          >
            إغلاق
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Photo Viewer ─────────────────────────────────────────────────────
const PhotoViewer: React.FC<{ user: MatchUser; onClose: () => void }> = ({ user, onClose }) => {
  const src = user.coverPhoto || user.avatar;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 z-10"
      >
        <X className="w-6 h-6" />
      </button>
      <motion.img
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.7, opacity: 0 }}
        src={src}
        alt={user.name}
        className="max-w-full max-h-full object-contain rounded-xl"
        onClick={e => e.stopPropagation()}
      />
      <div className="absolute bottom-6 inset-x-0 text-center text-white">
        <p className="text-lg font-bold drop-shadow">{user.name}</p>
      </div>
    </motion.div>
  );
};

// ─── Menu Item ────────────────────────────────────────────────────────
const MenuItem: React.FC<{ darkMode: boolean; icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ darkMode, icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors ${
      danger
        ? darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'
        : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
    }`}
  >
    {icon} {label}
  </button>
);

// Helper: show a critical error toast (bypasses silentToast suppression)
function criticalError(msg: string) {
  (toast as unknown as { error: (m: string, opts?: Record<string, unknown>) => void }).error(msg, { critical: true });
}

export default MatchesPage;
