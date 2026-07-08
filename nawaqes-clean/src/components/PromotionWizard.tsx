// ─── Promotion Wizard Component ──────────────────────────────────────
// Multi-step promotion wizard with city multi-targeting support
// Steps: 1) Choose package → 1b) Select cities (if city_target) → 2) Review & edit post → 3) Confirm payment → 4) Done

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { promotionPackages, getCityTier, cityTiers } from '../data/promotionPackages';
import { egyptianCities, regionLabels, regionOrder, formatSelectedCities, getCityNameAr, searchCities, getGovernorateCount } from '../data/egyptianCities';
import type { EgyptianCity } from '../data/egyptianCities';
import { Post } from '../types';
import { api } from '../services/api';
import {
  X, ChevronLeft, ChevronRight, Sparkles, CheckCircle2, Wallet,
  Clock, Eye, Megaphone, Image, MapPin, ShoppingBag, AlertCircle,
  Zap, Crown, Target, Globe, Send, Pencil, Search, Map, Plus, Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';

interface PromotionWizardProps {
  post: Post;
  onClose: () => void;
  onPromotionCreated?: () => void;
}

type Step = 'package' | 'targeting' | 'cityTarget' | 'review' | 'payment' | 'done';

export const PromotionWizard: React.FC<PromotionWizardProps> = ({ post, onClose, onPromotionCreated }) => {
  const { t } = useTranslation();
  const { darkMode } = useAppContext();
  const { currentUser, refreshCurrentUser } = useAuth();
  const [step, setStep] = useState<Step>('package');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(65);
  const [enableAgeTargeting, setEnableAgeTargeting] = useState(false);
  const [enableCityTargeting, setEnableCityTargeting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [editedLocation, setEditedLocation] = useState(post.location || '');

  // Theme
  const bg = darkMode ? 'bg-gray-900' : 'bg-white';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900';

  const walletBalance = currentUser?.walletBalance || 0;
  const pkg = promotionPackages.find(p => p.id === selectedPackage);

  // City targeting tier (computed from selected cities count)
  const cityTier = useMemo(() => {
    if (selectedPackage !== 'city_target' || selectedCities.length === 0) return null;
    return getCityTier(selectedCities.length);
  }, [selectedPackage, selectedCities.length]);

  // Effective price/reach (for city_target, use tier; otherwise use package)
  const effectivePrice = useMemo(() => {
    if (selectedPackage === 'city_target' && cityTier) return cityTier.price || 0;
    return pkg?.price || 0;
  }, [selectedPackage, cityTier, pkg]);

  const effectiveReach = useMemo(() => {
    if (selectedPackage === 'city_target' && cityTier) return cityTier.estimatedReach || 0;
    return pkg?.estimatedReach || 0;
  }, [selectedPackage, cityTier, pkg]);

  const effectiveNotifications = useMemo(() => {
    if (selectedPackage === 'city_target' && cityTier) return cityTier.maxNotifications || 0;
    return pkg?.maxNotifications || 0;
  }, [selectedPackage, cityTier, pkg]);

  const canAfford = useMemo(() => {
    return walletBalance >= effectivePrice;
  }, [walletBalance, effectivePrice]);

  // Whether city targeting step should appear in the flow
  const showCityStep = selectedPackage === 'city_target' || enableCityTargeting;

  const steps: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: 'package', label: t('promotion.steps.choosePackage'), icon: <Sparkles className="w-4 h-4" /> },
    { id: 'targeting', label: t('promotion.steps.targeting'), icon: <Target className="w-4 h-4" /> },
    ...(showCityStep ? [{ id: 'cityTarget' as Step, label: t('promotion.steps.chooseCities'), icon: <MapPin className="w-4 h-4" /> }] : []),
    { id: 'review', label: t('promotion.steps.reviewPost'), icon: <Eye className="w-4 h-4" /> },
    { id: 'payment', label: t('promotion.steps.confirmPayment'), icon: <Wallet className="w-4 h-4" /> },
    { id: 'done', label: t('promotion.steps.promoted'), icon: <CheckCircle2 className="w-4 h-4" /> },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  const handleNext = () => {
    if (step === 'package') {
      setStep('targeting');
    } else if (step === 'targeting') {
      if (showCityStep) {
        setStep('cityTarget');
      } else {
        setStep('review');
      }
    } else if (step === 'cityTarget') {
      if (selectedCities.length === 0) {
        toast.error(t('promotion.errors.selectAtLeastOneCity'));
        return;
      }
      setStep('review');
    } else if (step === 'review') {
      setStep('payment');
    }
  };

  const handleBack = () => {
    if (step === 'targeting') setStep('package');
    else if (step === 'cityTarget') setStep('targeting');
    else if (step === 'review') {
      if (showCityStep) setStep('cityTarget');
      else setStep('targeting');
    } else if (step === 'payment') setStep('review');
  };

  const toggleCity = (cityId: string) => {
    setSelectedCities(prev => {
      if (prev.includes(cityId)) {
        return prev.filter(c => c !== cityId);
      }
      if (prev.length >= egyptianCities.length) return prev; // max all cities
      return [...prev, cityId];
    });
  };

  const handleConfirmPayment = async () => {
    if (!pkg || !selectedPackage) return;
    setIsProcessing(true);

    try {
      // If user edited the post, update it first
      if (editMode && (editedContent !== post.content || editedLocation !== post.location)) {
        try {
          await api.updatePost(post.id, {
            content: editedContent,
            location: editedLocation || undefined,
          });
        } catch {
          // Continue with promotion even if edit fails
        }
      }

      const promotionData: Record<string, any> = {
        postId: post.id,
        tier: selectedPackage,
        price: effectivePrice,
        packageName: selectedPackage === 'city_target' && cityTier
          ? `${pkg.name} - ${cityTier.label}`
          : pkg.name,
        duration: pkg.duration,
        estimatedReach: effectiveReach,
        maxNotifications: effectiveNotifications,
        includeMessages: pkg.includeMessages || false,
        targeting: pkg.targeting || 'all',
      };

      // Add city targeting data (for city_target package OR any package with city targeting enabled)
      if (selectedCities.length > 0) {
        promotionData.targetCities = selectedCities;
        promotionData.targetCity = selectedCities[0]; // backward compat
        promotionData.cityCount = selectedCities.length;
        promotionData.cityTierLabel = cityTier?.label || '';
        // For non-city_target packages with city targeting, set targeting to include city
        if (selectedPackage !== 'city_target') {
          promotionData.targeting = 'city';
        }
      }

      // Add age targeting data
      if (enableAgeTargeting) {
        promotionData.targetAgeMin = targetAgeMin;
        promotionData.targetAgeMax = targetAgeMax;
      }

      await api.requestPromotion(promotionData);

      // Refresh user data to update wallet balance
      if (refreshCurrentUser) await refreshCurrentUser();

      setStep('done');
      toast.success(t('promotion.success.promotionSent'));
      if (onPromotionCreated) onPromotionCreated();
    } catch (err: any) {
      toast.error(err.message || t('promotion.errors.promotionFailed'));
    } finally {
      setIsProcessing(false);
    }
  };

  const getPackageIcon = (id: string) => {
    switch (id) {
      case 'basic': return <Zap className="w-5 h-5" />;
      case 'standard': return <Sparkles className="w-5 h-5" />;
      case 'premium': return <Crown className="w-5 h-5" />;
      case 'vip': return <Megaphone className="w-5 h-5" />;
      case 'city_target': return <MapPin className="w-5 h-5" />;
      case 'interest_target': return <Target className="w-5 h-5" />;
      default: return <Sparkles className="w-5 h-5" />;
    }
  };

  // Filter cities by search
  const filteredCities = useMemo(() => {
    return searchCities(citySearch);
  }, [citySearch]);

  // Group filtered cities by region (ordered)
  const groupedCities = useMemo(() => {
    const groups: [string, EgyptianCity[]][] = [];
    for (const regionKey of regionOrder) {
      const regionCities = filteredCities.filter(c => c.region === regionKey);
      if (regionCities.length > 0) {
        groups.push([regionKey, regionCities]);
      }
    }
    return groups;
  }, [filteredCities]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl ${cardBg}`}
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b backdrop-blur-lg rounded-t-3xl"
          style={{ backgroundColor: darkMode ? 'rgba(31,41,55,0.95)' : 'rgba(255,255,255,0.95)' }}
        >
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-orange-500" />
            <h2 className={`font-black text-base ${textPrimary}`}>{t('promotion.title')}</h2>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-5 py-3 flex items-center justify-center gap-1 overflow-x-auto">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold transition-all whitespace-nowrap ${
                i <= currentStepIndex
                  ? 'bg-orange-500 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'
              }`}>
                {s.icon}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`w-4 h-0.5 rounded-full flex-shrink-0 ${i < currentStepIndex ? 'bg-orange-500' : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        <div className="px-5 pb-5">
          <AnimatePresence mode="wait">
            {/* ── Step 1: Choose Package ── */}
            {step === 'package' && (
              <motion.div
                key="package"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-3"
              >
                <p className={`text-sm font-bold mb-3 ${textSecondary}`}>
                  {t('promotion.choosePackageSubtitle')}
                </p>
                {promotionPackages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPackage(p.id);
                      if (p.id !== 'city_target') {
                        // Keep cities if city targeting was manually enabled, otherwise clear
                        if (!enableCityTargeting) {
                          setSelectedCities([]);
                        }
                      }
                    }}
                    className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${
                      selectedPackage === p.id
                        ? 'border-orange-500 shadow-lg shadow-orange-200/20'
                        : darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-100 hover:border-gray-200'
                    } ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-l ${p.color} text-white flex-shrink-0`}>
                        {getPackageIcon(p.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-black text-sm ${textPrimary}`}>{p.icon} {p.name}</span>
                          <span className={`font-black text-sm ${textPrimary}`}>
                            {p.id === 'city_target' ? t('promotion.fromPrice', { price: 120 }) : t('promotion.currency', { amount: p.price })}
                          </span>
                        </div>
                        <div className={`flex items-center gap-3 text-[10px] ${textMuted} mb-2`}>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t('promotion.daysCount', { count: p.duration })}</span>
                          {p.id === 'city_target' ? (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{t('promotion.basedOnCityCount')}</span>
                          ) : (
                            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{t('promotion.reachCount', { count: p.estimatedReach.toLocaleString() })}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.features.slice(0, 2).map((f, i) => (
                            <span key={i} className={`text-[9px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'}`}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {selectedPackage === p.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mt-3 pt-3 border-t border-orange-200/30"
                      >
                        {/* Show city tier pricing for city_target */}
                        {p.id === 'city_target' && (
                          <div className="mb-3">
                            <p className={`text-[10px] font-bold mb-2 ${textMuted}`}>{t('promotion.pricesByCityCount')}</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {cityTiers.map((tier, i) => (
                                <div key={i} className={`text-[9px] px-2 py-1.5 rounded-lg ${darkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-orange-50 text-gray-700'}`}>
                                  <span className="font-bold">{tier.label || tier.nameAr}:</span> {t('promotion.currencyPerReach', { price: tier.price || 0, reach: (tier.estimatedReach || 0).toLocaleString() })}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {p.features.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 text-[10px] font-bold text-orange-600">
                              <CheckCircle2 className="w-3 h-3" />{f}
                            </span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </button>
                ))}

                {/* Wallet Balance Notice */}
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-center gap-2">
                    <Wallet className={`w-4 h-4 ${walletBalance > 0 ? 'text-green-500' : 'text-red-500'}`} />
                    <span className={`text-xs font-bold ${textSecondary}`}>
                      {t('promotion.walletBalanceLabel')} <span className={walletBalance > 0 ? 'text-green-600' : 'text-red-600'}>{t('promotion.currency', { amount: walletBalance.toLocaleString() })}</span>
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step: Targeting (Age + City hint) ── */}
            {step === 'targeting' && (
              <motion.div
                key="targeting"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-4"
              >
                <div className="text-center mb-2">
                  <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
                    <Target className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('promotion.targetingOptions')}</h3>
                  <p className={`text-xs ${textMuted} mt-1`}>{t('promotion.targetingSubtitle')}</p>
                </div>

                {/* Age Targeting */}
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
                        <span className="text-sm">🎂</span>
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${textPrimary}`}>{t('promotion.ageTargeting')}</p>
                        <p className={`text-[10px] ${textMuted}`}>{t('promotion.ageTargetingDesc')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEnableAgeTargeting(!enableAgeTargeting)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${enableAgeTargeting ? 'bg-orange-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enableAgeTargeting ? 'left-0.5' : 'left-6'}`} />
                    </button>
                  </div>

                  {enableAgeTargeting && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="space-y-3 mt-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className={`text-[10px] font-bold block mb-1 ${textMuted}`}>{t('promotion.ageFrom')}</label>
                          <input
                            type="number"
                            min={13}
                            max={100}
                            value={targetAgeMin}
                            onChange={e => setTargetAgeMin(Math.max(13, Math.min(targetAgeMax, parseInt(e.target.value) || 13)))}
                            className={`w-full px-3 py-2 rounded-lg border text-sm font-bold text-center outline-none ${inputBg}`}
                          />
                        </div>
                        <span className={`mt-5 ${textMuted}`}>—</span>
                        <div className="flex-1">
                          <label className={`text-[10px] font-bold block mb-1 ${textMuted}`}>{t('promotion.ageTo')}</label>
                          <input
                            type="number"
                            min={13}
                            max={100}
                            value={targetAgeMax}
                            onChange={e => setTargetAgeMax(Math.max(targetAgeMin, Math.min(100, parseInt(e.target.value) || 65)))}
                            className={`w-full px-3 py-2 rounded-lg border text-sm font-bold text-center outline-none ${inputBg}`}
                          />
                        </div>
                      </div>

                      {/* Quick age presets */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: t('promotion.agePresets.youth'), min: 18, max: 25 },
                          { label: t('promotion.agePresets.adults'), min: 25, max: 40 },
                          { label: t('promotion.agePresets.middle'), min: 30, max: 50 },
                          { label: t('promotion.agePresets.all'), min: 18, max: 65 },
                        ].map(preset => (
                          <button
                            key={preset.label}
                            onClick={() => { setTargetAgeMin(preset.min); setTargetAgeMax(preset.max); }}
                            className={`text-[10px] px-2.5 py-1.5 rounded-lg font-bold transition-colors ${
                              targetAgeMin === preset.min && targetAgeMax === preset.max
                                ? 'bg-orange-500 text-white'
                                : darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <p className={`text-[10px] ${textMuted}`}>
                        {t('promotion.ageRangeNotice', { min: targetAgeMin, max: targetAgeMax })}
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* City targeting - available for ALL packages */}
                <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-100'}`}>
                        <MapPin className="w-4 h-4 text-teal-600" />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${textPrimary}`}>{t('promotion.cityTargeting')}</p>
                        <p className={`text-[10px] ${textMuted}`}>
                          {selectedPackage === 'city_target' ? t('promotion.cityTargetingRequired') : t('promotion.cityTargetingOptional')}
                        </p>
                      </div>
                    </div>
                    {selectedPackage !== 'city_target' ? (
                      <button
                        onClick={() => {
                          setEnableCityTargeting(!enableCityTargeting);
                          if (enableCityTargeting) setSelectedCities([]);
                        }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${enableCityTargeting ? 'bg-orange-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enableCityTargeting ? 'left-0.5' : 'left-6'}`} />
                      </button>
                    ) : (
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${darkMode ? 'bg-teal-900/30 text-teal-300' : 'bg-teal-100 text-teal-700'}`}>{t('promotion.required')}</span>
                    )}
                  </div>

                  {enableCityTargeting && selectedPackage !== 'city_target' && (
                    <p className={`text-[10px] ${textMuted}`}>
                      {t('promotion.citiesNextStep')}
                    </p>
                  )}
                  {selectedPackage === 'city_target' && (
                    <p className={`text-[10px] ${textMuted}`}>
                      {t('promotion.citiesNextStepPriced')}
                    </p>
                  )}
                </div>

                {/* Summary */}
                <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
                  <p className={`text-[10px] font-bold mb-1 ${textMuted}`}>{t('promotion.targetingSummary')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${darkMode ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>
                      {pkg?.targeting === 'interests' ? t('promotion.interestTargeting') : t('promotion.generalTargeting')}
                    </span>
                    {enableAgeTargeting && (
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${darkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                        {t('promotion.ageRange', { min: targetAgeMin, max: targetAgeMax })}
                      </span>
                    )}
                    {(enableCityTargeting || selectedPackage === 'city_target') && (
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${darkMode ? 'bg-teal-900/30 text-teal-300' : 'bg-teal-100 text-teal-700'}`}>
                        {t('promotion.cityTargetingLabel')}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 1b: City Targeting Selection ── */}
            {step === 'cityTarget' && (
              <motion.div
                key="cityTarget"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-sm font-bold ${textSecondary}`}>{t('promotion.selectTargetCities')}</p>
                  <span className={`text-xs font-bold ${selectedCities.length > 0 ? 'text-orange-600' : textMuted}`}>
                    {selectedCities.length > 0 ? t('promotion.citiesSelected', { count: selectedCities.length }) : t('promotion.noCitiesSelected')}
                  </span>
                </div>

                {/* Current tier info */}
                {selectedCities.length > 0 && cityTier && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-xl border ${darkMode ? 'bg-teal-900/20 border-teal-700/50' : 'bg-teal-50 border-teal-100'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`font-bold text-sm ${darkMode ? 'text-teal-300' : 'text-teal-700'}`}>{cityTier.label}</span>
                        <span className={`text-xs ${textMuted}`}> — {formatSelectedCities(selectedCities)}</span>
                      </div>
                      <div className="text-left">
                        <p className={`font-black text-sm ${darkMode ? 'text-teal-300' : 'text-teal-700'}`}>{t('promotion.currency', { amount: cityTier.price || 0 })}</p>
                        <p className={`text-[10px] ${textMuted}`}>{t('promotion.reachCount', { count: (cityTier.estimatedReach || 0).toLocaleString() })}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Quick select buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedCities(egyptianCities.map(c => c.id))}
                    className={`flex-1 text-xs py-2 px-3 rounded-xl font-bold transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  >
                    {t('promotion.selectAll')}
                  </button>
                  <button
                    onClick={() => setSelectedCities([])}
                    className={`flex-1 text-xs py-2 px-3 rounded-xl font-bold transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                  >
                    {t('promotion.clearAll')}
                  </button>
                  {/* Quick select popular */}
                  <button
                    onClick={() => setSelectedCities(['cairo', 'giza', 'alex'])}
                    className={`flex-1 text-xs py-2 px-3 rounded-xl font-bold transition-colors ${darkMode ? 'bg-orange-900/30 hover:bg-orange-900/50 text-orange-300' : 'bg-orange-100 hover:bg-orange-200 text-orange-700'}`}
                  >
                    {t('promotion.mostPopular')}
                  </button>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
                  <input
                    type="text"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder={t('promotion.searchCity')}
                    className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${inputBg}`}
                  />
                </div>

                {/* City grid grouped by region */}
                <div className="max-h-[320px] overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {groupedCities.map(([region, cities]) => (
                    <div key={region}>
                      <p className={`text-[10px] font-black mb-1.5 ${textMuted} uppercase`}>
                        {regionLabels[region]?.ar || region}
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {cities.map(city => {
                          const isSelected = selectedCities.includes(city.id);
                          return (
                            <button
                              key={city.id}
                              onClick={() => toggleCity(city.id)}
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
                              <MapPin className={`w-3 h-3 flex-shrink-0 ${isSelected ? 'text-orange-500' : textMuted}`} />
                              <span className="truncate">{city.nameAr}</span>
                              {isSelected && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 mr-auto flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Selected cities tags */}
                {selectedCities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCities.map(cityId => (
                      <span
                        key={cityId}
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                          darkMode ? 'bg-orange-600/20 text-orange-300 hover:bg-orange-600/30' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        }`}
                        onClick={() => toggleCity(cityId)}
                      >
                        {getCityNameAr(cityId)}
                        <X className="w-2.5 h-2.5" />
                      </span>
                    ))}
                  </div>
                )}

                {selectedCities.length === 0 && (
                  <div className={`p-3 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800/50' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-xs font-bold text-red-600`}>{t('promotion.errors.selectCityToContinue')}</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Step 2: Review & Edit Post ── */}
            {step === 'review' && pkg && (
              <motion.div
                key="review"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-4"
              >
                {/* Package Summary */}
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-orange-50 border-orange-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-l ${pkg.color} text-white`}>
                      {getPackageIcon(pkg.id)}
                    </div>
                    <div>
                      <span className={`font-black text-sm ${textPrimary}`}>
                        {pkg.icon} {selectedPackage === 'city_target' && cityTier ? `${pkg.name} - ${cityTier.label}` : pkg.name}
                      </span>
                      <span className={`text-xs ${textMuted}`}> — {t('promotion.pricePerDuration', { price: effectivePrice, days: pkg.duration })}</span>
                    </div>
                  </div>
                  {/* Show selected cities for city_target */}
                  {selectedCities.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <MapPin className="w-3 h-3 text-teal-500" />
                      {selectedCities.slice(0, 5).map(id => (
                        <span key={id} className={`text-[10px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-teal-900/30 text-teal-300' : 'bg-teal-100 text-teal-700'}`}>
                          {getCityNameAr(id)}
                        </span>
                      ))}
                      {selectedCities.length > 5 && (
                        <span className={`text-[10px] ${textMuted}`}>+{selectedCities.length - 5} {t('promotion.more')}</span>
                      )}
                    </div>
                  )}
                  {/* Show age targeting */}
                  {enableAgeTargeting && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <span className="text-sm">🎂</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${darkMode ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                        {t('promotion.ageRangeYears', { min: targetAgeMin, max: targetAgeMax })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Post Preview */}
                <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-white border-gray-100'}`}>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={currentUser?.avatarBase64 || currentUser?.avatar || ''}
                          alt=""
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <div>
                          <span className={`font-bold text-xs ${textPrimary}`}>{currentUser?.name}</span>
                          <div className={`flex items-center gap-1 text-[9px] ${textMuted}`}>
                            <Globe className="w-2.5 h-2.5" />
                            <span>{t('promotion.yourPost')}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditMode(!editMode)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                          editMode
                            ? 'bg-orange-500 text-white'
                            : darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Pencil className="w-3 h-3" />
                        {editMode ? t('promotion.finishEdit') : t('promotion.editPost')}
                      </button>
                    </div>

                    {editMode ? (
                      <div className="space-y-2">
                        <textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className={`w-full resize-none border rounded-xl px-3 py-2 text-sm outline-none transition-colors min-h-[80px] ${inputBg}`}
                          rows={3}
                        />
                        <div className="flex items-center gap-2">
                          <MapPin className={`w-4 h-4 flex-shrink-0 ${textMuted}`} />
                          <input
                            type="text"
                            value={editedLocation}
                            onChange={(e) => setEditedLocation(e.target.value)}
                            placeholder={t('promotion.addLocation')}
                            className={`flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none transition-colors ${inputBg}`}
                          />
                        </div>
                        <p className={`text-[10px] ${textMuted}`}>
                          {t('promotion.editNotice')}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className={`text-sm leading-relaxed ${textSecondary}`}>{editedContent}</p>
                        {editedLocation && (
                          <div className="flex items-center gap-1 mt-2">
                            <MapPin className="w-3 h-3 text-orange-500" />
                            <span className={`text-[10px] ${textMuted}`}>{editedLocation}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {post.image && (() => {
                      let imgs: string[] = [];
                      try { const p = JSON.parse(post.image); imgs = Array.isArray(p) ? p : [post.image]; } catch { imgs = [post.image]; }
                      if (imgs.length === 0) return null;
                      return (
                        <div className="mt-3 grid grid-cols-2 gap-1">
                          {imgs.slice(0, 4).map((img, idx) => (
                            <img key={idx} src={img} alt="" className="w-full max-h-[150px] object-cover rounded-xl" loading="lazy" />
                          ))}
                        </div>
                      );
                    })()}

                    {post.type === 'ad' && post.price && (
                      <div className={`mt-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-gray-600/50' : 'bg-gray-50'}`}>
                        <span className={`font-black text-sm ${textPrimary}`}>{post.price?.toLocaleString()} {post.currency}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reach Estimate */}
                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-green-50 border-green-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-4 h-4 text-green-600" />
                    <span className={`text-sm font-black ${textPrimary}`}>{t('promotion.estimatedReach')}</span>
                  </div>
                  <p className={`text-2xl font-black text-green-600`}>{effectiveReach.toLocaleString()}</p>
                  <p className={`text-[10px] ${textMuted}`}>
                    {t('promotion.reachDescription', { days: pkg.duration })}
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Confirm Payment ── */}
            {step === 'payment' && pkg && (
              <motion.div
                key="payment"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="space-y-4"
              >
                {/* Payment Summary */}
                <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-white border-gray-100'}`}>
                  <div className="p-4 space-y-3">
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('promotion.paymentSummary')}</h3>

                    <div className={`flex justify-between text-sm ${textSecondary}`}>
                      <span>{t('promotion.promotionPackage')}</span>
                      <span className="font-bold">{pkg.icon} {selectedPackage === 'city_target' && cityTier ? `${pkg.name} - ${cityTier.label}` : pkg.name}</span>
                    </div>

                    {selectedCities.length > 0 && (
                      <div className={`flex justify-between text-sm ${textSecondary}`}>
                        <span>{t('promotion.targetCities')}</span>
                        <span className="font-bold">{t('promotion.cityCount', { count: selectedCities.length })}</span>
                      </div>
                    )}

                    {enableAgeTargeting && (
                      <div className={`flex justify-between text-sm ${textSecondary}`}>
                        <span>{t('promotion.ageGroup')}</span>
                        <span className="font-bold">{t('promotion.ageRangeYears', { min: targetAgeMin, max: targetAgeMax })}</span>
                      </div>
                    )}

                    <div className={`flex justify-between text-sm ${textSecondary}`}>
                      <span>{t('promotion.duration')}</span>
                      <span className="font-bold">{t('promotion.daysCount', { count: pkg.duration })}</span>
                    </div>
                    <div className={`flex justify-between text-sm ${textSecondary}`}>
                      <span>{t('promotion.estimatedReach')}</span>
                      <span className="font-bold">{t('promotion.userCount', { count: effectiveReach.toLocaleString() })}</span>
                    </div>
                    <div className={`flex justify-between text-sm ${textSecondary}`}>
                      <span>{t('promotion.notifications')}</span>
                      <span className="font-bold">{t('promotion.notificationCount', { count: effectiveNotifications })}</span>
                    </div>

                    <div className={`border-t pt-3 ${darkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                      <div className={`flex justify-between text-sm ${textSecondary}`}>
                        <span>{t('promotion.amount')}</span>
                        <span className="font-bold">{t('promotion.currency', { amount: effectivePrice })}</span>
                      </div>
                    </div>

                    <div className={`border-t pt-3 ${darkMode ? 'border-gray-600' : 'border-gray-100'}`}>
                      <div className="flex justify-between">
                        <span className={`font-black text-sm ${textPrimary}`}>{t('promotion.walletBalance')}</span>
                        <span className={`font-black text-sm ${canAfford ? 'text-green-600' : 'text-red-600'}`}>
                          {t('promotion.currency', { amount: walletBalance.toLocaleString() })}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={`font-black text-sm ${textPrimary}`}>{t('promotion.remainingAfterPayment')}</span>
                        <span className={`font-black text-sm ${canAfford ? 'text-green-600' : 'text-red-600'}`}>
                          {t('promotion.currency', { amount: (walletBalance - effectivePrice).toLocaleString() })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {!canAfford && (
                  <div className={`p-4 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800/50' : 'bg-red-50 border-red-100'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="font-bold text-sm text-red-600">{t('promotion.insufficientBalance')}</span>
                    </div>
                    <p className={`text-xs ${textMuted}`}>
                      {t('promotion.needToCharge', { amount: (effectivePrice - walletBalance).toLocaleString() })}
                    </p>
                    <button
                      onClick={() => { onClose(); window.location.hash = '#/wallet'; }}
                      className="mt-2 bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      {t('promotion.goToWallet')}
                    </button>
                  </div>
                )}

                {canAfford && (
                  <div className={`p-4 rounded-xl border ${darkMode ? 'bg-green-900/20 border-green-800/50' : 'bg-green-50 border-green-100'}`}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="font-bold text-sm text-green-600">{t('promotion.sufficientBalance')}</span>
                    </div>
                    <p className={`text-xs mt-1 ${textMuted}`}>
                      {t('promotion.willDeduct', { amount: effectivePrice })}
                    </p>
                  </div>
                )}

                {/* Notice */}
                <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
                  <p className={`text-[10px] leading-relaxed ${textMuted}`}>
                    {t('promotion.termsNotice')}
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Done ── */}
            {step === 'done' && pkg && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                  className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center bg-gradient-to-l ${pkg.color} text-white`}
                >
                  <CheckCircle2 className="w-10 h-10" />
                </motion.div>
                <h3 className={`font-black text-lg mb-2 ${textPrimary}`}>{t('promotion.promotionSentTitle')}</h3>
                <p className={`text-sm mb-1 ${textSecondary}`}>
                  {t('promotion.packagePriceInfo', {
                    icon: pkg.icon,
                    name: selectedPackage === 'city_target' && cityTier ? `${pkg.name} - ${cityTier.label}` : pkg.name,
                    price: effectivePrice
                  })}
                </p>
                {selectedPackage === 'city_target' && selectedCities.length > 0 && (
                  <p className={`text-xs mb-1 ${textMuted}`}>
                    {t('promotion.targetCitiesWithValue', { cities: formatSelectedCities(selectedCities) })}
                  </p>
                )}
                <p className={`text-xs mb-4 ${textMuted}`}>
                  {t('promotion.reviewNotice')}
                </p>
                <div className={`p-4 rounded-xl ${darkMode ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <p className={`font-black text-lg ${textPrimary}`}>{effectiveReach.toLocaleString()}</p>
                      <p className={`text-[10px] ${textMuted}`}>{t('promotion.estimatedReachLabel')}</p>
                    </div>
                    <div className={`w-px h-8 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                    <div className="text-center">
                      <p className={`font-black text-lg ${textPrimary}`}>{pkg.duration}</p>
                      <p className={`text-[10px] ${textMuted}`}>{t('promotion.days')}</p>
                    </div>
                    <div className={`w-px h-8 ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
                    <div className="text-center">
                      <p className={`font-black text-lg ${textPrimary}`}>{(walletBalance - effectivePrice).toLocaleString()}</p>
                      <p className={`text-[10px] ${textMuted}`}>{t('promotion.remainingBalance')}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Buttons */}
          {step !== 'done' && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t"
              style={{ borderColor: darkMode ? '#374151' : '#f3f4f6' }}
            >
              {step !== 'package' ? (
                <button
                  onClick={handleBack}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                  {t('promotion.back')}
                </button>
              ) : (
                <div />
              )}

              {step === 'package' && (
                <button
                  onClick={handleNext}
                  disabled={!selectedPackage}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedPackage
                      ? 'bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg hover:from-orange-600 hover:to-orange-700 active:scale-95'
                      : darkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {t('promotion.next')}
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {step === 'targeting' && (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg hover:from-orange-600 hover:to-orange-700 active:scale-95 transition-all"
                >
                  {showCityStep ? t('promotion.selectCities') : t('promotion.reviewPost')}
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {step === 'cityTarget' && (
                <button
                  onClick={handleNext}
                  disabled={selectedCities.length === 0}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedCities.length > 0
                      ? 'bg-gradient-to-l from-teal-500 to-teal-600 text-white shadow-lg hover:from-teal-600 hover:to-teal-700 active:scale-95'
                      : darkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {t('promotion.continueWithCities', { count: selectedCities.length })}
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {step === 'review' && (
                <button
                  onClick={handleNext}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg hover:from-orange-600 hover:to-orange-700 active:scale-95 transition-all"
                >
                  {t('promotion.continueToPayment')}
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {step === 'payment' && (
                <button
                  onClick={handleConfirmPayment}
                  disabled={isProcessing || !canAfford}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    isProcessing || !canAfford
                      ? darkMode ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-l from-green-500 to-green-600 text-white shadow-lg hover:from-green-600 hover:to-green-700 active:scale-95'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('promotion.processing')}
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      {t('promotion.confirmPromotion', { amount: effectivePrice })}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex items-center justify-center mt-5 pt-4 border-t"
              style={{ borderColor: darkMode ? '#374151' : '#f3f4f6' }}
            >
              <button
                onClick={onClose}
                className="px-8 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg hover:from-orange-600 hover:to-orange-700 active:scale-95 transition-all"
              >
                {t('promotion.backToMyPage')}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
