// ─── My Market Listings — User's Own Listing Management ─────────────────
// Shows the current user's market listings with management capabilities:
// stats, tabs, listing cards, promotion modal, delete confirmation.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { api } from '../services/api';
import { marketPromotionPackages } from '../data/marketPromotionPackages';
import { interestCategories } from '../config/interests';
import { egyptianCities, getCityNameAr, regionLabels, regionOrder, searchCities } from '../data/egyptianCities';
import {
  ArrowRight,
  Plus,
  Store,
  Eye,
  Heart,
  MessageCircle,
  Star,
  Zap,
  Trash2,
  Edit3,
  Megaphone,
  Package,
  ShoppingBag,
  TrendingUp,
  Loader2,
  X,
  CheckCircle2,
  Pause,
  Play,
  Check,
  ChevronDown,
  AlertTriangle,
  MapPin,
  Wallet,
  ShieldCheck,
  Target,
  Clock,
  BadgeCheck,
  Sparkles,
  Search,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useSafeBack } from '../hooks/useSafeBack';

// ─── Types ──────────────────────────────────────────────────────────────
type TabType = 'active' | 'promoted' | 'expired';

interface MyListingData {
  id: string;
  title: string;
  description: string;
  images: string[];
  price?: number;
  currency?: string;
  category: string;
  condition: 'new' | 'used' | 'refurbished';
  location?: string;
  city?: string;
  is_promoted?: boolean;
  promotion_status?: string;
  promotion_tier?: string;
  promotion_package?: string;
  promotion_expires_at?: string;
  views_count?: number;
  saves_count?: number;
  inquiries_count?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface MyPromotionData {
  id: string;
  listing_id: string;
  package_id: string;
  package_name?: string;
  price: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  targeting?: string;
  target_city?: string;
  target_cities?: string[];
  target_interests?: string[];
  created_at?: string;
  expires_at?: string;
}

// ─── Condition Labels ──────────────────────────────────────────────────
const conditionLabels: Record<string, { key: string; color: string; darkColor: string }> = {
  new: { key: 'common.newCondition', color: 'bg-emerald-100 text-emerald-700', darkColor: 'bg-emerald-900/40 text-emerald-400' },
  used: { key: 'common.used', color: 'bg-amber-100 text-amber-700', darkColor: 'bg-amber-900/40 text-amber-400' },
  refurbished: { key: 'common.refurbished', color: 'bg-sky-100 text-sky-700', darkColor: 'bg-sky-900/40 text-sky-400' },
};

// ─── Promotion Status Labels ───────────────────────────────────────────
const promotionStatusLabels: Record<string, { key: string; color: string; darkColor: string }> = {
  pending: { key: 'market.promotionPending', color: 'bg-amber-100 text-amber-700', darkColor: 'bg-amber-900/40 text-amber-400' },
  approved: { key: 'market.promotionApproved', color: 'bg-emerald-100 text-emerald-700', darkColor: 'bg-emerald-900/40 text-emerald-400' },
  expired: { key: 'market.promotionExpired', color: 'bg-gray-100 text-gray-600', darkColor: 'bg-gray-800/50 text-gray-500' },
  rejected: { key: 'market.promotionRejected', color: 'bg-red-100 text-red-700', darkColor: 'bg-red-900/40 text-red-400' },
};

// ─── Price Formatting ──────────────────────────────────────────────────
function formatPrice(t: (key: string) => string, price: number | undefined, currency?: string): string {
  if (!price || price <= 0) return '';
  return `${price.toLocaleString('ar-EG')} ${currency || t('common.egp')}`;
}

// ─── Time Ago ──────────────────────────────────────────────────────────
function timeAgo(t: (key: string, options?: Record<string, unknown>) => string, dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = parseDBTimestamp(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('common.now');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return t('common.weeksAgo', { count: diffWeeks });
    return date.toLocaleDateString('ar-EG');
  } catch {
    return '';
  }
}

// ─── Get Category Icon ─────────────────────────────────────────────────
function getCategoryIcon(categoryId: string): string {
  const cat = interestCategories.find(c => c.id === categoryId);
  return cat?.icon || '📦';
}

function getCategoryName(categoryId: string): string {
  const cat = interestCategories.find(c => c.id === categoryId);
  return cat?.nameKey || categoryId;
}

// ─── Main Component ────────────────────────────────────────────────────
interface MyMarketListingsProps {
  initialTab?: TabType;
}

export const MyMarketListings: React.FC<MyMarketListingsProps> = ({ initialTab = 'active' }) => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  // ─── State ────────────────────────────────────────────────────────
  const [listings, setListings] = useState<MyListingData[]>([]);
  const [promotions, setPromotions] = useState<MyPromotionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [promotingListing, setPromotingListing] = useState<MyListingData | null>(null);
  const [promotionStep, setPromotionStep] = useState<'package' | 'targeting' | 'confirm'>('package');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [submittingPromotion, setSubmittingPromotion] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(currentUser?.walletBalance ?? 0);

