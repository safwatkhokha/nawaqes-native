// ─── Mobile Bottom Navigation Bar ─ شريط التنقل السفلي للجوال ────────
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, PlusCircle, MessageCircle, Bell, Users, Megaphone, ShoppingBag, Video, UtensilsCrossed, Wallet } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { chatUnreadCount, notifications, readNotificationIds, darkMode, friendRequests } = useAppContext();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  // Count unread notifications
  const unreadNotificationCount = notifications.filter(
    (n) => !readNotificationIds.has(n.id)
  ).length;

  // Count friend requests
  const friendRequestCount = friendRequests?.length || 0;

  // Determine active tab based on current route
  const currentPath = location.pathname;

  // Hide bottom nav on pages that have their own full-screen controls
  const hiddenRoutes = ['/livestream', '/live-stream', '/messages', '/chat-app', '/market-live', '/connect'];
  if (hiddenRoutes.some(route => currentPath.startsWith(route))) return null;

  const isActive = (path: string) => {
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path);
  };

  const navItems = [
    {
      id: 'home',
      path: '/',
      icon: Home,
      label: t('navbar.home') || 'الرئيسية',
      isCenter: false,
    },
    {
      id: 'market',
      path: '/market',
      icon: ShoppingBag,
      label: t('navbar.market') || 'السوق',
      isCenter: false,
    },
    {
      id: 'food',
      path: '/food',
      icon: UtensilsCrossed,
      label: 'هتاكل',
      isCenter: false,
      isNew: true,
    },
    {
      id: 'create',
      path: '/create-post',
      icon: PlusCircle,
      label: t('navbar.createPost') || 'نشر',
      isCenter: true,
    },
    {
      id: 'channels',
      path: '/channels',
      icon: Video,
      label: t('navbar.channels') || 'قنوات',
      isCenter: false,
      isNew: true,
    },
    {
      id: 'wallet',
      path: '/wallet',
      icon: Wallet,
      label: t('navbar.wallet') || 'محفظتي',
      isCenter: false,
    },
    {
      id: 'connect',
      path: '/connect',
      icon: MessageCircle,
      label: 'تواصل',
      badge: chatUnreadCount,
      isCenter: false,
    },
    {
      id: 'notifications',
      path: '/notifications',
      icon: Bell,
      label: t('navbar.notifications') || 'إشعارات',
      badge: unreadNotificationCount,
      isCenter: false,
    },
  ];

  const handleNavClick = (path: string, id: string) => {
    if (id === 'create') {
      // Navigate to home and trigger create post
      navigate('/');
      // Dispatch a custom event to open the create post modal
      window.dispatchEvent(new CustomEvent('nawaqes-create-post'));
    } else {
      navigate(path);
    }
  };

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-[100] lg:hidden mobile-bottom-nav ${
        darkMode
          ? 'bg-gray-900 border-gray-800'
          : 'bg-white border-gray-200'
      } border-t`}
      dir={dir}
    >
      {/* 🔧 Scrollable horizontal nav — items scroll left/right when they
          don't all fit. Each item has a fixed min-width so icons stay
          tappable and slightly larger than before. */}
      <div
        className="flex items-end h-[68px] mx-auto px-1 overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {navItems.map((item) => {
          const active = item.isCenter ? false : isActive(item.path);
          const Icon = item.icon;

          if (item.isCenter) {
            // Center "Create Post" button - raised like a FAB
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.path, item.id)}
                className="flex flex-col items-center justify-center -mt-5 relative flex-shrink-0"
                style={{ minWidth: '64px' }}
                aria-label={item.label}
              >
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-300/30 active:scale-95 transition-transform">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <span className={`text-[10px] font-bold mt-1 ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.path, item.id)}
              className="flex flex-col items-center justify-center h-full relative active:scale-95 transition-transform flex-shrink-0"
              style={{ minWidth: '60px' }}
              aria-label={item.label}
            >
              <div className="relative">
                <Icon
                  className={`w-6 h-6 transition-colors ${
                    active
                      ? 'text-orange-500'
                      : darkMode
                        ? 'text-gray-500'
                        : 'text-gray-400'
                  }`}
                />
                {/* "New" badge for newly added nav items */}
                {item.isNew && !active && (
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-4 px-1 bg-green-500 text-white text-[8px] font-bold rounded-full">
                    جديد
                  </span>
                )}
                {/* Badge */}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[10px] font-bold mt-1 transition-colors whitespace-nowrap ${
                  active
                    ? 'text-orange-500'
                    : darkMode
                      ? 'text-gray-500'
                      : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
              {/* Active dot indicator */}
              {active && (
                <div className="absolute bottom-1 w-1 h-1 bg-orange-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
