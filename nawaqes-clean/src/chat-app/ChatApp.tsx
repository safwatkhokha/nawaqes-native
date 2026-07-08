// ─── Nawaqes Chat App — Standalone Messenger-like Interface ────────
// Rendered at route /#/chat-app inside the main React app.
// Handles auth INTERNALLY — if no user is logged in, shows its own
// minimal login screen (NOT the full app's login page).
//
// Phases implemented:
//   1. UX core: typing indicator, read receipts, reply, reactions, in-chat search, multi-select delete
//   2. Pin, Forward, Media Gallery, Mute, Block, Edit message, Presence
//   3. Group chat: create, view, members, leave, mention
//   4. Voice waveform, paste image, swipe to reply, keyboard shortcuts, global search

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Send, ArrowRight, Phone, Video, MoreVertical, Users, Plus,
  CheckCircle2, MessageCircle, Paperclip, Mic, Image as ImageIcon, X,
  Loader2, LogOut, Settings, ChevronLeft, Play, Pause, Volume2, Trash2,
  Reply, Forward, Smile, UserPlus, Bell, BellOff, Pin, PinOff,
  Ban, Edit2, Check, CheckCheck, CloudOff, ImageOff, ScrollText,
  Crown, UserMinus, Shield, Camera, AlertTriangle, Copy, Clipboard, Download,
  Clock, CalendarClock, Sparkles, Languages, Wallet, Bot,
  MapPin, FileText, User, PlusCircle, Phone as PhoneIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { connectWebSocket, disconnectWebSocket } from '../hooks/useWebSocket';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getDefaultAvatar } from '../utils/avatar';
import { formatRelativeTimeAr } from '../utils/time';
import { useCall, CallOverlay } from './call/CallManager';
import { setupAutoInit as setupFirebase, requestNotificationPermission } from '../lib/firebase';
import { PinchZoomLightbox } from './components/PinchZoomLightbox';
import { MessageContextMenu, useLongPress, type MessageContextAction } from './components/MessageContextMenu';
import { AttachmentPicker, type AttachmentKind } from './components/AttachmentPicker';
import { MuteDurationDialog } from './components/MuteDurationDialog';
import { FileMessageBubble, type FileMessageInfo, formatFileSize } from './components/FileMessageBubble';

// ─── Chat Types ────────────────────────────────────────────────────
interface Contact {
  id: string; name: string; avatar: string;
  lastMessage?: string; lastTime?: string;
  unread?: number; online?: boolean; isGroup?: boolean;
  isMuted?: boolean; isBlocked?: boolean;
  lastSeen?: string;
  isPinned?: boolean;       // pinned conversations at top
  muteUntil?: string | null; // ISO time when DND expires
}
interface ChatMessage {
  id: string; senderId: string; receiverId?: string;
  text: string; messageType?: string; imageUrl?: string;
  voiceUrl?: string; voiceDuration?: number;
  fileUrl?: string;         // generic file attachment (PDF/DOC/ZIP/...)
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  location?: { lat: number; lng: number; name?: string };
  createdAt: string; read?: boolean; isForwarded?: boolean;
  forwardedFrom?: string; groupId?: string;
  replyToId?: string; replyToText?: string; replyToSender?: string;
  reactions?: Record<string, string>; // userId → emoji
  isPinned?: boolean; isEdited?: boolean;
  deletedForEveryone?: boolean;
}

interface GroupInfo {
  id: string; name: string; avatar: string; description?: string;
  members: Array<{ id: string; name: string; avatar: string; role: string }>;
  createdBy: string;
}

// ─── Helper: common emojis for reactions ──────────────────────────
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

