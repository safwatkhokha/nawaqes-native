// ─── Smart Reach (الوصول الذكي) Dashboard Page ──────────────────────────
// Comprehensive analytics, suggestions, and real-time monitoring for
// promoted posts and market listings on the Nawaqes platform.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import {
  ArrowRight,
  Eye,
  Zap,
  Activity,
  Wallet,
  Radar,
  BarChart3,
  TrendingUp,
  MapPin,
  Users,
  Clock,
  Sparkles,
  Target,
  Crown,
  Star,
  Flame,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Lightbulb,
  CalendarClock,
  DollarSign,
  ArrowUpRight,
  ThumbsUp,
  MessageCircle,
  Share2,
  Bookmark,
  Phone,
  ShoppingBag,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useSafeBack } from '../hooks/useSafeBack';
import { egyptianCities } from '../data/egyptianCities';
import { interestCategories } from '../config/interests';

// ═══════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════

interface ReachByDay { date: string; reach: number; }
interface Demographics {
  byCity: { city: string; count: number }[];
  byInterest: { interest: string; count: number }[];
  byAge: { range: string; count: number }[];
}
interface PromotionBreakdown {
  tier: string; count: number; totalReach: number; avgReach: number; totalSpent: number;
}
interface BestPerformingPromotion {
  id: string; type: string; title: string; tier: string;
  reach: number; engagement: number; targeting: string; createdAt: string;
}
interface TargetingEffectiveness {
  [key: string]: { count: number; avgReach: number };
}

interface StatsData {
  totalPromotions: number;
  activePromotions: number;
  totalReach: number;
  totalSpent: number;
  avgReachPerPromotion: number;
  reachEfficiency: number;
  demographics: Demographics;
  reachByDay: ReachByDay[];
  promotionBreakdown: PromotionBreakdown[];
  bestPerformingPromotion: BestPerformingPromotion | null;
  targetingEffectiveness: TargetingEffectiveness;
}

interface PromotionAnalyticsData {
  promotion: {
    id: string; type: string; title: string; tier: string; tierRaw: string;
    status: string; targeting: string; targetingRaw: string;
    targetCity: string; targetInterests: string[];
    startedAt: string | null; expiresAt: string | null; createdAt: string;
    reachCount: number; estimatedReach: number; spending: number;
  };
  reachOverTime: ReachByDay[];
  demographics: Demographics;
  engagementMetrics: Record<string, number>;
  costAnalysis: {
    totalSpent: number; costPerImpression: number; costPerEngagement: number;
    estimatedReach: number; actualReach: number; reachVsEstimated: number;
  };
}

interface SuggestionsData {
  bestPerformingTier: {
    tier: string; tierName: string; avgReach: number; reason: string;
  };
  recommendedTargeting: {
    type: string; typeName: string; suggestedCity: string;
    suggestedInterests: string[]; reason: string;
  };
  optimalPostingTimes: {
    bestHours: string[]; bestDays: string[]; reason: string;
  };
  budgetRecommendations: {
    currentAvgSpendPerPromotion: number; estimatedReachPerEGP: number;
    recommended: {
      tier: string; tierName: string; minBudget: number;
      recommendedBudget: number; maxBudget: number; estimatedReachAtRecommended: number;
    };
    reason: string;
  };
  tips: { tip: string; priority: 'high' | 'medium' | 'low' }[];
  dataPoints: number;
}

interface CompareData {
  tierComparison: {
    tier: string; tierName: string; count: number; avgReach: number;
    avgEngagement: number; totalSpent: number; avgCostPerReach: number;
  }[];
  targetingComparison: {
    type: string; typeName: string; count: number; avgReach: number;
    avgEngagement: number; totalSpent: number;
  }[];
  contentTypeComparison: {
    type: string; typeName: string; count: number; avgReach: number;
    avgEngagement: number; totalSpent: number;
  }[];
  crossComparison: any[];
  summary: {
    totalPromotions: number; bestTier: string | null;
    bestTargeting: string | null; bestContentType: string | null;
  };
}

interface RealtimeData {
  activePromotions: {
    id: string; type: string; title: string; tier: string; tierName: string;
    reachCount: number; estimatedReach: number; engagement: number;
    targeting: string; targetingName: string; timeRemaining: string | null;
    expiresAt: string | null; progress: number;
  }[];
  recentlyExpired: {
    id: string; type: string; title: string; tier: string; tierName: string;
    totalReach: number; totalEngagement: number; expiredAt: string;
  }[];
  aggregate: {
    totalActive: number; totalActiveReach: number; totalActiveEngagement: number;
    avgReachPerPromotion: number; avgEngagementPerPromotion: number;
  };
  lastUpdated: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════════════

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('ar-EG');
};

const getTierIcon = (tier: string) => {
  switch (tier) {
    case 'vip': return <Crown className="w-4 h-4" />;
    case 'premium': return <Star className="w-4 h-4" />;
    case 'standard': return <Zap className="w-4 h-4" />;
    default: return <Flame className="w-4 h-4" />;
  }
};

const getTierColor = (tier: string) => {
  switch (tier) {
    case 'vip': return 'from-yellow-500 to-amber-500';
    case 'premium': return 'from-purple-500 to-violet-500';
    case 'standard': return 'from-blue-500 to-cyan-500';
    default: return 'from-green-500 to-emerald-500';
  }
};

const getTierBgColor = (tier: string, darkMode: boolean) => {
  switch (tier) {
    case 'vip': return darkMode ? 'bg-yellow-900/20' : 'bg-yellow-50';
    case 'premium': return darkMode ? 'bg-purple-900/20' : 'bg-purple-50';
    case 'standard': return darkMode ? 'bg-blue-900/20' : 'bg-blue-50';
    default: return darkMode ? 'bg-green-900/20' : 'bg-green-50';
  }
};

const getTierTextColor = (tier: string) => {
  switch (tier) {
    case 'vip': return 'text-yellow-500';
    case 'premium': return 'text-purple-500';
    case 'standard': return 'text-blue-500';
    default: return 'text-green-500';
  }
};

const getProgressColor = (progress: number) => {
  if (progress >= 80) return 'bg-green-500';
  if (progress >= 50) return 'bg-yellow-500';
  return 'bg-orange-500';
};

