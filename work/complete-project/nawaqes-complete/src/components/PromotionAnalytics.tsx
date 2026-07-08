import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { promotionPackages } from '../data/promotionPackages';
import { marketPromotionPackages } from '../data/marketPromotionPackages';
import { api } from '../services/api';
import {
  ArrowRight, Zap, TrendingUp, Clock, BarChart3, CheckCircle2,
  XCircle, AlertCircle, Eye, Wallet, Sparkles, ShoppingBag,
  Megaphone, Target,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr, getTimeRemaining as getTimeRemainingUtil } from '../utils/time';
import { useSafeBack } from '../hooks/useSafeBack';

// ─── Market Promotion Type ─────────────────────────────────────────────
interface MarketPromotionItem {
  id: string;
  listing_id: string;
  tier: string;
  package_name?: string;
  price: number;
  duration?: number;
  estimated_reach?: number;
  targeting?: string;
  target_city?: string;
  target_interests?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  created_at?: string;
}

// ─── Promotion Status Badge ───────────────────────────────────────────
function getStatusBadge(status: string, darkMode: boolean, t: (key: string) => string) {
  switch (status) {
    case 'approved':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-700'}`}>
          <CheckCircle2 className="w-3 h-3" />{t('promotions.accepted')}
        </span>
      );
    case 'rejected':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700'}`}>
          <XCircle className="w-3 h-3" />{t('promotions.rejected')}
        </span>
      );
    case 'expired':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
          <Clock className="w-3 h-3" />{t('promotions.expired')}
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
          <AlertCircle className="w-3 h-3" />{t('promotions.underReview')}
        </span>
      );
  }
}

