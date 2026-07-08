import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { User } from '../types';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageToggle } from '../components/LanguageToggle';
import { MobileMenuButton } from '../components/Sidebar';
import {
  Search,
  Bell,
  MessageCircle,
  Home,
  Settings,
  ShoppingBag,
  LogOut,
  UserCircle,
  Clock,
  X,
  FileText,
  Zap,
  ArrowRight,
  ArrowLeft,
  Video,
  Megaphone,
  UtensilsCrossed,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  user?: User | null;
}

export const Navbar: React.FC<NavbarProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const {
    notifications,
    readNotificationIds,
    chatUnreadCount,
    clearChatUnread,
    darkMode,
  } = useAppContext();
  const { t } = useTranslation();
  const { dir, language } = useLanguage();

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // Set default recent searches based on language
  useEffect(() => {
    if (language === 'en') {
      setRecentSearches([
        t('navbar.searchSuggestion1En'),
        t('navbar.searchSuggestion2En'),
        t('navbar.searchSuggestion3En'),
        t('navbar.searchSuggestion4En'),
      ]);
    } else {
      setRecentSearches([
        t('navbar.searchSuggestion1Ar'),
        t('navbar.searchSuggestion2Ar'),
        t('navbar.searchSuggestion3Ar'),
        t('navbar.searchSuggestion4Ar'),
      ]);
    }
  }, [language, t]);

  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const clearSearches = () => setRecentSearches([]);

  // Handle search submission
  const handleSearch = (query?: string) => {
    const searchQuery = query || searchInput.trim();
    if (searchQuery) {
      // Add to recent searches
      setRecentSearches(prev => {
        const filtered = prev.filter(s => s !== searchQuery);
        return [searchQuery, ...filtered].slice(0, 5);
      });
      navigate(`/market?search=${encodeURIComponent(searchQuery)}`);
      setIsSearchFocused(false);
      setSearchInput('');
    } else {
      navigate('/market');
    }
  };

  // Dynamic notification badge: count unread notifications
  const unreadNotificationCount = notifications.filter(
    (n) => !readNotificationIds.has(n.id)
  ).length;

  const handleMessagesClick = () => {
    clearChatUnread();
    navigate('/');
  };

  const handleSettingsClick = () => {
    navigate('/settings');
    setShowProfileDropdown(false);
  };

  const handleMyAdsClick = () => {
    navigate('/profile');
    setShowProfileDropdown(false);
  };

  const handleLogout = () => {
    logout();
    setShowProfileDropdown(false);
    navigate('/login');
  };

  // Enlarge dropdown text for better mobile readability
  const navBg = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
  const searchBg = darkMode ? 'bg-gray-800' : 'bg-gray-100';
  const searchRing = darkMode ? 'ring-orange-500/30' : 'ring-orange-100';
  const iconBtnBg = darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200';
  const dropdownBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const dropdownHoverBg = darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <nav
      className={`sticky top-0 z-50 ${navBg} border-b h-14 flex items-center justify-between px-3 sm:px-4 transition-colors`}
    >
      {/* ─── Left side: Back button (inner pages) + Mobile Menu (home) ─── */}
      <div className="flex items-center gap-1 shrink-0">
        {location.pathname !== '/' && (
          <button
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/');
            }}
            aria-label={t('common.back', { defaultValue: 'رجوع' })}
            className={`flex items-center justify-center w-9 h-9 rounded-xl ${iconBtnBg} ${textPrimary} transition-colors active:scale-90 lg:hidden`}
          >
            {dir === 'rtl' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
        )}
        <MobileMenuButton />
      </div>

      {/* ─── Search and Logo ─── */}
      <div className="flex items-center gap-2 flex-1 relative" ref={searchRef}>
        <div
          className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-orange-100 cursor-pointer flex-shrink-0"
          onClick={() => navigate('/')}
        >
          {t('navbar.logo')}
        </div>

        <div className="hidden sm:block relative w-full max-w-[280px]">
          <div
            className={`flex items-center ${searchBg} rounded-full px-4 py-2 gap-2 transition-all ${
              isSearchFocused ? `${darkMode ? 'bg-gray-700' : 'bg-white'} ring-2 ${searchRing}` : ''
            }`}
          >
            <Search
              className={`w-4 h-4 transition-colors cursor-pointer ${isSearchFocused ? 'text-orange-600' : darkMode ? 'text-gray-500' : 'text-gray-500'}`}
              onClick={() => handleSearch()}
            />
            <input
              type="text"
              placeholder={t('navbar.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              className={`bg-transparent border-none outline-none text-sm w-full ${textPrimary} placeholder:${textMuted}`}
              onFocus={() => setIsSearchFocused(true)}
            />
          </div>

          {/* Recent Searches Dropdown */}
          <AnimatePresence>
            {isSearchFocused && recentSearches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`absolute top-full right-0 mt-2 w-full ${dropdownBg} rounded-2xl shadow-2xl border py-3 z-[100]`}
              >
                <div className="flex items-center justify-between px-4 mb-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {t('navbar.recentSearches')}
                  </span>
                  <button
                    onClick={clearSearches}
                    className="text-[10px] font-bold text-orange-600 hover:underline px-2 py-1"
                  >
                    {t('common.clearAll')}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {recentSearches.map((item, i) => (
                    <button
                      key={i}
                      className={`w-full flex items-center justify-between px-4 py-2.5 ${dropdownHoverBg} transition-colors group text-right`}
                      onClick={() => { handleSearch(item); setIsSearchFocused(false); }}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-3.5 h-3.5 text-gray-300 group-hover:text-orange-500" />
                        <span className={`text-xs font-bold ${textSecondary}`}>{item}</span>
                      </div>
                      <X className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all" onClick={(e) => { e.stopPropagation(); setRecentSearches(prev => prev.filter((_, idx) => idx !== i)); }} />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile search button - shows expandable search input */}
        {showMobileSearch ? (
          <div className={`sm:hidden flex items-center gap-2 flex-1 ${searchBg} rounded-full px-3 py-1.5`}>
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              placeholder={t('navbar.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { handleSearch(); setShowMobileSearch(false); } }}
              className={`bg-transparent border-none outline-none text-sm w-full ${textPrimary} placeholder:text-gray-400`}
              autoFocus
            />
            <button onClick={() => { setShowMobileSearch(false); setSearchInput(''); }} className="flex-shrink-0">
              <X className={`w-4 h-4 ${textMuted}`} />
            </button>
          </div>
        ) : (
          <button className={`sm:hidden w-10 h-10 flex items-center justify-center rounded-full ${iconBtnBg}`} onClick={() => setShowMobileSearch(true)}>
            <Search className={`w-5 h-5 ${textMuted}`} />
          </button>
        )}
      </div>

      {/* ─── Main Navigation (Center) — with labels ─── */}
      <div className="hidden md:flex items-center gap-1 flex-1 justify-center h-full">
        <button
          onClick={() => navigate('/')}
          className={`h-full px-4 border-b-4 flex flex-col items-center justify-center gap-0.5 transition-all ${
            location.pathname === '/'
              ? 'border-orange-600 text-orange-600'
              : `border-transparent ${textMuted} hover:text-orange-600`
          }`}
        >
          <Home className="w-7 h-7" />
          <span className="text-[11px] font-bold">{t('navbar.home') || 'الرئيسية'}</span>
        </button>
        <button
          onClick={() => navigate('/market')}
          className={`h-full px-4 border-b-4 flex flex-col items-center justify-center gap-0.5 transition-all group ${
            location.pathname.startsWith('/market')
              ? 'border-orange-600 text-orange-600'
              : `border-transparent ${textMuted} hover:text-orange-600`
          }`}
        >
          <ShoppingBag className="w-7 h-7 group-hover:scale-110 transition-all" />
          <span className="text-[11px] font-bold">{t('navbar.market') || 'السوق'}</span>
        </button>
        <button
          onClick={() => navigate('/channels')}
          className={`h-full px-4 border-b-4 flex flex-col items-center justify-center gap-0.5 transition-all group ${
            location.pathname.startsWith('/channels')
              ? 'border-orange-600 text-orange-600'
              : `border-transparent ${textMuted} hover:text-orange-600`
          }`}
        >
          <Video className="w-7 h-7 group-hover:scale-110 transition-all" />
          <span className="text-[11px] font-bold">{t('navbar.channels') || 'قنوات'}</span>
        </button>
        <button
          onClick={() => navigate('/food')}
          className={`h-full px-4 border-b-4 flex flex-col items-center justify-center gap-0.5 transition-all group ${
            location.pathname === '/food'
              ? 'border-orange-600 text-orange-600'
              : `border-transparent ${textMuted} hover:text-orange-600`
          }`}
        >
          <UtensilsCrossed className="w-7 h-7 group-hover:scale-110 transition-all" />
          <span className="text-[11px] font-bold">هتاكل</span>
        </button>
      </div>

      {/* ─── Profile and Actions ─── */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {/* Language Toggle - hidden on mobile */}
        <div className="hidden md:block">
          <LanguageToggle />
        </div>

        {/* Settings Button - hidden on mobile */}
        <button
          onClick={handleSettingsClick}
          className={`hidden md:flex w-10 h-10 ${iconBtnBg} rounded-full items-center justify-center transition-colors`}
        >
          <Settings className={`w-5 h-5 ${textMuted}`} />
        </button>

        {/* Connect (Friends Chat) Button - hidden on mobile (in bottom nav) */}
        <button
          onClick={() => navigate('/connect')}
          className={`hidden md:flex w-10 h-10 ${iconBtnBg} rounded-full items-center justify-center transition-colors relative`}
        >
          <MessageCircle className={`w-5 h-5 ${textMuted}`} />
          <AnimatePresence>
            {chatUnreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-0 left-0 bg-red-600 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white font-bold px-0.5"
              >
                {chatUnreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Notifications Button - hidden on mobile (in bottom nav) */}
        <button
          onClick={() => navigate('/notifications')}
          className={`hidden md:flex w-10 h-10 ${iconBtnBg} rounded-full items-center justify-center transition-colors relative`}
        >
          <Bell className={`w-5 h-5 ${textMuted}`} />
          <AnimatePresence>
            {unreadNotificationCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-0 left-0 bg-red-600 text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white font-bold px-0.5"
              >
                {unreadNotificationCount}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Profile Button + Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="w-10 h-10 rounded-full overflow-hidden border border-gray-100 flex items-center justify-center"
          >
            <img
              src={user?.avatarBase64 || user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default'}
              alt={user?.name || t('navbar.user')}
              className="w-full h-full object-cover"
            />
          </button>

          {/* Profile Dropdown */}
          <AnimatePresence>
            {showProfileDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={`absolute left-0 top-full mt-2 w-56 ${dropdownBg} rounded-2xl shadow-2xl border overflow-hidden z-[100]`}
              >
                {/* User Info */}
                {user && (
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatarBase64 || user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex flex-col">
                        <span className={`text-sm font-bold ${textPrimary}`}>{user.name}</span>
                        <span className="text-[10px] text-green-600 font-bold">{t('navbar.activeNow')}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Menu Items */}
                <div className="py-2">
                  <button
                    onClick={handleSettingsClick}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 ${dropdownHoverBg} transition-colors text-right`}
                  >
                    <Settings className={`w-4 h-4 ${textMuted}`} />
                    <span className={`text-sm font-bold ${textSecondary}`}>{t('navbar.settings')}</span>
                  </button>

                  <button
                    onClick={handleMyAdsClick}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 ${dropdownHoverBg} transition-colors text-right`}
                  >
                    <FileText className={`w-4 h-4 ${textMuted}`} />
                    <span className={`text-sm font-bold ${textSecondary}`}>{t('navbar.myAds')}</span>
                  </button>

                  <button
                    onClick={() => {
                      navigate('/promotions');
                      setShowProfileDropdown(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 ${dropdownHoverBg} transition-colors text-right`}
                  >
                    <Zap className={`w-4 h-4 ${textMuted}`} />
                    <span className={`text-sm font-bold ${textSecondary}`}>{t('navbar.myPromotedAds')}</span>
                  </button>

                  <button
                    onClick={() => {
                      navigate('/profile');
                      setShowProfileDropdown(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 ${dropdownHoverBg} transition-colors text-right`}
                  >
                    <UserCircle className={`w-4 h-4 ${textMuted}`} />
                    <span className={`text-sm font-bold ${textSecondary}`}>{t('navbar.myProfile')}</span>
                  </button>

                  <div className="border-t border-gray-100 my-1" />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors text-right group"
                  >
                    <LogOut className="w-4 h-4 text-red-400 group-hover:text-red-600" />
                    <span className="text-sm font-bold text-red-500 group-hover:text-red-600">
                      {t('navbar.logout')}
                    </span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
};
