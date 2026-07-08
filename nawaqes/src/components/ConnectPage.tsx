// ─── Connect Page (Friends Chat — simple, inside PageLayout) ────────
// A clean, simple chat page that fits inside the standard PageLayout
// (same frame as /wallet, /market, etc.) — no full-screen fixed layout.
//
// Layout:
//   - Desktop: 2-column grid (contacts list | chat window)
//   - Mobile: 1-column — list, tap to open chat (back button returns to list)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import {
  Send, ArrowRight, Search, MessageCircle, Users,
  ImageIcon, Loader2, Phone, Video, MoreVertical, X,
  User, Ban, Trash2,
} from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage?: string;
  lastTime?: string;
  unread?: number;
  online?: boolean;
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  messageType?: string;
  imageUrl?: string;
  timestamp: string;
  read?: boolean;
}

export const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { darkMode, isUserOnlineWs } = useAppContext();
  const { dir } = useLanguage();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // text state removed — using uncontrolled input (ref-based) to prevent
  // keyboard flicker on Android WebView during send
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Theme
  const bg = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200';
  const bubbleMine = 'bg-gradient-to-br from-orange-500 to-amber-500 text-white';
  const bubbleTheirs = darkMode ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-900 border border-gray-200';

  // Load contacts
  const loadContacts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getChatContacts();
      const mapped: Contact[] = (data || []).map((c: any) => ({
        id: c.id || c.userId,
        name: c.name,
        avatar: c.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.id || c.userId}`,
        lastMessage: c.lastMessage || '',
        lastTime: c.lastTime || c.lastMessageTime || '',
        unread: c.unread || 0,
        online: isUserOnlineWs(c.id || c.userId),
      }));
      setContacts(mapped);
    } catch (err: any) {
      console.error('Failed to load contacts:', err);
      toast.error('فشل تحميل جهات الاتصال');
    } finally {
      setLoading(false);
    }
  }, [isUserOnlineWs]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Load messages when contact selected
  const loadMessages = useCallback(async (contactId: string) => {
    try {
      setLoadingMessages(true);
      const data = await api.getChatMessages(contactId);
      setMessages(data || []);
      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Failed to load messages:', err);
      toast.error('فشل تحميل الرسائل');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.id);
    } else {
      setMessages([]);
    }
  }, [selectedContact, loadMessages]);

  // WebSocket: receive new messages in real-time
  useWebSocket({
    onChatMessage: (msg: any) => {
      // If message is for current conversation, add it
      if (selectedContact && (
        msg.senderId === selectedContact.id ||
        msg.receiverId === selectedContact.id
      )) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
      // Update contacts list (last message + unread)
      setContacts(prev => prev.map(c => {
        if (c.id === msg.senderId || c.id === msg.receiverId) {
          return {
            ...c,
            lastMessage: msg.text || (msg.messageType === 'image' ? '📷 صورة' : ''),
            lastTime: msg.timestamp,
            unread: msg.senderId === c.id ? (c.unread || 0) + 1 : c.unread,
          };
        }
        return c;
      }));
    },
  });

  // Send message
  // 🔧 CRITICAL: Use uncontrolled input pattern to prevent keyboard from
  // closing on mobile. The `text` state is only used for disabling the
  // send button (empty check), NOT for controlling the input value.
  // The input's value is read directly from the DOM via textInputRef.
  //
  // 🔧 ADDITIONAL FIX for Android WebView: The keyboard flickers because
  // setSending(true/false) causes re-renders. To prevent this:
  // 1. Don't use setSending at all during normal send (only on error)
  // 2. Use a ref to track sending state (no re-render)
  // 3. Aggressively re-focus the input multiple times
  const sendingRef = useRef(false);

  const handleSend = async () => {
    if (!selectedContact || sendingRef.current) return;
    const input = textInputRef.current;
    if (!input) return;
    const textToSend = input.value.trim();
    if (!textToSend) return;

    // Mark as sending via ref (no re-render, no keyboard flicker)
    sendingRef.current = true;

    // Clear the input IMMEDIATELY via DOM (no React state change at all)
    input.value = '';

    // 🔧 AGGRESSIVE FOCUS: Focus the input multiple times to force the
    // keyboard to stay open. On Android WebView, a single focus() call
    // right after clearing the input is sometimes not enough because the
    // browser hasn't finished processing the input event. We use a
    // combination of immediate focus + microtask + animation frame.
    input.focus();
    queueMicrotask(() => input.focus());

    try {
      const msg = await api.sendMessage(selectedContact.id, textToSend);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id
          ? { ...c, lastMessage: textToSend, lastTime: new Date().toISOString() }
          : c
      ));
    } catch (err: any) {
      toast.error(err.message || 'فشل إرسال الرسالة');
      // Restore the text on error
      input.value = textToSend;
      // Show sending state only on error (for visual feedback)
      setSending(true);
      setTimeout(() => setSending(false), 1000);
    } finally {
      sendingRef.current = false;
      // 🔧 FINAL FOCUS: Re-focus after everything settles to ensure
      // keyboard is visible. Use multiple frames to cover all timing.
      requestAnimationFrame(() => {
        input.focus();
        requestAnimationFrame(() => input.focus());
      });
    }
  };

  // Image upload
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedContact) return;
    try {
      setSending(true);
      const { url } = await api.uploadChatImage(file);
      const msg = await api.sendMessage(selectedContact.id, '', undefined, 'image', url);
      setMessages(prev => [...prev, msg]);
      setContacts(prev => prev.map(c =>
        c.id === selectedContact.id
          ? { ...c, lastMessage: '📷 صورة', lastTime: new Date().toISOString() }
          : c
      ));
    } catch (err: any) {
      toast.error(err.message || 'فشل رفع الصورة');
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filter contacts by search
  const filteredContacts = contacts.filter(c =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format time
  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins} د`;
    if (diffHours < 24) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'أمس';
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' });
  };

  return (
    <div className={`w-full ${bg} rounded-2xl border ${darkMode ? 'border-gray-700' : 'border-gray-200'} overflow-hidden flex flex-col`} dir={dir} style={{ height: 'calc(100vh - 160px)', minHeight: '400px' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] flex-1 min-h-0">
        {/* ─── Contacts List ─── */}
        <div className={`border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex flex-col ${selectedContact ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header */}
          <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-xl font-black ${textPrimary} flex items-center gap-2`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                تواصل
              </h2>
              <button
                onClick={loadContacts}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} ${textMuted}`}
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
            {/* Search */}
            <div className={`relative`}>
              <Search className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'right-3' : 'left-3'} w-4 h-4 ${textMuted}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن صديق..."
                className={`w-full py-2 pr-10 pl-3 rounded-xl border ${inputBg} ${textPrimary} text-sm outline-none focus:ring-2 focus:ring-orange-500/50`}
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <Users className={`w-10 h-10 ${textMuted}`} />
                </div>
                <p className={`font-bold ${textPrimary}`}>
                  {searchQuery ? 'لا توجد نتائج' : 'لا يوجد أصدقاء بعد'}
                </p>
                <p className={`text-sm mt-1 ${textMuted}`}>
                  {searchQuery ? 'جرّب اسماً آخر' : 'أضف أصدقاء من صفحة الأصدقاء'}
                </p>
              </div>
            ) : (
              filteredContacts.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={`w-full flex items-center gap-3 p-3 transition-colors text-start ${
                    selectedContact?.id === contact.id
                      ? (darkMode ? 'bg-gray-700' : 'bg-orange-50')
                      : (darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50')
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <img
                      src={contact.avatar}
                      alt={contact.name}
                      className="w-12 h-12 rounded-full object-cover bg-gray-200"
                      onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.id}`; }}
                    />
                    {contact.online && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold text-sm truncate ${textPrimary}`}>
                        {contact.name}
                      </span>
                      {contact.lastTime && (
                        <span className={`text-[10px] flex-shrink-0 ${contact.unread ? 'text-orange-500 font-bold' : textMuted}`}>
                          {formatTime(contact.lastTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-xs truncate ${(contact.unread || 0) > 0 ? (darkMode ? 'text-gray-200 font-medium' : 'text-gray-700 font-medium') : textMuted}`}>
                        {contact.lastMessage || 'لا توجد رسائل'}
                      </p>
                      {(contact.unread || 0) > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {(contact.unread || 0) > 99 ? '99+' : contact.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ─── Chat Window ─── */}
        <div className={`flex flex-col ${selectedContact ? 'flex' : 'hidden lg:flex'} min-h-0`}>
          {selectedContact ? (
            <>
              {/* Chat header — STICKY, always visible */}
              <div className={`flex items-center gap-2 sm:gap-3 p-3 border-b flex-shrink-0 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                <button
                  onClick={() => setSelectedContact(null)}
                  className={`lg:hidden w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <ArrowRight className={`w-5 h-5 ${textPrimary} ${dir === 'rtl' ? '' : 'rotate-180'}`} />
                </button>
                <div className="relative flex-shrink-0">
                  <img
                    src={selectedContact.avatar}
                    alt={selectedContact.name}
                    className="w-10 h-10 rounded-full object-cover bg-gray-200"
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedContact.id}`; }}
                  />
                  {selectedContact.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <h3 className={`font-bold text-base ${textPrimary} truncate`}>{selectedContact.name}</h3>
                  <p className={`text-xs ${selectedContact.online ? 'text-green-500' : textMuted} truncate`}>
                    {selectedContact.online ? 'متصل الآن' : 'غير متصل'}
                  </p>
                </div>
                {/* Action buttons — hidden on small screens to give name more space */}
                <button className={`hidden md:flex w-9 h-9 rounded-full items-center justify-center flex-shrink-0 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} ${textMuted}`}>
                  <Phone className="w-5 h-5" />
                </button>
                <button className={`hidden md:flex w-9 h-9 rounded-full items-center justify-center flex-shrink-0 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} ${textMuted}`}>
                  <Video className="w-5 h-5" />
                </button>
                {/* Menu button with dropdown */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setShowMenu(v => !v)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} ${textMuted}`}
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  <AnimatePresence>
                    {showMenu && (
                      <>
                        {/* Backdrop to close menu on outside click */}
                        <div className="fixed inset-0 z-[200]" onClick={() => setShowMenu(false)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -5 }}
                          transition={{ duration: 0.15 }}
                          className={`absolute top-10 ${dir === 'rtl' ? 'left-0' : 'right-0'} z-[201] w-44 rounded-xl shadow-xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                        >
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              navigate(`/user/${selectedContact.id}`);
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'}`}
                          >
                            <User className="w-4 h-4" />
                            عرض الملف الشخصي
                          </button>
                          <button
                            onClick={async () => {
                              setShowMenu(false);
                              try {
                                await api.blockUser(selectedContact.id);
                                toast.success('تم حظر المستخدم');
                                setSelectedContact(null);
                              } catch (err: any) {
                                toast.error(err.message || 'فشل الحظر');
                              }
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                          >
                            <Ban className="w-4 h-4" />
                            حظر المستخدم
                          </button>
                          <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />
                          <button
                            onClick={() => {
                              setShowMenu(false);
                              if (confirm('هل تريد مسح جميع الرسائل في هذه المحادثة؟')) {
                                setMessages([]);
                                toast.success('تم مسح الرسائل');
                              }
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors ${darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                          >
                            <Trash2 className="w-4 h-4" />
                            مسح الرسائل
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Messages — scrollable area */}
              <div className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {loadingMessages ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${darkMode ? 'bg-gray-800' : 'bg-white shadow-sm'}`}>
                      <MessageCircle className={`w-8 h-8 ${textMuted}`} />
                    </div>
                    <p className={`text-sm font-bold ${textPrimary}`}>ابدأ المحادثة</p>
                    <p className={`text-xs mt-1 ${textMuted}`}>أرسل أول رسالة إلى {selectedContact.name}</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMine = msg.senderId === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                            isMine
                              ? `${bubbleMine} rounded-br-md`
                              : `${bubbleTheirs} rounded-bl-md`
                          }`}
                        >
                          {msg.imageUrl && (
                            <img
                              src={msg.imageUrl.startsWith('http') ? msg.imageUrl : `${window.location.origin}${msg.imageUrl}`}
                              alt="image"
                              className="rounded-xl max-w-full max-h-64 mb-1 object-cover cursor-pointer"
                              onClick={() => window.open(msg.imageUrl!.startsWith('http') ? msg.imageUrl! : `${window.location.origin}${msg.imageUrl!}`, '_blank')}
                            />
                          )}
                          {msg.text && (
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                          )}
                          <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : textMuted}`}>
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input — FIXED at bottom, always visible above keyboard */}
              <div className={`p-2 sm:p-3 border-t flex-shrink-0 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                <form
                  onSubmit={e => { e.preventDefault(); handleSend(); }}
                  className="flex items-center gap-1.5 sm:gap-2"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    title="إرسال صورة"
                    className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} disabled:opacity-50 transition-colors`}
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <input
                    ref={textInputRef}
                    type="text"
                    defaultValue=""
                    placeholder="اكتب رسالة..."
                    disabled={sending}
                    enterKeyHint="send"
                    autoComplete="off"
                    autoCapitalize="off"
                    className={`flex-1 min-w-0 py-2.5 px-4 rounded-full border ${inputBg} ${textPrimary} text-sm outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50`}
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    title="إرسال"
                    className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-50 disabled:active:scale-100 transition-transform shadow-md shadow-orange-500/30"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className={`w-5 h-5 ${dir === 'rtl' ? 'rotate-180' : ''}`} />}
                  </button>
                </form>
              </div>
            </>
          ) : (
            // Empty state (desktop)
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <MessageCircle className={`w-10 h-10 ${textMuted}`} />
                </div>
                <p className={`text-lg font-bold ${textPrimary}`}>تواصل مع أصدقائك</p>
                <p className={`text-sm mt-1 ${textMuted}`}>اختر صديقاً لبدء المراسلة</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
