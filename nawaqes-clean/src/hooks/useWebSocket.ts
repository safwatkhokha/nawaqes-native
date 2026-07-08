// ─── useWebSocket Hook ──────────────────────────────────────────────
// Manages WebSocket connection and provides event handling for React components
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

// ─── Types ──────────────────────────────────────────────────────────
export type WSEventHandler = (data: any) => void;

interface UseWebSocketOptions {
  onMessage?: (event: { type: string; data: any }) => void;
  onChatMessage?: WSEventHandler;
  onNotification?: WSEventHandler;
  onFriendRequest?: WSEventHandler;
  onFriendAccepted?: WSEventHandler;
  onPresenceOnline?: WSEventHandler;
  onPresenceOffline?: WSEventHandler;
  onPresenceOnlineList?: WSEventHandler;
  onChatTyping?: WSEventHandler;
  onChatRead?: WSEventHandler;
  onAdminEvent?: WSEventHandler;
  onPostCreated?: WSEventHandler;
  onPostDeleted?: WSEventHandler;
  onPostCommented?: WSEventHandler;
  onPostCommentDeleted?: WSEventHandler;
  onStoryCreated?: WSEventHandler;
  onCallSignal?: WSEventHandler;
  onLivestreamStarted?: WSEventHandler;
  onLivestreamEnded?: WSEventHandler;
  onLivestreamChat?: WSEventHandler;
  onLivestreamViewerJoined?: WSEventHandler;
  onLivestreamViewerLeft?: WSEventHandler;
  onLivestreamSignal?: WSEventHandler;
  // ─── Channel Live Streams (WebRTC P2P) ──────────────────────────
  onChannelLiveViewerJoined?: WSEventHandler;
  onChannelLiveViewerLeft?: WSEventHandler;
  onChannelLiveEnded?: WSEventHandler;
  onChannelLiveSignal?: WSEventHandler;
  onChannelLiveChat?: WSEventHandler;
  onChannelLiveGift?: WSEventHandler;
  onChannelLiveError?: WSEventHandler;
  onChatMessageEdited?: WSEventHandler;
  onChatMessageDeleted?: WSEventHandler;
  onChatGroupCreated?: WSEventHandler;
  onChatGroupDeleted?: WSEventHandler;
  autoConnect?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastEvent: { type: string; data: any } | null;
  send: (type: string, data: any) => void;
  sendTyping: (receiverId: string) => void;
  sendReadReceipt: (contactId: string) => void;
  sendCallSignal: (targetUserId: string, signal: any) => void;
  sendPresenceGetOnline: () => void;
  sendLivestreamStart: (data: { streamId: string; title?: string; userName?: string; userAvatar?: string }) => void;
  sendLivestreamEnd: (streamId: string) => void;
  sendLivestreamChat: (streamId: string, text: string) => void;
  sendLivestreamJoin: (streamId: string) => void;
  sendLivestreamLeave: (streamId: string) => void;
  sendLivestreamSignal: (streamId: string, signal: any) => void;
  // ─── Channel Live Streams (WebRTC P2P) ──────────────────────────
  sendChannelLiveHostReady: (streamId: string, channelId: string) => void;
  sendChannelLiveEnd: (streamId: string) => void;
  sendChannelLiveJoin: (streamId: string) => void;
  sendChannelLiveLeave: (streamId: string) => void;
  sendChannelLiveHeartbeat: (streamId: string) => void;
  sendChannelLiveSignal: (streamId: string, signal: any) => void;
  sendChannelLiveChat: (streamId: string, content: string) => void;
  sendChannelLiveGift: (streamId: string, gift: any) => void;
  reconnect: () => void;
}

