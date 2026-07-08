import React, { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { ChatMessage, ChatContact, ChatGroup, ChatGroupMember } from '../../types';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from '../../lib/silentToast';
import { isUserOnline } from '../../utils/presence';

// ─── Types ─────────────────────────────────────────────────────────────
export type CallStateType = 'idle' | 'outgoing' | 'incoming' | 'connected';

export interface ActiveCallInfo {
  type: 'audio' | 'video';
  contactId: string;
  contactName: string;
  contactAvatar: string;
}

export interface IncomingCallInfo {
  fromId: string;
  fromName: string;
  fromAvatar: string;
  type: 'audio' | 'video';
  offer?: RTCSessionDescriptionInit;
}

export interface ContextMenuInfo {
  messageId: string;
  x: number;
  y: number;
}

export interface ChatContextType {
  // State
  contacts: ChatContact[];
  selectedContactId: string | null;
  selectedContact: ChatContact | null;
  messages: ChatMessage[];
  searchQuery: string;
  messageText: string;
  replyToMessage: ChatMessage | null;
  showContactInfo: boolean;
  showNewChat: boolean;
  showTypingIndicator: boolean;
  loadingContacts: boolean;
  loadingMessages: boolean;
  sendingMessage: boolean;
  uploadingImage: boolean;
  friendshipStatus: string | null;
  contactLastSeen: string | null;
  contextMenu: ContextMenuInfo | null;
  showReactionPicker: string | null;
  showImagePreview: string | null;
  showHeaderMenu: boolean;
  sendingFriendRequest: boolean;

  // Phase 2 state
  editingMessage: ChatMessage | null;
  messageSearchQuery: string;
  searchedMessages: ChatMessage[];
  sharedMedia: ChatMessage[];
  pinnedMessages: ChatMessage[];
  isRecording: boolean;

  // Phase 3 state
  groups: ChatGroup[];
  mutedChats: Set<string>;
  blockedUsers: Set<string>;
  showForwardDialog: string | null;
  showCreateGroup: boolean;
  showGroupInfo: boolean;
  offlineQueue: ChatMessage[];

  // Call state
  callState: CallStateType;
  activeCall: ActiveCallInfo | null;
  incomingCall: IncomingCallInfo | null;
  callDuration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeakerOn: boolean;
  callError: string | null;
  showPermissionGuide: 'audio' | 'video' | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // API contacts (for loading state check)
  apiContacts: ChatContact[];

  // Refs exposed for CallOverlay video elements
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  imageInputRef: React.RefObject<HTMLInputElement | null>;

  // Derived
  myId: string;
  filteredContacts: ChatContact[];
  getMessageById: (msgId: string) => ChatMessage | undefined;

  // Actions
  selectContact: (id: string | null) => void;
  sendMessage: (e?: React.FormEvent, overrideMessageType?: string, overrideImageUrl?: string, overrideVoiceUrl?: string, overrideVoiceDuration?: number) => void;
  handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleReactToMessage: (messageId: string, emoji: string) => void;
  handleDeleteMessage: (messageId: string) => void;
  handleCopyMessage: (text: string) => void;
  handleReplyToMessage: (msg: ChatMessage) => void;
  handleContextMenu: (e: React.MouseEvent, messageId: string) => void;
  handleTouchStart: (messageId: string) => void;
  handleTouchEnd: () => void;
  handleTouchMove: () => void;
  handleDoubleClick: (messageId: string) => void;
  startCall: (type: 'audio' | 'video') => void;
  acceptIncomingCall: () => void;
  rejectIncomingCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  startNewChat: (userId: string, userName: string, userAvatar: string) => void;
  setSearchQuery: (q: string) => void;
  setMessageText: React.Dispatch<React.SetStateAction<string>>;
  setReplyToMessage: (msg: ChatMessage | null) => void;
  setShowContactInfo: (show: boolean) => void;
  setShowNewChat: (show: boolean) => void;
  setShowReactionPicker: (id: string | null) => void;
  setShowImagePreview: (url: string | null) => void;
  setContextMenu: (cm: ContextMenuInfo | null) => void;
  setShowHeaderMenu: (show: boolean) => void;
  setShowPermissionGuide: (guide: 'audio' | 'video' | null) => void;
  loadContacts: () => void;
  loadMessages: (contactId: string) => void;
  sendFriendRequest: () => void;
  retryCallWithPermission: () => void;
  formatLastSeen: (lastSeenAt: string | null) => string;
  formatCallDuration: (seconds: number) => string;

  // Phase 2 actions
  setEditingMessage: (msg: ChatMessage | null) => void;
  setMessageSearchQuery: (q: string) => void;
  searchMessages: (contactId: string, query: string) => Promise<void>;
  handleEditMessage: (messageId: string, newText: string) => Promise<void>;
  handleDeleteForEveryone: (messageId: string) => Promise<void>;
  handleTogglePin: (messageId: string) => Promise<void>;
  loadSharedMedia: (contactId: string) => Promise<void>;
  loadPinnedMessages: (contactId: string) => Promise<void>;
  startRecording: () => void;
  stopRecording: () => void;

  // Phase 3 actions
  createGroup: (name: string, avatar: string, description: string, memberIds: string[]) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  addGroupMember: (groupId: string, userId: string, role?: string) => Promise<void>;
  removeGroupMember: (groupId: string, userId: string) => Promise<void>;
  forwardMessage: (messageId: string, targetId: string, isGroup?: boolean) => Promise<void>;
  toggleMuteChat: (targetId: string, isGroup?: boolean) => Promise<void>;
  toggleBlockUser: (userId: string) => Promise<void>;
  isChatMuted: (targetId: string) => boolean;
  isUserBlocked: (userId: string) => boolean;
  setShowForwardDialog: (id: string | null) => void;
  setShowCreateGroup: (show: boolean) => void;
  setShowGroupInfo: (show: boolean) => void;
  processOfflineQueue: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChatContext = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
};

// ICE servers: Google STUN only (TURN credentials are no longer hardcoded).
// 🔒 SECURITY FIX: previously TURN credentials for nawaqes.metered.live were
// hardcoded here, leaking long-lived credentials to every browser. Now we
// use STUN-only for this (unused) legacy chat implementation. The live
// chat-app/call/CallManager.tsx fetches TURN credentials dynamically from
// the authenticated /api/webrtc/config endpoint.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

const OFFLINE_QUEUE_KEY = 'nawaqes_offline_queue';

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatParam = searchParams.get('chat');
  const { darkMode, chatMessages, getChatContacts, markMessagesRead, posts, wsConnected, sendTyping, sendReadReceipt, sendCallSignal, isUserOnlineWs } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // ─── Core state ────────────────────────────────────────────────────
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [apiContacts, setApiContacts] = useState<ChatContact[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // New features state
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Phase 2 state
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [searchedMessages, setSearchedMessages] = useState<ChatMessage[]>([]);
  const [sharedMedia, setSharedMedia] = useState<ChatMessage[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 3 state
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [showForwardDialog, setShowForwardDialog] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<ChatMessage[]>([]);

  // Call states
  const [callState, setCallState] = useState<CallStateType>('idle');
  const [activeCall, setActiveCall] = useState<ActiveCallInfo | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [showPermissionGuide, setShowPermissionGuide] = useState<'audio' | 'video' | null>(null);

  // Last seen state
  const [contactLastSeen, setContactLastSeen] = useState<string | null>(null);

  // User search state (for new chat)
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const myId = currentUser?.id || '';

  // ─── Helper: format last seen ──────────────────────────────────────
  const formatLastSeen = useCallback((lastSeenAt: string | null): string => {
    if (!lastSeenAt) return t('messages.lastSeenHour');
    try {
      const lastSeen = new Date(lastSeenAt);
      const now = new Date();
      const diffMs = now.getTime() - lastSeen.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 2) return t('messages.onlineNow');
      if (diffMins < 60) return t('messages.lastSeenMinutes', { count: diffMins });
      if (diffHours < 24) return t('messages.lastSeenHours', { count: diffHours });
      if (diffDays < 7) return t('messages.lastSeenDays', { count: diffDays });
      return lastSeen.toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US');
    } catch {
      return t('messages.lastSeenHour');
    }
  }, [t, dir]);

  const formatCallDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ─── Load contacts from API ────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    if (!currentUser) return;
    setLoadingContacts(true);
    try {
      const contacts = await api.getChatContacts();
      if (Array.isArray(contacts)) {
        setApiContacts(contacts as ChatContact[]);
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  }, [currentUser]);

  // ─── Load muted chats and blocked users ───────────────────────────
  const loadMutesAndBlocks = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [mutes, blocks] = await Promise.all([
        api.getMutedChats(),
        api.getBlockedUsers(),
      ]);
      if (Array.isArray(mutes)) {
        setMutedChats(new Set((mutes as any[]).map(m => m.target_id)));
      }
      if (Array.isArray(blocks)) {
        setBlockedUsers(new Set((blocks as any[]).map(b => b.blocked_id)));
      }
    } catch {}
  }, [currentUser]);

  // ─── Load messages for selected contact ────────────────────────────
  const loadMessages = useCallback(async (contactId: string) => {
    if (!currentUser) return;
    setLoadingMessages(true);
    try {
      const messages = await api.getChatMessages(contactId);
      if (Array.isArray(messages)) {
        const mapped: ChatMessage[] = (messages as any[]).map((m: any) => ({
          id: m.id,
          senderId: m.sender_id || m.senderId,
          receiverId: m.receiver_id || m.receiverId,
          text: m.text,
          timestamp: m.created_at || m.timestamp || new Date().toISOString(),
          read: !!(m.read),
          postId: m.post_id || m.postId,
          messageType: m.message_type || m.messageType || 'text',
          imageUrl: m.image_url || m.imageUrl || '',
          replyToId: m.reply_to_id || m.replyToId || undefined,
          reactions: (() => { try { return JSON.parse(m.reactions || '{}'); } catch { return {}; } })(),
          deletedFor: m.deleted_for || '',
          isEdited: !!(m.is_edited),
          isPinned: !!(m.is_pinned),
          delivered: !!(m.delivered),
          voiceUrl: m.voice_url || m.voiceUrl || '',
          voiceDuration: m.voice_duration || m.voiceDuration || 0,
          groupId: m.group_id || m.groupId || undefined,
          isForwarded: !!(m.is_forwarded),
          forwardedFrom: m.forwarded_from || m.forwardedFrom || '',
        }));
        setApiMessages(mapped);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [currentUser]);

  // ─── Load contacts on mount ────────────────────────────────────────
  useEffect(() => {
    loadContacts();
    loadMutesAndBlocks();
    api.getFriendsList().then((friends: any) => {
      if (Array.isArray(friends)) {
        setApiContacts(prev => {
          const existing = new Set(prev.map(c => c.id));
          const newContacts = [...prev];
          for (const f of friends) {
            if (!existing.has(f.id)) {
              newContacts.push({
                id: f.id,
                name: f.name,
                avatar: f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.id}`,
                lastMessage: '',
                lastTime: '',
                unread: 0,
                online: isUserOnline(f.id),
              });
              existing.add(f.id);
            }
          }
          return newContacts;
        });
      }
    }).catch(() => {});
  }, [loadContacts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load offline queue from localStorage ──────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setOfflineQueue(parsed);
        }
      }
    } catch {}
  }, []);

  // ─── Auto-select contact from URL ?chat=userId parameter ───────────
  useEffect(() => {
    if (chatParam && !selectedContactId) {
      setSelectedContactId(chatParam);
    }
  }, [chatParam]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load messages when contact is selected ────────────────────────
  useEffect(() => {
    if (selectedContactId) {
      loadMessages(selectedContactId);
      // For DM contacts (not group_), mark messages read
      if (!selectedContactId.startsWith('group_')) {
        markMessagesRead(selectedContactId);
        sendReadReceipt(selectedContactId);
        if (currentUser && selectedContactId !== currentUser.id) {
          api.getFriendshipStatus(selectedContactId).then(data => {
            setFriendshipStatus(data?.friendshipStatus || null);
            setContactLastSeen(data?.lastSeenAt || null);
          }).catch(() => {
            setFriendshipStatus(null);
            setContactLastSeen(null);
          });
        }
      } else {
        // Group chat - reset DM-specific state
        setFriendshipStatus(null);
        setContactLastSeen(null);
      }
    } else {
      setApiMessages([]);
      setFriendshipStatus(null);
      setContactLastSeen(null);
    }
  }, [selectedContactId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Refresh contactLastSeen every 30s ─────────────────────────────
  useEffect(() => {
    if (!selectedContactId || !currentUser || selectedContactId === currentUser.id || selectedContactId.startsWith('group_')) return;
    const interval = setInterval(() => {
      api.getFriendshipStatus(selectedContactId!).then(data => {
        setContactLastSeen(data?.lastSeenAt || null);
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedContactId, currentUser]);

  // ─── Merge local + API contacts ────────────────────────────────────
  const localContacts = getChatContacts();
  const allContactsMap = new Map<string, ChatContact>();
  for (const c of apiContacts) allContactsMap.set(c.id, c);
  for (const c of localContacts) {
    if (!allContactsMap.has(c.id)) allContactsMap.set(c.id, c);
  }
  const contacts = Array.from(allContactsMap.values()).map(c => ({
    ...c,
    online: isUserOnlineWs(c.id) || isUserOnline(c.id),
    isMuted: mutedChats.has(c.id) || (c.isGroup && c.groupId ? mutedChats.has(c.groupId) : false) || c.isMuted,
    isBlocked: blockedUsers.has(c.id) || c.isBlocked,
  }));

  const selectedContact = contacts.find(c => c.id === selectedContactId) || null;

  // ─── Get messages for selected contact ─────────────────────────────
  const getMessagesList = useCallback((): ChatMessage[] => {
    if (!selectedContactId || !currentUser) return [];
    const msgs = [...apiMessages];
    // For group chats, no local merge needed (all messages come from API)
    if (!selectedContactId.startsWith('group_')) {
      const chatKey = [currentUser.id, selectedContactId].sort().join('_');
      const localMsgs = chatMessages[chatKey] || [];
      for (const lm of localMsgs) {
        if (!msgs.find(m => m.id === lm.id)) msgs.push(lm);
      }
    }
    msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return msgs;
  }, [apiMessages, selectedContactId, currentUser, chatMessages]);

  const currentMessages = getMessagesList();

  const getMessageById = useCallback((msgId: string): ChatMessage | undefined => {
    return currentMessages.find(m => m.id === msgId);
  }, [currentMessages]);

  const filteredContacts = contacts.filter(c =>
    c.name.includes(searchQuery) || c.lastMessage.includes(searchQuery)
  );

  // ─── WebSocket: typing indicator ───────────────────────────────────
  useEffect(() => {
    const handleWsTyping = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.senderId && data.senderId === selectedContactId) {
        setShowTypingIndicator(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(false), 3000);
      }
      // For group typing, show if in the same group
      if (data?.groupId && selectedContact?.isGroup && selectedContact.groupId === data.groupId) {
        setShowTypingIndicator(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(false), 3000);
      }
    };
    window.addEventListener('ws:typing', handleWsTyping);
    return () => {
      window.removeEventListener('ws:typing', handleWsTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [selectedContactId, selectedContact]);

  // ─── WebSocket: read receipts ──────────────────────────────────────
  useEffect(() => {
    const handleWsRead = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.readerId && data.readerId === selectedContactId) {
        setApiMessages(prev => prev.map(m =>
          m.senderId === myId && m.receiverId === selectedContactId
            ? { ...m, read: true }
            : m
        ));
      }
    };
    window.addEventListener('ws:read', handleWsRead);
    return () => window.removeEventListener('ws:read', handleWsRead);
  }, [selectedContactId, myId]);

  // ─── WebSocket: message edited ─────────────────────────────────────
  useEffect(() => {
    const handleWsMessageEdited = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.id) {
        setApiMessages(prev => prev.map(m =>
          m.id === data.id ? { ...m, text: data.text || m.text, isEdited: true } : m
        ));
      }
    };
    window.addEventListener('ws:chat:message-edited', handleWsMessageEdited);
    return () => window.removeEventListener('ws:chat:message-edited', handleWsMessageEdited);
  }, []);

  // ─── WebSocket: message deleted for everyone ───────────────────────
  useEffect(() => {
    const handleWsMessageDeleted = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data?.id && data?.deletedFor === 'everyone') {
        setApiMessages(prev => prev.map(m =>
          m.id === data.id ? { ...m, text: '', messageType: 'system' as const, deletedFor: 'everyone', imageUrl: '', voiceUrl: '' } : m
        ));
      }
    };
    window.addEventListener('ws:chat:message-deleted', handleWsMessageDeleted);
    return () => window.removeEventListener('ws:chat:message-deleted', handleWsMessageDeleted);
  }, []);

  // ─── WebSocket: group created/deleted events ───────────────────────
  useEffect(() => {
    const handleGroupCreated = () => { loadContacts(); };
    const handleGroupDeleted = () => {
      loadContacts();
      // If the deleted group was selected, deselect it
      setSelectedContactId(prev => {
        if (prev?.startsWith('group_')) return null;
        return prev;
      });
    };
    window.addEventListener('ws:chat:group-created', handleGroupCreated);
    window.addEventListener('ws:chat:group-deleted', handleGroupDeleted);
    return () => {
      window.removeEventListener('ws:chat:group-created', handleGroupCreated);
      window.removeEventListener('ws:chat:group-deleted', handleGroupDeleted);
    };
  }, [loadContacts]);

  // ─── WebSocket: new chat message (real-time) ───────────────────────
  useEffect(() => {
    const handleWsMessage = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data) return;
      const msg: ChatMessage = {
        id: data.id,
        senderId: data.senderId,
        receiverId: data.receiverId,
        text: data.text || '',
        timestamp: data.timestamp || new Date().toISOString(),
        read: false,
        messageType: data.messageType || 'text',
        imageUrl: data.imageUrl || '',
        replyToId: data.replyToId || undefined,
        voiceUrl: data.voiceUrl || '',
        voiceDuration: data.voiceDuration || 0,
        groupId: data.groupId || undefined,
        isForwarded: data.isForwarded || false,
        forwardedFrom: data.forwardedFrom || '',
      };

      // Check if this message is for the currently selected chat
      const isForCurrentChat = selectedContactId?.startsWith('group_')
        ? msg.groupId === selectedContact?.groupId
        : (msg.senderId === selectedContactId || msg.receiverId === myId && msg.senderId === selectedContactId);

      if (isForCurrentChat) {
        setApiMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }

      // Refresh contacts to update last message
      loadContacts();
    };
    window.addEventListener('ws:chat-message', handleWsMessage);
    return () => window.removeEventListener('ws:chat-message', handleWsMessage);
  }, [selectedContactId, selectedContact, myId, loadContacts]);

  // ─── Send typing indicator (debounced) ─────────────────────────────
  useEffect(() => {
    if (!messageText.trim() || !selectedContactId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current >= 3000) {
      lastTypingSentRef.current = now;
      sendTyping(selectedContactId);
    }
  }, [messageText, selectedContactId, sendTyping, selectedContact]);

  // ─── Close context/reaction/header menu on click outside ───────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showHeaderMenu && target.closest('[data-header-menu]')) return;
      setContextMenu(null);
      setShowReactionPicker(null);
      setShowHeaderMenu(false);
    };
    if (contextMenu || showReactionPicker || showHeaderMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, showReactionPicker, showHeaderMenu]);

  // ─── Scroll tracking ───────────────────────────────────────────────
  // Track if user is near the bottom (within 100px). When true, new messages
  // auto-scroll to bottom. When false (user scrolled up to read history),
  // we DON'T force-scroll — respect the user's position.
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShouldAutoScroll(distanceFromBottom < 100);
  }, []);

  // Only auto-scroll when NEW messages arrive AND user is already at the bottom.
  const shouldAutoScrollRef = useRef(true);
  useEffect(() => { shouldAutoScrollRef.current = shouldAutoScroll; }, [shouldAutoScroll]);

  useEffect(() => {
    if (!currentMessages || currentMessages.length === 0) return;
    if (shouldAutoScrollRef.current) {
      // Use direct scrollTop on the container — NOT scrollIntoView.
      // scrollIntoView scrolls ALL ancestor containers (including the page body),
      // which is what causes the page to jump to the top.
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [currentMessages]);

  // ─── Send message ──────────────────────────────────────────────────
  const sendMessageFn = async (e?: React.FormEvent, overrideMessageType?: string, overrideImageUrl?: string, overrideVoiceUrl?: string, overrideVoiceDuration?: number) => {
    if (e) e.preventDefault();
    if (!selectedContactId || !myId) return;

    const isImageMsg = overrideMessageType === 'image';
    const isVoiceMsg = overrideMessageType === 'voice';
    const textToSend = (isImageMsg || isVoiceMsg) ? '' : messageText.trim();
    if (!isImageMsg && !isVoiceMsg && !textToSend) return;

    // Check if blocked
    if (!selectedContactId.startsWith('group_') && blockedUsers.has(selectedContactId)) {
      toast.error(t('messages.cannotMessageBlocked'));
      return;
    }

    if (!isImageMsg && !isVoiceMsg) setMessageText('');
    setSendingMessage(true);

    const isGroupChat = selectedContactId.startsWith('group_');
    const groupId = isGroupChat ? selectedContact?.groupId : undefined;
    const receiverId = isGroupChat ? undefined : selectedContactId;

    const tempId = `temp_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: tempId,
      senderId: myId,
      receiverId: isGroupChat ? 'group' : selectedContactId,
      text: textToSend,
      timestamp: new Date().toISOString(),
      read: false,
      messageType: isImageMsg ? 'image' : isVoiceMsg ? 'voice' : 'text',
      imageUrl: overrideImageUrl || '',
      replyToId: replyToMessage?.id || undefined,
      voiceUrl: overrideVoiceUrl || '',
      voiceDuration: overrideVoiceDuration || 0,
      groupId,
    };

    // If offline, add to queue
    if (!wsConnected) {
      newMsg._queued = true;
      setApiMessages(prev => [...prev, newMsg]);
      setReplyToMessage(null);
      setSendingMessage(false);

      // Store in localStorage
      const updatedQueue = [...offlineQueue, newMsg];
      setOfflineQueue(updatedQueue);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updatedQueue));
      toast.info(t('messages.messageQueued'));
      return;
    }

    setApiMessages(prev => [...prev, newMsg]);
    setReplyToMessage(null);

    try {
      const result = await api.sendMessage(
        receiverId || 'group',
        textToSend || (isVoiceMsg ? '🎤' : '📷'),
        undefined,
        isImageMsg ? 'image' : isVoiceMsg ? 'voice' : 'text',
        overrideImageUrl,
        newMsg.replyToId,
        overrideVoiceUrl,
        overrideVoiceDuration,
        groupId,
      );
      setApiMessages(prev => prev.map(m =>
        m.id === tempId
          ? { ...m, id: (result as any)?.id || tempId, _queued: false }
          : m
      ));
      loadContacts();
    } catch (err: any) {
      console.error('Message send failed:', err);
      setApiMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, _failed: true } : m
      ));
      toast.error(err?.message || t('messages.sendFailed', 'فشل إرسال الرسالة'));
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Process offline queue ─────────────────────────────────────────
  const processOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;
    const queue = [...offlineQueue];
    setOfflineQueue([]);
    localStorage.removeItem(OFFLINE_QUEUE_KEY);

    for (const msg of queue) {
      try {
        const isGroupChat = !!msg.groupId;
        const receiverId = isGroupChat ? 'group' : msg.receiverId;
        await api.sendMessage(
          receiverId,
          msg.text,
          undefined,
          msg.messageType,
          msg.imageUrl,
          msg.replyToId,
          msg.voiceUrl,
          msg.voiceDuration,
          msg.groupId,
        );
        // Remove _queued flag from displayed message
        setApiMessages(prev => prev.map(m =>
          m.id === msg.id ? { ...m, _queued: false } : m
        ));
      } catch (err) {
        console.error('Failed to send queued message:', err);
      }
    }
    loadContacts();
  }, [offlineQueue, loadContacts]);

  // Process queue when back online
  useEffect(() => {
    if (wsConnected && offlineQueue.length > 0) {
      processOfflineQueue();
    }
  }, [wsConnected, offlineQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Image upload ──────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(isVideo ? t('marketLive.fileTooLarge') : t('createPost.imageSizeError'));
      return;
    }
    setUploadingImage(true);
    try {
      const { url } = await api.uploadChatImage(file);
      await sendMessageFn(undefined, 'image', url);
      toast.success(t('messages.imageSent'));
    } catch (err: any) {
      toast.error(err?.message || t('api.imageUploadFailed'));
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // ─── Message actions ───────────────────────────────────────────────
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('messages.copyMessage'));
    }).catch(() => {
      toast.error(t('common.error'));
    });
    setContextMenu(null);
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await api.deleteMessage(messageId);
      setApiMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success(t('messages.messageDeleted'));
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
    setContextMenu(null);
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    try {
      const result = await api.reactToMessage(messageId, emoji);
      setApiMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, reactions: result.reactions || {} } : m
      ));
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
    setShowReactionPicker(null);
    setContextMenu(null);
  };

  const handleReplyToMessageFn = (msg: ChatMessage) => {
    setReplyToMessage(msg);
    setContextMenu(null);
  };

  const handleContextMenuFn = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setContextMenu({ messageId, x: e.clientX, y: e.clientY });
  };

  const handleTouchStart = (messageId: string) => {
    // 🔧 FIX v3: increased from 500ms to 600ms. The old 500ms was so short
    // that any slightly-slow tap (common on mobile when the user is
    // scrolling lazily or their finger lingers for half a second) would
    // trigger the context menu unexpectedly. 600ms is the standard
    // long-press threshold used by iOS/Android.
    longPressTimerRef.current = setTimeout(() => {
      setContextMenu({ messageId, x: window.innerWidth / 2, y: window.innerHeight / 3 });
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    // 🔧 FIX v3: cancel the long-press if the user moves their finger
    // (i.e. they're scrolling, not long-pressing). Previously a scroll
    // gesture that started on a message bubble would trigger the context
    // menu after 500ms because the touch-start fired but the touch-end
    // only fires when the finger lifts — by which point the timer had
    // already elapsed. Now any touchmove cancels the timer.
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDoubleClick = (messageId: string) => {
    setShowReactionPicker(messageId);
  };

  // ─── Phase 2: Edit message ─────────────────────────────────────────
  const handleEditMessage = async (messageId: string, newText: string) => {
    try {
      await api.editMessage(messageId, newText);
      setApiMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: newText, isEdited: true } : m
      ));
      toast.success(t('messages.editMessage'));
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
    setEditingMessage(null);
    setContextMenu(null);
  };

  // ─── Phase 2: Delete for everyone ──────────────────────────────────
  const handleDeleteForEveryone = async (messageId: string) => {
    try {
      await api.deleteMessageForEveryone(messageId);
      setApiMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, text: '', messageType: 'system', deletedFor: 'everyone', imageUrl: '', voiceUrl: '' } : m
      ));
      toast.success(t('messages.deleteForEveryone'));
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
    setContextMenu(null);
  };

  // ─── Phase 2: Toggle pin ───────────────────────────────────────────
  const handleTogglePin = async (messageId: string) => {
    try {
      const result = await api.togglePinMessage(messageId);
      setApiMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isPinned: result.isPinned } : m
      ));
      if (result.isPinned) {
        toast.success(t('messages.pinMessage'));
      } else {
        toast.success(t('messages.unpinMessage'));
      }
      if (selectedContactId) {
        loadPinnedMessagesFn(selectedContactId);
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
    setContextMenu(null);
  };

  // ─── Phase 2: Search messages ──────────────────────────────────────
  const searchMessagesFn = async (contactId: string, query: string) => {
    if (!query.trim()) {
      setSearchedMessages([]);
      return;
    }
    try {
      const results = await api.searchMessages(contactId, query);
      if (Array.isArray(results)) {
        const mapped: ChatMessage[] = (results as any[]).map((m: any) => ({
          id: m.id,
          senderId: m.sender_id || m.senderId,
          receiverId: m.receiver_id || m.receiverId,
          text: m.text,
          timestamp: m.created_at || m.timestamp || new Date().toISOString(),
          read: !!(m.read),
          messageType: m.message_type || m.messageType || 'text',
          imageUrl: m.image_url || m.imageUrl || '',
          voiceUrl: m.voice_url || m.voiceUrl || '',
          voiceDuration: m.voice_duration || m.voiceDuration || 0,
          isEdited: !!(m.is_edited),
          isPinned: !!(m.is_pinned),
          delivered: !!(m.delivered),
          reactions: (() => { try { return JSON.parse(m.reactions || '{}'); } catch { return {}; } })(),
          deletedFor: m.deleted_for || '',
        }));
        setSearchedMessages(mapped);
      }
    } catch (err) {
      console.error('Error searching messages:', err);
      setSearchedMessages([]);
    }
  };

  // ─── Phase 2: Load shared media ────────────────────────────────────
  const loadSharedMediaFn = async (contactId: string) => {
    try {
      const results = await api.getSharedMedia(contactId);
      if (Array.isArray(results)) {
        const mapped: ChatMessage[] = (results as any[]).map((m: any) => ({
          id: m.id,
          senderId: m.sender_id || m.senderId,
          receiverId: m.receiver_id || m.receiverId,
          text: m.text,
          timestamp: m.created_at || m.timestamp || new Date().toISOString(),
          read: !!(m.read),
          messageType: m.message_type || m.messageType || 'text',
          imageUrl: m.image_url || m.imageUrl || '',
          voiceUrl: m.voice_url || m.voiceUrl || '',
          voiceDuration: m.voice_duration || m.voiceDuration || 0,
        }));
        setSharedMedia(mapped);
      }
    } catch (err) {
      console.error('Error loading shared media:', err);
    }
  };

  // ─── Phase 2: Load pinned messages ─────────────────────────────────
  const loadPinnedMessagesFn = async (contactId: string) => {
    try {
      const messages = await api.getChatMessages(contactId);
      if (Array.isArray(messages)) {
        const pinned = (messages as any[])
          .filter((m: any) => m.is_pinned)
          .map((m: any) => ({
            id: m.id,
            senderId: m.sender_id || m.senderId,
            receiverId: m.receiver_id || m.receiverId,
            text: m.text,
            timestamp: m.created_at || m.timestamp || new Date().toISOString(),
            read: !!(m.read),
            messageType: m.message_type || m.messageType || 'text',
            imageUrl: m.image_url || m.imageUrl || '',
            voiceUrl: m.voice_url || m.voiceUrl || '',
            isPinned: true,
          }));
        setPinnedMessages(pinned);
      }
    } catch (err) {
      console.error('Error loading pinned messages:', err);
    }
  };

  // ─── Phase 2: Voice recording ──────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/ogg',
      });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        stream.getTracks().forEach(track => track.stop());

        const ext = mediaRecorder.mimeType.includes('webm') ? 'webm' : 'ogg';
        const file = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mediaRecorder.mimeType });

        try {
          const { url } = await api.uploadChatVoice(file);
          const estimatedDuration = Math.max(1, Math.round(audioBlob.size / 16000));
          await sendMessageFn(undefined, 'voice', undefined, url, estimatedDuration);
        } catch (err: any) {
          toast.error(err?.message || t('common.error'));
        }

        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err: any) {
      toast.error(t('messages.permissionAudioTitle'));
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── Start new chat ────────────────────────────────────────────────
  const startNewChat = async (userId: string, userName: string, userAvatar: string) => {
    try {
      setApiContacts(prev => {
        if (prev.find(c => c.id === userId)) return prev;
        return [...prev, {
          id: userId, name: userName, avatar: userAvatar,
          lastMessage: '', lastTime: new Date().toISOString(),
          unread: 0, online: false,
        }];
      });
      setSelectedContactId(userId);
      setShowNewChat(false);
      loadMessages(userId);
    } catch (err: any) {
      toast.error(err.message || 'فشل بدء المحادثة');
    }
  };

  // ─── Send friend request ───────────────────────────────────────────
  const sendFriendRequestFn = async () => {
    if (!selectedContactId || friendshipStatus === 'pending') return;
    setSendingFriendRequest(true);
    try {
      await api.sendFriendRequest(selectedContactId);
      setFriendshipStatus('pending');
      toast.success(t('messages.friendRequestSent', 'تم إرسال طلب الصداقة'));
      navigate('/friends?tab=sent');
    } catch (err: any) {
      toast.error(err.message || t('messages.sendFailed', 'فشل إرسال طلب الصداقة'));
    } finally {
      setSendingFriendRequest(false);
    }
  };

  // ─── User search (for new chat) ───────────────────────────────────
  const handleUserSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) { setUserSearchResults([]); return; }
    setSearchingUsers(true);
    try {
      const results = await api.searchUsers(query);
      setUserSearchResults(Array.isArray(results) ? results : []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => handleUserSearch(userSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, handleUserSearch]);

  // ─── Phase 3: Create group ─────────────────────────────────────────
  const createGroupFn = async (name: string, avatar: string, description: string, memberIds: string[]) => {
    try {
      const result = await api.createGroup(name, avatar, description, memberIds);
      if (result) {
        toast.success(t('messages.createGroup'));
        setShowCreateGroup(false);
        loadContacts();
        // Select the new group
        if ((result as any)?.id) {
          setSelectedContactId(`group_${(result as any).id}`);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Leave group ──────────────────────────────────────────
  const leaveGroupFn = async (groupId: string) => {
    try {
      await api.leaveGroup(groupId);
      toast.success(t('messages.leaveGroup'));
      setSelectedContactId(null);
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Add group member ─────────────────────────────────────
  const addGroupMemberFn = async (groupId: string, userId: string, role?: string) => {
    try {
      await api.addGroupMember(groupId, userId, role);
      toast.success(t('messages.addMembers'));
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Remove group member ──────────────────────────────────
  const removeGroupMemberFn = async (groupId: string, userId: string) => {
    try {
      await api.removeGroupMember(groupId, userId);
      toast.success(t('messages.removeMember'));
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Forward message ──────────────────────────────────────
  const forwardMessageFn = async (messageId: string, targetId: string, isGroup?: boolean) => {
    try {
      await api.forwardMessage(messageId, targetId, isGroup);
      toast.success(t('messages.forward'));
      setShowForwardDialog(null);
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Toggle mute chat ─────────────────────────────────────
  const toggleMuteChatFn = async (targetId: string, isGroup?: boolean) => {
    try {
      const result = await api.toggleMuteChat(targetId, isGroup);
      if (result.isMuted) {
        setMutedChats(prev => new Set([...prev, targetId]));
        toast.success(t('messages.muteChat'));
      } else {
        setMutedChats(prev => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        toast.success(t('messages.unmuteChat'));
      }
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Toggle block user ────────────────────────────────────
  const toggleBlockUserFn = async (userId: string) => {
    try {
      const result = await api.toggleBlockUser(userId);
      if (result.isBlocked) {
        setBlockedUsers(prev => new Set([...prev, userId]));
        toast.success(t('messages.blockUser'));
      } else {
        setBlockedUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        toast.success(t('messages.unblockUser'));
      }
      loadContacts();
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    }
  };

  // ─── Phase 3: Check helpers ────────────────────────────────────────
  const isChatMutedFn = useCallback((targetId: string): boolean => {
    return mutedChats.has(targetId);
  }, [mutedChats]);

  const isUserBlockedFn = useCallback((userId: string): boolean => {
    return blockedUsers.has(userId);
  }, [blockedUsers]);

  // ─── WebRTC: call functions ────────────────────────────────────────
  // Keep localStreamRef in sync
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const cleanupCall = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setActiveCall(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallError(null);
    setIncomingCall(null);
    localStreamRef.current = null;
  }, []);

  const createPeerConnection = useCallback((targetId: string, stream: MediaStream | null) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    let remoteTrackCount = 0;
    const remoteTracks: MediaStreamTrack[] = [];
    pc.ontrack = (event) => {
      console.log('[Call] ontrack fired:', event.track.kind, 'enabled:', event.track.enabled);
      if (event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          if (!remoteTracks.find(t => t.id === track.id)) {
            remoteTracks.push(track);
          }
        });
      } else {
        if (!remoteTracks.find(t => t.id === event.track.id)) {
          remoteTracks.push(event.track);
        }
      }
      remoteTrackCount++;
      const newStream = new MediaStream(remoteTracks);
      setRemoteStream(newStream);
      // Force-play the remote video/audio (Android WebView sometimes needs this)
      const remoteVideo = remoteVideoRef.current;
      if (remoteVideo) {
        remoteVideo.srcObject = newStream;
        remoteVideo.muted = false; // Unmute so we hear the caller
        remoteVideo.play().catch((e) => {
          console.warn('[Call] Remote video play failed, retrying with muted:', e);
          // Fallback: mute and retry (autoplay policy), audio still goes through <audio>
          remoteVideo.muted = true;
          remoteVideo.play().catch(() => {});
        });
      }
      const remoteAudioEl = document.getElementById('remote-call-audio') as HTMLAudioElement | null;
      if (remoteAudioEl) {
        remoteAudioEl.srcObject = newStream;
        remoteAudioEl.play().catch((e) => console.warn('[Call] Remote audio play failed:', e));
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal(targetId, { type: 'call-ice-candidate', candidate: event.candidate });
      }
    };

    // Log ICE connection state changes for debugging
    pc.oniceconnectionstatechange = () => {
      console.log('[Call] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        // Restart ICE to recover from transient TURN failures
        console.log('[Call] ICE failed — attempting restart');
        try { pc.restartIce(); } catch (e) { console.warn('[Call] ICE restart failed:', e); }
      }
    };

    pc.onsignalingstatechange = () => {
      console.log('[Call] Signaling state:', pc.signalingState);
    };

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallError(t('messages.callConnectionFailed', 'لم يتم الاتصال - تأكد من أنك على نفس الشبكة'));
        setTimeout(() => cleanupCall(), 3000);
      }
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
        // Re-attach remote stream once connected (Android WebView sometimes loses the srcObject)
        if (remoteStream && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
      }
    };

    return pc;
  }, [sendCallSignal, cleanupCall, t, remoteStream]);

  const checkPermissionStatus = async (type: 'audio' | 'video'): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> => {
    try {
      const micStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (micStatus.state === 'denied') return 'denied';
      if (micStatus.state === 'granted' && type === 'audio') return 'granted';
      if (type === 'video') {
        const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (camStatus.state === 'denied') return 'denied';
        if (camStatus.state === 'granted' && micStatus.state === 'granted') return 'granted';
      }
      return micStatus.state as 'prompt' | 'granted';
    } catch {
      return 'unavailable';
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!selectedContact) return;
    setCallError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCallError(t('messages.callSecureContextRequired', 'يتطلب الاتصال الصوتي/الفيديو اتصالاً آمناً (HTTPS).'));
      setActiveCall({ type, contactId: selectedContact.id, contactName: selectedContact.name, contactAvatar: selectedContact.avatar });
      setCallState('outgoing');
      return;
    }

    const permStatus = await checkPermissionStatus(type);
    if (permStatus === 'denied') {
      setShowPermissionGuide(type);
      return;
    }

    try {
      const testConstraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(testConstraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      setActiveCall({ type, contactId: selectedContact.id, contactName: selectedContact.name, contactAvatar: selectedContact.avatar });
      setCallState('outgoing');

      const pc = createPeerConnection(selectedContact.id, stream);
      // Explicit offer options: ensure media recv/send is negotiated even if
      // the local track addition raced.
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
        iceRestart: false,
      });
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (or 5s timeout).
      // TURN allocation can take 2-4s on mobile networks; 2s was too short
      // and caused offers to be sent before TURN candidates were gathered.
      const waitForIceGathering = new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
        };
      });
      await waitForIceGathering;

      sendCallSignal(selectedContact.id, {
        type: 'call-offer', callType: type,
        fromId: myId, fromName: currentUser?.name || '', fromAvatar: currentUser?.avatar || '',
        offer: pc.localDescription,
      });
    } catch (err: any) {
      console.error('Failed to start call:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setShowPermissionGuide(type);
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCallError(t('messages.callNoDevice', 'لم يتم العثور على كاميرا/ميكروفون.'));
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCallError(t('messages.callDeviceInUse', 'الكاميرا/الميكروفون قيد الاستخدام من قبل تطبيق آخر.'));
      } else {
        setCallError(t('messages.callStartFailed', 'فشل بدء المكالمة.'));
      }
      cleanupCall();
    }
  };

  const retryCallWithPermission = async () => {
    const type = showPermissionGuide;
    setShowPermissionGuide(null);
    if (type) {
      setTimeout(() => startCall(type), 300);
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    setCallError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error(t('messages.callSecureContextRequired', 'يتطلب الاتصال اتصالاً آمناً (HTTPS).'));
      rejectIncomingCall();
      return;
    }

    const permStatus = await checkPermissionStatus(incomingCall.type);
    if (permStatus === 'denied') {
      setShowPermissionGuide(incomingCall.type);
      rejectIncomingCall();
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: incomingCall.type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current && incomingCall.type === 'video') {
        localVideoRef.current.srcObject = stream;
      }

      setActiveCall({
        type: incomingCall.type, contactId: incomingCall.fromId,
        contactName: incomingCall.fromName, contactAvatar: incomingCall.fromAvatar,
      });
      setCallState('outgoing');

      const pc = createPeerConnection(incomingCall.fromId, stream);
      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Match the caller's ICE gathering timeout (5s) so TURN candidates
      // have enough time to be gathered on mobile networks.
      const waitForIceGathering = new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
        };
      });
      await waitForIceGathering;

      sendCallSignal(incomingCall.fromId, { type: 'call-answer', answer: pc.localDescription, toId: incomingCall.fromId });
      setIncomingCall(null);
    } catch (err: any) {
      console.error('Failed to accept call:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setShowPermissionGuide(incomingCall?.type || 'audio');
      } else if (err.name === 'NotFoundError') {
        setCallError(t('messages.callNoDevice', 'لم يتم العثور على كاميرا/ميكروفون.'));
      } else {
        setCallError(t('messages.callAcceptFailed', 'فشل قبول المكالمة.'));
      }
      rejectIncomingCall();
    }
  };

  const rejectIncomingCall = () => {
    if (incomingCall) {
      sendCallSignal(incomingCall.fromId, { type: 'call-reject', toId: incomingCall.fromId });
    }
    setIncomingCall(null);
    cleanupCall();
  };

  const endCall = useCallback(() => {
    if (activeCall) {
      sendCallSignal(activeCall.contactId, { type: 'call-end', toId: activeCall.contactId });
    }
    const duration = callDuration;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    if (duration > 0) {
      toast.success(
        activeCall?.type === 'video'
          ? t('messages.videoCallEnded', { duration: `${mins}:${secs.toString().padStart(2, '0')}` })
          : t('messages.audioCallEnded', { duration: `${mins}:${secs.toString().padStart(2, '0')}` })
      );
    }
    cleanupCall();
  }, [activeCall, callDuration, sendCallSignal, cleanupCall, t]);

  // ─── Listen for incoming call signals ──────────────────────────────
  useEffect(() => {
    const handleCallSignal = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data?.signal) return;
      const signal = data.signal;
      const fromId = data.fromId;

      switch (signal.type) {
        case 'call-offer': {
          setIncomingCall({
            fromId: fromId || signal.fromId, fromName: signal.fromName || '',
            fromAvatar: signal.fromAvatar || '', type: signal.callType || 'audio',
            offer: signal.offer,
          });
          break;
        }
        case 'call-answer': {
          if (peerConnectionRef.current && signal.answer) {
            peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.answer))
              .catch(err => {
                console.error('Failed to set remote description:', err);
                setCallError(t('messages.callConnectionFailed', 'لم يتم الاتصال'));
              });
          }
          break;
        }
        case 'call-ice-candidate': {
          if (peerConnectionRef.current && signal.candidate) {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate))
              .catch(err => console.error('Failed to add ICE candidate:', err));
          }
          break;
        }
        case 'call-reject': {
          toast.info(t('messages.callRejected', 'تم رفض المكالمة'));
          cleanupCall();
          break;
        }
        case 'call-end': {
          const duration = callDuration;
          const mins = Math.floor(duration / 60);
          const secs = duration % 60;
          if (duration > 0 && activeCall) {
            toast.success(
              activeCall.type === 'video'
                ? t('messages.videoCallEnded', { duration: `${mins}:${secs.toString().padStart(2, '0')}` })
                : t('messages.audioCallEnded', { duration: `${mins}:${secs.toString().padStart(2, '0')}` })
            );
          }
          cleanupCall();
          break;
        }
      }
    };
    window.addEventListener('ws:call-signal', handleCallSignal);
    return () => window.removeEventListener('ws:call-signal', handleCallSignal);
  }, [cleanupCall, callDuration, activeCall, t]);

  // ─── Attach remote video when remoteStream changes ─────────────────
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteStream) {
      const remoteAudioEl = document.getElementById('remote-call-audio') as HTMLAudioElement | null;
      if (remoteAudioEl) {
        remoteAudioEl.srcObject = remoteStream;
        remoteAudioEl.play().catch(() => {});
      }
    }
  }, [remoteStream]);

  // ─── Attach local video when stream changes ────────────────────────
  useEffect(() => {
    if (localStream && localVideoRef.current && activeCall?.type === 'video' && !isCameraOff) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall, isCameraOff]);

  // ─── Toggle mute on local audio tracks ─────────────────────────────
  useEffect(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
    }
  }, [isMuted, localStream]);

  // ─── Toggle camera on local video tracks ───────────────────────────
  useEffect(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => { track.enabled = !isCameraOff; });
    }
  }, [isCameraOff, localStream]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  // ─── Toggle helpers ────────────────────────────────────────────────
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !newMuted; });
    }
  };

  const toggleCamera = () => {
    const newCamOff = !isCameraOff;
    setIsCameraOff(newCamOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => { track.enabled = !newCamOff; });
    }
  };

  const toggleSpeaker = () => {
    const newSpeaker = !isSpeakerOn;
    setIsSpeakerOn(newSpeaker);
    const remoteVid = remoteVideoRef.current;
    const remoteAud = document.getElementById('remote-call-audio') as HTMLAudioElement | null;
    if (remoteVid) {
      try { (remoteVid as any).setSinkId?.(newSpeaker ? '' : 'default'); } catch {}
      remoteVid.volume = newSpeaker ? 1 : 0.3;
    }
    if (remoteAud) {
      try { (remoteAud as any).setSinkId?.(newSpeaker ? '' : 'default'); } catch {}
      remoteAud.volume = newSpeaker ? 1 : 0.3;
    }
  };

  const selectContact = (id: string | null) => {
    setSelectedContactId(id);
  };

  // ─── Post authors for new chat ─────────────────────────────────────
  const postAuthors = posts
    .filter(p => p.author.id !== currentUser?.id && p.type === 'ad')
    .reduce((acc, p) => {
      if (!acc.find(a => a.id === p.author.id)) {
        acc.push({ id: p.author.id, name: p.author.name, avatar: p.author.avatar, postContent: p.content.slice(0, 50), postId: p.id });
      }
      return acc;
    }, [] as { id: string; name: string; avatar: string; postContent: string; postId: string }[]);

  // ─── Context value ─────────────────────────────────────────────────
  const value: ChatContextType = {
    contacts, selectedContactId, selectedContact, messages: currentMessages,
    searchQuery, messageText, replyToMessage, showContactInfo, showNewChat,
    showTypingIndicator, loadingContacts, loadingMessages, sendingMessage,
    uploadingImage, friendshipStatus, contactLastSeen, contextMenu,
    showReactionPicker, showImagePreview, showHeaderMenu, sendingFriendRequest,
    editingMessage, messageSearchQuery, searchedMessages, sharedMedia, pinnedMessages, isRecording,
    // Phase 3 state
    groups, mutedChats, blockedUsers, showForwardDialog, showCreateGroup, showGroupInfo, offlineQueue,
    callState, activeCall, incomingCall, callDuration, isMuted, isCameraOff,
    isSpeakerOn, callError, showPermissionGuide, localStream, remoteStream,
    apiContacts,
    localVideoRef, remoteVideoRef, imageInputRef,
    myId, filteredContacts, getMessageById,
    selectContact, sendMessage: sendMessageFn, handleImageUpload,
    handleReactToMessage, handleDeleteMessage, handleCopyMessage,
    handleReplyToMessage: handleReplyToMessageFn, handleContextMenu: handleContextMenuFn,
    handleTouchStart, handleTouchEnd, handleTouchMove, handleDoubleClick,
    startCall, acceptIncomingCall, rejectIncomingCall, endCall,
    toggleMute, toggleCamera, toggleSpeaker,
    startNewChat, setSearchQuery, setMessageText, setReplyToMessage,
    setShowContactInfo, setShowNewChat, setShowReactionPicker,
    setShowImagePreview, setContextMenu, setShowHeaderMenu, setShowPermissionGuide,
    loadContacts, loadMessages, sendFriendRequest: sendFriendRequestFn,
    retryCallWithPermission, formatLastSeen, formatCallDuration,
    setEditingMessage, setMessageSearchQuery, searchMessages: searchMessagesFn,
    handleEditMessage, handleDeleteForEveryone, handleTogglePin,
    loadSharedMedia: loadSharedMediaFn, loadPinnedMessages: loadPinnedMessagesFn,
    startRecording, stopRecording,
    // Phase 3 actions
    createGroup: createGroupFn, leaveGroup: leaveGroupFn,
    addGroupMember: addGroupMemberFn, removeGroupMember: removeGroupMemberFn,
    forwardMessage: forwardMessageFn, toggleMuteChat: toggleMuteChatFn,
    toggleBlockUser: toggleBlockUserFn, isChatMuted: isChatMutedFn,
    isUserBlocked: isUserBlockedFn, setShowForwardDialog, setShowCreateGroup,
    setShowGroupInfo, processOfflineQueue,
  };

  // Also expose some internal state for NewChatDialog
  (value as any).userSearchQuery = userSearchQuery;
  (value as any).setUserSearchQuery = setUserSearchQuery;
  (value as any).userSearchResults = userSearchResults;
  (value as any).searchingUsers = searchingUsers;
  (value as any).postAuthors = postAuthors;
  (value as any).darkMode = darkMode;
  (value as any).dir = dir;
  (value as any).navigate = navigate;
  (value as any).messagesEndRef = messagesEndRef;
  (value as any).messagesContainerRef = messagesContainerRef;
  (value as any).handleScroll = handleScroll;
  (value as any).wsConnected = wsConnected;

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
