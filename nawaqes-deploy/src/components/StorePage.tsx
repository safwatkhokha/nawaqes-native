import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr } from '../utils/time';
import { useTranslation } from 'react-i18next';
import { Store as StoreIcon, MapPin, Phone, MessageCircle, Star, Megaphone, Zap, Crown, TrendingUp, Plus, Edit, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { Store, StorePromotionRequest } from '../types';

const STORE_CATEGORIES = [
  { id: 'phones', nameKey: 'categories.phones' },
  { id: 'cars', nameKey: 'categories.cars' },
  { id: 'electronics', nameKey: 'categories.electronics' },
  { id: 'realestate', nameKey: 'categories.realestate' },
  { id: 'games', nameKey: 'categories.games' },
  { id: 'fashion', nameKey: 'categories.fashion' },
  { id: 'services', nameKey: 'categories.services' },
  { id: 'other', nameKey: 'categories.other' },
];

const PROMOTION_TIERS = [
  {
    id: 'basic' as const,
    nameKey: 'store.tierBasic',
    price: 50,
    icon: Zap,
    color: 'from-amber-500 to-yellow-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-700',
    featureKeys: ['store.tierBasicFeature1', 'store.tierBasicFeature2', 'store.tierBasicFeature3'],
  },
  {
    id: 'standard' as const,
    nameKey: 'store.tierStandard',
    price: 150,
    icon: TrendingUp,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    featureKeys: ['store.tierStandardFeature1', 'store.tierStandardFeature2', 'store.tierStandardFeature3', 'store.tierStandardFeature4'],
  },
  {
    id: 'premium' as const,
    nameKey: 'store.tierPremium',
    price: 300,
    icon: Crown,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    featureKeys: ['store.tierPremiumFeature1', 'store.tierPremiumFeature2', 'store.tierPremiumFeature3', 'store.tierPremiumFeature4', 'store.tierPremiumFeature5'],
  },
];

export const StorePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { darkMode, posts, stores, addStore, updateStore, addStorePromotionRequest, updateWalletBalance, addNotification } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'basic' | 'standard' | 'premium'>('basic');

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('phones');
  const [formLocation, setFormLocation] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWhatsapp, setFormWhatsapp] = useState('');

  if (!currentUser) return null;

  const isOwner = currentUser.id === userId;
  const store = stores.find((s: Store) => s.ownerId === userId);
  const storePosts = posts.filter(p => p.author.id === userId && p.type === 'ad');

  // If store exists and we're opening edit, pre-fill form
  const openEditForm = () => {
    if (store) {
      setFormName(store.name);
      setFormDescription(store.description);
      setFormCategory(store.category);
      setFormLocation(store.location || '');
      setFormPhone(store.phone || '');
      setFormWhatsapp(store.whatsapp || '');
      setShowEditForm(true);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCategory('phones');
    setFormLocation('');
    setFormPhone('');
    setFormWhatsapp('');
  };

  const handleCreateStore = () => {
    if (!formName.trim()) { toast.error(t('store.errorNameRequired')); return; }
    if (!formDescription.trim()) { toast.error(t('store.errorDescRequired')); return; }

    const newStore: Store = {
      id: `store_${Date.now()}`,
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      ownerAvatar: currentUser.avatarBase64 || currentUser.avatar,
      name: formName.trim(),
      description: formDescription.trim(),
      category: formCategory,
      location: formLocation.trim() || undefined,
      phone: formPhone.trim() || undefined,
      whatsapp: formWhatsapp.trim() || undefined,
      rating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    };

    addStore(newStore);
    setShowCreateForm(false);
    resetForm();
    toast.success(t('store.createSuccess'));
  };

  const handleUpdateStore = () => {
    if (!store) return;
    if (!formName.trim()) { toast.error(t('store.errorNameRequired')); return; }
    if (!formDescription.trim()) { toast.error(t('store.errorDescRequired')); return; }

    updateStore(store.id, {
      name: formName.trim(),
      description: formDescription.trim(),
      category: formCategory,
      location: formLocation.trim() || undefined,
      phone: formPhone.trim() || undefined,
      whatsapp: formWhatsapp.trim() || undefined,
    });
    setShowEditForm(false);
    resetForm();
    toast.success(t('store.updateSuccess'));
  };

  const handlePromoteStore = () => {
    if (!store) return;
    const tier = PROMOTION_TIERS.find(tierItem => tierItem.id === selectedTier);
    if (!tier) return;

    const balance = currentUser.walletBalance || 0;
    if (balance < tier.price) {
      toast.error(t('store.insufficientBalance', { price: tier.price, balance: balance.toLocaleString() }));
      return;
    }

    // Deduct from wallet
    updateWalletBalance(-tier.price);

    // Create promotion request
    const promoReq: StorePromotionRequest = {
      id: `store_promo_${Date.now()}`,
      storeId: store.id,
      storeName: store.name,
      ownerName: currentUser.name,
      ownerAvatar: currentUser.avatarBase64 || currentUser.avatar,
      tier: selectedTier,
      price: tier.price,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    addStorePromotionRequest(promoReq);

    // Update store promotion status
    updateStore(store.id, {
      isPromoted: true,
      promotionTier: selectedTier,
      promotionStatus: 'pending',
      promotionExpiresAt: new Date(Date.now() + (selectedTier === 'basic' ? 7 : selectedTier === 'standard' ? 14 : 30) * 24 * 60 * 60 * 1000).toISOString(),
    });

    setShowPromotionModal(false);
    toast.success(t('store.promotionRequestSent', { tierName: t(tier.nameKey) }));
  };

  const getCategoryName = (catId: string) => {
    const cat = STORE_CATEGORIES.find(c => c.id === catId);
    return cat ? t(cat.nameKey) : catId;
  };

  // ─── No Store View (Create) ──────────────────────────────────
  if (!store && isOwner) {
    return (
      <div className="max-w-2xl mx-auto" dir={dir}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('store.myStore')}
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('store.createYourStoreDesc')}
            </p>
          </div>
        </div>

        {/* Create Store Card */}
        <AnimatePresence mode="wait">
          {!showCreateForm ? (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`rounded-2xl border-2 border-dashed p-12 text-center ${
                darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-50'
              }`}
            >
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                darkMode ? 'bg-gray-700' : 'bg-orange-100'
              }`}>
                <StoreIcon className={`w-10 h-10 ${darkMode ? 'text-gray-400' : 'text-orange-600'}`} />
              </div>
              <h2 className={`text-xl font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('store.noStoreYet')}
              </h2>
              <p className={`text-sm mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('store.createStoreNowDesc')}
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-orange-600 text-white px-8 py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all flex items-center gap-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                {t('store.createNewStore')}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`rounded-2xl border overflow-hidden ${
                darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              {/* Form Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between ${
                darkMode ? 'border-gray-700' : 'border-gray-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
                  }`}>
                    <StoreIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('store.createNewStore')}</h3>
                    <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('store.enterStoreData')}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCreateForm(false); resetForm(); }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-6 space-y-4">
                {/* Store Name */}
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('store.storeNameRequired')}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t('store.storeNamePlaceholder')}
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      darkMode
                        ? 'bg-gray-700 border border-gray-600 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                    }`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('store.storeDescRequired')}
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={t('store.storeDescPlaceholder')}
                    rows={3}
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all resize-none ${
                      darkMode
                        ? 'bg-gray-700 border border-gray-600 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                    }`}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('store.storeCategoryRequired')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {STORE_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setFormCategory(cat.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          formCategory === cat.id
                            ? 'bg-orange-600 text-white shadow-sm'
                            : darkMode
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t(cat.nameKey)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('store.location')}
                  </label>
                  <div className="relative">
                    <MapPin className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <input
                      type="text"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      placeholder={t('store.locationPlaceholder')}
                      className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                        darkMode
                          ? 'bg-gray-700 border border-gray-600 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Phone & WhatsApp */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {t('store.phoneNumber')}
                    </label>
                    <div className="relative">
                      <Phone className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                          darkMode
                            ? 'bg-gray-700 border border-gray-600 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {t('store.whatsapp')}
                    </label>
                    <div className="relative">
                      <MessageCircle className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="tel"
                        value={formWhatsapp}
                        onChange={(e) => setFormWhatsapp(e.target.value)}
                        placeholder="01xxxxxxxxx"
                        className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                          darkMode
                            ? 'bg-gray-700 border border-gray-600 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCreateStore}
                    className="flex-1 bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all"
                  >
                    {t('store.createStoreBtn')}
                  </button>
                  <button
                    onClick={() => { setShowCreateForm(false); resetForm(); }}
                    className={`px-6 py-3.5 rounded-xl font-bold text-sm transition-colors ${
                      darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('store.cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── Store Not Found (not owner, no store for this user) ────────────
  if (!store && !isOwner) {
    return (
      <div className="max-w-2xl mx-auto" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('store.theStore')}</h1>
        </div>
        <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${
          darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-50'
        }`}>
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            darkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <StoreIcon className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          </div>
          <h2 className={`text-xl font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('store.storeNotFound')}</h2>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('store.noStoreForUser')}</p>
        </div>
      </div>
    );
  }

  // ─── Store Display View ──────────────────────────────────────
  if (!store) return null;
  return (
    <div className="max-w-3xl mx-auto" dir={dir}>
      {/* Cover Image Area */}
      <div className="relative rounded-2xl overflow-hidden mb-4">
        <div className={`h-48 sm:h-56 ${
          store.coverImage
            ? ''
            : `bg-gradient-to-l ${store.isPromoted && store.promotionStatus === 'approved' ? 'from-purple-600 via-orange-500 to-amber-500' : 'from-orange-500 to-amber-500'}`
        }`}>
          {store.coverImage && (
            <img src={store.coverImage} alt={t('store.coverImage')} className="w-full h-full object-cover" />
          )}
          {/* Overlay pattern */}
          {!store.coverImage && (
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 right-4 w-32 h-32 border-2 border-white rounded-full" />
              <div className="absolute bottom-4 left-4 w-24 h-24 border-2 border-white rounded-full" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-white rounded-full" />
            </div>
          )}
        </div>

        {/* Promotion Badge */}
        {store.isPromoted && store.promotionStatus === 'approved' && (
          <div className="absolute top-4 left-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 shadow-lg">
            <Crown className="w-3.5 h-3.5" />
            {t('store.featuredStore')}
          </div>
        )}
        {store.isPromoted && store.promotionStatus === 'pending' && (
          <div className="absolute top-4 left-4 bg-yellow-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1.5 shadow-lg">
            <Megaphone className="w-3.5 h-3.5" />
            {t('store.pendingApproval')}
          </div>
        )}

        {/* Edit Button (Owner) */}
        {isOwner && (
          <button
            onClick={openEditForm}
            className="absolute top-4 right-4 bg-black/30 backdrop-blur-sm text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-black/50 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Store Info Card */}
      <div className={`rounded-2xl border overflow-hidden mb-6 -mt-16 relative z-10 ${
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="px-6 pt-8 pb-6">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 border-4 ${
              darkMode ? 'bg-gray-700 border-gray-800' : 'bg-orange-50 border-white'
            } ${store.logoImage ? '' : ''}`}>
              {store.logoImage ? (
                <img src={store.logoImage} alt={t('store.storeLogo')} className="w-full h-full object-cover rounded-xl" />
              ) : (
                <StoreIcon className={`w-8 h-8 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {store.name}
                </h1>
                {store.isPromoted && store.promotionStatus === 'approved' && (
                  <span className="text-purple-500">
                    <Crown className="w-5 h-5" />
                  </span>
                )}
              </div>
              <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {store.description}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className={`px-3 py-1 rounded-lg font-bold ${
                  darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-700'
                }`}>
                  {getCategoryName(store.category)}
                </span>
                {store.location && (
                  <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <MapPin className="w-3.5 h-3.5" />
                    {store.location}
                  </span>
                )}
                {store.rating !== undefined && store.rating > 0 && (
                  <span className={`flex items-center gap-1 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                    <Star className="w-3.5 h-3.5 fill-current" />
                    {store.rating.toFixed(1)}
                    {store.reviewCount && <span className={`font-normal ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>({store.reviewCount})</span>}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contact Buttons */}
          <div className="flex gap-3 mt-5">
            {store.phone && (
              <a
                href={`tel:${store.phone}`}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Phone className="w-4 h-4" />
                {t('store.call')}
              </a>
            )}
            {store.whatsapp && (
              <a
                href={`https://wa.me/${store.whatsapp.replace(/^0/, '2')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                {t('store.whatsapp')}
              </a>
            )}
            {isOwner && (
              <button
                onClick={() => setShowPromotionModal(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 transition-all active:scale-95"
              >
                <Megaphone className="w-4 h-4" />
                {t('store.promoteStore')}
              </button>
            )}
          </div>

          {/* Owner Info */}
          <div className={`flex items-center gap-3 mt-4 pt-4 border-t ${
            darkMode ? 'border-gray-700' : 'border-gray-100'
          }`}>
            <img src={store.ownerAvatar} alt={store.ownerName} className="w-8 h-8 rounded-full" />
            <div>
              <p className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{store.ownerName}</p>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('store.storeCreated')} {new Date(store.createdAt).toLocaleDateString('ar-EG')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Store Posts */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('store.storeAds')}
          </h2>
          <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('store.adCount', { count: storePosts.length })}
          </span>
        </div>

        {storePosts.length > 0 ? (
          <div className="space-y-4">
            {storePosts.map(post => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border overflow-hidden ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <img src={post.author.avatar} alt="" className="w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {post.author.name}
                        </span>
                        {post.author.isVerified && (
                          <span className="text-blue-500 text-xs">✓</span>
                        )}
                        {post.isPromoted && post.promotionStatus === 'approved' && (
                          <span className="text-[9px] font-bold bg-gradient-to-r from-purple-600 to-pink-500 text-white px-2 py-0.5 rounded-md">
                            {t('store.featured')}
                          </span>
                        )}
                        <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {formatRelativeTimeAr(post.timestamp)}
                        </span>
                      </div>
                      <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {post.content}
                      </p>
                      {post.image && (() => {
                        let imgs: string[] = [];
                        try { const p = JSON.parse(post.image); imgs = Array.isArray(p) ? p : [post.image]; } catch { imgs = [post.image]; }
                        if (imgs.length === 0) return null;
                        return (
                          <div className="relative mb-2">
                            <img
                              src={imgs[0]}
                              alt=""
                              className="w-full h-48 object-cover rounded-xl"
                              loading="lazy"
                            />
                            {imgs.length > 1 && (
                              <span className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                +{imgs.length - 1}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {post.price && (
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-black ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                            {post.price.toLocaleString()}
                          </span>
                          <span className={`text-xs font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {post.currency || t('store.egp')}
                          </span>
                          {post.location && (
                            <span className={`text-[11px] flex items-center gap-1 mr-auto ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              <MapPin className="w-3 h-3" />
                              {post.location}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-3">
                        <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          ❤️ {post.likes}
                        </span>
                        <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          💬 {post.comments}
                        </span>
                        <span className={`text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          🔄 {post.shares}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${
            darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-50'
          }`}>
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-3 ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <StoreIcon className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
            <p className={`font-bold mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>{t('store.noAdsYet')}</p>
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t('store.adsWillAppear')}</p>
          </div>
        )}
      </div>

      {/* ─── Edit Store Modal ────────────────────────────────── */}
      <AnimatePresence>
        {showEditForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setShowEditForm(false); resetForm(); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              }`}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between sticky top-0 z-10 ${
                darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
                  }`}>
                    <Edit className="w-5 h-5" />
                  </div>
                  <h3 className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('store.editStore')}</h3>
                </div>
                <button
                  onClick={() => { setShowEditForm(false); resetForm(); }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.storeNameRequired')}</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all ${
                      darkMode ? 'bg-gray-700 border border-gray-600 text-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.storeDescRequired')}</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={3}
                    className={`w-full rounded-xl px-4 py-3 text-sm outline-none transition-all resize-none ${
                      darkMode ? 'bg-gray-700 border border-gray-600 text-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.storeCategoryRequired')}</label>
                  <div className="flex flex-wrap gap-2">
                    {STORE_CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setFormCategory(cat.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          formCategory === cat.id
                            ? 'bg-orange-600 text-white'
                            : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {t(cat.nameKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.location')}</label>
                  <div className="relative">
                    <MapPin className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <input
                      type="text"
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                        darkMode ? 'bg-gray-700 border border-gray-600 text-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                      }`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.phoneNumber')}</label>
                    <div className="relative">
                      <Phone className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                          darkMode ? 'bg-gray-700 border border-gray-600 text-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`text-xs font-black mb-1.5 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.whatsapp')}</label>
                    <div className="relative">
                      <MessageCircle className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="tel"
                        value={formWhatsapp}
                        onChange={(e) => setFormWhatsapp(e.target.value)}
                        className={`w-full rounded-xl pr-10 pl-4 py-3 text-sm outline-none transition-all ${
                          darkMode ? 'bg-gray-700 border border-gray-600 text-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleUpdateStore}
                    className="flex-1 bg-orange-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all"
                  >
                    {t('store.saveChanges')}
                  </button>
                  <button
                    onClick={() => { setShowEditForm(false); resetForm(); }}
                    className={`px-6 py-3.5 rounded-xl font-bold text-sm transition-colors ${
                      darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {t('store.cancel')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Promotion Modal ────────────────────────────────── */}
      <AnimatePresence>
        {showPromotionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowPromotionModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              }`}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-6 py-4 border-b flex items-center justify-between sticky top-0 z-10 ${
                darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-white'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 flex items-center justify-center">
                    <Megaphone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('store.promoteStore')}</h3>
                    <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('store.choosePromotionPackage')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPromotionModal(false)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Wallet Balance */}
              <div className={`mx-6 mt-4 p-3 rounded-xl flex items-center justify-between ${
                darkMode ? 'bg-gray-700' : 'bg-gray-50'
              }`}>
                <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('store.currentBalance')}</span>
                <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {(currentUser.walletBalance || 0).toLocaleString()} {t('store.egp')}
                </span>
              </div>

              {/* Tiers */}
              <div className="p-6 space-y-3">
                {PROMOTION_TIERS.map(tier => {
                  const Icon = tier.icon;
                  const isSelected = selectedTier === tier.id;
                  return (
                    <motion.button
                      key={tier.id}
                      onClick={() => setSelectedTier(tier.id)}
                      className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? `border-orange-500 ${darkMode ? 'bg-orange-900/20' : 'bg-orange-50'}`
                          : darkMode ? 'border-gray-700 bg-gray-700/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${tier.color} flex items-center justify-center shadow-sm`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {t(tier.nameKey)}
                            </span>
                          </div>
                        </div>
                        <div className="text-left">
                          <span className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {tier.price}
                          </span>
                          <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}> {t('store.egp')}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {tier.featureKeys.map((fk, i) => (
                          <p key={i} className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            ✓ {t(fk)}
                          </p>
                        ))}
                      </div>
                      {isSelected && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-3 pt-3 border-t border-orange-500/30"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                              {t('store.tierSelected')}
                            </span>
                            <span className="text-[10px] text-orange-500 font-bold">✓</span>
                          </div>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}

                <button
                  onClick={handlePromoteStore}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white py-4 rounded-xl font-black text-sm hover:from-purple-700 hover:to-pink-600 transition-all active:scale-95 shadow-lg mt-4"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Megaphone className="w-5 h-5" />
                    {t('store.promoteStoreWithPrice', { price: PROMOTION_TIERS.find(tierItem => tierItem.id === selectedTier)?.price })}
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
