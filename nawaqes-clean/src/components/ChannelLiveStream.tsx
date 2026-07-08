// ─── Channel Live Stream Panel (v4 — WebRTC P2P) ────────────────────
// Features:
//   • WebRTC P2P video broadcast (host → viewers) — viewers actually
//     SEE the host's camera, not just an avatar. ✓ fixes v3's biggest bug
//   • Real-time chat/gifts/viewer events over WebSocket (no polling)
//   • Viewer heartbeat every 15s + server-side stale-viewer sweeper
//     → fixes inflated viewer count when viewers close browser
//     without clicking "leave"
//   • Stream title modal (replaces jarring window.prompt)
//   • MediaRecorder captures the broadcast → uploaded as a channel post
//     on stream end so subscribers can watch the replay
//   • Network quality indicator (host: connection stats, viewer: state)
//   • Auto-reconnect: if WS drops, viewer re-joins on reconnect
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { toast as sonnerToast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { startBackgroundVideoUpload } from '../lib/backgroundUpload';
import {
  Radio, X, Send, Eye, Loader2, Mic, MicOff, Video, VideoOff, PhoneOff,
  Gift, BarChart3, Clock, Calendar, SwitchCamera, Heart, Wifi, WifiOff,
  Signal, Save, Trash2, AlertTriangle,
} from 'lucide-react';

interface ChannelLiveStreamProps {
  channelId: string;
  isAdmin: boolean;
  darkMode: boolean;
  t: (key: string, opts?: any) => string;
  onStreamEnd: () => void;
}

// ─── ICE server config (shared with LiveStreamPage) ──────────────────
const FALLBACK_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

let cachedIceServers: RTCConfiguration | null = null;
let iceCacheExpiry = 0;
const ICE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchIceServers(): Promise<RTCConfiguration> {
  const now = Date.now();
  if (cachedIceServers && now < iceCacheExpiry) return cachedIceServers;
  try {
    const token = api.getToken();
    if (!token) return FALLBACK_ICE_SERVERS;
    const res = await fetch('/api/webrtc/config', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return FALLBACK_ICE_SERVERS;
    const data = await res.json();
    if (!data?.iceServers || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      return FALLBACK_ICE_SERVERS;
    }
    const config: RTCConfiguration = {
      iceServers: data.iceServers,
      iceTransportPolicy: data.iceTransportPolicy || 'all',
      bundlePolicy: data.bundlePolicy || 'max-bundle',
      rtcpMuxPolicy: data.rtcpMuxPolicy || 'require',
    };
    cachedIceServers = config;
    iceCacheExpiry = now + ICE_CACHE_TTL_MS;
    return config;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

export const ChannelLiveStream: React.FC<ChannelLiveStreamProps> = ({
  channelId, isAdmin, darkMode, t, onStreamEnd,
}) => {
  const { currentUser } = useAuth();
  const { dir } = useLanguage();

  // ─── Stream state ─────────────────────────────────────────────────
  const [stream, setStream] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showLivePanel, setShowLivePanel] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showStartModal, setShowStartModal] = useState(false);
  const [pendingTitle, setPendingTitle] = useState('');
  // End-stream confirmation modal: asks the host "save recording? yes/no"
  // before ending. Either way the stream ends immediately; if "yes", the
  // recording uploads in the background via the BackgroundUploadBadge.
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'>('idle');

  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ─── WebRTC refs ──────────────────────────────────────────────────
  // Host: one peer connection per viewer
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Viewer: single peer connection to host
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // Reusable ref so async callbacks read the latest localStream
  const localStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<any>(null);
  localStreamRef.current = localStream;
  streamRef.current = stream;

  // ─── MediaRecorder (host-side recording for replay) ───────────────
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamStartTimeRef = useRef<number>(0);

  // ─── Chat state ───────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');

  // ─── Gifts state ──────────────────────────────────────────────────
  const [showGifts, setShowGifts] = useState(false);
  const [giftCatalog, setGiftCatalog] = useState<any[]>([]);
  const [recentGifts, setRecentGifts] = useState<any[]>([]);
  const [sendingGift, setSendingGift] = useState(false);
  const [floatingGifts, setFloatingGifts] = useState<Array<{
    id: string; icon: string; senderName: string; color: string;
  }>>([]);
  const lastGiftIdRef = useRef<string | null>(null);

  // ─── Polls state ──────────────────────────────────────────────────
  const [activePolls, setActivePolls] = useState<any[]>([]);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});

  // ─── Scheduled streams + analytics ────────────────────────────────
  const [scheduledStreams, setScheduledStreams] = useState<any[]>([]);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);

  // ─── Controls auto-hide (YouTube/TikTok pattern) ──────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => setControlsVisible(false), 4000);
  }, []);
  const hideControls = useCallback(() => {
    setControlsVisible(false);
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
  }, []);
  const handleVideoTap = useCallback(() => {
    if (controlsVisible) hideControls();
    else showControls();
  }, [controlsVisible, showControls, hideControls]);

  useEffect(() => () => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
  }, []);

  // ─── Load initial stream + gift catalog + scheduled streams ───────
  const loadStream = useCallback(async () => {
    try {
      const data = await api.getCurrentChannelLive(channelId);
      setStream(data);
      if (data) {
        const [chat, gifts, polls] = await Promise.all([
          api.getChannelLiveChat(channelId),
          api.getChannelLiveGifts(channelId).catch(() => []),
          api.getLivePolls(channelId).catch(() => []),
        ]);
        setChatMessages(chat);
        setRecentGifts(gifts);
        if (gifts.length > 0) lastGiftIdRef.current = gifts[0].id;
        setActivePolls(polls);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [channelId]);

  useEffect(() => {
    api.getGiftCatalog().then(setGiftCatalog).catch(() => {});
    api.getScheduledChannelStreams(channelId).then(setScheduledStreams).catch(() => {});
  }, [channelId]);

  useEffect(() => { loadStream(); }, [loadStream]);

  // ─── Helper: spawn floating gift animation ────────────────────────
  const spawnFloatingGift = useCallback((icon: string, senderName: string) => {
    const colors = ['#F59E0B', '#EC4899', '#10B981', '#8B5CF6', '#3B82F6', '#EF4444'];
    const fid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setFloatingGifts(prev => [...prev, {
      id: fid,
      icon: icon || '🎁',
      senderName: senderName || 'مشاهد',
      color: colors[Math.floor(Math.random() * colors.length)],
    }]);
    setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== fid)), 3000);
  }, []);

  // ─── WebSocket: channel live event handlers ───────────────────────
  const ws = useWebSocket({
    onChannelLiveViewerJoined: (data: any) => {
      // Host: a new viewer joined → create peer connection + send offer
      if (data?.streamId !== streamRef.current?.id) return;
      if (data?.viewerId === currentUser?.id) return; // skip self
      createHostPeerConnection(data.viewerId).catch(err =>
        console.warn('[CH-LIVE] Failed to create peer connection for viewer', err)
      );
    },
    onChannelLiveViewerLeft: (data: any) => {
      // Host: viewer left → close peer connection
      if (data?.streamId !== streamRef.current?.id) return;
      const pc = peerConnectionsRef.current.get(data?.viewerId);
      if (pc) {
        try { pc.close(); } catch {}
        peerConnectionsRef.current.delete(data?.viewerId);
        console.log('[CH-LIVE] Closed peer connection for departed viewer', data?.viewerId);
      }
    },
    onChannelLiveEnded: (data: any) => {
      // Viewer: host ended the stream → close panel + cleanup
      if (data?.streamId !== streamRef.current?.id) return;
      console.log('[CH-LIVE] Stream ended by host, reason:', data?.reason);
      // Close peer connection
      if (viewerPeerConnectionRef.current) {
        try { viewerPeerConnectionRef.current.close(); } catch {}
        viewerPeerConnectionRef.current = null;
      }
      setRemoteStream(null);
      setStream(null);
      setShowLivePanel(false);
      setConnectionState('idle');
      sonnerToast.info('انتهى البث المباشر');
    },
    onChannelLiveSignal: (data: any) => {
      // Both: handle incoming WebRTC signal (offer/answer/ICE)
      handleIncomingSignal(data);
    },
    onChannelLiveChat: (data: any) => {
      // Real-time chat message via WS (no polling)
      if (data?.streamId !== streamRef.current?.id) return;
      setChatMessages(prev => {
        // Deduplicate (in case REST + WS both fire)
        if (prev.some(m => m.id === data.id)) return prev;
        return [...prev, {
          id: data.id,
          user_id: data.user_id,
          user_name: data.user_name,
          user_avatar: data.user_avatar,
          content: data.content,
          created_at: data.created_at,
        }].slice(-200); // cap to last 200 messages
      });
    },
    onChannelLiveGift: (data: any) => {
      // Real-time gift notification via WS
      if (data?.streamId !== streamRef.current?.id) return;
      const gift = data?.gift;
      if (!gift) return;
      spawnFloatingGift(gift.icon || '🎁', gift.senderName || 'مشاهد');
      // Also refresh the recent gifts ticker
      api.getChannelLiveGifts(channelId).then(setRecentGifts).catch(() => {});
    },
    onChannelLiveError: (data: any) => {
      // Viewer: stream not found / already ended
      if (data?.error === 'stream-not-found') {
        sonnerToast.error('البث غير متاح — قد يكون انتهى للتو');
        setShowLivePanel(false);
        setStream(null);
      }
    },
  });

  // ─── Host: create peer connection for a new viewer + send offer ───
  const createHostPeerConnection = useCallback(async (viewerUserId: string) => {
    if (!localStreamRef.current) {
      console.warn('[CH-LIVE] Cannot create peer connection: no local stream');
      return;
    }
    // Already exists? skip
    if (peerConnectionsRef.current.has(viewerUserId)) {
      console.log('[CH-LIVE] Peer connection already exists for viewer', viewerUserId);
      return;
    }

    const iceConfig = await fetchIceServers();
    const pc = new RTCPeerConnection(iceConfig);
    peerConnectionsRef.current.set(viewerUserId, pc);

    // Add local tracks (camera + mic)
    localStreamRef.current.getTracks().forEach(track => {
      try {
        pc.addTrack(track, localStreamRef.current!);
      } catch (err) {
        console.warn('[CH-LIVE] Failed to add track:', err);
      }
    });

    // ICE candidates → send to specific viewer
    pc.onicecandidate = (event) => {
      if (event.candidate && streamRef.current) {
        ws.sendChannelLiveSignal(streamRef.current.id, {
          candidate: event.candidate,
          targetViewer: viewerUserId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[CH-LIVE] Peer ${viewerUserId.slice(0, 8)} state: ${pc.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        const existed = peerConnectionsRef.current.delete(viewerUserId);
        if (existed) {
          try { pc.close(); } catch {}
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch {}
      }
    };

    // Create offer + send to viewer
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering (with 2s timeout — trickle ICE would be
      // better but this is simpler and works for small peer counts)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 2000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      const offerWithTarget = {
        ...pc.localDescription?.toJSON(),
        targetViewer: viewerUserId,
      };
      if (streamRef.current) {
        ws.sendChannelLiveSignal(streamRef.current.id, offerWithTarget);
        console.log('[CH-LIVE] Offer sent to viewer', viewerUserId.slice(0, 8));
      }
    } catch (err) {
      console.error('[CH-LIVE] Offer creation error:', err);
      peerConnectionsRef.current.delete(viewerUserId);
      try { pc.close(); } catch {}
    }
  }, [ws]);

  // ─── Both: handle incoming WebRTC signal ──────────────────────────
  const handleIncomingSignal = useCallback(async (data: any) => {
    const { fromId, signal } = data || {};
    if (!signal) return;
    if (data?.streamId !== streamRef.current?.id) return;

    // Strip non-WebRTC fields
    const cleanSignal: any = { ...signal };
    delete cleanSignal.targetViewer;

    try {
      const isHost = streamRef.current?.host_id === currentUser?.id;

      if (cleanSignal.type === 'answer' && isHost) {
        // Host receives answer from viewer
        const pc = peerConnectionsRef.current.get(fromId);
        if (!pc) return;
        if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(cleanSignal));
          } catch (err) {
            console.warn('[CH-LIVE] setRemoteDescription failed (answer):', err);
          }
        }
      } else if (cleanSignal.type === 'offer' && !isHost) {
        // Viewer receives offer from host
        if (!viewerPeerConnectionRef.current) {
          console.warn('[CH-LIVE] No viewer peer connection');
          return;
        }
        const pc = viewerPeerConnectionRef.current;
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(cleanSignal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Wait for ICE gathering
            await new Promise<void>((resolve) => {
              if (pc.iceGatheringState === 'complete') { resolve(); return; }
              const timeout = setTimeout(resolve, 2000);
              pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') {
                  clearTimeout(timeout);
                  resolve();
                }
              };
            });

            if (streamRef.current) {
              ws.sendChannelLiveSignal(streamRef.current.id, pc.localDescription);
              console.log('[CH-LIVE] Answer sent to host');
            }
          } catch (err) {
            console.error('[CH-LIVE] Offer handling failed:', err);
          }
        }
      } else if (cleanSignal.candidate) {
        // ICE candidate
        try {
          if (isHost) {
            const pc = peerConnectionsRef.current.get(fromId);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(cleanSignal.candidate));
          } else if (viewerPeerConnectionRef.current) {
            await viewerPeerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cleanSignal.candidate));
          }
        } catch (err) {
          // ICE candidate errors are common and usually safe to ignore
          console.debug('[CH-LIVE] ICE candidate error (often safe):', err);
        }
      }
    } catch (err) {
      console.error('[CH-LIVE] Signal error:', err);
    }
  }, [ws, currentUser?.id]);

  // ─── Viewer: join stream (called when panel opens) ────────────────
  const joinStreamAsViewer = useCallback(async () => {
    if (!stream?.id) return;
    setConnectionState('connecting');

    try {
      // Close any existing peer connection
      if (viewerPeerConnectionRef.current) {
        try { viewerPeerConnectionRef.current.close(); } catch {}
        viewerPeerConnectionRef.current = null;
      }

      const iceConfig = await fetchIceServers();
      const pc = new RTCPeerConnection(iceConfig);
      viewerPeerConnectionRef.current = pc;

      // Collect remote tracks into a single MediaStream
      const remoteTracks: MediaStreamTrack[] = [];
      pc.ontrack = (event) => {
        console.log('[CH-LIVE] Remote track received:', event.track.kind);
        if (event.streams[0]) {
          event.streams[0].getTracks().forEach(track => {
            if (!remoteTracks.find(t => t.id === track.id)) remoteTracks.push(track);
          });
        } else {
          if (!remoteTracks.find(t => t.id === event.track.id)) remoteTracks.push(event.track);
        }
        setRemoteStream(new MediaStream(remoteTracks));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && streamRef.current) {
          ws.sendChannelLiveSignal(streamRef.current.id, { candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[CH-LIVE] Viewer peer state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setConnectionState('connected');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnectionState('failed');
          if (pc.connectionState === 'failed') {
            sonnerToast.error('انقطع الاتصال بالبث — جاري إعادة المحاولة...');
            // Auto-reconnect after 2s
            setTimeout(() => {
              if (streamRef.current) {
                ws.sendChannelLiveJoin(streamRef.current.id);
                setConnectionState('reconnecting');
              }
            }, 2000);
          }
        } else if (pc.connectionState === 'closed') {
          setConnectionState('idle');
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          try { pc.restartIce(); } catch {}
        }
      };

      // Notify host we joined (server will ask host to send offer)
      ws.sendChannelLiveJoin(stream.id);
      console.log('[CH-LIVE] Viewer joined stream', stream.id);

      // Also call REST endpoint for DB tracking (viewer_count, viewer_total)
      api.joinChannelLiveViewer(channelId).catch(() => {});

      // Timeout: if no offer in 15s, show error
      setTimeout(() => {
        if (viewerPeerConnectionRef.current &&
            !viewerPeerConnectionRef.current.remoteDescription) {
          console.warn('[CH-LIVE] No offer from host after 15s');
          setConnectionState('failed');
          sonnerToast.error('تعذّر الاتصال بالمذيع — قد يكون البث قد انتهى');
        }
      }, 15000);
    } catch (err) {
      console.error('[CH-LIVE] Join error:', err);
      setConnectionState('failed');
    }
  }, [stream?.id, ws, channelId]);

  // ─── Viewer: leave stream (called when panel closes) ──────────────
  const leaveStreamAsViewer = useCallback(() => {
    if (stream?.id) {
      try { ws.sendChannelLiveLeave(stream.id); } catch {}
      api.leaveChannelLiveViewer(channelId).catch(() => {});
    }
    if (viewerPeerConnectionRef.current) {
      try {
        viewerPeerConnectionRef.current.getReceivers().forEach(r => {
          try { r.track?.stop(); } catch {}
        });
        viewerPeerConnectionRef.current.close();
      } catch {}
      viewerPeerConnectionRef.current = null;
    }
    setRemoteStream(null);
    setConnectionState('idle');
  }, [stream?.id, ws, channelId]);

  // ─── Viewer: heartbeat every 15s while panel open ─────────────────
  // Prevents stale-viewer eviction (server kicks viewers who haven't
  // heartbeat in 90s). Also refreshes viewer count for display.
  useEffect(() => {
    if (!stream?.id || !showLivePanel) return;
    if (stream?.host_id === currentUser?.id) return; // host doesn't heartbeat
    const interval = setInterval(() => {
      ws.sendChannelLiveHeartbeat(stream.id);
    }, 15000);
    return () => clearInterval(interval);
  }, [stream?.id, stream?.host_id, showLivePanel, currentUser?.id, ws]);

  // ─── Host: register with WS server + start recording ──────────────
  useEffect(() => {
    if (stream?.id && showLivePanel && stream.host_id === currentUser?.id && localStream) {
      // Tell WS server "I'm the host of this stream"
      ws.sendChannelLiveHostReady(stream.id, channelId);
      console.log('[CH-LIVE] Host ready registered for stream', stream.id);

      // Start MediaRecorder for replay
      try {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          const mr = new MediaRecorder(localStream, {
            mimeType: 'video/webm;codecs=vp9,opus',
          });
          recordedChunksRef.current = [];
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mr.start(5000); // 5s chunks
          mediaRecorderRef.current = mr;
          streamStartTimeRef.current = Date.now();
          console.log('[CH-LIVE] MediaRecorder started');
        }
      } catch (err) {
        console.warn('[CH-LIVE] MediaRecorder failed to start:', err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id, showLivePanel]);

  // ─── Auto-scroll chat to bottom on new messages ───────────────────
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ─── Attach local stream to host's video element ──────────────────
  useEffect(() => {
    if (localStream && videoRef.current && showLivePanel) {
      videoRef.current.srcObject = localStream;
      videoRef.current.play().catch(() => {});
    }
  }, [localStream, showLivePanel]);

  // ─── Attach remote stream to viewer's video element ───────────────
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = true; // autoplay policy
      remoteVideoRef.current.play().then(() => {
        // Unmute after playback starts (Android WebView requires 2-step)
        try { remoteVideoRef.current!.muted = false; } catch {}
      }).catch(() => {});
    }
  }, [remoteStream]);

  // ─── Viewer: open panel → join stream ─────────────────────────────
  useEffect(() => {
    if (showLivePanel && stream && stream.host_id !== currentUser?.id) {
      joinStreamAsViewer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLivePanel, stream?.id]);

  // ─── Cleanup on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      // Stop all local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(tr => tr.stop());
      }
      // Close all host peer connections
      peerConnectionsRef.current.forEach(pc => {
        try { pc.close(); } catch {}
      });
      peerConnectionsRef.current.clear();
      // Close viewer peer connection
      if (viewerPeerConnectionRef.current) {
        try { viewerPeerConnectionRef.current.close(); } catch {}
        viewerPeerConnectionRef.current = null;
      }
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
    };
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────
  const handleStartStream = async () => {
    setStarting(true);
    try {
      let mediaStream: MediaStream | null = null;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
      } catch {
        toast.error('تعذّر الوصول للكاميرا/الميكروفون');
        setStarting(false); return;
      }
      const title = pendingTitle.trim();
      const newStream = await api.startChannelLive(channelId, title);
      setStream(newStream);
      setLocalStream(mediaStream);
      // 🔧 FIX: update refs immediately so async callbacks (WS handlers,
      // peer-connection creators) see the new stream/host without waiting
      // for the next React render commit.
      streamRef.current = newStream;
      localStreamRef.current = mediaStream;
      setShowLivePanel(true);
      setShowStartModal(false);
      setPendingTitle('');
      lastGiftIdRef.current = null;
      // 🔧 FIX: attach the video element IMMEDIATELY (no setTimeout). The
      // 100ms setTimeout was a workaround for a race with React's commit
      // phase, but the useEffect on [localStream, showLivePanel] already
      // handles re-attachment on the next render. Setting srcObject here
      // ensures the host sees their camera instantly.
      if (videoRef.current && mediaStream) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      toast.success('بدأ البث! 🎥');
    } catch (err: any) {
      toast.error(err.message || 'فشل بدء البث');
    } finally {
      setStarting(false);
    }
  };

  // ─── End stream flow ──────────────────────────────────────────────
  // Step 1: host clicks "إنهاء البث" → open a confirmation modal asking
  //         "هل تريد تخزين الفيديو؟" (yes/no). The modal lets the host
  //         decide whether to keep the recording.
  const requestEndStream = () => {
    // If there's no active recording, skip the modal and end immediately.
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      performEndStream(false);
      return;
    }
    setShowEndConfirmModal(true);
  };

  // Step 2: actually end the stream. If `saveRecording` is true, the
  // recording blob is uploaded IN THE BACKGROUND (non-blocking) via the
  // BackgroundUploadBadge singleton — the host can navigate away
  // immediately and the upload continues.
  const performEndStream = async (saveRecording: boolean) => {
    setShowEndConfirmModal(false);
    setEnding(true);

    // Snapshot the recording blob + duration BEFORE we tear down state.
    // We need the blob to start the background upload, but we want to
    // close the panel + end the stream in the DB immediately without
    // waiting for the upload.
    let recordingBlob: Blob | null = null;
    let recordingDuration = 0;
    const streamIdForUpload = stream?.id;
    const channelIdForUpload = channelId;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        recordingBlob = await new Promise<Blob>((resolve) => {
          mediaRecorderRef.current!.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            resolve(blob);
          };
          mediaRecorderRef.current!.stop();
        });
        recordingDuration = Math.floor((Date.now() - streamStartTimeRef.current) / 1000);
      } catch (err) {
        console.warn('[CH-LIVE] MediaRecorder stop failed:', err);
      }
    }
    mediaRecorderRef.current = null;

    // Stop local tracks
    if (localStream) localStream.getTracks().forEach(tr => tr.stop());
    setLocalStream(null);
    localStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    // Close all peer connections (host side)
    peerConnectionsRef.current.forEach(pc => { try { pc.close(); } catch {} });
    peerConnectionsRef.current.clear();

    // Tell WS server to evict all viewers
    if (streamIdForUpload) {
      try { ws.sendChannelLiveEnd(streamIdForUpload); } catch {}
    }

    // End stream in DB IMMEDIATELY (no recording URL — that gets attached
    // later by the background upload when it completes). This is the key
    // change: the host is no longer blocked waiting for the upload.
    try {
      await api.endChannelLive(channelIdForUpload);
    } catch (err: any) {
      console.warn('[CH-LIVE] endChannelLive failed:', err);
    }

    // Reset UI state so the panel closes
    setStream(null);
    streamRef.current = null;
    setShowLivePanel(false);
    setIsMicOn(true); setIsCamOn(true);
    setChatMessages([]); setChatInput('');
    setActivePolls([]); setRecentGifts([]); setFacingMode('user');
    setEnding(false);
    toast.success('تم إنهاء البث');
    if (onStreamEnd) onStreamEnd();

    // Now start the background upload (only if the host said "yes" AND
    // we have a valid blob that's > 5s and < 100MB).
    if (saveRecording && recordingBlob && recordingDuration > 5 && recordingBlob.size < 100 * 1024 * 1024) {
      const filename = `live-${streamIdForUpload || Date.now()}.webm`;
      console.log(`[CH-LIVE] Starting background upload: ${filename} (${(recordingBlob.size / 1024 / 1024).toFixed(1)} MB, ${recordingDuration}s)`);
      startBackgroundVideoUpload({
        blob: recordingBlob,
        filename,
        channelId: channelIdForUpload,
        streamId: streamIdForUpload,
        duration: recordingDuration,
      });
      sonnerToast.info('جاري رفع التسجيل في الخلفية — يمكنك المتابعة', { duration: 4000 });
    } else if (saveRecording && recordingBlob) {
      // Recording too short or too large — discard silently
      console.log(`[CH-LIVE] Recording discarded (duration=${recordingDuration}s, size=${recordingBlob.size})`);
    }

    // Clear the recorded chunks (they're either uploaded or discarded)
    recordedChunksRef.current = [];
  };

  // Legacy handler name kept for the button onClick — now just opens the modal.
  // (kept so we don't have to touch the button JSX)
  const handleEndStream = () => requestEndStream();

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(tr => tr.enabled = !isMicOn);
      setIsMicOn(!isMicOn);
    }
  };
  const toggleCam = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(tr => tr.enabled = !isCamOn);
      setIsCamOn(!isCamOn);
    }
  };

  // Flip camera (front ↔ back) — preserves audio track.
  // 🔧 FIX v4: completely rewritten to fix "back camera doesn't work".
  // Root causes fixed:
  //   1. Old code called getUserMedia for the new camera BEFORE stopping
  //      the old video tracks. On many Android devices you can't have two
  //      cameras active at once → the second getUserMedia silently
  //      returned the SAME front camera, so "back" looked identical to
  //      "front". Now we stop old video tracks FIRST, release them, then
  //      request the new camera.
  //   2. MediaRecorder was bound to the original localStream and never
  //      restarted on camera flip → recording froze. Now we restart the
  //      MediaRecorder on the new stream.
  //   3. The video element's srcObject was set via a setTimeout race with
  //      the useEffect. Now we set it synchronously + rely on the effect
  //      to keep it in sync.
  const toggleCamera = async () => {
    if (!localStream || switchingCamera) return;
    setSwitchingCamera(true);
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    const isBack = newFacing === 'environment';

    // Snapshot the audio tracks BEFORE we touch video — we'll re-attach them.
    const audioTracks = localStream.getAudioTracks();

    // 🔑 STEP 1: Stop OLD video tracks FIRST and remove them from peer
    // connections. This releases the camera so the new getUserMedia can
    // actually acquire a DIFFERENT camera (especially important on Android
    // where the OS only allows one camera active at a time).
    const oldVideoTrack = localStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      // Remove from peer connections (replace with null temporarily)
      peerConnectionsRef.current.forEach(pc => {
        try {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            // Can't replaceTrack(null) — instead just leave the old sender;
            // we'll replaceTrack with the new track once we have it.
          }
        } catch {}
      });
      oldVideoTrack.stop();
    }

    // Small delay to let the OS release the camera resource
    await new Promise(r => setTimeout(r, 200));

    // 🔑 STEP 2: Acquire the NEW camera stream.
    let newVideoStream: MediaStream | null = null;

    // Strategy 1: enumerateDevices + pick by label (most reliable once
    // camera permission is granted)
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      console.log(`[CAM-FLIP] Found ${videoInputs.length} video devices:`,
        videoInputs.map(d => d.label || '(no label)'));

      const target = videoInputs.find(d => {
        const label = (d.label || '').toLowerCase();
        if (isBack) return label.includes('back') || label.includes('rear') || label.includes('environment');
        return label.includes('front') || label.includes('user') || label.includes('face');
      });
      if (target?.deviceId) {
        console.log(`[CAM-FLIP] Found target by label: ${target.label}`);
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: target.deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });
      } else if (videoInputs.length >= 2) {
        // No label match but multiple cameras — pick the OTHER one by index
        const currentIndex = videoInputs.findIndex(d => d.deviceId === oldVideoTrack?.getSettings?.()?.deviceId);
        const otherIndex = currentIndex >= 0 ? (currentIndex === 0 ? 1 : 0) : (isBack ? 1 : 0);
        const otherDevice = videoInputs[Math.min(otherIndex, videoInputs.length - 1)];
        if (otherDevice?.deviceId) {
          console.log(`[CAM-FLIP] Picking other camera by index ${otherIndex}: ${otherDevice.label || '(no label)'}`);
          newVideoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: otherDevice.deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30, max: 30 },
            },
            audio: false,
          });
        }
      }
    } catch (e) {
      console.warn('[CAM-FLIP] Strategy 1 (enumerate) failed:', e);
    }

    // Strategy 2: facingMode exact
    if (!newVideoStream) {
      try {
        console.log(`[CAM-FLIP] Trying facingMode exact: ${newFacing}`);
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { exact: newFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e) {
        console.warn('[CAM-FLIP] Strategy 2 (exact) failed:', e);
      }
    }

    // Strategy 3: facingMode ideal
    if (!newVideoStream) {
      try {
        console.log(`[CAM-FLIP] Trying facingMode ideal: ${newFacing}`);
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: newFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e) {
        console.warn('[CAM-FLIP] Strategy 3 (ideal) failed:', e);
      }
    }

    // Strategy 4: any camera (last resort)
    if (!newVideoStream) {
      try {
        console.log('[CAM-FLIP] Trying fallback: any camera');
        newVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e) {
        console.warn('[CAM-FLIP] Strategy 4 (fallback) failed:', e);
      }
    }

    if (!newVideoStream) {
      // 🔧 FIX: if we failed to get a new camera, RESTART the old video
      // track so the host doesn't end up with a black screen. The old
      // track is already stopped, so we need to re-acquire the original
      // facing mode.
      try {
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode, // original
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {}
      if (!newVideoStream) {
        sonnerToast.error('تعذّر تبديل الكاميرا — قد لا يدعمها هذا الجهاز');
        setSwitchingCamera(false);
        return;
      }
    }

    // 🔑 STEP 3: Combine new video + existing audio into a fresh MediaStream
    const newVideoTrack = newVideoStream.getVideoTracks()[0];
    const combined = new MediaStream([newVideoTrack, ...audioTracks]);
    setLocalStream(combined);
    // 🔧 FIX: update the ref immediately so any async callback that reads
    // localStreamRef.current (e.g. createHostPeerConnection for a viewer
    // joining mid-flip) sees the new stream instead of the stopped one.
    localStreamRef.current = combined;
    setFacingMode(newFacing);
    setIsCamOn(true);

    // 🔑 STEP 4: Re-attach to host's video element IMMEDIATELY (no setTimeout)
    if (videoRef.current) {
      videoRef.current.srcObject = combined;
      videoRef.current.play().catch(() => {});
    }

    // 🔑 STEP 5: Replace the video track in all existing peer connections
    // so viewers see the new camera without re-negotiating.
    if (newVideoTrack) {
      peerConnectionsRef.current.forEach(pc => {
        try {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(err =>
              console.warn('[CAM-FLIP] replaceTrack failed for a peer:', err)
            );
          }
        } catch {}
      });
    }

    // 🔑 STEP 6: Restart MediaRecorder on the new stream so the recording
    // doesn't freeze on the old (stopped) video track.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    try {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        const mr = new MediaRecorder(combined, { mimeType: 'video/webm;codecs=vp9,opus' });
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        mr.start(5000);
        mediaRecorderRef.current = mr;
        console.log('[CAM-FLIP] MediaRecorder restarted on new stream');
      }
    } catch (err) {
      console.warn('[CAM-FLIP] MediaRecorder restart failed:', err);
    }

    sonnerToast.success(newFacing === 'environment' ? 'تم التبديل للكاميرا الخلفية 📷' : 'تم التبديل للكاميرا الأمامية 🤳');
    setSwitchingCamera(false);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    // Optimistic: append locally immediately
    const tempId = `temp-${Date.now()}`;
    setChatMessages(prev => [...prev, {
      id: tempId,
      user_id: currentUser?.id,
      user_name: currentUser?.name || 'أنت',
      user_avatar: currentUser?.avatar || '',
      content,
      created_at: new Date().toISOString(),
    }]);
    try {
      // Persist via REST (for history) + broadcast via WS (for instant delivery)
      await api.sendChannelLiveChat(channelId, content);
      if (stream?.id) ws.sendChannelLiveChat(stream.id, content);
    } catch {
      toast.error('فشل إرسال الرسالة');
    }
  };

  const handleSendGift = async (giftType: string) => {
    setSendingGift(true);
    try {
      const res = await api.sendChannelGift(channelId, giftType);
      toast.success(`تم إرسال ${res.gift?.icon || '🎁'} ${res.gift?.name || ''}! رصيدك: ${res.newBalance} ج.م`);
      // Spawn floating gift immediately for sender
      spawnFloatingGift(res.gift?.icon || '🎁', currentUser?.name || 'أنت');
      // Broadcast to other viewers + host via WS
      if (stream?.id) {
        ws.sendChannelLiveGift(stream.id, {
          icon: res.gift?.icon,
          senderName: currentUser?.name,
        });
      }
      setShowGifts(false);
      // Refresh gifts list
      const refreshed = await api.getChannelLiveGifts(channelId);
      if (refreshed.length > 0) lastGiftIdRef.current = refreshed[0].id;
      setRecentGifts(refreshed);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSendingGift(false);
    }
  };

  const handleCreatePoll = async () => {
    const opts = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || opts.length < 2) {
      toast.error('السؤال وخياران مطلوبان'); return;
    }
    try {
      await api.createLivePoll(channelId, pollQuestion.trim(), opts);
      toast.success('تم إنشاء الاستطلاع');
      setShowPollCreator(false);
      setPollQuestion(''); setPollOptions(['', '']);
      api.getLivePolls(channelId).then(setActivePolls).catch(() => {});
    } catch (err: any) { toast.error(err.message); }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    if (myVotes[pollId]) return;
    try {
      await api.voteLivePoll(pollId, optionId);
      setMyVotes(prev => ({ ...prev, [pollId]: optionId }));
      api.getLivePolls(channelId).then(setActivePolls).catch(() => {});
    } catch {}
  };

  const handleScheduleStream = async () => {
    if (!scheduleTitle.trim() || !scheduleDate || !scheduleTime) {
      toast.error('املأ كل الحقول'); return;
    }
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    try {
      await api.scheduleChannelStream(channelId, { title: scheduleTitle.trim(), scheduledAt });
      toast.success('تم جدولة البث + إرسال إشعار للمشتركين');
      setShowScheduler(false);
      setScheduleTitle(''); setScheduleDate(''); setScheduleTime('');
      api.getScheduledChannelStreams(channelId).then(setScheduledStreams).catch(() => {});
    } catch (err: any) { toast.error(err.message); }
  };

  const handleLoadAnalytics = async () => {
    try {
      const data = await api.getChannelAnalytics(channelId);
      setAnalytics(data); setShowAnalytics(true);
    } catch {}
  };

  if (loading) return null;

  // ─── No stream: admin sees "Go Live" + scheduled + analytics ──────
  if (!stream && !showLivePanel) {
    return (
      <div className="space-y-3" dir={dir}>
        {/* Hero "Go Live" card for admins / "Stay tuned" banner for viewers */}
        <div className={`relative rounded-2xl overflow-hidden border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-orange-500/10 to-amber-500/10" />
          <div className="relative p-5 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-orange-500 mb-2">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {isAdmin ? 'ابدأ البث المباشر الآن' : 'لا يوجد بث مباشر حاليًا'}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {isAdmin ? 'شارك لحظاتك مع متابعيك بجودة عالية HD' : 'عُد لاحقًا أو تابع القناة لتصلك إشعارات البثوث القادمة'}
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowStartModal(true)}
                disabled={starting}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-l from-red-500 to-orange-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-red-500/30 transition-all active:scale-95 disabled:opacity-50"
              >
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                {starting ? 'جاري البدء...' : '🔴 بدء بث مباشر'}
              </button>
            )}
          </div>
        </div>

        {/* Quick actions row (admin) */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowScheduler(true)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all">
              <Calendar className="w-3.5 h-3.5" /> جدولة بث
            </button>
            <button onClick={handleLoadAnalytics}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-purple-500 text-purple-600 dark:text-purple-400 font-bold text-xs hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all">
              <BarChart3 className="w-3.5 h-3.5" /> تحليلات
            </button>
          </div>
        )}

        {scheduledStreams.length > 0 && (
          <div className="space-y-2">
            {scheduledStreams.map(ss => (
              <div key={ss.id} className={`p-3 rounded-xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{ss.title}</p>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {new Date(ss.scheduled_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  {!isAdmin && (
                    <button onClick={() => api.setStreamReminder(ss.id).then(() => toast.success('تم تفعيل التذكير 🔔')).catch(() => {})}
                      className="text-xs px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold">ذكّرني</button>
                  )}
                  {isAdmin && (
                    <button onClick={() => api.cancelScheduledStream(ss.id).then(() => { setScheduledStreams(prev => prev.filter(s => s.id !== ss.id)); toast.success('تم الإلغاء'); }).catch(() => {})}
                      className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white font-bold">إلغاء</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Start stream modal (replaces window.prompt) ─── */}
        <AnimatePresence>
          {showStartModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-3"
              onClick={() => { setShowStartModal(false); setPendingTitle(''); }}
            >
              <motion.div
                initial={{ y: 30, scale: 0.95 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 30, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl p-5"
                style={{ background: darkMode ? '#161B22' : '#FFFFFF' }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                    <Radio className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      بدء بث مباشر
                    </h3>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      اكتب عنوانًا جذابًا لبثك
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  autoFocus
                  value={pendingTitle}
                  onChange={(e) => setPendingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pendingTitle.trim()) handleStartStream();
                  }}
                  placeholder="مثال: بث مباشر — فعاليات اليوم"
                  maxLength={120}
                  className={`w-full px-4 py-3 rounded-xl border outline-none text-sm mb-3 ${darkMode ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'}`}
                />
                <p className={`text-xs mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {pendingTitle.length}/120 حرف
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowStartModal(false); setPendingTitle(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: darkMode ? '#21262D' : '#F0F2F5', color: darkMode ? '#7D8590' : '#667781' }}
                  >
                    إلغاء
                  </button>
                  <button
                    onClick={handleStartStream}
                    disabled={starting || !pendingTitle.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-red-500 to-orange-500 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                    {starting ? 'جاري البدء...' : 'ابدأ البث'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scheduler modal */}
        <AnimatePresence>
          {showScheduler && isAdmin && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-3"
              onClick={() => setShowScheduler(false)}
            >
              <motion.div
                initial={{ y: 30 }}
                animate={{ y: 0 }}
                exit={{ y: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl p-4"
                style={{ background: darkMode ? '#161B22' : '#FFFFFF' }}
              >
                <h3 className={`text-sm font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  📅 جدولة بث
                </h3>
                <input
                  type="text"
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="عنوان البث..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none text-sm mb-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />
                <div className="flex gap-2 mb-2">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'}`}
                  />
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className={`flex-1 px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'}`}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setShowScheduler(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold"
                    style={{ background: darkMode ? '#21262D' : '#F0F2F5', color: darkMode ? '#7D8590' : '#667781' }}>
                    إلغاء
                  </button>
                  <button onClick={handleScheduleStream}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600">
                    جدولة
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Analytics modal */}
        <AnimatePresence>
          {showAnalytics && analytics && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-3"
              onClick={() => setShowAnalytics(false)}
            >
              <motion.div
                initial={{ y: 30 }}
                animate={{ y: 0 }}
                exit={{ y: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-2xl p-4 max-h-[80vh] overflow-y-auto"
                style={{ background: darkMode ? '#161B22' : '#FFFFFF' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    📊 تحليلات القناة
                  </h3>
                  <button onClick={() => setShowAnalytics(false)}>
                    <X className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className={`p-3 rounded-xl text-center ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className="text-xl font-black text-emerald-500">{analytics.totals?.subscribers || 0}</p>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>مشترك</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className="text-xl font-black text-blue-500">{analytics.totals?.streams || 0}</p>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>بث</p>
                  </div>
                  <div className={`p-3 rounded-xl text-center ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <p className="text-xl font-black text-amber-500">{analytics.totals?.gifts_amount || 0}</p>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>ج.م هدايا</p>
                  </div>
                </div>
                {analytics.recentStreams?.length > 0 && (
                  <div className="mb-4">
                    <h4 className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>آخر البثوث</h4>
                    {analytics.recentStreams.map((s: any) => (
                      <div key={s.id} className={`p-2 rounded-lg mb-1 text-xs ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{s.title || 'بث'}</span>
                          <span className={s.status === 'live' ? 'text-red-500' : 'text-gray-400'}>
                            {s.status === 'live' ? '🔴 LIVE' : 'انتهى'}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1" style={{ color: darkMode ? '#7D8590' : '#667781' }}>
                          <span>👁️ {s.viewer_peak || 0}</span>
                          <span>💬 {s.chat_count || 0}</span>
                          <span>🎁 {s.gift_count || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {analytics.topGifters?.length > 0 && (
                  <div>
                    <h4 className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>أكثر المهديين</h4>
                    {analytics.topGifters.map((g: any, i: number) => (
                      <div key={g.sender_id} className={`flex items-center gap-2 p-2 rounded-lg mb-1 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <span className="text-sm font-bold text-amber-500">#{i + 1}</span>
                        <img src={g.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${g.sender_id}`} alt="" className="w-6 h-6 rounded-full" />
                        <span className={`text-xs font-bold flex-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{g.name}</span>
                        <span className="text-xs font-bold text-emerald-500">{g.total_amount} ج.م</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ─── Active stream badge (user hasn't opened panel) ───────────────
  if (stream && !showLivePanel) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => { setShowLivePanel(true); showControls(); }}
        className="w-full flex items-center justify-between gap-2 py-3 px-4 rounded-2xl bg-gradient-to-l from-red-500 to-orange-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-red-500/30 transition-all active:scale-95"
      >
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            مباشر الآن
          </span>
          <span className="hidden sm:inline">انضم للبث</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Eye className="w-4 h-4" />
          <span className="text-xs font-bold">{stream.viewer_count || 0} مشاهد</span>
        </span>
      </motion.button>
    );
  }

  // ─── Full live panel ──────────────────────────────────────────────
  const isHost = stream?.host_id === currentUser?.id;
  const cardBg = darkMode ? '#161B22' : '#FFFFFF';
  const mutedColor = darkMode ? '#7D8590' : '#667781';
  const inputBg = darkMode ? '#21262D' : '#F0F2F5';
  const accent = '#10B981';

  return (
    <div
      className="fixed inset-0 z-[999] bg-black overflow-hidden"
      dir={dir}
      style={{ touchAction: 'manipulation' }}
    >
      {/* ─── Video fills entire screen ─── */}
      <div
        className="absolute inset-0 bg-black"
        onClick={handleVideoTap}
        style={{ cursor: 'pointer' }}
      >
        {isHost && localStream ? (
          // Host: show local camera preview
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          />
        ) : remoteStream ? (
          // Viewer: show remote stream from host (WebRTC)
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          // Viewer: connecting state
          <div className="w-full h-full flex flex-col items-center justify-center text-white">
            <img
              src={stream?.host_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stream?.host_id}`}
              alt=""
              className="w-24 h-24 rounded-full border-4 border-white/20"
            />
            <p className="mt-3 text-lg font-bold">{stream?.host_name}</p>
            <p className="mt-1 text-xs text-white/50">
              {connectionState === 'connecting' && 'جاري الاتصال بالبث...'}
              {connectionState === 'reconnecting' && 'إعادة الاتصال...'}
              {connectionState === 'failed' && 'فشل الاتصال — حاول مرة أخرى'}
              {connectionState === 'idle' && 'بث مباشر'}
            </p>
            {connectionState === 'connecting' && (
              <Loader2 className="w-5 h-5 animate-spin mt-3 text-red-400" />
            )}
            {connectionState === 'failed' && (
              <button
                onClick={() => joinStreamAsViewer()}
                className="mt-3 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold"
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Network quality indicator (top-left, always visible) ─── */}
      <div className="absolute top-16 left-3 z-15 pointer-events-none">
        {isHost ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs">
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="font-bold">{peerConnectionsRef.current.size} متصل</span>
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
            connectionState === 'connected' ? 'bg-black/60 text-emerald-400' :
            connectionState === 'reconnecting' ? 'bg-black/60 text-amber-400' :
            connectionState === 'failed' ? 'bg-red-900/80 text-red-200' :
            'bg-black/60 text-white/70'
          }`}>
            {connectionState === 'connected' && <Wifi className="w-3 h-3" />}
            {connectionState === 'reconnecting' && <Loader2 className="w-3 h-3 animate-spin" />}
            {connectionState === 'failed' && <WifiOff className="w-3 h-3" />}
            {(connectionState === 'idle' || connectionState === 'connecting') && <Signal className="w-3 h-3" />}
            <span>
              {connectionState === 'connected' ? 'مباشر' :
               connectionState === 'reconnecting' ? 'إعادة' :
               connectionState === 'failed' ? 'منقطع' :
               connectionState === 'connecting' ? 'اتصال' : '...'}
            </span>
          </div>
        )}
      </div>

      {/* ─── Top gradient bar: badges + close (auto-hide) ─── */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center gap-2 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-black flex-shrink-0">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              LIVE
            </div>
            <motion.div
              key={stream?.viewer_count || 0}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/60 text-white text-xs font-bold flex-shrink-0"
            >
              <Eye className="w-3.5 h-3.5 text-red-400" />
              {stream?.viewer_count || 0}
            </motion.div>
            {stream?.title && (
              <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-black/40 text-white text-xs truncate">
                {stream.title}
              </div>
            )}
            <button
              onClick={() => {
                if (isHost) handleEndStream();
                else {
                  leaveStreamAsViewer();
                  setShowLivePanel(false);
                  hideControls();
                }
              }}
              title="إغلاق"
              className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Floating gift animations (TikTok-style) ─── */}
      <div className="absolute inset-0 pointer-events-none z-15 overflow-hidden">
        <AnimatePresence>
          {floatingGifts.map((g, i) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 200, x: 0, scale: 0.3 }}
              animate={{
                opacity: [0, 1, 1, 0.9, 0],
                y: [200, 80 - i * 10, -20 - i * 10, -100, -200],
                x: [0, -20, 10, -30, 0],
                scale: [0.3, 1.3, 1, 0.95, 0.7],
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 3, ease: 'easeOut' }}
              className="absolute bottom-20 right-8 flex flex-col items-center"
            >
              <motion.div
                initial={{ opacity: 0.8, scale: 0.5 }}
                animate={{ opacity: [0.8, 0.4, 0], scale: [0.5, 1.2, 1.5] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 0.3 }}
                className="absolute -top-6"
              >
                <Heart className="w-4 h-4 fill-current" style={{ color: g.color }} />
              </motion.div>
              <div
                className="text-5xl drop-shadow-2xl"
                style={{ filter: `drop-shadow(0 0 12px ${g.color})` }}
              >
                {g.icon}
              </div>
              <div
                className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white whitespace-nowrap"
                style={{ background: g.color }}
              >
                {g.senderName}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ─── Recent gifts ticker (top-right, always visible) ─── */}
      {recentGifts.length > 0 && (
        <div className="absolute top-16 right-3 flex flex-col gap-1 max-w-[60%] z-10 pointer-events-none">
          {recentGifts.slice(-3).reverse().map((g) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/60 text-white text-xs"
            >
              <span className="text-lg">{g.gift_icon}</span>
              <span className="font-bold text-amber-400 truncate">{g.sender_name}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── Active polls overlay (top-left, below network indicator) ─── */}
      {activePolls.length > 0 && (
        <div className="absolute top-28 left-3 w-72 max-w-[80%] space-y-2 z-10">
          {activePolls.map((poll: any) => {
            const totalVotes = (poll.options || []).reduce(
              (s: number, o: any) => s + (o.vote_count || 0), 0
            );
            return (
              <div
                key={poll.id}
                className="p-3 rounded-xl bg-black/70 backdrop-blur text-white"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm font-bold mb-2">📊 {poll.question}</p>
                <div className="space-y-1.5">
                  {(poll.options || []).map((opt: any) => {
                    const pct = totalVotes > 0 ? Math.round((opt.vote_count / totalVotes) * 100) : 0;
                    const voted = myVotes[poll.id] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={(e) => { e.stopPropagation(); handleVote(poll.id, opt.id); }}
                        disabled={!!myVotes[poll.id]}
                        className="w-full text-right p-2 rounded-lg border relative overflow-hidden"
                        style={{ borderColor: voted ? '#10B981' : 'rgba(255,255,255,0.2)' }}
                      >
                        {myVotes[poll.id] && (
                          <div className="absolute inset-0 bg-emerald-500/20" style={{ width: pct + '%' }} />
                        )}
                        <div className="relative flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{opt.text}</span>
                          {myVotes[poll.id] && (
                            <span className="text-xs font-bold text-emerald-400">{pct}%</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {isHost && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      api.closeLivePoll(poll.id).then(() => {
                        setActivePolls((prev: any[]) => prev.filter((p) => p.id !== poll.id));
                        toast.success('تم إغلاق الاستطلاع');
                      }).catch(() => {});
                    }}
                    className="mt-2 text-xs text-red-400 font-bold"
                  >
                    إغلاق الاستطلاع
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Bottom controls overlay (auto-hide on tap) ─── */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 inset-x-0 z-20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent">
              {/* Host control bar */}
              {isHost && (
                <div className="flex items-center gap-2 px-3 pt-3 pb-2 flex-wrap justify-center">
                  <button
                    onClick={toggleMic}
                    title="ميكروفون"
                    className={`p-2.5 rounded-xl ${isMicOn ? 'bg-gray-700 text-white' : 'bg-red-500 text-white'}`}
                  >
                    {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleCam}
                    title="كاميرا"
                    className={`p-2.5 rounded-xl ${isCamOn ? 'bg-gray-700 text-white' : 'bg-red-500 text-white'}`}
                  >
                    {isCamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleCamera}
                    disabled={switchingCamera}
                    title="قلب الكاميرا"
                    className="p-2.5 rounded-xl bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50"
                  >
                    {switchingCamera ? <Loader2 className="w-4 h-4 animate-spin" /> : <SwitchCamera className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setShowPollCreator(true)}
                    title="استطلاع جديد"
                    className="p-2.5 rounded-xl bg-purple-600 text-white"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEndStream}
                    disabled={ending}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5" />}
                    إنهاء البث
                  </button>
                </div>
              )}

              {/* Live chat */}
              <div
                ref={chatContainerRef}
                className="px-3 py-2 space-y-1.5 max-h-[30vh] overflow-y-auto"
              >
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-center py-2 text-white/50">
                    لا توجد رسائل بعد — ابدأ المحادثة!
                  </p>
                ) : (
                  <AnimatePresence initial={false}>
                    {chatMessages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-start gap-2"
                      >
                        <img
                          src={msg.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user_id}`}
                          alt=""
                          className="w-6 h-6 rounded-full flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-emerald-400">{msg.user_name}</span>
                          <span className="text-xs ms-1 break-words text-white">{msg.content}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>

              {/* Chat input bar */}
              <div className="flex items-center gap-2 p-3">
                {!isHost && (
                  <button
                    onClick={() => setShowGifts(true)}
                    className="p-2.5 rounded-xl flex-shrink-0 bg-white/15 text-white"
                    title="إرسال هدية"
                  >
                    <Gift className="w-4 h-4 text-emerald-400" />
                  </button>
                )}
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendChat();
                      showControls();
                    }
                  }}
                  onFocus={() => {
                    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
                  }}
                  placeholder="اكتب تعليقًا..."
                  className="flex-1 px-4 py-2.5 rounded-xl border outline-none text-sm min-w-0 bg-white/10 border-white/20 text-white placeholder-white/40"
                />
                <button
                  onClick={() => { handleSendChat(); showControls(); }}
                  className="p-2.5 rounded-xl text-white flex-shrink-0 bg-emerald-600"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tap hint (shows briefly when controls hidden) ─── */}
      <AnimatePresence>
        {!controlsVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <div className="px-4 py-2 rounded-full bg-black/50 text-white text-xs font-bold">
              اضغط على الشاشة لإظهار التحكم
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Gifts modal ─── */}
      <AnimatePresence>
        {showGifts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/80 flex items-end sm:items-center justify-center p-3"
            onClick={() => setShowGifts(false)}
          >
            <motion.div
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              exit={{ y: 50 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-4"
              style={{ background: cardBg }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  🎁 إرسال هدية
                </h3>
                <button onClick={() => setShowGifts(false)}>
                  <X className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {giftCatalog.map((g) => (
                  <button
                    key={g.type}
                    disabled={sendingGift}
                    onClick={() => handleSendGift(g.type)}
                    className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-emerald-500' : 'bg-gray-50 border-gray-200 hover:border-emerald-500'}`}
                  >
                    <div className="text-3xl mb-1">{g.icon}</div>
                    <div className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{g.name}</div>
                    <div className="text-xs text-emerald-500 font-bold">{g.price} ج.م</div>
                  </button>
                ))}
              </div>
              {sendingGift && (
                <div className="flex justify-center mt-3">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Poll creator modal (host only) ─── */}
      <AnimatePresence>
        {showPollCreator && isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3"
            onClick={() => setShowPollCreator(false)}
          >
            <motion.div
              initial={{ y: 30 }}
              animate={{ y: 0 }}
              exit={{ y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-4"
              style={{ background: cardBg }}
            >
              <h3 className={`text-sm font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                📊 استطلاع جديد
              </h3>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="السؤال..."
                className={`w-full px-3 py-2 rounded-xl border outline-none text-sm mb-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
              />
              {pollOptions.map((opt, i) => (
                <input
                  key={i}
                  type="text"
                  value={opt}
                  onChange={(e) =>
                    setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  placeholder={`خيار ${i + 1}`}
                  className={`w-full px-3 py-2 rounded-xl border outline-none text-sm mb-2 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />
              ))}
              {pollOptions.length < 6 && (
                <button
                  onClick={() => setPollOptions((prev) => [...prev, ''])}
                  className="text-xs text-emerald-500 font-bold mb-2"
                >
                  + إضافة خيار
                </button>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setShowPollCreator(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold"
                  style={{ background: inputBg, color: mutedColor }}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCreatePoll}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: accent }}
                >
                  إنشاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── End stream confirmation modal (host only) ─── */}
      {/* Asks "هل تريد تخزين الفيديو؟" before ending. Either way the stream
          ends immediately; if "yes", the recording uploads in the background
          and a floating badge shows progress while the host can navigate
          away and continue using the app. */}
      <AnimatePresence>
        {showEndConfirmModal && isHost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center p-3"
            onClick={() => setShowEndConfirmModal(false)}
          >
            <motion.div
              initial={{ y: 30, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 30, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-5"
              style={{ background: cardBg }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    إنهاء البث
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    سيتم إنهاء البث فوراً
                  </p>
                </div>
              </div>

              <p className={`text-sm mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                هل تريد تخزين تسجيل البث لمشاهدته لاحقاً؟
              </p>

              <div className={`rounded-xl p-3 mb-4 text-xs ${darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                ✓ سيتم رفع التسجيل في الخلفية ويمكنك المتابعة باستخدام التطبيق.
                ستجد الفيديو في منشورات القناة بعد اكتمال الرفع.
              </div>

              <div className="space-y-2">
                {/* Yes — save + upload in background */}
                <button
                  onClick={() => performEndStream(true)}
                  disabled={ending}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  نعم، خزّن الفيديو
                </button>

                {/* No — discard recording */}
                <button
                  onClick={() => performEndStream(false)}
                  disabled={ending}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {ending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  لا، أنهِ بدون تخزين
                </button>

                {/* Cancel — keep streaming */}
                <button
                  onClick={() => setShowEndConfirmModal(false)}
                  disabled={ending}
                  className="w-full py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  style={{ background: inputBg, color: mutedColor }}
                >
                  إلغاء — متابعة البث
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
