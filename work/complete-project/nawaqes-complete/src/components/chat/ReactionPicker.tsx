import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🎉'];

interface ReactionPickerProps {
  /** If provided, renders as an inline picker below the context menu */
  messageId?: string;
  /** Position for floating picker (when double-tap) */
  floating?: boolean;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ messageId, floating = false }) => {
  const { showReactionPicker, handleReactToMessage, setShowReactionPicker, contextMenu } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const { t } = useTranslation();

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Inline picker (shown below context menu)
  if (messageId && showReactionPicker === messageId && contextMenu) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className={`mt-1 rounded-xl shadow-xl border p-2 flex gap-1 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          {REACTION_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReactToMessage(messageId, emoji)}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-lg transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Floating picker (for double-tap)
  if (floating && showReactionPicker && !contextMenu) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`rounded-2xl shadow-xl border p-2 flex gap-1 ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <div className={`text-[10px] font-bold ${textMuted} px-2 py-1 self-center`}>
              {t('messages.selectReaction')}
            </div>
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  if (showReactionPicker) handleReactToMessage(showReactionPicker, emoji);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-xl transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
            <button
              onClick={() => setShowReactionPicker(null)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
};