const getPriorityBadge = (priority: 'high' | 'medium' | 'low', darkMode: boolean, t: (key: string) => string) => {
  switch (priority) {
    case 'high':
      return <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'}`}>{t('priority.urgent')}</span>;
    case 'medium':
      return <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600'}`}>{t('priority.medium')}</span>;
    case 'low':
      return <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>{t('priority.low')}</span>;
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════

export const SmartReachPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // ── Theme helpers ──────────────────────────────────────────────────
  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bgSection = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // ── State ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'compare' | 'suggestions' | 'realtime' | 'audience' | 'campaigns'>('overview');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsData | null>(null);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analytics tab state
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);
  const [promotionAnalytics, setPromotionAnalytics] = useState<PromotionAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Audience Builder state (NEW) ──────────────────────────────────
  const [audienceCities, setAudienceCities] = useState<string[]>([]);
  const [audienceInterests, setAudienceInterests] = useState<string[]>([]);
  const [audienceAgeMin, setAudienceAgeMin] = useState<number>(18);
  const [audienceAgeMax, setAudienceAgeMax] = useState<number>(45);
  const [audienceGender, setAudienceGender] = useState<'all' | 'male' | 'female'>('all');
  const [savedPresets, setSavedPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState('');

  // ── Campaign manager state (NEW) ──────────────────────────────────
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignBudget, setCampaignBudget] = useState('');
  const [campaignDuration, setCampaignDuration] = useState('7');
  const [campaignPostUrl, setCampaignPostUrl] = useState('');

  // Estimated reach calculation
  const estimatedReach = (() => {
    let base = 5000; // base reach
    // City multiplier: each city adds reach
    base *= Math.max(1, audienceCities.length);
    // Interest multiplier: each interest narrows but increases relevance
    if (audienceInterests.length > 0) {
      base = base * (1 - audienceInterests.length * 0.05); // narrowing
    }
    // Age range multiplier
    const ageSpan = audienceAgeMax - audienceAgeMin;
    base *= (0.6 + (ageSpan / 60)); // wider age = more reach
    // Gender filter
    if (audienceGender !== 'all') base *= 0.55; // narrowing to one gender
    return Math.max(200, Math.round(base));
  })();

  // Load saved presets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nawaqes_audience_presets');
      if (saved) setSavedPresets(JSON.parse(saved));
    } catch {}
    try {
      const savedCampaigns = localStorage.getItem('nawaqes_campaigns');
      if (savedCampaigns) setCampaigns(JSON.parse(savedCampaigns));
    } catch {}
  }, []);

  const savePreset = () => {
    if (!presetName.trim()) {
      toast.error(t('smartReach.presetNameRequired', 'أدخل اسماً للإعداد المسبق'));
      return;
    }
    const preset = {
      id: `preset_${Date.now()}`,
      name: presetName.trim(),
      cities: audienceCities,
      interests: audienceInterests,
      ageMin: audienceAgeMin,
      ageMax: audienceAgeMax,
      gender: audienceGender,
      estimatedReach,
      createdAt: new Date().toISOString(),
    };
    const updated = [...savedPresets, preset];
    setSavedPresets(updated);
    localStorage.setItem('nawaqes_audience_presets', JSON.stringify(updated));
    setPresetName('');
    toast.success(t('smartReach.presetSaved', 'تم حفظ الإعداد المسبق'));
  };

  const loadPreset = (preset: any) => {
    setAudienceCities(preset.cities || []);
    setAudienceInterests(preset.interests || []);
    setAudienceAgeMin(preset.ageMin || 18);
    setAudienceAgeMax(preset.ageMax || 45);
    setAudienceGender(preset.gender || 'all');
    toast.success(t('smartReach.presetLoaded', 'تم تحميل الإعداد المسبق'));
  };

  const deletePreset = (id: string) => {
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('nawaqes_audience_presets', JSON.stringify(updated));
  };

  const toggleCity = (cityId: string) => {
    setAudienceCities(prev => prev.includes(cityId) ? prev.filter(c => c !== cityId) : [...prev, cityId]);
  };

  const toggleInterest = (interestId: string) => {
    setAudienceInterests(prev => prev.includes(interestId) ? prev.filter(i => i !== interestId) : [...prev, interestId]);
  };

  const createCampaign = () => {
    const budget = parseFloat(campaignBudget);
    if (!budget || budget <= 0) {
      toast.error(t('smartReach.enterValidBudget', 'أدخل ميزانية صحيحة'));
      return;
    }
    if (budget > (currentUser?.walletBalance || 0)) {
      toast.error(t('smartReach.insufficientBalance', 'رصيد المحفظة غير كافٍ'));
      return;
    }
    const campaign = {
      id: `camp_${Date.now()}`,
      postUrl: campaignPostUrl || t('smartReach.untitledPost', 'منشور'),
      budget,
      duration: parseInt(campaignDuration) || 7,
      cities: audienceCities,
      interests: audienceInterests,
      ageRange: { min: audienceAgeMin, max: audienceAgeMax },
      gender: audienceGender,
      estimatedReach,
      impressions: Math.round(estimatedReach * 0.85),
      clicks: Math.round(estimatedReach * 0.07),
      spend: 0,
      status: 'active' as 'active' | 'paused',
      createdAt: new Date().toISOString(),
    };
    const updated = [campaign, ...campaigns];
    setCampaigns(updated);
    localStorage.setItem('nawaqes_campaigns', JSON.stringify(updated));
    setShowCampaignForm(false);
    setCampaignBudget('');
    setCampaignPostUrl('');
    toast.success(t('smartReach.campaignCreated', 'تم إنشاء الحملة بنجاح'));
  };

  const toggleCampaignStatus = (id: string) => {
    const updated = campaigns.map(c => c.id === id ? { ...c, status: c.status === 'active' ? 'paused' as const : 'active' as const } : c);
    setCampaigns(updated);
    localStorage.setItem('nawaqes_campaigns', JSON.stringify(updated));
  };

  const deleteCampaign = (id: string) => {
    const updated = campaigns.filter(c => c.id !== id);
    setCampaigns(updated);
    localStorage.setItem('nawaqes_campaigns', JSON.stringify(updated));
  };


  // ── Load data ──────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSmartReachStats();
      setStats(data as StatsData);
    } catch (err: any) {
      console.error('[SmartReach] Stats error:', err);
      setError(err.message || t('smartReach.errorFetchingData'));
    }
    setLoading(false);
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await api.getSmartReachSuggestions();
      setSuggestions(data as SuggestionsData);
    } catch (err) {
      console.error('[SmartReach] Suggestions error:', err);
    }
  }, []);

  const loadCompare = useCallback(async () => {
    try {
      const data = await api.getSmartReachCompare();
      setCompare(data as CompareData);
    } catch (err) {
      console.error('[SmartReach] Compare error:', err);
    }
  }, []);

  const loadRealtime = useCallback(async () => {
    try {
      const data = await api.getSmartReachRealtime();
      setRealtime(data as RealtimeData);
    } catch (err) {
      console.error('[SmartReach] Realtime error:', err);
    }
  }, []);

  const loadPromotionAnalytics = useCallback(async (id: string) => {
    setAnalyticsLoading(true);
    try {
      const data = await api.getSmartReachPromotionAnalytics(id);
      setPromotionAnalytics(data as PromotionAnalyticsData);
    } catch (err) {
      console.error('[SmartReach] Promotion analytics error:', err);
      toast.error(t('smartReach.errorFetchingPromotionAnalytics'));
    }
    setAnalyticsLoading(false);
  }, []);

  // Initial load
  useEffect(() => { loadStats(); }, [loadStats]);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'suggestions' && !suggestions) loadSuggestions();
    if (activeTab === 'compare' && !compare) loadCompare();
    if (activeTab === 'realtime') loadRealtime();
  }, [activeTab, suggestions, compare, loadSuggestions, loadCompare, loadRealtime]);

  // Auto-refresh realtime every 15 seconds
  useEffect(() => {
    if (activeTab !== 'realtime') return;
    const interval = setInterval(loadRealtime, 15000);
    return () => clearInterval(interval);
  }, [activeTab, loadRealtime]);

  // When stats loads and we have a best performing promotion, auto-select it for analytics
  useEffect(() => {
    if (stats?.bestPerformingPromotion && !selectedPromotionId) {
      setSelectedPromotionId(stats.bestPerformingPromotion.id);
      loadPromotionAnalytics(stats.bestPerformingPromotion.id);
    }
  }, [stats, selectedPromotionId, loadPromotionAnalytics]);

  // ── Computed ───────────────────────────────────────────────────────
  const maxReachByDay = useMemo(() => {
    if (!stats?.reachByDay?.length) return 1;
    return Math.max(...stats.reachByDay.map(d => d.reach), 1);
  }, [stats?.reachByDay]);

  // ── Tab config ─────────────────────────────────────────────────────
  const tabs = [
    { id: 'overview' as const, label: t('smartReach.tabOverview'), icon: Layers },
    { id: 'audience' as const, label: t('smartReach.tabAudience', 'الجمهور'), icon: Users },
    { id: 'campaigns' as const, label: t('smartReach.tabCampaigns', 'الحملات'), icon: Target },
    { id: 'analytics' as const, label: t('smartReach.tabAnalytics'), icon: BarChart3 },
    { id: 'compare' as const, label: t('smartReach.tabCompare'), icon: TrendingUp },
    { id: 'suggestions' as const, label: t('smartReach.tabSuggestions'), icon: Lightbulb },
    { id: 'realtime' as const, label: t('smartReach.tabRealtime'), icon: Activity },
  ];

  // ── Loading skeleton ───────────────────────────────────────────────
  if (loading && !stats) {
    return (
      <div className="max-w-2xl mx-auto overflow-x-hidden" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className="flex-1">
            <div className={`w-48 h-6 rounded-lg animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`w-64 h-4 rounded-lg animate-pulse mt-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`rounded-2xl border p-4 ${bgCard}`}>
              <div className={`w-9 h-9 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} mb-3`} />
              <div className={`w-16 h-7 rounded-lg animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} mb-2`} />
              <div className={`w-24 h-3 rounded-lg animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
        <div className={`rounded-2xl border p-5 ${bgCard}`}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`h-12 rounded-xl animate-pulse mb-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error && !stats) {
    return (
      <div className="max-w-2xl mx-auto overflow-x-hidden" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-xl font-black ${textPrimary}`}>{t('smartReach.title')}</h1>
        </div>
        <div className={`rounded-2xl border p-8 text-center ${bgCard}`}>
          <AlertCircle className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
          <p className={`font-bold mb-2 ${textPrimary}`}>{t('smartReach.errorLoadingData')}</p>
          <p className={`text-sm mb-4 ${textMuted}`}>{error}</p>
          <button
            onClick={loadStats}
            className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4 inline ml-2" />
            {t('smartReach.retry')}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-2xl mx-auto overflow-x-hidden" dir={dir}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-black flex items-center gap-2 ${textPrimary}`}>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25`}
            >
              <Radar className="w-5 h-5 text-white" />
            </motion.div>
            {t('smartReach.title')}
          </h1>
          <p className={`text-xs ${textMuted}`}>
            {t('smartReach.subtitle')}
          </p>
        </div>
        <button
          onClick={loadStats}
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          title={t('smartReach.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${textMuted}`} />
        </button>
      </div>

      {/* ── Stats Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: t('smartReach.totalReach'), value: stats?.totalReach || 0, icon: Eye, color: 'text-blue-500', bg: darkMode ? 'bg-blue-900/20' : 'bg-blue-50', gradient: 'from-blue-500 to-cyan-500' },
          { label: t('smartReach.promotionEfficiency'), value: stats?.reachEfficiency || 0, icon: Zap, color: 'text-green-500', bg: darkMode ? 'bg-green-900/20' : 'bg-green-50', gradient: 'from-green-500 to-emerald-500', suffix: t('smartReach.perEGP') },
          { label: t('smartReach.activePromotions'), value: stats?.activePromotions || 0, icon: Activity, color: 'text-purple-500', bg: darkMode ? 'bg-purple-900/20' : 'bg-purple-50', gradient: 'from-purple-500 to-violet-500' },
          { label: t('smartReach.totalSpent'), value: stats?.totalSpent || 0, icon: Wallet, color: 'text-orange-500', bg: darkMode ? 'bg-orange-900/20' : 'bg-orange-50', gradient: 'from-orange-500 to-amber-500', suffix: ' ' + t('smartReach.egp') },
        ].map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08, duration: 0.4 }}
            className={`rounded-2xl border p-4 ${bgCard} relative overflow-hidden`}
          >
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-l ${stat.gradient}`} />
            <div className="flex items-start justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <p className={`text-2xl font-black ${textPrimary}`}>
              {formatNumber(stat.value)}{stat.suffix || ''}
            </p>
            <p className={`text-[10px] font-bold ${textMuted}`}>{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────── */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25'
                : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.id === 'realtime' && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {/* ══════════════════ AUDIENCE BUILDER TAB (NEW) ══════════════════ */}
        {activeTab === 'audience' && (
          <motion.div
            key="audience"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Estimated Reach Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-2xl p-5 border bg-gradient-to-l ${
                darkMode
                  ? 'from-orange-900/30 to-amber-900/20 border-orange-800/30'
                  : 'from-orange-50 to-amber-50 border-orange-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[10px] font-bold ${darkMode ? 'text-orange-400/80' : 'text-orange-600/80'}`}>
                    {t('smartReach.estimatedReach', 'الوصول المقدر')}
                  </p>
                  <p className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {estimatedReach.toLocaleString()}
                  </p>
                  <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('smartReach.users', 'مستخدم')}
                  </p>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-orange-900/50' : 'bg-orange-100'}`}
                >
                  <Users className={`w-7 h-7 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                </motion.div>
              </div>
            </motion.div>

            {/* City Selector */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                  <MapPin className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.targetCities', 'المدن المستهدفة')}</h3>
                {audienceCities.length > 0 && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                    {audienceCities.length}
                  </span>
                )}
                {audienceCities.length > 0 && (
                  <button
                    onClick={() => setAudienceCities([])}
                    className={`ms-auto text-[10px] font-bold ${darkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                  >
                    {t('common.clear', 'مسح')}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                {egyptianCities.filter(c => c.isGovernorate).map(city => {
                  const selected = audienceCities.includes(city.id);
                  return (
                    <button
                      key={city.id}
                      onClick={() => toggleCity(city.id)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold text-start transition-all border ${
                        selected
                          ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white border-transparent shadow-md'
                          : darkMode
                            ? 'bg-gray-700/50 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="me-1">📍</span>
                      {city.nameAr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interests Selector */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
                  <Sparkles className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.targetInterests', 'الاهتمامات المستهدفة')}</h3>
                {audienceInterests.length > 0 && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                    {audienceInterests.length}
                  </span>
                )}
                {audienceInterests.length > 0 && (
                  <button
                    onClick={() => setAudienceInterests([])}
                    className={`ms-auto text-[10px] font-bold ${darkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                  >
                    {t('common.clear', 'مسح')}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                {interestCategories.map(intr => {
                  const selected = audienceInterests.includes(intr.id);
                  return (
                    <button
                      key={intr.id}
                      onClick={() => toggleInterest(intr.id)}
                      className={`px-3 py-2 rounded-xl text-[11px] font-bold text-start transition-all border flex items-center gap-1.5 ${
                        selected
                          ? `bg-gradient-to-l ${intr.color} text-white border-transparent shadow-md`
                          : darkMode
                            ? 'bg-gray-700/50 border-gray-700 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-50 border-gray-100 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span>{intr.icon}</span>
                      <span className="truncate">{t(intr.nameKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Age & Gender */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                  <Users className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.ageAndGender', 'العمر والجنس')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.ageMin', 'العمر من')}</label>
                  <input
                    type="number"
                    min={13}
                    max={80}
                    value={audienceAgeMin}
                    onChange={(e) => setAudienceAgeMin(Math.min(80, Math.max(13, parseInt(e.target.value) || 18)))}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-black text-center outline-none ${darkMode ? 'bg-gray-700 text-white border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.ageMax', 'العمر إلى')}</label>
                  <input
                    type="number"
                    min={13}
                    max={80}
                    value={audienceAgeMax}
                    onChange={(e) => setAudienceAgeMax(Math.min(80, Math.max(audienceAgeMin, parseInt(e.target.value) || 45)))}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-black text-center outline-none ${darkMode ? 'bg-gray-700 text-white border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2`}
                  />
                </div>
              </div>
              <div>
                <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.gender', 'الجنس')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all' as const, label: t('smartReach.all', 'الكل') },
                    { id: 'male' as const, label: t('smartReach.male', 'ذكور') },
                    { id: 'female' as const, label: t('smartReach.female', 'إناث') },
                  ].map(g => (
                    <button
                      key={g.id}
                      onClick={() => setAudienceGender(g.id)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        audienceGender === g.id
                          ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-md'
                          : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Save Preset */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                  <Star className={`w-4 h-4 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.savePreset', 'حفظ كإعداد مسبق')}</h3>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t('smartReach.presetNamePlaceholder', 'اسم الإعداد: شباب القاهرة...')}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold outline-none ${darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2`}
                />
                <button
                  onClick={savePreset}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-l from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('common.save', 'حفظ')}
                </button>
              </div>

              {/* Saved presets list */}
              {savedPresets.length > 0 && (
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto">
                  {savedPresets.map((preset) => (
                    <div key={preset.id} className={`rounded-xl p-3 ${bgSection} flex items-center gap-2`}>
                      <Star className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                      <button
                        onClick={() => loadPreset(preset)}
                        className="flex-1 text-start min-w-0"
                      >
                        <p className={`text-xs font-black truncate ${textPrimary}`}>{preset.name}</p>
                        <p className={`text-[9px] ${textMuted}`}>
                          {preset.cities?.length || 0} {t('smartReach.cities', 'مدن')} · {preset.interests?.length || 0} {t('smartReach.interests', 'اهتمامات')} · {preset.estimatedReach?.toLocaleString() || 0} {t('smartReach.users', 'مستخدم')}
                        </p>
                      </button>
                      <button
                        onClick={() => deletePreset(preset.id)}
                        className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-red-900/30 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ══════════════════ CAMPAIGNS TAB (NEW) ══════════════════ */}
        {activeTab === 'campaigns' && (
          <motion.div
            key="campaigns"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Wallet balance banner */}
            <div className={`rounded-2xl p-4 border flex items-center justify-between ${
              darkMode ? 'bg-gradient-to-l from-orange-900/30 to-amber-900/20 border-orange-800/30' : 'bg-gradient-to-l from-orange-50 to-amber-50 border-orange-100'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-600'}`}>
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-[10px] font-bold ${darkMode ? 'text-orange-400/80' : 'text-orange-600/80'}`}>{t('smartReach.walletBalance', 'رصيد المحفظة')}</p>
                  <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{(currentUser?.walletBalance || 0).toLocaleString()} {t('smartReach.egp')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCampaignForm(!showCampaignForm)}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-l from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('smartReach.newCampaign', 'حملة جديدة')}
              </button>
            </div>

            {/* New Campaign Form */}
            <AnimatePresence>
              {showCampaignForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className={`rounded-2xl border p-5 ${bgCard} space-y-3`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Target className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                      <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.createCampaign', 'إنشاء حملة جديدة')}</h3>
                    </div>
                    <div>
                      <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.postUrl', 'رابط المنشور (اختياري)')}</label>
                      <input
                        type="text"
                        value={campaignPostUrl}
                        onChange={(e) => setCampaignPostUrl(e.target.value)}
                        placeholder="/post/123"
                        dir="ltr"
                        className={`w-full px-3 py-2 rounded-xl text-xs font-bold outline-none ${darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2 text-start`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.budget', 'الميزانية')} ({t('smartReach.egp')})</label>
                        <input
                          type="number"
                          value={campaignBudget}
                          onChange={(e) => setCampaignBudget(e.target.value)}
                          placeholder="300"
                          className={`w-full px-3 py-2 rounded-xl text-sm font-black text-center outline-none ${darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2`}
                        />
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('smartReach.duration', 'المدة (أيام)')}</label>
                        <input
                          type="number"
                          value={campaignDuration}
                          onChange={(e) => setCampaignDuration(e.target.value)}
                          min={1}
                          max={30}
                          className={`w-full px-3 py-2 rounded-xl text-sm font-black text-center outline-none ${darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'} border focus:ring-2`}
                        />
                      </div>
                    </div>
                    {/* Audience summary */}
                    <div className={`rounded-xl p-3 ${bgSection}`}>
                      <p className={`text-[10px] font-bold ${textMuted} mb-1`}>{t('smartReach.targetAudience', 'الجمهور المستهدف')}</p>
                      <p className={`text-xs ${textSecondary}`}>
                        {audienceCities.length > 0
                          ? `${audienceCities.length} ${t('smartReach.cities', 'مدن')}`
                          : t('smartReach.allCities', 'كل المدن')}
                        {' · '}
                        {audienceInterests.length > 0
                          ? `${audienceInterests.length} ${t('smartReach.interests', 'اهتمامات')}`
                          : t('smartReach.allInterests', 'كل الاهتمامات')}
                        {' · '}
                        {audienceAgeMin}-{audienceAgeMax} {t('smartReach.years', 'سنة')}
                      </p>
                      <p className={`text-[11px] font-black mt-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        {t('smartReach.estimatedReach', 'الوصول المقدر')}: {estimatedReach.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={createCampaign}
                        className="flex-1 bg-gradient-to-l from-orange-500 to-amber-500 text-white py-3 rounded-xl text-xs font-black hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95 shadow-md"
                      >
                        {t('smartReach.launchCampaign', 'إطلاق الحملة')}
                      </button>
                      <button
                        onClick={() => setShowCampaignForm(false)}
                        className={`px-4 py-3 rounded-xl text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {t('common.cancel', 'إلغاء')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Campaigns list */}
            {campaigns.length > 0 ? (
              <div className="space-y-3">
                {campaigns.map((c, idx) => {
                  const remainingBudget = c.budget - c.spend;
                  const budgetPct = c.budget > 0 ? Math.round((c.spend / c.budget) * 100) : 0;
                  const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : '0';
                  const cpc = c.clicks > 0 ? (c.spend / c.clicks).toFixed(2) : '0';
                  const isActive = c.status === 'active';
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`rounded-2xl border p-4 ${bgCard}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? (darkMode ? 'bg-green-900/30' : 'bg-green-50') : (darkMode ? 'bg-gray-700' : 'bg-gray-100')}`}>
                            <Target className={`w-4 h-4 ${isActive ? (darkMode ? 'text-green-400' : 'text-green-600') : textMuted}`} />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-black truncate ${textPrimary}`}>{c.postUrl}</p>
                            <p className={`text-[9px] ${textMuted}`}>{c.duration} {t('smartReach.days', 'يوم')} · {c.budget.toLocaleString()} {t('smartReach.egp')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isActive ? (darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-600')}`}>
                            {isActive ? t('smartReach.active', 'نشط') : t('smartReach.paused', 'متوقف')}
                          </span>
                          <button
                            onClick={() => toggleCampaignStatus(c.id)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                            title={isActive ? t('smartReach.pause', 'إيقاف') : t('smartReach.resume', 'استئناف')}
                          >
                            {isActive ? <Clock className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteCampaign(c.id)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-700 hover:bg-red-900/30 text-gray-400 hover:text-red-400' : 'bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Live stats */}
                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                          <Eye className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                          <p className={`text-[11px] font-black ${textPrimary}`}>{Number(c.impressions).toLocaleString()}</p>
                          <p className={`text-[8px] ${textMuted}`}>{t('smartReach.impressions', 'ظهور')}</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                          <TrendingUp className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                          <p className={`text-[11px] font-black ${textPrimary}`}>{c.clicks}</p>
                          <p className={`text-[8px] ${textMuted}`}>{t('smartReach.clicks', 'نقرات')}</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                          <BarChart3 className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                          <p className={`text-[11px] font-black ${textPrimary}`}>{ctr}%</p>
                          <p className={`text-[8px] ${textMuted}`}>CTR</p>
                        </div>
                        <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                          <DollarSign className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                          <p className={`text-[11px] font-black ${textPrimary}`}>{cpc}</p>
                          <p className={`text-[8px] ${textMuted}`}>CPC</p>
                        </div>
                      </div>
                      {/* Budget progress */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold ${textMuted}`}>{t('smartReach.spent', 'المُنفق')}: {c.spend.toLocaleString()} / {c.budget.toLocaleString()} {t('smartReach.egp')}</span>
                          <span className={`text-[10px] font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>{budgetPct}%</span>
                        </div>
                        <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(budgetPct, 100)}%` }}
                            transition={{ duration: 0.6 }}
                            className={`h-full rounded-full ${budgetPct > 80 ? 'bg-gradient-to-l from-red-500 to-rose-400' : 'bg-gradient-to-l from-orange-500 to-amber-400'}`}
                          />
                        </div>
                        <p className={`text-[9px] mt-1 ${textMuted}`}>{t('smartReach.remaining', 'متبقي')}: {remainingBudget.toLocaleString()} {t('smartReach.egp')}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className={`rounded-2xl border p-8 text-center ${bgCard}`}>
                <Target className={`w-12 h-12 mx-auto mb-3 ${textMuted}`} />
                <p className={`font-bold ${textPrimary}`}>{t('smartReach.noCampaigns', 'لا توجد حملات بعد')}</p>
                <p className={`text-xs mt-1 ${textMuted}`}>{t('smartReach.noCampaignsDesc', 'ابدأ بإنشاء حملتك الأولى لزيادة وصول منشوراتك')}</p>
                <button
                  onClick={() => setShowCampaignForm(true)}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-l from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('smartReach.createFirstCampaign', 'إنشاء أول حملة')}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Reach by Day Chart */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                  <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.dailyReach')}</h3>
                <span className={`text-[9px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                  {t('smartReach.last14Days')}
                </span>
              </div>

              {stats?.reachByDay && stats.reachByDay.length > 0 ? (
                <div className="flex items-end gap-1.5 h-32">
                  {stats.reachByDay.map((day, idx) => (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className={`text-[8px] font-bold ${textMuted}`}>
                        {day.reach > 0 ? formatNumber(day.reach) : ''}
                      </span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(4, (day.reach / maxReachByDay) * 100)}%` }}
                        transition={{ delay: idx * 0.04, duration: 0.5 }}
                        className={`w-full rounded-t-md bg-gradient-to-t from-orange-500 to-amber-400 min-h-[4px]`}
                      />
                      <span className={`text-[7px] ${textMuted}`}>
                        {new Date(day.date).getDate()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`p-8 text-center rounded-xl ${bgSection}`}>
                  <BarChart3 className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                  <p className={`text-sm font-bold ${textMuted}`}>{t('smartReach.noReachDataYet')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('smartReach.startPromotingToSeeData')}</p>
                </div>
              )}
            </div>

            {/* Promotion Breakdown by Tier */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                  <Layers className={`w-4 h-4 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.tierBreakdown')}</h3>
              </div>

              {stats?.promotionBreakdown && stats.promotionBreakdown.length > 0 ? (
                <div className="space-y-3">
                  {stats.promotionBreakdown.map((pb, idx) => {
                    const tierKey = ['vip', 'premium', 'standard', 'basic'].find(tier => pb.tier === (tier === 'vip' ? 'VIP' : tier === 'premium' ? t('smartReach.tierPremium') : tier === 'standard' ? t('smartReach.tierStandard') : t('smartReach.tierBasic'))) || 'basic';
                    return (
                      <motion.div
                        key={pb.tier}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className={`rounded-xl p-3 border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg ${getTierBgColor(tierKey, darkMode)} flex items-center justify-center ${getTierTextColor(tierKey)}`}>
                              {getTierIcon(tierKey)}
                            </div>
                            <div>
                              <span className={`text-sm font-bold ${textSecondary}`}>{pb.tier}</span>
                              <p className={`text-[9px] ${textMuted}`}>{pb.count} {t('smartReach.promotion')}</p>
                            </div>
                          </div>
                          <div className="text-left">
                            <p className={`text-sm font-black ${textPrimary}`}>{formatNumber(pb.totalReach)}</p>
                            <p className={`text-[9px] ${textMuted}`}>{t('smartReach.average')}: {formatNumber(pb.avgReach)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, (pb.avgReach / Math.max(...stats.promotionBreakdown.map(p => p.avgReach), 1)) * 100)}%` }}
                              transition={{ delay: idx * 0.1, duration: 0.5 }}
                              className={`h-full rounded-full bg-gradient-to-l ${getTierColor(tierKey)}`}
                            />
                          </div>
                          <span className={`text-[10px] font-bold ${textMuted}`}>{pb.totalSpent} {t('smartReach.egp')}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className={`p-6 text-center rounded-xl ${bgSection}`}>
                  <Layers className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                  <p className={`text-sm font-bold ${textMuted}`}>{t('smartReach.noPromotionsYet')}</p>
                </div>
              )}
            </div>

            {/* Targeting Effectiveness */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                  <Target className={`w-4 h-4 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.targetingEffectiveness')}</h3>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'all', label: t('smartReach.all'), icon: Users, color: 'text-blue-500', bg: darkMode ? 'bg-blue-900/20' : 'bg-blue-50' },
                  { key: 'city', label: t('smartReach.byCity'), icon: MapPin, color: 'text-green-500', bg: darkMode ? 'bg-green-900/20' : 'bg-green-50' },
                  { key: 'interests', label: t('smartReach.byInterests'), icon: Sparkles, color: 'text-purple-500', bg: darkMode ? 'bg-purple-900/20' : 'bg-purple-50' },
                ].map(targeting => {
                  const data = stats?.targetingEffectiveness?.[targeting.key];
                  return (
                    <div key={targeting.key} className={`rounded-xl p-3 text-center ${bgSection}`}>
                      <div className={`w-8 h-8 rounded-lg ${targeting.bg} flex items-center justify-center mx-auto mb-2`}>
                        <targeting.icon className={`w-4 h-4 ${targeting.color}`} />
                      </div>
                      <p className={`text-lg font-black ${textPrimary}`}>{formatNumber(data?.avgReach || 0)}</p>
                      <p className={`text-[9px] font-bold ${textMuted}`}>{targeting.label}</p>
                      <p className={`text-[8px] ${textMuted}`}>{data?.count || 0} {t('smartReach.promotion')}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Best Performing Promotion */}
            {stats?.bestPerformingPromotion && (
              <div className={`rounded-2xl border p-5 ${
                darkMode ? 'bg-gradient-to-br from-orange-900/20 to-amber-900/20 border-orange-800/40' : 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-orange-900/30' : 'bg-orange-100'}`}>
                    <Sparkles className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.bestPerformingPromotion')}</h3>
                </div>

                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getTierColor('standard')} flex items-center justify-center text-white flex-shrink-0`}>
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold line-clamp-2 ${textSecondary}`}>
                      {stats.bestPerformingPromotion.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold ${getTierTextColor('standard')}`}>
                        {stats.bestPerformingPromotion.tier}
                      </span>
                      <span className={`text-[9px] ${textMuted}`}>•</span>
                      <span className={`text-[10px] ${textMuted}`}>
                        {stats.bestPerformingPromotion.targeting}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1">
                        <Eye className={`w-3.5 h-3.5 ${textMuted}`} />
                        <span className={`text-xs font-black ${textPrimary}`}>{formatNumber(stats.bestPerformingPromotion.reach)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Activity className={`w-3.5 h-3.5 ${textMuted}`} />
                        <span className={`text-xs font-black ${textPrimary}`}>{formatNumber(stats.bestPerformingPromotion.engagement)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State for No Promotions */}
            {stats && stats.totalPromotions === 0 && (
              <div className={`rounded-2xl border p-8 text-center ${bgCard}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <Radar className={`w-8 h-8 ${textMuted}`} />
                </div>
                <p className={`font-bold text-lg ${textPrimary}`}>{t('smartReach.startYourSmartReachJourney')}</p>
                <p className={`text-sm mt-2 ${textMuted}`}>
                  {t('smartReach.promoteToReachThousands')}
                </p>
                <button
                  onClick={() => safeBack()}
                  className="mt-4 bg-gradient-to-l from-orange-500 to-amber-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-orange-500/25 active:scale-95 transition-all"
                >
                  {t('smartReach.browsePostsToPromote')}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════ ANALYTICS TAB ══════════════════ */}
        {activeTab === 'analytics' && (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Promotion Selector */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                  <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.selectPromotionForAnalysis')}</h3>
              </div>

              <div className="relative">
                <select
                  value={selectedPromotionId || ''}
                  onChange={(e) => {
                    setSelectedPromotionId(e.target.value);
                    if (e.target.value) loadPromotionAnalytics(e.target.value);
                  }}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-bold appearance-none cursor-pointer ${
                    darkMode
                      ? 'bg-gray-700 text-white border-gray-600 focus:ring-orange-500'
                      : 'bg-gray-50 text-gray-900 border-gray-200 focus:ring-orange-500'
                  } border focus:outline-none focus:ring-2`}
                >
                  <option value="">{t('smartReach.selectPromotionPlaceholder')}</option>
                  {stats?.bestPerformingPromotion && (
                    <option value={stats.bestPerformingPromotion.id}>
                      {stats.bestPerformingPromotion.title.slice(0, 40)}... ({stats.bestPerformingPromotion.tier})
                    </option>
                  )}
                </select>
                <ChevronDown className={`absolute top-3 left-3 w-4 h-4 ${textMuted} pointer-events-none`} />
              </div>
            </div>

            {analyticsLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`h-24 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                ))}
              </div>
            )}

            {promotionAnalytics && !analyticsLoading && (
              <>
                {/* Demographics Section */}
                <div className={`rounded-2xl border p-5 ${bgCard}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-cyan-900/30' : 'bg-cyan-50'}`}>
                      <Users className={`w-4 h-4 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
                    </div>
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.demographics')}</h3>
                  </div>

                  {/* By City */}
                  {promotionAnalytics.demographics.byCity.length > 0 && (
                    <div className="mb-4">
                      <p className={`text-[10px] font-black ${textMuted} uppercase tracking-wider mb-2`}>{t('smartReach.byCity')}</p>
                      <div className="space-y-2">
                        {promotionAnalytics.demographics.byCity.slice(0, 5).map((city, idx) => {
                          const maxCount = promotionAnalytics.demographics.byCity[0]?.count || 1;
                          return (
                            <div key={city.city} className="flex items-center gap-2">
                              <MapPin className={`w-3 h-3 ${textMuted} flex-shrink-0`} />
                              <span className={`text-[11px] font-bold ${textSecondary} w-20 truncate`}>{city.city}</span>
                              <div className={`h-4 flex-1 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(city.count / maxCount) * 100}%` }}
                                  transition={{ delay: idx * 0.08, duration: 0.5 }}
                                  className="h-full rounded-full bg-gradient-to-l from-cyan-500 to-teal-500 flex items-center justify-end px-2"
                                >
                                  <span className="text-[8px] font-black text-white">{city.count}</span>
                                </motion.div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* By Interest */}
                  {promotionAnalytics.demographics.byInterest.length > 0 && (
                    <div className="mb-4">
                      <p className={`text-[10px] font-black ${textMuted} uppercase tracking-wider mb-2`}>{t('smartReach.byInterests')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {promotionAnalytics.demographics.byInterest.slice(0, 8).map((interest) => (
                          <span
                            key={interest.interest}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                              darkMode ? 'bg-purple-900/30 text-purple-300 border border-purple-800/40' : 'bg-purple-50 text-purple-700 border border-purple-100'
                            }`}
                          >
                            {interest.interest} ({interest.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* By Age */}
                  {promotionAnalytics.demographics.byAge.length > 0 && (
                    <div>
                      <p className={`text-[10px] font-black ${textMuted} uppercase tracking-wider mb-2`}>{t('smartReach.byAge')}</p>
                      <div className="flex items-end gap-1.5 h-20">
                        {promotionAnalytics.demographics.byAge.map((age, idx) => {
                          const maxAgeCount = Math.max(...promotionAnalytics.demographics.byAge.map(a => a.count), 1);
                          return (
                            <div key={age.range} className="flex-1 flex flex-col items-center gap-1">
                              <span className={`text-[8px] font-bold ${textMuted}`}>{age.count}</span>
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${(age.count / maxAgeCount) * 100}%` }}
                                transition={{ delay: idx * 0.08, duration: 0.5 }}
                                className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-blue-400 min-h-[4px]"
                              />
                              <span className={`text-[7px] ${textMuted}`}>{age.range}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {promotionAnalytics.demographics.byCity.length === 0 &&
                   promotionAnalytics.demographics.byInterest.length === 0 &&
                   promotionAnalytics.demographics.byAge.length === 0 && (
                    <div className={`p-6 text-center rounded-xl ${bgSection}`}>
                      <Users className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                      <p className={`text-sm font-bold ${textMuted}`}>{t('smartReach.demographicsWillAppear')}</p>
                    </div>
                  )}
                </div>

                {/* Reach Over Time */}
                <div className={`rounded-2xl border p-5 ${bgCard}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-orange-900/30' : 'bg-orange-50'}`}>
                      <TrendingUp className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.reachOverTime')}</h3>
                  </div>

                  {promotionAnalytics.reachOverTime.length > 0 ? (
                    <div className="flex items-end gap-1.5 h-28">
                      {promotionAnalytics.reachOverTime.map((day, idx) => {
                        const maxR = Math.max(...promotionAnalytics.reachOverTime.map(d => d.reach), 1);
                        return (
                          <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max(4, (day.reach / maxR) * 100)}%` }}
                              transition={{ delay: idx * 0.03, duration: 0.5 }}
                              className={`w-full rounded-t-md min-h-[4px] ${
                                day.reach > 0 ? 'bg-gradient-to-t from-orange-500 to-amber-400' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                              }`}
                            />
                            <span className={`text-[7px] ${textMuted}`}>{new Date(day.date).getDate()}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`text-sm text-center py-4 ${textMuted}`}>{t('smartReach.noReachData')}</p>
                  )}
                </div>

                {/* Engagement Metrics */}
                <div className={`rounded-2xl border p-5 ${bgCard}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-pink-900/30' : 'bg-pink-50'}`}>
                      <Activity className={`w-4 h-4 ${darkMode ? 'text-pink-400' : 'text-pink-600'}`} />
                    </div>
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.engagementMetrics')}</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'likes', label: t('smartReach.likes'), icon: ThumbsUp, color: 'text-blue-500' },
                      { key: 'comments', label: t('smartReach.comments'), icon: MessageCircle, color: 'text-green-500' },
                      { key: 'shares', label: t('smartReach.shares'), icon: Share2, color: 'text-purple-500' },
                      { key: 'saves', label: t('smartReach.saves'), icon: Bookmark, color: 'text-yellow-500' },
                      { key: 'inquiries', label: t('smartReach.inquiries'), icon: Phone, color: 'text-orange-500' },
                      { key: 'clicks', label: t('smartReach.clicks'), icon: ArrowUpRight, color: 'text-cyan-500' },
                    ].filter(m => (promotionAnalytics.engagementMetrics[m.key] || 0) > 0).map(metric => (
                      <div key={metric.key} className={`rounded-xl p-3 text-center ${bgSection}`}>
                        <metric.icon className={`w-4 h-4 ${metric.color} mx-auto mb-1`} />
                        <p className={`text-sm font-black ${textPrimary}`}>
                          {formatNumber(promotionAnalytics.engagementMetrics[metric.key] || 0)}
                        </p>
                        <p className={`text-[9px] font-bold ${textMuted}`}>{metric.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Analysis */}
                <div className={`rounded-2xl border p-5 ${bgCard}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                      <DollarSign className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                    </div>
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.costAnalysis')}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                      <p className={`text-lg font-black ${textPrimary}`}>
                        {promotionAnalytics.costAnalysis.costPerImpression.toFixed(2)}
                      </p>
                      <p className={`text-[9px] font-bold ${textMuted}`}>{t('smartReach.costPerImpression')} ({t('smartReach.egp')})</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                      <p className={`text-lg font-black ${textPrimary}`}>
                        {promotionAnalytics.costAnalysis.costPerEngagement.toFixed(2)}
                      </p>
                      <p className={`text-[9px] font-bold ${textMuted}`}>{t('smartReach.costPerEngagement')} ({t('smartReach.egp')})</p>
                    </div>
                  </div>

                  {/* Reach vs Estimated */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-bold ${textMuted}`}>
                        {t('smartReach.actualVsEstimatedReach')}
                      </span>
                      <span className={`text-[10px] font-black ${textPrimary}`}>
                        {promotionAnalytics.costAnalysis.reachVsEstimated}%
                      </span>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, promotionAnalytics.costAnalysis.reachVsEstimated)}%` }}
                        transition={{ duration: 0.8 }}
                        className={`h-full rounded-full ${getProgressColor(promotionAnalytics.costAnalysis.reachVsEstimated)}`}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-[9px] ${textMuted}`}>
                        {t('smartReach.actual')}: {formatNumber(promotionAnalytics.costAnalysis.actualReach)}
                      </span>
                      <span className={`text-[9px] ${textMuted}`}>
                        {t('smartReach.estimated')}: {formatNumber(promotionAnalytics.costAnalysis.estimatedReach)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!promotionAnalytics && !analyticsLoading && !selectedPromotionId && (
              <div className={`rounded-2xl border p-8 text-center ${bgCard}`}>
                <BarChart3 className={`w-12 h-12 mx-auto mb-3 ${textMuted}`} />
                <p className={`font-bold ${textPrimary}`}>{t('smartReach.selectPromotionForDetails')}</p>
                <p className={`text-sm mt-1 ${textMuted}`}>{t('smartReach.promotionDetailsWillAppear')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════ COMPARE TAB ══════════════════ */}
        {activeTab === 'compare' && (
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Tier Comparison */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                  <Crown className={`w-4 h-4 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.tierComparison')}</h3>
              </div>

              {compare?.tierComparison && compare.tierComparison.length > 0 ? (
                <div className="space-y-3">
                  {compare.tierComparison.map((tc, idx) => {
                    const tierKey = ['vip', 'premium', 'standard', 'basic'].find(tier =>
                      tc.tierName === (tier === 'vip' ? 'VIP' : tier === 'premium' ? t('smartReach.tierPremium') : tier === 'standard' ? t('smartReach.tierStandard') : t('smartReach.tierBasic'))
                    ) || tc.tier;
                    return (
                      <motion.div
                        key={tc.tier}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className={`rounded-xl p-3 border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg ${getTierBgColor(tierKey, darkMode)} flex items-center justify-center ${getTierTextColor(tierKey)}`}>
                              {getTierIcon(tierKey)}
                            </div>
                            <span className={`text-sm font-bold ${textSecondary}`}>{tc.tierName}</span>
                          </div>
                          <span className={`text-[9px] font-bold ${textMuted}`}>{tc.count} {t('smartReach.promotion')}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                            <p className={`text-xs font-black ${textPrimary}`}>{formatNumber(tc.avgReach)}</p>
                            <p className={`text-[8px] ${textMuted}`}>{t('smartReach.avgReach')}</p>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                            <p className={`text-xs font-black ${textPrimary}`}>{formatNumber(tc.avgEngagement)}</p>
                            <p className={`text-[8px] ${textMuted}`}>{t('smartReach.avgEngagement')}</p>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                            <p className={`text-xs font-black ${textPrimary}`}>{tc.avgCostPerReach.toFixed(2)}</p>
                            <p className={`text-[8px] ${textMuted}`}>{t('smartReach.egpPerReach')}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className={`p-6 text-center rounded-xl ${bgSection}`}>
                  <Crown className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                  <p className={`text-sm font-bold ${textMuted}`}>{t('smartReach.notEnoughDataForComparison')}</p>
                </div>
              )}
            </div>

            {/* Targeting Comparison */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                  <Target className={`w-4 h-4 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.targetingComparison')}</h3>
              </div>

              {compare?.targetingComparison && compare.targetingComparison.length > 0 ? (
                <div className="space-y-3">
                  {compare.targetingComparison.map((tc, idx) => {
                    const icons: Record<string, React.ReactNode> = {
                      all: <Users className="w-4 h-4" />,
                      city: <MapPin className="w-4 h-4" />,
                      interests: <Sparkles className="w-4 h-4" />,
                    };
                    const colors: Record<string, string> = {
                      all: 'text-blue-500',
                      city: 'text-green-500',
                      interests: 'text-purple-500',
                    };
                    return (
                      <div key={tc.type} className={`rounded-xl p-3 border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={colors[tc.type] || 'text-gray-500'}>{icons[tc.type]}</span>
                            <span className={`text-sm font-bold ${textSecondary}`}>{tc.typeName}</span>
                          </div>
                          <span className={`text-[9px] font-bold ${textMuted}`}>{tc.count} {t('smartReach.promotion')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                            <p className={`text-xs font-black ${textPrimary}`}>{formatNumber(tc.avgReach)}</p>
                            <p className={`text-[8px] ${textMuted}`}>{t('smartReach.avgReach')}</p>
                          </div>
                          <div className={`rounded-lg p-2 text-center ${bgSection}`}>
                            <p className={`text-xs font-black ${textPrimary}`}>{formatNumber(tc.avgEngagement)}</p>
                            <p className={`text-[8px] ${textMuted}`}>{t('smartReach.avgEngagement')}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-sm text-center py-4 ${textMuted}`}>{t('smartReach.notEnoughData')}</p>
              )}
            </div>

            {/* Content Type Comparison */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-pink-900/30' : 'bg-pink-50'}`}>
                  <ShoppingBag className={`w-4 h-4 ${darkMode ? 'text-pink-400' : 'text-pink-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.contentTypeComparison')}</h3>
              </div>

              {compare?.contentTypeComparison && compare.contentTypeComparison.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {compare.contentTypeComparison.map((ct) => {
                    const isPost = ct.type === 'post';
                    return (
                      <div key={ct.type} className={`rounded-xl p-3 text-center border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${
                          isPost
                            ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-50')
                            : (darkMode ? 'bg-pink-900/30' : 'bg-pink-50')
                        }`}>
                          {isPost
                            ? <TrendingUp className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            : <ShoppingBag className={`w-5 h-5 ${darkMode ? 'text-pink-400' : 'text-pink-600'}`} />
                          }
                        </div>
                        <p className={`text-sm font-bold ${textSecondary}`}>{ct.typeName}</p>
                        <p className={`text-lg font-black ${textPrimary}`}>{formatNumber(ct.avgReach)}</p>
                        <p className={`text-[9px] ${textMuted}`}>{t('smartReach.avgReach')}</p>
                        <p className={`text-[9px] ${textMuted} mt-1`}>{ct.count} {t('smartReach.promotion')}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-sm text-center py-4 ${textMuted}`}>{t('smartReach.notEnoughData')}</p>
              )}
            </div>

            {/* Summary */}
            {compare?.summary && (
              <div className={`rounded-2xl border p-5 ${
                darkMode ? 'bg-gradient-to-br from-orange-900/20 to-amber-900/20 border-orange-800/40' : 'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.comparisonSummary')}</h3>
                </div>
                <div className="space-y-2">
                  {compare.summary.bestTier && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className={`text-xs ${textSecondary}`}>
                        {t('smartReach.bestTier')}: <strong>{compare.summary.bestTier}</strong>
                      </span>
                    </div>
                  )}
                  {compare.summary.bestTargeting && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className={`text-xs ${textSecondary}`}>
                        {t('smartReach.bestTargeting')}: <strong>{compare.summary.bestTargeting}</strong>
                      </span>
                    </div>
                  )}
                  {compare.summary.bestContentType && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className={`text-xs ${textSecondary}`}>
                        {t('smartReach.bestContentType')}: <strong>{compare.summary.bestContentType}</strong>
                      </span>
                    </div>
                  )}
                  <p className={`text-[10px] ${textMuted} mt-2`}>
                    {t('smartReach.basedOnPromotions', { count: compare.summary.totalPromotions })}
                  </p>
                </div>
              </div>
            )}

            {!compare && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════ SUGGESTIONS TAB ══════════════════ */}
        {activeTab === 'suggestions' && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Best Tier Recommendation */}
            {suggestions?.bestPerformingTier && (
              <div className={`rounded-2xl border p-5 ${
                darkMode ? 'bg-gradient-to-br from-purple-900/20 to-violet-900/20 border-purple-800/40' : 'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
                    <Crown className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.recommendedTier')}</h3>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getTierColor(suggestions.bestPerformingTier.tier)} flex items-center justify-center text-white shadow-lg`}>
                    {getTierIcon(suggestions.bestPerformingTier.tier)}
                  </div>
                  <div>
                    <p className={`text-lg font-black ${textPrimary}`}>{suggestions.bestPerformingTier.tierName}</p>
                    {suggestions.bestPerformingTier.avgReach > 0 && (
                      <p className={`text-xs ${textMuted}`}>{t('smartReach.avgReach')}: {formatNumber(suggestions.bestPerformingTier.avgReach)}</p>
                    )}
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{suggestions.bestPerformingTier.reason}</p>
              </div>
            )}

            {/* Recommended Targeting */}
            {suggestions?.recommendedTargeting && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                    <Target className={`w-4 h-4 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.recommendedTargeting')}</h3>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-sm font-black ${textPrimary}`}>{suggestions.recommendedTargeting.typeName}</span>
                  {suggestions.recommendedTargeting.suggestedCity && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'}`}>
                      📍 {suggestions.recommendedTargeting.suggestedCity}
                    </span>
                  )}
                </div>
                {suggestions.recommendedTargeting.suggestedInterests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {suggestions.recommendedTargeting.suggestedInterests.map(interest => (
                      <span key={interest} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        darkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-50 text-purple-600'
                      }`}>
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{suggestions.recommendedTargeting.reason}</p>
              </div>
            )}

            {/* Optimal Posting Times */}
            {suggestions?.optimalPostingTimes && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                    <CalendarClock className={`w-4 h-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.bestPostingTimes')}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className={`rounded-xl p-3 ${bgSection}`}>
                    <p className={`text-[9px] font-black ${textMuted} uppercase tracking-wider mb-2`}>{t('smartReach.bestHours')}</p>
                    <div className="space-y-1.5">
                      {suggestions.optimalPostingTimes.bestHours.map(hour => (
                        <div key={hour} className="flex items-center gap-2">
                          <Clock className={`w-3 h-3 ${textMuted}`} />
                          <span className={`text-xs font-bold ${textPrimary}`}>{hour}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={`rounded-xl p-3 ${bgSection}`}>
                    <p className={`text-[9px] font-black ${textMuted} uppercase tracking-wider mb-2`}>{t('smartReach.bestDays')}</p>
                    <div className="space-y-1.5">
                      {suggestions.optimalPostingTimes.bestDays.map(day => (
                        <div key={day} className="flex items-center gap-2">
                          <CalendarClock className={`w-3 h-3 ${textMuted}`} />
                          <span className={`text-xs font-bold ${textPrimary}`}>{day}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{suggestions.optimalPostingTimes.reason}</p>
              </div>
            )}

            {/* Budget Recommendations */}
            {suggestions?.budgetRecommendations && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                    <Wallet className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.budgetRecommendations')}</h3>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                    <p className={`text-sm font-black ${textPrimary}`}>
                      {suggestions.budgetRecommendations.recommended.minBudget}
                    </p>
                    <p className={`text-[9px] font-bold ${textMuted}`}>{t('smartReach.minimum')}</p>
                    <p className={`text-[8px] ${textMuted}`}>{t('smartReach.egp')}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center border-2 ${darkMode ? 'border-orange-600 bg-orange-900/20' : 'border-orange-400 bg-orange-50'}`}>
                    <p className={`text-sm font-black text-orange-500`}>
                      {suggestions.budgetRecommendations.recommended.recommendedBudget}
                    </p>
                    <p className={`text-[9px] font-bold text-orange-500`}>{t('smartReach.recommended')}</p>
                    <p className={`text-[8px] ${textMuted}`}>{t('smartReach.egp')}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                    <p className={`text-sm font-black ${textPrimary}`}>
                      {suggestions.budgetRecommendations.recommended.maxBudget}
                    </p>
                    <p className={`text-[9px] font-bold ${textMuted}`}>{t('smartReach.maximum')}</p>
                    <p className={`text-[8px] ${textMuted}`}>{t('smartReach.egp')}</p>
                  </div>
                </div>

                {suggestions.budgetRecommendations.estimatedReachPerEGP > 0 && (
                  <div className={`rounded-lg p-2 ${bgSection} mb-3 text-center`}>
                    <p className={`text-[9px] ${textMuted}`}>{t('smartReach.estimatedReachPerPound')}</p>
                    <p className={`text-sm font-black ${textPrimary}`}>
                      {suggestions.budgetRecommendations.estimatedReachPerEGP} {t('smartReach.viewsPerEGP')}
                    </p>
                  </div>
                )}

                <p className={`text-xs leading-relaxed ${textSecondary}`}>{suggestions.budgetRecommendations.reason}</p>
              </div>
            )}

            {/* Tips */}
            {suggestions?.tips && suggestions.tips.length > 0 && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}>
                    <Lightbulb className={`w-4 h-4 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.tipsForImprovement')}</h3>
                </div>

                <div className="space-y-3">
                  {suggestions.tips.map((tip, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`rounded-xl p-3 border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">{getPriorityBadge(tip.priority, darkMode, t)}</div>
                        <p className={`text-xs leading-relaxed ${textSecondary}`}>{tip.tip}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Points Notice */}
            {suggestions && (
              <div className={`text-center ${textMuted}`}>
                <p className={`text-[10px]`}>{t('smartReach.basedOnDataPoints', { count: suggestions.dataPoints })}</p>
              </div>
            )}

            {!suggestions && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
        )}

        {/* ══════════════════ REALTIME TAB ══════════════════ */}
        {activeTab === 'realtime' && (
          <motion.div
            key="realtime"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Live indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-green-500 text-white px-2.5 py-1 rounded-full font-bold animate-pulse flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {t('smartReach.live')}
                </span>
                <span className={`text-[10px] ${textMuted}`}>
                  {t('smartReach.lastUpdate')}: {realtime?.lastUpdated ? new Date(realtime.lastUpdated).toLocaleTimeString('ar-EG') : '...'}
                </span>
              </div>
              <button
                onClick={loadRealtime}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <RefreshCw className={`w-4 h-4 ${textMuted}`} />
              </button>
            </div>

            {/* Aggregate Stats */}
            {realtime?.aggregate && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl border p-4 ${bgCard} relative overflow-hidden`}>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-green-500 to-emerald-500" />
                  <div className={`w-8 h-8 rounded-lg ${darkMode ? 'bg-green-900/20' : 'bg-green-50'} flex items-center justify-center mb-2`}>
                    <Activity className="w-4 h-4 text-green-500" />
                  </div>
                  <p className={`text-xl font-black ${textPrimary}`}>{realtime.aggregate.totalActive}</p>
                  <p className={`text-[10px] font-bold ${textMuted}`}>{t('smartReach.activePromotion')}</p>
                </div>
                <div className={`rounded-2xl border p-4 ${bgCard} relative overflow-hidden`}>
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-blue-500 to-cyan-500" />
                  <div className={`w-8 h-8 rounded-lg ${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'} flex items-center justify-center mb-2`}>
                    <Eye className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className={`text-xl font-black ${textPrimary}`}>{formatNumber(realtime.aggregate.totalActiveReach)}</p>
                  <p className={`text-[10px] font-bold ${textMuted}`}>{t('smartReach.totalReachLabel')}</p>
                </div>
              </div>
            )}

            {/* Active Promotions */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                  <Zap className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.activePromotionsList')}</h3>
              </div>

              {realtime?.activePromotions && realtime.activePromotions.length > 0 ? (
                <div className="space-y-3">
                  {realtime.activePromotions.map((promo, idx) => (
                    <motion.div
                      key={promo.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`rounded-xl p-3 border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-8 h-8 rounded-lg ${getTierBgColor(promo.tier, darkMode)} flex items-center justify-center ${getTierTextColor(promo.tier)}`}>
                            {getTierIcon(promo.tier)}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold ${textSecondary} truncate`}>{promo.title.slice(0, 40)}</p>
                            <div className="flex items-center gap-1">
                              <span className={`text-[9px] ${textMuted}`}>{promo.tierName}</span>
                              <span className={`text-[9px] ${textMuted}`}>•</span>
                              <span className={`text-[9px] ${textMuted}`}>{promo.targetingName}</span>
                            </div>
                          </div>
                        </div>
                        {promo.timeRemaining && (
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'}`}>
                            <Clock className="w-3 h-3 text-orange-500" />
                            <span className="text-[10px] font-bold text-orange-500">{promo.timeRemaining}</span>
                          </div>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold ${textMuted}`}>
                            {formatNumber(promo.reachCount)} / {formatNumber(promo.estimatedReach)}
                          </span>
                          <span className={`text-[10px] font-bold ${textPrimary}`}>{promo.progress}%</span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${promo.progress}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.1 }}
                            className={`h-full rounded-full ${getProgressColor(promo.progress)}`}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className={`p-6 text-center rounded-xl ${bgSection}`}>
                  <Zap className={`w-10 h-10 mx-auto mb-3 ${textMuted}`} />
                  <p className={`text-sm font-bold ${textMuted}`}>{t('smartReach.noActivePromotions')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('smartReach.activePromotionsWillAppear')}</p>
                </div>
              )}
            </div>

            {/* Recently Expired */}
            {realtime?.recentlyExpired && realtime.recentlyExpired.length > 0 && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <Clock className={`w-4 h-4 ${textMuted}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('smartReach.recentlyExpired')}</h3>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                    {t('smartReach.last24Hours')}
                  </span>
                </div>

                <div className="space-y-2">
                  {realtime.recentlyExpired.map((promo, idx) => (
                    <motion.div
                      key={promo.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`rounded-xl p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-lg ${darkMode ? 'bg-gray-600' : 'bg-gray-200'} flex items-center justify-center ${textMuted}`}>
                            {getTierIcon(promo.tier)}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold ${textMuted} truncate`}>{promo.title.slice(0, 35)}</p>
                            <span className={`text-[9px] ${textMuted}`}>{promo.tierName}</span>
                          </div>
                        </div>
                        <div className="text-left flex-shrink-0">
                          <p className={`text-xs font-bold ${textMuted}`}>{formatNumber(promo.totalReach)} {t('smartReach.reach')}</p>
                          <p className={`text-[9px] ${textMuted}`}>{formatNumber(promo.totalEngagement)} {t('smartReach.engagement')}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {!realtime && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
