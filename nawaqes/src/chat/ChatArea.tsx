// ─── Chat Area (main chat pane) ─────────────────────────────────────
// Contains: ChatHeader + MessageList + MessageInput
// Also handles: pinned messages bar, typing indicator, offline banner
import React from 'react';
import { useChat } from './ChatProvider';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { WifiOff, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ChatArea: React.FC = () => {
  const { pinnedMessages, otherUserTyping, wsConnected, activeContact } = useChat();
  const darkMode = (useChat() as any).darkMode as boolean;

  return (
    <div className="flex flex-col h-full min-w-0">
      <ChatHeader />

      {/* Pinned messages bar */}
      <AnimatePresence>
        {pinnedMessages.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden border-b ${darkMode ? 'border-gray-800 bg-gray-800/50' : 'border-orange-100 bg-orange-50/50'}`}
          >
            <div className="px-4 py-2">
              <div className="flex items-center gap-2 mb-1">
                <Pin className={`w-3 h-3 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                  رسائل مثبتة ({pinnedMessages.length})
                </span>
              </div>
              <div className="max-h-20 overflow-y-auto space-y-1">
                {pinnedMessages.slice(0, 3).map(msg => (
                  <div key={msg.id} className={`text-xs truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                      {msg.senderId === (useChat() as any).myId ? 'أنت' : activeContact?.name}:
                    </span>{' '}
                    {msg.messageType === 'image' ? '📷 صورة' : msg.messageType === 'voice' ? '🎤 صوت' : msg.text}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline banner */}
      <AnimatePresence>
        {!wsConnected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`flex items-center justify-center gap-2 py-1.5 ${
              darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'
            }`}
          >
            <WifiOff className={`w-3.5 h-3.5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
            <span className={`text-[10px] font-bold ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
              غير متصل — سيتم إرسال الرسائل عند عودة الاتصال
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <MessageList />

      {/* Typing indicator */}
      <AnimatePresence>
        {otherUserTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`px-4 py-1.5 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
          >
            <div className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 ${
              darkMode ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-100'
            }`}>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ color: darkMode ? '#9CA3AF' : '#6B7280', animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ color: darkMode ? '#9CA3AF' : '#6B7280', animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ color: darkMode ? '#9CA3AF' : '#6B7280', animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <MessageInput />
    </div>
  );
};
