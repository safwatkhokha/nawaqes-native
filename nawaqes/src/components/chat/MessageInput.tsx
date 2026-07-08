import React, { useEffect, useState, useRef } from 'react';
import { Send, Image as ImageIcon, RefreshCw, X, Mic, Square, Smile, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

// ─── MessageInput — redesigned v2 ────────────────────────────────────
// Old design: a single-line <input> crammed between an attach button and
// a mic/send button in a single row. The input was tiny (py-2.5 = 10px
// padding), single-line, and felt cramped — especially when typing long
// messages on mobile.
//
// New design (WhatsApp / Telegram style):
//   • Multi-line <textarea> that auto-grows (max ~120px) so the user can
//     see their whole message as they type.
//   • The attach (📎) button sits INSIDE the input pill, on the leading
//     edge — so the input takes the full width and the attach button
//     doesn't compete for space.
//   • The send / mic button sits INSIDE the input pill on the trailing
//     edge — same reason.
//   • Emoji button (😊) inside the pill too, so all input-related actions
//     are in one place.
//   • Rounded pill shape (rounded-3xl) with comfortable padding (px-4
//     py-3) — feels spacious on mobile.
//   • Reply / edit / recording bars appear ABOVE the pill and are clearly
//     separated by a border-t.
export const MessageInput: React.FC = () => {
  const {
    messageText, setMessageText, sendMessage, sendingMessage,
    uploadingImage, handleImageUpload, replyToMessage, setReplyToMessage,
    myId, imageInputRef, selectedContactId,
    editingMessage, setEditingMessage, handleEditMessage,
    isRecording, startRecording, stopRecording,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const [editText, setEditText] = useState('');
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState<ReturnType<typeof setInterval> | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync editText when editingMessage changes
  useEffect(() => {
    if (editingMessage) {
      setEditText(editingMessage.text);
      // Focus + auto-resize the edit textarea on next tick
      setTimeout(() => {
        if (editTextareaRef.current) {
          editTextareaRef.current.focus();
          autoResizeTextarea(editTextareaRef.current);
        }
      }, 50);
    }
  }, [editingMessage]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingTimer(timer);
    } else {
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
      setRecordingTime(0);
    }
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-resize textarea ─────────────────────────────────────────
  // Grows with content up to max-height, then scrolls internally. This is
  // the key UX improvement: the user can see their whole message instead
  // of it being clipped to a single line.
  // 🔧 FIX v3: previously rows={1} + auto-resize started at ~24px which
  // felt cramped. Now we set a min-height of 40px (via the rows attribute
  // + line-height) so the input is comfortably tappable even when empty,
  // and grows from there.
  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    // Reset to auto so scrollHeight measures the actual content height
    el.style.height = 'auto';
    // Min 40px (so empty input is still comfortably tappable), max 140px
    // (~6 lines) so it doesn't take over the whole screen on long messages.
    el.style.height = Math.max(40, Math.min(el.scrollHeight, 140)) + 'px';
  };

  // Auto-resize on messageText change
  useEffect(() => {
    autoResizeTextarea(textareaRef.current);
  }, [messageText]);

  const canSend = messageText.trim() && !sendingMessage && myId && selectedContactId && !isRecording;
  const canEdit = editText.trim() && editingMessage;

  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ─── Quick emoji set (no full picker — just the most common ones) ─
  const QUICK_EMOJIS = ['😀', '😂', '❤️', '👍', '🙏', '🔥', '🎉', '😢', '😮', '💪', '👏', '😍'];

  const insertEmoji = (emoji: string) => {
    setMessageText(prev => prev + emoji);
    setShowEmojiPicker(false);
    // Focus back to textarea after picking
    setTimeout(() => {
      textareaRef.current?.focus();
      // Move cursor to end
      const el = textareaRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 0);
  };

  // ─── Edit mode bar ──────────────────────────────────────────────
  const renderEditMode = () => (
    <div className={`border-t ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-gray-50'}`}>
      {/* Edit preview header */}
      <div className="px-4 py-2 flex items-center gap-3">
        <div className="w-1 h-8 rounded-full bg-orange-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold ${textSecondary}`}>
            {t('messages.editMessage')}
          </p>
          <p className={`text-xs truncate ${textMuted}`}>
            {(editingMessage?.text || '').length > 50 ? (editingMessage?.text || '').slice(0, 50) + '...' : editingMessage?.text || ''}
          </p>
        </div>
        <button
          onClick={() => setEditingMessage(null)}
          className={`p-1.5 rounded-full flex-shrink-0 transition-colors ${
            darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
          }`}
          aria-label="إلغاء التعديل"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {/* Edit input — same pill style as the main input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit) handleEditMessage(editingMessage.id, editText);
        }}
        className={`px-3 py-2.5 pb-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
      >
        <div className={`flex items-end gap-2 rounded-3xl border transition-colors ${
          darkMode
            ? 'bg-gray-700 border-gray-600 focus-within:border-orange-500'
            : 'bg-gray-100 border-gray-200 focus-within:border-orange-400'
        } px-2 py-1.5`}>
          <textarea
            ref={editTextareaRef}
            placeholder={t('messages.editMessage')}
            value={editText}
            onChange={e => {
              setEditText(e.target.value);
              autoResizeTextarea(editTextareaRef.current);
            }}
            onKeyDown={e => {
              // Enter to send (without shift)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canEdit) handleEditMessage(editingMessage.id, editText);
              }
            }}
            rows={1}
            className={`flex-1 bg-transparent border-none outline-none resize-none text-base py-2.5 px-2 max-h-[140px] min-h-[40px] min-w-0 leading-relaxed ${
              darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
            }`}
            style={{ direction: dir, height: '40px' }}
          />
          <button
            type="submit"
            disabled={!canEdit}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 ${
              canEdit
                ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 shadow-sm shadow-orange-500/30'
                : (darkMode ? 'bg-gray-600 text-gray-500' : 'bg-gray-200 text-gray-400')
            }`}
            aria-label="حفظ التعديل"
          >
            <Send className={`w-4 h-4 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </form>
    </div>
  );

  // ─── Recording indicator ──────────────────────────────────────────
  const renderRecordingIndicator = () => (
    <div className={`flex items-center gap-3 flex-1 px-2 ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
      <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
      <span className="text-sm font-bold">{t('messages.recording')}</span>
      <span className="text-sm font-mono">{formatRecordingTime(recordingTime)}</span>
      <span className={`text-[10px] ${textMuted}`}>({t('messages.slideToCancel', 'اسحب للإلغاء')})</span>
    </div>
  );

  // ─── Normal input (the redesigned pill) ──────────────────────────
  const renderNormalInput = () => (
    <form
      onSubmit={(e) => sendMessage(e)}
      className={`px-2.5 py-2 pb-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
    >
      {/* Hidden file input for image upload */}
      <input
        id="chat-image-input"
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.avif,.heic,.heif,.ico,.jfif,.mp4,.webm,.mov,.avi,.3gp,.mkv,.flv,.wmv,.m4v,.ogg,.mpeg,.mpg,.ts,.m2ts,.vob,.asf,.rm,.rmvb,.divx,.xvid"
        className="sr-only"
        onChange={handleImageUpload}
      />

      {/* Quick emoji picker (collapsible) */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className={`flex flex-wrap gap-1 p-2 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xl hover:bg-black/10 dark:hover:bg-white/10 transition-colors active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The input pill — attach + textarea + emoji + send/mic all inside */}
      <div className={`flex items-end gap-1 rounded-3xl border transition-colors ${
        darkMode
          ? 'bg-gray-700 border-gray-600 focus-within:border-orange-500'
          : 'bg-gray-100 border-gray-200 focus-within:border-orange-400'
      } px-2 py-1`}>
        {/* 📎 Attach button (leading edge) */}
        <label
          htmlFor="chat-image-input"
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 ${
            uploadingImage
              ? (darkMode ? 'text-gray-500' : 'text-gray-400')
              : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200')
          }`}
          title={t('messages.sendImage')}
          style={{ cursor: uploadingImage ? 'not-allowed' : 'pointer', opacity: uploadingImage ? 0.5 : 1 }}
        >
          {uploadingImage ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
        </label>

        {/* 📝 Textarea — multi-line, auto-growing */}
        <textarea
          ref={textareaRef}
          placeholder={t('messages.typeMessage')}
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          onKeyDown={e => {
            // Enter to send (without shift) — desktop shortcut
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) sendMessage(e as any);
            }
          }}
          disabled={sendingMessage}
          rows={1}
          className={`flex-1 bg-transparent border-none outline-none resize-none text-base py-2.5 px-2 max-h-[140px] min-h-[40px] min-w-0 leading-relaxed ${
            darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
          } disabled:opacity-50`}
          style={{ direction: dir, height: '40px' }}
        />

        {/* 😊 Emoji button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(s => !s)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 ${
            showEmojiPicker
              ? (darkMode ? 'bg-gray-600 text-orange-400' : 'bg-gray-200 text-orange-600')
              : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200')
          }`}
          title="رموز تعبيرية"
          aria-label="رموز تعبيرية"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* 🎤 Mic / 📤 Send button (trailing edge) — swaps based on state */}
        {isRecording ? (
          <button
            type="button"
            onClick={stopRecording}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-sm shadow-red-500/30"
            title={t('messages.stopRecording', 'إيقاف التسجيل')}
            aria-label="إيقاف التسجيل"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        ) : canSend ? (
          <button
            type="submit"
            disabled={!canSend}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 ${
              canSend
                ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 active:scale-95 shadow-sm shadow-orange-500/30'
                : (darkMode ? 'bg-gray-600 text-gray-500' : 'bg-gray-200 text-gray-400')
            }`}
            aria-label="إرسال"
          >
            {sendingMessage ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Send className={`w-5 h-5 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            disabled={sendingMessage || !selectedContactId}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5 ${
              sendingMessage || !selectedContactId
                ? (darkMode ? 'bg-gray-600 text-gray-500' : 'bg-gray-200 text-gray-400')
                : (darkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200')
            }`}
            title={t('messages.voiceMessage')}
            aria-label="رسالة صوتية"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </form>
  );

  // ─── Recording mode ─────────────────────────────────────────────────
  if (isRecording) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 pb-3 border-t ${
        darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-gray-50'
      }`}>
        {renderRecordingIndicator()}
        <button
          onClick={stopRecording}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-sm shadow-red-500/30"
          aria-label="إيقاف وإرسال"
        >
          <Send className={`w-5 h-5 ${dir === 'rtl' ? 'rotate-180' : ''}`} />
        </button>
      </div>
    );
  }

  // ─── Edit mode ──────────────────────────────────────────────────────
  if (editingMessage) {
    return renderEditMode();
  }

  // ─── Normal mode ────────────────────────────────────────────────────
  return (
    <>
      {/* Reply Preview Bar */}
      <AnimatePresence>
        {replyToMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`overflow-hidden border-t ${
              darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-gray-50'
            }`}
          >
            <div className="px-4 py-2 flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-orange-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-bold ${textSecondary}`}>
                  {t('messages.replyTo')} {replyToMessage.senderId === myId ? t('common.you') : (ctx as any).selectedContact?.name}
                </p>
                <p className={`text-xs truncate ${textMuted}`}>
                  {replyToMessage.messageType === 'image'
                    ? '📷 ' + t('messages.imageSent')
                    : replyToMessage.messageType === 'voice'
                      ? '🎤 ' + t('messages.voiceMessage')
                      : replyToMessage.text.length > 50 ? replyToMessage.text.slice(0, 50) + '...' : replyToMessage.text}
                </p>
              </div>
              <button
                onClick={() => setReplyToMessage(null)}
                className={`p-1.5 rounded-full flex-shrink-0 transition-colors ${
                  darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
                }`}
                aria-label="إلغاء الرد"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {renderNormalInput()}
    </>
  );
};
