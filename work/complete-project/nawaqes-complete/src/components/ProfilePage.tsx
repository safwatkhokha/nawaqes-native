import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { EmailBadge } from './EmailVerification';
import {
  ArrowRight, CheckCircle2, ShieldCheck, MapPin, Phone, Edit3, ShoppingBag,
  FileText, User as UserIcon, Calendar, Award, Camera, X, Image as ImageIcon,
  Wallet, CreditCard, Clock, Heart, Eye, TrendingUp, Lock, Users, Sparkles,
  MessageCircle, Plus, Check, Zap, BarChart3, UserPlus, UserCheck, UserX,
  Video as VideoIcon, Play, Briefcase, Save,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr, parseDBTimestamp } from '../utils/time';
import {
  interestCategories, interestGroups, getInterestsByGroup, type InterestGroup,
} from '../config/interests';
import { useSafeBack } from '../hooks/useSafeBack';
import { ImageLightbox } from './ImageLightbox';

type ProfileTab = 'posts' | 'videos' | 'ads' | 'portfolio' | 'about';

const interestColors = [
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
];

// ─── Trust Score Ring (circular progress indicator) ──────────────────
const TrustRing: React.FC<{ score: number; size?: number; darkMode: boolean }> = ({
  score, size = 64, darkMode,
}) => {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke={darkMode ? '#374151' : '#e5e7eb'} strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{score}%</span>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const {
    darkMode, posts, transactions, promotionRequests,
    acceptFriendRequest, rejectFriendRequest, friendRequests,
  } = useAppContext();
  const { currentUser, updateProfile } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // Tabs and edit mode
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [isEditing, setIsEditing] = useState(false);

  // Edit fields — comprehensive inline editing
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editBio, setEditBio] = useState(currentUser?.bio || '');
  const [editLocation, setEditLocation] = useState(currentUser?.location || '');
  const [editPhone, setEditPhone] = useState(currentUser?.phone || '');
  const [editProfession, setEditProfession] = useState((currentUser as any)?.profession || '');
  const [editDob, setEditDob] = useState(currentUser?.dateOfBirth || '');
  const [editGender, setEditGender] = useState<'male' | 'female'>(currentUser?.gender || 'male');
  const [editShowPhone, setEditShowPhone] = useState<boolean>(currentUser?.showPhone || false);
  const [editShowLocation, setEditShowLocation] = useState<boolean>(
    currentUser?.showLocation !== undefined ? currentUser.showLocation : true,
  );

  // Interests picker
  const [showInterestPicker, setShowInterestPicker] = useState(false);
  const [editInterests, setEditInterests] = useState<string[]>(currentUser?.interests || []);
  const [pickerGroup, setPickerGroup] = useState<InterestGroup | 'all'>('all');

  // Friends / followers / portfolio / videos
  const [friendsCount, setFriendsCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [myVideos, setMyVideos] = useState<any[]>([]);
  const [portfolioLightbox, setPortfolioLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<any>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  // Fetch real friends count, friend requests, portfolio, videos, followers
  useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      api.getFriendsList().catch(() => []),
      api.getFollowStatus(currentUser.id).catch(() => ({ followersCount: 0, followingCount: 0 })),
      api.getPortfolio(currentUser.id).catch(() => []),
      api.getMyVideos().catch(() => []),
    ]).then(([friends, follow, portfolio, vids]) => {
      if (Array.isArray(friends)) setFriendsCount(friends.length);
      setFollowersCount((follow as any)?.followersCount || 0);
      setFollowingCount((follow as any)?.followingCount || 0);
      if (Array.isArray(portfolio)) setPortfolioImages(portfolio);
      if (Array.isArray(vids)) setMyVideos(vids);
      else if (vids && Array.isArray((vids as any).videos)) setMyVideos((vids as any).videos);
    });
  }, [currentUser]);

  if (!currentUser) return null;

  // User content
  const userPosts = posts.filter(p => p.author.id === currentUser.id && p.type !== 'ad');
  const userAds = posts.filter(p => p.author.id === currentUser.id && p.type === 'ad');

  // Save profile changes
  const handleSaveProfile = async () => {
    try {
      await updateProfile({
        name: editName,
        location: editLocation,
        phone: editPhone,
        bio: editBio,
        showPhone: editShowPhone,
        showLocation: editShowLocation,
        profession: editProfession,
        dateOfBirth: editDob,
        gender: editGender,
      } as any);
      setIsEditing(false);
      toast.success(t('profile.profileUpdated'));
    } catch {
      toast.error(t('profile.profileUpdateFailed', 'فشل تحديث الملف الشخصي'));
    }
  };

  const startEdit = () => {
    setEditName(currentUser.name);
    setEditBio(currentUser.bio || '');
    setEditLocation(currentUser.location || '');
    setEditPhone(currentUser.phone || '');
    setEditProfession((currentUser as any).profession || '');
    setEditDob(currentUser.dateOfBirth || '');
    setEditGender(currentUser.gender || 'male');
    setEditShowPhone(currentUser.showPhone || false);
    setEditShowLocation(currentUser.showLocation !== undefined ? currentUser.showLocation : true);
    setIsEditing(true);
  };

  // Avatar upload (base64)
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t('profile.imageSizeError')); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateProfile({ avatar: dataUrl, avatarBase64: dataUrl } as any);
      toast.success(t('profile.avatarUpdated'));
    };
    reader.readAsDataURL(file);
  };

  // Cover photo upload (base64)
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t('profile.imageSizeError')); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateProfile({ coverPhoto: dataUrl } as any);
      toast.success(t('profile.coverUpdated'));
    };
    reader.readAsDataURL(file);
  };

  // Portfolio image upload (uses dedicated endpoint, falls back to uploadImage + addPortfolioImage)
  const handlePortfolioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Try the dedicated portfolio endpoint first
      try {
        const result = await api.uploadPortfolioImage(file);
        if (result?.images) {
          setPortfolioImages(result.images);
          toast.success(t('profile.profileUpdated', 'تمت إضافة الصورة'));
          return;
        }
      } catch {
        // fall back to old path
      }
      const uploaded = await api.uploadImage(file);
      const updated = await api.addPortfolioImage(uploaded.url);
      if (updated?.images) setPortfolioImages(updated.images);
      toast.success(t('profile.profileUpdated', 'تمت إضافة الصورة'));
    } catch {
      toast.error(t('profile.profileUpdateFailed', 'فشل رفع الصورة'));
    }
  };

  const handleRemovePortfolio = async (idx: number) => {
    try {
      const updated = await api.removePortfolioImage(idx);
      if (updated?.images) setPortfolioImages(updated.images);
    } catch {
      toast.error(t('profile.profileUpdateFailed', 'فشل حذف الصورة'));
    }
  };

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'posts', label: t('profile.tab_myPosts'), icon: <FileText className="w-4 h-4" />, badge: userPosts.length },
    { id: 'videos', label: 'فيديوهات', icon: <VideoIcon className="w-4 h-4" />, badge: myVideos.length },
    { id: 'ads', label: t('profile.tab_myAds'), icon: <ShoppingBag className="w-4 h-4" />, badge: userAds.length },
    { id: 'portfolio', label: t('profile.tab_portfolio', 'معرض الأعمال'), icon: <ImageIcon className="w-4 h-4" />, badge: portfolioImages.length },
    { id: 'about', label: t('profile.tab_about'), icon: <UserIcon className="w-4 h-4" /> },
  ];

  // Stats bar — 5 columns
  const statsBar = [
    { label: 'فيديوهات', value: myVideos.length, icon: <VideoIcon className="w-4 h-4" />, color: darkMode ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600' },
    { label: t('profile.posts'), value: userPosts.length, icon: <FileText className="w-4 h-4" />, color: darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600' },
    { label: t('profile.followers', 'متابعون'), value: followersCount, icon: <UserPlus className="w-4 h-4" />, color: darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600' },
    { label: 'يتابع', value: followingCount, icon: <UserCheck className="w-4 h-4" />, color: darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600' },
    { label: t('profile.trustScore'), value: `${currentUser.trustScore || 0}%`, icon: <ShieldCheck className="w-4 h-4" />, color: darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600' },
  ];

  // Theme helpers
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500'
    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400';

  return (
    <div className="max-w-2xl mx-auto overflow-x-hidden" dir={dir}>
      {/* Hidden file inputs */}
      <input id="avatarInputRef-input" ref={avatarInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
      <input id="coverInputRef-input" ref={coverInputRef} type="file" accept="image/*" className="sr-only" onChange={handleCoverChange} />
      <input ref={portfolioInputRef} type="file" accept="image/*" className="sr-only" onChange={handlePortfolioUpload} />

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('profile.title')}</h1>
        <button onClick={() => navigate('/settings')}
          className={`mr-auto px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          <ShieldCheck className="w-3.5 h-3.5 inline ml-1" />
          {t('settings.title')}
        </button>
      </div>

      {/* ─── Cover Photo ─── */}
      <div className="relative mb-24">
        <div className="h-44 sm:h-52 relative rounded-3xl overflow-hidden">
          {currentUser.coverPhoto ? (
            <img src={currentUser.coverPhoto} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-l from-orange-500 via-orange-600 to-rose-500">
              <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_25%_25%,white_1px,transparent_1px)] [background-size:24px_24px]" />
            </div>
          )}
          <label htmlFor="coverInputRef-input" className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 z-10 ${darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'} backdrop-blur-md shadow-lg`} style={{ cursor: 'pointer' }}>
            <Camera className="w-3.5 h-3.5" />
            {t('profile.changeCover')}
          </label>
        </div>

        {/* Avatar — overlapping cover, with upload button */}
        <div className="absolute -bottom-16 right-6">
          <div className="relative">
            <div className={`w-32 h-32 rounded-full border-4 ${darkMode ? 'border-gray-800' : 'border-white'} shadow-xl overflow-hidden`}>
              <img src={currentUser.avatarBase64 || currentUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`} alt={currentUser.name} className="w-full h-full object-cover" />
            </div>
            <label htmlFor="avatarInputRef-input" className="absolute -bottom-1 -left-1 w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg hover:bg-orange-700 active:scale-95 transition-all z-20" style={{ cursor: 'pointer' }}>
              <Camera className="w-5 h-5 text-white" />
            </label>
          </div>
        </div>

        {/* Edit Profile button */}
        <button onClick={startEdit}
          className={`absolute top-3 right-3 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 z-10 ${darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'} backdrop-blur-md shadow-lg`}>
          <Edit3 className="w-3.5 h-3.5" />
          {t('profile.editProfile')}
        </button>
      </div>

      {/* ─── User Info Section ─── */}
      <div className="mb-6 px-1">
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <h2 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{currentUser.name}</h2>
              {currentUser.isVerified && (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-600">
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </span>
              )}
              {currentUser.isAdmin && (
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-bold ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'}`}>
                  <Award className="w-3 h-3" />{t('profile.admin')}
                </span>
              )}
            </div>
            {(currentUser as any).profession && (
              <p className={`text-sm font-bold mb-1.5 flex items-center gap-1.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                <Briefcase className="w-3.5 h-3.5" />
                {(currentUser as any).profession}
              </p>
            )}
            {currentUser.bio && (
              <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{currentUser.bio}</p>
            )}
          </div>
          {/* Trust score ring */}
          <div className="flex flex-col items-center">
            <TrustRing score={currentUser.trustScore || 0} darkMode={darkMode} />
            <span className={`text-[10px] font-bold mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('profile.trustScore')}</span>
          </div>
        </div>

        {/* Badges Row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <EmailBadge emailVerified={currentUser.email_verified} />
          {currentUser.isTrusted && (
            <div className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-bold ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
              <ShieldCheck className="w-3.5 h-3.5" />{t('userProfile.trusted', 'موثوق')}
            </div>
          )}
        </div>

        {/* Info Items */}
        <div className="flex items-center gap-4 flex-wrap">
          {currentUser.showLocation && currentUser.location && (
            <div className={`flex items-center gap-1.5 text-xs ${textMuted}`}>
              <MapPin className="w-3.5 h-3.5 text-orange-500" />
              {currentUser.location}
            </div>
          )}
          {currentUser.showPhone && currentUser.phone && (
            <div className={`flex items-center gap-1.5 text-xs ${textMuted}`}>
              <Phone className="w-3.5 h-3.5 text-green-500" />
              {currentUser.phone}
            </div>
          )}
          {currentUser.dateOfBirth && (
            <div className={`flex items-center gap-1.5 text-xs ${textMuted}`}>
              <Calendar className="w-3.5 h-3.5 text-purple-500" />
              {new Date(currentUser.dateOfBirth).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US')}
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs ${textMuted}`}>
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            {currentUser.joinDate ? new Date(currentUser.joinDate).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long' }) : ''}
          </div>
        </div>

        {/* Interests chips */}
        {currentUser.interests && currentUser.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {currentUser.interests.map((interest, idx) => {
              const interestData = interestCategories.find(i => i.id === interest);
              return (
                <span key={idx} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${interestColors[idx % interestColors.length]}`}>
                  {interestData ? `${interestData.icon} ${t(interestData.nameKey)}` : t(`interests.${interest}`, interest)}
                </span>
              );
            })}
            <button onClick={() => { setEditInterests(currentUser?.interests || []); setShowInterestPicker(true); }}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <Edit3 className="w-3 h-3 inline ml-1" />
              {t('profile.editInterests')}
            </button>
          </div>
        )}
      </div>

      {/* ─── Stats Bar (5 columns) ─── */}
      <div className="grid grid-cols-5 gap-2 mb-6">
        {statsBar.map(stat => (
          <motion.div key={stat.label} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            className={`rounded-2xl border p-3 text-center transition-colors ${cardBg}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-1.5 ${stat.color}`}>
              {stat.icon}
            </div>
            <p className={`text-base font-black ${textPrimary}`}>{stat.value}</p>
            <p className={`text-[9px] font-bold ${textMuted}`}>{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ─── Wallet Card ─── */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-rose-600 rounded-2xl p-5 text-white shadow-xl shadow-orange-200/40 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full -ml-12 -mb-12 blur-lg" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                <Wallet className="w-5 h-5" />
              </div>
              <span className="font-bold text-base">{t('profile.myWallet')}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black">{t('profile.safeProtected')}</span>
            </div>
          </div>
          <div className="mb-5">
            <span className={`text-[11px] block mb-1 ${darkMode ? 'text-orange-200' : 'text-orange-100'}`}>{t('profile.currentBalance')}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tight">{currentUser.walletBalance?.toLocaleString() || '0'}</span>
              <span className="text-xl font-bold opacity-80">{t('common.egp')}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate('/wallet')}
              className="flex-1 bg-white text-orange-600 py-3 rounded-xl font-black text-sm hover:bg-gray-50 transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2">
              <CreditCard className="w-4 h-4" />
              {t('profile.chargeWallet')}
            </button>
            <button onClick={() => navigate('/wallet')}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${darkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-orange-400/30 hover:bg-orange-400/40 text-white'}`}>
              <Clock className="w-4 h-4" />
              {t('profile.transactionHistory')}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Promoted Ads shortcut ─── */}
      <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
        onClick={() => navigate('/promotions')}
        className={`rounded-2xl border p-5 mb-6 cursor-pointer transition-all hover:shadow-md ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className={`font-black text-sm ${textPrimary}`}>{t('profile.myPromotedAds')}</h3>
              <p className={`text-xs ${textMuted}`}>
                {t('profile.activePromotions', { count: promotionRequests.filter(r => r.postAuthor.id === currentUser.id && r.status === 'approved').length })}
              </p>
            </div>
          </div>
          <ArrowRight className={`w-5 h-5 ${textMuted}`} />
        </div>
      </motion.div>

      {/* ─── Tabs ─── */}
      <div className={`flex gap-1 p-1 rounded-xl mb-6 overflow-x-auto scrollbar-hide ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id
              ? (darkMode ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
              : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
              }`}>
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-orange-500 text-white text-[8px] font-black min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ─── */}
      <AnimatePresence mode="wait">
        {/* ── Posts Tab ── */}
        {activeTab === 'posts' && (
          <motion.div key="posts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {userPosts.length > 0 ? (
              <div className="space-y-3">
                {userPosts.map(post => (
                  <div key={post.id} onClick={() => navigate(`/post/${post.id}`)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${cardBg}`}>
                    {post.image && (() => {
                      let imgs: string[] = [];
                      try { const p = JSON.parse(post.image); imgs = Array.isArray(p) ? p : [post.image]; } catch { imgs = [post.image]; }
                      if (imgs.length === 0) return null;
                      return (
                        <div className="relative mb-3">
                          <img src={imgs[0]} alt="" className="w-full h-40 object-cover rounded-xl" loading="lazy" />
                          {imgs.length > 1 && (
                            <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">+{imgs.length - 1}</span>
                          )}
                        </div>
                      );
                    })()}
                    <p className={`text-sm leading-relaxed mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{post.content}</p>
                    <div className={`flex items-center gap-4 text-[11px] ${textMuted}`}>
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {post.comments}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {post.reachCount || 0}</span>
                      <span className="mr-auto">{formatRelativeTimeAr(post.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-12 text-center rounded-2xl border ${cardBg}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <FileText className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                </div>
                <p className={`font-bold ${textPrimary}`}>{t('profile.noPostsYet')}</p>
                <p className={`text-sm mt-1 ${textMuted}`}>{t('profile.startSharing')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Videos Tab ── */}
        {activeTab === 'videos' && (
          <motion.div key="videos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {myVideos.length > 0 ? (
              <>
                <button onClick={() => navigate('/market-live')}
                  className={`w-full mb-3 flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-orange-900/20 text-orange-400' : 'bg-orange-50 text-orange-600'} text-xs font-bold hover:opacity-80 transition-opacity`}>
                  <span className="flex items-center gap-2">
                    <VideoIcon className="w-4 h-4" />
                    عرض جميع الفيديوهات ({myVideos.length})
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  {myVideos.slice(0, 12).map((video: any, idx: number) => (
                    <button key={video.id || idx} onClick={() => setPreviewVideo(video)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden group ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      {video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <VideoIcon className={`w-6 h-6 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="flex items-center gap-1.5 text-white text-[8px] font-bold">
                          <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{(video.views || 0) >= 1000 ? ((video.views || 0) / 1000).toFixed(1) + 'K' : (video.views || 0)}</span>
                          <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" />{(video.likes || 0) >= 1000 ? ((video.likes || 0) / 1000).toFixed(1) + 'K' : (video.likes || 0)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className={`p-12 text-center rounded-2xl border ${cardBg}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <VideoIcon className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                </div>
                <p className={`font-bold ${textPrimary}`}>لا توجد فيديوهات</p>
                <p className={`text-sm mt-1 ${textMuted}`}>ابدأ بنشر فيديوهاتك في سوق لايف</p>
                <button onClick={() => navigate('/market-live')}
                  className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all">
                  الذهاب لسوق لايف
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Ads Tab ── */}
        {activeTab === 'ads' && (
          <motion.div key="ads" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {userAds.length > 0 ? (
              <div className="space-y-3">
                {userAds.map(ad => (
                  <div key={ad.id} onClick={() => navigate(`/post/${ad.id}`)}
                    className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${cardBg}`}>
                    <div className="flex items-start gap-3">
                      {ad.image && (() => {
                        let imgs: string[] = [];
                        try { const p = JSON.parse(ad.image); imgs = Array.isArray(p) ? p : [ad.image]; } catch { imgs = [ad.image]; }
                        return imgs.length > 0 ? <img src={imgs[0]} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" /> : null;
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed mb-2 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{ad.content}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {ad.price && (
                            <span className="text-sm font-black text-orange-600">{ad.price.toLocaleString()} {ad.currency}</span>
                          )}
                          {ad.location && (
                            <span className={`text-[11px] flex items-center gap-1 ${textMuted}`}>
                              <MapPin className="w-3 h-3" />{ad.location}
                            </span>
                          )}
                        </div>
                        {ad.isPromoted && ad.promotionStatus === 'approved' && (
                          <div className={`mt-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
                            <TrendingUp className="w-3 h-3" />
                            {t('profile.promoted')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-12 text-center rounded-2xl border ${cardBg}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <ShoppingBag className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                </div>
                <p className={`font-bold ${textPrimary}`}>{t('profile.noAdsYet')}</p>
                <p className={`text-sm mt-1 ${textMuted}`}>{t('profile.createFirstAd')}</p>
                <button onClick={() => navigate('/market')}
                  className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all">
                  إنشاء إعلان
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Portfolio Tab ── */}
        {activeTab === 'portfolio' && (
          <motion.div key="portfolio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className={`font-black text-sm ${textPrimary}`}>{t('profile.tab_portfolio', 'معرض الأعمال')}</h3>
              <button onClick={() => portfolioInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-l from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 active:scale-95 transition-all">
                <Plus className="w-3.5 h-3.5" />
                إضافة صورة
              </button>
            </div>
            {portfolioImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {portfolioImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group">
                    <img src={img} alt={`عمل ${idx + 1}`} className="w-full h-full object-cover cursor-zoom-in" loading="lazy"
                      onClick={() => setPortfolioLightbox({ images: portfolioImages, index: idx })} />
                    <button onClick={() => handleRemovePortfolio(idx)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-8 text-center rounded-2xl border ${cardBg}`}>
                <ImageIcon className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-sm ${textMuted}`}>لم تضف أي أعمال بعد</p>
                <p className={`text-xs mt-1 ${textMuted}`}>أضف صوراً لأعمالك ليراها متابعوك</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── About Tab ── */}
        {activeTab === 'about' && (
          <motion.div key="about" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
              <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                <AboutRow darkMode={darkMode} icon={<UserIcon className="w-4 h-4" />} color="blue" label={t('profile.about_name')} value={currentUser.name} />
                {(currentUser as any).profession && (
                  <AboutRow darkMode={darkMode} icon={<Briefcase className="w-4 h-4" />} color="orange" label="المهنة" value={(currentUser as any).profession} />
                )}
                {currentUser.gender && (
                  <AboutRow darkMode={darkMode} icon={<UserIcon className="w-4 h-4" />} color={currentUser.gender === 'female' ? 'pink' : 'blue'} label={t('profile.about_gender')} value={currentUser.gender === 'female' ? t('auth.female', 'أنثى') : t('auth.male', 'ذكر')} />
                )}
                {currentUser.bio && (
                  <AboutRow darkMode={darkMode} icon={<FileText className="w-4 h-4" />} color="green" label={t('profile.about_bio')} value={currentUser.bio} />
                )}
                {currentUser.showLocation && currentUser.location && (
                  <AboutRow darkMode={darkMode} icon={<MapPin className="w-4 h-4" />} color="orange" label={t('profile.about_location')} value={currentUser.location} />
                )}
                {currentUser.showPhone && currentUser.phone && (
                  <AboutRow darkMode={darkMode} icon={<Phone className="w-4 h-4" />} color="green" label={t('profile.about_phone')} value={currentUser.phone} />
                )}
                {currentUser.dateOfBirth && (
                  <AboutRow darkMode={darkMode} icon={<Calendar className="w-4 h-4" />} color="purple" label="تاريخ الميلاد" value={new Date(currentUser.dateOfBirth).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US')} />
                )}
                <AboutRow darkMode={darkMode} icon={<Calendar className="w-4 h-4" />} color="amber" label={t('profile.about_joinDate')} value={currentUser.joinDate ? new Date(currentUser.joinDate).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''} />
                {/* Trust Score with Progress Bar */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}><ShieldCheck className="w-4 h-4" /></div>
                      <div>
                        <p className={`text-[11px] ${textMuted}`}>{t('profile.about_trust')}</p>
                        <p className={`text-sm font-bold ${textPrimary}`}>{currentUser.trustScore}%</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${(currentUser.trustScore || 0) >= 80 ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600') : (currentUser.trustScore || 0) >= 50 ? (darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600') : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600')}`}>
                      {(currentUser.trustScore || 0) >= 80 ? t('profile.excellent') : (currentUser.trustScore || 0) >= 50 ? t('profile.good') : t('profile.poor')}
                    </span>
                  </div>
                  <div className={`w-full h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${currentUser.trustScore || 0}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-full rounded-full ${(currentUser.trustScore || 0) >= 80 ? 'bg-green-500' : (currentUser.trustScore || 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    />
                  </div>
                </div>
                <AboutRow darkMode={darkMode} icon={<CheckCircle2 className="w-4 h-4" />} color="purple" label={t('profile.about_verification')} value={currentUser.isVerified ? t('profile.verifiedCheck') : t('profile.unverified')} />
              </div>
            </div>

            {/* Quick stats summary */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className={`rounded-2xl border p-4 text-center ${cardBg}`}>
                <BarChart3 className={`w-6 h-6 mx-auto mb-1.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                <p className={`text-lg font-black ${textPrimary}`}>{userPosts.reduce((s, p) => s + (p.likes || 0), 0)}</p>
                <p className={`text-[10px] font-bold ${textMuted}`}>إجمالي الإعجابات</p>
              </div>
              <div className={`rounded-2xl border p-4 text-center ${cardBg}`}>
                <Eye className={`w-6 h-6 mx-auto mb-1.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <p className={`text-lg font-black ${textPrimary}`}>{userPosts.reduce((s, p) => s + (p.reachCount || 0), 0)}</p>
                <p className={`text-[10px] font-bold ${textMuted}`}>إجمالي المشاهدات</p>
              </div>
              <div className={`rounded-2xl border p-4 text-center ${cardBg}`}>
                <MessageCircle className={`w-6 h-6 mx-auto mb-1.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                <p className={`text-lg font-black ${textPrimary}`}>{userPosts.reduce((s, p) => s + (p.comments || 0), 0)}</p>
                <p className={`text-[10px] font-bold ${textMuted}`}>إجمالي التعليقات</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Interests Picker Modal ─── */}
      <AnimatePresence>
        {showInterestPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowInterestPicker(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
              <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <h3 className={`font-black text-lg ${textPrimary}`}>{t('profile.editInterestsBtn')}</h3>
                <button onClick={() => setShowInterestPicker(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1">
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setEditInterests(interestCategories.map(i => i.id))}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Check className="w-3.5 h-3.5" />{t('auth.selectAll')}
                  </button>
                  <button onClick={() => setEditInterests([])}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <X className="w-3.5 h-3.5" />{t('auth.deselectAll')}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
                  <button onClick={() => setPickerGroup('all')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${pickerGroup === 'all' ? (darkMode ? 'bg-gray-600 text-white' : 'bg-gray-900 text-white') : (darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}`}>
                    {t('common.all')}
                  </button>
                  {interestGroups.map(group => (
                    <button key={group.id} onClick={() => setPickerGroup(group.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${pickerGroup === group.id ? (darkMode ? 'bg-gray-600 text-white' : 'bg-gray-900 text-white') : (darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}`}>
                      <span>{group.icon}</span>{t(group.nameKey)}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(pickerGroup === 'all' ? interestCategories : getInterestsByGroup(pickerGroup as InterestGroup)).map(interest => {
                    const isSelected = editInterests.includes(interest.id);
                    return (
                      <button key={interest.id} onClick={() => setEditInterests(prev => isSelected ? prev.filter(i => i !== interest.id) : [...prev, interest.id])}
                        className={`relative rounded-xl p-3 text-start transition-all overflow-hidden ${isSelected ? `ring-2 ring-orange-500 shadow-sm ${darkMode ? 'bg-gray-700' : 'bg-white'}` : darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'}`}>
                        {isSelected && (
                          <div className="absolute top-1.5 left-1.5 w-4 h-4 bg-orange-600 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        <div className="relative z-10">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-lg">{interest.icon}</span>
                            <span className={`text-[11px] font-black ${isSelected ? textPrimary : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}>{t(interest.nameKey)}</span>
                          </div>
                          <p className={`text-[9px] leading-relaxed ${textMuted}`}>{t(interest.descriptionKey)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                {editInterests.length > 0 && (
                  <p className={`text-center text-xs font-bold mb-3 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                    {t('profile.interestsSelected', { count: editInterests.length })}
                  </p>
                )}
                <button onClick={() => {
                  updateProfile({ interests: editInterests } as any);
                  setShowInterestPicker(false);
                  toast.success(t('profile.interestsUpdated'));
                }} disabled={editInterests.length === 0}
                  className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  {t('profile.saveInterests')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Edit Profile Modal ─── */}
      <AnimatePresence>
        {isEditing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsEditing(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
              <div className={`flex items-center justify-between p-5 border-b sticky top-0 z-10 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'}`}>
                <h3 className={`font-black text-lg ${textPrimary}`}>{t('profile.editProfileTitle')}</h3>
                <button onClick={() => setIsEditing(false)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <EditField label={t('profile.about_name')} value={editName} onChange={setEditName} inputCls={inputCls} darkMode={darkMode} />
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('profile.about_bio')}</label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} rows={3}
                    className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold transition-colors resize-none ${inputCls}`} />
                </div>
                <EditField label="المهنة" value={editProfession} onChange={setEditProfession} inputCls={inputCls} darkMode={darkMode} placeholder="مثال: مصمم جرافيك" />
                <EditField label={t('profile.about_location')} value={editLocation} onChange={setEditLocation} inputCls={inputCls} darkMode={darkMode} placeholder="Cairo, Egypt" />
                <EditField label={t('profile.about_phone')} value={editPhone} onChange={setEditPhone} inputCls={inputCls} darkMode={darkMode} placeholder="01xxxxxxxxx" />
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>تاريخ الميلاد</label>
                  <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold transition-colors ${inputCls}`} />
                </div>
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('profile.about_gender')}</label>
                  <div className="flex gap-2">
                    {(['male', 'female'] as const).map(g => (
                      <button key={g} onClick={() => setEditGender(g)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${editGender === g ? 'bg-orange-600 text-white' : (darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100')}`}>
                        {g === 'male' ? t('auth.male', 'ذكر') : t('auth.female', 'أنثى')}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Toggles */}
                <div className={`rounded-xl border p-4 space-y-3 ${darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'}`}>
                  <EditToggle icon={<Phone className="w-4 h-4" />} label={t('settings.showPhone')} enabled={editShowPhone} onToggle={() => setEditShowPhone(!editShowPhone)} darkMode={darkMode} />
                  <EditToggle icon={<MapPin className="w-4 h-4" />} label={t('settings.showLocation')} enabled={editShowLocation} onToggle={() => setEditShowLocation(!editShowLocation)} darkMode={darkMode} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)}
                    className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                    {t('common.cancel')}
                  </button>
                  <button onClick={handleSaveProfile}
                    className="flex-1 bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2">
                    <Save className="w-4 h-4" />
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Portfolio Lightbox ─── */}
      {portfolioLightbox && (
        <ImageLightbox
          images={portfolioLightbox.images}
          index={portfolioLightbox.index}
          onClose={() => setPortfolioLightbox(null)}
        />
      )}

      {/* ─── Video Preview Modal ─── */}
      <AnimatePresence>
        {previewVideo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black flex items-center justify-center" onClick={() => setPreviewVideo(null)}>
            <button onClick={() => setPreviewVideo(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl">✕</button>
            <video src={previewVideo.videoUrl} className="w-full h-full object-contain" controls autoPlay loop onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────
const AboutRow: React.FC<{
  darkMode: boolean; icon: React.ReactNode; color: 'blue' | 'orange' | 'green' | 'purple' | 'amber' | 'pink';
  label: string; value: string;
}> = ({ darkMode, icon, color, label, value }) => {
  const colorMap: Record<string, string> = {
    blue: darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600',
    orange: darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600',
    green: darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600',
    purple: darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600',
    amber: darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600',
    pink: darkMode ? 'bg-pink-900/30 text-pink-400' : 'bg-pink-50 text-pink-600',
  };
  return (
    <div className="px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
        <div>
          <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
        </div>
      </div>
    </div>
  );
};

const EditField: React.FC<{
  label: string; value: string; onChange: (v: string) => void; inputCls: string; darkMode: boolean; placeholder?: string;
}> = ({ label, value, onChange, inputCls, placeholder }) => (
  <div>
    <label className={`text-xs font-bold block mb-1.5 ${inputCls.includes('bg-gray-7') ? 'text-gray-400' : 'text-gray-600'}`}>{label}</label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold transition-colors ${inputCls}`} />
  </div>
);

const EditToggle: React.FC<{
  icon: React.ReactNode; label: string; enabled: boolean; onToggle: () => void; darkMode: boolean;
}> = ({ icon, label, enabled, onToggle }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="text-gray-500">{icon}</span>
      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{label}</span>
    </div>
    <button onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-all ${enabled ? 'bg-orange-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'right-0.5' : 'right-[22px]'}`} />
    </button>
  </div>
);
