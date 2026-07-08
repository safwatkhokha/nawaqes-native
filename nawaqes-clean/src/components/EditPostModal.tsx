import React, { useState } from 'react';
import { X, ImagePlus, Send, Loader2, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Post } from '../types';
import { toast } from '../lib/silentToast';

interface EditPostModalProps {
  post: Post;
  onClose: () => void;
  onSaved: () => void;
}

const MAX_IMAGES = 8;

export const EditPostModal: React.FC<EditPostModalProps> = ({ post, onClose, onSaved }) => {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();

  // 🔧 FIX: Support multiple images (parse existing JSON array or single URL)
  const [images, setImages] = useState<string[]>(() => {
    if (!post.image) return [];
    try {
      const parsed = JSON.parse(post.image);
      return Array.isArray(parsed) ? parsed : [post.image];
    } catch {
      return [post.image];
    }
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [content, setContent] = useState(post.content || '');
  const [price, setPrice] = useState(post.price?.toString() || '');
  const [location, setLocation] = useState(post.location || '');
  const [category, setCategory] = useState(post.category || '');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(post.paymentMethods || []);
  const [saving, setSaving] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // 🔧 FIX: Upload multiple images to server
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      toast.error(`الحد الأقصى ${MAX_IMAGES} صور`);
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    const filesToUpload = Array.from(files).slice(0, remaining);

    for (const file of filesToUpload) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('حجم الصورة كبير جداً (الحد 10MB)');
        continue;
      }
      try {
        const result = await api.uploadImage(file);
        if (result?.url) {
          setImages(prev => [...prev, result.url]);
        }
      } catch {
        toast.error('فشل رفع صورة');
      }
    }

    setUploadingImage(false);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error(t('createPost.shareThoughts'));
      return;
    }
    setSaving(true);
    try {
      const updateData: any = {
        content: content.trim(),
        // 🔧 FIX: Send images as JSON array if multiple, single URL if one, empty if none
        image: images.length === 0 ? '' : images.length === 1 ? images[0] : JSON.stringify(images),
        location,
        category,
        payment_methods: paymentMethods,
      };
      if (post.type === 'ad' && price) {
        updateData.price = parseFloat(price) || 0;
      }
      await api.updatePost(post.id, updateData);
      toast.success(t('postCard.postUpdated'));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
    setSaving(false);
  };

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const categories = [
    { id: 'phones', label: t('interests.phones') },
    { id: 'electronics', label: t('interests.electronics') },
    { id: 'games', label: t('interests.games') },
    { id: 'cars', label: t('interests.cars') },
    { id: 'realEstate', label: t('interests.realEstate') },
    { id: 'fashion', label: t('interests.fashion') },
    { id: 'beauty', label: t('interests.beauty') },
    { id: 'sports', label: t('interests.sports') },
    { id: 'food', label: t('interests.food') },
    { id: 'jobs', label: t('interests.jobs') },
    { id: 'services', label: t('interests.services') },
    { id: 'education', label: t('interests.education') },
    { id: 'books', label: t('interests.books') },
    { id: 'animals', label: t('interests.animals') },
    { id: 'travel', label: t('interests.travel') },
    { id: 'photography', label: t('interests.photography') },
    { id: 'health', label: t('interests.health') },
    { id: 'other', label: t('interests.other') },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        dir={dir}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden max-h-[90vh] overflow-y-auto ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <h2 className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>تعديل الإعلان</h2>
            <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Content */}
            <div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className={`w-full text-sm px-3 py-2 rounded-xl border outline-none resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                rows={4}
                placeholder={t('createPost.shareThoughts')}
              />
            </div>

            {/* 🔧 FIX: Multiple Images — grid display with add/remove */}
            <div>
              <label className={`text-xs font-bold block mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('createPost.addImage')} ({images.length}/{MAX_IMAGES})
              </label>
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group">
                      <img src={img} alt={`صورة ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {idx === 0 && images.length > 1 && (
                        <span className="absolute bottom-1 left-1 bg-orange-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">★</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {images.length < MAX_IMAGES && (
                <label
                  htmlFor="edit-file-input"
                  className={`w-full h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${darkMode ? 'border-gray-600 hover:border-orange-500 text-gray-500' : 'border-gray-200 hover:border-orange-400 text-gray-400'}`}
                  style={{ cursor: 'pointer' }}
                >
                  {uploadingImage ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <PlusCircle className="w-5 h-5" />
                      <span className="text-xs font-bold">إضافة صور ({images.length}/{MAX_IMAGES})</span>
                    </>
                  )}
                </label>
              )}
              <input
                id="edit-file-input"
                type="file"
                ref={fileInputRef}
                accept="image/*,video/*"
                multiple
                className="sr-only"
                onChange={handleImageUpload}
              />
            </div>

            {/* Ad-specific fields */}
            {post.type === 'ad' && (
              <>
                {/* Price */}
                <div>
                  <label className={`text-xs font-bold block mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('createPost.price')}
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className={`w-full text-sm px-3 py-2 rounded-xl border outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    placeholder="0"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className={`text-xs font-bold block mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('createPost.location')}
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className={`w-full text-sm px-3 py-2 rounded-xl border outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                    placeholder={t('createPost.location')}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className={`text-xs font-bold block mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('createPost.category')}
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className={`w-full text-sm px-3 py-2 rounded-xl border outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  >
                    <option value="">{t('createPost.category')}</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Payment Methods */}
            <div>
              <label className={`text-xs font-bold block mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                طرق الدفع
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'vodafone_cash', label: '📱 فودافون كاش' },
                  { id: 'instapay', label: '💸 إنستا باي' },
                  { id: 'cash', label: '💵 كاش' },
                  { id: 'bank_transfer', label: '🏦 تحويل بنكي' },
                ].map(method => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => togglePaymentMethod(method.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      paymentMethods.includes(method.id)
                        ? 'bg-orange-500 text-white'
                        : darkMode
                          ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`flex gap-2 p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <button
              onClick={onClose}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
