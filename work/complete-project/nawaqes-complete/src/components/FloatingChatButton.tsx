// ─── Floating Chat Button - FAB for quick chat access ────────────
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';

export const FloatingChatButton: React.FC = () => {
  const { chatUnreadCount, darkMode, getChatContacts } = useAppContext();
  const { dir } = useLanguage();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Use React Router's useLocation for reactive route detection.
  // Previously used window.location.hash which only reads once on mount
  // and doesn't update when navigating between pages — so the button
  // stayed visible on /market-live even after we added it to the hide list.
  const currentPath = routerLocation.pathname || '';
  const isOnMessagesPage = currentPath.includes('/messages');
  const isOnCreatePage = currentPath.includes('/market/new') || currentPath.includes('/market/edit');
  const isOnLiveStreamPage = currentPath.includes('/livestream');
  const isOnWalletPage = currentPath.includes('/wallet');
  const isOnMarketLivePage = currentPath.includes('/market-live');
  if (isOnMessagesPage || isOnCreatePage || isOnLiveStreamPage || isOnWalletPage || isOnMarketLivePage) return null;

  // Get latest message preview
  const contacts = getChatContacts();
  const latestContact = contacts.length > 0 ? contacts[0] : null;
  const latestMessagePreview = latestContact
    ? (latestContact.lastMessage.length > 30
        ? latestContact.lastMessage.slice(0, 30) + '...'
        : latestContact.lastMessage)
    : null;

  const handleClick = () => {
    navigate('/messages');
  };

  const toggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div
      className="hidden lg:flex fixed bottom-6 left-4 z-[90] flex-col items-end gap-2"
      dir={dir}
    >
      {/* Message preview tooltip */}
      <AnimatePresence>
        {(isHovered || isExpanded) && chatUnreadCount > 0 && latestMessagePreview && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`px-3 py-2 rounded-xl shadow-lg max-w-[220px] ${
              darkMode
                ? 'bg-gray-800 border border-gray-700 text-gray-200'
                : 'bg-white border border-gray-100 text-gray-700'
            }`}
          >
            <p className="text-[10px] font-bold mb-0.5">{chatUnreadCount} {t('chat.unreadMessages')}</p>
            <p className={`text-[9px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {latestMessagePreview}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`relative flex items-center gap-2 rounded-2xl shadow-xl transition-all duration-300 ${
          isHovered || isExpanded
            ? 'pl-4 pr-4 py-3'
            : 'w-12 h-12 lg:w-14 lg:h-14 justify-center'
        } ${
          darkMode
            ? 'bg-gradient-to-br from-orange-600 to-amber-700 hover:from-orange-500 hover:to-amber-600'
            : 'bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500'
        }`}
      >
        {/* Pulse animation ring when unread */}
        {chatUnreadCount > 0 && (
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-orange-400"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Icon */}
        <MessageCircle className="w-5 h-5 lg:w-6 lg:h-6 text-white shrink-0" />

        {/* Expanded text */}
        <AnimatePresence>
          {(isHovered || isExpanded) && (
            <motion.span
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-white font-bold text-sm whitespace-nowrap overflow-hidden"
            >
              {t('chat.chats')}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Unread badge */}
        {chatUnreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`absolute -top-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black text-white shadow-md lg:min-w-[20px] lg:h-5 lg:px-1.5 lg:text-[10px] ${
              chatUnreadCount > 9
                ? 'bg-red-600'
                : 'bg-red-500'
            }`}
            style={{
              right: '-4px',
            }}
          >
            {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
};