// ─── Helper: format duration mm:ss ────────────────────────────────
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Voice Player Sub-component with waveform ─────────────────────
const VoicePlayer: React.FC<{ url: string; duration: number; mine: boolean; accent: string; muted: string }> =
  ({ url, duration, mine, accent, muted }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  // Generate fake waveform bars based on duration (deterministic)
  const bars = useMemo(() => {
    const n = 24;
    return Array.from({ length: n }, (_, i) => {
      // deterministic pseudo-random
      const seed = (i * 9301 + 49297) % 233280;
      return 0.25 + (seed / 233280) * 0.75;
    });
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%', padding: '4px 0' }}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => {
          const a = e.currentTarget;
          setProgress(a.duration ? a.currentTime / a.duration : 0);
          setCurrentTime(a.currentTime);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
      />
      <button
        onClick={toggle}
        style={{
          background: mine ? 'rgba(255,255,255,0.2)' : `${accent}20`,
          border: 'none', borderRadius: '50%', width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: mine ? '#fff' : accent, flexShrink: 0,
        }}
      >
        {playing ? <Pause style={{ width: 16, height: 16 }} /> : <Play style={{ width: 16, height: 16 }} />}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, height: 28 }}>
        {bars.map((h, i) => {
          const filled = (i / bars.length) <= progress;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h * 100}%`,
                background: filled
                  ? (mine ? '#fff' : accent)
                  : (mine ? 'rgba(255,255,255,0.3)' : `${muted}50`),
                borderRadius: 1,
                transition: 'background 0.1s',
              }}
            />
          );
        })}
      </div>
      <span style={{ fontSize: '0.7rem', color: mine ? 'rgba(255,255,255,0.8)' : muted, flexShrink: 0, minWidth: 28 }}>
        {fmtDuration(playing ? currentTime : duration)}
      </span>
    </div>
  );
};

// ─── Main Chat App ─────────────────────────────────────────────────
export const ChatApp: React.FC = () => {
  const { darkMode } = useAppContext();
  const { dir, isRTL } = useLanguage();
  const { currentUser, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ─── Auth: use the global AuthContext instead of internal login ──
  // 🔧 FIX: ChatApp was rendering its OWN login screen, ignoring the
  // main app's auth. Now it uses useAuth() from the global context.
  // Since /chat-app is wrapped in <RequireAuth>, the user is always
  // logged in when this component renders.
  const [chatUser, setChatUser] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (isLoggedIn && currentUser) {
      setChatUser({
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar || getDefaultAvatar(currentUser.name, (currentUser as any).gender),
      });
      const token = api.getToken();
      if (token) {
        connectWebSocket(token);
        setupFirebase();
      }
      setAuthChecked(true);
    } else if (!isLoggedIn) {
      // Shouldn't happen (RequireAuth guards this), but just in case
      setAuthChecked(true);
    }
  }, [isLoggedIn, currentUser]);

  const handleLogout = () => {
    disconnectWebSocket();
    navigate('/');
  };

  const userId = chatUser?.id || '';
  const userName = chatUser?.name || '';
  const userAvatar = chatUser?.avatar || '';

  // ─── Phase 1: State ──────────────────────────────────────────────
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  // 🔧 FIX v3: ref for the message textarea — used by auto-resize so the
  // input grows with content (up to ~6 lines) instead of being stuck at
  // a single line like the old <input type="text">.
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesCache = useRef<Record<string, ChatMessage[]>>({});
  const [promotedAd, setPromotedAd] = useState<any | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);

  // ─── Phase 1: New state ──────────────────────────────────────────
  const [typingPeer, setTypingPeer] = useState<string | null>(null);  // contactId currently typing
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);  // messageId
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatSearchResults, setInChatSearchResults] = useState<ChatMessage[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // ─── Phase 2: New state ──────────────────────────────────────────
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [showContactMenu, setShowContactMenu] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [showForwardDialog, setShowForwardDialog] = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<{ messageId: string; forEveryone: boolean } | null>(null);

  // ─── Chat V2: AI smart replies + scheduling + disappearing ───────
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [disappearingTTL, setDisappearingTTL] = useState(0);

  // ─── Chat V3: AI + Payment + Translation ────────────────────────
  const [showAISummary, setShowAISummary] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);

  // ─── Phase 4: Long-press context menu ────────────────────────────
  const [contextMenuFor, setContextMenuFor] = useState<ChatMessage | null>(null);

  // ─── Chat V4: WhatsApp-style improvements ───────────────────────
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [muteDialogFor, setMuteDialogFor] = useState<Contact | null>(null);
  const [pinnedContactIds, setPinnedContactIds] = useState<Set<string>>(new Set());
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileUploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeCallForContact, setActiveCallForContact] = useState<string | null>(null);

  // ─── Phase 3: Group state ────────────────────────────────────────
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // ─── Phase 4: New state ──────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([]);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const swipeReplyRef = useRef<string | null>(null);

  // ─── Phase 1: WebSocket handlers ─────────────────────────────────
  const handleIncomingMessage = useCallback((data: any) => {
    const msg = mapMessage(data);
    const convId = msg.groupId ? `group_${msg.groupId}` : (msg.senderId === userId ? msg.receiverId || '' : msg.senderId);
    const cache = messagesCache.current[convId] || [];
    if (!cache.find(m => m.id === msg.id)) {
      messagesCache.current[convId] = [...cache, msg];
    }
    if (selectedContact === convId) {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      sendReadReceipt(convId);
    } else {
      setContacts(prev => prev.map(c => c.id === convId
        ? { ...c, unread: (c.unread || 0) + 1, lastMessage: msg.text || (msg.imageUrl ? '📷 صورة' : '🎙️ رسالة صوتية'), lastTime: msg.createdAt }
        : c));
    }
    setTypingPeer(prev => prev === convId ? null : prev);
    loadContacts();
  }, [selectedContact, userId]);

  const handleReadReceipt = useCallback((data: any) => {
    if (data.contactId === selectedContact || data.groupId === selectedContact?.replace('group_', '')) {
      setMessages(prev => prev.map(m => ({ ...m, read: true })));
    }
  }, [selectedContact]);

  const handleTyping = useCallback((data: any) => {
    const convId = data.groupId ? `group_${data.groupId}` : data.senderId;
    if (convId === selectedContact) {
      setTypingPeer(convId);
      // Auto-clear after 3s
      setTimeout(() => setTypingPeer(prev => prev === convId ? null : prev), 3000);
    }
  }, [selectedContact]);

  const handleMessageEdited = useCallback((data: any) => {
    const msg = mapMessage(data);
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...msg, isEdited: true } : m));
    // Update cache
    Object.keys(messagesCache.current).forEach(key => {
      messagesCache.current[key] = messagesCache.current[key].map(m =>
        m.id === msg.id ? { ...msg, isEdited: true } : m
      );
    });
  }, []);

  const handleMessageDeleted = useCallback((data: any) => {
    const messageId = data.messageId;
    setMessages(prev => prev.map(m =>
      m.id === messageId
        ? { ...m, deletedForEveryone: true, text: '🗑️ تم حذف هذه الرسالة', imageUrl: '', voiceUrl: '' }
        : m
    ));
    Object.keys(messagesCache.current).forEach(key => {
      messagesCache.current[key] = messagesCache.current[key].map(m =>
        m.id === messageId
          ? { ...m, deletedForEveryone: true, text: '🗑️ تم حذف هذه الرسالة', imageUrl: '', voiceUrl: '' }
          : m
      );
    });
  }, []);

  const handlePresenceOnline = useCallback((data: any) => {
    setOnlineUsers(prev => new Set([...Array.from(prev), data.userId]));
    setContacts(prev => prev.map(c => c.id === data.userId ? { ...c, online: true } : c));
  }, []);

  const handlePresenceOffline = useCallback((data: any) => {
    setOnlineUsers(prev => {
      const next = new Set(Array.from(prev));
      next.delete(data.userId);
      return next;
    });
    setContacts(prev => prev.map(c =>
      c.id === data.userId ? { ...c, online: false, lastSeen: data.lastSeen } : c
    ));
  }, []);

  const handlePresenceOnlineList = useCallback((data: any) => {
    if (Array.isArray(data.userIds)) {
      setOnlineUsers(new Set(data.userIds));
      setContacts(prev => prev.map(c =>
        data.userIds.includes(c.id) ? { ...c, online: true } : c
      ));
    }
  }, []);

  const handleGroupCreated = useCallback((data: any) => {
    loadContacts();
  }, []);

  // ─── Call/WebRTC state (declared BEFORE useWebSocket so handleCallSignal can be referenced) ───
  // We use a ref to break the circular dependency (handleCallSignal needs callHook, callHook needs sendCallSignal from useWebSocket)
  const callSignalHandlerRef = useRef<(data: any) => void>((data: any) => {
    console.warn('[Chat] call:signal received before CallManager initialized', data);
  });

  const { sendReadReceipt, send, sendTyping: sendTypingWS, sendCallSignal: sendCallSignalWS } = useWebSocket({
    onChatMessage: (data: any) => handleIncomingMessage(data),
    onChatRead: (data: any) => handleReadReceipt(data),
    onChatTyping: (data: any) => handleTyping(data),
    onChatMessageEdited: (data: any) => handleMessageEdited(data),
    onChatMessageDeleted: (data: any) => handleMessageDeleted(data),
    onPresenceOnline: (data: any) => handlePresenceOnline(data),
    onPresenceOffline: (data: any) => handlePresenceOffline(data),
    onPresenceOnlineList: (data: any) => handlePresenceOnlineList(data),
    onChatGroupCreated: (data: any) => handleGroupCreated(data),
    onCallSignal: (data: any) => callSignalHandlerRef.current(data),
    onNotification: () => {},
    autoConnect: true,
  });

  // ─── WebRTC call hook ─────────────────────────────────────────────
  const callHook = useCall({
    userId,
    userName,
    userAvatar,
    sendCallSignal: sendCallSignalWS,
  });

  // Wire the call signal handler to the call hook
  useEffect(() => {
    callSignalHandlerRef.current = callHook.handleCallSignal;
  }, [callHook.handleCallSignal]);

  // ─── Contacts loading ─────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    try {
      const data = await api.getChatContacts();
      const mapped = (Array.isArray(data) ? data : []).map((c: any) => ({
        id: c.id, name: c.name,
        avatar: c.avatar || getDefaultAvatar(c.name, 'male'),
        lastMessage: c.lastMessage || '', lastTime: c.lastTime || '',
        unread: c.unread || 0, online: c.online || false, isGroup: c.isGroup || c.id?.startsWith('group_'),
        isMuted: c.isMuted || false, isBlocked: c.isBlocked || false,
        lastSeen: c.lastSeen,
        isPinned: c.isPinned || false,
        muteUntil: c.muteUntil || c.mute_until || null,
      }));
      setContacts(mapped);
      // Auto-unmute any contact whose muteUntil has passed
      const now = Date.now();
      mapped.forEach(c => {
        if (c.isMuted && c.muteUntil) {
          const until = new Date(c.muteUntil).getTime();
          if (!isNaN(until) && until > now) {
            const delay = until - now;
            setTimeout(() => {
              setContacts(prev => prev.map(p => p.id === c.id ? { ...p, isMuted: false, muteUntil: null } : p));
            }, delay + 500);
          } else if (!isNaN(until) && until <= now) {
            // Already expired — clear it client-side
            setContacts(prev => prev.map(p => p.id === c.id ? { ...p, isMuted: false, muteUntil: null } : p));
          }
        }
      });
    } catch {}
    setLoading(false);
  }, []);

  // Load promoted ad
  useEffect(() => {
    if (adDismissed) return;
    api.getPromotedPosts(1).then((data: any) => {
      const posts = data?.posts || data;
      if (Array.isArray(posts) && posts.length > 0) {
        setPromotedAd(posts[Math.floor(Math.random() * posts.length)]);
      }
    }).catch(() => {});
  }, [adDismissed]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    const chatParam = searchParams.get('chat');
    if (chatParam) setSelectedContact(chatParam);
  }, [searchParams]);

  // ─── Load messages when contact selected ─────────────────────────
  useEffect(() => {
    if (!selectedContact) {
      setMessages([]);
      setPinnedMessage(null);
      return;
    }
    setReplyTo(null);
    setSelectMode(false);
    setSelectedMessageIds(new Set());
    setShowInChatSearch(false);

    // If the contact is NOT in the contacts list (e.g., user clicked
    // "contact seller" from a post/ad), fetch their info and add them
    // to the contacts list so the chat window displays correctly.
    if (!contacts.find(c => c.id === selectedContact)) {
      api.getUserProfile(selectedContact).then((userData: any) => {
        if (userData) {
          const newContact = {
            id: selectedContact,
            name: userData.name || 'مستخدم نواقص',
            avatar: userData.avatar || userData.avatar_base64 || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedContact}`,
            isGroup: false,
            isOnline: false,
            isMuted: false,
            isBlocked: false,
            unread: 0,
            lastMessage: '',
            timestamp: '',
          };
          setContacts(prev => {
            if (prev.find(c => c.id === selectedContact)) return prev;
            return [newContact, ...prev];
          });
        }
      }).catch(() => {});
    }

    if (messagesCache.current[selectedContact]) {
      setMessages(messagesCache.current[selectedContact]);
    }
    api.getChatMessages(selectedContact).then((data: any) => {
      const mapped = Array.isArray(data) ? data.map(mapMessage) : [];
      messagesCache.current[selectedContact] = mapped;
      setMessages(mapped);
      // Find pinned
      const pinned = mapped.find(m => m.isPinned && !m.deletedForEveryone);
      setPinnedMessage(pinned || null);
      sendReadReceipt(selectedContact);
      setContacts(prev => prev.map(c => c.id === selectedContact ? { ...c, unread: 0 } : c));

      // ─── Chat V2: Fetch AI smart replies based on recent messages ──
      if (mapped.length > 0) {
        const lastFew = mapped.slice(-5).map(m => ({ text: m.text, isMine: m.senderId === userId }));
        api.getSmartReplies(lastFew).then((res: any) => {
          setAiSuggestions(res?.replies || []);
        }).catch(() => setAiSuggestions([]));
      } else {
        setAiSuggestions([]);
      }

      // ─── Chat V2: Fetch disappearing TTL for this conversation ──
      api.getConversationSettings(selectedContact).then((res: any) => {
        setDisappearingTTL(res?.disappearing_ttl || 0);
      }).catch(() => {});
    }).catch(() => {});
  }, [selectedContact]);

  // ─── Auto-scroll on new messages ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 🔧 FIX: textarea has a fixed height (44px) — no auto-resize needed.
  // When text is long, it scrolls internally (overflowY: 'auto').

  // ─── Phase 1: Send message (with optional reply) ─────────────────
  const sendMessage = async () => {
    if (!messageText.trim() || !selectedContact || sending) return;

    // If editing, do edit instead
    if (editingMessage) {
      try {
        await api.editMessage(editingMessage.id, messageText);
        setMessageText('');
        setEditingMessage(null);
      } catch {}
      return;
    }

    setSending(true);
    const text = messageText;
    setMessageText('');
    const replyId = replyTo?.id;
    setReplyTo(null);

    try {
      const isGroup = selectedContact.startsWith('group_');
      const groupId = isGroup ? selectedContact.replace('group_', '') : undefined;
      const receiverId = isGroup ? undefined : selectedContact;
      const result = await api.sendMessage(receiverId || '', text, undefined, 'text', undefined, replyId, undefined, undefined, groupId) as any;
      const newMsg = mapMessage(result);
      setMessages(prev => [...prev, newMsg]);
      setContacts(prev => prev.map(c => c.id === selectedContact ? { ...c, lastMessage: text, lastTime: newMsg.createdAt } : c));
    } catch {}
    setSending(false);
  };

  // ─── Phase 1: Typing indicator ───────────────────────────────────
  const lastTypingSentRef = useRef<number>(0);
  const onMessageTextChange = (val: string) => {
    setMessageText(val);
    if (!selectedContact || selectedContact.startsWith('group_')) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      sendTypingWS(selectedContact);
      lastTypingSentRef.current = now;
    }
  };

  // ─── Phase 1: Send image ─────────────────────────────────────────
  const sendImage = async (file: File) => {
    if (!selectedContact) return;
    try {
      const uploadResult = await api.uploadChatImage(file) as any;
      const isGroup = selectedContact.startsWith('group_');
      const groupId = isGroup ? selectedContact.replace('group_', '') : undefined;
      const receiverId = isGroup ? undefined : selectedContact;
      const result = await api.sendMessage(receiverId || '', '', undefined, 'image', uploadResult.url, undefined, undefined, undefined, groupId) as any;
      const newMsg = mapMessage(result);
      setMessages(prev => [...prev, newMsg]);
    } catch {}
  };

  // ─── Chat V4: Send arbitrary file (PDF, DOC, ZIP, etc.) ─────────
  const sendFile = async (file: File) => {
    if (!selectedContact) return;
    // 50 MB hard limit (per task spec)
    if (file.size > 50 * 1024 * 1024) {
      const event = new CustomEvent('nawaqes-toast', { detail: { message: 'حجم الملف يتجاوز 50 ميجابايت', type: 'error' } });
      window.dispatchEvent(event);
      return;
    }
    setUploadingFile(true);
    try {
      const uploadResult = await api.uploadChatFile(file) as any;
      const isGroup = selectedContact.startsWith('group_');
      const groupId = isGroup ? selectedContact.replace('group_', '') : undefined;
      const receiverId = isGroup ? undefined : selectedContact;
      // Pack file metadata into the message via the text field as JSON-encoded
      // payload (backend currently persists text + imageUrl + voiceUrl).
      // For files we store the URL in imageUrl AND a JSON descriptor in text
      // so legacy clients still see something. The frontend renders files
      // when messageType === 'file' or when the text starts with the marker.
      const fileMeta = {
        __file: true,
        url: uploadResult.url,
        filename: uploadResult.filename || file.name,
        size: uploadResult.size ?? file.size,
        mimeType: uploadResult.mimeType ?? file.type,
      };
      const result = await api.sendMessage(
        receiverId || '',
        JSON.stringify(fileMeta),
        undefined,
        'file',
        uploadResult.url,
        undefined, undefined, undefined,
        groupId,
      ) as any;
      const newMsg = mapMessage(result);
      setMessages(prev => [...prev, newMsg]);
    } catch (e: any) {
      const event = new CustomEvent('nawaqes-toast', { detail: { message: e?.message || 'فشل رفع الملف', type: 'error' } });
      window.dispatchEvent(event);
    } finally {
      setUploadingFile(false);
    }
  };

  // ─── Chat V4: Send location ─────────────────────────────────────
  const sendLocation = () => {
    if (!selectedContact || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      const isGroup = selectedContact.startsWith('group_');
      const groupId = isGroup ? selectedContact.replace('group_', '') : undefined;
      const receiverId = isGroup ? undefined : selectedContact;
      const meta = { __location: true, lat: latitude, lng: longitude, name: 'موقعي الحالي' };
      api.sendMessage(receiverId || '', JSON.stringify(meta), undefined, 'location', undefined, undefined, undefined, undefined, groupId)
        .then((result: any) => {
          const newMsg = mapMessage(result);
          setMessages(prev => [...prev, newMsg]);
        }).catch(() => {});
    }, err => {
      const event = new CustomEvent('nawaqes-toast', { detail: { message: 'تعذّر الحصول على الموقع', type: 'error' } });
      window.dispatchEvent(event);
    }, { enableHighAccuracy: true, timeout: 8000 });
  };

  // ─── Chat V4: Pin / unpin a conversation (client-side sort) ─────
  const togglePinContact = (contactId: string) => {
    setPinnedContactIds(prev => {
      const next = new Set(Array.from(prev));
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  // ─── Chat V4: Handle attachment picker selection ────────────────
  const onAttachmentPick = (kind: AttachmentKind) => {
    switch (kind) {
      case 'camera':
        cameraInputRef.current?.click();
        break;
      case 'gallery':
        fileInputRef.current?.click();
        break;
      case 'file':
        fileUploadInputRef.current?.click();
        break;
      case 'location':
        sendLocation();
        break;
      case 'contact':
        // Defer to native share/contact picker if available
        if (navigator.share) {
          navigator.share({ title: 'مشاركة جهة اتصال' }).catch(() => {});
        } else {
          const event = new CustomEvent('nawaqes-toast', { detail: { message: 'مشاركة جهات الاتصال غير مدعومة على هذا الجهاز', type: 'error' } });
          window.dispatchEvent(event);
        }
        break;
    }
  };

  // ─── Phase 4: Paste image from clipboard ─────────────────────────
  useEffect(() => {
    if (!selectedContact) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            sendImage(file);
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [selectedContact]);

  // ─── Phase 1: React to message ───────────────────────────────────
  const reactToMessage = async (messageId: string, emoji: string) => {
    try {
      const result = await api.reactToMessage(messageId, emoji) as any;
      const newReactions = result.reactions || {};
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: newReactions } : m));
      setReactionPickerFor(null);
    } catch {}
  };

  // ─── Phase 1: Search inside chat ─────────────────────────────────
  const performInChatSearch = async (q: string) => {
    if (!selectedContact || !q.trim()) { setInChatSearchResults([]); return; }
    try {
      const data = await api.searchMessages(selectedContact, q.trim());
      setInChatSearchResults(Array.isArray(data) ? data.map(mapMessage) : []);
    } catch { setInChatSearchResults([]); }
  };

  useEffect(() => {
    const t = setTimeout(() => performInChatSearch(inChatSearchQuery), 300);
    return () => clearTimeout(t);
  }, [inChatSearchQuery, selectedContact]);

  // ─── Phase 1: Multi-select delete ────────────────────────────────
  const toggleSelectMessage = (id: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSelectedMessages = async (forEveryone: boolean) => {
    for (const id of Array.from(selectedMessageIds)) {
      try {
        if (forEveryone) await api.deleteMessageForEveryone(id);
        else await api.deleteMessage(id);
      } catch {}
    }
    setMessages(prev => prev.map(m =>
      selectedMessageIds.has(m.id)
        ? forEveryone
          ? { ...m, deletedForEveryone: true, text: '🗑️ تم حذف هذه الرسالة', imageUrl: '', voiceUrl: '' }
          : { ...m, text: '', imageUrl: '', voiceUrl: '' }
        : m
    ));
    setSelectedMessageIds(new Set());
    setSelectMode(false);
    setConfirmDeleteFor(null);
  };

  // ─── Phase 2: Pin message ────────────────────────────────────────
  const togglePinMessage = async (messageId: string) => {
    try {
      const result = await api.togglePinMessage(messageId) as any;
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: result.isPinned } : m));
      if (result.isPinned) {
        const msg = messages.find(m => m.id === messageId);
        if (msg) setPinnedMessage({ ...msg, isPinned: true });
      } else {
        setPinnedMessage(prev => prev?.id === messageId ? null : prev);
      }
    } catch {}
  };

  // ─── Phase 2: Edit message ───────────────────────────────────────
  const startEditMessage = (msg: ChatMessage) => {
    setEditingMessage(msg);
    setMessageText(msg.text);
    setReplyTo(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setMessageText('');
  };

  // ─── Phase 2: Forward message ────────────────────────────────────
  const forwardMessage = async (messageId: string, targetId: string, isGroup: boolean) => {
    try {
      await api.forwardMessage(messageId, targetId, isGroup);
      setShowForwardDialog(null);
      // Switch to target conversation
      setSelectedContact(isGroup ? `group_${targetId}` : targetId);
      navigate({ search: `?chat=${isGroup ? `group_${targetId}` : targetId}` });
    } catch {}
  };

  // ─── Phase 2: Media gallery ──────────────────────────────────────
  const loadMediaGallery = async () => {
    if (!selectedContact) return;
    try {
      const data = await api.getSharedMedia(selectedContact);
      setMediaItems(Array.isArray(data) ? data : []);
      setShowMediaGallery(true);
    } catch {}
  };

  // ─── Phase 2: Mute / Block ───────────────────────────────────────
  const toggleMute = async (contactId: string, isGroup: boolean) => {
    try {
      await api.toggleMuteChat(contactId, isGroup);
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, isMuted: !c.isMuted, muteUntil: null } : c));
      setShowContactMenu(false);
    } catch {}
  };

  // ─── Chat V4: Mute with duration (DND) ──────────────────────────
  const muteWithDuration = async (contactId: string, isGroup: boolean, minutes: number | null) => {
    try {
      // Try the duration-aware endpoint; if it fails, fall back to plain toggle.
      let isMuted = true;
      try {
        const res: any = await api.toggleMuteChatWithDuration(contactId, isGroup, minutes ?? undefined);
        isMuted = !!res?.isMuted;
      } catch {
        await api.toggleMuteChat(contactId, isGroup);
        isMuted = true;
      }
      const muteUntil = (isMuted && minutes != null)
        ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
        : null;
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, isMuted, muteUntil } : c));
      setShowContactMenu(false);
      setMuteDialogFor(null);
      // Schedule auto-unmute
      if (isMuted && minutes != null) {
        const ms = minutes * 60 * 1000;
        setTimeout(() => {
          setContacts(prev => prev.map(c => c.id === contactId ? { ...c, isMuted: false, muteUntil: null } : c));
          // Best-effort server-side unmute
          api.toggleMuteChat(contactId, isGroup).catch(() => {});
        }, ms + 500);
      }
    } catch {
      setMuteDialogFor(null);
    }
  };

  const toggleBlock = async (userId: string) => {
    try {
      await api.toggleBlockUser(userId);
      setContacts(prev => prev.map(c => c.id === userId ? { ...c, isBlocked: !c.isBlocked } : c));
      setShowContactMenu(false);
    } catch {}
  };

  // ─── Phase 3: Create group ───────────────────────────────────────
  const createGroup = async () => {
    if (!groupName.trim() || selectedMembers.size === 0) return;
    try {
      const result = await api.createGroup(groupName, '', groupDesc, Array.from(selectedMembers)) as any;
      setShowCreateGroup(false);
      setGroupName(''); setGroupDesc(''); setSelectedMembers(new Set());
      await loadContacts();
      if (result?.id) {
        const convId = `group_${result.id}`;
        setSelectedContact(convId);
        navigate({ search: `?chat=${convId}` });
      }
    } catch {}
  };

  // ─── Phase 3: Load group info ────────────────────────────────────
  const openGroupInfo = async (groupId: string) => {
    try {
      const data = await api.getGroupDetails(groupId) as any;
      setGroupInfo({
        id: data.id, name: data.name, avatar: data.avatar || '', description: data.description,
        members: (data.members || []).map((m: any) => ({
          id: m.id, name: m.name, avatar: m.avatar || getDefaultAvatar(m.name, 'male'), role: m.role || 'member',
        })),
        createdBy: data.createdBy || data.created_by,
      });
      setShowGroupInfo(true);
    } catch {}
  };

  // ─── Phase 3: Leave group ────────────────────────────────────────
  const leaveGroup = async (groupId: string) => {
    if (!confirm('هل تريد مغادرة المجموعة؟')) return;
    try {
      await api.leaveGroup(groupId);
      setShowGroupInfo(false);
      setSelectedContact(null);
      navigate({ search: '' });
      loadContacts();
    } catch {}
  };

  // ─── Phase 3: Remove member ──────────────────────────────────────
  const removeMember = async (groupId: string, memberId: string) => {
    try {
      await api.removeGroupMember(groupId, memberId);
      setGroupInfo(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.id !== memberId),
      } : null);
    } catch {}
  };

  // ─── Phase 3: Add member (open new chat dialog reused) ───────────
  const [showAddMember, setShowAddMember] = useState(false);
  const addGroupMember = async (userId: string) => {
    if (!groupInfo) return;
    try {
      await api.addGroupMember(groupInfo.id, userId);
      const u = allUsers.find(x => x.id === userId);
      if (u) {
        setGroupInfo(prev => prev ? {
          ...prev,
          members: [...prev.members, { id: u.id, name: u.name, avatar: u.avatar || getDefaultAvatar(u.name, 'male'), role: 'member' }],
        } : null);
      }
      setShowAddMember(false);
    } catch {}
  };

  // ─── Phase 4: Voice recording ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        try {
          const uploadResult = await api.uploadChatVoice(file) as any;
          const isGroup = selectedContact?.startsWith('group_');
          const groupId = isGroup ? selectedContact?.replace('group_', '') : undefined;
          const receiverId = isGroup ? undefined : selectedContact;
          const result = await api.sendMessage(receiverId || '', '', undefined, 'voice', undefined, undefined, uploadResult.url, recordingSeconds, groupId) as any;
          const newMsg = mapMessage(result);
          setMessages(prev => [...prev, newMsg]);
        } catch {}
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  };

  const stopRecording = (send: boolean) => {
    if (mediaRecorderRef.current && recording) {
      if (send) {
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorderRef.current.stop();
      }
    }
    setRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  // ─── Phase 4: Swipe-to-reply + Long-press context menu (touch handlers) ───
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent, msg: ChatMessage) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    longPressTriggeredRef.current = false;

    // Start long-press timer (600ms) — opens context menu
    // 🔧 FIX v3: increased from 500ms to 600ms (iOS/Android standard).
    // The old 500ms was so short that any slightly-slow tap would trigger
    // the context menu unexpectedly.
    if (!selectMode && !msg.deletedForEveryone) {
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        setContextMenuFor(msg);
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(30);
      }, 600);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    // Cancel long-press if finger moved too much (user is scrolling)
    if (touchStartXRef.current !== null) {
      const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
      const dy = Math.abs(e.touches[0].clientY - (touchStartYRef.current || 0));
      if (dx > 10 || dy > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent, msg: ChatMessage) => {
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // If long-press was triggered, don't process swipe
    if (longPressTriggeredRef.current) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    if (touchStartXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const dy = e.changedTouches[0].clientY - (touchStartYRef.current || 0);
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      // RTL-aware: in Arabic (default) swipe right = reply (toward incoming),
      // swipe left = forward. In LTR languages the directions flip.
      const replyGesture = isRTL ? dx > 0 : dx < 0;
      const forwardGesture = isRTL ? dx < 0 : dx > 0;
      if (replyGesture) {
        setReplyTo(msg);
      } else if (forwardGesture) {
        setShowForwardDialog(msg.id);
      }
    }
  };

  // Right-click on desktop → context menu
  const onContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    if (selectMode || msg.deletedForEveryone) return;
    e.preventDefault();
    setContextMenuFor(msg);
  };

  // ─── Phase 4: Global search across all chats ─────────────────────
  useEffect(() => {
    if (!globalSearch.trim()) { setGlobalSearchResults([]); return; }
    const t = setTimeout(async () => {
      // Search in current cached conversations
      const results: any[] = [];
      Object.entries(messagesCache.current).forEach(([cid, msgs]) => {
        const matches = msgs.filter(m =>
          m.text.toLowerCase().includes(globalSearch.toLowerCase()) && !m.deletedForEveryone
        );
        if (matches.length > 0) {
          const contact = contacts.find(c => c.id === cid);
          results.push({ contactId: cid, contactName: contact?.name || cid, matches });
        }
      });
      setGlobalSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [globalSearch, contacts]);

  // ─── New chat dialog: load friends ───────────────────────────────
  useEffect(() => {
    if (showNewChat || showAddMember || showCreateGroup) {
      api.getFriendsList().then((data: any) => {
        setAllUsers(Array.isArray(data) ? data : []);
      }).catch(() => {});
    }
  }, [showNewChat, showAddMember, showCreateGroup]);

  useEffect(() => {
    if (showNewChat && newChatSearch.trim().length >= 1) {
      const timer = setTimeout(() => {
        api.searchUsers(newChatSearch.trim()).then((data: any) => {
          setAllUsers(Array.isArray(data) ? data : []);
        }).catch(() => {});
      }, 300);
      return () => clearTimeout(timer);
    } else if (showNewChat && newChatSearch.trim().length === 0) {
      api.getFriendsList().then((data: any) => {
        setAllUsers(Array.isArray(data) ? data : []);
      }).catch(() => {});
    }
  }, [showNewChat, newChatSearch]);

  const startNewChat = async (targetId: string, targetName: string, targetAvatar: string) => {
    const existing = contacts.find(c => c.id === targetId);
    if (!existing) {
      setContacts(prev => [{ id: targetId, name: targetName, avatar: targetAvatar, lastMessage: '', unread: 0 }, ...prev]);
    }
    setSelectedContact(targetId);
    setShowNewChat(false);
    navigate({ search: `?chat=${targetId}` });
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedContactData = contacts.find(c => c.id === selectedContact) || (selectedContact ? {
    id: selectedContact,
    name: 'مستخدم نواقص',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedContact}`,
    isGroup: false,
    isOnline: false,
    isMuted: false,
    isBlocked: false,
  } as any : null);
  const isGroupChat = selectedContact?.startsWith('group_');
  const selectedGroupId = isGroupChat ? selectedContact?.replace('group_', '') : null;

  // ─── Early returns (AFTER all hooks) ─────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: darkMode ? '#0B141A' : '#EFEAE2' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: '#00A884' }} />
      </div>
    );
  }

  if (!chatUser) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: darkMode ? '#0B141A' : '#EFEAE2', color: darkMode ? '#8696A0' : '#667781' }}>
        <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: "#00A884", marginRight: 8 }} />
        <span>جاري التحميل...</span>
      </div>
    );
  }

  // ─── Color palette (WhatsApp-style — dark + light, teal/green accents) ────
  // Mirrors WhatsApp's official palette: teal header, beige chat background
  // in light mode, near-black in dark mode. Outgoing messages use WhatsApp's
  // signature light-green (light) / deep-teal (dark) bubble.
  const isDark = darkMode;
  const bgColor       = isDark ? '#0B141A' : '#FFFFFF';           // App shell background
  const cardBg        = isDark ? '#202C33' : '#FFFFFF';            // Cards / sheets
  const cardBgHover   = isDark ? '#2A3942' : '#F0F2F5';            // Hover state
  const textColor     = isDark ? '#E9EDEF' : '#111B21';            // Primary text
  const mutedColor    = isDark ? '#8696A0' : '#667781';            // Secondary text
  const inputBg       = isDark ? '#2A3942' : '#F0F2F5';            // Input fields
  const accentColor   = isDark ? '#00A884' : '#008069';            // WhatsApp teal
  const accentLight   = isDark ? '#25D366' : '#00A884';            // Lighter green
  const accentGradient = isDark
    ? 'linear-gradient(135deg, #00A884, #25D366)'
    : 'linear-gradient(135deg, #008069, #00A884)';
  const border        = isDark ? '#2A3942' : '#E9EDEF';            // Subtle borders
  // WhatsApp signature bubbles:
  //   - Outgoing (mine): #005C4B (dark) / #D9FDD3 (light)
  //   - Incoming: #202C33 (dark) / #FFFFFF (light)
  const bubbleMine     = isDark ? '#005C4B' : '#D9FDD3';
  const bubbleMineText = isDark ? '#E9EDEF' : '#111B21';
  const bubbleTheirs   = isDark ? '#202C33' : '#FFFFFF';
  const dangerColor  = '#F87171';
  const successColor = '#25D366';                                  // WhatsApp online green
  // WhatsApp header: solid teal (dark) / dark teal (light) — no gradient
  const headerBg    = isDark ? '#202C33' : '#008069';
  const headerText  = '#FFFFFF';
  // Chat area background: WhatsApp uses a beige pattern in light mode,
  // and a near-black with subtle pattern in dark mode. We compose the
  // pattern via an inline SVG data URI for crispness at any DPI.
  const chatPattern = isDark
    ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><path fill='%23102433' fill-opacity='0.5' d='M20 0 L22 18 L40 20 L22 22 L20 40 L18 22 L0 20 L18 18 Z'/></svg>\")"
    : "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><path fill='%23cfd8dc' fill-opacity='0.5' d='M20 0 L22 18 L40 20 L22 22 L20 40 L18 22 L0 20 L18 18 Z'/></svg>\")";
  const chatBg      = isDark ? '#0B141A' : '#EFEAE2';
  // Read-receipt blue (WhatsApp's signature tick color)
  const tickBlue = '#53BDEB';

  // Reusable style for chat-header dropdown menu items
  const menuBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '10px 12px', background: 'none', border: 'none',
    color: textColor, cursor: 'pointer', borderRadius: 8,
    fontSize: '0.85rem', textAlign: 'right',
    transition: 'background 0.12s',
  };

  // Helper: get reaction summary for a message
  const renderReactions = (msg: ChatMessage) => {
    if (!msg.reactions || Object.keys(msg.reactions).length === 0) return null;
    const counts: Record<string, number> = {};
    Object.values(msg.reactions).forEach(emoji => {
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
    return (
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        {Object.entries(counts).map(([emoji, n]) => (
          <span key={emoji} style={{
            background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '2px 8px',
            fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            {emoji} {n > 1 ? n : ''}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div dir={dir} style={{ display: 'flex', height: '100dvh', background: bgColor, color: textColor, overflow: 'hidden', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Responsive media query styles for chat layout */}
      <style>{`
        @media (max-width: 639px) {
          .chat-sidebar[data-hidden="true"] { display: none !important; }
          .chat-window[data-hidden="false"] { display: flex !important; flex: 1 !important; }
        }
        @media (min-width: 640px) {
          .chat-sidebar { display: flex !important; }
          .chat-window { display: flex !important; }
        }
        .wa-chat-scroll::-webkit-scrollbar { width: 6px; }
        .wa-chat-scroll::-webkit-scrollbar-thumb { background: ${isDark ? '#2A3942' : '#cfcfcf'}; border-radius: 3px; }
        .wa-chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
      {/* ============ Sidebar: Contact List ============ */}
      {/* On mobile: hide sidebar when a contact is selected (chat window takes full screen).
          On desktop: always show sidebar alongside chat window. */}
      <div
        className="chat-sidebar"
        data-hidden={selectedContact ? 'true' : 'false'}
        style={{
          width: '100%', maxWidth: selectedContact ? '380px' : '100%',
          display: 'flex', flexDirection: 'column',
          borderLeft: selectedContact ? `1px solid ${border}` : 'none',
          flexShrink: 0, transition: 'max-width 0.2s',
          minWidth: 0, boxSizing: 'border-box', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', background: headerBg, color: headerText, flexShrink: 0 }}>
          {/* Back to main app button */}
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: headerText,
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '36px',
              minHeight: '36px',
              transition: 'background 0.2s',
            }}
            title="رجوع للرئيسية"
            aria-label="رجوع للرئيسية"
          >
            <ArrowRight style={{ width: 20, height: 20 }} />
          </button>
          <div style={{ fontSize: '1.3rem' }}>💬</div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, flex: 1, letterSpacing: '0.5px' }}>Nawaqes Chat</h1>
          <button onClick={() => setShowGlobalSearch(true)} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }} title="بحث شامل">
            <Search style={{ width: 20, height: 20 }} />
          </button>
          <button onClick={() => setShowCreateGroup(true)} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }} title="مجموعة جديدة">
            <Users style={{ width: 22, height: 22 }} />
          </button>
          <button onClick={() => setShowNewChat(true)} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }} title="محادثة جديدة">
            <Plus style={{ width: 24, height: 24 }} />
          </button>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }} title="تسجيل خروج">
            <LogOut style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <div style={{ padding: '8px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: inputBg, borderRadius: '12px', padding: '10px 14px' }}>
            <Search style={{ width: 16, height: 16, color: mutedColor }} />
            <input type="text" placeholder="بحث في المحادثات..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ background: 'none', border: 'none', color: textColor, outline: 'none', flex: 1, fontSize: '14px' }} />
          </div>
        </div>
        <div className="wa-chat-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: accentColor }} />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: mutedColor, fontSize: '0.85rem' }}>
              لا توجد محادثات
              <br />
              <button onClick={() => setShowNewChat(true)} style={{ marginTop: '12px', background: accentColor, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
                محادثة جديدة
              </button>
            </div>
          ) : (
            <>
            {/* Promoted Ad Card */}
            {promotedAd && !adDismissed && (
              <div style={{
                margin: '8px 12px', borderRadius: '14px', overflow: 'hidden',
                background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`,
                border: `1px solid ${accentColor}30`, position: 'relative',
              }}>
                <button onClick={() => setAdDismissed(true)} style={{
                  position: 'absolute', top: 6, left: 6, zIndex: 2,
                  background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%',
                  width: 24, height: 24, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <X style={{ width: 14, height: 14, color: '#fff' }} />
                </button>
                <div onClick={() => { window.location.hash = `/post/${promotedAd.id}`; }} style={{ cursor: 'pointer', display: 'flex', gap: '10px', padding: '12px' }}>
                  {promotedAd.image && (
                    <img src={typeof promotedAd.image === 'string' && promotedAd.image.startsWith('[') ? JSON.parse(promotedAd.image)[0] : promotedAd.image} alt="" style={{ width: 56, height: 56, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor, background: `${accentColor}15`, padding: '2px 8px', borderRadius: '6px' }}>إعلان مُروّج</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{promotedAd.content?.substring(0, 60) || 'إعلان مميز'}</p>
                    <p style={{ fontSize: '0.75rem', color: mutedColor, marginTop: '2px' }}>{promotedAd.author?.name || ''}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Render pinned contacts first, then unpinned */}
            {(() => {
              const sorted = [...filteredContacts].sort((a, b) => {
                const aPin = a.isPinned || pinnedContactIds.has(a.id) ? 1 : 0;
                const bPin = b.isPinned || pinnedContactIds.has(b.id) ? 1 : 0;
                return bPin - aPin;
              });
              return sorted.map(contact => {
                const isPinned = contact.isPinned || pinnedContactIds.has(contact.id);
                const isTyping = typingPeer === contact.id;
                return (
                  <div
                    key={contact.id}
                    onClick={() => { setSelectedContact(contact.id); navigate({ search: `?chat=${contact.id}` }); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer',
                      background: selectedContact === contact.id
                        ? (isDark ? '#2A3942' : '#F0F2F5')
                        : 'transparent',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (selectedContact !== contact.id) e.currentTarget.style.background = isDark ? '#111B21' : '#F5F6F6'; }}
                    onMouseLeave={e => { if (selectedContact !== contact.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {contact.isGroup ? (
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Users style={{ width: 22, height: 22, color: mutedColor }} />
                        </div>
                      ) : (
                        <img src={contact.avatar} alt={contact.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: inputBg }} />
                      )}
                      {contact.online && !contact.isGroup && (
                        <div style={{ position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: successColor, border: `2px solid ${bgColor}` }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6, color: textColor }}>
                          {contact.name}
                          {isPinned && <Pin style={{ width: 11, height: 11, color: mutedColor, transform: 'rotate(45deg)' }} />}
                          {contact.isMuted && <BellOff style={{ width: 12, height: 12, color: mutedColor }} />}
                          {contact.isBlocked && <Ban style={{ width: 12, height: 12, color: dangerColor }} />}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {/* Read receipt tick for last outgoing message */}
                          {(contact.unread || 0) === 0 && contact.lastMessage && (
                            <CheckCheck style={{ width: 14, height: 14, color: tickBlue }} />
                          )}
                          {contact.lastTime && <span style={{ fontSize: '0.7rem', color: (contact.unread || 0) > 0 ? accentColor : mutedColor, flexShrink: 0 }}>{formatRelativeTimeAr(contact.lastTime)}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{
                          fontSize: '0.8rem',
                          color: isTyping ? accentColor : mutedColor,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          maxWidth: '200px',
                          fontStyle: isTyping ? 'normal' : 'normal',
                          fontWeight: isTyping ? 600 : 400,
                        }}>
                          {isTyping ? '✍️ يكتب الآن…' : (contact.lastMessage || 'لا توجد رسائل')}
                        </span>
                        {(contact.unread || 0) > 0 && (
                          <span style={{ background: accentColor, color: '#fff', fontSize: '0.7rem', fontWeight: 700, borderRadius: '10px', padding: '2px 8px', minWidth: '20px', textAlign: 'center' }}>{contact.unread}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
            </>
          )}
        </div>
      </div>

      {/* ============ Chat Window ============ */}
      <div
        className="chat-window"
        data-hidden={selectedContact ? 'false' : 'true'}
        style={{ flex: 1, display: selectedContact ? 'flex' : 'none', flexDirection: 'column', minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' }}
      >
        {selectedContactData ? (
          <>
            {/* Chat header — modern green bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: headerBg, color: headerText, position: 'relative', flexShrink: 0 }}>
              <button onClick={() => { setSelectedContact(null); navigate({ search: '' }); }} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer' }} className="sm:hidden">
                <ChevronLeft style={{ width: 24, height: 24 }} />
              </button>
              <div onClick={() => isGroupChat && selectedGroupId ? openGroupInfo(selectedGroupId) : undefined} style={{ cursor: isGroupChat ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                {selectedContactData.isGroup ? (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users style={{ width: 20, height: 20, color: mutedColor }} />
                  </div>
                ) : (
                  <img src={selectedContactData.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{selectedContactData.name}</h3>
                  <span style={{ fontSize: '0.75rem', color: typingPeer === selectedContact ? accentLight : (selectedContactData.online ? successColor : mutedColor) }}>
                    {typingPeer === selectedContact ? '✍️ يكتب الآن…' :
                     isGroupChat ? `${groupInfo?.members.length || ''} عضو` :
                     selectedContactData.online ? 'متصل الآن' :
                     selectedContactData.lastSeen ? `آخر ظهور ${formatRelativeTimeAr(selectedContactData.lastSeen)}` : 'غير متصل'}
                  </span>
                </div>
              </div>
              {!selectMode && (
                <>
                  {/* 🔧 Reorganized: call buttons first (primary actions), then secondary */}
                  <button
                    onClick={() => {
                      if (!selectedContactData) return;
                      // Group calls: the underlying WebRTC is still 1-on-1 (mesh
                      // upgrade is a backend task), but the UX now allows groups.
                      callHook.startCall('audio', selectedContactData.id, selectedContactData.name, selectedContactData.avatar);
                      setActiveCallForContact(selectedContact);
                    }}
                    disabled={!selectedContactData}
                    style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '6px', opacity: !selectedContactData ? 0.3 : 1, flexShrink: 0 }}
                    title="اتصال صوتي"
                  ><Phone style={{ width: 18, height: 18 }} /></button>
                  <button
                    onClick={() => {
                      if (!selectedContactData) return;
                      callHook.startCall('video', selectedContactData.id, selectedContactData.name, selectedContactData.avatar);
                      setActiveCallForContact(selectedContact);
                    }}
                    disabled={!selectedContactData}
                    style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '6px', opacity: !selectedContactData ? 0.3 : 1, flexShrink: 0 }}
                    title="اتصال فيديو"
                  ><Video style={{ width: 18, height: 18 }} /></button>
                  {/* Divider */}
                  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)', margin: '0 2px', flexShrink: 0 }} />
                  {/* Secondary actions */}
                  <button onClick={() => setShowInChatSearch(!showInChatSearch)} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '6px', opacity: showInChatSearch ? 0.7 : 1, flexShrink: 0 }} title="بحث في المحادثة">
                    <Search style={{ width: 18, height: 18 }} />
                  </button>
                  <button onClick={loadMediaGallery} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '6px', flexShrink: 0 }} title="الوسائط المشتركة">
                    <ImageIcon style={{ width: 18, height: 18 }} />
                  </button>
                  {/* ── Chat V3: AI Assistant button ── */}
                  <button
                    onClick={async () => {
                      setShowAISummary(true);
                      setAiLoading(true);
                      setAiSummary('');
                      try {
                        const lastMsgs = messages.slice(-50).map(m => ({
                          text: m.text, sender_id: m.senderId, message_type: m.messageType,
                        }));
                        const res = await api.aiSummarize(lastMsgs, selectedContactData?.name || '');
                        setAiSummary(res.summary || 'لا يوجد ملخص');
                      } catch (e: any) {
                        setAiSummary('فشل التلخيص: ' + (e.message || ''));
                      } finally { setAiLoading(false); }
                    }}
                    style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }}
                    title="المساعد الذكي — تلخيص المحادثة"
                  ><Sparkles style={{ width: 20, height: 20 }} /></button>
                  {/* ── Chat V3: Payment button ── */}
                  <button
                    onClick={() => setShowPaymentDialog(true)}
                    disabled={selectedContactData?.isGroup}
                    style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px', opacity: selectedContactData?.isGroup ? 0.3 : 1 }}
                    title="إرسال أموال"
                  ><Wallet style={{ width: 20, height: 20 }} /></button>
                  <button onClick={() => setShowContactMenu(!showContactMenu)} style={{ background: 'none', border: 'none', color: headerText, cursor: 'pointer', padding: '8px' }} title="المزيد">
                    <MoreVertical style={{ width: 20, height: 20 }} />
                  </button>
                  {showContactMenu && (
                    <div style={{ position: 'absolute', top: 56, left: 16, background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 6, minWidth: 240, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', overflowY: 'auto', zIndex: 200, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                      <button onClick={() => { setSelectMode(true); setShowContactMenu(false); }} style={menuBtnStyle}>
                        <CheckCircle2 style={{ width: 16, height: 16 }} /> تحديد رسائل
                      </button>
                      <button
                        onClick={() => {
                          setShowContactMenu(false);
                          if (selectedContactData) setMuteDialogFor(selectedContactData);
                        }}
                        style={menuBtnStyle}
                      >
                        {selectedContactData.isMuted ? <Bell style={{ width: 16, height: 16 }} /> : <BellOff style={{ width: 16, height: 16 }} />}
                        {selectedContactData.isMuted ? 'إلغاء الكتم' : 'كتم الإشعارات (DND)'}
                      </button>
                      <button
                        onClick={() => { if (selectedContact) togglePinContact(selectedContact); setShowContactMenu(false); }}
                        style={menuBtnStyle}
                      >
                        {(selectedContactData.isPinned || (selectedContact && pinnedContactIds.has(selectedContact)))
                          ? <PinOff style={{ width: 16, height: 16 }} />
                          : <Pin style={{ width: 16, height: 16, transform: 'rotate(45deg)' }} />}
                        {(selectedContactData.isPinned || (selectedContact && pinnedContactIds.has(selectedContact)))
                          ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
                      </button>
                      {!isGroupChat && (
                        <button onClick={() => selectedContact && toggleBlock(selectedContact)} style={{ ...menuBtnStyle, color: dangerColor }}>
                          <Ban style={{ width: 16, height: 16 }} /> {selectedContactData.isBlocked ? 'إلغاء الحظر' : 'حظر المستخدم'}
                        </button>
                      )}
                      {isGroupChat && selectedGroupId && (
                        <>
                          <button onClick={() => openGroupInfo(selectedGroupId)} style={menuBtnStyle}>
                            <Users style={{ width: 16, height: 16 }} /> معلومات المجموعة
                          </button>
                          <button onClick={() => leaveGroup(selectedGroupId)} style={{ ...menuBtnStyle, color: dangerColor }}>
                            <CloudOff style={{ width: 16, height: 16 }} /> مغادرة المجموعة
                          </button>
                        </>
                      )}
                      {!isGroupChat && (
                        <button onClick={() => { window.location.hash = `/user/${selectedContactData.id}`; }} style={menuBtnStyle}>
                          <UserPlus style={{ width: 16, height: 16 }} /> عرض الملف الشخصي
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {selectMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.85rem', color: mutedColor }}>{selectedMessageIds.size} محدد</span>
                  <button onClick={() => { setSelectMode(false); setSelectedMessageIds(new Set()); }} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px' }}>
                    <X style={{ width: 20, height: 20 }} />
                  </button>
                </div>
              )}
            </div>

            {/* In-chat search bar */}
            {showInChatSearch && (
              <div style={{ padding: '8px 16px', background: cardBg, borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search style={{ width: 16, height: 16, color: mutedColor }} />
                <input
                  autoFocus
                  type="text"
                  placeholder="ابحث في هذه المحادثة..."
                  value={inChatSearchQuery}
                  onChange={e => setInChatSearchQuery(e.target.value)}
                  style={{ flex: 1, background: inputBg, border: 'none', borderRadius: 8, padding: '8px 12px', color: textColor, fontSize: '0.85rem', outline: 'none' }}
                />
                <button onClick={() => { setShowInChatSearch(false); setInChatSearchQuery(''); }} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
                {inChatSearchResults.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: mutedColor }}>{inChatSearchResults.length} نتيجة</span>
                )}
              </div>
            )}

            {/* Pinned message banner */}
            {pinnedMessage && !pinnedMessage.deletedForEveryone && (
              <div style={{ padding: '8px 16px', background: `${accentColor}10`, borderBottom: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                <Pin style={{ width: 14, height: 14, color: accentLight, transform: 'rotate(45deg)' }} />
                <span style={{ color: mutedColor, flexShrink: 0 }}>📌 مثبت:</span>
                <span style={{ color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {pinnedMessage.text || (pinnedMessage.imageUrl ? '📷 صورة' : '🎙️ رسالة صوتية')}
                </span>
                <button onClick={() => togglePinMessage(pinnedMessage.id)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: 4 }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            )}

            {/* Messages area — WhatsApp-style with subtle pattern background */}
            <div
              ref={messageContainerRef}
              className="wa-chat-scroll"
              style={{
                flex: 1, overflowY: 'auto', overflowX: 'hidden',
                padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '2px',
                boxSizing: 'border-box', minWidth: 0,
                background: chatBg,
                backgroundImage: chatPattern,
                backgroundRepeat: 'repeat',
              }}
            >
              {messages.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: mutedColor, fontSize: '0.85rem' }}>ابدأ المحادثة — أرسل أول رسالة!</div>
              ) : (
                messages.map(msg => {
                  const mine = msg.senderId === userId;
                  const isSelected = selectedMessageIds.has(msg.id);
                  const showAvatar = !mine && isGroupChat;
                  // Detect file payload: messageType==='file' OR text starts with {"__file":true
                  let filePayload: FileMessageInfo | null = null;
                  let locationPayload: { lat: number; lng: number; name?: string } | null = null;
                  let displayText = msg.text;
                  if (msg.messageType === 'file' || (msg.text && msg.text.startsWith('{"__file":true'))) {
                    try {
                      const parsed = JSON.parse(msg.text);
                      if (parsed?.__file) {
                        filePayload = {
                          url: parsed.url || msg.imageUrl || '',
                          filename: parsed.filename || 'ملف',
                          size: parsed.size,
                          mimeType: parsed.mimeType,
                        };
                        displayText = '';
                      }
                    } catch {}
                  } else if (msg.messageType === 'location' || (msg.text && msg.text.startsWith('{"__location":true'))) {
                    try {
                      const parsed = JSON.parse(msg.text);
                      if (parsed?.__location) {
                        locationPayload = { lat: parsed.lat, lng: parsed.lng, name: parsed.name };
                        displayText = '';
                      }
                    } catch {}
                  }
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end', gap: 6,
                        opacity: msg.deletedForEveryone ? 0.6 : 1,
                        minWidth: 0,
                        maxWidth: '100%',
                        marginTop: 2,
                      }}
                    >
                      {showAvatar && (
                        <img src={contacts.find(c => c.id === msg.senderId)?.avatar || getDefaultAvatar('', 'male')} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                      )}
                      {selectMode && (
                        <button
                          onClick={() => toggleSelectMessage(msg.id)}
                          style={{
                            width: 24, height: 24, borderRadius: '50%', border: `2px solid ${isSelected ? accentColor : mutedColor}`,
                            background: isSelected ? accentColor : 'transparent', cursor: 'pointer', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isSelected && <Check style={{ width: 14, height: 14, color: '#fff' }} />}
                        </button>
                      )}
                      {/* 🔧 FIX v3: touch handlers moved from the ROW (above)
                          to this BUBBLE div. Previously they were on the row
                          which spans the full width, so tapping anywhere in
                          the empty space next to a message would start the
                          long-press timer and trigger the context menu. Now
                          only tapping the bubble itself can trigger it. */}
                      <div
                        onTouchStart={e => onTouchStart(e, msg)}
                        onTouchMove={onTouchMove}
                        onTouchEnd={e => onTouchEnd(e, msg)}
                        onContextMenu={e => onContextMenu(e, msg)}
                        onDoubleClick={() => !selectMode && setReplyTo(msg)}
                        onClick={() => selectMode && toggleSelectMessage(msg.id)}
                        style={{
                          maxWidth: '80%', padding: '6px 10px 4px',
                          // WhatsApp's bubble corner: a tiny tail on the outer corner
                          borderRadius: mine ? '10px 10px 0 10px' : '10px 10px 10px 0',
                          background: msg.deletedForEveryone
                            ? 'transparent'
                            : (mine ? bubbleMine : bubbleTheirs),
                          color: mine ? bubbleMineText : textColor,
                          fontSize: '0.92rem', wordBreak: 'break-word', overflowWrap: 'break-word',
                          border: isSelected ? `2px solid ${accentColor}` : 'none',
                          cursor: selectMode ? 'pointer' : 'default',
                          position: 'relative',
                          boxShadow: msg.isPinned
                            ? '0 0 0 2px #F59E0B'
                            : (isDark ? '0 1px 0.5px rgba(0,0,0,0.13)' : '0 1px 0.5px rgba(11,20,26,0.13)'),
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                          minWidth: 0,
                          flexShrink: 1,
                        }}
                      >
                        {/* Forwarded label */}
                        {msg.isForwarded && msg.forwardedFrom && (
                          <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, color: accentLight }}>
                            <Forward style={{ width: 11, height: 11 }} /> تم تمريرها من {msg.forwardedFrom}
                          </div>
                        )}

                        {/* Reply preview — WhatsApp-style colored left border */}
                        {msg.replyToText && (
                          <div style={{
                            background: mine ? 'rgba(255,255,255,0.12)' : 'rgba(0,168,132,0.12)',
                            borderLeft: `3px solid ${mine ? 'rgba(255,255,255,0.7)' : accentColor}`,
                            padding: '4px 8px', borderRadius: 6, marginBottom: 4, fontSize: '0.78rem',
                            maxWidth: '100%', minWidth: 0, overflow: 'hidden',
                          }}>
                            <div style={{ fontWeight: 700, color: mine ? bubbleMineText : accentColor }}>{msg.replyToSender || 'رد'}</div>
                            <div style={{ opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                              {msg.replyToText}
                            </div>
                          </div>
                        )}

                        {/* Group sender name */}
                        {showAvatar && !msg.deletedForEveryone && (
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: accentLight, marginBottom: 2 }}>
                            {contacts.find(c => c.id === msg.senderId)?.name || 'مستخدم'}
                          </div>
                        )}

                        {/* Image */}
                        {msg.imageUrl && !msg.deletedForEveryone && !filePayload && (
                          <img
                            src={msg.imageUrl} alt="" onClick={() => setImagePreview(msg.imageUrl || null)}
                            style={{ width: '100%', maxWidth: '100%', height: 'auto', borderRadius: 8, marginBottom: displayText ? 4 : 0, cursor: 'pointer', display: 'block', objectFit: 'contain' }}
                          />
                        )}

                        {/* Voice with waveform */}
                        {msg.voiceUrl && !msg.deletedForEveryone && (
                          <VoicePlayer url={msg.voiceUrl} duration={msg.voiceDuration || 0} mine={mine} accent={accentColor} muted={mutedColor} />
                        )}

                        {/* File attachment (PDF/DOC/ZIP/etc.) */}
                        {filePayload && !msg.deletedForEveryone && (
                          <FileMessageBubble
                            file={filePayload}
                            mine={mine}
                            colors={{ accentColor, textColor, mutedColor, cardBg }}
                          />
                        )}

                        {/* Location */}
                        {locationPayload && !msg.deletedForEveryone && (
                          <a
                            href={`https://www.google.com/maps?q=${locationPayload.lat},${locationPayload.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', flexDirection: 'column', gap: 6, textDecoration: 'none',
                              minWidth: 220,
                            }}
                          >
                            <div style={{
                              width: '100%', height: 120, borderRadius: 8,
                              background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: accentColor,
                            }}>
                              <MapPin style={{ width: 36, height: 36 }} />
                            </div>
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem',
                              color: mine ? bubbleMineText : textColor,
                            }}>
                              <MapPin style={{ width: 12, height: 12 }} />
                              {locationPayload.name || 'موقع'}
                            </div>
                          </a>
                        )}

                        {/* Text */}
                        {displayText && <p style={{ margin: 0, wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{displayText}</p>}
                        {/* Translated text (if translated) */}
                        {translatedMessages[msg.id] && (
                          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.85, fontStyle: 'italic', borderTop: `1px solid ${mine ? 'rgba(255,255,255,0.2)' : border}`, paddingTop: 4 }}>
                            🌐 {translatedMessages[msg.id]}
                          </p>
                        )}

                        {/* Translate button — only for plain text messages */}
                        {displayText && !msg.deletedForEveryone && !filePayload && !locationPayload && (
                          <button
                            onClick={async () => {
                              if (translatedMessages[msg.id]) {
                                setTranslatedMessages(prev => { const n = { ...prev }; delete n[msg.id]; return n; });
                                return;
                              }
                              setTranslatingId(msg.id);
                              try {
                                const targetLang = /[\u0600-\u06FF]/.test(displayText) ? 'en' : 'ar';
                                const res = await api.translateMessage(msg.id, displayText, targetLang);
                                setTranslatedMessages(prev => ({ ...prev, [msg.id]: res.translated }));
                              } catch {
                                const event = new CustomEvent('nawaqes-toast', { detail: { message: 'فشل الترجمة', type: 'error' } });
                                window.dispatchEvent(event);
                              } finally { setTranslatingId(null); }
                            }}
                            style={{ background: 'none', border: 'none', color: mine ? 'rgba(255,255,255,0.6)' : mutedColor, cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}
                            title="ترجمة"
                          >
                            {translatingId === msg.id ? <Loader2 className="animate-spin" style={{ width: 10, height: 10 }} /> : <Languages style={{ width: 10, height: 10 }} />}
                            {translatedMessages[msg.id] ? 'إخفاء' : 'ترجم'}
                          </button>
                        )}

                        {/* Reactions */}
                        {renderReactions(msg)}

                        {/* Timestamp + read receipt — WhatsApp-style inline at bottom-right */}
                        <span style={{
                          fontSize: '0.65rem',
                          color: mine
                            ? (isDark ? 'rgba(233,237,239,0.6)' : 'rgba(17,27,33,0.55)')
                            : mutedColor,
                          marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
                          float: 'inline-end',
                        }}>
                          {msg.isEdited && !msg.deletedForEveryone && <span style={{ opacity: 0.7 }}>مُعدّلة</span>}
                          {formatRelativeTimeAr(msg.createdAt)}
                          {msg.isPinned && <Pin style={{ width: 10, height: 10, color: '#F59E0B', transform: 'rotate(45deg)' }} />}
                          {mine && !msg.deletedForEveryone && (
                            msg.read
                              ? <CheckCheck style={{ width: 14, height: 14, color: tickBlue }} />
                              : <CheckCheck style={{ width: 14, height: 14, color: isDark ? 'rgba(233,237,239,0.5)' : 'rgba(17,27,33,0.45)' }} />
                          )}
                        </span>

                        {/* Hover action bar (only when NOT in select mode and not deleted) */}
                        {!selectMode && !msg.deletedForEveryone && (
                          <div
                            className="msg-actions"
                            style={{
                              position: 'absolute', top: -10, [mine ? 'left' : 'right']: 0,
                              background: cardBg, border: `1px solid ${border}`, borderRadius: 16,
                              padding: '2px 4px', display: 'none', gap: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                              zIndex: 5,
                            }}
                          >
                            <button onClick={() => setReplyTo(msg)} title="رد" style={actionBtnStyle}>
                              <Reply style={{ width: 14, height: 14 }} />
                            </button>
                            <button onClick={() => setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)} title="تفاعل" style={actionBtnStyle}>
                              <Smile style={{ width: 14, height: 14 }} />
                            </button>
                            <button onClick={() => togglePinMessage(msg.id)} title={msg.isPinned ? 'إلغاء التثبيت' : 'تثبيت'} style={actionBtnStyle}>
                              {msg.isPinned ? <PinOff style={{ width: 14, height: 14 }} /> : <Pin style={{ width: 14, height: 14, transform: 'rotate(45deg)' }} />}
                            </button>
                            <button onClick={() => setShowForwardDialog(msg.id)} title="تمرير" style={actionBtnStyle}>
                              <Forward style={{ width: 14, height: 14 }} />
                            </button>
                            {mine && displayText && (
                              <button onClick={() => startEditMessage(msg)} title="تعديل" style={actionBtnStyle}>
                                <Edit2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                            {mine && (
                              <button
                                onClick={() => setConfirmDeleteFor({ messageId: msg.id, forEveryone: true })}
                                title="حذف للجميع"
                                style={{ ...actionBtnStyle, color: dangerColor }}
                              >
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Reaction picker */}
                        {reactionPickerFor === msg.id && (
                          <div style={{
                            position: 'absolute', bottom: '100%', [mine ? 'left' : 'right']: 0, marginBottom: 4,
                            background: cardBg, border: `1px solid ${border}`, borderRadius: 20,
                            padding: '4px 6px', display: 'flex', gap: 2, boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                            zIndex: 10,
                          }}>
                            {QUICK_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => reactToMessage(msg.id, emoji)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '4px 6px', borderRadius: 8 }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              {typingPeer === selectedContact && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 8 }}>
                  <div style={{ padding: '8px 14px', background: bubbleTheirs, borderRadius: '16px 16px 16px 4px', display: 'flex', gap: 4 }}>
                    <span className="typing-dot" style={{ width: 6, height: 6, background: mutedColor, borderRadius: '50%', animation: 'typing 1.4s infinite' }} />
                    <span className="typing-dot" style={{ width: 6, height: 6, background: mutedColor, borderRadius: '50%', animation: 'typing 1.4s infinite 0.2s' }} />
                    <span className="typing-dot" style={{ width: 6, height: 6, background: mutedColor, borderRadius: '50%', animation: 'typing 1.4s infinite 0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
              <style>{`
                .typing-dot { animation-name: typing; }
                @keyframes typing {
                  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                  30% { transform: translateY(-6px); opacity: 1; }
                }
                div:hover > div > .msg-actions { display: flex !important; }
              `}</style>
            </div>

            {/* Reply / Edit preview bar */}
            {(replyTo || editingMessage) && (
              <div style={{ padding: '8px 16px', background: cardBg, borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem' }}>
                {editingMessage ? <Edit2 style={{ width: 16, height: 16, color: accentLight }} /> : <Reply style={{ width: 16, height: 16, color: accentLight }} />}
                <div style={{ flex: 1, borderRight: `3px solid ${accentColor}`, paddingRight: 10 }}>
                  <div style={{ fontWeight: 700, color: accentLight, fontSize: '0.75rem' }}>
                    {editingMessage ? 'تعديل الرسالة' : `رد على ${replyTo?.senderId === userId ? 'نفسك' : selectedContactData?.name || ''}`}
                  </div>
                  <div style={{ color: mutedColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {editingMessage?.text || replyTo?.text || '📷 صورة' || '🎙️ صوت'}
                  </div>
                </div>
                <button onClick={() => { setReplyTo(null); cancelEdit(); }} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: 4 }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
            )}

            {/* Multi-select toolbar */}
            {selectMode && selectedMessageIds.size > 0 && (
              <div style={{ padding: '10px 16px', background: cardBg, borderTop: `1px solid ${border}`, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
                <button onClick={() => setConfirmDeleteFor({ messageId: '', forEveryone: false })}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: dangerColor, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                  <Trash2 style={{ width: 16, height: 16 }} /> حذف المحدد ({selectedMessageIds.size})
                </button>
              </div>
            )}

            {/* ── Chat V2: Disappearing messages indicator ── */}
            {disappearingTTL > 0 && !selectMode && (
              <div style={{ padding: '6px 16px', background: 'rgba(139, 92, 246, 0.1)', borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Clock style={{ width: 12, height: 12, color: accentColor }} />
                <span style={{ fontSize: '0.7rem', color: accentColor, fontWeight: 600 }}>
                  {disappearingTTL === 86400 ? 'الرسائل تُحذف خلال 24 ساعة' : disappearingTTL === 604800 ? 'الرسائل تُحذف خلال 7 أيام' : `الرسائل تُحذف خلال ${disappearingTTL / 3600} ساعات`}
                </span>
              </div>
            )}

            {/* ── Chat V2: AI Smart Replies bar ── */}
            {/* 🔧 FIX v3: suggestions appear ABOVE the input field (like
                Telegram/WhatsApp quick replies). The input bar stays at
                the very bottom of the screen — that's where users expect
                it. Suggestions are a row of chips just above the input,
                so they're visible but don't push the input up. */}
            {aiSuggestions.length > 0 && !selectMode && !recording && !editingMessage && (
              <div style={{ padding: '6px 12px', background: cardBg, borderTop: `1px solid ${border}`, display: 'flex', gap: 6, overflowX: 'auto', flexShrink: 0 }} className="no-scrollbar">
                {aiSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => { onMessageTextChange(suggestion); sendMessage(); }}
                    style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '16px', border: `1px solid ${border}`, background: inputBg, color: textColor, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = accentColor; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = inputBg; e.currentTarget.style.color = textColor; }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Input bar — WhatsApp-style: + attach / emoji / mic / send */}
            {/* 🔧 FIX v3: this is now the LAST element — at the very bottom
                of the chat screen. Suggestions (above) sit just on top of it. */}
            {!selectMode && (
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${border}`, display: 'flex', alignItems: 'flex-end', gap: '6px', background: cardBg, boxSizing: 'border-box', flexShrink: 0, maxWidth: '100%', minWidth: 0 }}>
                {/* Hidden file inputs for attachment picker */}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ''; }} />
                <input ref={fileUploadInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ''; }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ''; }} />

                {recording ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: inputBg, borderRadius: 22, padding: '10px 16px', minWidth: 0 }}>
                    <span style={{ width: 10, height: 10, background: dangerColor, borderRadius: '50%', animation: 'pulse 1s infinite', flexShrink: 0 }} />
                    <span style={{ color: textColor, fontSize: '0.85rem' }}>يسجّل… {fmtDuration(recordingSeconds)}</span>
                    <button onClick={() => stopRecording(false)} style={{ marginRight: 'auto', background: 'none', border: 'none', color: dangerColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <Trash2 style={{ width: 18, height: 18 }} /> إلغاء
                    </button>
                    <button onClick={() => stopRecording(true)} style={{ background: accentColor, border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Send style={{ width: 18, height: 18, color: '#fff', transform: 'scaleX(-1)' }} />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Attachment (+) button — opens attachment picker */}
                    <button
                      onClick={() => setAttachmentPickerOpen(true)}
                      style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px', flexShrink: 0, borderRadius: '50%', transition: 'color 0.15s' }}
                      title="إرفاق ملف"
                      onMouseEnter={e => e.currentTarget.style.color = accentColor}
                      onMouseLeave={e => e.currentTarget.style.color = mutedColor}
                    >
                      <PlusCircle style={{ width: 24, height: 24 }} />
                    </button>
                    {/* Quick image shortcut (gallery) */}
                    <button onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px', flexShrink: 0, borderRadius: '50%' }} title="إرسال صورة">
                      <ImageIcon style={{ width: 22, height: 22 }} />
                    </button>
                    {/* Quick camera shortcut (mobile capture) */}
                    <button onClick={() => cameraInputRef.current?.click()} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px', flexShrink: 0, borderRadius: '50%' }} title="التقاط صورة">
                      <Camera style={{ width: 22, height: 22 }} />
                    </button>
                    {/* Voice-record button */}
                    <button onClick={startRecording} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px', flexShrink: 0, borderRadius: '50%' }} title="رسالة صوتية">
                      <Mic style={{ width: 22, height: 22 }} />
                    </button>
                    {/* ── Chat V2: Schedule button ── */}
                    <button
                      onClick={() => setShowScheduleDialog(true)}
                      style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: '8px', flexShrink: 0, borderRadius: '50%' }}
                      title="جدولة رسالة"
                    >
                      <CalendarClock style={{ width: 22, height: 22 }} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0, background: inputBg, borderRadius: 22, display: 'flex', alignItems: 'center', padding: '0 4px 0 16px' }}>
                      <textarea
                        ref={messageTextareaRef}
                        placeholder={editingMessage ? 'تعديل الرسالة...' : 'اكتب رسالة...'}
                        value={messageText}
                        onChange={e => onMessageTextChange(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                          if (e.key === 'Escape') { if (editingMessage) cancelEdit(); if (replyTo) setReplyTo(null); }
                        }}
                        rows={1}
                        style={{
                          flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                          padding: '12px 4px', color: textColor, fontSize: '15px',
                          outline: 'none', resize: 'none',
                          height: 44, maxHeight: 44,
                          overflowY: 'auto', overflowX: 'hidden',
                          lineHeight: '1.4', fontFamily: 'inherit',
                        }}
                      />
                      {uploadingFile && <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: accentColor, marginInlineEnd: 8, marginBottom: 12 }} />}
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={sending || (!messageText.trim() && !editingMessage)}
                      style={{
                        background: (sending || (!messageText.trim() && !editingMessage)) ? `${accentColor}55` : accentColor,
                        border: 'none', borderRadius: '50%', width: 44, height: 44, minWidth: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        flexShrink: 0, transition: 'background 0.15s',
                      }}
                    >
                      {sending ? <Loader2 className="animate-spin" style={{ width: 20, height: 20, color: '#fff' }} /> : (editingMessage ? <Check style={{ width: 20, height: 20, color: '#fff' }} /> : <Send style={{ width: 20, height: 20, color: '#fff', transform: 'scaleX(-1)' }} />)}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── Chat V2: Schedule dialog ── */}
            {showScheduleDialog && selectedContact && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={() => setShowScheduleDialog(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, padding: 20, maxWidth: 360, width: '100%', border: `1px solid ${border}` }}>
                  <h3 style={{ color: textColor, fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>جدولة رسالة</h3>
                  <textarea
                    placeholder="اكتب الرسالة..."
                    value={scheduleText}
                    onChange={e => setScheduleText(e.target.value)}
                    rows={3}
                    style={{ width: '100%', background: inputBg, border: `1px solid ${border}`, borderRadius: 12, padding: 10, color: textColor, fontSize: '0.85rem', outline: 'none', resize: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, borderRadius: 8, padding: 8, color: textColor, fontSize: '0.8rem', outline: 'none' }} />
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, borderRadius: 8, padding: 8, color: textColor, fontSize: '0.8rem', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowScheduleDialog(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: inputBg, color: mutedColor, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>إلغاء</button>
                    <button
                      onClick={async () => {
                        if (!scheduleText.trim() || !scheduleDate || !scheduleTime) return;
                        const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
                        try {
                          await api.scheduleMessage({ receiverId: selectedContact, text: scheduleText.trim(), scheduledAt });
                          setShowScheduleDialog(false);
                          setScheduleText('');
                          setScheduleDate('');
                          setScheduleTime('');
                          // Show success toast
                          const event = new CustomEvent('nawaqes-toast', { detail: { message: 'تمت جدولة الرسالة ✅', type: 'success' } });
                          window.dispatchEvent(event);
                        } catch (e: any) {
                          const event = new CustomEvent('nawaqes-toast', { detail: { message: e.message || 'فشل الجدولة', type: 'error' } });
                          window.dispatchEvent(event);
                        }
                      }}
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: accentGradient, color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                    >جدولة</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Chat V2: Disappearing messages toggle (in contact menu) ── */}
            {showContactMenu && selectedContactData && !selectedContactData.isGroup && (
              <div style={{ position: 'absolute', top: 56, left: 16, background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: 6, minWidth: 220, zIndex: 50, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <button onClick={() => { setSelectMode(true); setShowContactMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: textColor, cursor: 'pointer', borderRadius: 8, fontSize: '0.85rem' }}>
                  <CheckCircle2 style={{ width: 16, height: 16 }} /> تحديد رسائل
                </button>
                <button onClick={async () => {
                  const newTTL = disappearingTTL > 0 ? 0 : 86400;
                  setDisappearingTTL(newTTL);
                  try { await api.updateConversationSettings(selectedContact!, { disappearing_ttl: newTTL }); } catch {}
                  setShowContactMenu(false);
                }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: disappearingTTL > 0 ? accentColor : textColor, cursor: 'pointer', borderRadius: 8, fontSize: '0.85rem' }}>
                  <Clock style={{ width: 16, height: 16 }} /> {disappearingTTL > 0 ? 'إيقاف الرسائل المؤقتة' : 'تفعيل الرسائل المؤقتة (24 ساعة)'}
                </button>
                <button onClick={() => selectedContact && toggleMute(selectedContact, !!isGroupChat)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: textColor, cursor: 'pointer', borderRadius: 8, fontSize: '0.85rem' }}>
                  {selectedContactData.isMuted ? <Bell style={{ width: 16, height: 16 }} /> : <BellOff style={{ width: 16, height: 16 }} />}
                  {selectedContactData.isMuted ? 'إلغاء الكتم' : 'كتم الإشعارات'}
                </button>
                <button onClick={() => selectedContact && toggleBlock(selectedContact)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'none', border: 'none', color: dangerColor, cursor: 'pointer', borderRadius: 8, fontSize: '0.85rem' }}>
                  <Ban style={{ width: 16, height: 16 }} /> {selectedContactData.isBlocked ? 'إلغاء الحظر' : 'حظر المستخدم'}
                </button>
              </div>
            )}

            {/* ── Chat V3: AI Summary Modal ── */}
            {showAISummary && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowAISummary(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, padding: 20, maxWidth: 400, width: '100%', border: `1px solid ${border}`, maxHeight: '80vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: accentGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles style={{ width: 18, height: 18, color: '#fff' }} />
                    </div>
                    <h3 style={{ color: textColor, fontSize: '1rem', fontWeight: 700, flex: 1 }}>المساعد الذكي</h3>
                    <button onClick={() => setShowAISummary(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 18, height: 18 }} /></button>
                  </div>
                  {aiLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                      <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: accentColor }} />
                      <span style={{ color: mutedColor, fontSize: '0.85rem', marginRight: 8 }}>جاري التحليل...</span>
                    </div>
                  ) : (
                    <div style={{ background: inputBg, borderRadius: 12, padding: 14, whiteSpace: 'pre-wrap', color: textColor, fontSize: '0.85rem', lineHeight: 1.6 }}>
                      {aiSummary}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Chat V3: Payment Dialog ── */}
            {showPaymentDialog && selectedContact && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={() => setShowPaymentDialog(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: cardBg, borderRadius: 16, padding: 20, maxWidth: 360, width: '100%', border: `1px solid ${border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: accentGradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Wallet style={{ width: 18, height: 18, color: '#fff' }} />
                    </div>
                    <h3 style={{ color: textColor, fontSize: '1rem', fontWeight: 700, flex: 1 }}>تحويل أموال</h3>
                    <button onClick={() => setShowPaymentDialog(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 18, height: 18 }} /></button>
                  </div>
                  <p style={{ color: mutedColor, fontSize: '0.8rem', marginBottom: 12 }}>إرسال إلى: <strong style={{ color: textColor }}>{selectedContactData?.name}</strong></p>
                  <input
                    type="number"
                    placeholder="المبلغ بالجنيه"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    style={{ width: '100%', background: inputBg, border: `1px solid ${border}`, borderRadius: 12, padding: 12, color: textColor, fontSize: '1.1rem', fontWeight: 700, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    placeholder="ملاحظة (اختياري)"
                    value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                    style={{ width: '100%', background: inputBg, border: `1px solid ${border}`, borderRadius: 12, padding: 10, color: textColor, fontSize: '0.85rem', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowPaymentDialog(false); setPaymentAmount(''); setPaymentNote(''); }} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: inputBg, color: mutedColor, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>إلغاء</button>
                    <button
                      onClick={async () => {
                        const amt = parseFloat(paymentAmount);
                        if (!amt || amt <= 0) return;
                        try {
                          await api.sendChatPayment(selectedContact, amt, paymentNote || undefined);
                          setShowPaymentDialog(false);
                          setPaymentAmount('');
                          setPaymentNote('');
                          const event = new CustomEvent('nawaqes-toast', { detail: { message: `تم تحويل ${amt} ج.م ✅`, type: 'success' } });
                          window.dispatchEvent(event);
                        } catch (e: any) {
                          const event = new CustomEvent('nawaqes-toast', { detail: { message: e.message || 'فشل التحويل', type: 'error' } });
                          window.dispatchEvent(event);
                        }
                      }}
                      style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: accentGradient, color: '#fff', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                    >تحويل</button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: mutedColor }}>
            <div style={{ textAlign: 'center' }}><MessageCircle style={{ width: 48, height: 48, margin: '0 auto 12px', opacity: 0.3 }} /><p>اختر محادثة</p></div>
          </div>
        )}
      </div>

      {/* ============ New Chat Dialog ============ */}
      {showNewChat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowNewChat(false)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${border}` }}>
              <h3 style={{ flex: 1, fontWeight: 700, color: textColor }}>محادثة جديدة</h3>
              <button onClick={() => setShowNewChat(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: inputBg, borderRadius: '10px', padding: '10px 14px' }}>
                <Search style={{ width: 16, height: 16, color: mutedColor }} />
                <input type="text" placeholder="ابحث عن أصدقاء أو مستخدمين..." value={newChatSearch} onChange={e => setNewChatSearch(e.target.value)} style={{ background: 'none', border: 'none', color: textColor, outline: 'none', flex: 1, fontSize: '14px' }} autoFocus />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allUsers.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: mutedColor, fontSize: '0.85rem' }}>
                  {newChatSearch.trim() ? 'لا توجد نتائج' : 'لا يوجد أصدقاء بعد. ابحث عن مستخدمين بالاسم.'}
                </div>
              ) : allUsers.map((u: any) => (
                <div key={u.id} onClick={() => startNewChat(u.id, u.name, u.avatar || getDefaultAvatar(u.name, u.gender))} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <img src={u.avatar || getDefaultAvatar(u.name, u.gender)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: textColor, display: 'block' }}>{u.name}</span>
                    {u.is_verified && <span style={{ fontSize: '0.7rem', color: accentColor }}>✓ موثّق</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ Create Group Dialog ============ */}
      {showCreateGroup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreateGroup(false)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${border}` }}>
              <Users style={{ width: 22, height: 22, color: accentColor }} />
              <h3 style={{ flex: 1, fontWeight: 700, color: textColor }}>إنشاء مجموعة جديدة</h3>
              <button onClick={() => setShowCreateGroup(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: `1px solid ${border}` }}>
              <input type="text" placeholder="اسم المجموعة" value={groupName} onChange={e => setGroupName(e.target.value)} style={{ background: inputBg, border: 'none', borderRadius: 10, padding: '12px 14px', color: textColor, fontSize: '14px', outline: 'none' }} />
              <input type="text" placeholder="وصف المجموعة (اختياري)" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} style={{ background: inputBg, border: 'none', borderRadius: 10, padding: '12px 14px', color: textColor, fontSize: '14px', outline: 'none' }} />
            </div>
            <div style={{ padding: '10px 16px', fontSize: '0.8rem', color: mutedColor, borderBottom: `1px solid ${border}` }}>
              اختر الأعضاء ({selectedMembers.size} محدد)
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allUsers.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: mutedColor, fontSize: '0.85rem' }}>لا يوجد أصدقاء. أضف أصدقاء أولاً.</div>
              ) : allUsers.map((u: any) => {
                const checked = selectedMembers.has(u.id);
                return (
                  <div key={u.id} onClick={() => {
                    setSelectedMembers(prev => {
                      const next = new Set(Array.from(prev));
                      if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                      return next;
                    });
                  }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${checked ? accentColor : mutedColor}`, background: checked ? accentColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {checked && <Check style={{ width: 12, height: 12, color: '#fff' }} />}
                    </div>
                    <img src={u.avatar || getDefaultAvatar(u.name, u.gender)} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: textColor }}>{u.name}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: 16, borderTop: `1px solid ${border}` }}>
              <button onClick={createGroup} disabled={!groupName.trim() || selectedMembers.size === 0}
                style={{ width: '100%', padding: '14px', background: accentColor, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', opacity: (!groupName.trim() || selectedMembers.size === 0) ? 0.5 : 1 }}>
                إنشاء المجموعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Group Info Dialog ============ */}
      {showGroupInfo && groupInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowGroupInfo(false)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${border}` }}>
              <h3 style={{ flex: 1, fontWeight: 700, color: textColor }}>معلومات المجموعة</h3>
              <button onClick={() => setShowGroupInfo(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ padding: 20, textAlign: 'center', borderBottom: `1px solid ${border}` }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: inputBg, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users style={{ width: 36, height: 36, color: mutedColor }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: textColor }}>{groupInfo.name}</h3>
              {groupInfo.description && <p style={{ color: mutedColor, fontSize: '0.85rem', marginTop: 4 }}>{groupInfo.description}</p>}
              <p style={{ color: mutedColor, fontSize: '0.8rem', marginTop: 8 }}>{groupInfo.members.length} عضو</p>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>الأعضاء</span>
              {groupInfo.createdBy === userId && (
                <button onClick={() => setShowAddMember(true)} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus style={{ width: 14, height: 14 }} /> إضافة
                </button>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {groupInfo.members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                  <img src={m.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.name}</span>
                    {m.id === userId && <span style={{ fontSize: '0.7rem', color: mutedColor, marginRight: 6 }}>(أنت)</span>}
                  </div>
                  {m.role === 'admin' && <Crown style={{ width: 14, height: 14, color: '#F59E0B' }} />}
                  {groupInfo.createdBy === userId && m.id !== userId && (
                    <button onClick={() => removeMember(groupInfo.id, m.id)} style={{ background: 'none', border: 'none', color: dangerColor, cursor: 'pointer', padding: 4 }}>
                      <UserMinus style={{ width: 16, height: 16 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: 16, borderTop: `1px solid ${border}` }}>
              <button onClick={() => leaveGroup(groupInfo.id)} style={{ width: '100%', padding: '12px', background: 'transparent', color: dangerColor, border: `1px solid ${dangerColor}`, borderRadius: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CloudOff style={{ width: 18, height: 18 }} /> مغادرة المجموعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Add Member Dialog ============ */}
      {showAddMember && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }} onClick={() => setShowAddMember(false)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${border}` }}>
              <h3 style={{ flex: 1, fontWeight: 700 }}>إضافة عضو</h3>
              <button onClick={() => setShowAddMember(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {allUsers.filter(u => !groupInfo?.members.find(m => m.id === u.id)).map(u => (
                <div key={u.id} onClick={() => addGroupMember(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}>
                  <img src={u.avatar || getDefaultAvatar(u.name, u.gender)} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.name}</span>
                  <Plus style={{ width: 16, height: 16, color: accentColor, marginRight: 'auto' }} />
                </div>
              ))}
              {allUsers.filter(u => !groupInfo?.members.find(m => m.id === u.id)).length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: mutedColor, fontSize: '0.85rem' }}>جميع أصدقائك في المجموعة بالفعل</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ Forward Dialog ============ */}
      {showForwardDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowForwardDialog(null)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: `1px solid ${border}` }}>
              <Forward style={{ width: 20, height: 20, color: accentColor }} />
              <h3 style={{ flex: 1, fontWeight: 700 }}>تمرير إلى...</h3>
              <button onClick={() => setShowForwardDialog(null)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {contacts.map(c => (
                <div key={c.id} onClick={() => forwardMessage(showForwardDialog, c.isGroup ? c.id.replace('group_', '') : c.id, !!c.isGroup)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}>
                  {c.isGroup ? (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: inputBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users style={{ width: 18, height: 18, color: mutedColor }} />
                    </div>
                  ) : (
                    <img src={c.avatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</span>
                </div>
              ))}
              {contacts.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: mutedColor, fontSize: '0.85rem' }}>لا توجد محادثات</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ Media Gallery Dialog ============ */}
      {showMediaGallery && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowMediaGallery(false)}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: `1px solid ${border}` }}>
              <ImageIcon style={{ width: 20, height: 20, color: accentColor }} />
              <h3 style={{ flex: 1, fontWeight: 700 }}>الوسائط المشتركة</h3>
              <button onClick={() => setShowMediaGallery(false)} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 16, flex: 1 }}>
              {mediaItems.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: mutedColor }}>
                  <ImageOff style={{ width: 48, height: 48, margin: '0 auto 12px', opacity: 0.3 }} />
                  <p>لا توجد وسائط بعد</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {mediaItems.map((m: any) => (
                    <div key={m.id} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: inputBg, cursor: 'pointer' }}
                      onClick={() => m.image_url && setImagePreview(m.image_url)}>
                      {m.image_url ? (
                        <img src={m.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : m.voice_url ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Mic style={{ width: 24, height: 24, color: mutedColor }} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ Global Search Dialog ============ */}
      {showGlobalSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setShowGlobalSearch(false); setGlobalSearch(''); setGlobalSearchResults([]); }}>
          <div style={{ background: cardBg, borderRadius: '16px', width: '90%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: `1px solid ${border}` }}>
              <Search style={{ width: 20, height: 20, color: accentColor }} />
              <input type="text" placeholder="ابحث في كل المحادثات..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} autoFocus
                style={{ flex: 1, background: inputBg, border: 'none', borderRadius: 10, padding: '10px 14px', color: textColor, fontSize: '14px', outline: 'none' }} />
              <button onClick={() => { setShowGlobalSearch(false); setGlobalSearch(''); setGlobalSearchResults([]); }} style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer' }}><X style={{ width: 20, height: 20 }} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {globalSearch.trim() === '' ? (
                <div style={{ padding: 40, textAlign: 'center', color: mutedColor }}>
                  <ScrollText style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.85rem' }}>اكتب كلمة للبحث في كل محادثاتك</p>
                </div>
              ) : globalSearchResults.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: mutedColor, fontSize: '0.85rem' }}>لا توجد نتائج</div>
              ) : (
                globalSearchResults.map(r => (
                  <div key={r.contactId} style={{ padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
                    <div style={{ fontWeight: 700, color: accentLight, fontSize: '0.85rem', marginBottom: 6 }}>{r.contactName}</div>
                    {r.matches.slice(0, 3).map((m: ChatMessage) => (
                      <div key={m.id} onClick={() => { setSelectedContact(r.contactId); navigate({ search: `?chat=${r.contactId}` }); setShowGlobalSearch(false); }}
                        style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', color: mutedColor }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        {m.text.substring(0, 80)}...
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ Confirm Delete Dialog ============ */}
      {confirmDeleteFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setConfirmDeleteFor(null)}>
          <div style={{ background: cardBg, borderRadius: '16px', padding: 24, width: '90%', maxWidth: '360px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <AlertTriangle style={{ width: 40, height: 40, color: dangerColor, margin: '0 auto 12px' }} />
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>تأكيد الحذف</h3>
            <p style={{ color: mutedColor, fontSize: '0.85rem', marginBottom: 20 }}>
              {selectedMessageIds.size > 0 || !confirmDeleteFor.messageId
                ? `سيتم حذف ${selectedMessageIds.size} رسالة. لا يمكن التراجع.`
                : 'سيتم حذف الرسالة للجميع. لا يمكن التراجع.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDeleteFor(null)} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${border}`, color: textColor, borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                إلغاء
              </button>
              <button onClick={() => deleteSelectedMessages(confirmDeleteFor.forEveryone)} style={{ flex: 1, padding: '12px', background: dangerColor, border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ Image Preview Lightbox (with pinch-to-zoom) ============ */}
      {imagePreview && (
        <PinchZoomLightbox src={imagePreview} onClose={() => setImagePreview(null)} />
      )}

      {/* ============ Long-press Context Menu ============ */}
      <MessageContextMenu
        message={contextMenuFor}
        isOpen={!!contextMenuFor}
        onClose={() => setContextMenuFor(null)}
        onReact={(emoji) => {
          if (contextMenuFor) reactToMessage(contextMenuFor.id, emoji);
        }}
        onAction={(action) => {
          if (!contextMenuFor) return;
          switch (action.type) {
            case 'reply': setReplyTo(contextMenuFor); break;
            case 'forward': setShowForwardDialog(contextMenuFor.id); break;
            case 'copy':
              if (contextMenuFor.text) {
                navigator.clipboard?.writeText(contextMenuFor.text).catch(() => {});
              }
              break;
            case 'pin': togglePinMessage(contextMenuFor.id); break;
            case 'unpin': togglePinMessage(contextMenuFor.id); break;
            case 'edit': startEditMessage(contextMenuFor); break;
            case 'delete':
              if (contextMenuFor.senderId === userId) {
                setConfirmDeleteFor({ messageId: contextMenuFor.id, forEveryone: true });
              }
              break;
          }
        }}
        actions={[
          { type: 'reply', label: 'رد', icon: <Reply style={{ width: 20, height: 20 }} /> },
          { type: 'forward', label: 'تمرير', icon: <Forward style={{ width: 20, height: 20 }} /> },
          ...(contextMenuFor?.text ? [{ type: 'copy' as const, label: 'نسخ النص', icon: <Copy style={{ width: 20, height: 20 }} /> }] : []),
          { type: 'pin', label: contextMenuFor?.isPinned ? 'إلغاء التثبيت' : 'تثبيت', icon: contextMenuFor?.isPinned ? <PinOff style={{ width: 20, height: 20 }} /> : <Pin style={{ width: 20, height: 20 }} /> },
          ...(contextMenuFor?.senderId === userId && contextMenuFor?.text ? [{ type: 'edit' as const, label: 'تعديل', icon: <Edit2 style={{ width: 20, height: 20 }} /> }] : []),
          ...(contextMenuFor?.senderId === userId ? [{ type: 'delete' as const, label: 'حذف للجميع', icon: <Trash2 style={{ width: 20, height: 20 }} />, danger: true }] : []),
        ]}
      />

      {/* ============ Attachment Picker (bottom sheet) ============ */}
      <AttachmentPicker
        isOpen={attachmentPickerOpen}
        onClose={() => setAttachmentPickerOpen(false)}
        onPick={onAttachmentPick}
        colors={{ cardBg, textColor, mutedColor, border, accentColor }}
      />

      {/* ============ Mute Duration Dialog (DND) ============ */}
      <MuteDurationDialog
        isOpen={!!muteDialogFor}
        contactName={muteDialogFor?.name || ''}
        onClose={() => setMuteDialogFor(null)}
        onMute={(minutes) => {
          if (!muteDialogFor || !selectedContact) return;
          if (muteDialogFor.isMuted && minutes == null) {
            // Already muted + user picked "indefinite" → just keep muted
            setMuteDialogFor(null);
            return;
          }
          if (muteDialogFor.isMuted) {
            // Already muted → user wants to extend or change → unmute first
            toggleMute(selectedContact, !!isGroupChat);
            setTimeout(() => muteWithDuration(selectedContact, !!isGroupChat, minutes), 100);
          } else {
            muteWithDuration(selectedContact, !!isGroupChat, minutes);
          }
        }}
        colors={{ cardBg, textColor, mutedColor, border, inputBg, accentColor }}
      />

      {/* ============ WebRTC Call Overlay (audio + video) ============ */}
      <AnimatePresence>
        {(callHook.activeCall || callHook.incomingCall) && (
          <CallOverlay
            activeCall={callHook.activeCall}
            incomingCall={callHook.incomingCall}
            callState={callHook.callState}
            callDuration={callHook.callDuration}
            isMuted={callHook.isMuted}
            isCameraOff={callHook.isCameraOff}
            callError={callHook.callError}
            localVideoRef={callHook.localVideoRef}
            remoteVideoRef={callHook.remoteVideoRef}
            onAccept={callHook.acceptIncomingCall}
            onReject={callHook.rejectIncomingCall}
            onEnd={callHook.endCall}
            onToggleMute={callHook.toggleMute}
            onToggleCamera={callHook.toggleCamera}
            // V4 enhancements
            isScreenSharing={callHook.isScreenSharing}
            isRecording={callHook.isRecording}
            isVirtualBgOn={callHook.isVirtualBgOn}
            isSpeakerOn={callHook.isSpeakerOn}
            cameraFacing={callHook.cameraFacing}
            recordingSeconds={callHook.recordingSeconds}
            onToggleScreenShare={callHook.toggleScreenShare}
            onToggleRecording={callHook.toggleRecording}
            onToggleVirtualBg={callHook.toggleVirtualBackground}
            onToggleSpeaker={callHook.toggleSpeaker}
            onSwitchCamera={callHook.switchCamera}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Style helper for action buttons ──────────────────────────────
const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94A3B8',
  cursor: 'pointer', padding: '4px 6px', borderRadius: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// ─── Mapper: API → ChatMessage ────────────────────────────────────
function mapMessage(data: any): ChatMessage {
  // Parse file/location payloads that may be encoded as JSON in text
  let text = data.text || '';
  let imageUrl = data.image_url || data.imageUrl || '';
  let messageType = data.message_type || data.messageType || 'text';
  let fileUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: number | undefined;
  let fileMimeType: string | undefined;
  let location: { lat: number; lng: number; name?: string } | undefined;

  // Detect JSON-encoded file/location payloads in text
  if (typeof text === 'string' && text.startsWith('{') && (text.includes('"__file"') || text.includes('"__location"'))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.__file) {
        fileUrl = parsed.url || imageUrl;
        fileName = parsed.filename;
        fileSize = parsed.size;
        fileMimeType = parsed.mimeType;
        messageType = 'file';
        text = ''; // hide JSON from UI
        if (parsed.url && !imageUrl) imageUrl = parsed.url;
      } else if (parsed?.__location) {
        location = { lat: parsed.lat, lng: parsed.lng, name: parsed.name };
        messageType = 'location';
        text = '';
      }
    } catch {}
  }

  // Also handle server-side `file_url` / `file_name` fields if present
  if (data.file_url || data.fileUrl) {
    fileUrl = data.file_url || data.fileUrl;
    fileName = data.file_name || data.fileName || fileName;
    fileSize = data.file_size || data.fileSize || fileSize;
    fileMimeType = data.file_mimeType || data.fileMimeType || fileMimeType;
    messageType = 'file';
  }

  return {
    id: data.id,
    senderId: data.sender_id || data.senderId,
    receiverId: data.receiver_id || data.receiverId,
    text,
    messageType,
    imageUrl,
    voiceUrl: data.voice_url || data.voiceUrl || '',
    voiceDuration: data.voice_duration || data.voiceDuration || 0,
    fileUrl,
    fileName,
    fileSize,
    fileMimeType,
    location,
    createdAt: data.created_at || data.createdAt || new Date().toISOString(),
    read: !!(data.read !== undefined ? data.read : data.delivered),
    isForwarded: !!(data.is_forwarded || data.isForwarded),
    forwardedFrom: data.forwarded_from || data.forwardedFrom || '',
    groupId: data.group_id || data.groupId,
    replyToId: data.reply_to_id || data.replyToId,
    replyToText: data.reply_to_text || data.replyToText,
    replyToSender: data.reply_to_sender || data.replyToSender,
    reactions: (() => {
      try { return JSON.parse(data.reactions || '{}'); } catch { return {}; }
    })(),
    isPinned: !!(data.is_pinned ?? data.isPinned),
    isEdited: !!(data.is_edited ?? data.isEdited),
    deletedForEveryone: (data.deleted_for === 'everyone' || data.deletedFor === 'everyone'),
  };
}
