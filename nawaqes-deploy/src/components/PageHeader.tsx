// ─── PageHeader — Reusable header with back button + title + optional actions ─
// Used by PageLayout to provide a consistent navigation experience on inner pages.
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useTranslation } from 'react-i18next';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  showBack?: boolean;
  backTo?: string;
  hidden?: boolean;
}

const HOME_PATH = '/';

const ROUTE_TITLES: Record<string, { key: string; fallback: string }> = {
  '/market':            { key: 'nav.market',            fallback: 'السوق الذكي' },
  '/market/my-listings':{ key: 'nav.myListings',        fallback: 'إعلاناتي' },
  '/market/saved':      { key: 'nav.saved',             fallback: 'المحفوظات' },
  '/wallet':            { key: 'nav.wallet',            fallback: 'المحفظة' },
  '/channels':          { key: 'nav.channels',          fallback: 'القنوات' },
  '/saved':             { key: 'nav.saved',             fallback: 'المحفوظات' },
  '/profile':           { key: 'nav.profile',           fallback: 'الملف الشخصي' },
  '/settings':          { key: 'nav.settings',          fallback: 'الإعدادات' },
  '/friends':           { key: 'nav.friends',           fallback: 'الأصدقاء' },
  '/notifications':     { key: 'nav.notifications',     fallback: 'الإشعارات' },
  '/promotions':        { key: 'nav.promotions',        fallback: 'الترويجات' },
  '/ai-assistant':      { key: 'nav.aiAssistant',       fallback: 'المساعد الذكي' },
  '/promotion-packages':{ key: 'nav.promotionPackages', fallback: 'باقات الترويج' },
  '/smart-reach':       { key: 'nav.smartReach',        fallback: 'الوصول الذكي' },
  '/my-page':           { key: 'nav.myPage',            fallback: 'صفحتي' },
  '/market-pulse':      { key: 'nav.marketPulse',       fallback: 'نبض السوق' },
  '/matches':           { key: 'nav.matches',           fallback: 'متوافق معي' },
  '/complaint':         { key: 'nav.complaint',         fallback: 'تقديم شكوى' },
  '/help':              { key: 'nav.help',              fallback: 'المساعدة' },
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  showBack = true,
  backTo,
  hidden,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { dir } = useLanguage();
  const { darkMode } = useAppContext();
  const { t } = useTranslation();

  if (hidden) return null;

  const isHome = location.pathname === HOME_PATH;
  const showBackButton = showBack && !isHome;

  let resolvedTitle = title;
  if (!resolvedTitle) {
    const sortedRoutes = Object.keys(ROUTE_TITLES).sort((a, b) => b.length - a.length);
    for (const route of sortedRoutes) {
      if (location.pathname === route || location.pathname.startsWith(route + '/')) {
        const meta = ROUTE_TITLES[route];
        resolvedTitle = t(meta.key, { defaultValue: meta.fallback });
        break;
      }
    }
  }

  if (!resolvedTitle && isHome) return null;

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate(HOME_PATH);
      }
    }
  };

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <header
      className={`sticky top-0 z-30 ${
        darkMode
          ? 'bg-gray-900/95 border-gray-800'
          : 'bg-white/95 border-gray-100'
      } backdrop-blur-lg border-b`}
      dir={dir}
    >
      <div className="flex items-center gap-3 px-4 py-3 max-w-[900px] mx-auto">
        {showBackButton && (
          <button
            onClick={handleBack}
            aria-label={t('common.back', { defaultValue: 'رجوع' })}
            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              darkMode
                ? 'bg-gray-800 hover:bg-gray-700 text-gray-200'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <BackIcon className="w-5 h-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {resolvedTitle && (
            <h1 className={`text-base font-bold truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              {resolvedTitle}
            </h1>
          )}
          {subtitle && (
            <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex-shrink-0 flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