// Singleton WebSocket instance shared across hook usages
let sharedWs: WebSocket | null = null;
let sharedConnected = false;
let sharedListeners: Map<string, Set<WSEventHandler>> = new Map();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentToken: string | null = null;

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function connectWs(token: string) {
  if (sharedWs && (sharedWs.readyState === WebSocket.CONNECTING || sharedWs.readyState === WebSocket.OPEN)) {
    return; // Already connected or connecting
  }

  currentToken = token;
  const url = getWsUrl();

  try {
    sharedWs = new WebSocket(url);

    sharedWs.onopen = () => {
      console.log('[WS] Connected, authenticating...');
      // Send authentication message
      sharedWs?.send(JSON.stringify({ type: 'auth', token }));

      // Start heartbeat
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (sharedWs?.readyState === WebSocket.OPEN) {
          sharedWs.send(JSON.stringify({ type: 'presence:heartbeat' }));
        }
      }, 30000); // Every 30 seconds
    };

    sharedWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Handle auth success
        if (msg.type === 'auth:success') {
          sharedConnected = true;
          console.log('[WS] Authenticated:', msg.data);
          notifyListeners('connection:ready', msg.data);
          // Request initial list of online users
          if (sharedWs?.readyState === WebSocket.OPEN) {
            sharedWs.send(JSON.stringify({ type: 'presence:get-online', data: {} }));
          }
          return;
        }

        // Dispatch to all registered listeners
        notifyListeners(msg.type, msg.data);
      } catch (err) {
        console.error('[WS] Message parse error:', err);
      }
    };

    sharedWs.onclose = (event) => {
      sharedConnected = false;
      console.log('[WS] Disconnected:', event.code, event.reason);
      notifyListeners('connection:closed', { code: event.code });

      // Auto-reconnect after delay (unless explicitly closed)
      if (event.code !== 4001 && event.code !== 4003) {
        scheduleReconnect(token);
      }
    };

    sharedWs.onerror = (error) => {
      console.error('[WS] Error:', error);
      notifyListeners('connection:error', {});
    };
  } catch (err) {
    console.error('[WS] Connection failed:', err);
    scheduleReconnect(token);
  }
}

function scheduleReconnect(token: string) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    console.log('[WS] Attempting reconnect...');
    connectWs(token);
  }, 5000); // Reconnect after 5 seconds
}

