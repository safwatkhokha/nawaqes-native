import React, { useState } from 'react';
import { ArrowRight, Phone, Video, MoreVertical, Eye, UserPlus, RefreshCw, Info, Search, BellOff, Bell, ShieldOff, Shield, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { MessageSearch } from './MessageSearch';
import { useTranslation } from 'react-i18next';

export const ChatHeader: React.FC = () => {
  const {
    selectedContact, selectedContactId, showTypingIndicator, contactLastSeen,
    startCall, setShowHeaderMenu, showHeaderMenu, setShowContactInfo, showContactInfo,
    friendshipStatus, loadMessages, loadingMessages, formatLastSeen,
    myId, selectContact, sendFriendRequest, sendingFriendRequest,
    toggleMuteChat, toggleBlockUser, isChatMuted, isUserBlocked, setShowGroupInfo,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const navigate = (ctx as any).navigate as (path: string) => void;
  const { t } = useTranslation();

  const [showSearch, setShowSearch] = useState(false);

  if (!selectedContact) return null;

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const isGroup = selectedContact.isGroup;
  const groupId = selectedContact.groupId;
  const muted = isChatMuted(groupId || selectedContactId || '');
  const blocked = !isGroup && isUserBlocked(selectedContactId || '');

  return (
    <>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        darkMode ? 'border-gray-700' : 'border-gray-100'
      }`}>
        {/* Left side: back button + avatar + name */}
        <div className="flex items-center gap-3">
          {/* Mobile back button */}
          <button
            onClick={() => selectContact(null)}
            className={`md:hidden w-8 h-8 rounded-full flex items-center justify-center ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Avatar */}
          <div
            className="relative cursor-pointer"
            onClick={() => {
              if (isGroup) {
                setShowGroupInfo(true);
              } else if (selectedContactId && selectedContactId !== myId) {
                navigate(`/user/${selectedContactId}`);
              }
            }}
          >
            {isGroup ? (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                darkMode ? 'bg-gray-700' : 'bg-orange-100'
              }`}>
                {selectedContact.avatar && !selectedContact.avatar.includes('dicebear') ? (
                  <img src={selectedContact.avatar} alt={selectedContact.name} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <Users className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                )}
              </div>
            ) : (
              <img
                src={selectedContact.avatar}
                alt={selectedContact.name}
                className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity object-cover"
              />
            )}
            {selectedContact.online && !isGroup && (
              <div className="absolute bottom-0 left-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
            )}
          </div>

          {/* Name & status */}
          <div
            className="cursor-pointer"
            onClick={() => {
              if (isGroup) {
                setShowGroupInfo(true);
              } else if (selectedContactId && selectedContactId !== myId) {
                navigate(`/user/${selectedContactId}`);
              }
            }}
          >
            <h4 className={`text-sm font-bold ${textPrimary} hover:text-orange-600 transition-colors flex items-center gap-1.5`}>
              {selectedContact.name}
              {muted && <BellOff className="w-3 h-3 text-gray-400" />}
              {blocked && <ShieldOff className="w-3 h-3 text-red-400" />}
            </h4>
            <span className={`text-[10px] ${
              blocked
                ? 'text-red-400'
                : showTypingIndicator
                  ? 'text-orange-500'
                  : selectedContact.online
                    ? 'text-green-600'
                    : textMuted
            }`}>
              {blocked
                ? t('messages.userBlocked')
                : showTypingIndicator
                  ? t('messages.typing')
                  : isGroup
                    ? t('messages.memberCount', { count: selectedContact.memberCount || 0 })
                    : selectedContact.online
                      ? t('messages.onlineNow')
                      : formatLastSeen(contactLastSeen)
              }
            </span>
          </div>
        </div>

        {/* Right side: search + call buttons + menu */}
        <div className="flex items-center gap-1">
          {/* Search button */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            title={t('messages.searchMessages')}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              showSearch
                ? (darkMode ? 'bg-gray-700 text-orange-400' : 'bg-orange-50 text-orange-600')
                : (darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Audio call (DM only) */}
          {!isGroup && (
            <button
              onClick={() => startCall('audio')}
              title={t('messages.audioCall')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-600'
              }`}
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          {/* Video call (DM only) */}
          {!isGroup && (
            <button
              onClick={() => startCall('video')}
              title={t('messages.videoCall')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-600'
              }`}
            >
              <Video className="w-4 h-4" />
            </button>
          )}

          {/* More menu */}
          <div className="relative" data-header-menu>
            <button
              onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(!showHeaderMenu); }}
              title={t('messages.moreOptions')}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {showHeaderMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -8 }}
                  className={`fixed bottom-16 right-2 rounded-xl shadow-2xl border overflow-hidden py-1 min-w-[200px] z-[200] max-h-[70vh] overflow-y-auto ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                  onClick={() => setShowHeaderMenu(false)}
                >
                  {/* Mute/Unmute */}
                  <button
                    onClick={() => toggleMuteChat(groupId || selectedContactId || '', isGroup)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      muted
                        ? (darkMode ? 'text-orange-400 hover:bg-gray-700' : 'text-orange-600 hover:bg-orange-50')
                        : (darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50')
                    }`}
                  >
                    {muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    {muted ? t('messages.unmuteChat') : t('messages.muteChat')}
                  </button>

                  {/* Block/Unblock (DM only) */}
                  {!isGroup && selectedContactId && (
                    <button
                      onClick={() => toggleBlockUser(selectedContactId)}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                        blocked
                          ? (darkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-green-50')
                          : (darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-yellow-600 hover:bg-yellow-50')
                      }`}
                    >
                      {blocked ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                      {blocked ? t('messages.unblockUser') : t('messages.blockUser')}
                    </button>
                  )}

                  {/* Search */}
                  <button
                    onClick={() => setShowSearch(true)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Search className="w-4 h-4" />
                    {t('messages.searchMessages')}
                  </button>

                  {/* View profile (DM only) */}
                  {!isGroup && (
                    <button
                      onClick={() => { if (selectedContactId && selectedContactId !== myId) navigate(`/user/${selectedContactId}`); }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                        darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      {t('messages.viewProfile')}
                    </button>
                  )}

                  {/* Add friend (DM only) */}
                  {!isGroup && friendshipStatus !== 'accepted' && selectedContactId && (
                    <button
                      onClick={sendFriendRequest}
                      disabled={sendingFriendRequest || friendshipStatus === 'pending'}
                      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                        friendshipStatus === 'pending'
                          ? (darkMode ? 'text-yellow-400' : 'text-yellow-600')
                          : (darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50')
                      }`}
                    >
                      {sendingFriendRequest ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      {friendshipStatus === 'pending' ? t('messages.pendingRequest') : t('messages.addFriend')}
                    </button>
                  )}

                  {/* Refresh messages */}
                  <button
                    onClick={() => { if (selectedContactId) loadMessages(selectedContactId); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                    {t('messages.refreshMessages')}
                  </button>

                  {/* Contact/Group info */}
                  <button
                    onClick={() => {
                      if (isGroup) setShowGroupInfo(true);
                      else setShowContactInfo(!showContactInfo);
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                    {isGroup ? t('messages.groupMembers') : t('messages.contactInfo')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <MessageSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />
    </>
  );
};
