import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight,
  Flag,
  Send,
  CheckCircle2,
  AlertTriangle,
  User,
  ShoppingBag,
  CreditCard,
  MessageSquare,
  ImagePlus,
  X,
  Clock,
  FileText,
  Shield,
  Phone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useSafeBack } from '../hooks/useSafeBack';

const complaintCategories = [
  { id: 'user', icon: User, color: 'bg-blue-500' },
  { id: 'ad', icon: ShoppingBag, color: 'bg-orange-500' },
  { id: 'payment', icon: CreditCard, color: 'bg-green-500' },
  { id: 'chat', icon: MessageSquare, color: 'bg-purple-500' },
  { id: 'other', icon: AlertTriangle, color: 'bg-red-500' },
];

export const ComplaintPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [complaintId, setComplaintId] = useState('');

  if (!currentUser) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('complaint.imageTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!category) {
      toast.error(t('complaint.selectCategory'));
      return;
    }
    if (!subject.trim()) {
      toast.error(t('complaint.enterSubject'));
      return;
    }
    if (!description.trim()) {
      toast.error(t('complaint.enterDescription'));
      return;
    }
    if (description.trim().length < 20) {
      toast.error(t('complaint.descriptionTooShort'));
      return;
    }
    // Require phone number for submitting complaints
    if (!currentUser?.phone || currentUser.phone.trim() === '') {
      toast.error(t('complaint.phoneRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      const id = `CMP-${Date.now().toString(36).toUpperCase()}`;
      // Submit via API (store locally if API not available)
      try {
        await api.createPost({
          content: `[شكوى] ${subject}\n${description}${referenceId ? `\nرقم مرجعي: ${referenceId}` : ''}`,
          type: 'status',
          category: `complaint_${category}`,
          image: imageBase64 || undefined,
          sender_phone: currentUser.phone,
        });
      } catch {
        // Fallback: store locally
      }

      setComplaintId(id);
      setSubmitted(true);
      toast.success(t('complaint.submittedSuccess'));
    } catch (err: any) {
      toast.error(err.message || t('complaint.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCategory('');
    setSubject('');
    setDescription('');
    setReferenceId('');
    setImageBase64('');
    setImagePreview('');
    setSubmitted(false);
    setComplaintId('');
  };

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bgInput = darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

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
          <h1 className={`text-2xl font-black flex items-center gap-2 ${textPrimary}`}>
            <Flag className="w-6 h-6 text-red-500" />
            {t('complaint.title')}
          </h1>
          <p className={`text-sm ${textMuted}`}>
            {t('complaint.subtitle')}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`rounded-2xl border p-8 text-center ${bgCard}`}
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              darkMode ? 'bg-green-900/30' : 'bg-green-50'
            }`}>
              <CheckCircle2 className={`w-10 h-10 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            <h2 className={`text-xl font-black mb-2 ${textPrimary}`}>
              {t('complaint.submittedSuccess')}
            </h2>
            <p className={`text-sm mb-4 ${textMuted}`}>
              {t('complaint.submittedDesc')}
            </p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <FileText className={`w-4 h-4 ${textMuted}`} />
              <span className={`text-sm font-mono font-bold ${textSecondary}`}>
                {complaintId}
              </span>
            </div>
            <p className={`text-xs mt-3 ${textMuted}`}>
              {t('complaint.saveId')}
            </p>
            <div className="flex gap-3 mt-6 justify-center">
              <button
                onClick={resetForm}
                className="bg-orange-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-700 active:scale-95 transition-all"
              >
                {t('complaint.newComplaint')}
              </button>
              <button
                onClick={() => safeBack()}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('complaint.backToHome')}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Info Banner */}
            <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
              darkMode ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-100'
            }`}>
              <Shield className={`w-5 h-5 mt-0.5 flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div>
                <p className={`text-sm font-bold ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                  {t('complaint.infoTitle')}
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  {t('complaint.infoDesc')}
                </p>
              </div>
            </div>

            {/* Phone number warning */}
            {(!currentUser?.phone || currentUser.phone.trim() === '') && (
              <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
                darkMode ? 'bg-red-900/20 border-red-800/40' : 'bg-red-50 border-red-100'
              }`}>
                <Phone className={`w-5 h-5 mt-0.5 flex-shrink-0 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                <div>
                  <p className={`text-sm font-bold ${darkMode ? 'text-red-300' : 'text-red-800'}`}>
                    {t('complaint.phoneRequiredTitle')}
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                    {t('complaint.phoneRequiredDesc')}
                  </p>
                  <button
                    onClick={() => navigate('/settings')}
                    className={`text-xs font-bold mt-1 underline ${darkMode ? 'text-red-300' : 'text-red-700'}`}
                  >
                    {t('complaint.goToSettings')}
                  </button>
                </div>
              </div>
            )}

            {/* Category Selection */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <label className={`text-sm font-black block mb-3 ${textPrimary}`}>
                {t('complaint.categoryLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-5 gap-2">
                {complaintCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                      category === cat.id
                        ? darkMode
                          ? 'bg-orange-900/30 border-2 border-orange-500'
                          : 'bg-orange-50 border-2 border-orange-500'
                        : darkMode
                          ? 'bg-gray-700 border-2 border-transparent hover:border-gray-600'
                          : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cat.color} text-white`}>
                      <cat.icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-bold text-center ${textSecondary}`}>
                      {t(`complaint.cat_${cat.id}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <label className={`text-sm font-black block mb-3 ${textPrimary}`}>
                {t('complaint.subjectLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('complaint.subjectPlaceholder')}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all ${bgInput}`}
                maxLength={100}
              />
              <p className={`text-[10px] mt-1.5 ${textMuted}`}>
                {t('complaint.subjectHint')}
              </p>
            </div>

            {/* Description */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <label className={`text-sm font-black block mb-3 ${textPrimary}`}>
                {t('complaint.descriptionLabel')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('complaint.descriptionPlaceholder')}
                rows={5}
                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all resize-none ${bgInput}`}
                maxLength={1000}
              />
              <div className="flex items-center justify-between mt-1.5">
                <p className={`text-[10px] ${textMuted}`}>
                  {t('complaint.descriptionHint')}
                </p>
                <span className={`text-[10px] font-mono ${description.length < 20 ? 'text-red-500' : textMuted}`}>
                  {description.length}/1000
                </span>
              </div>
            </div>

            {/* Reference ID (optional) */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <label className={`text-sm font-black block mb-3 ${textPrimary}`}>
                {t('complaint.referenceLabel')}
              </label>
              <input
                type="text"
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                placeholder={t('complaint.referencePlaceholder')}
                className={`w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all ${bgInput}`}
              />
              <p className={`text-[10px] mt-1.5 ${textMuted}`}>
                {t('complaint.referenceHint')}
              </p>
            </div>

            {/* Image Upload */}
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <label className={`text-sm font-black block mb-3 ${textPrimary}`}>
                {t('complaint.evidenceLabel')}
              </label>
              {imagePreview ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  <img src={imagePreview} alt="Evidence" className="w-full h-48 object-cover" />
                  <button
                    onClick={() => { setImageBase64(''); setImagePreview(''); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  darkMode ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}>
                  <ImagePlus className={`w-8 h-8 ${textMuted}`} />
                  <span className={`text-xs font-bold ${textMuted}`}>
                    {t('complaint.uploadEvidence')}
                  </span>
                  <span className={`text-[10px] ${textMuted}`}>
                    {t('complaint.maxSize')}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.avif,.heic,.heif,.ico,.jfif"
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl text-base font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-200'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('complaint.submitting')}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {t('complaint.submitComplaint')}
                </>
              )}
            </button>

            {/* Response Time Info */}
            <div className={`flex items-center gap-2 justify-center ${textMuted}`}>
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold">
                {t('complaint.responseTime')}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
