// ─── Message Bubble (Messenger-style + Nawaqes identity) ────────────
// Unique design:
//   - Outgoing (mine): gradient orange bubble with tail on bottom-right
//   - Incoming (theirs): solid dark/light bubble with tail on bottom-left
//   - Reactions float on the bubble's edge (Messenger-style)
//   - Reply preview inside bubble (quoted message)
//   - Read receipts (✓ sent, ✓✓ delivered, ✓✓ blue read)
//   - Long-press → context menu (reply, react, copy, edit, delete, pin, forward)
//   - Image messages: full-width image inside bubble
//   - Voice messages: waveform + play button + duration
import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck, Clock, Play, Pause, Reply, Copy, Edit3, Trash2, Pin, Forward, Heart } from 'lucide-react';
import { useChat } from './ChatProvider';
import type { ChatMessage } from '../types';

interface Props {
  msg: ChatMessage;
}

export const MessageBubble: React.FC<Props> = ({ msg }) => {
  const {
    myId, activeContact, reactToMessage, deleteMessage, deleteMessageForEveryone,
    setReplyTo, setEditingMessage, pinMessage, darkMode, dir,
  } = useChat();

  const isMine = msg.senderId === myId;
  const isFailed = msg._failed;
  const isQueued = msg._queued;
  const isDeleted = msg.deletedFor === 'everyone';

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const voiceRef = useRef<HTMLAudioElement>(null);

  // ─── Reactions ───────────────────────────────────────────────────
  const renderReactions = () => {
    const reactions = msg.reactions || {};
    const counts: Record<string, number> = {};
    for (const [, emoji] of Object.entries(reactions)) {
      counts[emoji] = (counts[emoji] || 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    return (
      <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
        {entries.map(([emoji, count]) => (
          <span
            key={emoji}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs ${
              darkMode ? 'bg-gray-700' : 'bg-white shadow-sm border border-gray-200'
            }`}
          >
            <span>{emoji}</span>
            {count > 1 && <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>{count}</span>}
          </span>
        ))}
      </div>
    );
  };

  // ─── Reply preview ───────────────────────────────────────────────
  const renderReplyPreview = () => {
    if (!msg.replyToId) return null;
    // Find replied message in the messages list
    // NOTE: lookup by ID requires messages array from context — placeholder for now
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repliedTo: any = null as any;
    if (!repliedTo) return null;
    return (
      <div className={`mb-1.5 px-2.5 py-1.5 rounded-lg border-s-2 text-xs ${
        isMine
          ? 'bg-orange-700/30 border-orange-300'
          : darkMode ? 'bg-gray-700 border-gray-500' : 'bg-gray-100 border-gray-300'
      }`}>
        <p className={`font-bold ${isMine ? 'text-orange-200' : darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {repliedTo.senderId === myId ? 'أنت' : activeContact?.name}
        </p>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
          {repliedTo.messageType === 'image' ? '📷 صورة' : repliedTo.messageType === 'voice' ? '🎤 صوت' : repliedTo.text?.slice(0, 60)}
        </p>
      </div>
    );
  };

  // ─── Read receipt ────────────────────────────────────────────────
  const renderReceipt = () => {
    if (!isMine || isFailed) return null;
    if (isQueued) return <Clock className="w-3 h-3 text-yellow-400" />;
    if (msg.read) return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    if (msg.delivered) return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
    return <Check className="w-3 h-3 text-gray-400" />;
  };

  // ─── Bubble classes ──────────────────────────────────────────────
  const bubbleClasses = isFailed
    ? 'bg-red-100 text-red-700 border border-red-200'
    : isQueued
      ? 'bg-yellow-500/80 text-white'
      : isMine
        ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white'
        : darkMode
          ? 'bg-gray-800 text-gray-100'
          : 'bg-white text-gray-900 shadow-sm border border-gray-100';

  // ─── Tail ( Messenger-style corner) ──────────────────────────────
  const tail = isMine ? 'rounded-br-md' : 'rounded-bl-md';

  // ─── Deleted message ─────────────────────────────────────────────
  if (isDeleted) {
    return (
      <div className={`flex ${isMine ? (dir === 'rtl' ? 'justify-start' : 'justify-end') : (dir === 'rtl' ? 'justify-end' : 'justify-start')} my-0.5`}>
        <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${tail} italic w-fit ${
          isMine
            ? 'bg-orange-500/30 text-orange-200'
            : darkMode ? 'bg-gray-800/50 text-gray-500' : 'bg-gray-100 text-gray-400'
        }`}>
          <p className="text-sm">🚫 تم حذف هذه الرسالة</p>
        </div>
      </div>
    );
  }

  // ─── Context menu ────────────────────────────────────────────────
  const renderContextMenu = () => {
    if (!showContextMenu) return null;
    const menuItems = [
      { icon: Reply, label: 'رد', action: () => { setReplyTo(msg); setShowContextMenu(false); } },
      { icon: Heart, label: 'تفاعل', action: () => { setShowReactionPicker(true); setShowContextMenu(false); } },
      { icon: Copy, label: 'نسخ', action: () => { navigator.clipboard?.writeText(msg.text); setShowContextMenu(false); } },
      { icon: Pin, label: msg.isPinned ? 'إلغاء التثبيت' : 'تثبيت', action: () => { pinMessage(msg.id); setShowContextMenu(false); } },
      ...(isMine ? [{ icon: Edit3, label: 'تعديل', action: () => { setEditingMessage(msg); setShowContextMenu(false); } }] : []),
      ...(isMine ? [{ icon: Trash2, label: 'حذف للجميع', action: () => { deleteMessageForEveryone(msg.id); setShowContextMenu(false); }, danger: true }] : []),
      { icon: Trash2, label: 'حذف', action: () => { deleteMessage(msg.id); setShowContextMenu(false); }, danger: true },
      { icon: Forward, label: 'إعادة توجيه', action: () => { setShowContextMenu(false); } },
    ];

    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40" onClick={() => setShowContextMenu(false)} />
        {/* Menu */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`fixed z-50 rounded-xl shadow-2xl border overflow-hidden py-1 min-w-[180px] ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
          style={{
            left: Math.min(window.innerWidth / 2 - 90, window.innerWidth - 200),
            top: window.innerHeight / 3,
          }}
        >
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </motion.div>
      </>
    );
  };

  // ─── Reaction picker ─────────────────────────────────────────────
  const REACTIONS = ['❤️', '😂', '👍', '🔥', '🎉', '🙏'];
  const renderReactionPicker = () => {
    if (!showReactionPicker) return null;
    return (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setShowReactionPicker(false)} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className={`fixed z-50 flex gap-1 p-2 rounded-full shadow-2xl ${
            darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
          }`}
          style={{
            left: Math.min(window.innerWidth / 2 - 120, window.innerWidth - 250),
            top: window.innerHeight / 3 - 60,
          }}
        >
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => { reactToMessage(msg.id, emoji); setShowReactionPicker(false); }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-90 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      </>
    );
  };

  // ─── Long-press handlers ─────────────────────────────────────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setShowContextMenu(true), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  const handleTouchMove = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // ─── Voice player ────────────────────────────────────────────────
  const togglePlayVoice = () => {
    if (!voiceRef.current) return;
    if (isPlayingVoice) {
      voiceRef.current.pause();
    } else {
      voiceRef.current.play();
    }
    setIsPlayingVoice(!isPlayingVoice);
  };

  return (
    <div className={`flex ${isMine ? (dir === 'rtl' ? 'justify-start' : 'justify-end') : (dir === 'rtl' ? 'justify-end' : 'justify-start')} my-0.5`}>
      <div className={`max-w-[78%] ${isMine ? 'self-end items-end' : 'self-start items-start'} flex flex-col`} style={{ alignItems: isMine ? (dir === 'rtl' ? 'flex-start' : 'flex-end') : (dir === 'rtl' ? 'flex-end' : 'flex-start') }}>
        <motion.div
          initial={{ opacity: 0, y: 5, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          className={`relative px-3.5 py-2 rounded-2xl ${tail} ${bubbleClasses} w-fit ${
            msg.messageType === 'image' ? 'p-1' : ''
          }`}
          onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          onDoubleClick={() => setReplyTo(msg)}
          style={{ cursor: 'pointer' }}
        >
          {/* Reply preview */}
          {renderReplyPreview()}

          {/* Image message */}
          {msg.messageType === 'image' && msg.imageUrl && (
            <img
              src={msg.imageUrl}
              alt=""
              className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer"
              onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-image-preview', { detail: { url: msg.imageUrl } }))}
            />
          )}

          {/* Voice message */}
          {msg.messageType === 'voice' && msg.voiceUrl && (
            <div className="flex items-center gap-2 py-1 min-w-[160px]">
              <button
                onClick={togglePlayVoice}
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isMine ? 'bg-white/20' : darkMode ? 'bg-gray-700' : 'bg-gray-100'
                }`}
              >
                {isPlayingVoice ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <div className="flex-1">
                {/* Simple waveform placeholder */}
                <div className={`flex items-center gap-0.5 h-6 ${isMine ? 'text-white/70' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 rounded-full bg-current"
                      style={{ height: `${Math.sin(i * 0.5) * 50 + 50}%` }}
                    />
                  ))}
                </div>
                <span className={`text-[10px] ${isMine ? 'text-white/70' : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {Math.floor((msg.voiceDuration || 0) / 60)}:{String((msg.voiceDuration || 0) % 60).padStart(2, '0')}
                </span>
              </div>
              <audio
                ref={voiceRef}
                src={msg.voiceUrl}
                onEnded={() => setIsPlayingVoice(false)}
                onPlay={() => setIsPlayingVoice(true)}
                onPause={() => setIsPlayingVoice(false)}
              />
            </div>
          )}

          {/* Text message */}
          {msg.messageType !== 'image' && msg.messageType !== 'voice' && msg.text && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ direction: dir }}>
              {msg.text}
            </p>
          )}

          {/* Footer: time + receipt */}
          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {msg.isEdited && (
              <span className={`text-[9px] ${isMine ? 'text-white/60' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                معدّل
              </span>
            )}
            <span className={`text-[9px] ${isMine ? 'text-white/70' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
            {renderReceipt()}
          </div>
        </motion.div>

        {/* Reactions (below bubble) */}
        {renderReactions()}
      </div>

      {renderContextMenu()}
      {renderReactionPicker()}
    </div>
  );
};
