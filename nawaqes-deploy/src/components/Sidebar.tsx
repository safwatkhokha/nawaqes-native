import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { Category, User } from '../types';
import {
  Home,
  UserCircle,
  ShoppingBag,
  MessageCircle,
  Wallet,
  Bookmark,
  Settings,
  Bell,
  HelpCircle,
  Moon,
  Sun,
  Flag,
  CreditCard,
  Lock,
  Phone,
  XCircle,
  Zap,
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  Target,
  Video,
  PlusCircle,
  Store,
  Heart,
  Radio,
  ChevronDown,
  ChevronLeft,
  Search,
  Megaphone,
  BarChart3,
  Users,
  Crown,
  Flame,
  X,
  Globe,
  Menu,
  Brain,
  Calendar,
} from 'lucide-react';
import { promotionPackages } from '../data/promotionPackages';
import { startPresenceHeartbeat } from '../utils/presence';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  user: User | null;
  categories: Category[];
  onCategorySelect?: (id: string) => void;
  selectedCategory?: string | null;
}

// ─── Navigation Section Type ─────────────────────────────────────
interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
  badgeColor?: string;
  isNew?: boolean;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  defaultOpen?: boolean;
}

// ─── Shared: Mobile Sidebar Drawer Context ──────────────────────
// This lets the Navbar hamburger button toggle the mobile sidebar
interface SidebarDrawerCtx {
  open: boolean;
  toggle: () => void;
  close: () => void;
}
const SidebarDrawerCtx = React.createContext<SidebarDrawerCtx>({ open: false, toggle: () => {}, close: () => {} });
export const useSidebarDrawer = () => React.useContext(SidebarDrawerCtx);
export const SidebarDrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen(v => !v);
  const close = () => setOpen(false);
  return <SidebarDrawerCtx.Provider value={{ open, toggle, close }}>{children}</SidebarDrawerCtx.Provider>;
};

