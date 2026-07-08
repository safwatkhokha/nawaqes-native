// ─── WebSocket Real-Time Server ─────────────────────────────────────
// Manages WebSocket connections and broadcasts events to connected clients
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import { verifyToken } from '../middleware/auth.js';
import db from '../database/index.js';

// ─── Types ──────────────────────────────────────────────────────────
export interface WSEvent {
  type: string;
  data: any;
  targetUserId?: string;       // Send to specific user
  targetUserIds?: string[];    // Send to multiple users
  excludeUserId?: string;      // Exclude a user (e.g., sender)
  adminOnly?: boolean;         // Only send to admin users
}

interface ClientInfo {
  ws: WebSocket;
  userId: string;
  isAdmin: boolean;
  connectedAt: number;
}

// ─── WebSocket Manager ──────────────────────────────────────────────
class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map(); // userId → ClientInfo
  private userIdToSockets: Map<string, Set<WebSocket>> = new Map(); // userId → Set of sockets
  // Track active livestreams: userId → { hostId, hostName, hostAvatar, startedAt }
  public activeStreams: Map<string, { hostId: string; hostName: string; hostAvatar: string; startedAt: number }> = new Map();
  // 🔒 FIX: track viewers per stream so livestream chat is broadcast ONLY to
  // viewers (and the host), not to every connected user. Previously the
  // `broadcast()` call sent livestream chat to ALL users — a privacy leak
  // and an O(N²) traffic amplification.
  private streamViewers: Map<string, Set<string>> = new Map(); // streamId → Set<userId>

  // ─── Channel Live Streams (WebRTC P2P) ──────────────────────────────
  // Each active channel stream is tracked here so we can route WebRTC
  // signaling between host ↔ viewers without polling the DB. The hostId
  // is required because channel stream IDs (UUIDs from DB) differ from
  // the host's userId — unlike personal livestreams where they are equal.
  // viewers is a Map<userId, lastSeenMs> so we can expire stale viewers
  // whose heartbeats stop arriving (e.g. mobile network drop without
  // a clean `leave` message).
  private channelStreams: Map<string, {
    hostId: string;
    channelId: string;
    viewers: Map<string, number>; // userId → last heartbeat ms
  }> = new Map();

  /**
   * Initialize the WebSocket server, attached to an existing HTTP server
   */
  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    // 🔒 FIX: heartbeat ping — every 30s, ping every client. Clients that
    // don't respond to ping within 10s are terminated. This detects dead
    // TCP connections (mobile network drops, half-open sockets) that would
    // otherwise linger and make the user appear "online" forever.
    const heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws: WebSocket) => {
        // @ts-ignore — ws has a private _alive flag we use as a heartbeat marker
        if (ws._isAlive === false) {
          ws.terminate();
          return;
        }
        // @ts-ignore
        ws._isAlive = false;
        try { ws.ping(); } catch {}
      });
    }, 30000);

    // ─── Channel live: stale viewer sweeper ──────────────────────────
    // Every 30s, evict viewers who haven't sent a heartbeat in 90s.
    // This catches mobile network drops where the TCP socket doesn't
    // close cleanly (so `ws.on('close')` never fires) but the viewer
    // is gone. Without this, the host would keep an open peer connection
    // and keep sending video to a dead viewer, wasting bandwidth.
    const channelStaleSweeper = setInterval(() => {
      const now = Date.now();
      const STALE_MS = 90_000;
      for (const [streamId, stream] of this.channelStreams.entries()) {
        const staleViewers: string[] = [];
        for (const [viewerId, lastSeen] of stream.viewers.entries()) {
          if (now - lastSeen > STALE_MS) {
            staleViewers.push(viewerId);
          }
        }
        for (const viewerId of staleViewers) {
          stream.viewers.delete(viewerId);
          // Notify host to close the peer connection
          this.sendToUser(stream.hostId, {
            type: 'channel:live-viewer-left',
            data: { streamId, viewerId, reason: 'stale' },
          });
          // 🔒 FIX: also decrement viewer_count in DB
          try {
            db.prepare("UPDATE channel_livestream_viewers SET left_at = datetime('now') WHERE stream_id = ? AND user_id = ? AND left_at IS NULL").run(streamId, viewerId);
            db.prepare('UPDATE channel_livestreams SET viewer_count = MAX(viewer_count - 1, 0) WHERE id = ?').run(streamId);
          } catch {}
          console.log(`[WS-CH] Evicted stale viewer ${viewerId} from stream ${streamId}`);
        }
      }
    }, 30000);

    // Clear heartbeat on server shutdown
    this.wss.on('close', () => {
      clearInterval(heartbeatInterval);
      clearInterval(channelStaleSweeper);
    });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      console.log('[WS] New connection attempt');
      // @ts-ignore — mark as alive for heartbeat
      ws._isAlive = true;
      ws.on('pong', () => {
        // @ts-ignore
        ws._isAlive = true;
      });

      // We'll authenticate after connection via a message
      // This avoids URL-based token leaking in logs
      let authenticated = false;
      let userId = '';
      let isAdmin = false;
      let authTimeout: ReturnType<typeof setTimeout>;

      // Timeout: close connection if not authenticated within 10 seconds
      authTimeout = setTimeout(() => {
        if (!authenticated) {
          console.log('[WS] Connection timed out - no auth');
          ws.close(4001, 'Authentication timeout');
        }
      }, 10000);

      // 🔒 FIX: per-socket rate limit — max 60 messages / 10 seconds.
      // A misbehaving client that floods presence:heartbeat, typing, or
      // livestream:chat would otherwise trigger a DB write per message.
      let msgCount = 0;
      let msgWindowStart = Date.now();
      const MSG_RATE_LIMIT = 60;
      const MSG_RATE_WINDOW_MS = 10_000;

      ws.on('message', (raw: Buffer) => {
        // Rate limit check (skip for the very first 'auth' message)
        const now = Date.now();
        if (now - msgWindowStart > MSG_RATE_WINDOW_MS) {
          msgWindowStart = now;
          msgCount = 0;
        }
        msgCount++;
        if (msgCount > MSG_RATE_LIMIT) {
          console.warn(`[WS] Rate limit exceeded for user ${userId || '(unauth)'}, closing connection.`);
          try { ws.close(4002, 'Rate limit exceeded'); } catch {}
          return;
        }

        try {
          const msg = JSON.parse(raw.toString());

          // Handle authentication
          if (msg.type === 'auth' && msg.token) {
            try {
              const payload = verifyToken(msg.token);
              if (!payload || !payload.userId) {
                ws.close(4003, 'Invalid token');
                return;
              }

              // 🔒 FIX: cap concurrent sockets per user (prevents a single
              // user from opening thousands of connections and exhausting
              // server resources).
              const MAX_SOCKETS_PER_USER = 10;
              const existing = this.userIdToSockets.get(payload.userId);
              if (existing && existing.size >= MAX_SOCKETS_PER_USER) {
                console.warn(`[WS] User ${payload.userId} exceeded ${MAX_SOCKETS_PER_USER} concurrent sockets, rejecting.`);
                ws.close(4004, 'Too many concurrent connections');
                return;
              }

              authenticated = true;
              userId = payload.userId;
              isAdmin = !!payload.isAdmin;
              clearTimeout(authTimeout);

              // Store client info
              this.clients.set(userId, {
                ws,
                userId,
                isAdmin,
                connectedAt: Date.now(),
              });

              // Track sockets per user (multiple tabs/devices)
              if (!this.userIdToSockets.has(userId)) {
                this.userIdToSockets.set(userId, new Set());
              }
              this.userIdToSockets.get(userId)!.add(ws);

              // Send confirmation
              this.sendToSocket(ws, { type: 'auth:success', data: { userId, isAdmin } });

              // Broadcast user online status
              this.broadcast({ type: 'presence:online', data: { userId } }, { excludeUserId: userId });

              console.log(`[WS] User ${userId} connected (admin: ${isAdmin})`);
            } catch (err) {
              console.error('[WS] Auth failed:', err);
              ws.close(4003, 'Authentication failed');
            }
            return;
          }

          // Handle presence heartbeat
          if (msg.type === 'presence:heartbeat' && authenticated) {
            // Update last_seen_at in database
            try {
              db.prepare("UPDATE users SET last_seen_at = datetime('now') WHERE id = ?").run(userId);
            } catch { /* ignore */ }
            this.sendToSocket(ws, { type: 'presence:ack', data: {} });
            return;
          }

          // Handle typing indicator
          if (msg.type === 'chat:typing' && authenticated) {
            const { receiverId, groupId } = msg.data || {};
            if (groupId) {
              // Group typing - broadcast to all group members
              try {
                const members = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
                for (const member of members) {
                  if (member.user_id !== userId) {
                    this.sendToUser(member.user_id, {
                      type: 'chat:typing',
                      data: { senderId: userId, groupId },
                    });
                  }
                }
              } catch {}
            } else if (receiverId) {
              this.sendToUser(receiverId, {
                type: 'chat:typing',
                data: { senderId: userId },
              });
            }
            return;
          }

          // Handle chat read receipts
          if (msg.type === 'chat:read' && authenticated) {
            const { contactId, groupId } = msg.data || {};
            if (groupId) {
              // Group read - notify all group members
              try {
                const members = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
                for (const member of members) {
                  if (member.user_id !== userId) {
                    this.sendToUser(member.user_id, {
                      type: 'chat:read',
                      data: { readerId: userId, groupId },
                    });
                  }
                }
              } catch {}
            } else if (contactId) {
              this.sendToUser(contactId, {
                type: 'chat:read',
                data: { readerId: userId },
              });
            }
            return;
          }

          // Handle group message relay
          if (msg.type === 'chat:group-message' && authenticated) {
            const { groupId, message } = msg.data || {};
            if (groupId) {
              this.emitGroupMessage(groupId, message, userId);
            }
            return;
          }

          // Handle request for online users list
          if (msg.type === 'presence:get-online' && authenticated) {
            const onlineUsersList = Array.from(this.userIdToSockets.keys());
            this.sendToSocket(ws, { type: 'presence:online-list', data: { users: onlineUsersList } });
            return;
          }

          // Handle call signaling (WebRTC)
          if (msg.type === 'call:signal' && authenticated) {
            const { targetUserId, signal } = msg.data || {};
            if (targetUserId) {
              const signalType = signal?.type || '';
              const isCallOffer = signalType === 'call-offer';

              // Try to deliver via WebSocket first
              this.sendToUser(targetUserId, {
                type: 'call:signal',
                data: { signal, fromId: userId },
              });

              // If it's a call-offer AND the target user is offline (not
              // connected via WebSocket), send an FCM high-priority push
              // notification so they see the incoming call even when the
              // app is closed or in background.
              if (isCallOffer && !this.isUserOnline(targetUserId)) {
                try {
                  const caller = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(userId) as any;
                  const callerName = caller?.name || 'مستخدم نواقص';
                  const callType = signal?.callType || 'audio';
                  const pushTitle = `📞 ${callerName}`;
                  const pushBody = callType === 'video' ? 'يتصل بك فيديو...' : 'يتصل بك...';

                  // Send FCM high-priority notification (import dynamically
                  // to avoid circular dependency at module load time)
                  import('../services/pushNotifications.js').then(({ sendPushToUser }) => {
                    sendPushToUser(targetUserId, pushTitle, pushBody, {
                      type: 'incoming_call',
                      callerId: userId,
                      callerName,
                      callerAvatar: caller?.avatar || '',
                      callType,
                      link: '/#/chat-app?call=' + userId,
                    }).catch(() => {});
                  }).catch(() => {});
                } catch {}
              }
            }
            return;
          }

          // ─── Livestream events ─────────────────────────────────────
          // Handle livestream start notification
          if (msg.type === 'livestream:start' && authenticated) {
            const { streamId, title, userName, userAvatar } = msg.data || {};
            // Get user info from DB if not provided
            let name = userName;
            let avatar = userAvatar;
            if (!name) {
              try {
                const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(userId) as any;
                name = user?.name || 'مستخدم';
                avatar = user?.avatar || '';
              } catch { name = 'مستخدم'; }
            }
            const sid = streamId || userId;
            // 🔒 FIX: broadcast "livestream:started" only to online users
            // (not the host). Previously this used `broadcast()` which sent
            // to everyone — that's actually the intended behaviour for the
            // "started" notification (every user sees the live indicator),
            // so we keep it. But we DO initialise the viewer set here.
            this.streamViewers.set(sid, new Set());
            this.broadcast({
              type: 'livestream:started',
              data: { streamId: sid, hostId: userId, hostName: name, hostAvatar: avatar, title: title || '' },
            }, { excludeUserId: userId });

            // Track active stream
            this.activeStreams.set(userId, { hostId: userId, hostName: name || 'مستخدم', hostAvatar: avatar || '', startedAt: Date.now() });
            return;
          }

          // Handle livestream end notification
          if (msg.type === 'livestream:end' && authenticated) {
            const { streamId } = msg.data || {};
            const sid = streamId || userId;
            // 🔒 FIX: notify only viewers + host (not every user) — privacy.
            const viewers = this.streamViewers.get(sid) || new Set<string>();
            const recipients = new Set<string>(viewers);
            recipients.add(userId); // include host
            this.broadcastToUsers(recipients, {
              type: 'livestream:ended',
              data: { streamId: sid, hostId: userId },
            }, { excludeUserId: userId });

            // Remove from active streams
            this.activeStreams.delete(userId);
            this.streamViewers.delete(sid);
            return;
          }

          // Handle livestream chat message
          if (msg.type === 'livestream:chat' && authenticated) {
            const { streamId, text } = msg.data || {};
            // Get user info
            let name = '';
            let avatar = '';
            try {
              const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(userId) as any;
              name = user?.name || 'مستخدم';
              avatar = user?.avatar || '';
            } catch { name = 'مستخدم'; }
            const sid = streamId || userId;
            // 🔒 FIX: send only to viewers + host (not every connected user).
            // Previously this used `broadcast()` which leaked livestream chat
            // to every user on the platform.
            const viewers = this.streamViewers.get(sid) || new Set<string>();
            const recipients = new Set<string>(viewers);
            recipients.add(sid); // include host (host's userId === streamId in single-host mode)
            this.broadcastToUsers(recipients, {
              type: 'livestream:chat',
              data: { streamId: sid, userId, userName: name, userAvatar: avatar, text, time: new Date().toISOString() },
            }, { excludeUserId: userId });
            return;
          }

          // Handle livestream viewer join/leave
          if (msg.type === 'livestream:join' && authenticated) {
            const { streamId } = msg.data || {};
            const sid = streamId || userId;
            // 🔒 FIX: track this viewer so future chat messages reach them.
            if (!this.streamViewers.has(sid)) this.streamViewers.set(sid, new Set());
            this.streamViewers.get(sid)!.add(userId);
            // Notify the stream host
            this.sendToUser(sid, {
              type: 'livestream:viewer-joined',
              data: { streamId: sid, viewerId: userId },
            });
            return;
          }

          if (msg.type === 'livestream:leave' && authenticated) {
            const { streamId } = msg.data || {};
            const sid = streamId || userId;
            // 🔒 FIX: remove this viewer from the stream's viewer set.
            this.streamViewers.get(sid)?.delete(userId);
            this.sendToUser(sid, {
              type: 'livestream:viewer-left',
              data: { streamId: sid, viewerId: userId },
            });
            return;
          }

          // Handle livestream WebRTC signaling (broadcaster ↔ viewers)
          if (msg.type === 'livestream:signal' && authenticated) {
            const { streamId, signal } = msg.data || {};
            if (!signal) return;

            // 1. If signal has targetViewer → broadcaster sending offer/ICE to a specific viewer
            if (signal.targetViewer) {
              console.log(`[WS] Livestream signal: broadcaster ${userId} → viewer ${signal.targetViewer} (${signal.type || 'ICE'})`);
              this.sendToUser(signal.targetViewer, {
                type: 'livestream:signal',
                data: { streamId: streamId || userId, fromId: userId, signal },
              });
              return;
            }

            // 2. If signal.type === 'answer' → viewer sending answer to broadcaster
            //    streamId here is the host's userId
            if (signal.type === 'answer') {
              console.log(`[WS] Livestream signal: viewer ${userId} → broadcaster ${streamId} (answer)`);
              this.sendToUser(streamId, {
                type: 'livestream:signal',
                data: { streamId, fromId: userId, signal },
              });
              return;
            }

            // 3. Otherwise (ICE candidate from viewer) → send to broadcaster
            //    For viewers, streamId === host's userId
            if (signal.candidate) {
              // Could be from viewer (going to broadcaster) or from broadcaster (going to viewer)
              // Since broadcaster always uses targetViewer, this branch is for viewer → broadcaster
              console.log(`[WS] Livestream signal: viewer ${userId} → broadcaster ${streamId} (ICE)`);
              this.sendToUser(streamId, {
                type: 'livestream:signal',
                data: { streamId, fromId: userId, signal },
              });
              return;
            }

            // Fallback: broadcast (shouldn't normally reach here)
            console.warn(`[WS] Livestream signal: unknown type, broadcasting`, signal);
            this.broadcast({
              type: 'livestream:signal',
              data: { streamId: streamId || userId, fromId: userId, signal },
            }, { excludeUserId: userId });
            return;
          }

          // ─── Channel Live Streams (WebRTC P2P) ─────────────────────
          // Host → Server: "I'm ready to receive viewer offers"
          if (msg.type === 'channel:live-host-ready' && authenticated) {
            const { streamId, channelId } = msg.data || {};
            if (!streamId || !channelId) return;
            this.channelStreams.set(streamId, {
              hostId: userId,
              channelId,
              viewers: new Map(),
            });
            console.log(`[WS-CH] Stream ${streamId} ready (host=${userId}, channel=${channelId})`);
            return;
          }

          // Host → Server: "Stream ended, evict everyone"
          if (msg.type === 'channel:live-end' && authenticated) {
            const { streamId } = msg.data || {};
            const stream = this.channelStreams.get(streamId);
            if (!stream || stream.hostId !== userId) return;
            // Notify all viewers
            const recipients = new Set<string>(stream.viewers.keys());
            this.broadcastToUsers(recipients, {
              type: 'channel:live-ended',
              data: { streamId, reason: 'host-ended' },
            });
            this.channelStreams.delete(streamId);
            console.log(`[WS-CH] Stream ${streamId} ended by host`);
            return;
          }

          // Viewer → Server: "I want to watch stream X"
          // Server → Host: "New viewer Y joined, send them an offer"
          if (msg.type === 'channel:live-join' && authenticated) {
            const { streamId } = msg.data || {};
            const stream = this.channelStreams.get(streamId);
            if (!stream) {
              this.sendToUser(userId, {
                type: 'channel:live-error',
                data: { streamId, error: 'stream-not-found' },
              });
              return;
            }
            stream.viewers.set(userId, Date.now());
            // Notify host to send a WebRTC offer to this viewer
            this.sendToUser(stream.hostId, {
              type: 'channel:live-viewer-joined',
              data: { streamId, viewerId: userId },
            });
            console.log(`[WS-CH] Viewer ${userId} joined stream ${streamId}`);
            return;
          }

          // Viewer → Server: "I'm leaving stream X"
          if (msg.type === 'channel:live-leave' && authenticated) {
            const { streamId } = msg.data || {};
            const stream = this.channelStreams.get(streamId);
            if (!stream) return;
            stream.viewers.delete(userId);
            // Notify host so they can close the peer connection
            this.sendToUser(stream.hostId, {
              type: 'channel:live-viewer-left',
              data: { streamId, viewerId: userId },
            });
            return;
          }

          // Viewer → Server: heartbeat ("I'm still watching")
          // Refreshes lastSeen so the stale-viewer sweeper doesn't evict.
          if (msg.type === 'channel:live-heartbeat' && authenticated) {
            const { streamId } = msg.data || {};
            const stream = this.channelStreams.get(streamId);
            if (!stream) return;
            if (stream.viewers.has(userId)) {
              stream.viewers.set(userId, Date.now());
            }
            return;
          }

          // Viewer ↔ Host: WebRTC signaling (offer/answer/ICE)
          // Routing rules:
          //   - Host sends signal with `targetViewer` → deliver to that viewer
          //   - Viewer sends signal (answer or ICE candidate) → deliver to host
          if (msg.type === 'channel:live-signal' && authenticated) {
            const { streamId, signal } = msg.data || {};
            if (!streamId || !signal) return;
            const stream = this.channelStreams.get(streamId);
            if (!stream) return;

            // Host → specific viewer (offer or ICE candidate)
            if (signal.targetViewer) {
              // Verify sender is the host
              if (stream.hostId !== userId) return;
              this.sendToUser(signal.targetViewer, {
                type: 'channel:live-signal',
                data: { streamId, fromId: userId, signal },
              });
              return;
            }

            // Viewer → host (answer or ICE candidate)
            // Verify sender is a current viewer
            if (!stream.viewers.has(userId)) return;
            this.sendToUser(stream.hostId, {
              type: 'channel:live-signal',
              data: { streamId, fromId: userId, signal },
            });
            return;
          }

          // Chat: routed via WS for instant delivery (DB write happens
          // via the REST endpoint; this is just the realtime fan-out).
          if (msg.type === 'channel:live-chat' && authenticated) {
            const { streamId, content } = msg.data || {};
            if (!streamId || !content) return;
            const stream = this.channelStreams.get(streamId);
            if (!stream) return;
            // Only viewers + host receive the chat
            const recipients = new Set<string>(stream.viewers.keys());
            recipients.add(stream.hostId);
            // Look up sender name/avatar
            let name = 'مستخدم';
            let avatar = '';
            try {
              const user = db.prepare('SELECT name, avatar FROM users WHERE id = ?').get(userId) as any;
              name = user?.name || 'مستخدم';
              avatar = user?.avatar || '';
            } catch {}
            this.broadcastToUsers(recipients, {
              type: 'channel:live-chat',
              data: {
                streamId,
                id: randomUUID(),
                user_id: userId,
                user_name: name,
                user_avatar: avatar,
                content: String(content).slice(0, 500),
                created_at: new Date().toISOString(),
              },
            }, { excludeUserId: userId });
            return;
          }

          // Gift notification: server broadcasts to all viewers + host
          if (msg.type === 'channel:live-gift' && authenticated) {
            const { streamId, gift } = msg.data || {};
            if (!streamId || !gift) return;
            const stream = this.channelStreams.get(streamId);
            if (!stream) return;
            const recipients = new Set<string>(stream.viewers.keys());
            recipients.add(stream.hostId);
            this.broadcastToUsers(recipients, {
              type: 'channel:live-gift',
              data: { streamId, gift, senderId: userId },
            });
            return;
          }

        } catch (err) {
          console.error('[WS] Message parse error:', err);
        }
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (userId) {
          // Remove from sockets map
          const sockets = this.userIdToSockets.get(userId);
          if (sockets) {
            sockets.delete(ws);
            if (sockets.size === 0) {
              this.userIdToSockets.delete(userId);
              this.clients.delete(userId);
              // Broadcast user offline
              this.broadcast({ type: 'presence:offline', data: { userId } });

              // If this user was an active livestream host, end the stream
              if (this.activeStreams.has(userId)) {
                console.log(`[WS] Livestream host ${userId} disconnected, ending stream`);
                this.broadcast({
                  type: 'livestream:ended',
                  data: { streamId: userId, hostId: userId, reason: 'host-disconnected' },
                }, { excludeUserId: userId });
                this.activeStreams.delete(userId);
              }

              // If this user was a viewer in any active stream, notify the host
              // We don't track viewers explicitly, so we broadcast viewer-left to all active hosts
              for (const [hostId] of this.activeStreams) {
                if (hostId !== userId) {
                  this.sendToUser(hostId, {
                    type: 'livestream:viewer-left',
                    data: { streamId: hostId, viewerId: userId, reason: 'viewer-disconnected' },
                  });
                }
              }

              // ─── Channel Live Streams cleanup ──────────────────────
              // 1) If this user was a CHANNEL STREAM HOST, end the stream
              //    and evict all viewers (their video freezes / black screen).
              // 2) If this user was a VIEWER in any channel stream, remove
              //    them and notify the host so they can close the peer.
              for (const [streamId, stream] of this.channelStreams.entries()) {
                if (stream.hostId === userId) {
                  // Host disconnected → end stream for everyone
                  const recipients = new Set<string>(stream.viewers.keys());
                  this.broadcastToUsers(recipients, {
                    type: 'channel:live-ended',
                    data: { streamId, reason: 'host-disconnected' },
                  });
                  this.channelStreams.delete(streamId);
                  console.log(`[WS-CH] Host ${userId} disconnected, ended stream ${streamId}`);
                } else if (stream.viewers.has(userId)) {
                  // Viewer disconnected → remove + notify host + update DB
                  stream.viewers.delete(userId);
                  this.sendToUser(stream.hostId, {
                    type: 'channel:live-viewer-left',
                    data: { streamId, viewerId: userId, reason: 'viewer-disconnected' },
                  });
                  // 🔒 FIX: also decrement viewer_count in DB so it doesn't
                  // stay inflated when a viewer closes their browser without
                  // calling the REST `/viewer-leave` endpoint.
                  try {
                    db.prepare("UPDATE channel_livestream_viewers SET left_at = datetime('now') WHERE stream_id = ? AND user_id = ? AND left_at IS NULL").run(streamId, userId);
                    db.prepare('UPDATE channel_livestreams SET viewer_count = MAX(viewer_count - 1, 0) WHERE id = ?').run(streamId);
                  } catch (err) {
                    console.warn(`[WS-CH] Failed to update DB on viewer disconnect:`, err);
                  }
                }
              }
            }
          }
          console.log(`[WS] User ${userId} disconnected`);
        }
      });

      ws.on('error', (err) => {
        console.error(`[WS] Error for user ${userId}:`, err.message);
      });
    });

    console.log('[WS] WebSocket server initialized on /ws');
  }

  /**
   * Send a message to a specific WebSocket connection
   */
  private sendToSocket(ws: WebSocket, event: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Send an event to a specific user (all their connections)
   */
  sendToUser(userId: string, event: any) {
    const sockets = this.userIdToSockets.get(userId);
    if (sockets) {
      const data = JSON.stringify(event);
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    }
  }

  /**
   * Broadcast an event to a specific set of user IDs (with optional exclusion).
   * Used by livestream chat/end so only viewers + host receive the message.
   */
  broadcastToUsers(userIds: Set<string>, event: WSEvent | { type: string; data: any }, options?: { excludeUserId?: string }) {
    if (!this.wss) return;
    const data = JSON.stringify(event);
    const excludeId = (event as any).excludeUserId || options?.excludeUserId;
    for (const uid of userIds) {
      if (uid === excludeId) continue;
      const sockets = this.userIdToSockets.get(uid);
      if (!sockets) continue;
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(data); } catch {}
        }
      }
    }
  }

  /**
   * Broadcast an event to all connected clients, with optional filtering.
   *
   * 🔒 FIX: previously iterated `this.clients` (a Map<userId, ClientInfo>
   * that only held the LATEST socket per user). When a user opened multiple
   * tabs, only the latest tab received broadcasts; when that tab closed but
   * older tabs remained, the user stopped receiving events entirely.
   * Now we iterate `userIdToSockets` (Map<userId, Set<WebSocket>>) so every
   * open socket of every matching user receives the broadcast.
   */
  broadcast(event: WSEvent, options?: { excludeUserId?: string }) {
    if (!this.wss) return;

    const data = JSON.stringify(event);
    const excludeId = event.excludeUserId || options?.excludeUserId;

    for (const [uid, sockets] of this.userIdToSockets) {
      if (uid === excludeId) continue;

      // Apply filters using the ClientInfo for isAdmin (read from any socket
      // — admin status doesn't change between tabs of the same user).
      if (event.adminOnly) {
        const info = this.clients.get(uid);
        if (!info?.isAdmin) continue;
      }
      if (event.targetUserIds && !event.targetUserIds.includes(uid)) continue;
      if (event.targetUserId && uid !== event.targetUserId) continue;

      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(data); } catch { /* socket may have closed */ }
        }
      }
    }
  }

  /**
   * Get list of online user IDs
   */
  getOnlineUsers(): string[] {
    return Array.from(this.userIdToSockets.keys());
  }

  /**
   * Get count of connected SOCKET clients (not unique users).
   * 🔒 FIX: previously returned `this.clients.size` (unique users), which
   * was misleading for the admin dashboard's "online users" metric.
   * Now returns the actual socket count across all tabs/devices.
   * Use `getOnlineUserCount()` for unique-user count.
   */
  getConnectionCount(): number {
    let total = 0;
    for (const sockets of this.userIdToSockets.values()) total += sockets.size;
    return total;
  }

  /**
   * Get count of UNIQUE online users.
   */
  getOnlineUserCount(): number {
    return this.userIdToSockets.size;
  }

  /**
   * Check if a user is online
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userIdToSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Emit a notification event to a specific user
   */
  emitNotification(userId: string, notification: any) {
    this.sendToUser(userId, {
      type: 'notification:new',
      data: notification,
    });
  }

  /**
   * Emit a new chat message event
   */
  emitChatMessage(receiverId: string, message: any) {
    this.sendToUser(receiverId, {
      type: 'chat:message',
      data: message,
    });
  }

  /**
   * Emit a group message to all members of a group (excluding sender)
   */
  emitGroupMessage(groupId: string, message: any, excludeUserId?: string) {
    try {
      const members = db.prepare('SELECT user_id FROM chat_group_members WHERE group_id = ?').all(groupId) as any[];
      for (const member of members) {
        if (member.user_id !== excludeUserId) {
          this.sendToUser(member.user_id, {
            type: 'chat:group-message',
            data: message,
          });
        }
      }
    } catch (err) {
      console.error('[WS] Failed to emit group message:', err);
    }
  }

  /**
   * Emit a friend request event
   */
  emitFriendRequest(addresseeId: string, requestData: any) {
    this.sendToUser(addresseeId, {
      type: 'friend:request',
      data: requestData,
    });
  }

  /**
   * Emit a friend request accepted event
   */
  emitFriendAccepted(requesterId: string, data: any) {
    this.sendToUser(requesterId, {
      type: 'friend:accepted',
      data: data,
    });
  }

  /**
   * Emit a call signal to a specific user (WebRTC signaling)
   */
  emitCallSignal(targetUserId: string, signalData: any) {
    this.sendToUser(targetUserId, {
      type: 'call:signal',
      data: signalData,
    });
  }

  /**
   * Emit admin event to all admin users
   */
  emitAdminEvent(eventType: string, data: any) {
    this.broadcast({
      type: `admin:${eventType}`,
      data,
      adminOnly: true,
    });
  }

  /**
   * Emit admin alert to ALL connected users (not just admins)
   * Used for the admin alert bar that appears at the top of every page
   */
  emitAdminAlert(alertData: any) {
    this.broadcast({
      type: 'admin:alert',
      data: alertData,
    });
  }

  /**
   * Emit livestream event (started/ended/chat)
   */
  emitLivestreamEvent(eventType: string, data: any, excludeUserId?: string) {
    this.broadcast({
      type: `livestream:${eventType}`,
      data,
    }, { excludeUserId });
  }

  // ─── Channel Live Streams public API ──────────────────────────────
  /**
   * Force-end a channel stream from the server side (e.g. admin action
   * or the host's REST `end` endpoint fired). Notifies all viewers and
   * removes the stream from the in-memory map.
   */
  endChannelStream(streamId: string, reason: string = 'ended') {
    const stream = this.channelStreams.get(streamId);
    if (!stream) return;
    const recipients = new Set<string>(stream.viewers.keys());
    recipients.add(stream.hostId);
    this.broadcastToUsers(recipients, {
      type: 'channel:live-ended',
      data: { streamId, reason },
    });
    this.channelStreams.delete(streamId);
    console.log(`[WS-CH] Stream ${streamId} force-ended (${reason})`);
  }

  /**
   * Get active viewer count for a channel stream (from in-memory map,
   * not the DB — useful for quick checks without hitting SQLite).
   */
  getChannelStreamViewerCount(streamId: string): number {
    return this.channelStreams.get(streamId)?.viewers.size || 0;
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
export default wsManager;
