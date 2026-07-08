import React from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { MessageBubble } from './MessageBubble';
import { useTranslation } from 'react-i18next';

export const MessageList: React.FC = () => {
  const {
    messages, loadingMessages, selectedContact, showTypingIndicator, myId,
    messageSearchQuery,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const messagesContainerRef = (ctx as any).messagesContainerRef as React.RefObject<HTMLDivElement | null>;
  const messagesEndRef = (ctx as any).messagesEndRef as React.RefObject<HTMLDivElement | null>;
  const handleScroll = (ctx as any).handleScroll as (e: React.UIEvent) => void;
  const { t } = useTranslation();

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // ─── Date separator helper ───────────────────────────────────────
  const formatDateSeparator = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffDays === 0) return t('messages.today', 'اليوم');
      if (diffDays === 1) return t('messages.yesterday', 'أمس');
      if (diffDays < 7) return t('messages.daysAgo', { count: diffDays });

      return date.toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  // ─── Build message groups with date separators ───────────────────
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];
    let lastDateStr = '';

    messages.forEach((msg, index) => {
      // Date separator
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDateStr) {
        lastDateStr = msgDate;
        elements.push(
          <div key={`date-${msg.id}-${index}`} className="flex items-center justify-center my-4">
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${
              darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-500'
            }`}>
              {formatDateSeparator(msg.timestamp)}
            </div>
          </div>
        );
      }

      // System message (includes deleted-for-everyone)
      if (msg.messageType === 'system' && msg.deletedFor !== 'everyone') {
        elements.push(
          <div key={`sys-${msg.id}`} className="flex items-center justify-center my-2">
            <span className={`text-[11px] italic ${textMuted} px-3 py-1 rounded-full ${
              darkMode ? 'bg-gray-800/50' : 'bg-gray-100'
            }`}>
              {msg.text}
            </span>
          </div>
        );
        return;
      }

      // Skip soft-deleted messages for current user (but show deleted-for-everyone)
      if (msg.deletedFor && msg.deletedFor !== 'everyone') {
        const deletedForUsers = msg.deletedFor.split(',').map(id => id.trim()).filter(Boolean);
        if (deletedForUsers.includes(myId)) return;
      }

      elements.push(
        <MessageBubble key={msg.id} msg={msg} />
      );
    });

    return elements;
  };

  return (
    <div
      ref={messagesContainerRef}
      onScroll={handleScroll}
      className={`flex-1 overflow-y-auto p-4 space-y-1.5 ${
        darkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}
      style={{
        backgroundImage: darkMode
          ? 'radial-gradient(circle at 20% 50%, rgba(249, 115, 22, 0.03) 0%, transparent 50%)'
          : 'radial-gradient(circle at 20% 50%, rgba(249, 115, 22, 0.02) 0%, transparent 50%)',
      }}
    >
      {loadingMessages ? (
        <div className="text-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400 mb-2" />
          <p className={`text-sm ${textMuted}`}>{t('messages.loadingMessages', 'جاري تحميل الرسائل...')}</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
            darkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <span className="text-2xl">👋</span>
          </div>
          <p className={`font-bold ${textPrimary}`}>{t('messages.startConversation')}</p>
          {selectedContact && (
            <p className={`text-xs mt-1 ${textMuted}`}>
              {t('messages.sendMessageToStart', { name: selectedContact.name })}
            </p>
          )}
        </div>
      ) : (
        renderMessages()
      )}

      {/* Typing indicator */}
      <AnimatePresence>
        {showTypingIndicator && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="flex justify-start"
          >
            <div className={`rounded-2xl px-4 py-2.5 ${
              darkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-500 shadow-sm border border-gray-100'
            }`}>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px]">{t('messages.typing')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={messagesEndRef} />
    </div>
  );
};
