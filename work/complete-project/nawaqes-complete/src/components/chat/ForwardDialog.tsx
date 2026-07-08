import React, { useState } from 'react';
import { Forward, Search, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

export const ForwardDialog: React.FC = () => {
  const {
    showForwardDialog, setShowForwardDialog, contacts, forwardMessage, myId,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  const [searchFilter, setSearchFilter] = useState('');
  const [forwarding, setForwarding] = useState(false);

  if (!showForwardDialog) return null;

  const filteredContacts = contacts.filter(c =>
    c.id !== myId && (c.name.includes(searchFilter) || c.lastMessage.includes(searchFilter))
  );

  const handleForward = async (targetId: string, isGroup?: boolean) => {
    if (forwarding) return;
    setForwarding(true);
    try {
      await forwardMessage(showForwardDialog, targetId, isGroup);
    } finally {
      setForwarding(false);
    }
  };

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
        onClick={() => setShowForwardDialog(null)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl border overflow-hidden ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              <Forward className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
              <h3 className={`font-bold text-sm ${textPrimary}`}>
                {t('messages.forwardTo')}
              </h3>
            </div>
            <button
              onClick={() => setShowForwardDialog(null)}
              className={`p-1.5 rounded-full transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('messages.searchConversations')}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className={`bg-transparent border-none outline-none text-sm w-full ${
                  darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
                }`}
                dir={dir}
              />
            </div>
          </div>

          {/* Contact list */}
          <div className="max-h-72 overflow-y-auto px-2 pb-3">
            {filteredContacts.length > 0 ? filteredContacts.map(contact => (
              <button
                key={contact.id}
                onClick={() => handleForward(contact.isGroup ? contact.groupId! : contact.id, contact.isGroup)}
                disabled={forwarding}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                <div className="relative flex-shrink-0">
                  {contact.isGroup ? (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      darkMode ? 'bg-gray-600' : 'bg-orange-100'
                    }`}>
                      <Users className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                    </div>
                  ) : (
                    <img
                      src={contact.avatar}
                      alt={contact.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  {contact.online && !contact.isGroup && (
                    <div className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-start">
                  <span className={`text-sm font-bold block ${textPrimary}`}>{contact.name}</span>
                  <span className={`text-[10px] ${textMuted}`}>
                    {contact.isGroup
                      ? t('messages.memberCount', { count: contact.memberCount || 0 })
                      : contact.online ? t('messages.onlineNow') : ''
                    }
                  </span>
                </div>
                <Forward className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              </button>
            )) : (
              <div className="py-8 text-center">
                <p className={`text-sm ${textMuted}`}>{t('messages.selectChat')}</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