// ─── Sidebar Content (shared between desktop & mobile) ──────────
const SidebarContent: React.FC<SidebarProps & { onClose?: () => void }> = ({
  user,
  categories,
  onCategorySelect,
  selectedCategory,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { dir, language, toggleLanguage } = useLanguage();
  const { darkMode, toggleDarkMode, smartAlertsEnabled, enableSmartAlerts, notifications, readNotificationIds, chatUnreadCount, posts, friendRequests } =
    useAppContext();
  const { currentUser } = useAuth();

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [dismissedPromo, setDismissedPromo] = useState(false);
  const [dismissedAlert, setDismissedAlert] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      const cleanup = startPresenceHeartbeat(currentUser.id);
      return cleanup;
    }
  }, [currentUser?.id]);

  const unreadNotifications = notifications.filter(n => !readNotificationIds.has(n.id)).length;
  const friendRequestCount = friendRequests?.length || 0;
  const walletBalance = currentUser?.walletBalance || 0;

  const navSections: NavSection[] = useMemo(() => [
    {
      id: 'main',
      label: t('sidebar.sectionMain'),
      icon: Home,
      defaultOpen: true,
      items: [
        { id: 'home', label: t('sidebar.home'), icon: Home, path: '/' },
        { id: 'my-page', label: t('sidebar.myPage'), icon: LayoutDashboard, path: '/my-page' },
        { id: 'matches', label: t('home.matchesForMe'), icon: Target, path: '/matches' },
      ],
    },
    {
      id: 'market',
      label: t('sidebar.sectionMarket'),
      icon: ShoppingBag,
      defaultOpen: true,
      items: [
        { id: 'market', label: t('sidebar.smartMarket'), icon: ShoppingBag, path: '/market' },
        { id: 'market-add', label: t('sidebar.addAd'), icon: PlusCircle, path: '/market/new', isNew: true },
        { id: 'market-my', label: t('sidebar.myMarketListings'), icon: Store, path: '/market/my-listings' },
        { id: 'market-saved', label: t('sidebar.marketSaved'), icon: Heart, path: '/market/saved' },
      ],
    },
    {
      id: 'communication',
      label: t('sidebar.sectionCommunication'),
      icon: MessageCircle,
      defaultOpen: true,
      items: [
        { id: 'connect', label: 'تواصل', icon: MessageCircle, path: '/connect', badge: chatUnreadCount, badgeColor: 'bg-orange-500' },
        { id: 'friends', label: t('sidebar.friends'), icon: Users, path: '/friends', badge: friendRequestCount, badgeColor: 'bg-indigo-500' },
        { id: 'channels', label: t('sidebar.channels'), icon: Megaphone, path: '/channels', isNew: true },
        { id: 'notifications', label: t('sidebar.notifications'), icon: Bell, path: '/notifications', badge: unreadNotifications, badgeColor: 'bg-red-500' },
      ],
    },
    {
      id: 'financial',
      label: t('sidebar.sectionFinancial'),
      icon: Wallet,
      defaultOpen: false,
      items: [
        { id: 'wallet', label: t('sidebar.wallet'), icon: Wallet, path: '/wallet' },
        { id: 'promotions', label: t('sidebar.promotedAds'), icon: Zap, path: '/promotions' },
        { id: 'ai-assistant', label: t('sidebar.aiAssistant'), icon: Brain, path: '/ai-assistant' },
        { id: 'promotion-packages', label: t('sidebar.promotionPackages'), icon: Sparkles, path: '/promotion-packages' },
        { id: 'smart-reach', label: t('sidebar.smartReach'), icon: TrendingUp, path: '/smart-reach' },
      ],
    },
    {
      id: 'personal',
      label: t('sidebar.sectionPersonal'),
      icon: UserCircle,
      defaultOpen: false,
      items: [
        { id: 'profile', label: t('sidebar.profile'), icon: UserCircle, path: '/profile' },
        { id: 'saved', label: t('sidebar.saved'), icon: Bookmark, path: '/saved' },
        { id: 'settings', label: t('sidebar.settings'), icon: Settings, path: '/settings' },
      ],
    },
  ], [t, chatUnreadCount, unreadNotifications, friendRequestCount]);

  const quickTools = [
    { id: 'market-pulse', label: t('sidebar.marketPulse'), icon: TrendingUp, path: '/market-pulse', color: darkMode ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-50' },
    { id: 'market-live', label: t('sidebar.marketLive'), icon: Video, path: '/market-live', color: darkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-50' },
    { id: 'complaint', label: t('sidebar.submitComplaint'), icon: Flag, path: '/complaint', color: darkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-50' },
    { id: 'help', label: t('sidebar.helpSupport'), icon: HelpCircle, path: '/help', color: darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-50' },
    { id: 'dark-mode', label: darkMode ? t('sidebar.lightMode') : t('sidebar.darkMode'), icon: darkMode ? Sun : Moon, path: '', color: darkMode ? 'text-yellow-400 bg-yellow-900/30' : 'text-yellow-600 bg-yellow-50', action: toggleDarkMode },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '';
    return location.pathname.startsWith(path);
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return navSections;
    const q = searchQuery.toLowerCase();
    return navSections
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
        ),
      }))
      .filter(section => section.items.length > 0 || section.label.toLowerCase().includes(q));
  }, [navSections, searchQuery]);

  // Close mobile drawer on navigation
  const handleNavClick = (path: string) => {
    navigate(path);
    if (onClose) onClose();
  };

  const handleCategoryClick = (catId: string) => {
    if (onCategorySelect) {
      onCategorySelect(catId);
    }
  };

  // ─── Color system ───────────────────────────────────────────────
  const bgPage = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-500' : 'text-gray-400';
  const hoverBg = darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50';
  const activeBg = darkMode ? 'bg-orange-900/30' : 'bg-orange-50';
  const activeText = 'text-orange-600';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100';
  const dialogBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const dialogSectionBg = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';

  return (
    <div dir={dir} className="flex flex-col gap-0 py-3 h-full overflow-y-auto overflow-x-hidden px-3 transition-colors scrollbar-thin">
      {/* ─── User Profile Card ─── */}
      {user && (
        <motion.button
          onClick={() => handleNavClick('/profile')}
          className={`flex items-center gap-3.5 p-3.5 ${hoverBg} rounded-2xl transition-all w-full text-start mb-3 group`}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <div className="relative flex-shrink-0">
            <img
              src={user.avatarBase64 || user.avatar}
              alt={user.name}
              className="w-14 h-14 rounded-xl bg-gray-100 group-hover:scale-105 transition-transform object-cover"
            />
            <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className={`font-black text-base ${textPrimary} truncate`}>{user.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600 font-bold">{t('navbar.activeNow')}</span>
              {walletBalance > 0 && (
                <>
                  <span className={`text-xs ${textMuted}`}>·</span>
                  <span className="text-xs font-bold text-orange-600">{walletBalance.toLocaleString()} {t('common.egp')}</span>
                </>
              )}
            </div>
          </div>
          <ChevronLeft className={`w-5 h-5 ${textMuted} opacity-0 group-hover:opacity-100 transition-opacity`} />
        </motion.button>
      )}

      {/* ─── Search Filter ─── */}
      <div className="mb-3">
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}>
          <Search className={`w-5 h-5 ${textMuted} flex-shrink-0`} />
          <input
            type="text"
            placeholder={t('sidebar.searchMenu')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`bg-transparent border-none outline-none text-sm w-full ${textPrimary} placeholder:${textMuted}`}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="flex-shrink-0">
              <X className={`w-5 h-5 ${textMuted} hover:text-red-500 transition-colors`} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Language Switch Button (Prominent) ─── */}
      <div className="mb-3">
        <motion.button
          onClick={toggleLanguage}
          className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl transition-all group ${
            darkMode
              ? 'bg-gradient-to-l from-blue-900/40 to-indigo-900/40 hover:from-blue-900/60 hover:to-indigo-900/60 border border-blue-800/30'
              : 'bg-gradient-to-l from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200/50'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            darkMode ? 'bg-blue-800/50 text-blue-300' : 'bg-blue-100 text-blue-600'
          }`}>
            <Globe className="w-5 h-5" />
          </div>
          <div className="flex-1 text-start">
            <span className={`text-sm font-black block ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              {language === 'ar' ? 'English' : 'العربية'}
            </span>
            <span className={`text-xs ${darkMode ? 'text-blue-400/70' : 'text-blue-500'}`}>
              {language === 'ar' ? t('sidebar.switchToEnglish') : t('sidebar.switchToArabic')}
            </span>
          </div>
          <div className={`px-3 py-1.5 rounded-lg text-xs font-black ${
            darkMode ? 'bg-blue-700/50 text-blue-200' : 'bg-blue-200/60 text-blue-700'
          }`}>
            {language === 'ar' ? 'EN' : 'عربي'}
          </div>
        </motion.button>
      </div>

      {/* ─── Navigation Sections ─── */}
      <div className="space-y-1 mb-3">
        {filteredSections.map((section) => {
          const isCollapsed = collapsedSections[section.id];
          const isSectionActive = section.items.some(item => isActive(item.path));
          const SectionIcon = section.icon;

          return (
            <div key={section.id} className="rounded-2xl overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${isSectionActive ? (darkMode ? 'bg-orange-900/20' : 'bg-orange-50/50') : hoverBg} group`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isSectionActive ? (darkMode ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-100 text-orange-600') : (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>
                  <SectionIcon className="w-5 h-5" />
                </div>
                <span className={`text-[15px] font-black flex-1 text-start ${isSectionActive ? 'text-orange-600' : textSecondary}`}>
                  {section.label}
                </span>
                <motion.div
                  animate={{ rotate: isCollapsed ? 0 : 180 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className={`w-5 h-5 ${textMuted}`} />
                </motion.div>
              </button>

              {/* Section Items */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="py-1 pe-2 ps-6 space-y-1">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isActive(item.path);

                        return (
                          <motion.button
                            key={item.id}
                            onClick={() => handleNavClick(item.path)}
                            className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all w-full text-start group ${
                              active
                                ? `${activeBg} ${activeText}`
                                : hoverBg
                            }`}
                            whileHover={{ x: dir === 'rtl' ? 2 : -2 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <ItemIcon
                              className={`w-[22px] h-[22px] flex-shrink-0 transition-transform group-hover:scale-110 ${
                                active
                                  ? activeText
                                  : darkMode ? 'text-gray-500' : 'text-gray-400'
                              }`}
                            />
                            <span
                              className={`font-bold text-sm flex-1 truncate ${
                                active ? activeText : textSecondary
                              } group-hover:text-orange-600`}
                            >
                              {item.label}
                            </span>
                            {item.isNew && (
                              <span className="text-[10px] font-black bg-green-500 text-white px-2.5 py-0.5 rounded-full">{t('common.new')}</span>
                            )}
                            {item.badge && item.badge > 0 && (
                              <span className={`${item.badgeColor || 'bg-red-500'} text-white text-[11px] min-w-[22px] h-[22px] flex items-center justify-center rounded-full font-bold px-1.5 flex-shrink-0`}>
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* ─── Categories (Compact) ─── */}
      {categories.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => toggleSection('categories')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all ${hoverBg} group`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className={`text-[15px] font-black flex-1 text-start ${textSecondary}`}>
              {t('sidebar.sections')}
            </span>
            <motion.div
              animate={{ rotate: collapsedSections['categories'] ? 0 : 180 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className={`w-5 h-5 ${textMuted}`} />
            </motion.div>
          </button>
          <AnimatePresence initial={false}>
            {!collapsedSections['categories'] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="py-1.5 pe-2 ps-6">
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const isActiveCat = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => handleCategoryClick(cat.id)}
                          className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                            isActiveCat
                              ? 'bg-orange-600 text-white'
                              : darkMode
                                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span className="text-base">{cat.icon}</span>
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Quick Tools (Compact Grid) ─── */}
      <div className="mb-3">
        <h4 className={`px-3 ${textMuted} font-black text-xs uppercase tracking-wider mb-2`}>
          {t('sidebar.quickTools')}
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {quickTools.map((tool) => {
            const ToolIcon = tool.icon;
            return (
              <motion.button
                key={tool.id}
                onClick={() => tool.action ? tool.action() : handleNavClick(tool.path)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} transition-all group relative`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={tool.label}
              >
                <div className={`w-11 h-11 rounded-lg ${tool.color} flex items-center justify-center`}>
                  <ToolIcon className="w-5 h-5" />
                </div>
                <span className={`text-[11px] font-bold ${textMuted} leading-tight text-center line-clamp-2`}>
                  {tool.label}
                </span>
                {/* 🔧 REMOVED: live-stream red pulse badge — standalone /live-stream is deprecated. */}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ─── Promotion Banner (Compact) ─── */}
      {!dismissedPromo && (
        <div className="mb-3">
          <div className={`rounded-2xl overflow-hidden border ${cardBg} relative`}>
            <button
              onClick={() => setDismissedPromo(true)}
              className={`absolute top-2 left-2 w-7 h-7 rounded-full ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-500'} flex items-center justify-center z-10 transition-colors`}
            >
              <X className="w-4 h-4" />
            </button>
            {/* Gradient Header */}
            <div className="bg-gradient-to-l from-orange-600 to-amber-500 p-4 text-white">
              <div className="flex items-center gap-3">
                <Crown className="w-6 h-6" />
                <div>
                  <span className="text-sm font-black block">{t('sidebar.promotionPackagesTitle')}</span>
                  <span className="text-xs opacity-80">{t('sidebar.startingFrom')} 50 {t('common.egp')}</span>
                </div>
              </div>
            </div>
            {/* Quick Package Preview */}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3">
                {promotionPackages.slice(0, 3).map((pkg) => (
                  <div
                    key={pkg.id}
                    className={`flex-1 rounded-lg ${darkMode ? 'bg-gray-700/50' : 'bg-white'} p-2.5 text-center`}
                  >
                    <span className="text-lg">{pkg.icon}</span>
                    <p className={`text-xs font-black ${textPrimary}`}>{pkg.name}</p>
                    <p className="text-[11px] text-orange-600 font-bold">{pkg.price} {t('common.egp')}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => handleNavClick('/promotion-packages')}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                {t('sidebar.promoteNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Smart Alerts (Compact) ─── */}
      {!dismissedAlert && !smartAlertsEnabled && (
        <div className="mb-3">
          <div
            className={`p-4 ${
              darkMode
                ? 'bg-blue-900/30 border border-blue-800/50'
                : 'bg-blue-600'
            } rounded-2xl text-white relative`}
          >
            <button
              onClick={() => setDismissedAlert(true)}
              className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center z-10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Bell className="w-5 h-5" />
              </div>
              <span className="text-sm font-black uppercase tracking-widest">{t('sidebar.nawaqesAlerts')}</span>
            </div>
            <p className="text-sm font-bold leading-relaxed mb-3 opacity-90">
              {t('sidebar.alertsDesc')}
            </p>
            <button
              onClick={async () => {
                await enableSmartAlerts();
              }}
              className="w-full py-3 rounded-xl text-sm font-black transition-all active:scale-95 bg-white text-blue-600 hover:bg-gray-50"
            >
              {t('sidebar.enableSmartAlerts')}
            </button>
          </div>
        </div>
      )}

      {/* ─── Smart Alerts Active Indicator ─── */}
      {smartAlertsEnabled && (
        <div className="mb-3">
          <div className={`flex items-center gap-3 p-3.5 rounded-xl ${darkMode ? 'bg-green-900/20 border border-green-800/30' : 'bg-green-50 border border-green-100'}`}>
            <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-black ${darkMode ? 'text-green-400' : 'text-green-700'} block`}>{t('sidebar.smartAlertsActive')}</span>
            </div>
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer className={`mt-auto px-3 py-3 ${textMuted} text-xs leading-tight`}>
        <div className="flex items-center justify-between">
          <span>{t('sidebar.footer')}</span>
          <span className="text-[11px] opacity-50">v2.0</span>
        </div>
      </footer>

      {/* ─── Help Dialog ─── */}
      <AnimatePresence>
        {showHelpDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowHelpDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`${dialogBg} rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl ${darkMode ? 'bg-blue-900/30' : 'bg-blue-100'} flex items-center justify-center`}
                  >
                    <HelpCircle className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                  <div>
                    <h3 className={`font-black text-lg ${textPrimary}`}>
                      {t('sidebar.helpCenterTitle')}
                    </h3>
                    <p className={`text-sm ${textMuted}`}>
                      {t('sidebar.helpCenterDesc')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className={`w-9 h-9 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded-full flex items-center justify-center transition-colors`}
                >
                  <XCircle className={`w-5 h-5 ${textMuted}`} />
                </button>
              </div>

              {/* Help Sections */}
              <div className="p-5 space-y-4">
                <div className={`${dialogSectionBg} rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${darkMode ? 'bg-orange-900/30' : 'bg-orange-100'} flex items-center justify-center`}>
                      <Megaphone className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <h4 className={`font-black text-[15px] ${textPrimary}`}>{t('sidebar.publishingAds')}</h4>
                  </div>
                  <p className={`text-sm leading-relaxed ${textMuted}`}>
                    {t('sidebar.publishingAdsDesc')}
                  </p>
                </div>

                <div className={`${dialogSectionBg} rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${darkMode ? 'bg-green-900/30' : 'bg-green-100'} flex items-center justify-center`}>
                      <CreditCard className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    <h4 className={`font-black text-[15px] ${textPrimary}`}>{t('sidebar.chargingPayment')}</h4>
                  </div>
                  <p className={`text-sm leading-relaxed ${textMuted}`}>
                    {t('sidebar.chargingPaymentDesc')}
                  </p>
                </div>

                <div className={`${dialogSectionBg} rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'} flex items-center justify-center`}>
                      <MessageCircle className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                    </div>
                    <h4 className={`font-black text-[15px] ${textPrimary}`}>{t('sidebar.conversations')}</h4>
                  </div>
                  <p className={`text-sm leading-relaxed ${textMuted}`}>
                    {t('sidebar.conversationsDesc')}
                  </p>
                </div>

                <div className={`${dialogSectionBg} rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg ${darkMode ? 'bg-gray-600' : 'bg-gray-100'} flex items-center justify-center`}>
                      <Lock className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    </div>
                    <h4 className={`font-black text-[15px] ${textPrimary}`}>
                      {t('sidebar.settingsPrivacy')}
                    </h4>
                  </div>
                  <p className={`text-sm leading-relaxed ${textMuted}`}>
                    {t('sidebar.settingsPrivacyDesc')}
                  </p>
                </div>
              </div>

              {/* Contact Section */}
              <div
                className={`p-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Phone className={`w-5 h-5 ${textMuted}`} />
                  <span className={`text-sm font-bold ${textSecondary}`}>
                    {t('sidebar.needMoreHelp')}
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${textMuted} mb-3`}>
                  {t('sidebar.needMoreHelpDesc')}
                </p>
                <button
                  onClick={() => {
                    setShowHelpDialog(false);
                    handleNavClick('/settings');
                  }}
                  className="w-full bg-orange-600 text-white py-3.5 rounded-xl text-sm font-bold hover:bg-orange-700 transition-colors active:scale-95"
                >
                  {t('sidebar.goToSettings')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Desktop Sidebar ────────────────────────────────────────────
export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { darkMode } = useAppContext();
  const bgPage = darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';

  return (
    <aside
      className={`hidden lg:flex flex-col w-[300px] h-full border-e ${bgPage} transition-colors overflow-hidden`}
      style={{ position: 'sticky', top: 0, flexShrink: 0 }}
    >
      <SidebarContent {...props} />
    </aside>
  );
};

// ─── Mobile Sidebar Drawer ──────────────────────────────────────
export const MobileSidebarDrawer: React.FC<SidebarProps> = (_props) => {
  const { darkMode, categories, selectedCategory, setSelectedCategory } = useAppContext();
  const { currentUser } = useAuth();
  const { open, close } = useSidebarDrawer();
  const { dir } = useLanguage();

  // Build user from currentUser for SidebarContent
  const user = currentUser as any;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={close}
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: dir === 'rtl' ? -320 : 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir === 'rtl' ? -320 : 320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            dir={dir}
            className={`fixed top-0 ${dir === 'rtl' ? 'right-0' : 'left-0'} z-[201] w-[300px] h-full ${
              darkMode ? 'bg-gray-900' : 'bg-white'
            } shadow-2xl lg:hidden`}
          >
            {/* Close button */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
              <span className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{currentUser?.name || 'نواقص'}</span>
              <button
                onClick={close}
                className={`w-10 h-10 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent
              user={user}
              categories={categories}
              onCategorySelect={setSelectedCategory}
              selectedCategory={selectedCategory}
              onClose={close}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Mobile Hamburger Button (to be placed in Navbar) ───────────
export const MobileMenuButton: React.FC = () => {
  const { toggle, open } = useSidebarDrawer();
  const { darkMode } = useAppContext();
  return (
    <button
      onClick={toggle}
      className={`lg:hidden w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
        open
          ? 'bg-orange-600 text-white'
          : darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
      }`}
    >
      <Menu className="w-6 h-6" />
    </button>
  );
};
