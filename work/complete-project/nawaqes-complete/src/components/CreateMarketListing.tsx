import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSafeBack } from "../hooks/useSafeBack";
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';
import { egyptianCities, regionLabels, regionOrder, searchCities } from '../data/egyptianCities';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Upload,
  X,
  Star,
  Camera,
  MapPin,
  Phone,
  MessageCircle,
  DollarSign,
  Tag,
  FileText,
  Image as ImageIcon,
  Loader2,
  Check,
  ChevronDown,
} from 'lucide-react';



// ─── Payment Methods ────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { id: 'vodafone_cash', labelKey: 'marketPayment.vodafone_cash', icon: '📱' },
  { id: 'instapay', labelKey: 'marketPayment.instapay', icon: '💳' },
  { id: 'fawry', labelKey: 'marketPayment.fawry', icon: '🏪' },
  { id: 'cash', labelKey: 'marketPayment.cash', icon: '💵' },
  { id: 'etisalat_cash', labelKey: 'marketPayment.etisalat_cash', icon: '📲' },
  { id: 'orange_cash', labelKey: 'marketPayment.orange_cash', icon: '🍊' },
  { id: 'bank_transfer', labelKey: 'marketPayment.bank_transfer', icon: '🏦' },
  { id: 'we_pay', labelKey: 'marketPayment.we_pay', icon: '💲' },
];

// ─── Condition Options ──────────────────────────────────────────────
const CONDITION_OPTIONS = [
  { id: 'new' as const, labelKey: 'common.newCondition', icon: '✨' },
  { id: 'used' as const, labelKey: 'common.used', icon: '🔄' },
  { id: 'refurbished' as const, labelKey: 'common.refurbished', icon: '🔧' },
];

// ─── Currency Options ───────────────────────────────────────────────
const CURRENCY_OPTIONS = [
  { id: 'EGP', labelKey: 'currency.egp', label: 'ج.م', symbol: 'E£' },
  { id: 'USD', labelKey: 'currency.usd', label: '$', symbol: '$' },
  { id: 'SAR', labelKey: 'currency.sar', label: 'ر.س', symbol: '﷼' },
  { id: 'AED', labelKey: 'currency.aed', label: 'د.إ', symbol: 'د.إ' },
];

type ListingCondition = 'new' | 'used' | 'refurbished';

interface UploadedImage {
  url: string;
  filename: string;
  localPreview?: string;
  isUploading?: boolean;
}

