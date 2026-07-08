// ─── Chat Header (Messenger-style top bar) ──────────────────────────
// Shows: back button (mobile) + avatar + name + online status + call buttons + menu
import React, { useState } from 'react';
import { useChat } from './ChatProvider';
import { ArrowRight, Phone, Video, MoreVertical, Search, Info, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const ChatHeader: React.FC = () => {
  const {
    activeContact, activeConversationId, otherUserTyping, selectConversation,
    startCall, darkMode, dir, myId,
  } = useChat();
  const [showMenu, setShowMenu] = useState(false);

  if (!activeContact) return null;

  const isGroup = !!activeContact.isGroup;
  const muted = !!activeContact.isMuted;

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border = darkMode ? 'border-gray-800' : 'border-gray-200';
  const hoverBg = darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100';

  const statusText = otherUserTyping
    ? 'يكتب الآن...'
    : isGroup
      ? `${activeContact.memberCount || 0} عضو`
      : activeContact.online
        ? 'متصل الآن'
        : '';

  const statusColor = otherUserTyping
    ? 'text-orange-500'
    : activeContact.online && !isGroup
      ? 'text-green-500'
      : textMuted;

  return (
    <>
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${border} ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Left: back + avatar + name */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Back button (mobile) */}
          <button
            onClick={() => selectConversation(null)}
            className={`md:hidden w-9 h-9 rounded-full flex items-center justify-center ${hoverBg}`}
          >
            <ArrowRight className={`w-5 h-5 ${textMuted}`} />
          </button>

          {/* Avatar */}
          <div
            className="relative shrink-0 cursor-pointer"
            onClick={() => {
              if (activeContact.id !== myId) {
                window.location.hash = `/user/${activeContact.id}`;
              }
            }}
          >
            {activeContact.avatar ? (
              <img src={activeContact.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                isGroup ? 'bg-gradient-to-br from-orange-500 to-amber-500' : 'bg-gradient-to-br from-blue-500 to-indigo-500'
              }`}>
                {activeContact.name?.charAt(0) || '?'}
              </div>
            )}
            {activeContact.online && !isGroup && (
              <div className="absolute bottom-0 left-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full" />
            )}
          </div>

          {/* Name + status */}
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h3 className={`text-sm font-bold truncate ${textPrimary}`}>
                {activeContact.name}
              </h3>
              {muted && <BellOff className={`w-3 h-3 flex-shrink-0 ${textMuted}`} />}
            </div>
            {statusText && (
              <p className={`text-[11px] ${statusColor}`}>{statusText}</p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          {/* Audio call (DM only) */}
          {!isGroup && (
            <button
              onClick={() => startCall('audio')}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${hoverBg}`}
              title="مكالمة صوتية"
            >
              <Phone className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
          )}

          {/* Video call (DM only) */}
          {!isGroup && (
            <button
              onClick={() => startCall('video')}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${hoverBg}`}
              title="مكالمة فيديو"
            >
              <Video className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
          )}

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${hoverBg}`}
            >
              <MoreVertical className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  className={`absolute top-11 left-0 rounded-xl shadow-xl border overflow-hidden py-1 min-w-[200px] z-50 ${
                    darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                  onClick={() => setShowMenu(false)}
                >
                  <button
                    onClick={() => window.location.hash = `/user/${activeContact.id}`}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                    عرض الملف الشخصي
                  </button>
                  <button
                    onClick={() => api.toggleMuteChat(activeConversationId || '', isGroup)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                      darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    {muted ? 'إلغاء الكتم' : 'كتم الإشعارات'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
};

// Need to import api for the mute toggle
import { api } from '../services/api';
