import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCircle2, Pin, Forward, Clock, WifiOff } from 'lucide-react';
import { ChatMessage } from '../../types';
import { useChatContext } from './ChatContext';
import { VoicePlayer } from './VoicePlayer';
import { useTranslation } from 'react-i18next';

interface MessageBubbleProps {
  msg: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg }) => {
  const {
    myId, selectedContact, getMessageById, handleContextMenu,
    handleTouchStart, handleTouchEnd, handleTouchMove, handleDoubleClick, setShowImagePreview,
    editingMessage, setEditingMessage, handleEditMessage,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  const isMine = msg.senderId === myId;
  const isFailed = msg._failed;
  const isQueued = msg._queued;
  const isDeletedForEveryone = msg.deletedFor === 'everyone';
  const isEditing = editingMessage?.id === msg.id;

  const [editText, setEditText] = useState(msg.text);

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';

  // ─── Render reactions ────────────────────────────────────────────
  const renderReactions = () => {
    const reactions = msg.reactions || {};
    const emojiCounts: Record<string, number> = {};
    for (const [, emoji] of Object.entries(reactions)) {
      emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    }
    if (Object.keys(emojiCounts).length === 0) return null;
    return (
      <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
        {Object.entries(emojiCounts).map(([emoji, count]) => (
          <span
            key={emoji}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs ${
              darkMode ? 'bg-white/10' : 'bg-black/5'
            }`}
          >
            <span>{emoji}</span>
            {count > 1 && <span className={textMuted}>{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  // ─── Render reply preview inside bubble ──────────────────────────
  const renderReplyPreview = () => {
    if (!msg.replyToId) return null;
    const replyToMsg = getMessageById(msg.replyToId);
    if (!replyToMsg) return null;
    return (
      <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-s-2 text-xs ${
        isMine
          ? (darkMode ? 'bg-orange-700/30 border-orange-300' : 'bg-orange-100/80 border-orange-400')
          : (darkMode ? 'bg-gray-600/40 border-gray-400' : 'bg-gray-100 border-gray-300')
      }`}>
        <p className={`font-bold ${isMine ? 'text-orange-200' : textSecondary}`}>
          {replyToMsg.senderId === myId ? t('common.you') : selectedContact?.name || ''}
        </p>
        <p className={textMuted} style={{ direction: dir }}>
          {replyToMsg.messageType === 'image'
            ? '📷 ' + t('messages.imageSent')
            : replyToMsg.messageType === 'voice'
              ? '🎤 ' + t('messages.voiceMessage')
              : replyToMsg.text.length > 60 ? replyToMsg.text.slice(0, 60) + '...' : replyToMsg.text}
        </p>
      </div>
    );
  };

  // ─── Read/delivered receipt icon ──────────────────────────────────
  const renderReadReceipt = () => {
    if (!isMine || isFailed) return null;
    if (isQueued) {
      return (
        <span className="flex items-center gap-0.5" title={t('messages.messageQueued')}>
          <Clock className="w-3 h-3 text-yellow-400" />
        </span>
      );
    }
    if (msg.read) {
      return (
        <span className="flex items-center">
          <CheckCircle2 className="w-3 h-3 text-blue-400" />
          <CheckCircle2 className="w-3 h-3 text-blue-400 -ms-1.5" />
        </span>
      );
    }
    if (msg.delivered) {
      return (
        <span className="flex items-center">
          <Check className="w-3 h-3 text-gray-400" />
          <Check className="w-3 h-3 text-gray-400 -ms-1.5" />
        </span>
      );
    }
    return <Check className="w-3 h-3 text-white/60" />;
  };

  // ─── Bubble styling ──────────────────────────────────────────────
  const bubbleClasses = isFailed
    ? 'bg-red-100 text-red-700 border border-red-200 rounded-2xl rounded-bl-sm'
    : isQueued
      ? `bg-gradient-to-bl from-yellow-500/80 to-amber-500/80 text-white rounded-2xl rounded-bl-sm shadow-sm shadow-yellow-500/20 ring-1 ring-yellow-400/40`
      : isMine
        ? `bg-gradient-to-bl from-orange-500 to-amber-500 text-white rounded-2xl rounded-bl-sm shadow-sm shadow-orange-500/20`
        : darkMode
          ? 'bg-gray-700 text-gray-100 rounded-2xl rounded-br-sm shadow-sm'
          : 'bg-white text-gray-900 rounded-2xl rounded-br-sm shadow-sm border border-gray-100';

  // ─── Edit mode ──────────────────────────────────────────────────
  const renderEditMode = () => (
    <div className="w-full">
      <textarea
        value={editText}
        onChange={e => setEditText(e.target.value)}
        autoFocus
        rows={2}
        className={`w-full px-2 py-1.5 rounded-lg border outline-none text-sm resize-none ${
          darkMode
            ? 'bg-gray-800 border-gray-600 text-white focus:border-orange-500'
            : 'bg-white border-gray-300 text-gray-900 focus:border-orange-400'
        }`}
        dir={dir}
      />
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <button
          onClick={() => setEditingMessage(null)}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
            darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={() => handleEditMessage(msg.id, editText)}
          disabled={!editText.trim()}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
            editText.trim()
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-orange-300 text-white cursor-not-allowed'
          }`}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );

  // ─── Deleted for everyone placeholder ──────────────────────────
  if (isDeletedForEveryone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
      >
        {/* 🔧 FIX v3: touch handlers moved to the BUBBLE element, not the
            row. Previously they were on the row (which spans full width),
            so tapping anywhere in the empty space next to a message would
            start a long-press timer and trigger the context menu. Now only
            tapping the bubble itself can trigger it. */}
        <div
          className={`max-w-[75%] md:max-w-[75%] sm:max-w-[85%] px-4 py-2.5 rounded-2xl relative italic ${
            isMine
              ? (darkMode ? 'bg-gray-700/50 text-gray-500 rounded-bl-sm' : 'bg-gray-100 text-gray-400 rounded-bl-sm')
              : (darkMode ? 'bg-gray-700/50 text-gray-500 rounded-br-sm' : 'bg-gray-100 text-gray-400 rounded-br-sm')
          }`}
          onContextMenu={(e) => handleContextMenu(e, msg.id)}
          onTouchStart={() => handleTouchStart(msg.id)}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
        >
          <p className="text-sm">{t('messages.messageDeletedForEveryone')}</p>
          <div className={`absolute bottom-0 ${
            isMine
              ? (dir === 'rtl' ? '-left-1' : '-right-1')
              : (dir === 'rtl' ? '-right-1' : '-left-1')
          } w-2 h-2 overflow-hidden`}>
            <div className={`absolute w-4 h-4 rounded-sm ${
              isMine ? 'bg-gray-500' : darkMode ? 'bg-gray-700/50' : 'bg-gray-100'
            } ${
              isMine
                ? (dir === 'rtl' ? '-left-1 bottom-0 rotate-45' : '-right-1 bottom-0 rotate-45')
                : (dir === 'rtl' ? '-right-1 bottom-0 rotate-45' : '-left-1 bottom-0 rotate-45')
            }`} />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
    >
      {/* 🔧 FIX v3: touch handlers moved to the BUBBLE wrapper below, not
          this row. The row spans full width, so any tap in the empty space
          would have triggered long-press. Now only the bubble responds. */}
      <div
        className="max-w-[75%] md:max-w-[75%] sm:max-w-[85%]"
        onContextMenu={(e) => handleContextMenu(e, msg.id)}
        onTouchStart={() => handleTouchStart(msg.id)}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onDoubleClick={() => handleDoubleClick(msg.id)}
      >
      <div className={`${bubbleClasses} px-4 py-2.5 relative`}>
        {/* Pin indicator */}
        {msg.isPinned && (
          <div className={`absolute -top-2 ${isMine ? (dir === 'rtl' ? '-left-1' : '-right-1') : (dir === 'rtl' ? '-right-1' : '-left-1')} flex items-center justify-center`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shadow-sm ${
              darkMode ? 'bg-gray-800' : 'bg-white border border-gray-200'
            }`}>
              <Pin className="w-2.5 h-2.5 text-orange-500" />
            </div>
          </div>
        )}

        {/* Reply preview */}
        {renderReplyPreview()}

        {/* Forwarded label */}
        {msg.isForwarded && (
          <div className={`flex items-center gap-1 mb-1 ${isMine ? 'text-white/60' : (darkMode ? 'text-orange-400' : 'text-orange-500')}`}>
            <Forward className="w-3 h-3" />
            <span className="text-[10px] font-bold">
              {t('messages.forwarded')}
              {msg.forwardedFrom ? ` ${t('messages.from', 'من')} ${msg.forwardedFrom}` : ''}
            </span>
          </div>
        )}

        {/* Queued indicator */}
        {isQueued && (
          <div className="flex items-center gap-1 mb-1 text-yellow-200">
            <WifiOff className="w-3 h-3" />
            <span className="text-[10px] font-bold">{t('messages.messageQueued')}</span>
          </div>
        )}

        {/* Image message */}
        {msg.messageType === 'image' && msg.imageUrl && (
          <div className="mb-2 -mx-1 -mt-1">
            <img
              src={msg.imageUrl}
              alt="Chat image"
              className="max-w-full max-h-64 rounded-xl cursor-pointer hover:opacity-90 transition-opacity object-cover"
              onClick={() => setShowImagePreview(msg.imageUrl!)}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {/* Voice message */}
        {msg.messageType === 'voice' && msg.voiceUrl && (
          <div className="mb-1">
            <VoicePlayer
              src={msg.voiceUrl}
              duration={msg.voiceDuration}
              isMine={isMine}
              darkMode={darkMode}
            />
          </div>
        )}

        {/* Post reference message */}
        {msg.messageType === 'post' && msg.postId && (
          <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
            darkMode ? 'bg-gray-600/40' : 'bg-gray-100'
          }`}>
            <p className={`font-bold ${isMine ? 'text-orange-200' : textSecondary}`}>
              📎 {t('messages.postReference', 'إعلان')}
            </p>
          </div>
        )}

        {/* Edit mode or Text content */}
        {isEditing ? (
          renderEditMode()
        ) : (
          msg.text && msg.messageType !== 'image' && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
          )
        )}

        {/* Timestamp & read receipt & edited label */}
        {!isEditing && (
          <div className={`flex items-center justify-end gap-1 mt-1 ${
            isMine ? 'text-white/70' : textMuted
          }`}>
            {isFailed && (
              <span className="text-[9px] text-red-500 font-bold me-1">
                {t('messages.sendFailed', 'فشل الإرسال')}
              </span>
            )}
            {msg.isEdited && (
              <span className={`text-[9px] me-1 ${isMine ? 'text-white/50' : textMuted}`}>
                {t('messages.edited')}
              </span>
            )}
            <span className="text-[10px]">
              {new Date(msg.timestamp).toLocaleTimeString(
                dir === 'rtl' ? 'ar-EG' : 'en-US',
                { hour: '2-digit', minute: '2-digit' }
              )}
            </span>
            {renderReadReceipt()}
          </div>
        )}

        {/* Reactions */}
        {renderReactions()}

        {/* Message tail indicator */}
        <div className={`absolute bottom-0 ${
          isMine
            ? (dir === 'rtl' ? '-left-1' : '-right-1')
            : (dir === 'rtl' ? '-right-1' : '-left-1')
        } w-2 h-2 overflow-hidden`}>
          <div className={`absolute w-4 h-4 rounded-sm ${
            isMine
              ? 'bg-amber-500'
              : darkMode ? 'bg-gray-700' : 'bg-white'
          } ${
            isMine
              ? (dir === 'rtl' ? '-left-1 bottom-0 rotate-45' : '-right-1 bottom-0 rotate-45')
              : (dir === 'rtl' ? '-right-1 bottom-0 rotate-45' : '-left-1 bottom-0 rotate-45')
          }`} />
        </div>
      </div>
      </div>
    </motion.div>
  );
};
