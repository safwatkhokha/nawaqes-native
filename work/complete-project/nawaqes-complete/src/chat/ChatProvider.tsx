// ─── Chat Provider (Messenger-style + Nawaqes identity) ────────────
// Central state manager for the entire chat system. Handles:
//   • Conversations list + active conversation
//   • Messages + real-time updates (WebSocket)
//   • Sending text/image/voice messages
//   • Reactions, replies, edits, deletes, pin, forward
//   • Recording state + typing indicators
//   • Online/offline queue (sends when WS reconnects)
//
// Design philosophy:
//   - All state lives here so child components stay dumb/presentational.
//   - WebSocket events update state optimistically; REST confirms.
//   - The UI layer (MessageBubble, MessageInput, etc.) only reads from
//     context + calls action functions. No business logic in components.
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import type { ChatMessage, ChatContact } from '../types';

// ─── Types ──────────────────────────────────────────────────────────
interface ChatState {
  // Conversations
  conversations: ChatContact[];
  activeConversationId: string | null;
  activeContact: ChatContact | null;
  loadingConversations: boolean;

  // Messages
  messages: ChatMessage[];
  loadingMessages: boolean;

  // Composing
  draftText: string;
  replyTo: ChatMessage | null;
  editingMessage: ChatMessage | null;

  // Media
  uploadingImage: boolean;
  uploadingFile: boolean;

  // Voice recording
  isRecording: boolean;
  recordingSeconds: number;

  // Typing
  otherUserTyping: boolean;

  // Search
  searchQuery: string;
  messageSearchQuery: string;

  // UI
  showConversationList: boolean; // mobile: show list vs chat
  showContactInfo: boolean;
  showSearch: boolean;

  // Misc
  pinnedMessages: ChatMessage[];
  wsConnected: boolean;
}

interface ChatActions {
  // Conversations
  selectConversation: (id: string | null) => void;
  refreshConversations: () => Promise<void>;

  // Messages
  sendMessage: () => Promise<void>;
  sendImage: (file: File) => Promise<void>;
  sendVoice: (file: File, duration: number) => Promise<void>;
  editMessage: (messageId: string, newText: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  deleteMessageForEveryone: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  pinMessage: (messageId: string) => Promise<void>;
  forwardMessage: (messageId: string, targetId: string, isGroup?: boolean) => Promise<void>;

  // Composing
  setDraftText: (text: string) => void;
  setReplyTo: (msg: ChatMessage | null) => void;
  setEditingMessage: (msg: ChatMessage | null) => void;

  // Recording
  startRecording: () => void;
  stopRecording: (send: boolean) => void;

  // Search
  setSearchQuery: (q: string) => void;
  setMessageSearchQuery: (q: string) => void;

  // UI toggles
  setShowContactInfo: (show: boolean) => void;
  setShowSearch: (show: boolean) => void;

  // Helpers
  startCall: (type: 'audio' | 'video') => void;
}

type ChatContextValue = ChatState & ChatActions & {
  darkMode: boolean;
  dir: 'rtl' | 'ltr';
  myId: string;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
};

const ChatContext = createContext<ChatContextValue | null>(null);
export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};

