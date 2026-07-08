import React, { useState, useEffect } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

interface MessageSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MessageSearch: React.FC<MessageSearchProps> = ({ isOpen, onClose }) => {
  const {
    selectedContactId, messageSearchQuery, setMessageSearchQuery,
    searchedMessages, searchMessages,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const { t } = useTranslation();

  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // Debounce search
  useEffect(() => {
    if (!selectedContactId || !messageSearchQuery.trim()) return;
    const timer = setTimeout(() => {
      searchMessages(selectedContactId, messageSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [messageSearchQuery, selectedContactId, searchMessages]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setMessageSearchQuery('');
      setCurrentResultIndex(0);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateResult = (direction: 'up' | 'down') => {
    if (searchedMessages.length === 0) return;
    if (direction === 'down') {
      setCurrentResultIndex(prev => (prev + 1) % searchedMessages.length);
    } else {
      setCurrentResultIndex(prev => (prev - 1 + searchedMessages.length) % searchedMessages.length);
    }
  };

  const matchCount = searchedMessages.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`overflow-hidden border-b ${
            darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-gray-50'
          }`}
        >
          <div className="px-4 py-2 flex items-center gap-2">
            <Search className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              type="text"
              placeholder={t('messages.searchMessages')}
              value={messageSearchQuery}
              onChange={e => setMessageSearchQuery(e.target.value)}
              autoFocus
              className={`flex-1 px-3 py-1.5 rounded-lg border outline-none text-sm transition-colors ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
                  : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'
              }`}
            />
            {matchCount > 0 && (
              <div className="flex items-center gap-1">
                <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentResultIndex + 1}/{matchCount}
                </span>
                <button
                  onClick={() => navigateResult('up')}
                  className={`p-0.5 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigateResult('down')}
                  className={`p-0.5 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {messageSearchQuery && matchCount === 0 && (
              <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('messages.noResultsFound')}
              </span>
            )}
            <button
              onClick={onClose}
              className={`p-1 rounded-full flex-shrink-0 ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