export const CreateMarketListing: React.FC<{ editMode?: boolean }> = ({ editMode }) => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const { id: editId } = useParams<{ id: string }>();
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadingListing, setLoadingListing] = useState(false);

  // ─── Form State ─────────────────────────────────────────────────
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<ListingCondition>('new');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [location, setLocation] = useState(currentUser?.location || '');
  const [city, setCity] = useState('');
  const [cityDisplay, setCityDisplay] = useState('');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [whatsapp, setWhatsapp] = useState(currentUser?.phone || '');
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(
    currentUser?.paymentMethods?.map((pm: any) => typeof pm === 'string' ? pm : pm.id).filter(Boolean) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  // Load existing listing data in edit mode
  useEffect(() => {
    if (editMode && editId) {
      setIsEditMode(true);
      setLoadingListing(true);
      api.getMarketListing(editId)
        .then((data: any) => {
          setTitle(data.title || '');
          setDescription(data.description || '');
          setCategory(data.category || '');
          setCondition(data.condition || 'new');
          setPrice(data.price ? String(data.price) : '');
          setCurrency(data.currency === 'ج.م' || data.currency === 'E£' ? 'EGP' : data.currency || 'EGP');
          setLocation(data.location || '');
          if (data.city) {
            setCity(data.city);
            const cityObj = egyptianCities.find((c: any) => c.id === data.city);
            setCityDisplay(cityObj?.nameAr || data.city);
          }
          setPhone(data.phone || '');
          setWhatsapp(data.whatsapp || '');
          if (data.payment_methods || data.paymentMethods) {
            const methods = data.payment_methods || data.paymentMethods;
            setSelectedPaymentMethods(
              Array.isArray(methods)
                ? methods.map((m: any) => typeof m === 'string' ? m : m.id).filter(Boolean)
                : []
            );
          }
          if (data.images && Array.isArray(data.images)) {
            setImages(data.images.map((url: string, idx: number) => ({
              url,
              filename: `existing_${idx}`,
              localPreview: undefined,
              isUploading: false,
            })));
          }
        })
        .catch((err: any) => {
          toast.error(t('market.failedToLoadListing'));
        })
        .finally(() => {
          setLoadingListing(false);
        });
    }
  }, [editMode, editId, t]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Filter cities by search ────────────────────────────────────
  const filteredCities = searchCities(citySearch);

  // ─── Image Upload Handler ───────────────────────────────────────
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = images.length;
    const remainingSlots = 5 - currentCount;
    if (remainingSlots <= 0) {
      toast.error(t('market.maxImagesReached'));
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('market.imageTooLarge', { name: file.name }));
        continue;
      }

      // Create local preview and add with uploading state
      const localPreview = URL.createObjectURL(file);
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      setImages(prev => [
        ...prev,
        { url: '', filename: tempId, localPreview, isUploading: true },
      ]);

      try {
        const result = await api.uploadImage(file);
        setImages(prev =>
          prev.map(img =>
            img.filename === tempId
              ? { url: result.url, filename: result.filename, localPreview, isUploading: false }
              : img
          )
        );
      } catch (err: any) {
        toast.error(err.message || t('market.failedToUploadImage'));
        setImages(prev => prev.filter(img => img.filename !== tempId));
      }
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [images.length, t]);

  // ─── Remove Image ───────────────────────────────────────────────
  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      const img = prev[index];
      if (img.localPreview) {
        URL.revokeObjectURL(img.localPreview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // ─── Toggle Payment Method ──────────────────────────────────────
  const togglePaymentMethod = (methodId: string) => {
    setSelectedPaymentMethods(prev =>
      prev.includes(methodId)
        ? prev.filter(id => id !== methodId)
        : [...prev, methodId]
    );
  };

  // ─── Validate ───────────────────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = t('validation.titleRequired');
    }
    if (!description.trim()) {
      newErrors.description = t('validation.descriptionRequired');
    }
    if (!category) {
      newErrors.category = t('validation.categoryRequired');
    }
    if (images.some(img => img.isUploading)) {
      newErrors.images = t('validation.waitImagesUpload');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) {
      toast.error(t('validation.fillRequiredFields'));
      return;
    }

    setIsSubmitting(true);

    try {
      const listingData = {
        title: title.trim(),
        description: description.trim(),
        images: images.map(img => img.url).filter(Boolean),
        category,
        condition,
        price: price ? parseFloat(price) : null,
        currency: CURRENCY_OPTIONS.find(c => c.id === currency)?.label || 'ج.م',
        location: location.trim() || undefined,
        city: city || undefined,
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        paymentMethods: selectedPaymentMethods,
      };

      if (isEditMode && editId) {
        const result = await api.updateMarketListing(editId, listingData);
        toast.success(t('market.adUpdated'));
        navigate(`/market/listing/${editId}`);
      } else {
        const result = await api.createMarketListing(listingData);
        toast.success(t('market.adPublished'));
        navigate(`/market/listing${result.id ? `/${result.id}` : ''}`);
      }
    } catch (err: any) {
      toast.error(err.message || t('market.failedToPublish'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Reusable Input Styles ──────────────────────────────────────
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${
    darkMode
      ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30'
      : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:ring-1 focus:ring-orange-400/30'
  }`;

  const labelClass = `block text-xs font-black uppercase tracking-wider mb-2 ${
    darkMode ? 'text-gray-400' : 'text-gray-500'
  }`;

  const sectionClass = `rounded-2xl border p-5 ${
    darkMode ? 'bg-gray-800/50 border-gray-700/50' : 'bg-white border-gray-100'
  }`;

  const errorClass = `text-[11px] font-bold text-red-500 mt-1`;

  return (
    <div className="max-w-2xl mx-auto pb-24" dir={dir}>
      {loadingListing && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      )}
      {!loadingListing && (<>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 backdrop-blur-xl"
        style={{
          backgroundColor: darkMode ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        }}
      >
        <div className="flex items-center justify-between py-4 px-1">
          <div className="flex items-center gap-3">
            <button
              onClick={() => safeBack()}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {isEditMode ? t('market.editListing') : t('market.addNewListing')}
              </h1>
              <p className={`text-[11px] font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {isEditMode ? t('market.editListingSubtitle') : t('market.addListingSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 text-white rounded-xl font-bold text-sm hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isEditMode ? t('common.save') : t('common.publish')}
          </button>
        </div>
      </motion.div>

      <div className="space-y-5 mt-4">
        {/* ─── Images Section ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('market.listingImages')}
              </h3>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('market.imagesHint')}
              </p>
            </div>
          </div>

          {/* Image Grid */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {images.map((img, index) => (
              <motion.div
                key={img.filename}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                  index === 0
                    ? 'border-orange-500 shadow-lg shadow-orange-500/10'
                    : darkMode ? 'border-gray-700' : 'border-gray-200'
                } ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}
              >
                <img
                  src={img.localPreview || img.url}
                  alt={t('market.imageNumber', { number: index + 1 })}
                  className="w-full h-full object-contain"
                />

                {/* Uploading overlay */}
                {img.isUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}

                {/* Main image badge */}
                {index === 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-600 text-white text-[9px] font-black">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    {t('market.mainImage')}
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}

            {/* Add Image Button */}
            {images.length < 5 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => fileInputRef.current?.click()}
                className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                  darkMode
                    ? 'border-gray-700 hover:border-orange-500/50 hover:bg-gray-800/50'
                    : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/30'
                }`}
              >
                <Camera className={`w-6 h-6 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {t('market.addImage')}
                </span>
              </motion.button>
            )}
          </div>

          {/* Add Images Button (bottom) */}
          {images.length > 0 && images.length < 5 && (
            <label htmlFor="fileInputRef-input" className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                darkMode ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
              }`} style={{cursor:"pointer"}}>
              <Upload className="w-4 h-4" />
              {t('market.addImagesCount', { count: images.length })}
            </label>
          )}

          {errors.images && <p className={errorClass}>{errors.images}</p>}

          <input
            id="fileInputRef-input" ref={fileInputRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.avif,.heic,.heif,.ico,.jfif"
            multiple
            className="sr-only"
            onChange={handleImageSelect}
          />
        </motion.div>

        {/* ─── Title ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
            }`}>
              <Tag className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.listingTitle')} <span className="text-red-500">*</span>
            </label>
          </div>
          <input
            type="text"
            value={title}
            onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(prev => { const n = { ...prev }; delete n.title; return n; }); }}
            placeholder={t('market.titlePlaceholder')}
            className={`${inputClass} ${errors.title ? 'border-red-500 focus:border-red-500' : ''}`}
            maxLength={100}
          />
          <div className="flex justify-between items-center mt-1.5">
            {errors.title && <p className={errorClass}>{errors.title}</p>}
            <p className={`text-[10px] mr-auto ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              {title.length}/100
            </p>
          </div>
        </motion.div>

        {/* ─── Description ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.listingDescription')} <span className="text-red-500">*</span>
            </label>
          </div>
          <textarea
            value={description}
            onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(prev => { const n = { ...prev }; delete n.description; return n; }); }}
            placeholder={t('market.descriptionPlaceholder')}
            className={`${inputClass} min-h-[120px] resize-y ${errors.description ? 'border-red-500 focus:border-red-500' : ''}`}
            maxLength={2000}
          />
          <div className="flex justify-between items-center mt-1.5">
            {errors.description && <p className={errorClass}>{errors.description}</p>}
            <p className={`text-[10px] mr-auto ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              {description.length}/2000
            </p>
          </div>
        </motion.div>

        {/* ─── Category ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'
            }`}>
              <Tag className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.category')} <span className="text-red-500">*</span>
            </label>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {interestCategories.map(cat => (
              <motion.button
                key={cat.id}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => { setCategory(cat.id); if (errors.category) setErrors(prev => { const n = { ...prev }; delete n.category; return n; }); }}
                className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  category === cat.id
                    ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                    : darkMode
                      ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                      : 'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <span className="text-xl">{cat.icon}</span>
                <span className={`text-[10px] font-bold leading-tight text-center ${
                  category === cat.id
                    ? 'text-orange-600'
                    : darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {t(cat.nameKey)}
                </span>
                {category === cat.id && (
                  <motion.div
                    layoutId="categoryCheck"
                    className="absolute top-1 left-1 w-4 h-4 bg-orange-600 rounded-full flex items-center justify-center"
                  >
                    <Check className="w-2.5 h-2.5 text-white" />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>

          {errors.category && <p className={`${errorClass} mt-2`}>{errors.category}</p>}
        </motion.div>

        {/* ─── Condition ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-cyan-900/30 text-cyan-400' : 'bg-cyan-50 text-cyan-600'
            }`}>
              <span className="text-sm">🔍</span>
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.productCondition')}
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {CONDITION_OPTIONS.map(opt => (
              <motion.button
                key={opt.id}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setCondition(opt.id)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                  condition === opt.id
                    ? 'border-orange-500 bg-orange-500/10 text-orange-600 shadow-lg shadow-orange-500/10'
                    : darkMode
                      ? 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <span>{opt.icon}</span>
                {t(opt.labelKey)}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ─── Price ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
            }`}>
              <DollarSign className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.price')}
            </label>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                min="0"
                className={`${inputClass} pl-4`}
              />
            </div>
            <div className="relative">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className={`h-full px-4 py-3 rounded-xl border text-sm font-bold outline-none appearance-none cursor-pointer transition-all ${
                  darkMode
                    ? 'bg-gray-800 border-gray-700 text-white focus:border-orange-500'
                    : 'bg-white border-gray-200 text-gray-900 focus:border-orange-400'
                }`}
              >
                {CURRENCY_OPTIONS.map(c => (
                  <option key={c.id} value={c.id}>{t(c.labelKey)}</option>
                ))}
              </select>
              <ChevronDown className={`absolute top-1/2 -translate-y-1/2 left-2 w-3 h-3 pointer-events-none ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`} />
            </div>
          </div>

          {price && parseInt(price) > 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`mt-2 text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}
            >
              {parseInt(price).toLocaleString()} {t(CURRENCY_OPTIONS.find(c => c.id === currency)?.labelKey || 'currency.egp')}
            </motion.p>
          )}
        </motion.div>

        {/* ─── Location ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-rose-900/30 text-rose-400' : 'bg-rose-50 text-rose-600'
            }`}>
              <MapPin className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.location')}
            </label>
          </div>

          {/* Location description */}
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={t('market.locationPlaceholder')}
            className={`${inputClass} mb-3`}
          />

          {/* City dropdown */}
          <div className="relative" ref={cityDropdownRef}>
            <button
              type="button"
              onClick={() => setShowCityDropdown(!showCityDropdown)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 text-white hover:border-gray-600'
                  : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
              } ${city ? '' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="font-medium">{cityDisplay || t('market.selectCity')}</span>
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
                  {/* City search */}
                  <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <input
                      type="text"
                      value={citySearch}
                      onChange={e => setCitySearch(e.target.value)}
                      placeholder={t('market.searchCity')}
                      className={`w-full px-3 py-2 rounded-lg text-sm outline-none ${
                        darkMode ? 'bg-gray-700 text-white placeholder:text-gray-500' : 'bg-gray-50 text-gray-900 placeholder:text-gray-400'
                      }`}
                      autoFocus
                    />
                  </div>

                  {/* City list grouped by region */}
                  <div className="max-h-56 overflow-y-auto">
                    {regionOrder.map(regionKey => {
                      const regionLabel = regionLabels[regionKey];
                      if (!regionLabel) return null;
                      const regionCities = filteredCities.filter(c => c.region === regionKey);
                      if (regionCities.length === 0) return null;
                      return (
                        <div key={regionKey}>
                          <p className={`px-4 py-1.5 text-[9px] font-black uppercase ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                            {regionLabel.ar}
                          </p>
                          {regionCities.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCity(c.id);
                                setCityDisplay(c.nameAr);
                                setShowCityDropdown(false);
                                setCitySearch('');
                              }}
                              className={`w-full text-start px-4 py-2.5 text-sm transition-colors ${
                                city === c.id
                                  ? 'bg-orange-500/10 text-orange-600 font-bold'
                                  : darkMode
                                    ? 'text-gray-300 hover:bg-gray-700'
                                    : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{c.nameAr}</span>
                                {city === c.id && <Check className="w-4 h-4 text-orange-600" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {filteredCities.length === 0 && (
                      <p className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {t('common.noResults')}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ─── Contact Info ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
            }`}>
              <Phone className="w-4 h-4" />
            </div>
            <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('market.contactInfo')}
            </label>
          </div>

          <div className="space-y-3">
            {/* Phone */}
            <div className="relative">
              <Phone className={`absolute top-1/2 -translate-y-1/2 right-4 w-4 h-4 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`} />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder={t('market.phoneNumber')}
                className={`${inputClass} pr-11`}
                dir="ltr"
              />
            </div>

            {/* WhatsApp */}
            <div className="relative">
              <MessageCircle className={`absolute top-1/2 -translate-y-1/2 right-4 w-4 h-4 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`} />
              <input
                type="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(e.target.value)}
                placeholder={t('market.whatsappNumber')}
                className={`${inputClass} pr-11`}
                dir="ltr"
              />
            </div>
          </div>
        </motion.div>

        {/* ─── Payment Methods ───────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className={sectionClass}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
            }`}>
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <label className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t('market.paymentMethods')}
              </label>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('market.selectPaymentMethods')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PAYMENT_METHODS.map(method => {
              const isSelected = selectedPaymentMethods.includes(method.id);
              return (
                <motion.button
                  key={method.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => togglePaymentMethod(method.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-500/10 text-orange-600'
                      : darkMode
                        ? 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-base">{method.icon}</span>
                  <span className="truncate">{t(method.labelKey)}</span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ─── Submit Button ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="pt-2"
        >
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black text-base transition-all ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-l from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 active:scale-[0.98] shadow-xl shadow-orange-500/25'
            } text-white`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('market.publishing')}
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                {isEditMode ? t('market.saveChanges') : t('market.publishListing')}
              </>
            )}
          </button>

          {/* Required fields note */}
          <p className={`text-center text-[11px] mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {t('market.requiredFields')} <span className="text-red-500">*</span>
          </p>
        </motion.div>
      </div>
      </>)}
    </div>
  );
};
