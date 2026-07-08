import React from 'react';
import { Reply, Smile, Copy, Trash2, Edit3, Pin, XCircle, Forward, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { ReactionPicker } from './ReactionPicker';
import { useTranslation } from 'react-i18next';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu, setContextMenu, messages, handleReplyToMessage,
    setShowReactionPicker, showReactionPicker, handleCopyMessage,
    handleDeleteMessage, handleReactToMessage, myId,
    setEditingMessage, handleDeleteForEveryone, handleTogglePin,
    setShowForwardDialog, toggleBlockUser, selectedContact,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const { t } = useTranslation();

  if (!contextMenu) return null;

  const msg = messages.find(m => m.id === contextMenu.messageId);
  if (!msg) return null;

  const isMine = msg.senderId === myId;
  const isDeletedForEveryone = msg.deletedFor === 'everyone';
  const isDmOtherUser = !isMine && !selectedContact?.isGroup;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed z-50"
        style={{
          left: Math.min(contextMenu.x, window.innerWidth - 200),
          top: Math.min(contextMenu.y, window.innerHeight - 380),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`rounded-xl shadow-xl border overflow-hidden py-1 min-w-[180px] ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          {/* Reply */}
          {!isDeletedForEveryone && (
            <button
              onClick={() => { if (msg) handleReplyToMessage(msg); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Reply className="w-4 h-4" />
              {t('messages.reply')}
            </button>
          )}

          {/* React */}
          {!isDeletedForEveryone && (
            <button
              onClick={() => setShowReactionPicker(contextMenu.messageId)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Smile className="w-4 h-4" />
              {t('messages.react')}
            </button>
          )}

          {/* Edit - only for own messages and not deleted */}
          {isMine && !isDeletedForEveryone && msg.messageType === 'text' && (
            <button
              onClick={() => { setEditingMessage(msg); setContextMenu(null); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              {t('messages.editMessage')}
            </button>
          )}

          {/* Copy */}
          {!isDeletedForEveryone && msg.text && (
            <button
              onClick={() => { if (msg) handleCopyMessage(msg.text); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Copy className="w-4 h-4" />
              {t('messages.copyMessage')}
            </button>
          )}

          {/* Pin/Unpin */}
          <button
            onClick={() => handleTogglePin(contextMenu.messageId)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Pin className="w-4 h-4" />
            {msg.isPinned ? t('messages.unpinMessage') : t('messages.pinMessage')}
          </button>

          {/* Forward */}
          {!isDeletedForEveryone && (
            <button
              onClick={() => { setShowForwardDialog(contextMenu.messageId); setContextMenu(null); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Forward className="w-4 h-4" />
              {t('messages.forward')}
            </button>
          )}

          {/* Block User - only for other user's messages in DM */}
          {isDmOtherUser && (
            <button
              onClick={() => { toggleBlockUser(msg.senderId); setContextMenu(null); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-yellow-400 hover:bg-gray-700' : 'text-yellow-600 hover:bg-yellow-50'
              }`}
            >
              <ShieldOff className="w-4 h-4" />
              {t('messages.blockUser')}
            </button>
          )}

          {/* Divider */}
          <div className={`my-1 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />

          {/* Delete for everyone - only for own messages */}
          {isMine && !isDeletedForEveryone && (
            <button
              onClick={() => handleDeleteForEveryone(contextMenu.messageId)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <XCircle className="w-4 h-4" />
              {t('messages.deleteForEveryone')}
            </button>
          )}

          {/* Delete for me */}
          <button
            onClick={() => handleDeleteMessage(contextMenu.messageId)}
            className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {t('messages.deleteMessage')}
          </button>
        </div>

        {/* Inline Reaction Picker */}
        {showReactionPicker === contextMenu.messageId && (
          <ReactionPicker messageId={contextMenu.messageId} />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
