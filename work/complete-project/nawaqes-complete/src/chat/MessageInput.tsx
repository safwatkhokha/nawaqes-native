// ─── Message Input (Messenger-style composer) ───────────────────────
// Features:
//   • Pill-shaped container with attach + textarea + emoji + send/mic inside
//   • Textarea with fixed height (44px) + internal scroll for long text
//   • Reply preview bar above input (when replying)
//   • Edit mode bar (when editing a message)
//   • Recording UI (timer + cancel/send buttons)
//   • Emoji quick-picker (collapsible)
//   • Enter to send, Shift+Enter for newline
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from './ChatProvider';
import {
  Send, Image as ImageIcon, Mic, Square, Smile, X, Reply, Edit3,
  Trash2, Paperclip, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😢', '😮', '💪', '👏', '😍'];

export const MessageInput: React.FC = () => {
  const {
    draftText, setDraftText, sendMessage, uploadingImage, sendImage,
    replyTo, setReplyTo, editingMessage, setEditingMessage,
    isRecording, startRecording, stopRecording, recordingSeconds,
    activeConversationId, myId, activeContact, darkMode, dir,
  } = useChat();

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = draftText.trim() && activeConversationId && !isRecording;

  // Theme
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border = darkMode ? 'border-gray-800' : 'border-gray-200';
  const inputBg = darkMode ? 'bg-gray-800' : 'bg-gray-100';
  const cardBg = darkMode ? 'bg-gray-900' : 'bg-white';

  // ─── Emoji insert ────────────────────────────────────────────────
  const insertEmoji = (emoji: string) => {
    setDraftText(draftText + emoji);
    setShowEmojiPicker(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // ─── Format recording time ───────────────────────────────────────
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ─── Image upload ────────────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendImage(file);
    e.target.value = '';
    setShowAttachMenu(false);
  };

  // ─── Edit mode ───────────────────────────────────────────────────
  if (editingMessage) {
    return (
      <div className={`border-t ${border} ${cardBg}`}>
        {/* Edit header */}
        <div className="px-4 py-2 flex items-center gap-3">
          <div className="w-1 h-8 rounded-full bg-orange-500" />
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold ${textPrimary}`}>تعديل الرسالة</p>
            <p className={`text-xs truncate ${textMuted}`}>
              {editingMessage.text?.slice(0, 60)}
              {editingMessage.text?.length > 60 ? '...' : ''}
            </p>
          </div>
          <button
            onClick={() => setEditingMessage(null)}
            className={`w-7 h-7 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
          >
            <X className={`w-4 h-4 ${textMuted}`} />
          </button>
        </div>
        {/* Edit input */}
        <div className={`px-3 py-2.5 pb-3`}>
          <div className={`flex items-center gap-2 rounded-3xl ${inputBg} px-3 py-1`}>
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
                if (e.key === 'Escape') setEditingMessage(null);
              }}
              placeholder="عدّل الرسالة..."
              rows={1}
              className={`flex-1 bg-transparent border-none outline-none resize-none text-sm py-2.5 ${textPrimary} placeholder:${textMuted}`}
              style={{ direction: dir, height: 44, maxHeight: 44, overflowY: 'auto' }}
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={!draftText.trim()}
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                draftText.trim()
                  ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white active:scale-95'
                  : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
              }`}
            >
              <Send className={`w-4 h-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Recording mode ──────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className={`px-3 py-2.5 pb-3 border-t ${border} ${cardBg}`}>
        <div className={`flex items-center gap-3 rounded-3xl ${inputBg} px-4 py-2.5`}>
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className={`text-sm font-bold text-red-500 flex-shrink-0`}>
            يسجّل… {fmtTime(recordingSeconds)}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => stopRecording(false)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}
          >
            إلغاء
          </button>
          <button
            onClick={() => stopRecording(true)}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center active:scale-95"
          >
            <Send className={`w-4 h-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
    );
  }

  // ─── Normal input ────────────────────────────────────────────────
  return (
    <div className={`border-t ${border} ${cardBg}`}>
      {/* Reply preview bar */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-orange-500" />
              <Reply className={`w-4 h-4 ${textMuted} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-bold ${textPrimary}`}>
                  رد على {replyTo.senderId === myId ? 'نفسك' : activeContact?.name}
                </p>
                <p className={`text-xs truncate ${textMuted}`}>
                  {replyTo.messageType === 'image' ? '📷 صورة' : replyTo.messageType === 'voice' ? '🎤 صوت' : replyTo.text?.slice(0, 50)}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className={`w-7 h-7 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-4 h-4 ${textMuted}`} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className={`flex flex-wrap gap-1 p-2 ${inputBg}`}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => insertEmoji(emoji)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-black/10 dark:hover:bg-white/10 active:scale-90 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input pill */}
      <div className="px-2.5 py-2 pb-3">
        <div className={`flex items-center gap-1 rounded-3xl ${inputBg} px-2 py-1`}>
          {/* Attach button */}
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'}`}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className={`absolute bottom-11 left-0 rounded-xl shadow-xl border overflow-hidden py-1 min-w-[160px] z-50 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                  onClick={() => setShowAttachMenu(false)}
                >
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm ${darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <ImageIcon className="w-4 h-4 text-green-500" />
                    صورة
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm ${darkMode ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <Paperclip className="w-4 h-4 text-blue-500" />
                    ملف
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) sendMessage();
              }
            }}
            placeholder="اكتب رسالة..."
            rows={1}
            className={`flex-1 bg-transparent border-none outline-none resize-none text-sm py-2.5 min-w-0 ${textPrimary} placeholder:${textMuted}`}
            style={{ direction: dir, height: 44, maxHeight: 44, overflowY: 'auto', fontFamily: 'inherit', lineHeight: '1.4' }}
          />

          {/* Emoji button */}
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              showEmojiPicker
                ? darkMode ? 'bg-gray-700 text-orange-400' : 'bg-gray-200 text-orange-500'
                : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Send / Mic button */}
          {canSend ? (
            <button
              onClick={sendMessage}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-orange-500 to-amber-500 text-white active:scale-95 transition-transform"
              style={{ boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)' }}
            >
              {uploadingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className={`w-5 h-5 ${dir === 'rtl' ? 'rotate-180' : ''}`} />}
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={!activeConversationId}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                !activeConversationId
                  ? darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'
                  : darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
