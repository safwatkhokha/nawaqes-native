import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr } from '../utils/time';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import {
  PenLine, Sparkles, ShieldCheck, MapPin, Heart, Send,
  Bookmark, MessageCircle, Share2, ShoppingBag,
  Zap, Clock, Crown, TrendingUp, CheckCircle2,
  Image as ImageIcon, Plus, Globe, Wallet, Eye, Megaphone, BarChart3,
  AlertCircle, Camera, Edit3, RefreshCw, Loader2,
  Users, UserPlus, UserCheck, Radio,
  Play, Trash2, Video as VideoIcon, FileText, ChevronLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { api } from '../services/api';
import { Post } from '../types';

// ─── Types ────────────────────────────────────────────────────────────
interface MarketListingData {
  id: string;
  title: string;
  description?: string;
  images?: string[];
  price?: number;
  currency?: string;
  category?: string;
  condition?: string;
  city?: string;
  status?: string;
  is_promoted?: boolean;
  promotion_status?: string;
  views_count?: number;
  saves_count?: number;
  inquiries_count?: number;
  created_at?: string;
  location?: string;
  image?: string;
}

interface ActivityItem {
  id: string;
  type: 'post' | 'ad' | 'promotion' | 'wallet' | 'follow' | 'video' | 'sale';
  text: string;
  time: string;
  icon: React.ReactNode;
  color: 'orange' | 'green' | 'red' | 'purple' | 'blue';
}

type MyPageTab = 'posts' | 'ads' | 'videos' | 'saved';

// ─── Component ────────────────────────────────────────────────────────
export const MyPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const {
    darkMode, posts, savedPosts, toggleSavePost, openShareModal, addPost,
  } = useAppContext();
  const { currentUser, updateProfile } = useAuth();

  // ─── State ───
  const [postText, setPostText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<MyPageTab>('posts');
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [postLocation, setPostLocation] = useState('');
  const [postType, setPostType] = useState<'ad' | 'status'>('status');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Market listings
  const [marketListings, setMarketListings] = useState<MarketListingData[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);

  // Wallet transactions for activity
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);

  // My videos
  const [myVideos, setMyVideos] = useState<any[]>([]);

  // Followers / following counts
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Friends count
  const [friendsCount, setFriendsCount] = useState(0);

  // Recent activity (API-backed, falls back to derived)
  const [apiActivity, setApiActivity] = useState<any[]>([]);

  // ─── Derived data ───
  const myPosts = useMemo(() => posts.filter(p => currentUser && p.author.id === currentUser.id && p.type !== 'ad'), [posts, currentUser]);
  const myAds = useMemo(() => posts.filter(p => currentUser && p.author.id === currentUser.id && p.type === 'ad'), [posts, currentUser]);
  const mySavedPosts = useMemo(() => posts.filter(p => savedPosts.includes(p.id)), [posts, savedPosts]);

  // ─── Load market listings ───
  const loadMarketListings = async () => {
    setLoadingListings(true);
    try {
      const data = await api.getMyMarketListings();
      if (Array.isArray(data)) setMarketListings(data);
    } catch { /* ignore */ }
    finally { setLoadingListings(false); }
  };

  useEffect(() => { loadMarketListings(); }, []);

  // ─── Load wallet transactions ───
  useEffect(() => {
    api.getTransactions().then(data => {
      if (Array.isArray(data)) setWalletTransactions(data);
    }).catch(() => {});
  }, []);

  // ─── Load videos, follow status, friends count ───
  useEffect(() => {
    if (!currentUser) return;
    api.getMyVideos().then(data => {
      if (Array.isArray(data)) setMyVideos(data);
      else if (data && Array.isArray((data as any).videos)) setMyVideos((data as any).videos);
    }).catch(() => {});
    api.getFollowStatus(currentUser.id).then((data: any) => {
      setFollowersCount(data?.followersCount || 0);
      setFollowingCount(data?.followingCount || 0);
    }).catch(() => {});
    api.getFriendsList().then(friends => {
      if (Array.isArray(friends)) setFriendsCount(friends.length);
    }).catch(() => {});
    api.getMyActivity(20).then(items => {
      if (Array.isArray(items)) setApiActivity(items);
    }).catch(() => {});
  }, [currentUser]);

  // ─── Activity items (derived + API) ───
  const recentActivity: ActivityItem[] = useMemo(() => {
    const activities: ActivityItem[] = [];

    // Prefer API-backed activity
    if (apiActivity.length > 0) {
      apiActivity.slice(0, 12).forEach((a: any) => {
        const typeMap: Record<string, { icon: React.ReactNode; color: ActivityItem['color']; text?: string }> = {
          post: { icon: <PenLine className="w-4 h-4" />, color: 'orange' },
          ad: { icon: <ShoppingBag className="w-4 h-4" />, color: 'orange' },
          promotion: { icon: <Megaphone className="w-4 h-4" />, color: 'green' },
          wallet: { icon: <Wallet className="w-4 h-4" />, color: 'green' },
          follow: { icon: <UserPlus className="w-4 h-4" />, color: 'blue' },
          video: { icon: <VideoIcon className="w-4 h-4" />, color: 'purple' },
          sale: { icon: <ShoppingBag className="w-4 h-4" />, color: 'green' },
        };
        const m = typeMap[a.type] || { icon: <Zap className="w-4 h-4" />, color: 'orange' as const };
        activities.push({
          id: a.id || `act_${a.type}_${a.time}`,
          type: a.type,
          text: a.text || a.description || a.content || '',
          time: a.time || a.created_at || '',
          icon: m.icon,
          color: m.color,
        });
      });
      if (activities.length > 0) return activities;
    }

    // Fallback: derive from posts
    myPosts.slice(0, 4).forEach(post => {
      activities.push({
        id: `act_post_${post.id}`,
        type: 'post',
        text: t('myPage.post') + ': ' + post.content.slice(0, 50) + (post.content.length > 50 ? '...' : ''),
        time: post.timestamp,
        icon: <PenLine className="w-4 h-4" />,
        color: 'orange',
      });
    });
    myAds.slice(0, 3).forEach(ad => {
      activities.push({
        id: `act_ad_${ad.id}`,
        type: 'ad',
        text: t('myPage.ad') + ': ' + ad.content.slice(0, 50) + (ad.content.length > 50 ? '...' : ''),
        time: ad.timestamp,
        icon: <ShoppingBag className="w-4 h-4" />,
        color: 'orange',
      });
    });
    walletTransactions.slice(0, 3).forEach((tx: any) => {
      const isDeposit = tx.type === 'deposit' || tx.type === 'topup' || tx.type === 'admin_deposit';
      activities.push({
        id: `act_wallet_${tx.id}`,
        type: 'wallet',
        text: isDeposit
          ? `شحن المحفظة: +${(tx.amount || 0).toLocaleString()}`
          : `خصم من المحفظة: -${(tx.amount || 0).toLocaleString()}`,
        time: tx.created_at || tx.timestamp || '',
        icon: <Wallet className="w-4 h-4" />,
        color: isDeposit ? 'green' : 'red',
      });
    });
    return activities;
  }, [myPosts, myAds, walletTransactions, apiActivity, t]);

  // ─── Performance overview: aggregate stats from recent posts ───
  const performance = useMemo(() => {
    const recent = myPosts.slice(0, 10);
    const totalViews = recent.reduce((s, p) => s + (p.reachCount || 0), 0);
    const totalLikes = recent.reduce((s, p) => s + (p.likes || 0), 0);
    const totalComments = recent.reduce((s, p) => s + (p.comments || 0), 0);
    const totalShares = recent.reduce((s, p) => s + (p.shares || 0), 0);
    const maxVal = Math.max(totalViews, totalLikes, totalComments, totalShares, 1);
    return [
      { label: 'مشاهدات', value: totalViews, color: 'bg-blue-500', icon: <Eye className="w-3 h-3" /> },
      { label: 'إعجابات', value: totalLikes, color: 'bg-rose-500', icon: <Heart className="w-3 h-3" /> },
      { label: 'تعليقات', value: totalComments, color: 'bg-green-500', icon: <MessageCircle className="w-3 h-3" /> },
      { label: 'مشاركات', value: totalShares, color: 'bg-purple-500', icon: <Share2 className="w-3 h-3" /> },
    ].map(p => ({ ...p, percent: Math.round((p.value / maxVal) * 100) }));
  }, [myPosts]);

  // ─── Theme helpers ───
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const cardBgHover = darkMode ? 'hover:border-gray-600' : 'hover:border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400';

  // ─── Handlers ───
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setSelectedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(t('myPage.selectImage')); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateProfile({ coverPhoto: dataUrl } as any);
      toast.success(t('myPage.changeCover'));
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePost = async () => {
    if (!postText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const savedPost = await api.createPost({
        content: postText.trim(),
        image: selectedImage || undefined,
        location: postLocation || undefined,
        type: postType,
      });
      const newPost: Post = {
        id: savedPost.id,
        author: {
          id: savedPost.author?.id || currentUser?.id || 'me',
          name: savedPost.author?.name || currentUser?.name || '',
          avatar: savedPost.author?.avatar || currentUser?.avatarBase64 || currentUser?.avatar || '',
          isVerified: savedPost.author?.is_verified || savedPost.author?.isVerified,
        },
        content: savedPost.content || postText.trim(),
        image: savedPost.image || selectedImage || undefined,
        location: savedPost.location || postLocation || undefined,
        likes: savedPost.likes || 0,
        comments: savedPost.comments || 0,
        shares: savedPost.shares || 0,
        timestamp: new Date().toISOString(),
        type: savedPost.type || postType as 'ad' | 'status',
        price: savedPost.price,
        currency: savedPost.currency,
      };
      addPost(newPost);
      toast.success(t('myPage.publish'));
    } catch {
      // Fallback local post
      const fallbackPost: Post = {
        id: `mypost_${Date.now()}`,
        author: {
          id: currentUser?.id || 'me',
          name: currentUser?.name || '',
          avatar: currentUser?.avatarBase64 || currentUser?.avatar || '',
        },
        content: postText.trim(),
        image: selectedImage || undefined,
        location: postLocation || undefined,
        likes: 0, comments: 0, shares: 0,
        timestamp: new Date().toISOString(),
        type: postType as 'ad' | 'status',
      };
      addPost(fallbackPost);
    } finally {
      setIsSubmitting(false);
      setPostText('');
      setSelectedImage(null);
      setPostLocation('');
      setPostType('status');
      setShowLocationInput(false);
    }
  };

  const handleLike = (postId: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const getActivityColorClasses = (color: string) => {
    switch (color) {
      case 'orange': return darkMode ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-600';
      case 'green': return darkMode ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-600';
      case 'red': return darkMode ? 'bg-red-900/50 text-red-400' : 'bg-red-100 text-red-600';
      case 'purple': return darkMode ? 'bg-purple-900/50 text-purple-400' : 'bg-purple-100 text-purple-600';
      case 'blue': return darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600';
      default: return darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-600';
    }
  };

  // ─── Dashboard cards ───
  const dashboardCards = [
    {
      label: 'منشوراتي', value: myPosts.length, icon: <PenLine className="w-5 h-5" />,
      color: darkMode ? 'from-orange-900/30 to-orange-800/20 text-orange-400' : 'from-orange-50 to-orange-100 text-orange-600',
      onClick: () => setActiveTab('posts'),
    },
    {
      label: 'إعلاناتي', value: myAds.length + marketListings.length, icon: <ShoppingBag className="w-5 h-5" />,
      color: darkMode ? 'from-green-900/30 to-green-800/20 text-green-400' : 'from-green-50 to-green-100 text-green-600',
      onClick: () => setActiveTab('ads'),
    },
    {
      label: 'رصيد المحفظة', value: currentUser?.walletBalance?.toLocaleString() || '0', icon: <Wallet className="w-5 h-5" />,
      color: darkMode ? 'from-blue-900/30 to-blue-800/20 text-blue-400' : 'from-blue-50 to-blue-100 text-blue-600',
      onClick: () => navigate('/wallet'),
    },
    {
      label: 'نسبة الثقة', value: `${currentUser?.trustScore || 0}%`, icon: <ShieldCheck className="w-5 h-5" />,
      color: darkMode ? 'from-emerald-900/30 to-emerald-800/20 text-emerald-400' : 'from-emerald-50 to-emerald-100 text-emerald-600',
      onClick: () => navigate('/profile'),
    },
    {
      label: 'متابعون', value: followersCount, icon: <UserPlus className="w-5 h-5" />,
      color: darkMode ? 'from-purple-900/30 to-purple-800/20 text-purple-400' : 'from-purple-50 to-purple-100 text-purple-600',
      onClick: () => navigate('/friends'),
    },
    {
      label: 'يتابع', value: followingCount, icon: <UserCheck className="w-5 h-5" />,
      color: darkMode ? 'from-rose-900/30 to-rose-800/20 text-rose-400' : 'from-rose-50 to-rose-100 text-rose-600',
      onClick: () => navigate('/friends'),
    },
  ];

  // ─── Quick actions ───
  const quickActions = [
    { label: 'إنشاء منشور', icon: <PenLine className="w-5 h-5" />, color: 'bg-orange-600', onClick: () => fileInputRef.current?.focus() },
    { label: 'إضافة إعلان', icon: <Plus className="w-5 h-5" />, color: 'bg-green-600', onClick: () => navigate('/market') },
    { label: 'البث المباشر', icon: <Radio className="w-5 h-5" />, color: 'bg-rose-600', onClick: () => navigate('/channels') },
    { label: 'شحن المحفظة', icon: <Wallet className="w-5 h-5" />, color: 'bg-blue-600', onClick: () => navigate('/wallet') },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5" dir={dir}>
      {/* Hidden file inputs */}
      <input id="coverInputRef-input" ref={coverInputRef} type="file" accept="image/*" className="sr-only" onChange={handleCoverChange} />
      <input id="fileInputRef-input" ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleImageSelect} />

      {/* ─── Hero Header ─── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl">
        <div className="relative h-44 sm:h-52">
          {currentUser?.coverPhoto ? (
            <img src={currentUser.coverPhoto} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-rose-500 to-purple-600" />
          )}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_25%_25%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          {/* Floating orbs */}
          <div className="absolute top-8 right-16 w-20 h-20 bg-white/10 rounded-full blur-xl animate-pulse" />
          <div className="absolute bottom-8 left-20 w-28 h-28 bg-white/5 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />

          {/* Cover change */}
          <label htmlFor="coverInputRef-input" className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 z-10 ${darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'} backdrop-blur-md shadow-lg`} style={{ cursor: 'pointer' }}>
            <Camera className="w-3.5 h-3.5" />
            {t('myPage.changeCover')}
          </label>
          <button onClick={() => navigate('/profile')}
            className={`absolute top-3 right-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 z-10 ${darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'} backdrop-blur-md shadow-lg`}>
            <Edit3 className="w-3.5 h-3.5" />
            {t('myPage.editProfile')}
          </button>

          {/* User info overlay */}
          <div className="absolute inset-0 flex items-end">
            <div className="w-full px-6 pb-6 flex items-end gap-4">
              <div className="relative -mb-10 z-10">
                <div className="w-20 h-20 rounded-2xl border-4 border-white dark:border-gray-800 shadow-xl overflow-hidden">
                  <img src={currentUser?.avatarBase64 || currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'default'}`} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="absolute bottom-1 left-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-black text-white drop-shadow-lg">{currentUser?.name}</h1>
                  {currentUser?.isVerified && <CheckCircle2 className="w-5 h-5 text-white fill-white/30" />}
                  {currentUser?.isAdmin && <Crown className="w-4 h-4 text-yellow-300" />}
                </div>
                <p className="text-white/80 text-xs font-bold">
                  @{currentUser?.name?.replace(/\s/g, '_') || 'user'} · {currentUser?.trustScore || 50}% {t('myPage.trustLevel')}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className={`px-6 pt-14 pb-4 rounded-b-3xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex items-center gap-6 justify-between flex-wrap">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <span className={`text-lg font-black ${textPrimary}`}>{myPosts.length}</span>
                <span className={`text-[10px] block font-bold ${textMuted}`}>{t('myPage.postsCount')}</span>
              </div>
              <div className="text-center">
                <span className={`text-lg font-black ${textPrimary}`}>{myAds.length + marketListings.length}</span>
                <span className={`text-[10px] block font-bold ${textMuted}`}>إعلانات</span>
              </div>
              <div className="text-center">
                <span className={`text-lg font-black ${textPrimary}`}>{followersCount}</span>
                <span className={`text-[10px] block font-bold ${textMuted}`}>متابعون</span>
              </div>
              <div className="text-center">
                <span className={`text-lg font-black ${textPrimary}`}>{friendsCount}</span>
                <span className={`text-[10px] block font-bold ${textMuted}`}>أصدقاء</span>
              </div>
            </div>
            <ShieldCheck className={`w-5 h-5 ${currentUser?.isTrusted ? 'text-green-500' : 'text-gray-400'}`} />
          </div>
        </div>
      </motion.div>

      {/* ─── Dashboard Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {dashboardCards.map(card => (
          <motion.button key={card.label} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={card.onClick}
            className={`text-start rounded-2xl border p-4 transition-all ${cardBg} ${cardBgHover}`}>
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-3`}>
              {card.icon}
            </div>
            <p className={`text-xl font-black ${textPrimary}`}>{card.value}</p>
            <p className={`text-[11px] font-bold ${textMuted}`}>{card.label}</p>
          </motion.button>
        ))}
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="grid grid-cols-4 gap-3">
        {quickActions.map(action => (
          <motion.button key={action.label} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={action.onClick}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-transparent hover:border-orange-200 dark:hover:border-orange-800/50 transition-all">
            <div className={`w-12 h-12 rounded-2xl ${action.color} text-white flex items-center justify-center shadow-lg`}>
              {action.icon}
            </div>
            <span className={`text-[10px] font-bold text-center ${textPrimary}`}>{action.label}</span>
          </motion.button>
        ))}
      </div>

      {/* ─── Performance Overview (bar chart) ─── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${cardBg}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
              <BarChart3 className="w-4 h-4" />
            </div>
            <h3 className={`font-black text-sm ${textPrimary}`}>أداء المنشورات الأخيرة</h3>
          </div>
          <span className={`text-[10px] font-bold ${textMuted}`}>آخر {Math.min(myPosts.length, 10)} منشورات</span>
        </div>
        {myPosts.length > 0 ? (
          <div className="space-y-3">
            {performance.map(p => (
              <div key={p.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${textPrimary}`}>
                    <span className={p.color.replace('bg-', 'text-')}>{p.icon}</span>
                    {p.label}
                  </span>
                  <span className={`text-xs font-black ${textPrimary}`}>{p.value.toLocaleString()}</span>
                </div>
                <div className={`w-full h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${p.percent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full rounded-full ${p.color}`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-xs text-center py-6 ${textMuted}`}>لا توجد منشورات لعرض أدائها بعد</p>
        )}
      </motion.div>

      {/* ─── Personal Posting Area ─── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 ${cardBg}`}>
        <div className="flex items-start gap-3">
          <img src={currentUser?.avatarBase64 || currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'default'}`} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
          <div className="flex-1">
            {postType === 'ad' && (
              <div className="flex items-center gap-1.5 mb-2">
                <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
                <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>{t('myPage.ad')}</span>
              </div>
            )}
            <textarea value={postText} onChange={e => setPostText(e.target.value)}
              placeholder={postType === 'ad' ? t('myPage.writeAdDetails') : t('myPage.shareOnPage')}
              className={`w-full resize-none border rounded-xl px-4 py-3 text-sm outline-none transition-colors min-h-[80px] ${inputCls}`}
              rows={3} />
            {selectedImage && (
              <div className="relative mt-2 rounded-xl overflow-hidden">
                <img src={selectedImage} alt="Selected" className="w-full max-h-[200px] object-cover rounded-xl" />
                <button onClick={() => setSelectedImage(null)}
                  className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">×</button>
              </div>
            )}
            {showLocationInput && (
              <div className="mt-2 flex items-center gap-2">
                <MapPin className={`w-4 h-4 flex-shrink-0 ${textMuted}`} />
                <input type="text" value={postLocation} onChange={e => setPostLocation(e.target.value)}
                  placeholder={t('myPage.addLocation')}
                  className={`flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none transition-colors ${inputCls}`} />
                {postLocation && (
                  <button onClick={() => { setPostLocation(''); setShowLocationInput(false); }}
                    className={`p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>×</button>
                )}
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <label htmlFor="fileInputRef-input" className={`p-2 rounded-lg transition-colors cursor-pointer ${selectedImage ? (darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-600') : (darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}`}>
                  <ImageIcon className="w-4 h-4" />
                </label>
                <button onClick={() => setShowLocationInput(!showLocationInput)}
                  className={`p-2 rounded-lg transition-colors ${postLocation ? (darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-600') : (darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}`}>
                  <MapPin className="w-4 h-4" />
                </button>
                <button onClick={() => setPostType(postType === 'ad' ? 'status' : 'ad')}
                  className={`p-2 rounded-lg transition-colors ${postType === 'ad' ? (darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-600') : (darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}`}>
                  <ShoppingBag className="w-4 h-4" />
                </button>
              </div>
              <button onClick={handleCreatePost} disabled={!postText.trim() || isSubmitting}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center gap-2 ${postText.trim() && !isSubmitting ? 'bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg hover:from-orange-600 hover:to-orange-700' : darkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSubmitting ? (t('createPost.publishing') || 'جارٍ النشر...') : t('myPage.publish')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── Tabs ─── */}
      <div className={`flex gap-1 p-1.5 rounded-2xl border ${cardBg}`}>
        {[
          { id: 'posts' as MyPageTab, label: 'منشوراتي', icon: <PenLine className="w-4 h-4" />, count: myPosts.length },
          { id: 'ads' as MyPageTab, label: 'إعلاناتي', icon: <ShoppingBag className="w-4 h-4" />, count: myAds.length + marketListings.length },
          { id: 'videos' as MyPageTab, label: 'فيديوهاتي', icon: <VideoIcon className="w-4 h-4" />, count: myVideos.length },
          { id: 'saved' as MyPageTab, label: 'المحفوظات', icon: <Bookmark className="w-4 h-4" />, count: mySavedPosts.length },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg' : darkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-[8px] font-black min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 ${activeTab === tab.id ? 'bg-white/25' : 'bg-red-500 text-white'}`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab Content + Activity Timeline (side-by-side on desktop) ─── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main tab content (spans 2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          <AnimatePresence mode="wait">
            {/* ── Posts Tab ── */}
            {activeTab === 'posts' && (
              <motion.div key="posts" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-4">
                {myPosts.length > 0 ? myPosts.map(post => (
                  <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border overflow-hidden transition-colors ${cardBg} ${cardBgHover}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={currentUser?.avatarBase64 || currentUser?.avatar || ''} alt="" className="w-10 h-10 rounded-xl" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className={`font-bold text-sm ${textPrimary}`}>{currentUser?.name}</h4>
                            {currentUser?.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-orange-600 fill-orange-600/10" />}
                          </div>
                          <div className={`flex items-center gap-1.5 text-[10px] ${textMuted}`}>
                            <span>{formatRelativeTimeAr(post.timestamp)}</span>
                            <span>·</span>
                            <Globe className="w-3 h-3" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-3">
                      <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{post.content}</p>
                    </div>
                    {post.image && (
                      <div className={`border-y ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <img src={post.image} alt="" className="w-full max-h-[300px] object-cover" loading="lazy" />
                      </div>
                    )}
                    <div className={`px-4 py-2 flex items-center justify-between text-[11px] ${textMuted}`}>
                      <span className="font-medium">{post.likes + (likedPosts.has(post.id) ? 1 : 0)} {t('myPage.like')}</span>
                      <div className="flex items-center gap-3">
                        <span>{post.comments} {t('myPage.comment')}</span>
                        <span>{post.shares} {t('myPage.share')}</span>
                      </div>
                    </div>
                    <div className={`mx-3 border-t py-1 flex items-center justify-between mb-1 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <button onClick={() => handleLike(post.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-bold ${likedPosts.has(post.id) ? 'text-blue-600' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? 'fill-blue-600 text-blue-600' : ''}`} />
                        {t('myPage.like')}
                      </button>
                      <button onClick={() => navigate(`/post/${post.id}`)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-bold ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <MessageCircle className="w-4 h-4" />{t('myPage.comment')}
                      </button>
                      <button onClick={() => openShareModal(post)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-bold ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Share2 className="w-4 h-4" />{t('myPage.share')}
                      </button>
                      <button onClick={() => { toggleSavePost(post.id); toast.success(savedPosts.includes(post.id) ? t('myPage.unsave') : t('myPage.save')); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-colors text-xs font-bold ${savedPosts.includes(post.id) ? 'text-orange-600' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Bookmark className={`w-4 h-4 ${savedPosts.includes(post.id) ? 'fill-orange-600' : ''}`} />
                      </button>
                    </div>
                  </motion.div>
                )) : (
                  <EmptyState darkMode={darkMode} icon={<PenLine className="w-7 h-7 text-orange-600" />} title={t('myPage.noPosts')} desc={t('myPage.shareOnPage')} />
                )}
              </motion.div>
            )}

            {/* ── Ads Tab ── */}
            {activeTab === 'ads' && (
              <motion.div key="ads" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-4">
                {loadingListings ? (
                  <div className={`p-8 text-center rounded-2xl border ${cardBg}`}>
                    <RefreshCw className={`w-6 h-6 mx-auto mb-2 animate-spin ${textMuted}`} />
                  </div>
                ) : marketListings.length > 0 ? (
                  marketListings.map((listing) => (
                    <motion.div key={listing.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate(`/market/${listing.id}`)}
                      className={`rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md ${cardBg}`}>
                      <div className="flex items-start gap-3 p-4">
                        {listing.images?.[0] || (listing as any).image ? (
                          <img src={listing.images?.[0] || (listing as any).image} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className={`w-20 h-20 rounded-xl flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                            <ShoppingBag className={`w-8 h-8 ${textMuted}`} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-bold mb-1 ${textPrimary}`}>{listing.title}</h4>
                          {listing.description && (
                            <p className={`text-xs mb-2 line-clamp-2 ${textMuted}`}>{listing.description}</p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            {listing.price !== undefined && listing.price !== null && (
                              <span className="text-sm font-black text-orange-600">{listing.price.toLocaleString()} {listing.currency || 'ج.م'}</span>
                            )}
                            {listing.city && (
                              <span className={`text-[10px] flex items-center gap-0.5 ${textMuted}`}>
                                <MapPin className="w-3 h-3" />{listing.city}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px] font-bold ${textMuted}">
                            <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{listing.views_count || 0}</span>
                            <span className="flex items-center gap-0.5"><Bookmark className="w-3 h-3" />{listing.saves_count || 0}</span>
                            <span className="flex items-center gap-0.5"><MessageCircle className="w-3 h-3" />{listing.inquiries_count || 0}</span>
                          </div>
                        </div>
                        <ChevronLeft className={`w-4 h-4 flex-shrink-0 ${textMuted}`} />
                      </div>
                    </motion.div>
                  ))
                ) : myAds.length > 0 ? (
                  myAds.map(ad => (
                    <motion.div key={ad.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate(`/post/${ad.id}`)}
                      className={`rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md ${cardBg}`}>
                      <div className="flex items-start gap-3">
                        {ad.image && (() => {
                          let imgs: string[] = [];
                          try { const p = JSON.parse(ad.image); imgs = Array.isArray(p) ? p : [ad.image]; } catch { imgs = [ad.image]; }
                          return imgs.length > 0 ? <img src={imgs[0]} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" /> : null;
                        })()}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-relaxed mb-2 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{ad.content}</p>
                          {ad.price && <span className="text-sm font-black text-orange-600">{ad.price.toLocaleString()} {ad.currency}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <EmptyState darkMode={darkMode} icon={<ShoppingBag className="w-7 h-7 text-orange-600" />} title={t('myPage.noMarketListings')} desc={t('myPage.createFirstListing')} actionLabel={t('myPage.addListing')} onAction={() => navigate('/market')} />
                )}
              </motion.div>
            )}

            {/* ── Videos Tab ── */}
            {activeTab === 'videos' && (
              <motion.div key="videos" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}>
                {myVideos.length > 0 ? (
                  <>
                    <button onClick={() => navigate('/market-live')}
                      className={`w-full mb-3 flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-orange-900/20 text-orange-400' : 'bg-orange-50 text-orange-600'} text-xs font-bold hover:opacity-80 transition-opacity`}>
                      <span className="flex items-center gap-2">
                        <VideoIcon className="w-4 h-4" />
                        عرض جميع الفيديوهات ({myVideos.length})
                      </span>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="grid grid-cols-3 gap-1.5">
                      {myVideos.slice(0, 12).map((video: any, idx: number) => (
                        <button key={video.id || idx} onClick={() => navigate('/market-live')}
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
                            <div className="flex items-center gap-1 text-white text-[8px] font-bold">
                              <Eye className="w-2.5 h-2.5" />{(video.views || 0) >= 1000 ? ((video.views || 0) / 1000).toFixed(1) + 'K' : (video.views || 0)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState darkMode={darkMode} icon={<VideoIcon className="w-7 h-7 text-orange-600" />} title="لا توجد فيديوهات" desc="ابدأ بنشر فيديوهاتك في سوق لايف" actionLabel="الذهاب لسوق لايف" onAction={() => navigate('/market-live')} />
                )}
              </motion.div>
            )}

            {/* ── Saved Tab ── */}
            {activeTab === 'saved' && (
              <motion.div key="saved" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-3">
                {mySavedPosts.length > 0 ? mySavedPosts.map(post => (
                  <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => navigate(`/post/${post.id}`)}
                    className={`rounded-xl border p-3 cursor-pointer transition-colors ${cardBg} ${cardBgHover}`}>
                    <div className="flex items-start gap-3">
                      {post.image && <img src={post.image} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed mb-1 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{post.content}</p>
                        <span className={`text-[10px] ${textMuted}`}>{post.author.name} · {formatRelativeTimeAr(post.timestamp)}</span>
                      </div>
                      <Bookmark className="w-4 h-4 fill-orange-600 text-orange-600 flex-shrink-0" />
                    </div>
                  </motion.div>
                )) : (
                  <EmptyState darkMode={darkMode} icon={<Bookmark className="w-7 h-7 text-orange-600" />} title="لا توجد منشورات محفوظة" desc="احفظ المنشورات المهمة لتعود إليها لاحقاً" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── Activity Timeline (sidebar) ─── */}
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-5 ${cardBg} lg:sticky lg:top-4`}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                <Zap className="w-4 h-4" />
              </div>
              <h3 className={`font-black text-sm ${textPrimary}`}>{t('myPage.recentActivity')}</h3>
            </div>
            {recentActivity.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {recentActivity.map((act, idx) => (
                  <motion.div key={act.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                    className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getActivityColorClasses(act.color)}`}>
                      {act.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{act.text}</p>
                      <span className={`text-[10px] ${textMuted}`}>{act.time ? formatRelativeTimeAr(act.time) : ''}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className={`text-xs text-center py-6 ${textMuted}`}>لا يوجد نشاط بعد</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

// ─── Empty State helper ───────────────────────────────────────────────
const EmptyState: React.FC<{
  darkMode: boolean; icon: React.ReactNode; title: string; desc: string;
  actionLabel?: string; onAction?: () => void;
}> = ({ darkMode, icon, title, desc, actionLabel, onAction }) => (
  <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
    <div className={`w-16 h-16 mx-auto mb-3 flex items-center justify-center rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-orange-50'}`}>
      {icon}
    </div>
    <p className={`font-bold text-base mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</p>
    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
    {actionLabel && onAction && (
      <button onClick={onAction}
        className="mt-4 px-5 py-2.5 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all">
        {actionLabel}
      </button>
    )}
  </div>
);
