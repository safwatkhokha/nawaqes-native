import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';
import { marketPromotionPackages } from '../data/marketPromotionPackages';
import { egyptianCities, getCityNameAr, regionLabels, regionOrder, searchCities } from '../data/egyptianCities';
import {
  ArrowRight,
  Heart,
  MessageCircle,
  Phone,
  MapPin,
  Eye,
  CheckCircle2,
  ShieldCheck,
  Star,
  Zap,
  Loader2,
  ShoppingBag,
  Share2,
  Clock,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  User,
  AlertTriangle,
  MessageSquare,
  X,
  Megaphone,
  Target,
  Wallet,
  Check,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Search,
  Edit3,
  Trash2,
  Pause,
  Play,
  PlayCircle,
  Video,
  Lightbulb,
  ShieldAlert,
  ThumbsUp,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { ImageLightbox } from './ImageLightbox';
import type { MarketListing } from '../types';
import { useSafeBack } from '../hooks/useSafeBack';

// ─── Condition Labels ────────────────────────────────────────────────
const conditionLabels: Record<string, { key: string; color: string; darkColor: string }> = {
  new: { key: 'marketListing.conditionNew', color: 'bg-emerald-100 text-emerald-700', darkColor: 'bg-emerald-900/40 text-emerald-400' },
  used: { key: 'marketListing.conditionUsed', color: 'bg-amber-100 text-amber-700', darkColor: 'bg-amber-900/40 text-amber-400' },
  refurbished: { key: 'marketListing.conditionRefurbished', color: 'bg-sky-100 text-sky-700', darkColor: 'bg-sky-900/40 text-sky-400' },
};

// ─── Payment Method Display ──────────────────────────────────────────
const paymentMethodLabels: Record<string, { key: string; icon: string; color: string; darkColor: string }> = {
  vf_cash: { key: 'marketListing.paymentVfCash', icon: '📱', color: 'bg-red-50 text-red-600 border-red-100', darkColor: 'bg-red-900/30 text-red-400 border-red-800' },
  instapay: { key: 'marketListing.paymentInstapay', icon: '💳', color: 'bg-purple-50 text-purple-600 border-purple-100', darkColor: 'bg-purple-900/30 text-purple-400 border-purple-800' },
  cash: { key: 'marketListing.paymentCash', icon: '💵', color: 'bg-green-50 text-green-600 border-green-100', darkColor: 'bg-green-900/30 text-green-400 border-green-800' },
  bank_transfer: { key: 'marketListing.paymentBankTransfer', icon: '🏦', color: 'bg-blue-50 text-blue-600 border-blue-100', darkColor: 'bg-blue-900/30 text-blue-400 border-blue-800' },
};

// ─── Format Date ─────────────────────────────────────────────────────
function formatDate(dateStr: string, t: (key: string) => string): string {
  try {
    const date = parseDBTimestamp(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('common.now');
    if (diffMins < 60) return `${diffMins} ${t('marketListing.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours} ${t('marketListing.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays} ${t('marketListing.daysAgo')}`;
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Get Category Icon ───────────────────────────────────────────────
function getCategoryIcon(categoryId: string): string {
  const cat = interestCategories.find(c => c.id === categoryId);
  return cat?.icon || '📦';
}

export const MarketListingPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { id } = useParams<{ id: string }>();
  const { darkMode, sendMessage } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // ─── State ──────────────────────────────────────────────────────
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [savesCount, setSavesCount] = useState(0);
  const [similarListings, setSimilarListings] = useState<MarketListing[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  // ─── NEW: Video, Rating, Reviews State ──────────────────────────
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviews, setReviews] = useState<{ id: string; user: string; avatar: string; rating: number; text: string; date: string }[]>([]);
  const [categoryAvgPrice, setCategoryAvgPrice] = useState<number | null>(null);

  // ─── Promotion Modal State ────────────────────────────────────
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [promotionStep, setPromotionStep] = useState<'package' | 'targeting' | 'confirm'>('package');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [submittingPromotion, setSubmittingPromotion] = useState(false);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // ─── Fetch Listing Data ─────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);

    api.getMarketListing(id)
      .then((data: any) => {
        // Map snake_case to camelCase
        const mapped: MarketListing = {
          id: data.id,
          seller: {
            id: data.seller?.id || data.seller_id || '',
            name: data.seller?.name || '',
            avatar: data.seller?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.seller_id || data.id}`,
            isVerified: !!(data.seller?.is_verified),
            isTrusted: !!(data.seller?.is_trusted),
            trustScore: data.seller?.trust_score,
          },
          title: data.title || '',
          description: data.description || '',
          images: Array.isArray(data.images) ? data.images : [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(data.video_url ? { video_url: data.video_url } : {}) as any,
          price: data.price,
          currency: data.currency || 'EGP',
          category: data.category || '',
          subcategory: data.subcategory,
          condition: data.condition || 'used',
          location: data.location,
          city: data.city,
          phone: data.phone,
          whatsapp: data.whatsapp,
          paymentMethods: data.payment_methods || data.paymentMethods || [],
          isPromoted: !!(data.is_promoted ?? data.isPromoted),
          promotionTier: data.promotion_tier || data.promotionTier,
          promotionStatus: data.promotion_status || data.promotionStatus,
          promotionPackage: data.promotion_package || data.promotionPackage,
          promotionExpiresAt: data.promotion_expires_at || data.promotionExpiresAt,
          estimatedReach: data.estimated_reach ?? data.estimatedReach,
          viewsCount: data.views_count ?? data.viewsCount ?? 0,
          savesCount: data.saves_count ?? data.savesCount ?? 0,
          inquiriesCount: data.inquiries_count ?? data.inquiriesCount ?? 0,
          status: data.status,
          createdAt: data.created_at || data.createdAt,
        };
        setListing(mapped);
        setSavesCount(mapped.savesCount || 0);

        // Check if current user has saved this listing
        if (currentUser?.id) {
          api.getSavedMarketListings()
            .then((saved: any) => {
              if (Array.isArray(saved)) {
                setIsSaved(saved.some((s: any) => s.id === id));
              }
            })
            .catch(() => {});
        }
      })
      .catch((err: any) => {
        console.error('Failed to fetch listing:', err);
        setNotFound(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  // ─── NEW: Fetch category average price for price comparison ────
  useEffect(() => {
    if (!listing?.category) return;
    api.getMarketStats()
      .then((data: any) => {
        const breakdown = data.categoryBreakdown || [];
        const cat = breakdown.find((c: any) => c.category === listing.category);
        if (cat && cat.avg_price > 0) {
          setCategoryAvgPrice(cat.avg_price);
        } else {
          setCategoryAvgPrice(null);
        }
      })
      .catch(() => setCategoryAvgPrice(null));
  }, [listing?.category]);

  // ─── Track View ───────────────────────────────────────────────
  // The GET /market/listings/:id endpoint increments views_count
  // server-side on each fetch, so no separate API call is needed.

  // ─── NEW: Submit Review Handler ─────────────────────────────────
  const handleSubmitReview = () => {
    if (!currentUser) {
      toast.error(t('postCard.mustLogin'));
      return;
    }
    if (userRating === 0) {
      toast.error(t('marketListing.rating'));
      return;
    }
    if (!reviewText.trim()) {
      toast.error(t('marketListing.beFirstToReview'));
      return;
    }
    setSubmittingReview(true);
    setTimeout(() => {
      const newReview = {
        id: `local-${Date.now()}`,
        user: currentUser?.name || 'مستخدم',
        avatar: currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'guest'}`,
        rating: userRating,
        text: reviewText.trim(),
        date: new Date().toISOString(),
      };
      setReviews(prev => [newReview, ...prev]);
      setReviewText('');
      setUserRating(0);
      setHoverRating(0);
      setSubmittingReview(false);
      toast.success(t('marketListing.beFirstToReview'));
    }, 600);
  };

  // ─── NEW: Compute price comparison info ─────────────────────────
  const priceComparisonInfo = (() => {
    if (!listing?.price || !categoryAvgPrice || categoryAvgPrice <= 0) return null;
    const diff = listing.price - categoryAvgPrice;
    const pct = Math.round((Math.abs(diff) / categoryAvgPrice) * 100);
    if (listing.price < categoryAvgPrice * 0.9) {
      return { type: 'below' as const, diff, pct, label: t('marketListing.belowMarketAvg'), verdict: t('marketListing.greatDeal') };
    }
    if (listing.price > categoryAvgPrice * 1.1) {
      return { type: 'above' as const, diff, pct, label: t('marketListing.aboveMarketAvg'), verdict: t('marketListing.highPrice') };
    }
    return { type: 'fair' as const, diff, pct, label: t('marketListing.fairPrice'), verdict: t('marketListing.fairPrice') };
  })();

  // ─── Compute seller response rate (mock based on trust score) ──
  const sellerResponseRate = (() => {
    const score = listing?.seller?.trustScore;
    if (score == null) return null;
    if (score >= 80) return { rate: '95%', label: t('marketListing.fastResponder') };
    if (score >= 60) return { rate: '80%', label: t('marketListing.fastResponder') };
    if (score >= 40) return { rate: '60%', label: t('marketListing.responseRate') };
    return { rate: '40%', label: t('marketListing.responseRate') };
  })();

  // ─── Track View ───────────────────────────────────────────────
  // The GET /market/listings/:id endpoint increments views_count
  // server-side on each fetch, so no separate API call is needed.

  // ─── Fetch Similar Listings ─────────────────────────────────────
  useEffect(() => {
    if (!listing?.category) return;
    api.getMarketListings({ category: listing.category, limit: '5' })
      .then((data: any) => {
        const listings = (data.listings || data || []) as any[];
        const mapped = listings
          .filter((l: any) => l.id !== listing.id)
          .slice(0, 4)
          .map((l: any) => ({
            id: l.id,
            seller: {
              id: l.seller?.id || l.seller_id || '',
              name: l.seller?.name || '',
              avatar: l.seller?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${l.seller_id || l.id}`,
              isVerified: !!(l.seller?.is_verified),
              isTrusted: !!(l.seller?.is_trusted),
              trustScore: l.seller?.trust_score,
            },
            title: l.title || '',
            description: l.description || '',
            images: Array.isArray(l.images) ? l.images : [],
            price: l.price,
            currency: l.currency || 'EGP',
            category: l.category || '',
            condition: l.condition || 'used',
            location: l.location,
            city: l.city,
            viewsCount: l.views_count ?? l.viewsCount ?? 0,
            savesCount: l.saves_count ?? l.savesCount ?? 0,
            createdAt: l.created_at || l.createdAt,
            isPromoted: !!(l.is_promoted ?? l.isPromoted),
          } as MarketListing));
        setSimilarListings(mapped);
      })
      .catch(() => {
        // Silently ignore
      });
  }, [listing?.category, listing?.id]);

  // ─── Image Swipe Handlers ───────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (!listing?.images?.length) return;
    if (diff > threshold) {
      // Swipe left (next image)
      setCurrentImageIndex(prev => Math.min(prev + 1, listing.images.length - 1));
    } else if (diff < -threshold) {
      // Swipe right (prev image)
      setCurrentImageIndex(prev => Math.max(prev - 1, 0));
    }
  }, [listing?.images?.length]);

  const goToImage = useCallback((index: number) => {
    setCurrentImageIndex(index);
  }, []);

  const prevImage = useCallback(() => {
    setCurrentImageIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const nextImage = useCallback(() => {
    if (!listing?.images?.length) return;
    setCurrentImageIndex(prev => Math.min(prev + 1, listing.images.length - 1));
  }, [listing?.images?.length]);

  // ─── Action Handlers ────────────────────────────────────────────
  const handleToggleSave = async () => {
    if (!currentUser) {
      toast.error(t('postCard.mustLogin'));
      return;
    }
    if (!id) return;
    setSaving(true);
    try {
      const result = await api.toggleSaveMarketListing(id);
      setIsSaved(result.saved);
      setSavesCount(result.savesCount);
      toast.success(result.saved ? t('postCard.savedPost') : t('postCard.removedFromSaved'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsApp = () => {
    if (!listing?.whatsapp) return;
    const message = encodeURIComponent(t('marketListing.whatsappMessage', { title: listing.title }));
    window.open(`https://wa.me/${listing.whatsapp.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
  };

  const handlePhoneCall = () => {
    if (!listing?.phone) return;
    window.open(`tel:${listing.phone}`, '_self');
  };

  const handleSendMessage = async () => {
    if (!currentUser) {
      toast.error(t('postCard.mustLogin'));
      return;
    }
    if (!listing?.seller?.id) return;
    if (listing.seller.id === currentUser.id) {
      toast.info(t('postCard.yourAd'));
      return;
    }
    setSendingMessage(true);
    try {
      // Just navigate to the chat — don't send any auto-message
      // Also fire inquire
      try {
        const result = await api.inquireMarketListing(listing.id);
        setListing(prev => prev ? { ...prev, inquiriesCount: result.inquiriesCount } : prev);
        setInquirySent(true);
      } catch {
        // Ignore inquire error
      }
      toast.success(t('marketListing.messageSent'));
      navigate(`/messages?chat=${listing.seller.id}`);
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleInquire = async () => {
    if (!id) return;
    try {
      const result = await api.inquireMarketListing(id);
      setListing(prev => prev ? { ...prev, inquiriesCount: result.inquiriesCount } : prev);
      setInquirySent(true);
      toast.success(t('marketListing.inquirySent'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/market/listing/${id}`;
    // Smart link — includes price + title for richer share preview
    const smartShareText = listing?.price
      ? `${listing.title} — ${listing.price.toLocaleString()} ${listing.currency || t('common.egp')}\n${t('marketListing.shareTitle')}`
      : `${listing?.title || t('marketListing.shareTitle')}\n${t('marketListing.shareTitle')}`;
    if (navigator.share) {
      navigator.share({
        title: listing?.title || t('marketListing.shareTitle'),
        text: smartShareText,
        url: shareUrl,
      }).catch(() => {
        // Fallback to clipboard
        navigator.clipboard.writeText(`${smartShareText}\n${shareUrl}`);
        toast.success(t('marketListing.smartLinkCopied'));
      });
    } else {
      navigator.clipboard.writeText(`${smartShareText}\n${shareUrl}`);
      toast.success(t('marketListing.smartLinkCopied'));
    }
  };

  const isOwnListing = currentUser?.id === listing?.seller?.id;
  // Allow promotion for own listings that are not currently actively promoted
  // Re-promotion is allowed if the current promotion is expired or rejected
  const canPromote = isOwnListing && listing && (
    !listing.isPromoted ||
    listing.promotionStatus === 'expired' ||
    listing.promotionStatus === 'rejected'
  );

  // ─── Owner Listing Controls (Edit/Delete/Mark-as-sold/Pause/Activate) ───
  const [ownerActionLoading, setOwnerActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);

  const handleEditListing = () => {
    if (listing) navigate(`/market/edit/${listing.id}`);
  };

  const handleDeleteListing = async () => {
    if (!listing) return;
    setOwnerActionLoading(true);
    try {
      await api.deleteMarketListing(listing.id);
      navigate('/market/my-listings');
    } catch {}
    setOwnerActionLoading(false);
  };

  const handleMarkAsSold = async () => {
    if (!listing) return;
    setOwnerActionLoading(true);
    try {
      await api.updateMarketListingStatus(listing.id, 'sold');
      // Reload listing to reflect new status
      const data = await api.getMarketListing(listing.id);
      setListing(data as any);
    } catch {}
    setOwnerActionLoading(false);
  };

  const handlePauseListing = async () => {
    if (!listing) return;
    setOwnerActionLoading(true);
    try {
      await api.updateMarketListingStatus(listing.id, 'paused');
      const data = await api.getMarketListing(listing.id);
      setListing(data as any);
    } catch {}
    setOwnerActionLoading(false);
  };

  const handleActivateListing = async () => {
    if (!listing) return;
    setOwnerActionLoading(true);
    try {
      await api.updateMarketListingStatus(listing.id, 'active');
      const data = await api.getMarketListing(listing.id);
      setListing(data as any);
    } catch {}
    setOwnerActionLoading(false);
  };

  // ─── Promotion Handlers ────────────────────────────────────────
  const walletBalance = currentUser?.walletBalance || 0;

  const openPromotionModal = () => {
    setShowPromotionModal(true);
    setPromotionStep('package');
    setSelectedPackage(null);
    setSelectedCities([]);
    setSelectedInterests([]);
  };

  const closePromotionModal = () => {
    setShowPromotionModal(false);
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
    if (!listing || !selectedPackage) return;
    const pkg = marketPromotionPackages.find(p => p.id === selectedPackage);
    if (!pkg) return;

    // Wallet check
    if (walletBalance < pkg.price) {
      toast.error(t('marketListing.insufficientWalletBalance'));
      return;
    }

    setSubmittingPromotion(true);
    try {
      const promotionData: Record<string, any> = {
        listingId: listing.id,
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
      toast.success(t('marketListing.promotionRequestSent'));
      closePromotionModal();
      // Update listing to show promoted
      setListing(prev => prev ? { ...prev, isPromoted: true } : prev);
    } catch (err: any) {
      toast.error(err.message || t('marketListing.promotionRequestFailed'));
    } finally {
      setSubmittingPromotion(false);
    }
  };

  const selectedPackageData = selectedPackage
    ? marketPromotionPackages.find(p => p.id === selectedPackage)
    : null;

  // ─── Loading State ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto pb-20" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('common.loading')}
          </h1>
        </div>

        {/* Skeleton */}
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          {/* Image skeleton */}
          <div className={`w-full h-64 animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className="p-5 space-y-4">
            <div className={`h-6 w-3/4 rounded-lg animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-8 w-1/3 rounded-lg animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className="flex gap-3">
              <div className={`h-20 w-20 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-4 w-full rounded animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                <div className={`h-4 w-2/3 rounded animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              </div>
            </div>
            <div className={`h-20 w-full rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>
    );
  }

  // ─── 404 State ──────────────────────────────────────────────────
  if (notFound || !listing) {
    return (
      <div className="max-w-2xl mx-auto pb-20" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('marketListing.notFound')}
          </h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-12 text-center rounded-2xl border ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
          }`}
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
            darkMode ? 'bg-gray-700' : 'bg-orange-50'
          }`}>
            <AlertTriangle className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-orange-300'}`} />
          </div>
          <h3 className={`text-lg font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('marketListing.notFoundTitle')}
          </h3>
          <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('marketListing.notFoundDesc')}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { const scrollEl = document.getElementById('main-feed-scroll') || document.getElementById('page-layout-scroll'); if (scrollEl) (window as any).__pageScrollTop = scrollEl.scrollTop; navigate('/market'); }}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              {t('marketListing.browseMarket')}
            </button>
            <button
              onClick={() => safeBack()}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('common.back')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const images = listing.images || [];
  const condition = conditionLabels[listing.condition] || conditionLabels.used;
  const categoryIcon = getCategoryIcon(listing.category);

  return (
    <div className="max-w-2xl mx-auto pb-20" dir={dir}>
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-lg font-black line-clamp-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {listing.title}
          </h1>
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('marketListing.listingDetails')}
          </p>
        </div>
        <button
          onClick={handleShare}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* ─── 1. Image Gallery ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border overflow-hidden mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        {/* Main Image */}
        <div
          ref={imageContainerRef}
          className={`relative w-full h-64 sm:h-80 overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {images.length > 0 ? (
            <>
              <AnimatePresence mode="wait">
                <motion.img
                  key={currentImageIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  src={images[currentImageIndex]}
                  alt={`${listing.title} - ${currentImageIndex + 1}`}
                  className="w-full h-full object-contain cursor-zoom-in"
                  draggable={false}
                  onClick={() => setLightboxImages(images)}
                  onDoubleClick={() => setLightboxImages(images)}
                />
              </AnimatePresence>

              {/* Image navigation arrows */}
              {images.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button
                      onClick={prevImage}
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        dir === 'rtl' ? 'right-2' : 'left-2'
                      } w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 ${
                        darkMode ? 'bg-black/40 text-white hover:bg-black/60' : 'bg-white/70 text-gray-800 hover:bg-white/90'
                      }`}
                    >
                      {dir === 'rtl' ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                    </button>
                  )}
                  {currentImageIndex < images.length - 1 && (
                    <button
                      onClick={nextImage}
                      className={`absolute top-1/2 -translate-y-1/2 ${
                        dir === 'rtl' ? 'left-2' : 'right-2'
                      } w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-90 ${
                        darkMode ? 'bg-black/40 text-white hover:bg-black/60' : 'bg-white/70 text-gray-800 hover:bg-white/90'
                      }`}
                    >
                      {dir === 'rtl' ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  )}
                </>
              )}

              {/* Image counter */}
              <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold backdrop-blur-md ${
                darkMode ? 'bg-black/50 text-white' : 'bg-white/70 text-gray-800'
              }`}>
                {currentImageIndex + 1} / {images.length}
              </div>

              {/* Promoted badge overlay */}
              {listing.isPromoted && (
                <div className="absolute top-3 right-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black backdrop-blur-md shadow-lg"
                    style={{
                      background: darkMode
                        ? 'linear-gradient(135deg, rgba(251,146,60,0.7), rgba(245,158,11,0.7))'
                        : 'linear-gradient(135deg, rgba(251,146,60,0.9), rgba(245,158,11,0.9))',
                      boxShadow: '0 0 15px rgba(251,146,60,0.4), 0 0 30px rgba(251,146,60,0.15)',
                    }}
                  >
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <span className="text-white">{t('marketListing.featured')}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            // No images placeholder
            <div className={`w-full h-full flex flex-col items-center justify-center ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 ${
                darkMode ? 'bg-gray-600' : 'bg-gray-200'
              }`}>
                <span className="text-4xl">{categoryIcon}</span>
              </div>
              <p className={`text-sm font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('marketListing.noImages')}
              </p>
            </div>
          )}
        </div>

        {/* Thumbnail Row */}
        {images.length > 1 && (
          <div className={`flex gap-1.5 p-2 overflow-x-auto scrollbar-hide border-t ${
            darkMode ? 'border-gray-700' : 'border-gray-100'
          }`}>
            {images.map((img, index) => (
              <button
                key={index}
                onClick={() => goToImage(index)}
                className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all ${
                  index === currentImageIndex
                    ? 'ring-2 ring-orange-500 scale-105'
                    : darkMode ? 'opacity-60 hover:opacity-90' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ─── 2. Listing Info ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={`rounded-2xl border p-5 mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        {/* Title & Promoted Badge */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {/* Promoted glow badge in info section */}
              {listing.isPromoted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
                  style={{
                    background: darkMode
                      ? 'linear-gradient(135deg, rgba(251,146,60,0.3), rgba(245,158,11,0.3))'
                      : 'linear-gradient(135deg, rgba(251,146,60,0.15), rgba(245,158,11,0.15))',
                    color: darkMode ? '#fb923c' : '#ea580c',
                    boxShadow: darkMode ? '0 0 12px rgba(251,146,60,0.2)' : '0 0 12px rgba(251,146,60,0.1)',
                  }}
                >
                  <Zap className="w-3 h-3" />
                  {t('marketListing.featured')}
                </span>
              )}
              <h2 className={`text-xl font-black leading-tight ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {listing.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Promotion Status Banner (for listing owner) */}
        {isOwnListing && listing.promotionStatus && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-3 p-3 rounded-xl border flex items-center gap-2 ${
              listing.promotionStatus === 'pending'
                ? darkMode ? 'bg-amber-900/20 border-amber-700/40' : 'bg-amber-50 border-amber-200'
                : listing.promotionStatus === 'approved'
                  ? darkMode ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-emerald-50 border-emerald-200'
                  : listing.promotionStatus === 'rejected'
                    ? darkMode ? 'bg-red-900/20 border-red-700/40' : 'bg-red-50 border-red-200'
                    : listing.promotionStatus === 'expired'
                      ? darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'
                      : ''
            }`}
          >
            {listing.promotionStatus === 'pending' && <Clock className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-amber-400' : 'text-amber-500'}`} />}
            {listing.promotionStatus === 'approved' && <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-emerald-400' : 'text-emerald-500'}`} />}
            {listing.promotionStatus === 'rejected' && <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />}
            {listing.promotionStatus === 'expired' && <Clock className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${
                listing.promotionStatus === 'pending'
                  ? darkMode ? 'text-amber-300' : 'text-amber-700'
                  : listing.promotionStatus === 'approved'
                    ? darkMode ? 'text-emerald-300' : 'text-emerald-700'
                    : listing.promotionStatus === 'rejected'
                      ? darkMode ? 'text-red-300' : 'text-red-700'
                      : darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {listing.promotionStatus === 'pending' && t('marketListing.promotionPending')}
                {listing.promotionStatus === 'approved' && t('marketListing.promotionApproved')}
                {listing.promotionStatus === 'rejected' && t('marketListing.promotionRejected')}
                {listing.promotionStatus === 'expired' && t('marketListing.promotionExpired')}
              </p>
              {(listing.promotionStatus === 'rejected' || listing.promotionStatus === 'expired') && canPromote && (
                <button
                  onClick={openPromotionModal}
                  className="text-[10px] font-bold text-orange-500 hover:text-orange-600 mt-1 transition-colors"
                >
                  {t('marketListing.rePromote')} →
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Price */}
        <div className="flex items-end gap-2 mb-4">
          <span className={`text-3xl font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            {listing.price != null ? listing.price.toLocaleString() : '—'}
          </span>
          <span className={`text-base font-bold mb-1 ${darkMode ? 'text-orange-400/70' : 'text-orange-500'}`}>
            {listing.currency || t('common.egp')}
          </span>
        </div>

        {/* Condition + Category Badges */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {/* Condition Badge */}
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
            darkMode ? condition.darkColor : condition.color
          }`}>
            {t(condition.key)}
          </span>

          {/* Category Badge */}
          {listing.category && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
              darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>
              <span>{categoryIcon}</span>
              {t(`interests.${listing.category}`, listing.category)}
            </span>
          )}
        </div>

        {/* Location & Date */}
        <div className="flex items-center gap-4 flex-wrap">
          {(listing.location || listing.city) && (
            <div className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <MapPin className="w-4 h-4 text-orange-500" />
              <span className="font-medium">{[listing.city, listing.location].filter(Boolean).join(t('common.commaSeparator'))}</span>
            </div>
          )}
          {listing.createdAt && (
            <div className={`flex items-center gap-1.5 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Clock className="w-4 h-4" />
              <span className="font-medium">{formatDate(listing.createdAt, t)}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* ─── 3. Seller Card ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`rounded-2xl border p-4 mb-4 cursor-pointer transition-all hover:shadow-md ${
          darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'
        }`}
        onClick={() => navigate(`/user/${listing.seller.id}`)}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <img
              src={listing.seller.avatar}
              alt={listing.seller.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-transparent hover:border-orange-400 transition-colors"
            />
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
          </div>

          {/* Seller info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-bold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {listing.seller.name}
              </h4>
              {listing.seller.isVerified && (
                <CheckCircle2 className="w-4.5 h-4.5 text-orange-500 fill-orange-500/10" />
              )}
              {listing.seller.isTrusted && (
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-500" />
              )}
            </div>

            {/* Trust Score + Response Rate */}
            <div className="flex items-center gap-3 flex-wrap">
              {listing.seller.trustScore != null && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className={`text-xs font-bold ${
                      listing.seller.trustScore >= 80
                        ? 'text-emerald-500'
                        : listing.seller.trustScore >= 50
                          ? 'text-amber-500'
                          : 'text-red-500'
                    }`}>
                      {listing.seller.trustScore}%
                    </span>
                  </div>
                  <div className={`w-20 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${listing.seller.trustScore}%`,
                        background: listing.seller.trustScore >= 80
                          ? 'linear-gradient(90deg, #10b981, #34d399)'
                          : listing.seller.trustScore >= 50
                            ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                            : 'linear-gradient(90deg, #ef4444, #f87171)',
                      }}
                    />
                  </div>
                </div>
              )}
              {/* NEW: Response Rate badge */}
              {sellerResponseRate && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  <Zap className="w-2.5 h-2.5" />
                  <span>{sellerResponseRate.rate}</span>
                  <span className="opacity-70">•</span>
                  <span>{sellerResponseRate.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* View Profile Arrow */}
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${
            darkMode ? 'bg-gray-700 text-orange-400 hover:bg-gray-600' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
          }`}>
            <User className="w-3.5 h-3.5" />
            <span>{t('marketListing.viewProfile')}</span>
          </div>
        </div>
      </motion.div>

      {/* ─── NEW: Price Comparison Card (تحليل السعر) ─────────────── */}
      {priceComparisonInfo && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className={`rounded-2xl border p-4 mb-4 ${
            priceComparisonInfo.type === 'below'
              ? darkMode ? 'bg-emerald-900/15 border-emerald-800/40' : 'bg-emerald-50/80 border-emerald-200'
              : priceComparisonInfo.type === 'above'
                ? darkMode ? 'bg-rose-900/15 border-rose-800/40' : 'bg-rose-50/80 border-rose-200'
                : darkMode ? 'bg-amber-900/15 border-amber-800/40' : 'bg-amber-50/80 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              priceComparisonInfo.type === 'below'
                ? darkMode ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                : priceComparisonInfo.type === 'above'
                  ? darkMode ? 'bg-rose-900/40 text-rose-400' : 'bg-rose-100 text-rose-600'
                  : darkMode ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-100 text-amber-600'
            }`}>
              {priceComparisonInfo.type === 'below' ? (
                <TrendingDown className="w-4 h-4" />
              ) : priceComparisonInfo.type === 'above' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <BarChart3 className="w-4 h-4" />
              )}
            </div>
            <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('marketListing.priceAnalysis')}
            </h3>
            <span className={`mr-auto px-2 py-0.5 rounded-full text-[10px] font-black ${
              priceComparisonInfo.type === 'below'
                ? 'bg-emerald-500 text-white'
                : priceComparisonInfo.type === 'above'
                  ? 'bg-rose-500 text-white'
                  : 'bg-amber-500 text-white'
            }`}>
              {priceComparisonInfo.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* This price */}
            <div className={`rounded-xl p-2.5 ${darkMode ? 'bg-gray-800/70' : 'bg-white'}`}>
              <p className={`text-[10px] font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('marketListing.thisPrice')}
              </p>
              <p className={`text-base font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                {listing.price?.toLocaleString()} {listing.currency || t('common.egp')}
              </p>
            </div>
            {/* Market avg */}
            <div className={`rounded-xl p-2.5 ${darkMode ? 'bg-gray-800/70' : 'bg-white'}`}>
              <p className={`text-[10px] font-bold mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('marketListing.marketAverage')}
              </p>
              <p className={`text-base font-black ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                {categoryAvgPrice?.toLocaleString()} {listing.currency || t('common.egp')}
              </p>
            </div>
          </div>

          {/* Verdict + savings */}
          <div className={`flex items-center justify-between p-2.5 rounded-xl ${
            darkMode ? 'bg-gray-800/50' : 'bg-white'
          }`}>
            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {priceComparisonInfo.verdict}
            </span>
            {priceComparisonInfo.type === 'below' && (
              <span className="text-xs font-black text-emerald-600">
                {t('marketListing.savePercentage', { percent: priceComparisonInfo.pct })}
              </span>
            )}
            {priceComparisonInfo.type === 'above' && (
              <span className="text-xs font-black text-rose-600">
                +{priceComparisonInfo.pct}%
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* ─── NEW: Video Player (if video exists) ────────────────────── */}
      {(listing as any).video_url && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13 }}
          className={`rounded-2xl border overflow-hidden mb-4 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
          }`}
        >
          <div className={`flex items-center gap-2 p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'
            }`}>
              <Video className="w-4 h-4" />
            </div>
            <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('marketListing.video')}
            </h3>
          </div>
          {showVideoPlayer ? (
            <div className="relative bg-black aspect-video">
              <video
                controls
                autoPlay
                className="w-full h-full object-contain"
                src={(listing as any).video_url}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowVideoPlayer(true)}
              className={`relative w-full aspect-video flex items-center justify-center group transition-colors ${
                darkMode ? 'bg-gray-900 hover:bg-gray-950' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {listing.images && listing.images.length > 0 && (
                <img
                  src={listing.images[0]}
                  alt={listing.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-2xl shadow-rose-500/40"
                >
                  <PlayCircle className="w-10 h-10 text-white" />
                </motion.div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md ${
                  darkMode ? 'bg-black/40 text-white' : 'bg-white/80 text-gray-800'
                }`}>
                  {t('marketListing.playVideo')}
                </span>
              </div>
            </button>
          )}
        </motion.div>
      )}

      {/* ─── 4. Description ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className={`rounded-2xl border p-5 mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <h3 className={`font-black text-sm mb-3 flex items-center gap-2 ${
          darkMode ? 'text-white' : 'text-gray-900'
        }`}>
          <MessageSquare className="w-4 h-4 text-orange-500" />
          {t('marketListing.description')}
        </h3>
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
          darkMode ? 'text-gray-300' : 'text-gray-700'
        }`}>
          {listing.description || t('marketListing.noDescription')}
        </p>
      </motion.div>

      {/* ─── NEW: Ratings & Reviews (التقييمات والمراجعات) ──────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className={`rounded-2xl border p-5 mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
          }`}>
            <Star className="w-4 h-4 fill-current" />
          </div>
          <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('marketListing.ratingsAndReviews')}
          </h3>
          {reviews.length > 0 && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>
              {reviews.length} {t('marketListing.reviews')}
            </span>
          )}
        </div>

        {/* Star Rating Input */}
        <div className={`p-3 rounded-xl mb-3 ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {t('marketListing.rating')}
          </p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <motion.button
                key={star}
                whileTap={{ scale: 0.85 }}
                onClick={() => setUserRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-0.5"
              >
                <Star className={`w-7 h-7 transition-colors ${
                  (hoverRating || userRating) >= star
                    ? 'text-amber-500 fill-amber-500'
                    : darkMode ? 'text-gray-600' : 'text-gray-300'
                }`} />
              </motion.button>
            ))}
            {userRating > 0 && (
              <span className={`ml-2 text-xs font-bold ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                {userRating}/5
              </span>
            )}
          </div>
        </div>

        {/* Review Text Input */}
        <div className="mb-3">
          <textarea
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            placeholder={t('marketListing.beFirstToReview')}
            rows={2}
            className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-colors resize-none ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-amber-500'
                : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-amber-400 placeholder:text-gray-400'
            }`}
          />
        </div>

        {/* Submit Review Button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmitReview}
          disabled={submittingReview}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-l from-amber-500 to-orange-500 text-white shadow-md disabled:opacity-50"
        >
          {submittingReview ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {t('marketListing.beFirstToReview')}
        </motion.button>

        {/* Existing Reviews List */}
        {reviews.length > 0 && (
          <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            <AnimatePresence>
              {reviews.map(review => (
                <motion.div
                  key={review.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <img src={review.avatar} alt={review.user} className="w-7 h-7 rounded-full object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {review.user}
                      </p>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`w-2.5 h-2.5 ${s <= review.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {review.text}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* ─── 7. Payment Methods ──────────────────────────────────── */}
      {listing.paymentMethods && Array.isArray(listing.paymentMethods) && listing.paymentMethods.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className={`rounded-2xl border p-5 mb-4 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
          }`}
        >
          <h3 className={`font-black text-sm mb-3 flex items-center gap-2 ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            <CreditCard className="w-4 h-4 text-orange-500" />
            {t('marketListing.paymentMethods')}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {listing.paymentMethods.map((method: any, index: number) => {
              const methodKey = typeof method === 'string' ? method : (method.id || method.name || String(method));
              const methodDisplay = paymentMethodLabels[methodKey];
              if (methodDisplay) {
                return (
                  <span
                    key={index}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                      darkMode ? methodDisplay.darkColor : methodDisplay.color
                    }`}
                  >
                    <span>{methodDisplay.icon}</span>
                    {t(methodDisplay.key)}
                  </span>
                );
              }
              // Fallback for unknown methods
              return (
                <span
                  key={index}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    darkMode ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {typeof method === 'string' ? method : method.name || String(method)}
                </span>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ─── 6. Stats Bar ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-2xl border p-4 mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <div className="grid grid-cols-3 gap-3">
          {/* Views */}
          <div className={`text-center p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <Eye className={`w-5 h-5 mx-auto mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {(listing.viewsCount || 0).toLocaleString()}
            </p>
            <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('marketListing.views')}
            </p>
          </div>
          {/* Saves */}
          <div className={`text-center p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <Heart className={`w-5 h-5 mx-auto mb-1 ${darkMode ? 'text-rose-400' : 'text-rose-500'}`} />
            <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {savesCount.toLocaleString()}
            </p>
            <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('marketListing.saves')}
            </p>
          </div>
          {/* Inquiries */}
          <div className={`text-center p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <MessageCircle className={`w-5 h-5 mx-auto mb-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-500'}`} />
            <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {(listing.inquiriesCount || 0).toLocaleString()}
            </p>
            <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('marketListing.inquiries')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── 5. Contact Buttons ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={`rounded-2xl border p-4 mb-4 ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {/* WhatsApp */}
          {listing.whatsapp && (
            <button
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-200/30"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t('marketListing.contactWhatsApp')}
            </button>
          )}

          {/* Phone Call */}
          {listing.phone && (
            <button
              onClick={handlePhoneCall}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                darkMode
                  ? 'bg-sky-900/50 text-sky-400 hover:bg-sky-900/70 border border-sky-800'
                  : 'bg-sky-50 text-sky-600 hover:bg-sky-100 border border-sky-200'
              }`}
            >
              <Phone className="w-5 h-5" />
              {t('marketListing.call')}
            </button>
          )}

          {/* Send Message */}
          {!isOwnListing && (
            <button
              onClick={handleSendMessage}
              disabled={sendingMessage}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-200/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingMessage ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <MessageCircle className="w-5 h-5" />
              )}
              {t('marketListing.send')}
            </button>
          )}

          {/* Save / Heart */}
          <button
            onClick={handleToggleSave}
            disabled={saving}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
              isSaved
                ? darkMode
                  ? 'bg-rose-900/40 text-rose-400 border border-rose-800'
                  : 'bg-rose-50 text-rose-600 border border-rose-200'
                : darkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
            } disabled:opacity-50`}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isSaved ? (
              <Heart className="w-5 h-5 fill-current" />
            ) : (
              <Heart className="w-5 h-5" />
            )}
            {isSaved
              ? t('marketListing.saved')
              : t('marketListing.saveListing')
            }
          </button>
        </div>

        {/* Inquire Button (if not own listing) */}
        {!isOwnListing && !inquirySent && (
          <button
            onClick={handleInquire}
            className={`w-full mt-2.5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] ${
              darkMode
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            {t('marketListing.registerInterest')}
          </button>
        )}

        {inquirySent && (
          <div className={`mt-2.5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold ${
            darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
          }`}>
            <CheckCircle2 className="w-4 h-4" />
            {t('marketListing.interestRegistered')}
          </div>
        )}
      </motion.div>

      {/* ─── 9. Promote Button (Own listing, not promoted) ────────── */}
      {canPromote && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-4"
        >
          <button
            onClick={openPromotionModal}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black transition-all active:scale-[0.98] shadow-lg"
            style={{
              background: darkMode
                ? 'linear-gradient(135deg, #ea580c, #d97706)'
                : 'linear-gradient(135deg, #f97316, #ea580c)',
              boxShadow: '0 4px 20px rgba(249, 115, 22, 0.35)',
            }}
          >
            <Zap className="w-5 h-5 text-white" />
            <span className="text-white">{t('marketListing.promoteListing')}</span>
          </button>
        </motion.div>
      )}

      {/* ─── 7b. Owner Controls (Edit / Mark as Sold / Pause / Activate / Delete) ─── */}
      {isOwnListing && listing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 flex-wrap">
            {/* Edit */}
            <button
              onClick={handleEditListing}
              disabled={ownerActionLoading}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              {t('market.edit', 'تعديل')}
            </button>

            {/* Mark as Sold (only if active) */}
            {listing.status === 'active' && (
              <button
                onClick={handleMarkAsSold}
                disabled={ownerActionLoading}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  darkMode ? 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
              >
                {ownerActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {t('market.markAsSold', 'تم البيع')}
              </button>
            )}

            {/* Pause (only if active) */}
            {listing.status === 'active' && (
              <button
                onClick={handlePauseListing}
                disabled={ownerActionLoading}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  darkMode ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50' : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                }`}
              >
                <Pause className="w-3.5 h-3.5" />
                {t('market.pause', 'إيقاف مؤقت')}
              </button>
            )}

            {/* Activate (only if paused) */}
            {listing.status === 'paused' && (
              <button
                onClick={handleActivateListing}
                disabled={ownerActionLoading}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  darkMode ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50' : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                {t('market.activate', 'تفعيل')}
              </button>
            )}

            {/* Delete */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={ownerActionLoading}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                darkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-red-50 text-red-500 hover:bg-red-100'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('market.delete', 'حذف')}
            </button>
          </div>

          {/* Status badge for owner */}
          {listing.status && listing.status !== 'active' && (
            <div className={`mt-2 px-3 py-1.5 rounded-lg text-[10px] font-bold inline-block ${
              listing.status === 'sold' ? (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')
              : listing.status === 'paused' ? (darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600')
              : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600')
            }`}>
              {listing.status === 'sold' ? '✅ تم البيع' : listing.status === 'paused' ? '⏸ متوقف مؤقتاً' : '🗑 محذوف'}
            </div>
          )}
        </motion.div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className={`rounded-2xl p-6 max-w-sm w-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('market.deleteConfirmTitle', 'حذف الإعلان')}</h3>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('market.deleteConfirmDesc', 'سيتم حذف الإعلان نهائياً من السوق')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
              >
                {t('common.cancel', 'إلغاء')}
              </button>
              <button
                onClick={handleDeleteListing}
                disabled={ownerActionLoading}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-500 text-white hover:bg-red-600"
              >
                {ownerActionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('market.delete', 'حذف')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── NEW: Safety Tips (نصائح الأمان) ────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className={`rounded-2xl border p-4 mb-4 ${
          darkMode
            ? 'bg-gradient-to-br from-sky-900/15 to-blue-900/10 border-sky-800/40'
            : 'bg-gradient-to-br from-sky-50/80 to-blue-50/60 border-sky-200'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            darkMode ? 'bg-sky-900/40 text-sky-400' : 'bg-sky-100 text-sky-600'
          }`}>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('marketListing.safetyTips')}
          </h3>
        </div>
        <ul className="space-y-2">
          {[1, 2, 3, 4, 5].map(tipNum => (
            <li key={tipNum} className={`flex items-start gap-2 text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
              <span className="leading-relaxed">
                {t(`marketListing.safetyTip${tipNum}`)}
              </span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* ─── 8. Similar Listings ──────────────────────────────────── */}
      {similarListings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
            }`}>
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('marketListing.similarListings')}
            </h3>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {similarListings.map((item) => {
              const itemCondition = conditionLabels[item.condition] || conditionLabels.used;
              const itemCategoryIcon = getCategoryIcon(item.category);
              return (
                <motion.div
                  key={item.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/market/listing/${item.id}`)}
                  className={`flex-shrink-0 w-52 rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                  }`}
                >
                  {/* Image */}
                  <div className={`w-full h-28 relative ${
                    item.images?.length ? '' : darkMode ? 'bg-gray-700' : 'bg-gray-100'
                  }`}>
                    {item.images?.length ? (
                      <img
                        src={item.images[0]}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-3xl">{itemCategoryIcon}</span>
                      </div>
                    )}
                    {/* Promoted mini badge */}
                    {item.isPromoted && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-orange-500/90 text-white backdrop-blur-sm">
                        {t('marketListing.ad')}
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <p className={`text-xs font-bold line-clamp-1 mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        darkMode ? itemCondition.darkColor : itemCondition.color
                      }`}>
                        {t(itemCondition.key)}
                      </span>
                      {(item.city || item.location) && (
                        <span className={`text-[9px] flex items-center gap-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <MapPin className="w-2.5 h-2.5" />
                          {item.city || item.location}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-black text-orange-600">
                      {item.price != null ? item.price.toLocaleString() : '—'} {item.currency || t('common.egp')}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ─── Promotion Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showPromotionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
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
              dir="rtl"
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
                      {t('marketListing.promoteListing')}
                    </h3>
                    <p className={`text-[10px] font-medium line-clamp-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {listing.title}
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
                {/* Step Indicators - Enhanced with progress bar */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    {(['package', 'targeting', 'confirm'] as const).map((step, i) => {
                      const stepLabels = { package: t('marketListing.stepPackage'), targeting: t('marketListing.stepTargeting'), confirm: t('marketListing.stepConfirm') };
                      const stepIcons = { package: <ShoppingBag className="w-3.5 h-3.5" />, targeting: <Target className="w-3.5 h-3.5" />, confirm: <Wallet className="w-3.5 h-3.5" /> };
                      const isActive = promotionStep === step;
                      const isDone = promotionStep === 'targeting' && i === 0
                        || promotionStep === 'confirm' && i <= 1;
                      return (
                        <React.Fragment key={step}>
                          {i > 0 && (
                            <div className={`flex-1 h-1 rounded-full mx-1 transition-all duration-300 ${
                              isDone
                                ? 'bg-orange-500'
                                : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                            }`} />
                          )}
                          <motion.div
                            animate={{ scale: isActive ? 1.05 : 1 }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-300 ${
                              isActive
                                ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20'
                                : isDone
                                  ? darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
                                  : darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {isDone && step !== promotionStep ? (
                              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                <Check className="w-3 h-3" />
                              </motion.div>
                            ) : (
                              stepIcons[step]
                            )}
                            <span className="hidden sm:inline">{stepLabels[step]}</span>
                          </motion.div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* ─── Step 1: Package Selection ─────────────────────── */}
                {promotionStep === 'package' && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-3"
                  >
                    <p className={`text-xs font-bold mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {t('marketListing.choosePromotionPackage')}
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
                                  {pkg.duration} {t('marketListing.days')}
                                </span>
                                <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  <TrendingUp className="w-3 h-3" />
                                  {pkg.estimatedReach.toLocaleString()} {t('marketListing.reach')}
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
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}

                    {/* Wallet Balance Notice */}
                    <div className={`p-3 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-amber-50 border-amber-100'}`}>
                      <div className="flex items-center gap-2">
                        <Wallet className={`w-4 h-4 ${walletBalance > 0 ? 'text-green-500' : 'text-red-500'}`} />
                        <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {t('marketListing.yourWalletBalance')}{' '}
                          <span className={walletBalance > 0 ? 'text-green-600' : 'text-red-600'}>
                            {walletBalance.toLocaleString()} {t('common.egp')}
                          </span>
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ─── Step 2: Targeting ──────────────────────────────── */}
                {promotionStep === 'targeting' && selectedPackageData && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="text-center mb-2">
                      <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                        <Target className="w-6 h-6 text-orange-600" />
                      </div>
                      <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {t('marketListing.targetingOptions')}
                      </h3>
                    </div>

                    {/* City Targeting */}
                    {selectedPackageData.targeting === 'city' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {t('marketListing.selectTargetCities')}
                          </p>
                          <span className={`text-xs font-bold ${selectedCities.length > 0 ? 'text-orange-600' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {selectedCities.length > 0 ? t('marketListing.cityCount', { count: selectedCities.length }) : ''}
                          </span>
                        </div>

                        {/* Search */}
                        <div className="relative">
                          <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <input
                            type="text"
                            value={citySearch}
                            onChange={(e) => setCitySearch(e.target.value)}
                            placeholder={t('marketListing.searchCity')}
                            className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${
                              darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                            }`}
                          />
                        </div>

                        {/* Quick select */}
                        <div className="flex gap-2">
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
                            {t('common.deselectAll')}
                          </button>
                        </div>

                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
                          {regionOrder.map(regionKey => {
                            const regionLabel = regionLabels[regionKey];
                            if (!regionLabel) return null;
                            const filtered = searchCities(citySearch);
                            const regionCities = filtered.filter(c => c.region === regionKey);
                            if (regionCities.length === 0) return null;
                            return (
                              <div key={regionKey}>
                                <p className={`text-[10px] font-black mb-1.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'} uppercase`}>
                                  {t(`marketListing.regions.${regionKey}`, regionLabel.en)}
                                </p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {regionCities.map(city => {
                                    const isSelected = selectedCities.includes(city.id);
                                    return (
                                      <button
                                        key={city.id}
                                        onClick={() => toggleCitySelection(city.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                                          isSelected
                                            ? darkMode
                                              ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                                              : 'bg-orange-50 border-orange-400 text-orange-700'
                                            : darkMode
                                              ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                                              : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                                        }`}
                                      >
                                        <MapPin className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-orange-500' : darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                                        <span className="truncate">{t(`marketListing.cities.${city.id}`, city.nameEn)}</span>
                                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 mr-auto flex-shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {selectedCities.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedCities.map(cityId => (
                              <span
                                key={cityId}
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                                  darkMode ? 'bg-orange-600/20 text-orange-300 hover:bg-orange-600/30' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                }`}
                                onClick={() => toggleCitySelection(cityId)}
                              >
                                {getCityNameAr(cityId)}
                                <X className="w-2.5 h-2.5" />
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interest Targeting */}
                    {selectedPackageData.targeting === 'interests' && (
                      <div className="space-y-3">
                        <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t('marketListing.selectTargetInterests')}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {interestCategories.map(cat => {
                            const isSelected = selectedInterests.includes(cat.id);
                            return (
                              <button
                                key={cat.id}
                                onClick={() => toggleInterestSelection(cat.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                                  isSelected
                                    ? darkMode
                                      ? 'bg-orange-600/20 border-orange-500 text-orange-300'
                                      : 'bg-orange-50 border-orange-400 text-orange-700'
                                    : darkMode
                                      ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                <span>{cat.icon}</span>
                                <span className="truncate">{cat.nameKey || cat.id}</span>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 mr-auto flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => setPromotionStep('package')}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                          darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t('common.back')}
                      </button>
                      <button
                        onClick={() => setPromotionStep('confirm')}
                        disabled={selectedPackageData.targeting === 'city' && selectedCities.length === 0}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.next')}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ─── Step 3: Confirm ────────────────────────────────── */}
                {promotionStep === 'confirm' && selectedPackageData && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    {/* Package Summary */}
                    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-orange-50 border-orange-100'}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br ${selectedPackageData.color} shadow-lg`}>
                          {selectedPackageData.icon}
                        </div>
                        <div>
                          <h4 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {selectedPackageData.name}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span className={`font-black text-sm ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                              {selectedPackageData.price} {t('common.egp')}
                            </span>
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              / {selectedPackageData.duration} {t('marketListing.days')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {selectedPackageData.features.map((f, i) => (
                          <span key={i} className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                            {f}
                          </span>
                        ))}
                      </div>
                      {/* Selected targeting info */}
                      {selectedCities.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-2">
                          <MapPin className="w-3 h-3 text-teal-500" />
                          {selectedCities.slice(0, 3).map(id => (
                            <span key={id} className={`text-[10px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-teal-900/30 text-teal-300' : 'bg-teal-100 text-teal-700'}`}>
                              {getCityNameAr(id)}
                            </span>
                          ))}
                          {selectedCities.length > 3 && (
                            <span className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              +{selectedCities.length - 3} {t('marketListing.more')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Wallet Info */}
                    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-white border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t('marketListing.walletBalance')}
                        </span>
                        <span className={`text-sm font-black ${walletBalance >= selectedPackageData.price ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                          {walletBalance.toLocaleString()} {t('common.egp')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t('marketListing.promotionCost')}
                        </span>
                        <span className={`text-sm font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                          -{selectedPackageData.price.toLocaleString()} {t('common.egp')}
                        </span>
                      </div>
                      <div className={`flex items-center justify-between pt-2 border-t ${darkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                        <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {t('marketListing.balanceAfterPromotion')}
                        </span>
                        <span className={`text-sm font-black ${(walletBalance - selectedPackageData.price) >= 0 ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-600')}`}>
                          {(walletBalance - selectedPackageData.price).toLocaleString()} {t('common.egp')}
                        </span>
                      </div>
                    </div>

                    {walletBalance < selectedPackageData.price && (
                      <div className={`p-3 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800/50' : 'bg-red-50 border-red-100'}`}>
                        <p className={`text-xs font-bold text-red-600`}>
                          {t('marketListing.insufficientBalanceCharge')}
                        </p>
                        <button
                          onClick={() => { closePromotionModal(); navigate('/wallet'); }}
                          className="mt-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          {t('marketListing.chargeWallet')}
                        </button>
                      </div>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (selectedPackageData.targeting === 'city' || selectedPackageData.targeting === 'interests') {
                            setPromotionStep('targeting');
                          } else {
                            setPromotionStep('package');
                          }
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                          darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t('common.back')}
                      </button>
                      <button
                        onClick={handleConfirmPromotion}
                        disabled={submittingPromotion || walletBalance < selectedPackageData.price}
                        className="flex-1 py-3 rounded-xl text-sm font-black bg-gradient-to-l from-orange-500 to-amber-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-orange-500/20"
                      >
                        {submittingPromotion ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('marketListing.processing')}
                          </span>
                        ) : (
                          <span>
                            {t('marketListing.confirmPromotion', { price: selectedPackageData.price })}
                          </span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Image Lightbox (fullscreen zoom + download) ─── */}
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          index={currentImageIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}
    </div>
  );
};
