import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { Globe } from 'lucide-react';
import { motion } from 'motion/react';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useTranslation();
  const { language, toggleLanguage } = useLanguage();
  const { darkMode } = useAppContext();

  const isArabic = language === 'ar';

  return (
    <motion.button
      onClick={toggleLanguage}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
        darkMode
          ? isArabic
            ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border-2 border-blue-500/40 hover:border-blue-400/60'
            : 'bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border-2 border-orange-500/40 hover:border-orange-400/60'
          : isArabic
            ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-2 border-blue-200 hover:border-blue-400'
            : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-2 border-orange-200 hover:border-orange-400'
      } shadow-sm hover:shadow-md ${className}`}
      title={t('language.switchLanguage')}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <Globe className={`w-4 h-4 ${isArabic ? (darkMode ? 'text-blue-400' : 'text-blue-600') : (darkMode ? 'text-orange-400' : 'text-orange-600')}`} />
      <span className={`font-black ${isArabic ? (darkMode ? 'text-blue-400' : 'text-blue-600') : (darkMode ? 'text-orange-400' : 'text-orange-600')}`}>
        {isArabic ? 'English' : 'عربي'}
      </span>
    </motion.button>
  );
};