function notifyListeners(type: string, data: any) {
  const handlers = sharedListeners.get(type);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[WS] Handler error for ${type}:`, err);
      }
    }
  }
  // Also notify wildcard listeners
  const wildcardHandlers = sharedListeners.get('*');
  if (wildcardHandlers) {
    for (const handler of wildcardHandlers) {
      try {
        handler({ type, data });
      } catch (err) {
        console.error(`[WS] Wildcard handler error:`, err);
      }
    }
  }
}

function disconnectWs() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sharedWs) {
    sharedWs.close(1000, 'Client disconnect');
    sharedWs = null;
  }
  sharedConnected = false;
  currentToken = null;
}

/**
 * Hook for connecting to WebSocket and handling real-time events
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { isLoggedIn } = useAuth();
  const [isConnected, setIsConnected] = useState(sharedConnected);
  const [lastEvent, setLastEvent] = useState<{ type: string; data: any } | null>(null);
  const handlersRef = useRef(options);

  // Keep handlers up to date without re-registering
  handlersRef.current = options;

  // Register event-specific handlers
  useEffect(() => {
    const typeToHandler: Record<string, WSEventHandler> = {};

    if (options.onChatMessage) typeToHandler['chat:message'] = options.onChatMessage;
    if (options.onNotification) typeToHandler['notification:new'] = options.onNotification;
    if (options.onFriendRequest) typeToHandler['friend:request'] = options.onFriendRequest;
    if (options.onFriendAccepted) typeToHandler['friend:accepted'] = options.onFriendAccepted;
    if (options.onPresenceOnline) typeToHandler['presence:online'] = options.onPresenceOnline;
    if (options.onPresenceOffline) typeToHandler['presence:offline'] = options.onPresenceOffline;
    if (options.onPresenceOnlineList) typeToHandler['presence:online-list'] = options.onPresenceOnlineList;
    if (options.onChatTyping) typeToHandler['chat:typing'] = options.onChatTyping;
    if (options.onChatRead) typeToHandler['chat:read'] = options.onChatRead;
    if (options.onPostCreated) typeToHandler['post:created'] = options.onPostCreated;
    if (options.onPostDeleted) typeToHandler['post:deleted'] = options.onPostDeleted;
    if (options.onPostCommented) typeToHandler['post:commented'] = options.onPostCommented;
    if (options.onPostCommentDeleted) typeToHandler['post:comment_deleted'] = options.onPostCommentDeleted;
    if (options.onStoryCreated) typeToHandler['story:created'] = options.onStoryCreated;
    if (options.onCallSignal) typeToHandler['call:signal'] = options.onCallSignal;
    if (options.onChatMessageEdited) typeToHandler['chat:message-edited'] = options.onChatMessageEdited;
    if (options.onChatMessageDeleted) typeToHandler['chat:message-deleted'] = options.onChatMessageDeleted;
    if (options.onChatGroupCreated) typeToHandler['chat:group-created'] = options.onChatGroupCreated;
    if (options.onChatGroupDeleted) typeToHandler['chat:group-deleted'] = options.onChatGroupDeleted;
    if (options.onLivestreamStarted) typeToHandler['livestream:started'] = options.onLivestreamStarted;
    if (options.onLivestreamEnded) typeToHandler['livestream:ended'] = options.onLivestreamEnded;
    if (options.onLivestreamChat) typeToHandler['livestream:chat'] = options.onLivestreamChat;
    if (options.onLivestreamViewerJoined) typeToHandler['livestream:viewer-joined'] = options.onLivestreamViewerJoined;
    if (options.onLivestreamViewerLeft) typeToHandler['livestream:viewer-left'] = options.onLivestreamViewerLeft;
    if (options.onLivestreamSignal) typeToHandler['livestream:signal'] = options.onLivestreamSignal;
    if (options.onChannelLiveViewerJoined) typeToHandler['channel:live-viewer-joined'] = options.onChannelLiveViewerJoined;
    if (options.onChannelLiveViewerLeft) typeToHandler['channel:live-viewer-left'] = options.onChannelLiveViewerLeft;
    if (options.onChannelLiveEnded) typeToHandler['channel:live-ended'] = options.onChannelLiveEnded;
    if (options.onChannelLiveSignal) typeToHandler['channel:live-signal'] = options.onChannelLiveSignal;
    if (options.onChannelLiveChat) typeToHandler['channel:live-chat'] = options.onChannelLiveChat;
    if (options.onChannelLiveGift) typeToHandler['channel:live-gift'] = options.onChannelLiveGift;
    if (options.onChannelLiveError) typeToHandler['channel:live-error'] = options.onChannelLiveError;

    // Register each handler
    for (const [type, handler] of Object.entries(typeToHandler)) {
      if (!sharedListeners.has(type)) {
        sharedListeners.set(type, new Set());
      }
      sharedListeners.get(type)!.add(handler);
    }

    // Register wildcard handler for onMessage and lastEvent tracking
    const wildcardHandler = (event: any) => {
      setLastEvent(event);
      if (handlersRef.current.onMessage) {
        handlersRef.current.onMessage(event);
      }

      // Handle admin events with prefix
      if (event.type?.startsWith('admin:') && handlersRef.current.onAdminEvent) {
        handlersRef.current.onAdminEvent({ eventType: event.type, ...event.data });
      }
    };

    if (!sharedListeners.has('*')) {
      sharedListeners.set('*', new Set());
    }
    sharedListeners.get('*')!.add(wildcardHandler);

    // Connection state listener
    const connectionHandler = (data: any) => {
      setIsConnected(sharedConnected);
    };
    if (!sharedListeners.has('connection:ready')) {
      sharedListeners.set('connection:ready', new Set());
    }
    sharedListeners.get('connection:ready')!.add(connectionHandler);
    if (!sharedListeners.has('connection:closed')) {
      sharedListeners.set('connection:closed', new Set());
    }
    sharedListeners.get('connection:closed')!.add(connectionHandler);

    return () => {
      // Unregister all handlers
      for (const [type, handler] of Object.entries(typeToHandler)) {
        sharedListeners.get(type)?.delete(handler);
      }
      sharedListeners.get('*')?.delete(wildcardHandler);
      sharedListeners.get('connection:ready')?.delete(connectionHandler);
      sharedListeners.get('connection:closed')?.delete(connectionHandler);
    };
  }, [
    options.onChatMessage,
    options.onNotification,
    options.onFriendRequest,
    options.onFriendAccepted,
    options.onPresenceOnline,
    options.onPresenceOffline,
    options.onPresenceOnlineList,
    options.onChatTyping,
    options.onChatRead,
    options.onAdminEvent,
    options.onMessage,
    options.onPostCreated,
    options.onPostDeleted,
    options.onPostCommented,
    options.onPostCommentDeleted,
    options.onStoryCreated,
    options.onCallSignal,
    options.onLivestreamStarted,
    options.onLivestreamEnded,
    options.onLivestreamChat,
    options.onLivestreamViewerJoined,
    options.onLivestreamViewerLeft,
    options.onLivestreamSignal,
    options.onChannelLiveViewerJoined,
    options.onChannelLiveViewerLeft,
    options.onChannelLiveEnded,
    options.onChannelLiveSignal,
    options.onChannelLiveChat,
    options.onChannelLiveGift,
    options.onChannelLiveError,
    options.onChatMessageEdited,
    options.onChatMessageDeleted,
  ]);

  // Auto-connect when logged in
  useEffect(() => {
    const autoConnect = options.autoConnect !== false;
    if (autoConnect && isLoggedIn) {
      const token = api.getToken();
      if (token) {
        connectWs(token);
      }
    }
  }, [isLoggedIn, options.autoConnect]);

  // Send a message through the WebSocket
  const send = useCallback((type: string, data: any) => {
    if (sharedWs?.readyState === WebSocket.OPEN) {
      sharedWs.send(JSON.stringify({ type, data }));
    }
  }, []);

  // Send typing indicator
  const sendTyping = useCallback((receiverId: string) => {
    send('chat:typing', { receiverId });
  }, [send]);

  // Send read receipt
  const sendReadReceipt = useCallback((contactId: string) => {
    send('chat:read', { contactId });
  }, [send]);

  // Send call signal (WebRTC signaling)
  const sendCallSignal = useCallback((targetUserId: string, signal: any) => {
    send('call:signal', { targetUserId, signal });
  }, [send]);

  // Request list of currently online users
  const sendPresenceGetOnline = useCallback(() => {
    send('presence:get-online', {});
  }, [send]);

  // Send livestream start notification
  const sendLivestreamStart = useCallback((data: { streamId: string; title?: string; userName?: string; userAvatar?: string }) => {
    send('livestream:start', data);
  }, [send]);

  // Send livestream end notification
  const sendLivestreamEnd = useCallback((streamId: string) => {
    send('livestream:end', { streamId });
  }, [send]);

  // Send livestream chat message
  const sendLivestreamChat = useCallback((streamId: string, text: string) => {
    send('livestream:chat', { streamId, text });
  }, [send]);

  // Send livestream viewer join
  const sendLivestreamJoin = useCallback((streamId: string) => {
    send('livestream:join', { streamId });
  }, [send]);

  // Send livestream viewer leave
  const sendLivestreamLeave = useCallback((streamId: string) => {
    send('livestream:leave', { streamId });
  }, [send]);

  // Send livestream WebRTC signal
  const sendLivestreamSignal = useCallback((streamId: string, signal: any) => {
    send('livestream:signal', { streamId, signal });
  }, [send]);

  // ─── Channel Live Streams (WebRTC P2P) ──────────────────────────
  // Host → Server: register as the host of this stream so viewers can
  // be routed to me. Must be called AFTER `api.startChannelLive` returns
  // the streamId from the DB.
  const sendChannelLiveHostReady = useCallback((streamId: string, channelId: string) => {
    send('channel:live-host-ready', { streamId, channelId });
  }, [send]);

  // Host → Server: end the stream (kicks all viewers)
  const sendChannelLiveEnd = useCallback((streamId: string) => {
    send('channel:live-end', { streamId });
  }, [send]);

  // Viewer → Server: join this stream (server will notify host to send offer)
  const sendChannelLiveJoin = useCallback((streamId: string) => {
    send('channel:live-join', { streamId });
  }, [send]);

  // Viewer → Server: leave the stream (server notifies host)
  const sendChannelLiveLeave = useCallback((streamId: string) => {
    send('channel:live-leave', { streamId });
  }, [send]);

  // Viewer → Server: heartbeat (every 30s — prevents stale-viewer eviction)
  const sendChannelLiveHeartbeat = useCallback((streamId: string) => {
    send('channel:live-heartbeat', { streamId });
  }, [send]);

  // WebRTC signaling — bidirectional between host and viewer
  const sendChannelLiveSignal = useCallback((streamId: string, signal: any) => {
    send('channel:live-signal', { streamId, signal });
  }, [send]);

  // Real-time chat (also persisted via REST API)
  const sendChannelLiveChat = useCallback((streamId: string, content: string) => {
    send('channel:live-chat', { streamId, content });
  }, [send]);

  // Gift notification (also persisted via REST API)
  const sendChannelLiveGift = useCallback((streamId: string, gift: any) => {
    send('channel:live-gift', { streamId, gift });
  }, [send]);

  // Force reconnect
  const reconnect = useCallback(() => {
    disconnectWs();
    const token = api.getToken();
    if (token) {
      connectWs(token);
    }
  }, []);

  return {
    isConnected,
    lastEvent,
    send,
    sendTyping,
    sendReadReceipt,
    sendCallSignal,
    sendPresenceGetOnline,
    sendLivestreamStart,
    sendLivestreamEnd,
    sendLivestreamChat,
    sendLivestreamJoin,
    sendLivestreamLeave,
    sendLivestreamSignal,
    sendChannelLiveHostReady,
    sendChannelLiveEnd,
    sendChannelLiveJoin,
    sendChannelLiveLeave,
    sendChannelLiveHeartbeat,
    sendChannelLiveSignal,
    sendChannelLiveChat,
    sendChannelLiveGift,
    reconnect,
  };
}

/**
 * Disconnect WebSocket (call on logout)
 */
export function disconnectWebSocket() {
  disconnectWs();
  sharedListeners.clear();
}

/**
 * Initialize WebSocket connection (call after login)
 */
export function connectWebSocket(token: string) {
  connectWs(token);
}

/**
 * Check if WebSocket is connected
 */
export function isWebSocketConnected(): boolean {
  return sharedConnected;
}

export default useWebSocket;