// ─── Provider ───────────────────────────────────────────────────────
export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { darkMode } = useAppContext();
  const { dir } = useLanguage();
  const myId = currentUser?.id || '';

  // ─── Normalize a raw DB row (snake_case) into ChatMessage (camelCase) ──
  // The backend returns messages with DB column names (created_at,
  // sender_id, message_type, etc.) but the frontend types use camelCase
  // (timestamp, senderId, messageType). Without this normalization,
  // msg.timestamp is undefined → "Invalid Date" in the UI, and
  // msg.senderId is undefined → every incoming message appears as "mine".
  const normalizeMessage = useCallback((raw: any): ChatMessage => {
    if (!raw) return raw;
    // Already normalized (e.g. optimistic messages we created client-side)
    if (raw.timestamp && raw.senderId) return raw as ChatMessage;
    return {
      id: raw.id,
      senderId: raw.sender_id || raw.senderId,
      receiverId: raw.receiver_id || raw.receiverId,
      text: raw.text || '',
      timestamp: raw.created_at || raw.createdAt || raw.timestamp || new Date().toISOString(),
      read: !!(raw.read !== undefined ? raw.read : raw.delivered),
      postId: raw.post_id || raw.postId,
      messageType: raw.message_type || raw.messageType || 'text',
      imageUrl: raw.image_url || raw.imageUrl || (raw.image || ''),
      replyToId: raw.reply_to_id || raw.replyToId,
      reactions: (() => {
        try { return JSON.parse(raw.reactions || '{}'); } catch { return {}; }
      })(),
      deletedFor: raw.deleted_for || raw.deletedFor,
      _failed: raw._failed,
      isEdited: !!(raw.is_edited || raw.isEdited),
      isPinned: !!(raw.is_pinned ?? raw.isPinned),
      delivered: !!(raw.delivered),
      voiceUrl: raw.voice_url || raw.voiceUrl,
      voiceDuration: raw.voice_duration || raw.voiceDuration,
      groupId: raw.group_id || raw.groupId,
      isForwarded: !!(raw.is_forwarded || raw.isForwarded),
      forwardedFrom: raw.forwarded_from || raw.forwardedFrom,
      _queued: raw._queued,
    } as ChatMessage;
  }, []);

  // ── State ────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ChatContact[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [draftText, setDraftText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const [otherUserTyping, setOtherUserTyping] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');

  const [showConversationList, setShowConversationList] = useState(true);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeContact = conversations.find(c => c.id === activeConversationId) || null;

  // ── WebSocket: real-time message updates ─────────────────────────
  const ws = useWebSocket({
    onChatMessage: (data: any) => {
      // New incoming message — normalize from DB snake_case to camelCase
      const normalized = normalizeMessage(data);
      // New incoming message
      if (normalized.receiverId === myId || normalized.groupId === activeConversationId) {
        setMessages(prev => {
          if (prev.some(m => m.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      }
      // Update conversation list (last message + unread)
      setConversations(prev => prev.map(c => {
        if (c.id === normalized.senderId || c.id === normalized.groupId) {
          return {
            ...c,
            lastMessage: normalized.text || (normalized.messageType === 'image' ? '📷 صورة' : normalized.messageType === 'voice' ? '🎤 رسالة صوتية' : ''),
            lastTime: new Date().toISOString(),
            unread: c.id === activeConversationId ? 0 : (c.unread || 0) + 1,
          };
        }
        return c;
      }));
    },
    onChatTyping: (data: any) => {
      if (data.senderId === activeConversationId) {
        setOtherUserTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
      }
    },
    onChatRead: (data: any) => {
      // Mark my messages as read by the other user
      setMessages(prev => prev.map(m =>
        m.receiverId === data.readerId ? { ...m, read: true } : m
      ));
    },
  });

  useEffect(() => { setWsConnected(ws.isConnected); }, [ws.isConnected]);

  // ── Load conversations ───────────────────────────────────────────
  const refreshConversations = useCallback(async () => {
    if (!myId) return;
    setLoadingConversations(true);
    try {
      const data = await api.getChatContacts();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, [myId]);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);

  // ── Select conversation + load messages ──────────────────────────
  const selectConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
    setShowConversationList(id === null);
    setReplyTo(null);
    setEditingMessage(null);
    setOtherUserTyping(false);
    if (id) {
      // Mark as read
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
    } else {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!activeConversationId) { setMessages([]); return; }
    setLoadingMessages(true);
    api.getChatMessages(activeConversationId, { limit: '50' })
      .then((data: any) => {
        const rawMsgs = Array.isArray(data) ? data : (data?.messages || []);
        // Normalize each message from DB snake_case to camelCase
        const msgs = rawMsgs.map((m: any) => normalizeMessage(m));
        setMessages(msgs);
        // Load pinned
        const pinned = msgs.filter((m: ChatMessage) => m.isPinned);
        setPinnedMessages(pinned);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false));
  }, [activeConversationId, normalizeMessage]);

  // ── Auto-scroll to bottom on new messages ────────────────────────
  // 🔧 FIX: use scrollTop on the messages container instead of
  // scrollIntoView. scrollIntoView can cause the ENTIRE page to scroll
  // (including the header + input bar), which makes the input bar
  // appear to "jump down" after each message. By scrolling only the
  // container, the header + input stay fixed in place.
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Send text message ────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = draftText.trim();
    if (!text || !activeConversationId || !myId) return;

    // If editing, do edit instead
    if (editingMessage) {
      try {
        await api.editMessage(editingMessage.id, text);
        setMessages(prev => prev.map(m =>
          m.id === editingMessage.id ? { ...m, text, isEdited: true } : m
        ));
        setEditingMessage(null);
        setDraftText('');
      } catch (err: any) {
        toast.error(err?.message || 'فشل التعديل');
      }
      return;
    }

    // Optimistic: add to UI immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderId: myId,
      receiverId: activeConversationId,
      text,
      timestamp: new Date().toISOString(),
      read: false,
      messageType: 'text',
      replyToId: replyTo?.id,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setDraftText('');
    setReplyTo(null);

    try {
      const sent = await api.sendMessage(
        activeConversationId, text, undefined, 'text',
        undefined, replyTo?.id, undefined, undefined, undefined
      );
      // Replace optimistic message with real one
      setMessages(prev => prev.map(m => m.id === tempId ? { ...sent, senderId: myId } : m));
      // Update conversation list
      setConversations(prev => prev.map(c =>
        c.id === activeConversationId
          ? { ...c, lastMessage: text, lastTime: new Date().toISOString() }
          : c
      ));
    } catch (err: any) {
      // Mark as failed
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _failed: true } : m));
      toast.error(err?.message || 'فشل إرسال الرسالة');
    }
  }, [draftText, activeConversationId, myId, editingMessage, replyTo]);

  // ── Send image ───────────────────────────────────────────────────
  const sendImage = useCallback(async (file: File) => {
    if (!activeConversationId) return;
    setUploadingImage(true);
    try {
      const result = await api.uploadChatImage(file);
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        senderId: myId,
        receiverId: activeConversationId,
        text: '',
        timestamp: new Date().toISOString(),
        read: false,
        messageType: 'image',
        imageUrl: result.url,
      };
      setMessages(prev => [...prev, optimisticMsg]);
      await api.sendMessage(activeConversationId, '', undefined, 'image', result.url);
      toast.success('تم إرسال الصورة');
    } catch (err: any) {
      toast.error(err?.message || 'فشل رفع الصورة');
    } finally {
      setUploadingImage(false);
    }
  }, [activeConversationId, myId]);

  // ── Send voice message ───────────────────────────────────────────
  const sendVoice = useCallback(async (file: File, duration: number) => {
    if (!activeConversationId) return;
    try {
      const result = await api.uploadChatVoice(file);
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: ChatMessage = {
        id: tempId,
        senderId: myId,
        receiverId: activeConversationId,
        text: '',
        timestamp: new Date().toISOString(),
        read: false,
        messageType: 'voice',
        voiceUrl: result.url,
        voiceDuration: duration,
      };
      setMessages(prev => [...prev, optimisticMsg]);
      await api.sendMessage(activeConversationId, '', undefined, 'voice', undefined, undefined, result.url, duration);
    } catch (err: any) {
      toast.error(err?.message || 'فشل إرسال الرسالة الصوتية');
    }
  }, [activeConversationId, myId]);

  // ── Edit message ─────────────────────────────────────────────────
  const editMessage = useCallback(async (messageId: string, newText: string) => {
    try {
      await api.editMessage(messageId, newText);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, text: newText, isEdited: true } : m));
      toast.success('تم تعديل الرسالة');
    } catch (err: any) {
      toast.error(err?.message || 'فشل التعديل');
    }
  }, []);

  // ── Delete message (for me) ──────────────────────────────────────
  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await api.deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success('تم حذف الرسالة');
    } catch (err: any) {
      toast.error(err?.message || 'فشل الحذف');
    }
  }, []);

  // ── Delete for everyone ──────────────────────────────────────────
  const deleteMessageForEveryone = useCallback(async (messageId: string) => {
    try {
      await api.deleteMessageForEveryone(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deletedFor: 'everyone', text: 'تم حذف الرسالة' } : m));
      toast.success('تم حذف الرسالة للجميع');
    } catch (err: any) {
      toast.error(err?.message || 'فشل الحذف');
    }
  }, []);

  // ── React to message ─────────────────────────────────────────────
  const reactToMessage = useCallback(async (messageId: string, emoji: string) => {
    // Optimistic
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = { ...(m.reactions || {}) };
      if (reactions[myId] === emoji) {
        delete reactions[myId]; // toggle off
      } else {
        reactions[myId] = emoji;
      }
      return { ...m, reactions };
    }));
    try {
      await api.reactToMessage(messageId, emoji);
    } catch {
      // Revert on failure — reload messages
      if (activeConversationId) {
        api.getChatMessages(activeConversationId).then((data: any) => {
          const rawMsgs = Array.isArray(data) ? data : (data?.messages || []);
          setMessages(rawMsgs.map((m: any) => normalizeMessage(m)));
        });
      }
    }
  }, [myId, activeConversationId, normalizeMessage]);

  // ── Pin message ──────────────────────────────────────────────────
  const pinMessage = useCallback(async (messageId: string) => {
    try {
      await api.togglePinMessage(messageId);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: !m.isPinned } : m));
      // Refresh pinned list
      const pinned = messages.filter(m => m.isPinned || m.id === messageId);
      setPinnedMessages(pinned);
    } catch (err: any) {
      toast.error(err?.message || 'فشل التثبيت');
    }
  }, [messages]);

  // ── Forward message ──────────────────────────────────────────────
  const forwardMessage = useCallback(async (messageId: string, targetId: string, isGroup?: boolean) => {
    try {
      await api.forwardMessage(messageId, targetId, isGroup);
      toast.success('تم إعادة توجيه الرسالة');
    } catch (err: any) {
      toast.error(err?.message || 'فشل التوجيه');
    }
  }, []);

  // ── Voice recording ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        sendVoice(file, recordingSeconds);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch {
      toast.error('تعذّر الوصول للميكروفون');
    }
  }, [sendVoice, recordingSeconds]);

  const stopRecording = useCallback((send: boolean) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (send) {
        mediaRecorderRef.current.stop();
      } else {
        // Cancel — stop without sending
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorderRef.current.stop();
      }
    }
    mediaRecorderRef.current = null;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  // ── Start call (delegates to existing call system) ────────────────
  const startCall = useCallback((type: 'audio' | 'video') => {
    if (activeConversationId) {
      window.dispatchEvent(new CustomEvent('nawaqes-start-call', {
        detail: { targetUserId: activeConversationId, type }
      }));
    }
  }, [activeConversationId]);

  // ── Cleanup ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  // ── Value ────────────────────────────────────────────────────────
  const value: ChatContextValue = {
    conversations,
    activeConversationId,
    activeContact,
    loadingConversations,
    messages,
    loadingMessages,
    draftText,
    replyTo,
    editingMessage,
    uploadingImage,
    uploadingFile,
    isRecording,
    recordingSeconds,
    otherUserTyping,
    searchQuery,
    messageSearchQuery,
    showConversationList,
    showContactInfo,
    showSearch,
    pinnedMessages,
    wsConnected,
    darkMode,
    dir,
    myId,
    messagesContainerRef,
    messagesEndRef,
    selectConversation,
    refreshConversations,
    sendMessage,
    sendImage,
    sendVoice,
    editMessage,
    deleteMessage,
    deleteMessageForEveryone,
    reactToMessage,
    pinMessage,
    forwardMessage,
    setDraftText,
    setReplyTo,
    setEditingMessage,
    startRecording,
    stopRecording,
    setSearchQuery,
    setMessageSearchQuery,
    setShowContactInfo,
    setShowSearch,
    startCall,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
