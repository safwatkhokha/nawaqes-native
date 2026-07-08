import React, { useEffect } from 'react';
import { MessageCircle, Pin, ShieldOff, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ContactInfo } from './ContactInfo';
import { GroupInfo } from './GroupInfo';
import { useTranslation } from 'react-i18next';

export const ChatWindow: React.FC = () => {
  const { selectedContact, selectedContactId, pinnedMessages, loadPinnedMessages, messages, isUserBlocked, showGroupInfo } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const wsConnected = (ctx as any).wsConnected as boolean;
  const offlineQueue = ctx.offlineQueue;
  const { t } = useTranslation();

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Load pinned messages when contact is selected
  useEffect(() => {
    if (selectedContactId) {
      loadPinnedMessages(selectedContactId);
    }
  }, [selectedContactId, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedContact) {
    const isGroup = selectedContact.isGroup;
    const blocked = !isGroup && isUserBlocked(selectedContactId || '');
    // Get pinned messages for current conversation
    const currentPinned = messages.filter(m => m.isPinned && m.deletedFor !== 'everyone');

    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <ChatHeader />
        <ContactInfo />

        {/* Group info panel */}
        <GroupInfo />

        {/* Blocked user banner */}
        {blocked && (
          <div className={`flex items-center justify-center gap-2 px-4 py-2 ${
            darkMode ? 'bg-red-900/30 border-b border-red-800' : 'bg-red-50 border-b border-red-200'
          }`}>
            <ShieldOff className={`w-4 h-4 ${darkMode ? 'text-red-400' : 'text-red-500'}`} />
            <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
              {t('messages.youAreBlocked')}
            </span>
          </div>
        )}

        {/* Offline queue banner */}
        {!wsConnected && offlineQueue.length > 0 && (
          <div className={`flex items-center justify-center gap-2 px-4 py-2 ${
            darkMode ? 'bg-yellow-900/30 border-b border-yellow-800' : 'bg-yellow-50 border-b border-yellow-200'
          }`}>
            <WifiOff className={`w-4 h-4 ${darkMode ? 'text-yellow-400' : 'text-yellow-500'}`} />
            <span className={`text-xs font-bold ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
              {t('messages.messageQueued')} ({offlineQueue.length})
            </span>
          </div>
        )}

        {/* Pinned messages section */}
        <AnimatePresence>
          {currentPinned.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden border-b ${
                darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-orange-100 bg-orange-50/50'
              }`}
            >
              <div className="px-4 py-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <Pin className={`w-3 h-3 text-orange-500`} />
                  <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                    {t('messages.pinnedMessages')}
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {currentPinned.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg ${
                        darkMode ? 'bg-gray-700/50' : 'bg-white/80'
                      }`}
                    >
                      <span className={`text-[10px] ${textMuted}`}>
                        {msg.senderId === ctx.myId ? t('common.you') : selectedContact.name}:
                      </span>
                      <p className={`text-xs ${textPrimary} line-clamp-1 flex-1`}>
                        {msg.messageType === 'voice'
                          ? '🎤 ' + t('messages.voiceMessage')
                          : msg.messageType === 'image'
                            ? '📷 ' + t('messages.imageSent')
                            : msg.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <MessageList />
        <MessageInput />
      </div>
    );
  }

  // Empty state - no contact selected
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-4">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
          darkMode ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <MessageCircle className={`w-10 h-10 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
        <p className={`font-bold text-lg ${textPrimary}`}>{t('messages.nawaqesMessages')}</p>
        <p className={`text-sm mt-1 ${textMuted}`}>{t('messages.chooseOrStart')}</p>
      </div>
    </div>
  );
};