  // ─── Fetch Data ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listingsData, promosData, walletData] = await Promise.all([
        api.getMyMarketListings().catch(() => []),
        api.getMyMarketPromotions().catch(() => []),
        api.getWalletBalance().catch(() => ({ balance: 0 })),
      ]);
      setListings(Array.isArray(listingsData) ? listingsData : []);
      setPromotions(Array.isArray(promosData) ? promosData : []);
      setWalletBalance(walletData?.balance ?? currentUser?.walletBalance ?? 0);
    } catch {
      setListings([]);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.walletBalance]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Computed Stats ──────────────────────────────────────────────
  const activeListings = listings.filter(l => l.status !== 'deleted' && l.status !== 'sold');
  const promotedListings = listings.filter(l => l.is_promoted && l.promotion_status === 'approved');
  const expiredListings = listings.filter(l => l.status === 'deleted' || l.status === 'sold');
  const totalViews = listings.reduce((sum, l) => sum + (l.views_count || 0), 0);
  const totalInquiries = listings.reduce((sum, l) => sum + (l.inquiries_count || 0), 0);

  // ─── Filter by Tab ──────────────────────────────────────────────
  const filteredListings = activeTab === 'active'
    ? activeListings
    : activeTab === 'promoted'
      ? promotedListings
      : expiredListings;

  // ─── Get Promotion for Listing ───────────────────────────────────
  const getPromotionForListing = useCallback((listingId: string): MyPromotionData | undefined => {
    return promotions.find(p => p.listing_id === listingId);
  }, [promotions]);

  // ─── Handle Delete ───────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteMarketListing(id);
      setListings(prev => prev.map(l => l.id === id ? { ...l, status: 'deleted' } : l));
      toast.success(t('market.deleteListingSuccess'));
    } catch (err: any) {
      toast.error(err.message || t('market.deleteListingFailed'));
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  // ─── Handle Promotion ────────────────────────────────────────────
  const openPromotionModal = (listing: MyListingData) => {
    setPromotingListing(listing);
    setPromotionStep('package');
    setSelectedPackage(null);
    setSelectedCities([]);
    setSelectedInterests([]);
  };

  const closePromotionModal = () => {
    setPromotingListing(null);
    setPromotionStep('package');
    setSelectedPackage(null);
    setSelectedCities([]);
    setSelectedInterests([]);
  };

  const handleSelectPackage = (pkgId: string) => {
    setSelectedPackage(pkgId);
    const pkg = marketPromotionPackages.find(p => p.id === pkgId);
    if (pkg?.targeting === 'city' || pkg?.targeting === 'interests') {
      setPromotionStep('targeting');
    } else {
      setPromotionStep('confirm');
    }
  };

  const toggleCitySelection = (cityId: string) => {
    setSelectedCities(prev =>
      prev.includes(cityId)
        ? prev.filter(id => id !== cityId)
        : [...prev, cityId]
    );
  };

  const toggleInterestSelection = (interestId: string) => {
    setSelectedInterests(prev =>
      prev.includes(interestId)
        ? prev.filter(id => id !== interestId)
        : [...prev, interestId]
    );
  };

  const handleConfirmPromotion = async () => {
    if (!promotingListing || !selectedPackage) return;
    const pkg = marketPromotionPackages.find(p => p.id === selectedPackage);
    if (!pkg) return;

    // Wallet check
    if (walletBalance < pkg.price) {
      toast.error(t('market.insufficientWalletBalance'));
      return;
    }

    setSubmittingPromotion(true);
    try {
      const promotionData: Record<string, any> = {
        listingId: promotingListing.id,
        tier: selectedPackage,
        packageName: pkg.name,
        price: pkg.price,
        duration: pkg.duration,
        estimatedReach: pkg.estimatedReach,
      };

      if (pkg.targeting === 'city' && selectedCities.length > 0) {
        promotionData.targetCities = selectedCities;
        promotionData.targetCity = selectedCities[0];
        promotionData.targeting = 'city';
      } else if (pkg.targeting === 'interests' && selectedInterests.length > 0) {
        promotionData.targetInterests = selectedInterests;
        promotionData.targeting = 'interests';
      } else {
        promotionData.targeting = 'all';
      }

      await api.requestMarketPromotion(promotionData);
      toast.success(t('market.promotionRequestSuccess'));
      closePromotionModal();
      // Refresh data
      fetchData();
    } catch (err: any) {
      toast.error(err.message || t('market.promotionRequestFailed'));
    } finally {
      setSubmittingPromotion(false);
    }
  };

  // ─── Tab Config ──────────────────────────────────────────────────
  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'active', label: t('market.tabActive'), count: activeListings.length },
    { id: 'promoted', label: t('market.tabPromoted'), count: promotedListings.length },
    { id: 'expired', label: t('market.tabExpired'), count: expiredListings.length },
  ];

  // ─── Selected Package Details ────────────────────────────────────
  const selectedPackageData = selectedPackage
    ? marketPromotionPackages.find(p => p.id === selectedPackage)
    : null;

  // ─── Loading State ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto pb-24" dir={dir}>
        {/* Header skeleton */}
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} />
          <div className="flex-1">
            <div className={`h-6 w-48 rounded-lg animate-pulse mb-1 ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} />
            <div className={`h-4 w-32 rounded animate-pulse ${darkMode ? 'bg-gray-800' : 'bg-gray-200'}`} />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`rounded-xl p-3 border animate-pulse ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className={`h-6 w-10 rounded mx-auto mb-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className={`h-3 w-16 rounded mx-auto ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
        {/* Cards skeleton */}
        {[1, 2, 3].map(i => (
          <div key={i} className={`rounded-2xl border p-4 mb-3 animate-pulse ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <div className="flex gap-3">
              <div className={`w-24 h-24 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-5 w-3/4 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-4 w-1/3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-3 w-1/2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-24" dir={dir}>
      {/* ═══════════════════════════════════════════════════════════════
          1. HEADER
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                darkMode
                  ? 'bg-gradient-to-br from-orange-600 to-amber-600'
                  : 'bg-gradient-to-br from-orange-500 to-amber-500'
              } shadow-lg shadow-orange-200`}>
                <Store className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {t('market.myMarketListings')}
                  </h1>
                  <span className={`flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    darkMode ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {listings.length}
                  </span>
                </div>
                <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('market.manageAndPromote')}
                </p>
              </div>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/market/new')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-colors ${
              darkMode
                ? 'bg-gradient-to-l from-orange-600 to-amber-600 text-white shadow-orange-900/30'
                : 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-orange-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('market.addListing')}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          2. STATS SUMMARY
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-2 mb-5"
      >
        {/* Total Listings */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
          }`}>
            <ShoppingBag className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {activeListings.length.toLocaleString('ar-EG')}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.totalListings')}
          </p>
        </div>

        {/* Promoted Count */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
          }`}>
            <Zap className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {promotedListings.length.toLocaleString('ar-EG')}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.promotedStat')}
          </p>
        </div>

        {/* Total Views */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-50 text-sky-600'
          }`}>
            <Eye className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {totalViews.toLocaleString('ar-EG')}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.totalViews')}
          </p>
        </div>

        {/* Total Inquiries */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
          }`}>
            <MessageCircle className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {totalInquiries.toLocaleString('ar-EG')}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.totalInquiries')}
          </p>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          3. TABS
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mb-5"
      >
        <div className="flex gap-2">
          {tabs.map(tab => (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
                  : darkMode
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          4. LISTING CARDS / EMPTY STATE
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {filteredListings.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`p-10 text-center rounded-2xl border ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
            }`}
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              darkMode ? 'bg-gray-700' : 'bg-orange-50'
            }`}>
              <Package className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-orange-300'}`} />
            </div>
            <h3 className={`text-lg font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {activeTab === 'active'
                ? t('market.noActiveListings')
                : activeTab === 'promoted'
                  ? t('market.noPromotedListings')
                  : t('market.noExpiredListings')}
            </h3>
            <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {activeTab === 'active'
                ? t('market.startFirstListing')
                : activeTab === 'promoted'
                  ? t('market.promoteToIncreaseReach')
                  : t('market.deletedOrSoldWillAppearHere')}
            </p>
            {activeTab === 'active' && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/market/new')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-l from-orange-500 to-amber-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                {t('market.addYourFirstListing')}
              </motion.button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="listings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {filteredListings.map((listing, index) => {
              const promotion = getPromotionForListing(listing.id);
              const conditionInfo = conditionLabels[listing.condition] || conditionLabels.used;
              const promoStatusInfo = listing.promotion_status
                ? promotionStatusLabels[listing.promotion_status]
                : null;
              const isDeleting = deletingId === listing.id;
              const isPromoted = listing.is_promoted && listing.promotion_status === 'approved';

              return (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    isPromoted
                      ? darkMode
                        ? 'bg-gradient-to-br from-amber-900/10 via-gray-800 to-orange-900/10 border-amber-700/40'
                        : 'bg-gradient-to-br from-amber-50/50 via-white to-orange-50/50 border-amber-200'
                      : darkMode
                        ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                        : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                  }`}
                >
                  {/* Promoted shimmer bar */}
                  {isPromoted && (
                    <div className="h-1 bg-gradient-to-l from-amber-500 via-orange-500 to-amber-500" />
                  )}

                  <div className="p-4">
                    <div className="flex gap-3">
                      {/* Image Thumbnail */}
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate(`/market/listing/${listing.id}`)}
                        className={`relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden cursor-pointer ${
                          darkMode ? 'bg-gray-700' : 'bg-gray-100'
                        }`}
                      >
                        {listing.images && listing.images.length > 0 ? (
                          <img
                            src={listing.images[0]}
                            alt={listing.title}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-2xl">{getCategoryIcon(listing.category)}</span>
                          </div>
                        )}
                        {/* Promoted badge overlay */}
                        {isPromoted && (
                          <div className="absolute top-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[8px] font-black bg-gradient-to-l from-amber-500 to-orange-500 text-white">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            {t('market.featured')}
                          </div>
                        )}
                      </motion.div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Title & Price */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0 flex-1">
                            <h3
                              onClick={() => navigate(`/market/listing/${listing.id}`)}
                              className={`font-bold text-sm leading-snug line-clamp-1 cursor-pointer hover:text-orange-500 transition-colors ${
                                darkMode ? 'text-white' : 'text-gray-900'
                              }`}
                            >
                              {listing.title}
                            </h3>
                            {listing.price && listing.price > 0 && (
                              <p className="text-sm font-black text-orange-600 mt-0.5">
                                {formatPrice(t, listing.price, listing.currency)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Category & Condition */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            darkMode ? conditionInfo.darkColor : conditionInfo.color
                          }`}>
                            {t(conditionInfo.key)}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <span className="text-xs">{getCategoryIcon(listing.category)}</span>
                            {t(getCategoryName(listing.category))}
                          </span>
                          {/* Promotion status badge */}
                          {promoStatusInfo && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              darkMode ? promoStatusInfo.darkColor : promoStatusInfo.color
                            }`}>
                              {listing.promotion_status === 'pending' && <Clock className="w-2.5 h-2.5" />}
                              {listing.promotion_status === 'approved' && <BadgeCheck className="w-2.5 h-2.5" />}
                              {listing.promotion_status === 'expired' && <AlertTriangle className="w-2.5 h-2.5" />}
                              {listing.promotion_status === 'rejected' && <X className="w-2.5 h-2.5" />}
                              {t(promoStatusInfo.key)}
                            </span>
                          )}
                        </div>

                        {/* Stats Row */}
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`flex items-center gap-1 text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Eye className="w-3 h-3" />
                            <span className="font-bold">{listing.views_count || 0}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Heart className="w-3 h-3" />
                            <span className="font-bold">{listing.saves_count || 0}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <MessageCircle className="w-3 h-3" />
                            <span className="font-bold">{listing.inquiries_count || 0}</span>
                          </div>
                          {listing.created_at && (
                            <div className={`flex items-center gap-1 text-[11px] mr-auto ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              <Clock className="w-3 h-3" />
                              <span>{timeAgo(t, listing.created_at)}</span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          {/* Edit */}
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/market/edit/${listing.id}`)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                              darkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            {t('market.edit')}
                          </motion.button>

                          {/* Promote (only if not already promoted with approved status) */}
                          {!isPromoted && listing.status !== 'deleted' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => openPromotionModal(listing)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                darkMode
                                  ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50'
                                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                              }`}
                            >
                              <Megaphone className="w-3 h-3" />
                              {t('market.promote')}
                            </motion.button>
                          )}

                          {/* Mark as Sold */}
                          {listing.status === 'active' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={async () => {
                                try {
                                  await api.updateMarketListingStatus(listing.id, 'sold');
                                  setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'sold' } : l));
                                } catch {}
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                darkMode
                                  ? 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {t('market.markAsSold', 'تم البيع')}
                            </motion.button>
                          )}

                          {/* Pause / Activate */}
                          {listing.status === 'active' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={async () => {
                                try {
                                  await api.updateMarketListingStatus(listing.id, 'paused');
                                  setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'paused' } : l));
                                } catch {}
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                darkMode
                                  ? 'bg-yellow-900/20 text-yellow-400 hover:bg-yellow-900/40'
                                  : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                              }`}
                            >
                              <Pause className="w-3 h-3" />
                              {t('market.pause', 'إيقاف')}
                            </motion.button>
                          )}
                          {listing.status === 'paused' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={async () => {
                                try {
                                  await api.updateMarketListingStatus(listing.id, 'active');
                                  setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'active' } : l));
                                } catch {}
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                darkMode
                                  ? 'bg-green-900/20 text-green-400 hover:bg-green-900/40'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              }`}
                            >
                              <Play className="w-3 h-3" />
                              {t('market.activate', 'تفعيل')}
                            </motion.button>
                          )}

                          {/* Delete */}
                          {listing.status !== 'deleted' && (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setDeleteConfirmId(listing.id)}
                              disabled={isDeleting}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                                darkMode
                                  ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40'
                                  : 'bg-red-50 text-red-500 hover:bg-red-100'
                              } disabled:opacity-50`}
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              {t('market.delete')}
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          5. DELETE CONFIRMATION MODAL
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-sm rounded-2xl border p-6 ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              <div className="text-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  darkMode ? 'bg-red-900/30' : 'bg-red-50'
                }`}>
                  <AlertTriangle className={`w-8 h-8 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
                </div>
                <h3 className={`text-lg font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {t('market.deleteListingQuestion')}
                </h3>
                <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('market.deleteListingConfirmation')}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                      darkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirmId)}
                    disabled={deletingId === deleteConfirmId}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingId === deleteConfirmId ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('market.deleting')}...
                      </span>
                    ) : (
                      t('market.deletePermanently')
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          6. PROMOTION MODAL
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {promotingListing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={closePromotionModal}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.4 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border ${
                darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              {/* Modal Header */}
              <div className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
                darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
                  }`}>
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {t('market.promoteListing')}
                    </h3>
                    <p className={`text-[10px] font-medium line-clamp-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {promotingListing.title}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closePromotionModal}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                {/* Step Indicators */}
                <div className="flex items-center gap-2 mb-5">
                  {(['package', 'targeting', 'confirm'] as const).map((step, i) => {
                    const stepLabels = { package: t('market.stepPackage'), targeting: t('market.stepTargeting'), confirm: t('market.stepConfirm') };
                    const isActive = promotionStep === step;
                    const isDone = promotionStep === 'targeting' && i === 0
                      || promotionStep === 'confirm' && i <= 1;
                    return (
                      <React.Fragment key={step}>
                        {i > 0 && (
                          <div className={`flex-1 h-0.5 rounded-full ${
                            isDone || isActive
                              ? 'bg-orange-500'
                              : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                          }`} />
                        )}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold ${
                          isActive
                            ? 'bg-orange-500 text-white'
                            : isDone
                              ? darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
                              : darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {isDone && step !== promotionStep ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <span>{i + 1}</span>
                          )}
                          <span className="hidden sm:inline">{stepLabels[step]}</span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* ─── Step 1: Package Selection ─────────────────────── */}
                {promotionStep === 'package' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-3"
                  >
                    <p className={`text-xs font-bold mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {t('market.selectPromotionPackage')}
                    </p>
                    {marketPromotionPackages.map(pkg => {
                      const isSelected = selectedPackage === pkg.id;
                      return (
                        <motion.button
                          key={pkg.id}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSelectPackage(pkg.id)}
                          className={`w-full text-start rounded-xl border-2 p-4 transition-all ${
                            isSelected
                              ? 'border-orange-500 bg-orange-500/5 shadow-lg shadow-orange-500/10'
                              : darkMode
                                ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${pkg.color} shadow-lg`}>
                              {pkg.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {pkg.name}
                                </h4>
                                <div className="flex items-center gap-1">
                                  <span className={`text-lg font-black ${isSelected ? 'text-orange-500' : darkMode ? 'text-white' : 'text-gray-900'}`}>
                                    {pkg.price}
                                  </span>
                                  <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {t('common.egp')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mb-2">
                                <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  <Clock className="w-3 h-3" />
                                  {pkg.duration} {t('common.days')}
                                </span>
                                <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  <TrendingUp className="w-3 h-3" />
                                  {pkg.estimatedReach.toLocaleString('ar-EG')} {t('market.reach')}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {pkg.features.slice(0, 3).map((f, i) => (
                                  <span key={i} className={`flex items-center gap-1 text-[9px] font-bold ${
                                    darkMode ? 'text-gray-500' : 'text-gray-400'
                                  }`}>
                                    <Check className="w-2.5 h-2.5 text-emerald-500" />
                                    {f}
                                  </span>
                                ))}
                                {pkg.features.length > 3 && (
                                  <span className={`text-[9px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    +{pkg.features.length - 3}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0"
                              >
                                <Check className="w-3.5 h-3.5 text-white" />
                              </motion.div>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}

                {/* ─── Step 2: Targeting ──────────────────────────────── */}
                {promotionStep === 'targeting' && selectedPackageData && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    {/* City Targeting */}
                    {selectedPackageData.targeting === 'city' && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {t('market.cityTargeting')}
                            </h4>
                            <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {t('market.selectCitiesToTarget', { count: selectedCities.length })}
                            </p>
                          </div>
                        </div>

                        {/* Search */}
                        <div className="relative mb-3">
                          <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <input
                            type="text"
                            value={citySearch}
                            onChange={(e) => setCitySearch(e.target.value)}
                            placeholder={t('market.searchCityPlaceholder')}
                            className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                              darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                            }`}
                          />
                        </div>

                        {/* Quick select */}
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => setSelectedCities(egyptianCities.map(c => c.id))}
                            className={`flex-1 text-[10px] py-1.5 px-2 rounded-lg font-bold transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                          >
                            {t('common.selectAll')}
                          </button>
                          <button
                            onClick={() => setSelectedCities([])}
                            className={`flex-1 text-[10px] py-1.5 px-2 rounded-lg font-bold transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                          >
                            {t('common.clearAll')}
                          </button>
                        </div>

                        {/* Cities by region */}
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
                          {regionOrder.map(regionKey => {
                            const regionLabel = regionLabels[regionKey];
                            if (!regionLabel) return null;
                            const filtered = searchCities(citySearch);
                            const citiesInRegion = filtered.filter(c => c.region === regionKey);
                            if (citiesInRegion.length === 0) return null;
                            return (
                              <div key={regionKey} className="mb-3">
                                <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${
                                  darkMode ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                  {regionLabel.ar}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {citiesInRegion.map(city => {
                                    const isSelected = selectedCities.includes(city.id);
                                    return (
                                      <motion.button
                                        key={city.id}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => toggleCitySelection(city.id)}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                          isSelected
                                            ? 'bg-emerald-500 text-white shadow-md'
                                            : darkMode
                                              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-2.5 h-2.5" />}
                                        {city.nameAr}
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {selectedCities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedCities.map(cityId => (
                              <span
                                key={cityId}
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                                  darkMode ? 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                }`}
                                onClick={() => toggleCitySelection(cityId)}
                              >
                                {getCityNameAr(cityId)}
                                <X className="w-2.5 h-2.5" />
                              </span>
                            ))}
                          </div>
                        )}

                        {selectedCities.length === 0 && (
                          <p className={`text-[11px] mt-2 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                            {t('market.selectAtLeastOneCity')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Interest Targeting */}
                    {selectedPackageData.targeting === 'interests' && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'
                          }`}>
                            <Target className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {t('market.interestTargeting')}
                            </h4>
                            <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {t('market.selectInterestsToTarget', { count: selectedInterests.length })}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {interestCategories.map(cat => {
                            const isSelected = selectedInterests.includes(cat.id);
                            return (
                              <motion.button
                                key={cat.id}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => toggleInterestSelection(cat.id)}
                                className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all ${
                                  isSelected
                                    ? 'border-purple-500 bg-purple-500/10'
                                    : darkMode
                                      ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                                      : 'border-gray-100 bg-white hover:border-gray-300'
                                }`}
                              >
                                <span className="text-lg">{cat.icon}</span>
                                <span className={`text-[9px] font-bold leading-tight text-center ${
                                  isSelected
                                    ? 'text-purple-600'
                                    : darkMode ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  {t(cat.nameKey)}
                                </span>
                                {isSelected && (
                                  <div className="absolute top-1 left-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>

                        {selectedInterests.length === 0 && (
                          <p className={`text-[11px] mt-2 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                            {t('market.selectAtLeastOneInterest')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex gap-3 mt-5">
                      <button
                        onClick={() => setPromotionStep('package')}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                          darkMode
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t('common.back')}
                      </button>
                      <button
                        onClick={() => {
                          if (selectedPackageData.targeting === 'city' && selectedCities.length === 0) {
                            toast.error(t('market.selectAtLeastOneCity'));
                            return;
                          }
                          if (selectedPackageData.targeting === 'interests' && selectedInterests.length === 0) {
                            toast.error(t('market.selectAtLeastOneInterest'));
                            return;
                          }
                          setPromotionStep('confirm');
                        }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-200"
                      >
                        {t('common.next')}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ─── Step 3: Confirmation ───────────────────────────── */}
                {promotionStep === 'confirm' && selectedPackageData && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    <div className={`rounded-xl border p-4 mb-4 ${
                      darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                      {/* Package Summary */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${selectedPackageData.color} shadow-lg`}>
                          {selectedPackageData.icon}
                        </div>
                        <div>
                          <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {selectedPackageData.name}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {selectedPackageData.duration} {t('common.days')}
                            </span>
                            <span className={`text-xs ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>•</span>
                            <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              ~{selectedPackageData.estimatedReach.toLocaleString('ar-EG')} {t('market.reach')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="space-y-1.5 mb-4">
                        {selectedPackageData.features.map((f, i) => (
                          <div key={i} className={`flex items-center gap-2 text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>

                      {/* Targeting Summary */}
                      {selectedPackageData.targeting === 'city' && selectedCities.length > 0 && (
                        <div className={`rounded-lg p-3 mb-3 ${darkMode ? 'bg-gray-700/50' : 'bg-white'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              {t('market.targetedCities')}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {selectedCities.map(cityId => (
                              <span key={cityId} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                {getCityNameAr(cityId)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedPackageData.targeting === 'interests' && selectedInterests.length > 0 && (
                        <div className={`rounded-lg p-3 mb-3 ${darkMode ? 'bg-gray-700/50' : 'bg-white'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-3.5 h-3.5 text-purple-500" />
                            <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              {t('market.targetedInterests')}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {selectedInterests.map(intId => {
                              const cat = interestCategories.find(c => c.id === intId);
                              return (
                                <span key={intId} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'
                                }`}>
                                  <span>{cat?.icon}</span>
                                  {cat ? t(cat.nameKey) : intId}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Price & Wallet */}
                      <div className={`rounded-lg p-3 ${
                        walletBalance >= selectedPackageData.price
                          ? darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'
                          : darkMode ? 'bg-red-900/20' : 'bg-red-50'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {t('market.promotionCost')}
                          </span>
                          <span className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {selectedPackageData.price} {t('common.egp')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Wallet className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                            <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {t('market.walletBalance')}
                            </span>
                          </div>
                          <span className={`text-sm font-black ${
                            walletBalance >= selectedPackageData.price
                              ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                              : 'text-red-500'
                          }`}>
                            {walletBalance.toLocaleString('ar-EG')} {t('common.egp')}
                          </span>
                        </div>
                        {walletBalance < selectedPackageData.price && (
                          <p className={`text-[10px] font-bold mt-2 ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
                            {t('market.insufficientBalanceChargeWallet')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (selectedPackageData.targeting === 'city' || selectedPackageData.targeting === 'interests') {
                            setPromotionStep('targeting');
                          } else {
                            setPromotionStep('package');
                          }
                        }}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                          darkMode
                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t('common.back')}
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleConfirmPromotion}
                        disabled={submittingPromotion || walletBalance < selectedPackageData.price}
                        className={`flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          walletBalance >= selectedPackageData.price
                            ? 'bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-200'
                            : 'bg-gray-400'
                        }`}
                      >
                        {submittingPromotion ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('market.submitting')}...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            {t('market.confirmPromotion', { price: selectedPackageData.price })}
                          </span>
                        )}
                      </motion.button>
                    </div>

                    {/* Wallet charge link */}
                    {walletBalance < selectedPackageData.price && (
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          closePromotionModal();
                          navigate('/wallet');
                        }}
                        className={`w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                          darkMode
                            ? 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/30'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        <Wallet className="w-4 h-4" />
                        {t('market.chargeWallet')}
                      </motion.button>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
