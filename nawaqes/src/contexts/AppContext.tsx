// ─── App Context (Data + State) ─────────────────────────────────────
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { api } from '../services/api';
import { Post, Category, User, NewsItem, Story, FriendRequest, ChatMessage, PromotionRequest, ChargingRequest, Store as StoreType, StorePromotionRequest } from '../types';
import type { Notification as AppNotification } from '../types';
import { useAuth } from './AuthContext';
import { getDefaultAvatar } from '../utils/avatar';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { updatePresence, startPresenceHeartbeat } from '../utils/presence';
import { useWebSocket, disconnectWebSocket, connectWebSocket } from '../hooks/useWebSocket';

export interface Transaction {
  id: string;
  type: 'deposit' | 'charge_request' | 'promotion_debit' | 'promotion_refund' | 'admin_deposit' | 'admin_withdrawal' | 'withdrawal' | 'gift_sent' | 'gift_received' | 'savings_debit' | 'savings_refund' | 'transfer_out' | 'transfer_in' | 'gift_withdrawal' | 'chat_transfer';
  amount: number;
  method: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'approved' | 'rejected' | 'failed';
  referenceId?: string;
}

// ─── API Data Mapper (snake_case → camelCase) ──────────────────────────
// The backend returns snake_case fields but the frontend expects camelCase.
// This function maps API post data to the frontend Post type.
export function mapApiPost(data: any): Post {
  return {
    id: data.id,
    author: {
      id: data.author?.id || data.author_id || '',
      name: data.author?.name || '',
      avatar: data.author?.avatar || getDefaultAvatar(data.author_id || data.id, data.author?.gender),
      isVerified: !!(data.author?.is_verified ?? data.author?.isVerified),
      isAdmin: !!(data.author?.is_admin ?? data.author?.isAdmin),
      isTrusted: !!(data.author?.is_trusted ?? data.author?.isTrusted),
      trustScore: data.author?.trust_score ?? data.author?.trustScore,
      interests: data.author?.interests,
    },
    content: data.content || '',
    image: data.image || undefined,
    likes: data.likes || 0,
    comments: data.comments || 0,
    shares: data.shares || 0,
    timestamp: data.created_at || data.timestamp || '',
    type: data.type || 'ad',
    price: data.price || undefined,
    currency: data.currency || 'EGP',
    paymentMethods: data.payment_methods || data.paymentMethods || [],
    isBoosted: !!(data.is_boosted ?? data.isBoosted),
    isPromoted: !!(data.is_promoted ?? data.isPromoted),
    promotionTier: data.promotion_tier || data.promotionTier || undefined,
    // Only show promotionStatus if there's actually a tier - prevents stale 'pending' without real promotion request
    promotionStatus: (data.promotion_tier || data.promotionTier) ? (data.promotion_status || data.promotionStatus || undefined) : undefined,
    promotionExpiresAt: data.promotion_expires_at || data.promotionExpiresAt,
    promotionPackage: data.promotion_package || data.promotionPackage,
    promotionStartedAt: data.promotion_started_at || data.promotionStartedAt,
    reachCount: data.reach_count || data.reachCount,
    clickCount: data.click_count || data.clickCount,
    estimatedReach: data.estimated_reach || data.estimatedReach,
    location: data.location || undefined,
    status: data.status,
    feeling: data.feeling || undefined,
    activity: data.activity || undefined,
    category: data.category || undefined,
  };
}

// ─── Smart Notifications Utility ──────────────────────────────────────
// DISABLED per product decision (2026-06-23): OS-level notifications
// (the popups that appear over the app like "أضفني إلى قائمتك / أعجبني")
// are no longer shown. The in-app toast notifications (via sonner) are
// the only notification channel now — they're less intrusive and stay
// inside the app window.
//
// To re-enable in the future, set `nawaqes_smart_alerts` to 'true' in
// localStorage and uncomment the body below.
export const smartNotify = (_title: string, _body: string, _icon?: string) => {
  // Intentionally disabled — no OS notifications.
  return;
  /* Original implementation preserved for reference:
  const enabled = localStorage.getItem('nawaqes_smart_alerts') === 'true';
  if (!enabled) return;
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  try {
    new window.Notification(_title, {
      body: _body,
      icon: _icon || '/favicon.ico',
      tag: `nawaqes-alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    } as NotificationOptions);
  } catch {}
  */
};

