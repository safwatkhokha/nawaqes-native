// ─── Smart Market Page — Completely Redesigned ─────────────────────────
// A standalone marketplace UI (Dubizzle/OLX/Haraj style) using the dedicated
// market API endpoints instead of filtering social posts.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';
import { marketPromotionPackages } from '../data/marketPromotionPackages';
import { egyptianCities, getCityNameAr, regionLabels, regionOrder, searchCities, getGovernorates } from '../data/egyptianCities';
import {
  ArrowRight,
  Search,
  Plus,
  SlidersHorizontal,
  MapPin,
  Eye,
  Heart,
  Store,
  Users,
  BarChart3,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Package,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap,
  ShoppingBag,
  Star,
  BadgePercent,
  CheckCircle2,
  Check,
  ShieldCheck,
  Filter,
  Grid3X3,
  ArrowUpDown,
  History,
  Gift,
  Lightbulb,
  Flame,
  PlayCircle,
  Crown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useSafeBack } from '../hooks/useSafeBack';

// ─── Types ──────────────────────────────────────────────────────────────
type SortOption = 'newest' | 'cheapest' | 'expensive' | 'featured';
type ConditionFilter = '' | 'new' | 'used' | 'refurbished';

interface MarketListingData {
  id: string;
  seller: { id: string; name: string; avatar: string; is_verified?: boolean; is_trusted?: boolean; trust_score?: number } | null;
  title: string;
  description: string;
  images: string[];
  video_url?: string;
  price?: number;
  currency?: string;
  category: string;
  subcategory?: string;
  condition: 'new' | 'used' | 'refurbished';
  location?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  is_promoted?: boolean;
  promotion_status?: string;
  promotion_tier?: string;
  promotion_package?: string;
  views_count?: number;
  saves_count?: number;
  inquiries_count?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

interface MarketStatsData {
  totalListings: number;
  totalSellers: number;
  averagePrice: number;
  newToday: number;
  categoryBreakdown: { category: string; count: number; avg_price: number }[];
}

interface CategoryCount {
  id: string;
  nameKey: string;
  icon: string;
  color: string;
  count: number;
}

const RECENTLY_VIEWED_KEY = 'nawaqes_market_recently_viewed';
const FAVORITES_KEY = 'nawaqes_market_favorites';
const MAX_RECENTLY_VIEWED = 10;
const PAGE_SIZE = 20;

// ─── Condition Labels ──────────────────────────────────────────────────
const conditionLabels: Record<string, { labelKey: string; color: string; darkColor: string }> = {
  new: { labelKey: 'common.newCondition', color: 'bg-emerald-100 text-emerald-700', darkColor: 'bg-emerald-900/40 text-emerald-400' },
  used: { labelKey: 'common.used', color: 'bg-sky-100 text-sky-700', darkColor: 'bg-sky-900/40 text-sky-400' },
  refurbished: { labelKey: 'common.refurbished', color: 'bg-amber-100 text-amber-700', darkColor: 'bg-amber-900/40 text-amber-400' },
};

// ─── Price Formatting ──────────────────────────────────────────────────
function formatPrice(price: number | undefined, currency: string = ''): string {
  if (!price || price <= 0) return '';
  if (!currency) return price.toLocaleString('ar-EG');
  return `${price.toLocaleString('ar-EG')} ${currency}`;
}

// ─── Load favorites from localStorage ─────────────────────────────────
function loadLocalFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocalFavorites(ids: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

// ─── Price Comparison Helper ──────────────────────────────────────────
// Returns 'below' | 'above' | null based on listing price vs category average
function getPriceComparison(
  listing: MarketListingData,
  categoryAvgMap: Map<string, number>
): 'below' | 'above' | null {
  if (!listing.price || listing.price <= 0) return null;
  const avg = categoryAvgMap.get(listing.category);
  if (!avg || avg <= 0) return null;
  // 10% threshold to avoid noise
  if (listing.price < avg * 0.9) return 'below';
  if (listing.price > avg * 1.1) return 'above';
  return null;
}

// ─── Discount Detection Helper ────────────────────────────────────────
// Detects "recently reduced" listings — listing was updated recently
// but created earlier (suggesting price reduction/edit).
function isRecentlyReduced(listing: MarketListingData): boolean {
  if (!listing.created_at || !listing.updated_at) return false;
  try {
    const created = parseDBTimestamp(listing.created_at).getTime();
    const updated = parseDBTimestamp(listing.updated_at).getTime();
    const now = Date.now();
    // Updated within the last 3 days AND listing is older than 5 days
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    if (updated <= created) return false;
    if ((now - updated) > threeDaysMs) return false;
    if ((now - created) < fiveDaysMs) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Time Ago ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function timeAgo(dateStr: string | undefined, t: any): string {
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

// ─── Main Component ────────────────────────────────────────────────────
export const MarketPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  // ─── State ────────────────────────────────────────────────────────
  const [listings, setListings] = useState<MarketListingData[]>([]);
  const [promotedListings, setPromotedListings] = useState<MarketListingData[]>([]);
  const [recommendedListings, setRecommendedListings] = useState<MarketListingData[]>([]);
  const [stats, setStats] = useState<MarketStatsData | null>(null);
  const [categoriesWithCounts, setCategoriesWithCounts] = useState<CategoryCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalListings, setTotalListings] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number>(0);
  const isPulling = useRef<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Category avg prices map (used for price comparison badges)
  const [categoryAvgMap, setCategoryAvgMap] = useState<Map<string, number>>(new Map());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter>('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [cityFilterSearch, setCityFilterSearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [showFilters, setShowFilters] = useState(false);

  // Saved listings tracking (synced with API + localStorage)
  const [savedListingIds, setSavedListingIds] = useState<Set<string>>(() => loadLocalFavorites());
  const [savingInProgress, setSavingInProgress] = useState<Set<string>>(new Set());

  // Recently viewed
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]'); } catch { return []; }
  });

  // Category tabs scroll ref
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Search debounce ref
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // ─── Track Recently Viewed ────────────────────────────────────────
  const trackRecentlyViewed = useCallback((listingId: string) => {
    setRecentlyViewedIds(prev => {
      const filtered = prev.filter(id => id !== listingId);
      const updated = [listingId, ...filtered].slice(0, MAX_RECENTLY_VIEWED);
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ─── Debounced Search ─────────────────────────────────────────────
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchQuery]);

  // ─── Fetch Market Stats ───────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getMarketStats();
      setStats(data as MarketStatsData);

      // Build categories with counts from interestCategories + API breakdown
      const breakdownMap = new Map<string, { count: number; avg_price: number }>();
      if (data.categoryBreakdown) {
        for (const item of data.categoryBreakdown) {
          breakdownMap.set(item.category, { count: item.count, avg_price: item.avg_price });
        }
      }

      // Build category average price map for price-comparison badges
      const avgMap = new Map<string, number>();
      for (const item of (data.categoryBreakdown || [])) {
        if (item.avg_price && item.avg_price > 0) {
          avgMap.set(item.category, item.avg_price);
        }
      }
      setCategoryAvgMap(avgMap);

      const catsWithCounts: CategoryCount[] = [
        { id: 'all', nameKey: 'common.all', icon: '🏷️', color: 'from-orange-500 to-amber-500', count: (data as MarketStatsData).totalListings },
        ...interestCategories.map(cat => ({
          id: cat.id,
          nameKey: cat.nameKey,
          icon: cat.icon,
          color: cat.color,
          count: breakdownMap.get(cat.id)?.count || 0,
        })),
      ];
      setCategoriesWithCounts(catsWithCounts);
    } catch {
      // Fallback: use interestCategories without counts
      setCategoriesWithCounts([
        { id: 'all', nameKey: 'common.all', icon: '🏷️', color: 'from-orange-500 to-amber-500', count: 0 },
        ...interestCategories.map(cat => ({
          id: cat.id,
          nameKey: cat.nameKey,
          icon: cat.icon,
          color: cat.color,
          count: 0,
        })),
      ]);
    }
  }, []);