export const PromotionAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode, promotionRequests, posts } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // ─── API Stats State ──────────────────────────────────────────────
  const [apiStats, setApiStats] = useState<any>(null);

  // ─── Market Promotions State ──────────────────────────────────────
  const [marketPromotions, setMarketPromotions] = useState<MarketPromotionItem[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'market'>('posts');

  // Fetch API stats for accurate numbers
  useEffect(() => {
    if (!currentUser) return;
    api.getSmartReachStats()
      .then((data: any) => {
        if (data) setApiStats(data);
      })
      .catch(() => {
        // silently ignore - will fall back to local computation
      });
  }, [currentUser]);

  // Fetch market promotions
  useEffect(() => {
    if (!currentUser) return;
    api.getMyMarketPromotions()
      .then((data: any) => {
        if (Array.isArray(data)) {
          setMarketPromotions(data);
        }
      })
      .catch(() => {
        // silently ignore
      });
  }, [currentUser]);

  // ─── Post Promotions ──────────────────────────────────────────────
  const myPostPromotions = useMemo(() => {
    if (!currentUser) return [];
    return promotionRequests.filter(r =>
      (r.postAuthor && r.postAuthor.id === currentUser.id) ||
      (r as any).authorId === currentUser.id
    );
  }, [promotionRequests, currentUser]);

  const postTotalSpent = useMemo(() => {
    return myPostPromotions.reduce((sum, p) => sum + p.price, 0);
  }, [myPostPromotions]);

  const postTotalReach = useMemo(() => {
    return myPostPromotions.reduce((sum, promo) => {
      const post = posts.find(p => p.id === promo.postId);
      return sum + (post?.reachCount || 0);
    }, 0);
  }, [myPostPromotions, posts]);

  const postActiveCount = useMemo(() => {
    return myPostPromotions.filter(p => p.status === 'approved').length;
  }, [myPostPromotions]);

  // ─── Market Promotions Computed ───────────────────────────────────
  const marketTotalSpent = useMemo(() => {
    return marketPromotions.reduce((sum, p) => sum + (p.price || 0), 0);
  }, [marketPromotions]);

  const marketActiveCount = useMemo(() => {
    return marketPromotions.filter(p => p.status === 'approved').length;
  }, [marketPromotions]);

  // ─── Market Reach ──────────────────────────────────────────────
  const marketTotalReach = useMemo(() => {
    return marketPromotions
      .filter(p => p.status === 'approved')
      .reduce((sum, p) => sum + ((p as any).reach_count || 0), 0);
  }, [marketPromotions]);

  // ─── Combined Stats (prefer API stats when available) ────────────
  const totalSpent = apiStats?.totalSpent ?? (postTotalSpent + marketTotalSpent);
  const totalReach = apiStats?.totalReach ?? (postTotalReach + marketTotalReach);
  const activePromotionsCount = apiStats?.activePromotions ?? (postActiveCount + marketActiveCount);
  const costPerReach = totalReach > 0 ? (totalSpent / totalReach) : 0;

  // ─── Post Promotion Helpers ──────────────────────────────────────
  const getPostProgressPercentage = (promo: typeof myPostPromotions[0]) => {
    const post = posts.find(p => p.id === promo.postId);
    if (!post) return 0;
    const reach = post.reachCount || 0;
    const estimated = promo.estimatedReach || post?.estimatedReach || promotionPackages.find(p => p.id === promo.tier)?.estimatedReach || 500;
    return Math.min(100, Math.round((reach / estimated) * 100));
  };

  const getPostTimeRemaining = (promo: typeof myPostPromotions[0]) => {
    if (promo.status !== 'approved') return null;
    const post = posts.find(p => p.id === promo.postId);
    if (!post?.promotionExpiresAt) return null;
    const remaining = getTimeRemainingUtil(post.promotionExpiresAt);
    if (remaining === 'منتهي') return t('promotions.expired');
    return remaining;
  };

  const getPostPromotionStartedAt = (promo: typeof myPostPromotions[0]): string | null => {
    if (promo.status !== 'approved') return null;
    const post = posts.find(p => p.id === promo.postId);
    if (!post?.promotionStartedAt) return null;
    return post.promotionStartedAt;
  };

  const postMaxReach = useMemo(() => {
    return Math.max(...myPostPromotions.map(promo => {
      const post = posts.find(p => p.id === promo.postId);
      return post?.reachCount || 0;
    }), 1);
  }, [myPostPromotions, posts]);

  if (!currentUser) return null;

  return (
    <div className="max-w-2xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('promotions.title')}</h1>
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('promotions.trackPerformance')}</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className={`rounded-2xl p-4 text-center relative overflow-hidden ${darkMode ? 'bg-gradient-to-br from-orange-900/40 to-amber-900/20 border border-orange-800/30' : 'bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent" />
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-2 ${darkMode ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-600'}`}>
              <Wallet className="w-5 h-5" />
            </div>
            <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{totalSpent.toLocaleString()}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-orange-400/70' : 'text-orange-600/70'}`}>{t('promotions.totalSpending')}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`rounded-2xl p-4 text-center relative overflow-hidden ${darkMode ? 'bg-gradient-to-br from-blue-900/40 to-cyan-900/20 border border-blue-800/30' : 'bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-2 ${darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
              <Eye className="w-5 h-5" />
            </div>
            <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{totalReach.toLocaleString()}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-blue-400/70' : 'text-blue-600/70'}`}>{t('promotions.totalReach')}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`rounded-2xl p-4 text-center relative overflow-hidden ${darkMode ? 'bg-gradient-to-br from-green-900/40 to-emerald-900/20 border border-green-800/30' : 'bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent" />
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-2 ${darkMode ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-600'}`}>
              <Zap className="w-5 h-5" />
            </div>
            <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{activePromotionsCount}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-green-400/70' : 'text-green-600/70'}`}>{t('promotions.activePromotions')}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`rounded-2xl p-4 text-center relative overflow-hidden ${darkMode ? 'bg-gradient-to-br from-purple-900/40 to-pink-900/20 border border-purple-800/30' : 'bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-2 ${darkMode ? 'bg-purple-900/50 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
              <Target className="w-5 h-5" />
            </div>
            <p className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{costPerReach > 0 ? costPerReach.toFixed(2) : '—'}</p>
            <p className={`text-[10px] font-bold mt-0.5 ${darkMode ? 'text-purple-400/70' : 'text-purple-600/70'}`}>{t('promotions.costPerReach', 'تكلفة الوصول')}</p>
          </div>
        </motion.div>
      </div>

      {/* Tabs: Posts vs Market */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'posts'
              ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {t('promotions.title')}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
            activeTab === 'posts' ? 'bg-white/20 text-white' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
          }`}>
            {myPostPromotions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('market')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'market'
              ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          {t('market.smartMarket', 'السوق الذكي')}
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
            activeTab === 'market' ? 'bg-white/20 text-white' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
          }`}>
            {marketPromotions.length}
          </span>
        </button>
      </div>

      {/* ─── Post Promotions Tab ──────────────────────────────────── */}
      {activeTab === 'posts' && (
        <>
          {/* Mini Bar Chart */}
          {myPostPromotions.length > 0 && (
            <div className={`rounded-2xl border p-5 mb-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('promotions.reachPerPromotion')}</h3>
              </div>
              <div className="space-y-2">
                {myPostPromotions.map((promo, idx) => {
                  const post = posts.find(p => p.id === promo.postId);
                  const reach = post?.reachCount || 0;
                  const barWidth = postMaxReach > 0 ? Math.max(5, (reach / postMaxReach) * 100) : 5;
                  const pkg = promotionPackages.find(p => p.id === promo.tier);
                  return (
                    <div key={promo.id} className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold w-20 truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {promo.postContent.slice(0, 15)}...
                      </span>
                      <div className={`flex-1 h-6 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.5, delay: idx * 0.1 }}
                          className={`h-full rounded-full bg-gradient-to-l ${pkg?.color || 'from-orange-500 to-orange-600'} flex items-center justify-end px-2`}
                        >
                          <span className="text-[9px] font-black text-white">{reach.toLocaleString()}</span>
                        </motion.div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post Promotion List */}
          {myPostPromotions.length > 0 ? (
            <div className="space-y-3">
              {myPostPromotions.map((promo, idx) => {
                const post = posts.find(p => p.id === promo.postId);
                const pkg = promotionPackages.find(p => p.id === promo.tier);
                const progress = getPostProgressPercentage(promo);
                const timeRemaining = getPostTimeRemaining(promo);
                const reach = post?.reachCount || 0;
                const estimated = promo.estimatedReach || post?.estimatedReach || pkg?.estimatedReach || 500;

                return (
                  <motion.div
                    key={promo.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                      darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'
                    }`}
                    onClick={() => navigate(`/post/${promo.postId}`)}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold leading-relaxed mb-1 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {promo.postContent}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-l ${pkg?.color || 'from-orange-500 to-orange-600'} text-white`}>
                              {pkg?.icon} {pkg?.name || promo.tier}
                            </span>
                            {getStatusBadge(promo.status, darkMode, t)}
                          </div>
                        </div>
                        <span className={`text-lg font-black flex-shrink-0 mr-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {promo.price} <span className="text-xs">{t('common.egp')}</span>
                        </span>
                      </div>

                      {/* Reach Progress */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('promotions.reach')} {reach.toLocaleString()} / {estimated.toLocaleString()}
                          </span>
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {progress}%
                          </span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.05 }}
                            className={`h-full rounded-full ${
                              progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                            }`}
                          />
                        </div>
                      </div>

                      {timeRemaining && (
                        <div className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <Clock className="w-3 h-3" />
                          <span>{t('promotions.timeRemaining')} {timeRemaining}</span>
                        </div>
                      )}

                      {promo.status === 'approved' && getPostPromotionStartedAt(promo) ? (
                        <div className={`flex items-center gap-1 text-[10px] mt-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                          <Sparkles className="w-3 h-3" />
                          <span>بدأ الترويج {formatRelativeTimeAr(getPostPromotionStartedAt(promo)!)}</span>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-1 text-[10px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Sparkles className="w-3 h-3" />
                          <span>{t('promotions.requested')} {formatRelativeTimeAr(String(promo.createdAt))}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <TrendingUp className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
              </div>
              <p className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>{t('promotions.noPromotions')}</p>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t('promotions.noPromotionsDesc')}</p>
              <button
                onClick={() => safeBack()}
                className="mt-4 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-700 active:scale-95 transition-all"
              >
                {t('promotions.browseAds')}
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Market Promotions Tab ────────────────────────────────── */}
      {activeTab === 'market' && (
        <>
          {marketPromotions.length > 0 ? (
            <div className="space-y-3">
              {marketPromotions.map((promo, idx) => {
                const pkg = marketPromotionPackages.find(p => p.id === promo.tier);
                return (
                  <motion.div
                    key={promo.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                      darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'
                    }`}
                    onClick={() => navigate(`/market/listing/${promo.listing_id}`)}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <ShoppingBag className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                            <span className={`text-sm font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                              {promo.package_name || pkg?.name || promo.tier}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {pkg && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-gradient-to-br ${pkg.color} text-white`}>
                                {pkg.icon} {pkg.name}
                              </span>
                            )}
                            {getStatusBadge(promo.status, darkMode, t)}
                          </div>
                        </div>
                        <span className={`text-lg font-black flex-shrink-0 mr-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {promo.price} <span className="text-xs">{t('common.egp')}</span>
                        </span>
                      </div>

                      {/* Package Details */}
                      {pkg && (
                        <div className={`flex items-center gap-3 mb-2 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {pkg.duration} أيام
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {(promo.estimated_reach || pkg.estimatedReach)?.toLocaleString('ar-EG')} وصول
                          </span>
                          <span className="flex items-center gap-1">
                            <Megaphone className="w-3 h-3" />
                            {(pkg.maxNotifications)?.toLocaleString('ar-EG')} إشعار
                          </span>
                        </div>
                      )}

                      {/* Market Reach Progress */}
                      {promo.status === 'approved' && (
                        <div className="mb-2">
                          {(() => {
                            const reach = (promo as any).reach_count || 0;
                            const estimated = promo.estimated_reach || pkg?.estimatedReach || 500;
                            const progress = Math.min(100, Math.round((reach / estimated) * 100));
                            return (
                              <>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {t('promotions.reach')} {reach.toLocaleString()} / {estimated.toLocaleString()}
                                  </span>
                                  <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {progress}%
                                  </span>
                                </div>
                                <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.8, delay: idx * 0.05 }}
                                    className={`h-full rounded-full ${
                                      progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
                                    }`}
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* Targeting Info */}
                      {promo.targeting && promo.targeting !== 'all' && (
                        <div className={`text-[10px] font-bold mb-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {promo.targeting === 'city' && `📍 استهداف مدن`}
                          {promo.targeting === 'interests' && `🎯 استهداف اهتمامات`}
                        </div>
                      )}

                      {/* Created date */}
                      <div className={`flex items-center gap-1 text-[10px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        <Sparkles className="w-3 h-3" />
                        <span>{promo.status === 'approved' ? 'بدأ الترويج' : 'تم الطلب'} {promo.created_at ? formatRelativeTimeAr(promo.created_at) : ''}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <ShoppingBag className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
              </div>
              <p className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                {t('market.noPromotedAds', 'لا توجد إعلانات مروّجة')}
              </p>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                قم بترويج إعلاناتك في السوق الذكي لتصل لآلاف المهتمين
              </p>
              <button
                onClick={() => navigate('/market')}
                className="mt-4 bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-700 active:scale-95 transition-all"
              >
                تصفح السوق
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