interface AppContextType {
  user: User | null;
  posts: Post[];
  promotedFeedPosts: Post[];
  categories: Category[];
  notifications: AppNotification[];
  newsItems: NewsItem[];
  stories: Story[];
  loading: boolean;
  selectedCategory: string | null;
  setSelectedCategory: (id: string | null) => void;
  filters: { minPrice: string; maxPrice: string; location: string; type: string };
  setFilters: (f: { minPrice: string; maxPrice: string; location: string; type: string }) => void;
  showCreatePost: boolean;
  setShowCreatePost: (show: boolean) => void;
  addPost: (post: Post) => void;
  deletePost: (postId: string) => void;
  toggleSavePost: (postId: string) => void;
  savedPosts: string[];
  updateWalletBalance: (amount?: number) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  depositConfirmation: { show: boolean; amount: number; type: 'deposit' } | null;
  showDepositConfirmation: (amount: number, type: 'deposit') => void;
  hideDepositConfirmation: () => void;
  chatUnreadCount: number;
  clearChatUnread: () => void;
  readNotificationIds: Set<string>;
  markAllNotificationsRead: () => void;
  markNotificationRead: (id: string) => void;
  deleteNotification: (id: string) => void;
  friendRequests: FriendRequest[];
  acceptFriendRequest: (reqId: string) => Promise<void>;
  rejectFriendRequest: (reqId: string) => Promise<void>;
  shareModalPost: Post | null;
  openShareModal: (post: Post) => void;
  closeShareModal: () => void;
  addNotification: (notif: AppNotification) => void;
  transactions: Transaction[];
  addTransaction: (t: Transaction) => void;
  priceDropAlerts: boolean;
  togglePriceDropAlerts: () => void;
  smartAlertsEnabled: boolean;
  enableSmartAlerts: () => Promise<boolean>;
  disableSmartAlerts: () => void;
  chatMessages: Record<string, ChatMessage[]>;
  sendMessage: (receiverId: string, text: string, postId?: string) => Promise<any>;
  getChatContacts: () => { id: string; name: string; avatar: string; lastMessage: string; lastTime: string; unread: number; online: boolean; postId?: string }[];
  markMessagesRead: (contactId: string) => void;
  addStory: (story: Story) => void;
  promotionRequests: PromotionRequest[];
  addPromotionRequest: (req: PromotionRequest) => void;
  setPromotionRequests: (reqs: PromotionRequest[]) => void;
  approvePromotion: (reqId: string) => void;
  rejectPromotion: (reqId: string) => void;
  chargingRequests: ChargingRequest[];
  addChargingRequest: (req: ChargingRequest) => void;
  setChargingRequests: (reqs: ChargingRequest[]) => void;
  approveCharging: (reqId: string) => void;
  rejectCharging: (reqId: string) => void;
  stores: StoreType[];
  addStore: (store: StoreType) => void;
  updateStore: (storeId: string, updates: Partial<StoreType>) => void;
  addStorePromotionRequest: (req: StorePromotionRequest) => void;
  adminAlerts: NewsItem[];
  addAdminAlert: (alert: NewsItem) => void;
  removeAdminAlert: (id: string) => void;
  refreshData: () => Promise<void>;
  wsConnected: boolean;
  sendTyping: (receiverId: string) => void;
  sendReadReceipt: (contactId: string) => void;
  sendCallSignal: (targetUserId: string, signal: any) => void;
  isUserOnlineWs: (userId: string) => boolean;
}

export const AppContext = createContext<AppContextType>({
  user: null, posts: [], promotedFeedPosts: [], categories: [], notifications: [], newsItems: [], stories: [],
  loading: true, selectedCategory: null, setSelectedCategory: () => {},
  filters: { minPrice: '', maxPrice: '', location: '', type: 'all' }, setFilters: () => {},
  showCreatePost: false, setShowCreatePost: () => {}, addPost: () => {}, deletePost: () => {},
  toggleSavePost: () => {}, savedPosts: [], updateWalletBalance: () => {},
  darkMode: false, toggleDarkMode: () => {},
  depositConfirmation: null, showDepositConfirmation: () => {}, hideDepositConfirmation: () => {},
  chatUnreadCount: 0, clearChatUnread: () => {},
  readNotificationIds: new Set(), markAllNotificationsRead: () => {}, markNotificationRead: () => {}, deleteNotification: () => {},
  friendRequests: [], acceptFriendRequest: async () => {}, rejectFriendRequest: async () => {},
  shareModalPost: null, openShareModal: () => {}, closeShareModal: () => {},
  addNotification: () => {}, transactions: [], addTransaction: () => {},
  priceDropAlerts: true, togglePriceDropAlerts: () => {},
  smartAlertsEnabled: false, enableSmartAlerts: async () => false as boolean, disableSmartAlerts: () => {},
  chatMessages: {}, sendMessage: async () => {}, getChatContacts: () => [], markMessagesRead: () => {},
  addStory: () => {},
  promotionRequests: [], addPromotionRequest: () => {}, setPromotionRequests: () => {}, approvePromotion: () => {}, rejectPromotion: () => {},
  chargingRequests: [], addChargingRequest: () => {}, setChargingRequests: () => {}, approveCharging: () => {}, rejectCharging: () => {},
  stores: [], addStore: () => {}, updateStore: () => {}, addStorePromotionRequest: () => {},
  adminAlerts: [], addAdminAlert: () => {}, removeAdminAlert: () => {},
  refreshData: async () => {},
  wsConnected: false, sendTyping: () => {}, sendReadReceipt: () => {}, sendCallSignal: () => {}, isUserOnlineWs: () => false,
});