  // ─── Fetch Listings ───────────────────────────────────────────────
  const fetchListings = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const params: Record<string, string> = {
        page: pageNum.toString(),
        limit: PAGE_SIZE.toString(),
      };

      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (debouncedSearch) params.search = debouncedSearch;
      if (conditionFilter) params.condition = conditionFilter;
      if (minPrice) params.min_price = minPrice;
      if (maxPrice) params.max_price = maxPrice;
      if (selectedCity) params.city = selectedCity;
      if (sortOption) params.sort = sortOption;

      const data = await api.getMarketListings(params);
      const newListing = (data.listings || []) as MarketListingData[];
      const total = data.total || 0;

      if (append) {
        setListings(prev => [...prev, ...newListing]);
      } else {
        setListings(newListing);
      }

      setTotalListings(total);
      setHasMore(newListing.length >= PAGE_SIZE && (pageNum * PAGE_SIZE) < total);
      setPage(pageNum);
    } catch {
      if (!append) setListings([]);
      toast.error(t('market.loadFailed'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCategory, debouncedSearch, conditionFilter, minPrice, maxPrice, selectedCity, sortOption, t]);

  // ─── Fetch Promoted Listings ──────────────────────────────────────
  const fetchPromotedListings = useCallback(async () => {
    try {
      const data = await api.getMarketListings({ limit: '10', sort: 'featured' });
      const allListings = (data.listings || []) as MarketListingData[];
      const promoted = allListings.filter(l => l.is_promoted);
      setPromotedListings(promoted.slice(0, 8));
    } catch {
      setPromotedListings([]);
    }
  }, []);

  // ─── Fetch Smart Recommendations (based on user interests) ────────
  // يجلب إعلانات مخصصة بناءً على اهتمامات المستخدم — "منتجات قد تعجبك"
  const fetchRecommendedListings = useCallback(async () => {
    try {
      const userInterests = (currentUser?.interests && Array.isArray(currentUser.interests) && currentUser.interests.length > 0)
        ? currentUser.interests
        : interestCategories.slice(0, 3).map(c => c.id); // fallback: top 3 categories

      // Pick the first user interest to fetch recommendations
      const primaryInterest = userInterests[0];
      if (!primaryInterest) {
        setRecommendedListings([]);
        return;
      }

      const data = await api.getMarketListings({
        category: primaryInterest,
        limit: '10',
        sort: 'featured',
      });
      const recs = (data.listings || []) as MarketListingData[];
      // Filter out listings already in the main list to avoid duplication
      setRecommendedListings(recs.slice(0, 6));
    } catch {
      setRecommendedListings([]);
    }
  }, [currentUser?.interests]);

  // ─── AI Smart Placement for Market ──────────────────────────────────
  // الذكاء الاصطناعي يحدد أفضل موضع للإعلانات المروجة في السوق
  const [aiMarketPlacement, setAiMarketPlacement] = useState<any>(null);

  // Fetch AI placement when listings or promoted listings change
  useEffect(() => {
    const fetchAiPlacement = async () => {
      try {
        const promotedInFeed = listings.filter(l => l.is_promoted && l.promotion_status === 'approved');
        if (promotedInFeed.length === 0) {
          setAiMarketPlacement(null);
          return;
        }

        const promotedSummary = promotedInFeed.map(l => ({
          promotionTier: l.promotion_tier || 'basic',
          promotion_tier: l.promotion_tier || 'basic',
          targetInterests: [],
          target_interests: [],
          category: l.category,
        }));

        const result = await api.aiSmartPlacement({
          promotedPosts: promotedSummary,
          totalPosts: listings.length,
          feedType: 'market',
          userInterests: currentUser?.interests || [],
        });

        if (result.success && result.positions.length > 0) {
          setAiMarketPlacement(result);
        } else {
          setAiMarketPlacement(null);
        }
      } catch {
        setAiMarketPlacement(null);
      }
    };

    const timer = setTimeout(fetchAiPlacement, 800);
    return () => clearTimeout(timer);
  }, [listings.length, currentUser?.interests]);

  // ─── AI-driven reordering of market listings ────────────────────────
  const smartListings = useMemo(() => {
    if (!aiMarketPlacement || !aiMarketPlacement.positions || aiMarketPlacement.positions.length === 0) {
      return listings;
    }

    const promoted = listings.filter(l => l.is_promoted && l.promotion_status === 'approved');
    const regular = listings.filter(l => !(l.is_promoted && l.promotion_status === 'approved'));

    if (promoted.length === 0) return listings;

    const result: MarketListingData[] = [];
    const usedPromotedIndices = new Set<number>();

    // Build placement map
    const placementMap = new Map<number, number>();
    for (const pos of aiMarketPlacement.positions) {
      placementMap.set(pos.feedPosition, pos.postIndex);
    }

    let regularIdx = 0;
    let feedPosition = 0;

    while (regularIdx < regular.length || usedPromotedIndices.size < promoted.length) {
      if (placementMap.has(feedPosition)) {
        const promoIdx = placementMap.get(feedPosition)!;
        if (!usedPromotedIndices.has(promoIdx) && promoIdx < promoted.length) {
          result.push(promoted[promoIdx]);
          usedPromotedIndices.add(promoIdx);
          feedPosition++;
          continue;
        }
      }

      if (regularIdx < regular.length) {
        result.push(regular[regularIdx++]);
        feedPosition++;
      } else if (usedPromotedIndices.size < promoted.length) {
        for (let i = 0; i < promoted.length; i++) {
          if (!usedPromotedIndices.has(i)) {
            result.push(promoted[i]);
            usedPromotedIndices.add(i);
          }
        }
        break;
      } else {
        break;
      }
    }

    return result;
  }, [listings, aiMarketPlacement]);

  // ─── Fetch Saved Listing IDs ──────────────────────────────────────
  const fetchSavedListings = useCallback(async () => {
    if (!currentUser) {
      // Not logged in — just use localStorage favorites
      setSavedListingIds(loadLocalFavorites());
      return;
    }
    try {
      const saved = await api.getSavedMarketListings();
      if (Array.isArray(saved)) {
        const apiIds = new Set(saved.map((s: any) => s.id));
        // Merge API favorites with localStorage favorites (union)
        const localIds = loadLocalFavorites();
        const merged = new Set([...apiIds, ...localIds]);
        setSavedListingIds(merged);
        saveLocalFavorites(merged);
      }
    } catch {
      // Fall back to localStorage only
      setSavedListingIds(loadLocalFavorites());
    }
  }, [currentUser]);

  // ─── Toggle Save Listing ──────────────────────────────────────────
  const handleToggleSave = useCallback(async (e: React.MouseEvent, listingId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!currentUser) {
      toast.error(t('postCard.mustLogin'));
      return;
    }
    if (savingInProgress.has(listingId)) return;

    setSavingInProgress(prev => new Set(prev).add(listingId));

    // Optimistic update
    const wasSaved = savedListingIds.has(listingId);
    setSavedListingIds(prev => {
      const next = new Set(prev);
      if (wasSaved) next.delete(listingId);
      else next.add(listingId);
      // Persist to localStorage immediately (Favorites/Wishlist persistence)
      saveLocalFavorites(next);
      return next;
    });

    try {
      const result = await api.toggleSaveMarketListing(listingId);
      // Update the listing's saves_count in local state
      setListings(prev => prev.map(l =>
        l.id === listingId ? { ...l, saves_count: result.savesCount } : l
      ));
      toast.success(result.saved ? t('market.adSaved') : t('market.adRemoved'));
    } catch {
      // Revert optimistic update
      setSavedListingIds(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(listingId);
        else next.delete(listingId);
        saveLocalFavorites(next);
        return next;
      });
      toast.error(t('market.adSaveFailed'));
    } finally {
      setSavingInProgress(prev => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  }, [currentUser, savedListingIds, savingInProgress, t]);

  // ─── Pull-to-Refresh Handler ─────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchPromotedListings(),
        fetchRecommendedListings(),
        fetchSavedListings(),
      ]);
      await fetchListings(1, false);
      toast.success(t('market.refreshing'));
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [fetchStats, fetchPromotedListings, fetchRecommendedListings, fetchSavedListings, fetchListings, t]);

  // Touch handlers for pull-to-refresh
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow pull when at top of scroll
    const scrollEl = document.getElementById('main-feed-scroll') || document.getElementById('page-layout-scroll');
    if (scrollEl && scrollEl.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    } else {
      isPulling.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    if (diff > 0 && diff < 100) {
      setPullDistance(diff * 0.5); // resistance
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance > 50) {
      handleRefresh();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, handleRefresh]);

  // ─── Effects ──────────────────────────────────────────────────────
  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchStats(), fetchPromotedListings(), fetchRecommendedListings(), fetchSavedListings()]);
      // Fetch listings after stats (to get category counts)
      fetchListings(1, false);
    };
    init();
  }, []);

  // Refetch listings when filters change (not on initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchListings(1, false);
  }, [selectedCategory, debouncedSearch, conditionFilter, minPrice, maxPrice, selectedCity, sortOption]);

  // ─── Load More ────────────────────────────────────────────────────
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchListings(page + 1, true);
    }
  };

  // ─── Clear Filters ────────────────────────────────────────────────
  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedCategory('all');
    setConditionFilter('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedCity('');
    setSortOption('newest');
    toast.success(t('market.filtersCleared'));
  };

  const hasActiveFilters = conditionFilter || minPrice || maxPrice || selectedCity || debouncedSearch;

  // ─── Recently Viewed Listings Data ────────────────────────────────
  const recentlyViewedListings = useMemo(() => {
    return recentlyViewedIds
      .map(id => listings.find(l => l.id === id))
      .filter(Boolean) as MarketListingData[];
  }, [recentlyViewedIds, listings]);

  // ─── Saved Ads Count ──────────────────────────────────────────────
  const savedAdsCount = savedListingIds.size;

  // ─── Filtered cities for city dropdown ────────────────────────────
  const filteredFilterCities = useMemo(() => {
    return searchCities(cityFilterSearch);
  }, [cityFilterSearch]);

  // ─── Condition Filter Options ─────────────────────────────────────
  const conditionOptions: { value: ConditionFilter; label: string }[] = [
    { value: '', label: t('common.all') },
    { value: 'new', label: t('common.newCondition') },
    { value: 'used', label: t('common.used') },
    { value: 'refurbished', label: t('common.refurbished') },
  ];

  // ─── Sort Options ─────────────────────────────────────────────────
  const sortOptions: { value: SortOption; label: string; icon: React.ReactNode }[] = [
    { value: 'newest', label: t('common.newest'), icon: <RefreshCw className="w-3.5 h-3.5" /> },
    { value: 'cheapest', label: t('common.cheapest'), icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
    { value: 'expensive', label: t('common.mostExpensive'), icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { value: 'featured', label: t('common.featured'), icon: <Star className="w-3.5 h-3.5" /> },
  ];

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div
      ref={scrollContainerRef}
      className="max-w-4xl mx-auto overflow-x-hidden pb-24"
      dir={dir}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ═══════════════════════════════════════════════════════════════
          PULL-TO-REFRESH INDICATOR
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        animate={{
          height: refreshing ? 56 : pullDistance,
          opacity: refreshing || pullDistance > 0 ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden flex items-center justify-center"
        style={{ height: refreshing ? 56 : pullDistance }}
      >
        <div className={`flex flex-col items-center gap-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
          <motion.div
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 1, repeat: refreshing ? Infinity : 0, ease: 'linear' }}
          >
            <RefreshCw className="w-5 h-5 text-orange-500" />
          </motion.div>
          <span className="text-[10px] font-bold">
            {refreshing ? t('market.refreshing') : pullDistance > 50 ? t('market.releaseToRefresh') : t('market.pullToRefresh')}
          </span>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          1. MARKET HEADER
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5"
      >
        {/* Top bar with back button + title + add button */}
        <div className="flex items-center gap-3 mb-4">
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
                <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {t('sidebar.smartMarket')}
                </h1>
                <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {totalListings > 0 ? t('market.adsAvailable', { count: totalListings.toLocaleString('ar-EG') }) : t('market.nawaqesMarket')}
                </p>
              </div>
              {/* Saved count badge */}
              {savedAdsCount > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${
                    darkMode ? 'bg-rose-900/40 text-rose-400' : 'bg-rose-50 text-rose-600'
                  }`}
                >
                  <Heart className="w-3 h-3 fill-current" />
                  {savedAdsCount}
                </motion.div>
              )}
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { const scrollEl = document.getElementById('main-feed-scroll') || document.getElementById('page-layout-scroll'); if (scrollEl) (window as any).__pageScrollTop = scrollEl.scrollTop; navigate('/market/new'); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-colors ${
              darkMode
                ? 'bg-gradient-to-l from-orange-600 to-amber-600 text-white shadow-orange-900/30'
                : 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-orange-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('sidebar.addAd')}</span>
          </motion.button>
        </div>

        {/* Search Bar */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border-2 transition-all ${
          darkMode
            ? 'bg-gray-800 border-gray-700 focus-within:border-orange-500'
            : 'bg-white border-gray-200 focus-within:border-orange-400 shadow-sm'
        }`}>
          <Search className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
          <input
            type="text"
            placeholder={t('market.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`flex-1 bg-transparent border-none outline-none text-sm font-bold min-w-0 ${
              darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }}
              className={`p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className={`w-px h-6 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              showFilters
                ? 'bg-orange-600 text-white shadow-md'
                : darkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {t('market.filters')}
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            )}
          </button>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          2. MARKET STATS BAR
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
            {stats?.totalListings?.toLocaleString('ar-EG') || '—'}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.totalListings')}
          </p>
        </div>

        {/* Total Sellers */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600'
          }`}>
            <Users className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {stats?.totalSellers?.toLocaleString('ar-EG') || '—'}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.activeSellers')}
          </p>
        </div>

        {/* Avg Price */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
          }`}>
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {stats?.averagePrice ? stats.averagePrice.toLocaleString('ar-EG') : '—'}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.averagePrice')}
          </p>
        </div>

        {/* New Today */}
        <div className={`rounded-xl p-2.5 border text-center ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100 shadow-sm'
        }`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1 ${
            darkMode ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'
          }`}>
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <p className={`text-base font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {stats?.newToday?.toLocaleString('ar-EG') || '—'}
          </p>
          <p className={`text-[8px] font-bold leading-tight ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('market.newToday')}
          </p>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          3. CATEGORY NAVIGATION
          ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mb-5"
      >
        <div
          ref={categoryScrollRef}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {categoriesWithCounts.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
                    : darkMode
                      ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
                }`}
              >
                <span className="text-sm">{cat.icon}</span>
                <span>{t(cat.nameKey)}</span>
                {cat.count > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {cat.count}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
          4. FEATURED / PROMOTED SECTION
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {promotedListings.length > 0 && selectedCategory === 'all' && !debouncedSearch && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}>
                <Zap className="w-4 h-4" />
              </div>
              <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('market.featuredOffers')}
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-700'
              }`}>
                {t('market.adCount', { count: promotedListings.length })}
              </span>
              {aiMarketPlacement && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'
                }`}>
                  <Sparkles className="w-2.5 h-2.5" />
                  {t('market.smartPlacements')}
                </span>
              )}
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {promotedListings.map((listing, index) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    trackRecentlyViewed(listing.id);
                    navigate(`/market/listing/${listing.id}`);
                  }}
                  className={`flex-shrink-0 w-64 rounded-2xl overflow-hidden cursor-pointer relative ${
                    darkMode
                      ? 'bg-gradient-to-br from-amber-900/20 via-gray-800 to-orange-900/20 border border-amber-700/40'
                      : 'bg-gradient-to-br from-amber-50 via-white to-orange-50 border border-amber-200'
                  }`}
                  style={{
                    boxShadow: darkMode
                      ? '0 0 20px rgba(251,146,60,0.12)'
                      : '0 0 20px rgba(251,146,60,0.1)',
                  }}
                >
                  {/* Image */}
                  <div className={`relative h-36 overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    {listing.images && listing.images.length > 0 ? (
                      <img
                        src={listing.images[0]}
                        alt={listing.title}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${
                        darkMode ? 'bg-gradient-to-br from-amber-900/30 to-orange-900/30' : 'bg-gradient-to-br from-amber-100 to-orange-100'
                      }`}>
                        <Package className={`w-10 h-10 ${darkMode ? 'text-amber-700' : 'text-amber-300'}`} />
                      </div>
                    )}
                    {/* مميز Badge */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-lg">
                      <Sparkles className="w-3 h-3 animate-pulse" />
                      {t('market.promoted')}
                    </div>
                  </div>

                  <div className="p-3">
                    <p className={`text-xs font-bold leading-snug line-clamp-1 mb-1.5 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {listing.title}
                    </p>
                    {listing.price && listing.price > 0 && (
                      <p className="text-sm font-black text-orange-600 mb-1">
                        {formatPrice(listing.price, listing.currency || t('common.egp'))}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      {listing.city && (
                        <div className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <MapPin className="w-3 h-3" />
                          <span className="text-[10px] font-medium">{getCityNameAr(listing.city) || listing.city}</span>
                        </div>
                      )}
                      {listing.views_count !== undefined && (
                        <div className={`flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Eye className="w-3 h-3" />
                          <span className="text-[10px]">{listing.views_count}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          4b. PROMOTED LISTINGS — Auto-scrolling carousel
          Replaces "منتجات قد تعجبك" and "شوهدت مؤخراً" with a single
          auto-scrolling carousel of promoted listings.
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {promotedListings.length > 0 && selectedCategory === 'all' && !debouncedSearch && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ delay: 0.25 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}>
                <Crown className="w-4 h-4" />
              </div>
              <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                إعلانات مروّجة
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                مميز
              </span>
            </div>

            {/* Auto-scrolling carousel */}
            <div
              className="relative overflow-hidden rounded-2xl"
              onMouseEnter={(e) => e.currentTarget.style.animationPlayState = 'paused'}
              onMouseLeave={(e) => e.currentTarget.style.animationPlayState = 'running'}
            >
              <div
                className="flex gap-3"
                style={{
                  animation: 'marketScroll 30s linear infinite',
                  width: 'max-content',
                }}
              >
                {/* Render listings twice for seamless loop */}
                {[...promotedListings, ...promotedListings].map((listing, index) => {
                  const mainImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
                  return (
                    <div
                      key={`promo-${listing.id}-${index}`}
                      onClick={() => navigate(`/market/listing/${listing.id}`)}
                      className={`flex-shrink-0 w-44 rounded-2xl overflow-hidden cursor-pointer border transition-all hover:shadow-xl ${
                        darkMode
                          ? 'bg-gray-800 border-amber-800/40 hover:border-amber-600/60'
                          : 'bg-white border-amber-200/60 hover:border-amber-400 shadow-sm'
                      }`}
                    >
                      <div className={`relative h-28 overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                        {mainImage ? (
                          <img src={mainImage} alt={listing.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-gradient-to-br from-amber-900/30 to-orange-900/30' : 'bg-gradient-to-br from-amber-100 to-orange-100'}`}>
                            <Package className={`w-10 h-10 ${darkMode ? 'text-amber-700' : 'text-amber-300'}`} />
                          </div>
                        )}
                        {/* Promoted badge */}
                        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-lg">
                          <Crown className="w-3 h-3" />
                          مروّج
                        </div>
                      </div>
                      <div className="p-2.5">
                        <p className={`text-xs font-bold leading-snug line-clamp-1 mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                          {listing.title}
                        </p>
                        {listing.price && listing.price > 0 ? (
                          <p className="text-sm font-black text-amber-600">
                            {formatPrice(listing.price, listing.currency || t('common.egp'))}
                          </p>
                        ) : (
                          <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('market.priceOnCall')}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          5. FILTERS PANEL (Collapsible)
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-4"
          >
            <div className={`rounded-2xl border p-4 space-y-4 ${
              darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-sm'
            }`}>
              {/* Condition Filter */}
              <div>
                <label className={`text-[11px] font-bold block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <ShieldCheck className="w-3.5 h-3.5 inline-block ml-1" />
                  {t('market.productCondition')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {conditionOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setConditionFilter(opt.value)}
                      className={`px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all ${
                        conditionFilter === opt.value
                          ? 'bg-orange-600 text-white shadow-md'
                          : darkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <label className={`text-[11px] font-bold block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <BarChart3 className="w-3.5 h-3.5 inline-block ml-1" />
                  {t('market.priceRange')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="number"
                      placeholder={t('market.minPrice')}
                      value={minPrice}
                      onChange={e => setMinPrice(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                        darkMode
                          ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500 placeholder:text-gray-500'
                          : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400 placeholder:text-gray-400'
                      }`}
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder={t('market.maxPrice')}
                      value={maxPrice}
                      onChange={e => setMaxPrice(e.target.value)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                        darkMode
                          ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500 placeholder:text-gray-500'
                          : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400 placeholder:text-gray-400'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* City Filter */}
              <div>
                <label className={`text-[11px] font-bold block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <MapPin className="w-3.5 h-3.5 inline-block ml-1" />
                  {t('market.city')}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCityDropdown(!showCityDropdown)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white hover:border-gray-500'
                        : 'bg-gray-50 border-gray-200 text-gray-900 hover:border-gray-300'
                    } ${selectedCity ? '' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="font-medium">{selectedCity ? getCityNameAr(selectedCity) : t('market.allCities')}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {showCityDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className={`absolute z-50 w-full mt-1 rounded-xl border shadow-xl overflow-hidden ${
                          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                          <input
                            type="text"
                            value={cityFilterSearch}
                            onChange={e => setCityFilterSearch(e.target.value)}
                            placeholder={t('market.searchCity')}
                            className={`w-full px-3 py-2 rounded-lg text-sm outline-none ${
                              darkMode ? 'bg-gray-700 text-white placeholder:text-gray-500' : 'bg-gray-50 text-gray-900 placeholder:text-gray-400'
                            }`}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setSelectedCity(''); setShowCityDropdown(false); setCityFilterSearch(''); }}
                            className={`w-full text-start px-4 py-2.5 text-sm transition-colors ${
                              !selectedCity
                                ? 'bg-orange-500/10 text-orange-600 font-bold'
                                : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {t('market.allCities')}
                          </button>
                          {regionOrder.map(regionKey => {
                            const regionLabel = regionLabels[regionKey];
                            if (!regionLabel) return null;
                            const regionCities = filteredFilterCities.filter(c => c.region === regionKey);
                            if (regionCities.length === 0) return null;
                            return (
                              <div key={regionKey}>
                                <p className={`px-4 py-1.5 text-[9px] font-black uppercase ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                                  {regionLabel.ar}
                                </p>
                                {regionCities.map(city => (
                                  <button
                                    key={city.id}
                                    type="button"
                                    onClick={() => { setSelectedCity(city.id); setShowCityDropdown(false); setCityFilterSearch(''); }}
                                    className={`w-full text-start px-4 py-2 text-sm transition-colors ${
                                      selectedCity === city.id
                                        ? 'bg-orange-500/10 text-orange-600 font-bold'
                                        : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span>{city.nameAr}</span>
                                      {selectedCity === city.id && <Check className="w-4 h-4 text-orange-600" />}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            );
                          })}
                          {filteredFilterCities.length === 0 && (
                            <p className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {t('market.noResults')}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Sort Options */}
              <div>
                <label className={`text-[11px] font-bold block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <ArrowUpDown className="w-3.5 h-3.5 inline-block ml-1" />
                  {t('market.sortBy')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {sortOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setSortOption(opt.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                        sortOption === opt.value
                          ? 'bg-orange-600 text-white shadow-md'
                          : darkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear All */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-orange-600 border-2 border-dashed border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  {t('market.clearAllFilters')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          ACTIVE FILTER CHIPS
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {conditionFilter && (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  onClick={() => setConditionFilter('')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    darkMode ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {t(conditionLabels[conditionFilter]?.labelKey || '')}
                  <X className="w-3 h-3" />
                </motion.button>
              )}
              {minPrice && (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  onClick={() => setMinPrice('')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  {t('market.fromPrice', { price: parseInt(minPrice).toLocaleString() })}
                  <X className="w-3 h-3" />
                </motion.button>
              )}
              {maxPrice && (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  onClick={() => setMaxPrice('')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  {t('market.toPrice', { price: parseInt(maxPrice).toLocaleString() })}
                  <X className="w-3 h-3" />
                </motion.button>
              )}
              {selectedCity && (
                <motion.button
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  onClick={() => setSelectedCity('')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-700'
                  }`}
                >
                  <MapPin className="w-3 h-3" />
                  {getCityNameAr(selectedCity) || selectedCity}
                  <X className="w-3 h-3" />
                </motion.button>
              )}
              <button
                onClick={clearFilters}
                className="text-[11px] font-bold text-orange-600 hover:underline"
              >
                {t('market.clearAll')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          6. LISTINGS GRID
          ═══════════════════════════════════════════════════════════════ */}
      {loading ? (
        // Loading skeleton
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-2xl overflow-hidden border ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
              }`}
            >
              <div className={`h-40 animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className="p-3 space-y-2">
                <div className={`h-4 rounded-full w-3/4 animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-5 rounded-full w-1/2 animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-3 rounded-full w-2/3 animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              </div>
            </motion.div>
          ))}
        </div>
      ) : listings.length > 0 ? (
        <>
          {/* Results count */}
          <div className="flex items-center justify-between mb-3">
            <p className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Grid3X3 className="w-3.5 h-3.5 inline-block ml-1" />
              {t('market.showingListings', { shown: listings.length, total: totalListings.toLocaleString('ar-EG') })}
            </p>
            {/* Quick sort buttons when filter panel is closed */}
            {!showFilters && (
              <div className="flex items-center gap-1">
                {sortOptions.slice(0, 3).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSortOption(opt.value)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      sortOption === opt.value
                        ? 'bg-orange-600 text-white'
                        : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-3">
            {smartListings.map((listing, index) => {
              const isSaved = savedListingIds.has(listing.id);
              const conditionInfo = conditionLabels[listing.condition];
              const mainImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
              const priceComparison = getPriceComparison(listing, categoryAvgMap);
              const recentlyReduced = isRecentlyReduced(listing);
              const sellerName = listing.seller?.name || '';
              const sellerVerified = !!listing.seller?.is_verified;
              const hasVideo = !!listing.video_url;

              return (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  whileHover={{ y: -2 }}
                  onClick={() => {
                    trackRecentlyViewed(listing.id);
                    navigate(`/market/listing/${listing.id}`);
                  }}
                  className={`rounded-2xl overflow-hidden cursor-pointer transition-shadow hover:shadow-lg relative ${
                    listing.is_promoted
                      ? listing.promotion_tier === 'market_premium'
                        ? darkMode
                          ? 'bg-gray-800 border-2 border-amber-400/50 ring-1 ring-amber-400/20 hover:border-amber-400/70'
                          : 'bg-white border-2 border-amber-400/60 ring-1 ring-amber-300/20 hover:border-amber-400/80'
                        : listing.promotion_tier === 'market_standard'
                          ? darkMode
                            ? 'bg-gray-800 border-2 border-orange-400/40 ring-1 ring-orange-400/20 hover:border-orange-400/60'
                            : 'bg-white border-2 border-orange-400/50 ring-1 ring-orange-300/20 hover:border-orange-400/70'
                          : darkMode
                            ? 'bg-gray-800 border-2 border-blue-400/30 ring-1 ring-blue-400/20 hover:border-blue-400/50'
                            : 'bg-white border-2 border-blue-400/40 ring-1 ring-blue-300/20 hover:border-blue-400/60'
                    : darkMode
                      ? 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                      : 'bg-white border border-gray-100 hover:border-gray-200 shadow-sm'
                  }`}
                >
                  {/* ── Image Section ── */}
                  <div className={`relative h-40 overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    {mainImage ? (
                      <img
                        src={mainImage}
                        alt={listing.title}
                        className="w-full h-full object-contain transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${
                        darkMode
                          ? 'bg-gradient-to-br from-gray-700 to-gray-800'
                          : 'bg-gradient-to-br from-gray-100 to-gray-200'
                      }`}>
                        <Package className={`w-12 h-12 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                    )}

                    {/* Gradient overlay at bottom of image */}
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

                    {/* مميز Badge (top-right) */}
                    {listing.is_promoted && (
                      <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black shadow-lg ${
                        listing.promotion_tier === 'market_premium'
                          ? 'bg-gradient-to-l from-yellow-400 via-amber-500 to-orange-500 text-white shadow-amber-300/40'
                          : listing.promotion_tier === 'market_standard'
                            ? 'bg-gradient-to-l from-orange-500 via-amber-500 to-orange-600 text-white shadow-orange-300/40'
                            : 'bg-gradient-to-l from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-300/40'
                      }`}>
                        <Sparkles className="w-3 h-3 animate-pulse" />
                        {t('market.promoted')}
                      </div>
                    )}

                    {/* Discount Alert Badge (top-right secondary, when promoted already shown) */}
                    {recentlyReduced && (
                      <div className={`absolute ${listing.is_promoted ? 'top-10 right-2' : 'top-2 right-2'} flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-black shadow-lg bg-gradient-to-l from-rose-500 to-red-500 text-white`}>
                        <Flame className="w-3 h-3" />
                        {t('market.priceDiscount')}
                      </div>
                    )}

                    {/* Video indicator */}
                    {hasVideo && (
                      <div className={`absolute top-2 ${listing.is_promoted || recentlyReduced ? 'left-14' : 'left-2'} w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm bg-black/50 text-white`}>
                        <PlayCircle className="w-4 h-4" />
                      </div>
                    )}

                    {/* Condition Badge (top-left when video indicator absent) */}
                    {!hasVideo && conditionInfo && (
                      <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[9px] font-black ${
                        darkMode ? conditionInfo.darkColor : conditionInfo.color
                      }`}>
                        {t(conditionInfo.labelKey)}
                      </div>
                    )}
                    {/* When video indicator present, move condition below */}
                    {hasVideo && conditionInfo && (
                      <div className={`absolute top-10 left-2 px-2 py-0.5 rounded-lg text-[9px] font-black ${
                        darkMode ? conditionInfo.darkColor : conditionInfo.color
                      }`}>
                        {t(conditionInfo.labelKey)}
                      </div>
                    )}

                    {/* Save button (bottom-left) */}
                    <button
                      onClick={(e) => handleToggleSave(e, listing.id)}
                      className={`absolute bottom-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm ${
                        isSaved
                          ? 'bg-rose-500/90 text-white'
                          : darkMode
                            ? 'bg-black/40 text-white hover:bg-black/60'
                            : 'bg-white/80 text-gray-600 hover:bg-white'
                      } ${savingInProgress.has(listing.id) ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                    </button>

                    {/* Image count indicator (bottom-right) */}
                    {listing.images && listing.images.length > 1 && (
                      <div className={`absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-bold backdrop-blur-sm ${
                        darkMode ? 'bg-black/40 text-white' : 'bg-white/80 text-gray-700'
                      }`}>
                        <Package className="w-3 h-3" />
                        {listing.images.length}
                      </div>
                    )}
                  </div>

                  {/* ── Details Section ── */}
                  <div className="p-3">
                    {/* Title */}
                    <h3 className={`text-xs font-bold leading-snug line-clamp-2 mb-1.5 min-h-[2rem] ${
                      darkMode ? 'text-gray-100' : 'text-gray-800'
                    }`}>
                      {listing.title}
                    </h3>

                    {/* Price + Price comparison badge */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      {listing.price && listing.price > 0 ? (
                        <p className="text-sm font-black text-orange-600">
                          {formatPrice(listing.price, listing.currency || t('common.egp'))}
                        </p>
                      ) : (
                        <p className={`text-sm font-black ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t('market.priceOnCall')}
                        </p>
                      )}
                      {priceComparison === 'below' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                          <TrendingDown className="w-2.5 h-2.5" />
                          {t('market.belowAverage')}
                        </span>
                      )}
                      {priceComparison === 'above' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {t('market.aboveAverage')}
                        </span>
                      )}
                    </div>

                    {/* Seller info (NEW — Jumia/Amazon style) */}
                    {sellerName && (
                      <div className="flex items-center gap-1 mb-1.5">
                        {listing.seller?.avatar && (
                          <img
                            src={listing.seller.avatar}
                            alt={sellerName}
                            className={`w-4 h-4 rounded-full object-cover flex-shrink-0 ${darkMode ? 'ring-1 ring-gray-600' : 'ring-1 ring-gray-200'}`}
                          />
                        )}
                        <span className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                          {sellerName}
                        </span>
                        {sellerVerified && (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        )}
                      </div>
                    )}

                    {/* Location */}
                    {(listing.city || listing.location) && (
                      <div className={`flex items-center gap-1 mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <MapPin className="w-3 h-3 text-orange-500 flex-shrink-0" />
                        <span className="text-[10px] font-medium truncate">
                          {listing.city ? getCityNameAr(listing.city) : listing.location}
                        </span>
                      </div>
                    )}

                    {/* Views & Saves Stats */}
                    <div className={`flex items-center gap-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {listing.views_count !== undefined && (
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span className="text-[10px]">{listing.views_count}</span>
                        </div>
                      )}
                      {listing.saves_count !== undefined && listing.saves_count > 0 && (
                        <div className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          <span className="text-[10px]">{listing.saves_count}</span>
                        </div>
                      )}
                      {listing.created_at && (
                        <span className="text-[9px] mr-auto">
                          {timeAgo(listing.created_at, t)}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              7. LOAD MORE
              ═══════════════════════════════════════════════════════════ */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleLoadMore}
                disabled={loadingMore}
                className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-colors ${
                  loadingMore
                    ? darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-400'
                    : darkMode
                      ? 'bg-gray-800 text-orange-400 hover:bg-gray-700 border border-gray-700'
                      : 'bg-white text-orange-600 hover:bg-orange-50 border border-gray-200 shadow-sm'
                }`}
              >
                {loadingMore ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t('market.loading')}
                  </>
                ) : (
                  <>
                    {t('market.loadMore')}
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          )}
        </>
      ) : (
        /* ═══════════════════════════════════════════════════════════
            8. EMPTY STATE
            ═══════════════════════════════════════════════════════════ */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-10 text-center rounded-2xl border ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
          }`}
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            darkMode ? 'bg-gray-700' : 'bg-gray-50'
          }`}>
            <ShoppingBag className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
          </div>
          <h3 className={`text-lg font-black mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            {t('market.noListings')}
          </h3>
          <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {debouncedSearch
              ? t('market.noSearchResults', { query: debouncedSearch })
              : t('market.noMatchingListings')
            }
          </p>
          <div className="flex items-center justify-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                  darkMode ? 'bg-gray-700 text-orange-400 hover:bg-gray-600' : 'bg-gray-100 text-orange-600 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
                {t('market.clearFilters')}
              </button>
            )}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/market/new')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200"
            >
              <Plus className="w-4 h-4" />
              {t('market.addYourAd')}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          FLOATING ADD LISTING FAB
          ═══════════════════════════════════════════════════════════════ */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate('/market/new')}
        className={`fixed bottom-24 z-50 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-colors ${
          darkMode
            ? 'bg-gradient-to-br from-orange-600 to-amber-600 text-white left-6'
            : 'bg-gradient-to-br from-orange-500 to-amber-500 text-white right-6'
        }`}
        style={{
          boxShadow: '0 4px 25px rgba(249, 115, 22, 0.45)',
        }}
        title={t('sidebar.addAd')}
      >
        <Plus className="w-7 h-7" />
      </motion.button>

      {/* ═══════════════════════════════════════════════════════════════
          PROMOTION PACKAGES CTA (Bottom Banner)
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {listings.length > 0 && !debouncedSearch && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className={`mt-8 rounded-2xl p-4 border relative overflow-hidden ${
              darkMode
                ? 'bg-gradient-to-l from-orange-900/20 via-gray-800 to-amber-900/20 border-orange-800/30'
                : 'bg-gradient-to-l from-orange-50 via-white to-amber-50 border-orange-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                darkMode ? 'bg-orange-900/30' : 'bg-orange-100'
              }`}>
                <BadgePercent className={`w-6 h-6 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {t('market.promoteYourAd')}
                </h4>
                <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('market.promoteDescription', { price: marketPromotionPackages[0]?.price || 50 })}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/market/new')}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold ${
                  darkMode ? 'bg-orange-600 text-white' : 'bg-orange-500 text-white'
                }`}
              >
                {t('market.startNow')}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
