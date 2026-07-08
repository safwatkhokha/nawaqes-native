import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { promotionPackages, cityTiers } from '../data/promotionPackages';
import { marketPromotionPackages } from '../data/marketPromotionPackages';
import { api } from '../services/api';
import {
  ArrowRight,
  Zap,
  Eye,
  Clock,
  Bell,
  MessageCircle,
  Sparkles,
  Target,
  MapPin,
  Brain,
  Crown,
  CheckCircle2,
  Wallet,
  TrendingUp,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Star,
  Megaphone,
  Activity,
  X,
  RefreshCw,
  Check,
  Minus,
  BarChart3,
  Rocket,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useSafeBack } from '../hooks/useSafeBack';
import { toast } from '../lib/silentToast';

export const PromotionPackagesPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [activeTab, setActiveTab] = useState<'posts' | 'market'>('posts');
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [showCityTiers, setShowCityTiers] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // Active promotions + history (NEW)
  const [myPromotions, setMyPromotions] = useState<any[]>([]);
  const [loadingPromotions, setLoadingPromotions] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadingPromotions(true);
    api.getMyPromotionRequests()
      .then((data: any) => {
        if (mounted && Array.isArray(data)) {
          setMyPromotions(data);
        }
      })
      .catch(() => {
        if (mounted) setMyPromotions([]);
      })
      .finally(() => {
        if (mounted) setLoadingPromotions(false);
      });
    return () => { mounted = false; };
  }, []);

  if (!currentUser) return null;

  const walletBalance = currentUser.walletBalance || 0;
  const currentPackages = activeTab === 'posts' ? promotionPackages : marketPromotionPackages;

  // Promotion status helpers
  const getPromoStatusInfo = (p: any) => {
    const status = p.status || (p.is_approved ? 'approved' : 'pending');
    switch (status) {
      case 'approved':
        if (p.is_active) return { label: t('promotionPackagesPage.activeNow', 'نشط الآن'), color: 'bg-green-500', textColor: 'text-green-500', bg: darkMode ? 'bg-green-900/30' : 'bg-green-50' };
        return { label: t('promotionPackagesPage.approved', 'معتمد'), color: 'bg-blue-500', textColor: 'text-blue-500', bg: darkMode ? 'bg-blue-900/30' : 'bg-blue-50' };
      case 'pending':
        return { label: t('promotionPackagesPage.underReview', 'قيد المراجعة'), color: 'bg-yellow-500', textColor: 'text-yellow-500', bg: darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50' };
      case 'rejected':
        return { label: t('promotionPackagesPage.rejected', 'مرفوض'), color: 'bg-red-500', textColor: 'text-red-500', bg: darkMode ? 'bg-red-900/30' : 'bg-red-50' };
      case 'expired':
        return { label: t('promotionPackagesPage.expired', 'منتهي'), color: 'bg-gray-500', textColor: 'text-gray-500', bg: darkMode ? 'bg-gray-700/30' : 'bg-gray-100' };
      default:
        return { label: status, color: 'bg-gray-500', textColor: 'text-gray-500', bg: darkMode ? 'bg-gray-700/30' : 'bg-gray-100' };
    }
  };

  const computeDaysRemaining = (p: any) => {
    if (!p.expires_at && !p.end_date) return null;
    const end = new Date(p.expires_at || p.end_date).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const activePromotions = myPromotions.filter(p => p.status === 'approved' && (p.is_active || computeDaysRemaining(p) === null || (computeDaysRemaining(p) ?? 0) > 0));
  const pastPromotions = myPromotions.filter(p => !activePromotions.includes(p));

  // Comparison table data (NEW) — 3 tiers
  const comparisonTiers = [
    {
      id: 'basic', name: t('promotionPackagesPage.tierBasic', 'أساسي'),
      price: 50, duration: 3, reach: 1000, color: 'from-blue-500 to-cyan-500',
      icon: '🚀', isPopular: false,
      features: {
        durationDays: 3,
        estimatedReach: 1000,
        notifications: 50,
        basicAnalytics: true,
        advancedAnalytics: false,
        aiTargeting: false,
        priorityFeed: false,
        smartLink: false,
        categoryTargeting: true,
        locationTargeting: false,
        interestTargeting: false,
        messagePush: false,
      },
    },
    {
      id: 'standard', name: t('promotionPackagesPage.tierStandard', 'قياسي'),
      price: 150, duration: 7, reach: 5000, color: 'from-purple-500 to-violet-500',
      icon: '⭐', isPopular: true,
      features: {
        durationDays: 7,
        estimatedReach: 5000,
        notifications: 200,
        basicAnalytics: true,
        advancedAnalytics: true,
        aiTargeting: true,
        priorityFeed: true,
        smartLink: false,
        categoryTargeting: true,
        locationTargeting: true,
        interestTargeting: true,
        messagePush: true,
      },
    },
    {
      id: 'pro', name: t('promotionPackagesPage.tierPro', 'احترافي'),
      price: 300, duration: 14, reach: 20000, color: 'from-orange-500 to-amber-600',
      icon: '👑', isPopular: false,
      features: {
        durationDays: 14,
        estimatedReach: 20000,
        notifications: 1000,
        basicAnalytics: true,
        advancedAnalytics: true,
        aiTargeting: true,
        priorityFeed: true,
        smartLink: true,
        categoryTargeting: true,
        locationTargeting: true,
        interestTargeting: true,
        messagePush: true,
      },
    },
  ];

  const comparisonRows: { label: string; key: string; type: 'check' | 'number' | 'text' }[] = [
    { label: t('promotionPackagesPage.featDuration', 'المدة (أيام)'), key: 'durationDays', type: 'number' },
    { label: t('promotionPackagesPage.featReach', 'الوصول المقدر'), key: 'estimatedReach', type: 'number' },
    { label: t('promotionPackagesPage.featNotifications', 'الإشعارات'), key: 'notifications', type: 'number' },
    { label: t('promotionPackagesPage.featBasicAnalytics', 'إحصائيات أساسية'), key: 'basicAnalytics', type: 'check' },
    { label: t('promotionPackagesPage.featAdvancedAnalytics', 'إحصائيات متقدمة'), key: 'advancedAnalytics', type: 'check' },
    { label: t('promotionPackagesPage.featAiTargeting', 'استهداف بالذكاء الاصطناعي'), key: 'aiTargeting', type: 'check' },
    { label: t('promotionPackagesPage.featCategoryTargeting', 'استهداف الفئات'), key: 'categoryTargeting', type: 'check' },
    { label: t('promotionPackagesPage.featLocationTargeting', 'استخدام جغرافي'), key: 'locationTargeting', type: 'check' },
    { label: t('promotionPackagesPage.featInterestTargeting', 'استهداف الاهتمامات'), key: 'interestTargeting', type: 'check' },
    { label: t('promotionPackagesPage.featPriorityFeed', 'أولوية في الخلاصة'), key: 'priorityFeed', type: 'check' },
    { label: t('promotionPackagesPage.featMessagePush', 'إشعارات للمستخدمين'), key: 'messagePush', type: 'check' },
    { label: t('promotionPackagesPage.featSmartLink', 'رابط ذكي'), key: 'smartLink', type: 'check' },
  ];

  const getTargetingIcon = (targeting: string) => {
    switch (targeting) {
      case 'city': return <MapPin className="w-4 h-4" />;
      case 'interests': return <Brain className="w-4 h-4" />;
      default: return <Target className="w-4 h-4" />;
    }
  };

  const getTargetingLabel = (targeting: string) => {
    switch (targeting) {
      case 'city': return t('promotionPackagesPage.cityTargeting', 'استهداف جغرافي');
      case 'interests': return t('promotionPackagesPage.interestTargeting', 'استهداف ذكي');
      default: return t('promotionPackagesPage.allUsers', 'جميع المستخدمين');
    }
  };

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
        <div className="flex-1">
          <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('promotionPackagesPage.title', 'باقات الترويج')}
          </h1>
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('promotionPackagesPage.subtitle', 'اختر الباقة المناسبة وزد وصول إعلانك')}
          </p>
        </div>
      </div>

      {/* Wallet Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl p-4 mb-6 border ${
          darkMode
            ? 'bg-gradient-to-l from-orange-900/30 to-amber-900/20 border-orange-800/30'
            : 'bg-gradient-to-l from-orange-50 to-amber-50 border-orange-100'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              darkMode ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-600'
            }`}>
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <p className={`text-[10px] font-bold ${darkMode ? 'text-orange-400/70' : 'text-orange-600/70'}`}>
                {t('promotionPackagesPage.walletBalance', 'رصيد محفظتك')}
              </p>
              <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {walletBalance.toLocaleString()} <span className="text-xs">{t('common.egp', 'ج.م')}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/wallet')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
              walletBalance > 0
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : darkMode
                  ? 'bg-orange-900/40 text-orange-400 hover:bg-orange-900/60'
                  : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
            }`}
          >
            {walletBalance > 0
              ? t('promotionPackagesPage.chargeMore', 'شحن المزيد')
              : t('promotionPackagesPage.chargeWallet', 'شحن المحفظة')
            }
          </button>
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`rounded-2xl p-5 mb-6 border ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('promotionPackagesPage.howItWorks', 'كيف يعمل الترويج؟')}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              icon: <Megaphone className="w-5 h-5" />,
              step: '1',
              title: t('promotionPackagesPage.step1Title', 'اختر الباقة'),
              desc: t('promotionPackagesPage.step1Desc', 'اختر باقة تناسب ميزانيتك'),
            },
            {
              icon: <CreditCard className="w-5 h-5" />,
              step: '2',
              title: t('promotionPackagesPage.step2Title', 'ادفع من المحفظة'),
              desc: t('promotionPackagesPage.step2Desc', 'يُخصم المبلغ من رصيدك'),
            },
            {
              icon: <TrendingUp className="w-5 h-5" />,
              step: '3',
              title: t('promotionPackagesPage.step3Title', 'وصل للآلاف'),
              desc: t('promotionPackagesPage.step3Desc', 'إعلانك يصل للمهتمين'),
            },
          ].map((item, idx) => (
            <div key={idx} className="text-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 ${
                darkMode ? 'bg-gray-700 text-orange-400' : 'bg-orange-50 text-orange-600'
              }`}>
                {item.icon}
              </div>
              <p className={`text-[10px] font-black mb-0.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {item.title}
              </p>
              <p className={`text-[9px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Tabs: Posts vs Market */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-1 justify-center ${
            activeTab === 'posts'
              ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          {t('promotionPackagesPage.postPromotions', 'ترويج المنشورات')}
        </button>
        <button
          onClick={() => setActiveTab('market')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-1 justify-center ${
            activeTab === 'market'
              ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200 shadow-sm'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          {t('promotionPackagesPage.marketPromotions', 'ترويج السوق الذكي')}
        </button>
      </div>

      {/* Packages List */}
      <div className="space-y-4">
        {currentPackages.map((pkg, idx) => {
          const isExpanded = expandedPkg === pkg.id;
          const canAfford = walletBalance >= pkg.price;
          const isPopular = pkg.id === 'premium';

          return (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
              className={`rounded-2xl border overflow-hidden transition-all ${
                isPopular
                  ? darkMode
                    ? 'border-purple-500/50 ring-1 ring-purple-500/20'
                    : 'border-purple-200 ring-1 ring-purple-100'
                  : darkMode
                    ? 'border-gray-700'
                    : 'border-gray-100'
              } ${darkMode ? 'bg-gray-800' : 'bg-white'}`}
            >
              {/* Popular Badge */}
              {isPopular && (
                <div className="bg-gradient-to-l from-purple-500 to-pink-500 px-4 py-1.5 flex items-center justify-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-white" />
                  <span className="text-[10px] font-black text-white">
                    {t('promotionPackagesPage.mostPopular', 'الأكثر طلباً')}
                  </span>
                </div>
              )}

              {/* Package Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedPkg(isExpanded ? null : pkg.id)}
              >
                <div className="flex items-start gap-3">
                  {/* Package Icon */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pkg.color} flex items-center justify-center text-xl flex-shrink-0 shadow-md`}>
                    {pkg.icon}
                  </div>

                  {/* Package Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`font-black text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {pkg.name}
                      </h3>
                      {getTargetingIcon(pkg.targeting || 'all')}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {getTargetingLabel(pkg.targeting || 'all')}
                      </span>
                    </div>

                    {/* Quick Stats */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Eye className="w-3 h-3" />
                        ~{pkg.estimatedReach.toLocaleString()} {t('promotionPackagesPage.reach', 'وصول')}
                      </span>
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3" />
                        {pkg.duration} {t('common.days', 'يوم')}
                      </span>
                      <span className={`flex items-center gap-1 text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Bell className="w-3 h-3" />
                        {pkg.maxNotifications} {t('promotionPackagesPage.notifications', 'إشعار')}
                      </span>
                    </div>

                    {/* Features Preview */}
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.features.slice(0, isExpanded ? pkg.features.length : 2).map((feature, fIdx) => (
                        <span
                          key={fIdx}
                          className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md ${
                            darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                          {feature}
                        </span>
                      ))}
                      {!isExpanded && pkg.features.length > 2 && (
                        <span className={`text-[9px] font-bold px-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                          +{pkg.features.length - 2} {t('promotionPackagesPage.more', 'المزيد')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price + Expand */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="text-end">
                      <span className={`text-2xl font-black ${canAfford
                        ? darkMode ? 'text-green-400' : 'text-green-600'
                        : darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {pkg.price}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}> {t('common.egp', 'ج.م')}</span>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
                      darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                    } ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className={`px-4 pb-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      {/* All Features */}
                      <div className="pt-4 space-y-2">
                        <h4 className={`text-[10px] font-black uppercase tracking-wider mb-2 ${
                          darkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {t('promotionPackagesPage.allFeatures', 'جميع المميزات')}
                        </h4>
                        {pkg.features.map((feature, fIdx) => (
                          <div key={fIdx} className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {feature}
                            </span>
                          </div>
                        ))}

                        {/* Messages included */}
                        {pkg.includeMessages && (
                          <div className="flex items-center gap-2">
                            <MessageCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {t('promotionPackagesPage.directMessages', 'رسائل ترويجية مباشرة')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* City Tiers for city_target package */}
                      {pkg.id === 'city_target' && (
                        <div className="mt-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCityTiers(!showCityTiers);
                            }}
                            className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider mb-2 ${
                              darkMode ? 'text-orange-400' : 'text-orange-600'
                            }`}
                          >
                            <MapPin className="w-4 h-4" />
                            {t('promotionPackagesPage.cityTiers', 'أسعار استهداف المدن')}
                            {showCityTiers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          <AnimatePresence>
                            {showCityTiers && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-2 mt-2"
                              >
                                {cityTiers.map((tier, tIdx) => (
                                  <div
                                    key={tIdx}
                                    className={`flex items-center justify-between p-2 rounded-xl ${
                                      darkMode ? 'bg-gray-700' : 'bg-gray-50'
                                    }`}
                                  >
                                    <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                      {tier.label}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[9px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        ~{(tier.estimatedReach || 0).toLocaleString()} {t('promotionPackagesPage.reach', 'وصول')}
                                      </span>
                                      <span className={`text-[10px] font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                                        {tier.price} {t('common.egp', 'ج.م')}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => {
                            if (activeTab === 'posts') {
                              navigate('/');
                            } else {
                              navigate('/market');
                            }
                          }}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                            canAfford
                              ? 'bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-200 hover:shadow-xl'
                              : darkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <Zap className="w-4 h-4" />
                          {canAfford
                            ? t('promotionPackagesPage.promoteNow', 'ترويج الآن')
                            : t('promotionPackagesPage.chargeToPromote', 'شحن المحفظة للترويج')
                          }
                        </button>
                        {!canAfford && (
                          <button
                            onClick={() => navigate('/wallet')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              darkMode
                                ? 'bg-orange-900/40 text-orange-400 hover:bg-orange-900/60'
                                : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                            }`}
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Insufficient balance warning */}
                      {!canAfford && (
                        <div className={`mt-2 p-2 rounded-xl flex items-center gap-2 ${
                          darkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-100'
                        }`}>
                          <Wallet className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                            {t('promotionPackagesPage.needMore', 'تحتاج {{amount}} ج.م إضافية في محفظتك', { amount: (pkg.price - walletBalance).toLocaleString() })}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* ═══════════ COMPARISON TABLE (NEW) ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`mt-8 rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
      >
        <button
          onClick={() => setShowComparison(!showComparison)}
          className={`w-full flex items-center gap-3 p-5 transition-colors ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
            <BarChart3 className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          </div>
          <div className="flex-1 text-start">
            <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('promotionPackagesPage.comparisonTitle', 'مقارنة الباقات الثلاث')}
            </h3>
            <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('promotionPackagesPage.comparisonSubtitle', 'قارن المميزات جنباً إلى جنب لاختيار الأنسب')}
            </p>
          </div>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} ${showComparison ? 'rotate-180' : ''}`}>
            <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
          </div>
        </button>

        <AnimatePresence>
          {showComparison && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className={`px-5 pb-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                {/* Tier headers */}
                <div className="grid grid-cols-4 gap-2 mt-4 mb-3">
                  <div className="text-start">
                    <p className={`text-[10px] font-black uppercase tracking-wide ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {t('promotionPackagesPage.feature', 'الميزة')}
                    </p>
                  </div>
                  {comparisonTiers.map(tier => (
                    <div key={tier.id} className="text-center relative">
                      {tier.isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-gradient-to-l from-purple-500 to-pink-500 text-[8px] font-black text-white whitespace-nowrap">
                          {t('promotionPackagesPage.mostPopular', 'الأكثر طلباً')}
                        </div>
                      )}
                      <div className={`mx-auto w-8 h-8 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center text-sm shadow-md mb-1`}>
                        {tier.icon}
                      </div>
                      <p className={`text-[11px] font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{tier.name}</p>
                      <p className={`text-[10px] font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>{tier.price} {t('common.egp', 'ج.م')}</p>
                    </div>
                  ))}
                </div>
                {/* Rows */}
                <div className="space-y-1">
                  {comparisonRows.map((row, idx) => (
                    <div
                      key={row.key}
                      className={`grid grid-cols-4 gap-2 py-2 px-2 rounded-lg ${idx % 2 === 0 ? (darkMode ? 'bg-gray-700/30' : 'bg-gray-50') : ''}`}
                    >
                      <div className="text-start">
                        <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{row.label}</span>
                      </div>
                      {comparisonTiers.map(tier => {
                        const value = (tier.features as any)[row.key];
                        return (
                          <div key={tier.id} className="flex items-center justify-center">
                            {row.type === 'check' ? (
                              value ? (
                                <Check className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                              ) : (
                                <Minus className={`w-4 h-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                              )
                            ) : row.type === 'number' ? (
                              <span className={`text-[11px] font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {row.key === 'estimatedReach' ? Number(value).toLocaleString() : value}
                              </span>
                            ) : (
                              <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {/* CTA row */}
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <div></div>
                  {comparisonTiers.map(tier => {
                    const canAfford = walletBalance >= tier.price;
                    return (
                      <button
                        key={tier.id}
                        onClick={() => {
                          if (activeTab === 'posts') navigate('/');
                          else navigate('/market');
                        }}
                        className={`py-2 rounded-xl text-[10px] font-black transition-all active:scale-95 ${
                          canAfford
                            ? `bg-gradient-to-l ${tier.color} text-white shadow-md`
                            : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {canAfford
                          ? t('promotionPackagesPage.choose', 'اختر')
                          : t('promotionPackagesPage.chargeFirst', 'اشحن أولاً')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══════════ ACTIVE PROMOTIONS (NEW) ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className={`mt-6 rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
      >
        <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
              <Activity className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('promotionPackagesPage.activePromotions', 'الترويجات النشطة')}
            </h3>
            {activePromotions.length > 0 && (
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
                {activePromotions.length}
              </span>
            )}
            <button
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              className={`ms-auto text-[10px] font-bold px-3 py-1 rounded-lg transition-colors ${
                showActiveOnly
                  ? 'bg-orange-600 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {showActiveOnly ? t('promotionPackagesPage.showAll', 'عرض الكل') : t('promotionPackagesPage.activeOnly', 'النشطة فقط')}
            </button>
          </div>
          <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('promotionPackagesPage.activePromotionsDesc', 'إعلاناتك المروجة حالياً مع إحصائيات مباشرة')}
          </p>
        </div>
        {loadingPromotions ? (
          <div className="p-5 space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-16 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} />
            ))}
          </div>
        ) : activePromotions.length > 0 ? (
          <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
            {activePromotions.slice(0, showActiveOnly ? undefined : 3).map((p, idx) => {
              const status = getPromoStatusInfo(p);
              const daysLeft = computeDaysRemaining(p);
              const reach = p.reach_count || p.impressions || 0;
              const estReach = p.estimated_reach || p.estimatedReach || 1000;
              const clicks = p.clicks || 0;
              const progress = estReach > 0 ? Math.min(100, Math.round((reach / estReach) * 100)) : 0;
              return (
                <motion.div
                  key={p.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {p.post_title || p.title || p.content_preview || t('promotionPackagesPage.untitledPost', 'منشور')}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${status.bg} ${status.textColor}`}>
                          {status.label}
                        </span>
                        <span className={`text-[9px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {p.package_name || p.tier || t('promotionPackagesPage.tierStandard', 'قياسي')}
                        </span>
                        {daysLeft !== null && (
                          <span className={`text-[9px] font-bold flex items-center gap-0.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                            <Clock className="w-2.5 h-2.5" />
                            {daysLeft > 0
                              ? t('promotionPackagesPage.daysLeft', '{{count}} يوم متبقي', { count: daysLeft })
                              : t('promotionPackagesPage.expiredSoon', 'منتهي')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Live stats */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className={`rounded-lg p-2 text-center ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <Eye className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      <p className={`text-[11px] font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{Number(reach).toLocaleString()}</p>
                      <p className={`text-[8px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('promotionPackagesPage.reach', 'وصول')}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <TrendingUp className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                      <p className={`text-[11px] font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{clicks}</p>
                      <p className={`text-[8px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('promotionPackagesPage.clicks', 'نقرات')}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <BarChart3 className={`w-3 h-3 mx-auto mb-0.5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <p className={`text-[11px] font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{progress}%</p>
                      <p className={`text-[8px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('promotionPackagesPage.progress', 'التقدم')}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full bg-gradient-to-l from-orange-500 to-amber-400 rounded-full"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Rocket className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('promotionPackagesPage.noActivePromotions', 'لا توجد ترويجات نشطة بعد')}
            </p>
            <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('promotionPackagesPage.noActivePromotionsDesc', 'اختر باقة وابدأ الترويج لمنشورك')}
            </p>
          </div>
        )}
      </motion.div>

      {/* ═══════════ PROMOTION HISTORY (NEW) ═══════════ */}
      {!showActiveOnly && pastPromotions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`mt-6 rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
        >
          <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Clock className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
              </div>
              <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('promotionPackagesPage.promotionHistory', 'سجل الترويجات')}
              </h3>
              <span className={`ms-auto text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {pastPromotions.length}
              </span>
            </div>
          </div>
          <div className={`divide-y max-h-72 overflow-y-auto ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
            {pastPromotions.slice(0, 20).map((p, idx) => {
              const status = getPromoStatusInfo(p);
              return (
                <div key={p.id || idx} className="p-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${status.bg}`}>
                    <Megaphone className={`w-3.5 h-3.5 ${status.textColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {p.post_title || p.title || p.content_preview || t('promotionPackagesPage.untitledPost', 'منشور')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[9px] font-bold ${status.textColor}`}>
                        {status.label}
                      </span>
                      <span className={`text-[9px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>
                  </div>
                  {p.price && (
                    <span className={`text-[10px] font-black ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {Number(p.price).toLocaleString()} {t('common.egp', 'ج.م')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Bottom Actions */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8 space-y-3"
      >
        {/* CTA: Go to promote */}
        <button
          onClick={() => {
            if (activeTab === 'posts') {
              navigate('/');
            } else {
              navigate('/market');
            }
          }}
          className="w-full bg-gradient-to-l from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white py-3.5 rounded-2xl font-black text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-orange-200"
        >
          <Zap className="w-5 h-5" />
          {activeTab === 'posts'
            ? t('promotionPackagesPage.goPromotePost', 'روّج منشورك الآن')
            : t('promotionPackagesPage.goPromoteMarket', 'روّج إعلانك في السوق')
          }
        </button>

        {/* CTA: My promotions */}
        <button
          onClick={() => navigate('/promotions')}
          className={`w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
            darkMode
              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          {t('promotionPackagesPage.myPromotions', 'إعلاناتي المروجة')}
        </button>

        {/* CTA: Charge wallet */}
        {walletBalance < 50 && (
          <button
            onClick={() => navigate('/wallet')}
            className={`w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              darkMode
                ? 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 border border-orange-800/30'
                : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100'
            }`}
          >
            <Wallet className="w-4 h-4" />
            {t('promotionPackagesPage.chargeWalletFirst', 'اشحن محفظتك أولاً')}
          </button>
        )}
      </motion.div>

      {/* FAQ Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className={`mt-8 rounded-2xl p-5 border ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
        }`}
      >
        <div className="flex items-center gap-2 mb-4">
          <Crown className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
          <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('promotionPackagesPage.faqTitle', 'أسئلة شائعة')}
          </h3>
        </div>
        <div className="space-y-3">
          {[
            {
              q: t('promotionPackagesPage.faq1Q', 'كيف أروّج إعلاني؟'),
              a: t('promotionPackagesPage.faq1A', 'اذهب لإعلانك واضغط على زر "ترويج" ثم اختر الباقة المناسبة وادفع من محفظتك. سيتم مراجعة طلبك من الإدارة خلال دقائق.'),
            },
            {
              q: t('promotionPackagesPage.faq2Q', 'متى يبدأ الترويج؟'),
              a: t('promotionPackagesPage.faq2A', 'بعد الموافقة من الإدارة، يبدأ الترويج فوراً ويستمر طوال مدة الباقة المختارة. ستصل إشعارات للمستخدمين المهتمين بتصنيف إعلانك.'),
            },
            {
              q: t('promotionPackagesPage.faq3Q', 'هل يمكنني استرداد المبلغ؟'),
              a: t('promotionPackagesPage.faq3A', 'في حالة رفض طلب الترويج من الإدارة، يتم استرداد المبلغ كاملاً إلى محفظتك تلقائياً.'),
            },
            {
              q: t('promotionPackagesPage.faq4Q', 'ما الفرق بين الباقات؟'),
              a: t('promotionPackagesPage.faq4A', 'كل باقة توفر عدداً مختلفاً من الوصول والإشعارات والمدة. كلما زادت الباقة، زاد وصول إعلانك لعدد أكبر من المهتمين.'),
            },
          ].map((faq, idx) => (
            <div key={idx}>
              <p className={`text-xs font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {faq.q}
              </p>
              <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// CreditCard icon for the steps section
function CreditCard({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