export const useAppContext = () => useContext(AppContext);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoggedIn, updateProfile, refreshCurrentUser } = useAuth();
  const { t } = useTranslation();

  // ─── WebSocket Integration ───────────────────────────────────────
  // Use WebSocket for real-time updates; fall back to polling when disconnected
  const onlineUsersRef = React.useRef<Set<string>>(new Set());
  const [onlineUsers, setOnlineUsers] = React.useState<Set<string>>(new Set());

  const handleWSChatMessage = useCallback((data: any) => {
    // Incoming real-time chat message from another user
    const chatKey = [data.receiverId, data.senderId].sort().join('_');
    const newMsg: ChatMessage = {
      id: data.id,
      senderId: data.senderId,
      receiverId: data.receiverId,
      text: data.text || '',
      timestamp: data.timestamp || new Date().toISOString(),
      read: false,
      postId: data.postId || undefined,
      messageType: data.messageType || 'text',
      imageUrl: data.imageUrl || '',
      replyToId: data.replyToId || undefined,
    };
    setChatMessages(prev => {
      const existing = prev[chatKey] || [];
      // Avoid duplicates
      if (existing.some(m => m.id === newMsg.id)) return prev;
      return { ...prev, [chatKey]: [...existing, newMsg] };
    });
    // Update unread count
    setChatUnreadCount(prev => prev + 1);
    // No toast — notifications stay in the notifications page only.
  }, []);

  const handleWSNotification = useCallback((data: any) => {
    // Incoming real-time notification — save to state ONLY.
    // No toast popups. User sees notifications in the bell icon / notifications page.
    const newNotif: AppNotification = {
      id: data.id || `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: data.type || 'system',
      message: data.message || '',
      time: data.time || new Date().toISOString(),
      userId: data.userId || data.user_id_ref || undefined,
      postId: data.postId || data.post_id || undefined,
      link: data.link || undefined,
    };
    setNotifications(prev => {
      if (prev.some(n => n.id === newNotif.id)) return prev;
      return [newNotif, ...prev];
    });
  }, []);

  const handleWSFriendRequest = useCallback((data: any) => {
    // Incoming real-time friend request — save to state ONLY. No toast.
    const newReq: FriendRequest = {
      id: data.id || `ws_fr_${Date.now()}`,
      user: data.user || { id: '', name: '', avatar: '' },
      timestamp: data.timestamp || new Date().toISOString(),
    };
    setFriendRequests(prev => {
      if (prev.some(r => r.id === newReq.id)) return prev;
      return [newReq, ...prev];
    });
  }, []);

  const handleWSFriendAccepted = useCallback((data: any) => {
    // Friend request was accepted — refresh data. No toast.
    setWsRefreshFlag(prev => prev + 1);
  }, []);

  const handleWSPresenceOnline = useCallback((data: any) => {
    onlineUsersRef.current.add(data.userId);
    setOnlineUsers(new Set(onlineUsersRef.current));
  }, []);

  const handleWSPresenceOffline = useCallback((data: any) => {
    onlineUsersRef.current.delete(data.userId);
    setOnlineUsers(new Set(onlineUsersRef.current));
  }, []);

  const handleWSPresenceOnlineList = useCallback((data: any) => {
    // Initialize the online users set from the server's list
    if (Array.isArray(data?.users)) {
      onlineUsersRef.current = new Set(data.users);
      setOnlineUsers(new Set(onlineUsersRef.current));
    }
  }, []);

  const handleWSChatTyping = useCallback((data: any) => {
    // Dispatch a custom event that MessagesPage can listen to
    window.dispatchEvent(new CustomEvent('ws:typing', { detail: data }));
  }, []);

  const handleWSChatRead = useCallback((data: any) => {
    // Dispatch a custom event for read receipts
    window.dispatchEvent(new CustomEvent('ws:read', { detail: data }));
  }, []);

  const handleWSCallSignal = useCallback((data: any) => {
    // Dispatch a custom event for WebRTC call signaling
    window.dispatchEvent(new CustomEvent('ws:call-signal', { detail: data }));
  }, []);

  const handleWSChatMessageEdited = useCallback((data: any) => {
    // Dispatch a custom event for message edited
    window.dispatchEvent(new CustomEvent('ws:chat:message-edited', { detail: data }));
  }, []);

  const handleWSChatMessageDeleted = useCallback((data: any) => {
    // Dispatch a custom event for message deleted for everyone
    window.dispatchEvent(new CustomEvent('ws:chat:message-deleted', { detail: data }));
  }, []);

  const handleWSChatGroupCreated = useCallback((data: any) => {
    // Dispatch a custom event for group created
    window.dispatchEvent(new CustomEvent('ws:chat:group-created', { detail: data }));
  }, []);

  const handleWSChatGroupDeleted = useCallback((data: any) => {
    // Dispatch a custom event for group deleted
    window.dispatchEvent(new CustomEvent('ws:chat:group-deleted', { detail: data }));
  }, []);

  // ─── New WebSocket handlers for post/story real-time updates ─────
  const handleWSPostCreated = useCallback((data: any) => {
    const newPost = mapApiPost(data);
    setPosts(prev => {
      // Avoid duplicates by ID
      if (prev.some(p => p.id === newPost.id)) return prev;
      // Also avoid content duplicates within 5 seconds (local optimistic + WS)
      const isContentDup = prev.some(p =>
        p.id !== newPost.id &&
        p.author?.id === newPost.author?.id &&
        p.content === newPost.content &&
        Math.abs(new Date(p.timestamp).getTime() - new Date(newPost.timestamp).getTime()) < 5000
      );
      if (isContentDup) return prev;
      return [newPost, ...prev];
    });
  }, []);

  const handleWSPostDeleted = useCallback((data: any) => {
    setPosts(prev => prev.filter(p => p.id !== data.postId));
    setPromotedFeedPosts(prev => prev.filter(p => p.id !== data.postId));
  }, []);

  const handleWSPostCommented = useCallback((data: any) => {
    if (data.postId) {
      setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, comments: p.comments + 1 } : p));
    }
  }, []);

  const handleWSPostCommentDeleted = useCallback((data: any) => {
    if (data.postId) {
      setPosts(prev => prev.map(p => p.id === data.postId ? { ...p, comments: Math.max(0, p.comments - 1) } : p));
    }
  }, []);

  const handleWSStoryCreated = useCallback((_data: any) => {
    // Refresh stories from API when someone creates a new one
    api.getStories().then(storiesData => {
      setStories(storiesData as any);
    }).catch(() => {});
  }, []);

  // Handle admin alert — save to notifications state ONLY. No toast popup.
  const handleWSAdminAlert = useCallback((data: any) => {
    const title = data.title || 'تنبيه من الإدارة';
    const content = data.content || '';
    // Save as a notification so it appears in the notifications page
    const newNotif: AppNotification = {
      id: data.id || `ws_alert_${Date.now()}`,
      type: 'alert',
      message: content ? `${title}: ${content}` : title,
      time: data.createdAt || new Date().toISOString(),
      link: '/notifications',
    };
    setNotifications(prev => {
      if (prev.some(n => n.id === newNotif.id)) return prev;
      return [newNotif, ...prev];
    });
  }, []);

  // Connect WebSocket and register all handlers
  const { isConnected: wsConnected, sendTyping, sendReadReceipt, sendCallSignal } = useWebSocket({
    onChatMessage: handleWSChatMessage,
    onNotification: handleWSNotification,
    onFriendRequest: handleWSFriendRequest,
    onFriendAccepted: handleWSFriendAccepted,
    onPresenceOnline: handleWSPresenceOnline,
    onPresenceOffline: handleWSPresenceOffline,
    onPresenceOnlineList: handleWSPresenceOnlineList,
    onChatTyping: handleWSChatTyping,
    onChatRead: handleWSChatRead,
    onCallSignal: handleWSCallSignal,
    onChatMessageEdited: handleWSChatMessageEdited,
    onChatMessageDeleted: handleWSChatMessageDeleted,
    onChatGroupCreated: handleWSChatGroupCreated,
    onChatGroupDeleted: handleWSChatGroupDeleted,
    onPostCreated: handleWSPostCreated,
    onPostDeleted: handleWSPostDeleted,
    onPostCommented: handleWSPostCommented,
    onPostCommentDeleted: handleWSPostCommentDeleted,
    onStoryCreated: handleWSStoryCreated,
    onAdminEvent: (data: any) => {
      // Handle admin:alert events for real-time alert bar
      if (data.eventType === 'admin:alert') {
        handleWSAdminAlert(data);
      }
    },
    onMessage: (event: { type: string; data: any }) => {
      // 🔧 FIX: Real-time updates when admin approves something
      if (event.type === 'data:refresh') {
        console.log('[WS] Data refresh requested:', event.data?.reason);
        refreshData();
        // No toast — notifications stay in the notifications page only.
      }
      if (event.type === 'wallet:updated') {
        console.log('[WS] Wallet updated:', event.data);
        refreshCurrentUser();
        // No toast — user sees the updated balance in the wallet page.
      }
    },
    autoConnect: true,
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [savedPosts, setSavedPosts] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nawaqes_saved') || '[]'); } catch { return []; }
  });
  const [filters, setFilters] = useState({ minPrice: '', maxPrice: '', location: '', type: 'all' });
  const [darkMode, setDarkMode] = useState(() => {
    // Dark mode is the DEFAULT (per user request 2026-06-25).
    // Only use light mode if the user EXPLICITLY set it to false.
    const stored = localStorage.getItem('nawaqes_darkmode');
    return stored !== 'false'; // true unless explicitly 'false'
  });
  const [depositConfirmation, setDepositConfirmation] = useState<{ show: boolean; amount: number; type: 'deposit' } | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [shareModalPost, setShareModalPost] = useState<Post | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [priceDropAlerts, setPriceDropAlerts] = useState(() => localStorage.getItem('nawaqes_price_drop_alerts') !== 'false');
  const [smartAlertsEnabled, setSmartAlertsEnabled] = useState(() => {
    const stored = localStorage.getItem('nawaqes_smart_alerts');
    if (stored === 'true' && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') return true;
    // If permission was revoked, reset the stored value
    if (stored === 'true' && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission !== 'granted') {
      localStorage.setItem('nawaqes_smart_alerts', 'false');
    }
    return false;
  });
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [promotionRequests, setPromotionRequests] = useState<PromotionRequest[]>([]);
  const [chargingRequests, setChargingRequests] = useState<ChargingRequest[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [adminAlerts, setAdminAlerts] = useState<NewsItem[]>([]);
  const [promotedFeedPosts, setPromotedFeedPosts] = useState<Post[]>([]);
  const [wsRefreshFlag, setWsRefreshFlag] = useState(0);

  // Load data from API
  const refreshData = async () => {
    try {
      const [postsData, catData, newsData, storiesData, promotedData] = await Promise.all([
        api.getPosts().catch(() => ({ posts: [] })),
        api.getCategories().catch(() => []),
        api.getNews().catch(() => []),
        api.getStories().catch(() => []),
        api.getPromotedPosts(20).catch(() => ({ posts: [] })),
      ]);
      // Map API posts from snake_case to camelCase
      const rawPosts = (postsData as any).posts || postsData || [];
      const mappedPosts = Array.isArray(rawPosts) ? rawPosts.map(mapApiPost) : [];
      setPosts(mappedPosts);
      setCategories(catData as any);

      // Map promoted posts from dedicated endpoint
      const rawPromoted = (promotedData as any).posts || [];
      const mappedPromoted = Array.isArray(rawPromoted) ? rawPromoted.map(mapApiPost) : [];
      setPromotedFeedPosts(mappedPromoted);

      // Track impressions for promoted posts (fire-and-forget)
      const promotedPostIds = mappedPosts
        .filter((p: any) => p.isPromoted)
        .map((p: any) => p.id);
      if (promotedPostIds.length > 0) {
        api.trackImpressions(promotedPostIds).catch(() => {}); // Fire and forget
      }
      // Map news items and separate alerts
      const rawNews = Array.isArray(newsData) ? newsData : [];
      const mappedNews: NewsItem[] = rawNews.map((n: any) => ({
        id: n.id,
        title: n.title || '',
        content: n.content || '',
        source: n.source || '',
        isAlert: !!n.is_alert,
        category: n.category || (n.is_alert ? 'urgent' : 'general'),
        createdAt: n.created_at || '',
      }));
      setNewsItems(mappedNews);
      // Always sync adminAlerts from API data (replaces any stale frontend-generated IDs)
      const alertNews = mappedNews.filter(n => n.isAlert);
      setAdminAlerts(alertNews);
      setStories(storiesData as any);
    } catch {
      // Use empty data as fallback
    } finally {
      setLoading(false);
    }
  };

  // Load user-specific data
  const loadUserData = async () => {
    if (!isLoggedIn) return;
    try {
      const [notifs, txns, friends, myPromos] = await Promise.all([
        api.getNotifications().catch(() => []),
        api.getTransactions().catch(() => []),
        api.getFriendRequests().catch(() => []),
        api.getMyPromotionRequests().catch(() => []),
      ]);
      // Map notifications from snake_case API format to camelCase frontend format
      // IMPORTANT: Only use user_id_ref for userId - NEVER fall back to user_id (which is the notification owner = current user)
      const mappedNotifs = Array.isArray(notifs) ? (notifs as any[]).map((n: any) => ({
        id: n.id,
        type: n.type || 'system',
        message: n.message || '',
        time: n.created_at || n.time || '',
        postId: n.post_id || n.postId || undefined,
        userId: n.user_id_ref || undefined,
        link: n.link || undefined,
        read: !!n.read,
      })) : [];
      setNotifications(mappedNotifs);
      // Hydrate readNotificationIds from the DB `read` column so the bell
      // badge is accurate after every reload (previously only in-memory).
      const readFromDb = new Set<string>(mappedNotifs.filter(n => n.read).map(n => n.id));
      setReadNotificationIds(prev => {
        // Merge: keep locally-marked-read IDs (optimistic UI) AND DB-marked-read IDs
        const merged = new Set<string>(prev);
        for (const id of readFromDb) merged.add(id);
        return merged;
      });
      // Map transactions from snake_case API format
      // Handle both old format (array) and new format ({ transactions, total })
      const txnsArray: any[] = Array.isArray(txns) ? txns : ((txns as any)?.transactions || []);
      const mappedTxns = txnsArray.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        method: t.method,
        timestamp: t.created_at || t.timestamp || '',
        status: t.status,
        referenceId: t.reference_id || t.referenceId || undefined,
      }));
      setTransactions(mappedTxns);
      // Map friend requests
      const mappedFriendReqs = Array.isArray(friends) ? (friends as any[]).map((r: any) => ({
        id: r.id,
        user: r.user || { id: r.user_id, name: r.name || '', avatar: r.avatar || '' },
        timestamp: r.created_at || r.timestamp || '',
      })) : [];
      setFriendRequests(mappedFriendReqs);
      // Map promotion requests from API
      if (Array.isArray(myPromos) && myPromos.length > 0) {
        const mappedPromos = (myPromos as any[]).map((r: any) => ({
          id: r.id,
          postId: r.post_id,
          postContent: r.post_content,
          postAuthor: {
            id: r.author_id,
            name: r.author_name,
            avatar: r.author_avatar || getDefaultAvatar(r.author_id, r.author_gender),
          },
          tier: r.tier,
          price: r.price,
          status: r.status,
          createdAt: r.created_at,
          packageName: r.package_name,
          duration: r.duration,
          estimatedReach: r.estimated_reach,
          maxNotifications: r.max_notifications,
          includeMessages: !!r.include_messages,
          targeting: r.targeting,
        }));
        setPromotionRequests(mappedPromos);
      }
    } catch {}
  };

  // Poll for new notifications - reduced frequency when WebSocket is connected
  // WebSocket handles real-time delivery; polling is a fallback
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(async () => {
      try {
        const notifs = await api.getNotifications();
        if (Array.isArray(notifs)) {
          const mapped = (notifs as any[]).map((n: any) => ({
            id: n.id,
            type: n.type || 'system',
            message: n.message || '',
            time: n.created_at || n.time || '',
            postId: n.post_id || n.postId || undefined,
            userId: n.user_id_ref || undefined,
            link: n.link || undefined,
            read: !!n.read,
          }));
          setNotifications(mapped);
          // Sync readNotificationIds with DB state (mark-as-read from other devices)
          const readFromDb = new Set<string>(mapped.filter(n => n.read).map(n => n.id));
          setReadNotificationIds(prev => {
            const merged = new Set<string>(prev);
            for (const id of readFromDb) merged.add(id);
            return merged;
          });
        }
      } catch {}
    }, wsConnected ? 120000 : 15000); // Poll every 2min when WS connected, 15s when not
    return () => clearInterval(interval);
  }, [isLoggedIn, wsConnected]);

  // Periodically refresh news/alerts (every 60 seconds) to stay in sync
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const newsData = await api.getNews().catch(() => []);
        if (Array.isArray(newsData)) {
          const mappedNews: NewsItem[] = (newsData as any[]).map((n: any) => ({
            id: n.id,
            title: n.title || '',
            content: n.content || '',
            source: n.source || '',
            isAlert: !!n.is_alert,
            category: n.category || (n.is_alert ? 'urgent' : 'general'),
            createdAt: n.created_at || '',
          }));
          setNewsItems(mappedNews);
          // Always sync adminAlerts from API data
          const alertNews = mappedNews.filter(n => n.isAlert);
          setAdminAlerts(alertNews);
        }
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { refreshData(); }, []);
  useEffect(() => { if (isLoggedIn) loadUserData(); }, [isLoggedIn]);

  // 🔧 Listen for custom post-deleted events from admin dashboard
  // This ensures posts are removed from ALL feeds immediately after
  // admin deletion, even if WebSocket event is missed.
  useEffect(() => {
    const handlePostDeleted = (e: Event) => {
      const postId = (e as CustomEvent).detail?.postId;
      if (postId) {
        setPosts(prev => prev.filter(p => p.id !== postId));
        setPromotedFeedPosts(prev => prev.filter(p => p.id !== postId));
        // Also force a full refresh to catch any other changes
        refreshData();
      }
    };
    window.addEventListener('nawaqes-post-deleted', handlePostDeleted);
    return () => window.removeEventListener('nawaqes-post-deleted', handlePostDeleted);
  }, []);

  // Handle WebSocket-triggered data refreshes
  useEffect(() => {
    if (wsRefreshFlag > 0 && isLoggedIn) {
      loadUserData();
    }
  }, [wsRefreshFlag, isLoggedIn]);

  // Function to check if a user is online via WebSocket
  const isUserOnlineWs = useCallback((userId: string): boolean => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  // Start presence heartbeat for current user
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.id) return;
    const cleanup = startPresenceHeartbeat(currentUser.id);
    return cleanup;
  }, [isLoggedIn, currentUser?.id]);
  useEffect(() => { localStorage.setItem('nawaqes_saved', JSON.stringify(savedPosts)); }, [savedPosts]);
  useEffect(() => { localStorage.setItem('nawaqes_darkmode', String(darkMode)); }, [darkMode]);
  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const addPost = (post: Post) => setPosts(prev => {
    // Avoid duplicates: check by id first, then by content+author+timestamp for optimistic posts
    if (prev.some(p => p.id === post.id)) return prev;
    // Also check for content duplicates (optimistic local post vs server post)
    const isDuplicate = prev.some(p =>
      p.id !== post.id &&
      p.author?.id === post.author?.id &&
      p.content === post.content &&
      Math.abs(new Date(p.timestamp).getTime() - new Date(post.timestamp).getTime()) < 5000
    );
    if (isDuplicate) {
      // Replace the optimistic local post with the server post (which has the real ID)
      return prev.map(p =>
        p.author?.id === post.author?.id &&
        p.content === post.content &&
        Math.abs(new Date(p.timestamp).getTime() - new Date(post.timestamp).getTime()) < 5000
          ? post : p
      );
    }
    return [post, ...prev];
  });

  // Remove a post from local state (used after delete)
  const deletePost = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    setPromotedFeedPosts(prev => prev.filter(p => p.id !== postId));
  };

  const toggleSavePost = (postId: string) => {
    setSavedPosts(prev => prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId]);
  };
  const updateWalletBalance = async (_amount?: number) => {
    // Refresh the user's wallet balance from the server
    await refreshCurrentUser();
  };
  const toggleDarkMode = () => setDarkMode(prev => !prev);
  const showDepositConfirmation = (amount: number, type: 'deposit') => setDepositConfirmation({ show: true, amount, type });
  const hideDepositConfirmation = () => setDepositConfirmation(null);
  const clearChatUnread = () => setChatUnreadCount(0);
  const markAllNotificationsRead = async () => {
    setReadNotificationIds(prev => { const next = new Set(prev); notifications.forEach(n => next.add(n.id)); return next; });
    await api.markNotificationsRead().catch(() => {});
  };
  const markNotificationRead = (id: string) => {
    setReadNotificationIds(prev => new Set([...prev, id]));
    api.markNotificationRead(id).catch(() => {});
  };
  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setReadNotificationIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    api.deleteNotification(id).catch(() => {});
  };
  const acceptFriendRequest = async (reqId: string) => {
    try {
      await api.acceptFriendRequest(reqId);
      setFriendRequests(prev => prev.filter(r => r.id !== reqId));
      toast.success(t('messages.friendRequestAccepted'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept friend request');
    }
  };
  const rejectFriendRequest = async (reqId: string) => {
    try {
      await api.rejectFriendRequest(reqId);
      setFriendRequests(prev => prev.filter(r => r.id !== reqId));
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject friend request');
    }
  };
  const openShareModal = (post: Post) => setShareModalPost(post);
  const closeShareModal = () => setShareModalPost(null);
  const addNotification = (notif: AppNotification) => {
    setNotifications(prev => [notif, ...prev]);
    // Fire browser notification if smart alerts are enabled
    smartNotify('Nawaqes', notif.message || '');
  };
  const addTransaction = (t: Transaction) => setTransactions(prev => [t, ...prev]);
  const togglePriceDropAlerts = () => {
    setPriceDropAlerts(prev => {
      const next = !prev;
      localStorage.setItem('nawaqes_price_drop_alerts', String(next));
      return next;
    });
  };
  const enableSmartAlerts = async (): Promise<boolean> => {
    try {
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      const hasNotificationAPI = typeof window !== 'undefined' && 'Notification' in window;
      
      if (typeof window === 'undefined') return false;
      
      if (!hasNotificationAPI || isInIframe) {
        setSmartAlertsEnabled(true);
        localStorage.setItem('nawaqes_smart_alerts', 'true');
        toast.success('✅ تم تفعيل الإشعارات داخل التطبيق بنجاح!');
        return true;
      }
      
      if (window.Notification.permission === 'granted') {
        setSmartAlertsEnabled(true);
        localStorage.setItem('nawaqes_smart_alerts', 'true');
        toast.success(t('settings.smartAlertsEnabled'));
        return true;
      }
      
      if (window.Notification.permission === 'denied') {
        setSmartAlertsEnabled(true);
        localStorage.setItem('nawaqes_smart_alerts', 'true');
        toast.success('✅ تم تفعيل الإشعارات داخل التطبيق');
        return true;
      }
      
      const permission = await window.Notification.requestPermission();
      setSmartAlertsEnabled(true);
      localStorage.setItem('nawaqes_smart_alerts', 'true');
      toast.success('✅ تم تفعيل الإشعارات');
      return true;
    } catch (err) {
      setSmartAlertsEnabled(true);
      localStorage.setItem('nawaqes_smart_alerts', 'true');
      toast.success('✅ تم تفعيل الإشعارات داخل التطبيق');
      return true;
    }
  };
  const disableSmartAlerts = () => {
    setSmartAlertsEnabled(false);
    localStorage.setItem('nawaqes_smart_alerts', 'false');
  };
  const sendMessage = async (receiverId: string, text: string, postId?: string) => {
    const chatKey = [currentUser?.id || '', receiverId].sort().join('_');
    try {
      const msg = await api.sendMessage(receiverId, text, postId);
      // Add message to local state using sorted key
      setChatMessages(prev => {
        const existing = prev[chatKey] || [];
        return { ...prev, [chatKey]: [...existing, {
          id: msg?.id || `msg_${Date.now()}`,
          senderId: currentUser?.id || '',
          receiverId,
          text,
          timestamp: new Date().toISOString(),
          read: false,
          postId,
        }]};
      });
      return msg;
    } catch (err) {
      console.error('Failed to send message:', err);
      throw err; // Re-throw so caller can handle the error
    }
  };
  const getChatContacts = () => {
    // Return contacts derived from chatMessages state (keys are sorted "id1_id2" format)
    const contacts: { id: string; name: string; avatar: string; lastMessage: string; lastTime: string; unread: number; online: boolean; postId?: string }[] = [];
    for (const [chatKey, messages] of Object.entries(chatMessages)) {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) continue;
      // Derive the other user's id from the sorted key
      const parts = chatKey.split('_');
      const otherId = parts.find(p => p !== currentUser?.id) || parts[0];
      contacts.push({
        id: otherId,
        name: otherId, // Will be enriched by MessagesPage
        avatar: getDefaultAvatar(otherId),
        lastMessage: lastMsg.text,
        lastTime: lastMsg.timestamp,
        unread: messages.filter(m => m.receiverId === currentUser?.id && !m.read).length,
        online: false,
        postId: lastMsg.postId,
      });
    }
    return contacts;
  };
  const markMessagesRead = (contactId: string) => {
    const chatKey = [currentUser?.id || '', contactId].sort().join('_');
    setChatMessages(prev => {
      const messages = prev[chatKey];
      if (!messages) return prev;
      return { ...prev, [chatKey]: messages.map(m => ({ ...m, read: true })) };
    });
    api.markNotificationsRead().catch(() => {});
  };
  const addStory = (story: Story) => setStories(prev => [story, ...prev]);
  const addPromotionRequest = (req: PromotionRequest) => setPromotionRequests(prev => [req, ...prev]);
  const approvePromotion = async (reqId: string) => {
    try {
      await api.approvePromotion(reqId);
      setPromotionRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'approved' as const } : r));
    } catch {
      toast.error(t('promotion.approveFailed'));
    }
  };
  const rejectPromotion = async (reqId: string) => {
    try {
      await api.rejectPromotion(reqId);
      setPromotionRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected' as const } : r));
    } catch {
      toast.error(t('promotion.rejectFailed'));
    }
  };
  const addChargingRequest = (req: ChargingRequest) => setChargingRequests(prev => [req, ...prev]);
  const approveCharging = async (reqId: string) => {
    try {
      await api.approveCharging(reqId);
      setChargingRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'approved' as const } : r));
    } catch {
      toast.error(t('wallet.approveFailed'));
    }
  };
  const rejectCharging = async (reqId: string) => {
    try {
      await api.rejectCharging(reqId);
      setChargingRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected' as const } : r));
    } catch {
      toast.error(t('wallet.rejectFailed'));
    }
  };
  const addAdminAlert = (alert: NewsItem) => setAdminAlerts(prev => [alert, ...prev]);
  const removeAdminAlert = (id: string) => setAdminAlerts(prev => prev.filter(a => a.id !== id));
  const addStore = (store: StoreType) => setStores(prev => [store, ...prev]);
  const updateStore = (storeId: string, updates: Partial<StoreType>) => {
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, ...updates } : s));
  };
  const addStorePromotionRequest = (req: StorePromotionRequest) => {
    // Store promotion requests can be handled similar to promotion requests
    console.log('Store promotion request:', req);
  };

  return (
    <AppContext.Provider value={{
      user: currentUser, posts, promotedFeedPosts, categories, notifications, newsItems, stories, loading,
      selectedCategory, setSelectedCategory, filters, setFilters,
      showCreatePost, setShowCreatePost, addPost, deletePost, toggleSavePost, savedPosts,
      updateWalletBalance, darkMode, toggleDarkMode,
      depositConfirmation, showDepositConfirmation, hideDepositConfirmation,
      chatUnreadCount, clearChatUnread, readNotificationIds, markAllNotificationsRead, markNotificationRead, deleteNotification,
      friendRequests, acceptFriendRequest, rejectFriendRequest,
      shareModalPost, openShareModal, closeShareModal, addNotification,
      transactions, addTransaction, priceDropAlerts, togglePriceDropAlerts,
      smartAlertsEnabled, enableSmartAlerts, disableSmartAlerts,
      chatMessages, sendMessage, getChatContacts, markMessagesRead, addStory,
      promotionRequests, addPromotionRequest, setPromotionRequests, approvePromotion, rejectPromotion,
      chargingRequests, addChargingRequest, setChargingRequests, approveCharging, rejectCharging,
      stores, addStore, updateStore, addStorePromotionRequest,
      adminAlerts, addAdminAlert, removeAdminAlert, refreshData,
      wsConnected, sendTyping, sendReadReceipt, sendCallSignal, isUserOnlineWs,
    }}>
      {children}
    </AppContext.Provider>
  );
}
