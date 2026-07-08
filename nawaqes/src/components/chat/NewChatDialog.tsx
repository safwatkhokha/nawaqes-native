import React from 'react';
import { Search, RefreshCw, UserPlus, ShoppingBag, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

export const NewChatDialog: React.FC = () => {
  const {
    showNewChat, setShowNewChat, startNewChat,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const userSearchQuery = (ctx as any).userSearchQuery as string;
  const setUserSearchQuery = (ctx as any).setUserSearchQuery as (q: string) => void;
  const userSearchResults = (ctx as any).userSearchResults as any[];
  const searchingUsers = (ctx as any).searchingUsers as boolean;
  const postAuthors = (ctx as any).postAuthors as { id: string; name: string; avatar: string; postContent: string; postId: string }[];
  const { t } = useTranslation();

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      {showNewChat && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`mb-4 rounded-2xl border overflow-hidden ${bgCard}`}
        >
          <div className="p-4">
            {/* Search for users */}
            <h4 className={`font-bold text-sm mb-3 ${textPrimary}`}>
              {t('messages.contactSeller', 'تواصل مع مستخدم')}
            </h4>
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('messages.searchUsers', 'ابحث عن مستخدم بالاسم...')}
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                className={`bg-transparent border-none outline-none text-sm w-full ${
                  darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
                }`}
              />
              {searchingUsers && <RefreshCw className="w-4 h-4 animate-spin text-orange-500 flex-shrink-0" />}
            </div>

            {/* Search Results */}
            {userSearchResults.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className={`text-[10px] font-bold ${textMuted}`}>
                  {t('messages.searchResults', 'نتائج البحث')}
                </p>
                {userSearchResults.map((user: any) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      startNewChat(user.id, user.name, user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`);
                      setUserSearchQuery('');
                    }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <img
                      src={user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 text-right">
                      <span className={`text-sm font-bold block ${textPrimary}`}>{user.name}</span>
                      <span className={`text-[10px] ${textMuted}`}>
                        {user.friendshipStatus === 'accepted'
                          ? t('messages.friendRequestAccepted', 'صديق')
                          : user.friendshipStatus === 'pending'
                            ? t('messages.pendingRequest', 'قيد الانتظار')
                            : t('messages.user', 'مستخدم')}
                      </span>
                    </div>
                    <MessageCircle className="w-4 h-4 text-orange-500" />
                  </button>
                ))}
              </div>
            )}

            {/* Post Authors (Sellers) */}
            {postAuthors.length > 0 && (
              <div className="space-y-2">
                <p className={`text-[10px] font-bold ${textMuted}`}>
                  {t('messages.sellers', 'البائعون')}
                </p>
                {postAuthors.map(author => (
                  <button
                    key={author.id}
                    onClick={() => startNewChat(author.id, author.name, author.avatar)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <img src={author.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    <div className="flex-1 text-right">
                      <span className={`text-sm font-bold block ${textPrimary}`}>{author.name}</span>
                      <span className={`text-[10px] ${textMuted}`}>{author.postContent}...</span>
                    </div>
                    <ShoppingBag className="w-4 h-4 text-orange-500" />
                  </button>
                ))}
              </div>
            )}

            {userSearchResults.length === 0 && postAuthors.length === 0 && (
              <p className={`text-sm text-center py-4 ${textMuted}`}>
                {t('messages.noSellers', 'لا يوجد بائعين حالياً - ابحث عن مستخدم')}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
