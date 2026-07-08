// ─── Live Stream Page - Real Video Broadcasting with WebRTC + WebSocket Chat ─
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Video, VideoOff, Mic, MicOff, Radio, Eye, MessageCircle,
  Settings, RotateCcw, PhoneOff, Send, Link2, X, Check,
  Clock, Users, ChevronDown, AlertCircle, Megaphone, ArrowRight,
  Loader2, UserCircle
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';

// ─── ICE Servers for WebRTC ────────────────────────────────────────
// 🔒 SECURITY FIX: TURN credentials are NO LONGER hardcoded. They are
// fetched at runtime from the authenticated `/api/webrtc/config` endpoint
// and cached for 5 minutes. Falls back to STUN-only if the fetch fails.
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
    const token = localStorage.getItem('nawaqes_token');
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
  } catch (e) {
    console.warn('[LiveStream] Failed to fetch ICE servers, using STUN-only fallback:', e);
    return FALLBACK_ICE_SERVERS;
  }
}

// ─── Quality Options ──────────────────────────────────────────────
const qualityOptions = [
  { id: '360p', label: '360p', width: 640, height: 360 },
  { id: '480p', label: '480p', width: 854, height: 480 },
  { id: '720p', label: '720p', width: 1280, height: 720 },
];

// ─── Chat message type ────────────────────────────────────────────
interface LiveChatMsg {
  id: string;
  user: string;
  avatar: string;
  text: string;
  time: Date;
  isSelf?: boolean;
}

// ─── LiveStreamPage Component ─────────────────────────────────────
export const LiveStreamPage: React.FC = () => {
  const { darkMode, posts } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hostId } = useParams<{ hostId?: string }>();

  // Determine mode: broadcaster (no hostId or hostId === me) or viewer
  const isViewer = !!(hostId && hostId !== currentUser?.id);
  const effectiveHostId = isViewer ? hostId! : (currentUser?.id || '');

  // ─── Broadcaster State ──────────────────────────────────────────
  const [isLive, setIsLive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isFacingFront, setIsFacingFront] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState('720p');
  const [showSettings, setShowSettings] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);
  const [duration, setDuration] = useState(0);
  const [linkedAdId, setLinkedAdId] = useState<string | null>(null);
  const [showAdLinker, setShowAdLinker] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);

  // ─── Viewer State ───────────────────────────────────────────────
  const [viewerStream, setViewerStream] = useState<MediaStream | null>(null);
  const [viewerConnecting, setViewerConnecting] = useState(false);
  const [hostInfo, setHostInfo] = useState<{ name: string; avatar: string } | null>(null);

  // ─── Shared State ───────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<LiveChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');

  // ─── Refs ───────────────────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // WebRTC peer connections: Map<viewerId, RTCPeerConnection> (broadcaster) or single connection (viewer)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // Stream ID = host user ID
  const streamId = effectiveHostId;

  // ─── WebSocket for livestream events ────────────────────────────
  const {
    sendLivestreamStart,
    sendLivestreamEnd,
    sendLivestreamChat,
    sendLivestreamJoin,
    sendLivestreamLeave,
    sendLivestreamSignal,
  } = useWebSocket({
    autoConnect: true,
    onLivestreamChat: (data: any) => {
      const msg: LiveChatMsg = {
        id: `msg_${Date.now()}_${Math.random()}`,
        user: data.userName || 'مستخدم',
        avatar: data.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.userId}`,
        text: data.text,
        time: new Date(data.time || Date.now()),
        isSelf: data.userId === currentUser?.id,
      };
      setChatMessages(prev => [...prev, msg]);
    },
    onLivestreamViewerJoined: (data: any) => {
      setViewerCount(prev => prev + 1);
      console.log('[Livestream] Viewer joined:', data.viewerId);
      // CRITICAL: When a viewer joins, the broadcaster MUST create a peer connection
      // and send an offer so the viewer can receive the stream
      if (!isViewer && data.viewerId) {
        // Use setTimeout to ensure state is settled before creating PC
        setTimeout(() => {
          createBroadcasterPeerConnection(data.viewerId);
        }, 100);
      }
    },
    onLivestreamViewerLeft: (data: any) => {
      setViewerCount(prev => Math.max(0, prev - 1));
      console.log('[Livestream] Viewer left:', data.viewerId);
      // Clean up peer connection for the viewer who left
      if (!isViewer && data.viewerId) {
        const pc = peerConnectionsRef.current.get(data.viewerId);
        if (pc) {
          try {
            pc.getSenders().forEach(sender => {
              try { sender.track?.stop(); } catch {}
            });
            pc.close();
          } catch (err) {
            console.warn('[Livestream] Error closing peer connection for leaving viewer:', err);
          }
          peerConnectionsRef.current.delete(data.viewerId);
        }
      }
    },
    onLivestreamStarted: (data: any) => {
      console.log('[Livestream] Stream started by:', data.hostId, data.hostName);
    },
    onLivestreamEnded: (data: any) => {
      console.log('[Livestream] Stream ended:', data.hostId);
      // If we're a viewer of this stream, leave
      if (isViewer && data.hostId === hostId) {
        toast.info(t('livestream.streamEnded', 'انتهى البث المباشر'));
        setViewerStream(null);
        if (viewerPeerConnectionRef.current) {
          try { viewerPeerConnectionRef.current.close(); } catch {}
          viewerPeerConnectionRef.current = null;
        }
        setTimeout(() => navigate('/'), 1500);
      }
    },
    // Broadcaster: receive viewer's WebRTC answer
    onLivestreamSignal: (data: any) => {
      handleIncomingSignal(data);
    },
  });

  // ─── Handle incoming WebRTC signals ─────────────────────────────
  const handleIncomingSignal = useCallback(async (data: any) => {
    const { fromId, signal } = data;
    if (!signal) return;

    // Strip non-WebRTC fields from signal (e.g., targetViewer)
    const cleanSignal = { ...signal };
    delete cleanSignal.targetViewer;

    try {
      if (cleanSignal.type === 'answer' && !isViewer) {
        // Broadcaster receives answer from a viewer
        const pc = peerConnectionsRef.current.get(fromId);
        if (!pc) {
          console.warn('[Livestream] No peer connection for viewer:', fromId);
          return;
        }
        // Only set remote description if in correct state
        if (pc.signalingState === 'have-local-offer' || pc.signalingState === 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(cleanSignal));
            console.log('[Livestream] Remote description set for viewer:', fromId);
          } catch (err) {
            console.warn('[Livestream] setRemoteDescription failed (answer):', err);
          }
        } else {
          console.warn(`[Livestream] Cannot set answer in state: ${pc.signalingState}`);
        }
      } else if (cleanSignal.type === 'offer' && isViewer) {
        // Viewer receives offer from broadcaster
        if (!viewerPeerConnectionRef.current) {
          console.warn('[Livestream] No viewer peer connection');
          return;
        }
        const pc = viewerPeerConnectionRef.current;
        // Only set remote description if not already set or in correct state
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(cleanSignal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Wait for ICE gathering (with timeout)
            await new Promise<void>((resolve) => {
              if (pc.iceGatheringState === 'complete') { resolve(); return; }
              const timeout = setTimeout(resolve, 2000);
              pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
              };
            });

            // Send answer back to broadcaster (streamId = hostId for viewer)
            sendLivestreamSignal(streamId, pc.localDescription);
            console.log('[Livestream] Answer sent to broadcaster');
          } catch (err) {
            console.error('[Livestream] Offer handling failed:', err);
          }
        } else {
          console.warn(`[Livestream] Cannot set offer in state: ${pc.signalingState}`);
        }
      } else if (cleanSignal.candidate) {
        // ICE candidate
        try {
          if (isViewer && viewerPeerConnectionRef.current) {
            await viewerPeerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cleanSignal.candidate));
          } else if (!isViewer) {
            const pc = peerConnectionsRef.current.get(fromId);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(cleanSignal.candidate));
          }
        } catch (err) {
          // ICE candidate errors are common and usually safe to ignore
          console.debug('[Livestream] ICE candidate error (often safe):', err);
        }
      }
    } catch (err) {
      console.error('[Livestream] Signal error:', err);
    }
  }, [isViewer, streamId, sendLivestreamSignal]);

  // ─── Broadcaster: Create peer connection for a new viewer ───────
  const createBroadcasterPeerConnection = useCallback(async (viewerUserId: string) => {
    if (!streamRef.current) {
      console.warn('[Livestream] Cannot create peer connection: no local stream');
      return;
    }

    // If a peer connection already exists for this viewer, skip (avoid duplicates)
    if (peerConnectionsRef.current.has(viewerUserId)) {
      console.log('[Livestream] Peer connection already exists for viewer:', viewerUserId);
      return;
    }

    console.log('[Livestream] Creating peer connection for viewer:', viewerUserId);
    const iceConfig = await fetchIceServers();
    const pc = new RTCPeerConnection(iceConfig);
    peerConnectionsRef.current.set(viewerUserId, pc);

    // Add local tracks
    streamRef.current.getTracks().forEach(track => {
      try {
        pc.addTrack(track, streamRef.current!);
      } catch (err) {
        console.warn('[Livestream] Failed to add track:', err);
      }
    });

    // ICE candidates → send to specific viewer via signal
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendLivestreamSignal(streamId, { candidate: event.candidate, targetViewer: viewerUserId });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Livestream] Peer connection ${viewerUserId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        const existed = peerConnectionsRef.current.delete(viewerUserId);
        if (existed) {
          try { pc.close(); } catch {}
          console.log('[Livestream] Cleaned up peer connection for viewer:', viewerUserId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Livestream] ICE ${viewerUserId} state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch {}
      }
    };

    // Create and send offer
    (async () => {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering (with timeout)
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') { resolve(); return; }
          const timeout = setTimeout(resolve, 2000);
          pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
          };
        });

        // Include targetViewer in the offer so the signal goes to the right viewer
        const offerWithTarget = {
          ...pc.localDescription?.toJSON(),
          targetViewer: viewerUserId,
        };
        sendLivestreamSignal(streamId, offerWithTarget);
        console.log('[Livestream] Offer sent to viewer:', viewerUserId);
      } catch (err) {
        console.error('[Livestream] Offer creation error:', err);
        // Clean up on error
        peerConnectionsRef.current.delete(viewerUserId);
        try { pc.close(); } catch {}
      }
    })();
  }, [streamId, sendLivestreamSignal]);

  // ─── Viewer: Join stream and create WebRTC connection ───────────
  const joinStream = useCallback(async () => {
    if (!hostId) return;
    setViewerConnecting(true);

    try {
      // Close any existing peer connection first
      if (viewerPeerConnectionRef.current) {
        try { viewerPeerConnectionRef.current.close(); } catch {}
        viewerPeerConnectionRef.current = null;
      }

      // Get host info from API
      try {
        const activeStreams = await api.getActiveLivestreams();
        const hostStream = activeStreams.find((s: any) => s.hostId === hostId);
        if (hostStream) {
          setHostInfo({ name: hostStream.hostName, avatar: hostStream.hostAvatar });
        } else {
          console.warn('[Livestream] Host not in active streams, but proceeding');
        }
      } catch (err) {
        console.warn('[Livestream] Failed to fetch active streams:', err);
      }

      // Create WebRTC peer connection as viewer
      const iceConfig = await fetchIceServers();
      const pc = new RTCPeerConnection(iceConfig);
      viewerPeerConnectionRef.current = pc;

      // Collect remote tracks
      const remoteTracks: MediaStreamTrack[] = [];
      pc.ontrack = (event) => {
        console.log('[Livestream] Remote track received:', event.track.kind);
        if (event.streams[0]) {
          event.streams[0].getTracks().forEach(track => {
            if (!remoteTracks.find(t => t.id === track.id)) remoteTracks.push(track);
          });
        } else {
          if (!remoteTracks.find(t => t.id === event.track.id)) remoteTracks.push(event.track);
        }
        const newStream = new MediaStream(remoteTracks);
        setViewerStream(newStream);
      };

      // ICE candidates → send to broadcaster via signal (streamId = hostId)
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendLivestreamSignal(hostId, { candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[Livestream] Viewer peer connection state:', pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          setViewerStream(null);
          if (pc.connectionState === 'failed') {
            toast.error(t('livestream.connectionLost', 'انقطع الاتصال بالبث'));
          }
        } else if (pc.connectionState === 'connected') {
          toast.success(t('livestream.connected', 'تم الاتصال بالبث!'));
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[Livestream] Viewer ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          try { pc.restartIce(); } catch {}
        }
      };

      // Notify the broadcaster that we joined
      // streamId passed here is hostId (the broadcaster's userId)
      sendLivestreamJoin(hostId);
      console.log('[Livestream] Joined stream of host:', hostId);

      // The broadcaster will create an offer and send it via signal
      // We handle the offer in handleIncomingSignal
      // Set a timeout — if no offer received in 15s, show error
      setTimeout(() => {
        if (!viewerPeerConnectionRef.current || viewerPeerConnectionRef.current.remoteDescription === null) {
          console.warn('[Livestream] No offer received from broadcaster after 15s');
          toast.error(t('livestream.hostUnreachable', 'تعذّر الاتصال بالمذيع. قد يكون البث قد انتهى.'));
          setViewerConnecting(false);
        }
      }, 15000);

      setViewerConnecting(false);
    } catch (err) {
      console.error('[Livestream] Join error:', err);
      toast.error(t('livestream.joinError', 'فشل الانضمام للبث'));
      setViewerConnecting(false);
    }
  }, [hostId, sendLivestreamSignal, sendLivestreamJoin, t]);

  // ─── Viewer: Leave stream ───────────────────────────────────────
  const leaveStream = useCallback(() => {
    // Notify broadcaster that we're leaving
    if (hostId) {
      try { sendLivestreamLeave(hostId); } catch {}
    }
    // Close peer connection safely
    if (viewerPeerConnectionRef.current) {
      try {
        viewerPeerConnectionRef.current.getReceivers().forEach(receiver => {
          try { receiver.track?.stop(); } catch {}
        });
        viewerPeerConnectionRef.current.close();
      } catch (err) {
        console.warn('[Livestream] Error closing viewer peer connection:', err);
      }
      viewerPeerConnectionRef.current = null;
    }
    setViewerStream(null);
    navigate('/');
  }, [hostId, sendLivestreamLeave, navigate]);

  // ─── Attach remote stream to video element (viewer) ─────────────
  useEffect(() => {
    if (viewerStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = viewerStream;
      // Start muted (autoplay policy), then unmute once playing
      remoteVideoRef.current.muted = true;
      remoteVideoRef.current.play().then(() => {
        // Unmute after playback starts (Android WebView requires this 2-step approach)
        try { remoteVideoRef.current!.muted = false; } catch {}
      }).catch((e) => {
        console.warn('[Livestream] Remote video play failed:', e);
      });
    }
  }, [viewerStream]);

  // ─── Auto-join as viewer when hostId is set ─────────────────────
  useEffect(() => {
    if (isViewer && hostId) {
      joinStream();
    }
    // Cleanup on unmount or when hostId changes
    return () => {
      if (viewerPeerConnectionRef.current) {
        try {
          viewerPeerConnectionRef.current.close();
        } catch {}
        viewerPeerConnectionRef.current = null;
      }
      if (hostId) {
        try { sendLivestreamLeave(hostId); } catch {}
      }
    };
  }, [isViewer, hostId, joinStream, sendLivestreamLeave]);

  // ─── Start Camera (Broadcaster) ─────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error(t('livestream.cameraError') + ' - ' + (t('messages.callSecureContextRequired', 'يتطلب اتصالاً آمناً (HTTPS)')));
        return null;
      }

      try {
        const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (micPerm.state === 'denied') {
          toast.error(t('livestream.cameraError') + ' - ' + (t('messages.permissionAudioTitle', 'السماح بالوصول للميكروفون من إعدادات المتصفح')));
          return null;
        }
        const camPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (camPerm.state === 'denied') {
          toast.error(t('livestream.cameraError') + ' - ' + (t('messages.permissionVideoTitle', 'السماح بالوصول للكاميرا من إعدادات المتصفح')));
          return null;
        }
      } catch {}

      const quality = qualityOptions.find(q => q.id === selectedQuality) || qualityOptions[2];
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: isFacingFront ? 'user' : 'environment',
          width: { ideal: quality.width },
          height: { ideal: quality.height },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getAudioTracks().forEach(track => { track.enabled = isMicOn; });
      return stream;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error(t('livestream.cameraError') + ' - ' + (t('messages.permissionStep1', 'انقر على أيقونة القفل في شريط العنوان للسماح بالوصول')));
      } else if (err.name === 'NotFoundError') {
        toast.error(t('livestream.cameraError') + ' - لا يوجد كاميرا/ميكروفون متاح');
      } else if (err.name === 'NotReadableError') {
        toast.error(t('livestream.cameraError') + ' - الكاميرا/الميكروفون قيد الاستخدام');
      } else {
        toast.error(t('livestream.cameraError'));
      }
      return null;
    }
  }, [isFacingFront, selectedQuality, isMicOn, t]);

  // ─── Stop Camera (Broadcaster) ──────────────────────────────────
  const stopCamera = useCallback(() => {
    // Stop all local tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    // Close all peer connections safely
    peerConnectionsRef.current.forEach((pc, viewerId) => {
      try {
        pc.getSenders().forEach(sender => {
          try { sender.track?.stop(); } catch {}
        });
        pc.close();
      } catch (err) {
        console.warn('[Livestream] Error closing peer connection for', viewerId, err);
      }
    });
    peerConnectionsRef.current.clear();
  }, []);

  // ─── Start Broadcast ────────────────────────────────────────────
  const startBroadcast = async () => {
    const stream = await startCamera();
    if (!stream) return;

    setIsLive(true);
    setDuration(0);
    setViewerCount(0);
    setPeakViewers(0);
    setShowSummary(false);
    setChatMessages([]);

    // Notify server about livestream start
    sendLivestreamStart({
      streamId,
      title: '', // could be enhanced to ask user for a title
      userName: currentUser?.name || '',
      userAvatar: currentUser?.avatar || '',
    });

    // Notify friends about the livestream (non-blocking, ignore errors)
    try {
      api.notifyFriendsLivestream(currentUser?.name || 'بث مباشر').catch((err) => {
        console.warn('[Livestream] Failed to notify friends:', err);
      });
    } catch (err) {
      console.warn('[Livestream] notifyFriendsLivestream call failed:', err);
    }

    toast.success(t('livestream.started'));
  };

  // ─── End Broadcast ──────────────────────────────────────────────
  const endBroadcast = () => { setShowEndConfirm(true); };

  const confirmEndBroadcast = () => {
    setIsLive(false);
    stopCamera();
    setShowEndConfirm(false);
    setShowSummary(true);
    // Notify server and viewers that the stream ended
    try {
      sendLivestreamEnd(streamId);
    } catch (err) {
      console.warn('[Livestream] Failed to send end signal:', err);
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  // ─── Toggle Mic ─────────────────────────────────────────────────
  const toggleMic = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => { track.enabled = !isMicOn; });
    }
    setIsMicOn(prev => !prev);
  };

  // ─── Toggle Camera ──────────────────────────────────────────────
  const toggleCamera = async () => {
    if (isCamOn) {
      // Stop video tracks only (keep audio)
      if (streamRef.current) {
        streamRef.current.getVideoTracks().forEach(track => {
          track.stop();
        });
      }
      setIsCamOn(false);
    } else {
      // Re-acquire only video track (preserve existing audio if any)
      try {
        const quality = qualityOptions.find(q => q.id === selectedQuality) || qualityOptions[2];
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: isFacingFront ? 'user' : 'environment',
            width: { ideal: quality.width },
            height: { ideal: quality.height },
          },
          audio: false, // Don't reacquire audio
        });

        if (streamRef.current) {
          // Add new video tracks to existing stream
          newVideoStream.getVideoTracks().forEach(newTrack => {
            streamRef.current!.addTrack(newTrack);
            // Update existing peer connections
            peerConnectionsRef.current.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
              if (sender) {
                sender.replaceTrack(newTrack).catch(() => {});
              } else {
                pc.addTrack(newTrack, streamRef.current!);
              }
            });
          });
        } else {
          streamRef.current = newVideoStream;
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }
        setIsCamOn(true);
      } catch (err: any) {
        console.error('[Livestream] Failed to toggle camera:', err);
        if (err.name === 'NotAllowedError') {
          toast.error(t('livestream.cameraError') + ' - السماح بالوصول للكاميرا من المتصفح');
        } else {
          toast.error(t('livestream.cameraError'));
        }
      }
    }
  };

  // ─── Flip Camera ────────────────────────────────────────────────
  const flipCamera = async () => {
    setIsFacingFront(prev => !prev);
    if (isLive || streamRef.current) {
      const stream = await startCamera();
      if (stream) setIsCamOn(true);
    }
  };

  // ─── Duration Timer ─────────────────────────────────────────────
  useEffect(() => {
    if (isLive) {
      durationTimerRef.current = setInterval(() => { setDuration(prev => prev + 1); }, 1000);
    }
    return () => { if (durationTimerRef.current) clearInterval(durationTimerRef.current); };
  }, [isLive]);

  useEffect(() => { if (viewerCount > peakViewers) setPeakViewers(viewerCount); }, [viewerCount, peakViewers]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ─── Send Chat Message ──────────────────────────────────────────
  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    const msg: LiveChatMsg = {
      id: `msg_${Date.now()}_self`,
      user: currentUser?.name || t('livestream.you'),
      avatar: currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=self`,
      text: chatInput.trim(),
      time: new Date(),
      isSelf: true,
    };
    setChatMessages(prev => [...prev, msg]);
    sendLivestreamChat(streamId, chatInput.trim());
    setChatInput('');
  };

  // ─── Format Duration ────────────────────────────────────────────
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const myAds = posts.filter(p => p.author.id === currentUser?.id && p.type === 'ad');

  // ─── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      console.log('[Livestream] Component unmounting, cleaning up...');
      // Stop camera and tracks
      stopCamera();
      // Clear duration timer
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      // Notify server that stream ended (if we were broadcasting)
      if (isLive) {
        try { sendLivestreamEnd(streamId); } catch {}
      }
      // Close viewer peer connection
      if (viewerPeerConnectionRef.current) {
        try { viewerPeerConnectionRef.current.close(); } catch {}
        viewerPeerConnectionRef.current = null;
      }
      // Notify host that we left (if we were a viewer)
      if (isViewer && hostId) {
        try { sendLivestreamLeave(hostId); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopCamera]);

  const bgMain = darkMode ? 'bg-gray-900' : 'bg-[#f8f9fa]';
  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // ─── Broadcast Summary ──────────────────────────────────────────
  if (showSummary) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${bgMain}`} dir={dir}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`w-full max-w-md rounded-3xl p-6 shadow-xl ${bgCard}`}>
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            <h2 className={`text-2xl font-black ${textPrimary}`}>{t('livestream.ended')}</h2>
            <p className={`text-sm mt-1 ${textMuted}`}>{t('livestream.summaryDesc')}</p>
          </div>
          <div className="space-y-3">
            <div className={`flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2"><Clock className={`w-5 h-5 ${textMuted}`} /><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('livestream.duration')}</span></div>
              <span className={`text-sm font-black ${textPrimary}`}>{formatDuration(duration)}</span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2"><Eye className={`w-5 h-5 ${textMuted}`} /><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('livestream.peakViewers')}</span></div>
              <span className={`text-sm font-black ${textPrimary}`}>{peakViewers}</span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2"><MessageCircle className={`w-5 h-5 ${textMuted}`} /><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('livestream.chatMessages')}</span></div>
              <span className={`text-sm font-black ${textPrimary}`}>{chatMessages.length}</span>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => { setShowSummary(false); setChatMessages([]); setDuration(0); setPeakViewers(0); setViewerCount(0); }} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors active:scale-95">{t('livestream.newBroadcast')}</button>
            <button onClick={() => navigate('/')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors active:scale-95 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>{t('livestream.backToHome')}</button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ─── VIEWER MODE ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  if (isViewer) {
    return (
      <div className={`min-h-screen flex flex-col ${bgMain}`} dir={dir}>
        {/* Top Bar */}
        <div className={`flex items-center justify-between px-3 py-2.5 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <button onClick={leaveStream} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <ArrowRight className="w-4 h-4" />
            </button>
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full">
              <Radio className="w-3 h-3 text-white" />
              <span className="text-white text-[10px] font-black">{t('livestream.live')}</span>
            </motion.div>
            <h1 className={`text-base font-black ${textPrimary}`}>
              {hostInfo?.name || t('livestream.liveStream')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Eye className={`w-3.5 h-3.5 ${textMuted}`} />
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{viewerCount}</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <div className={`relative flex-1 flex items-center justify-center min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-gray-900'}`}>
              {/* Remote video from broadcaster */}
              <video ref={remoteVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${viewerStream ? '' : 'hidden'}`} />

              {/* Connecting state */}
              {viewerConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-orange-500 mx-auto mb-3 animate-spin" />
                    <p className="text-gray-400 font-bold text-sm">{t('livestream.connecting', 'جاري الاتصال بالبث...')}</p>
                  </div>
                </div>
              )}

              {/* No stream yet - show host info */}
              {!viewerStream && !viewerConnecting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center px-6">
                    <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
                      {hostInfo?.avatar ? (
                        <img src={hostInfo.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="w-16 h-16 text-gray-600" />
                      )}
                    </div>
                    <p className="text-gray-400 font-bold text-lg mb-2">{hostInfo?.name || t('livestream.liveStream')}</p>
                    <p className="text-gray-500 text-sm mb-6">{t('livestream.waitingForStream', 'في انتظار بدء البث...')}</p>
                    <button onClick={joinStream} className="px-8 py-3 rounded-2xl bg-orange-500 text-white font-bold text-sm shadow-lg active:scale-95 transition-transform flex items-center gap-2 mx-auto">
                      <Radio className="w-4 h-4" />
                      {t('livestream.joinStream', 'انضم للبث')}
                    </button>
                  </div>
                </div>
              )}

              {/* Live indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  <span className="text-white text-[10px] font-black">{t('livestream.live')}</span>
                </motion.div>
              </div>

              {/* Viewers badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                <Eye className="w-3 h-3 text-white" />
                <span className="text-white text-[10px] font-bold">{viewerCount}</span>
              </div>

              {/* ─── TikTok-style floating chat (mobile only) ─── */}
              {/* Messages float over the video (bottom-left, semi-transparent).
                  Input is a small pill at the bottom — always visible, no open/close. */}
              <div className="lg:hidden absolute bottom-2 left-2 right-2 pointer-events-none">
                {/* Floating messages — last 5 only, stacked upward */}
                <div className="flex flex-col-reverse gap-1 mb-2 max-w-[75%]">
                  {chatMessages.slice(-5).map((msg, idx, arr) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: idx === arr.length - 1 ? 1 : Math.max(0.4, 1 - (arr.length - 1 - idx) * 0.2) }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-black/50 backdrop-blur-sm max-w-full"
                    >
                      <img src={msg.avatar} alt="" className="w-5 h-5 rounded-full shrink-0" loading="lazy" />
                      <span className="text-[10px] font-bold text-orange-400 shrink-0">{msg.user}:</span>
                      <span className="text-[11px] text-white truncate">{msg.text}</span>
                    </motion.div>
                  ))}
                </div>
                {/* Input pill — small, always visible, doesn't block video */}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder={t('livestream.typeMessage')}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                    className="flex-1 px-3 py-2 rounded-full text-xs bg-black/50 backdrop-blur-sm text-white placeholder-gray-400 border border-white/10 focus:outline-none focus:border-orange-400/50"
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim()}
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${chatInput.trim() ? 'bg-orange-500 text-white active:scale-90' : 'bg-black/40 text-gray-500'}`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Viewer controls */}
            <div className={`flex items-center justify-center gap-3 px-4 py-3 border-t ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`} style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <button onClick={leaveStream} className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors active:scale-95 flex items-center gap-2">
                <PhoneOff className="w-4 h-4" />
                {t('livestream.leaveStream', 'مغادرة البث')}
              </button>
            </div>
          </div>

          {/* Chat Panel - same as broadcaster but always visible */}
          <div className={`hidden lg:flex w-80 flex-col border-l ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2"><MessageCircle className={`w-4 h-4 ${textMuted}`} /><span className={`text-sm font-black ${textPrimary}`}>{t('livestream.liveChat')}</span></div>
              <div className="flex items-center gap-1.5"><Users className={`w-3.5 h-3.5 ${textMuted}`} /><span className={`text-xs font-bold ${textMuted}`}>{viewerCount}</span></div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full"><p className={`text-xs ${textMuted}`}>{t('livestream.noMessagesYet')}</p></div>
              ) : chatMessages.map(msg => (
                <div key={msg.id} className="flex items-start gap-2">
                  <img src={msg.avatar} alt={msg.user} className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className={`text-[10px] font-black ${msg.isSelf ? 'text-blue-400' : (darkMode ? 'text-orange-400' : 'text-orange-600')}`}>{msg.user}</span>
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{msg.text}</p>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <input type="text" placeholder={t('livestream.typeMessage')} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }} className={`flex-1 px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-orange-400 ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200'}`} />
                <button onClick={sendChatMessage} disabled={!chatInput.trim()} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${chatInput.trim() ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95' : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}`}><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // ─── BROADCASTER MODE ─────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen flex flex-col ${bgMain}`} dir={dir}>
      {/* Top Bar */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowRight className="w-4 h-4" />
          </button>
          {isLive && (
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }} className="flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded-full">
              <Radio className="w-3 h-3 text-white" />
              <span className="text-white text-[10px] font-black">{t('livestream.live')}</span>
            </motion.div>
          )}
          <h1 className={`text-base font-black ${textPrimary}`}>{t('livestream.liveStream')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <>
              <div className="flex items-center gap-1"><Eye className={`w-3.5 h-3.5 ${textMuted}`} /><span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{viewerCount}</span></div>
              <div className="flex items-center gap-1"><Clock className={`w-3.5 h-3.5 ${textMuted}`} /><span className={`text-xs font-bold tabular-nums ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatDuration(duration)}</span></div>
            </>
          )}
          <button onClick={() => setShowSettings(!showSettings)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}><Settings className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0">
          <div className={`relative flex-1 flex items-center justify-center min-h-0 ${darkMode ? 'bg-gray-950' : 'bg-gray-900'}`}>
            <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${isCamOn ? '' : 'hidden'}`} style={{ transform: isFacingFront ? 'scaleX(-1)' : 'none' }} />

            {!isCamOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center"><VideoOff className="w-16 h-16 text-gray-600 mx-auto mb-3" /><p className="text-gray-500 font-bold text-sm">{t('livestream.cameraOff')}</p></div>
              </div>
            )}

            {!isLive && !streamRef.current && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4"><Video className="w-12 h-12 text-gray-600" /></div>
                  <p className="text-gray-400 font-bold text-lg mb-2">{t('livestream.readyToStream')}</p>
                  <p className="text-gray-500 text-sm mb-6">{t('livestream.readyToStreamDesc')}</p>
                  <button onClick={startBroadcast} className="px-8 py-3.5 rounded-2xl bg-gradient-to-l from-green-500 to-green-600 text-white font-bold text-base shadow-lg shadow-green-500/30 active:scale-95 transition-transform flex items-center gap-2 mx-auto">
                    <Radio className="w-5 h-5" />{t('livestream.liveStream')}
                  </button>
                </div>
              </div>
            )}

            {isLive && (
              <>
                <div className="absolute top-3 right-3 lg:top-4 lg:right-4 flex items-center gap-2">
                  <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" /><span className="text-white text-[10px] font-black">{t('livestream.live')}</span>
                  </motion.div>
                </div>
                <div className="absolute top-3 left-3 lg:top-4 lg:left-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                  <Eye className="w-3 h-3 text-white" /><span className="text-white text-[10px] font-bold">{viewerCount}</span>
                </div>

                {/* ─── TikTok-style floating chat (mobile only) ─── */}
                <div className="lg:hidden absolute bottom-2 left-2 right-2 pointer-events-none z-10">
                  {/* Floating messages — last 5 only */}
                  <div className="flex flex-col-reverse gap-1 mb-2 max-w-[75%]">
                    {chatMessages.slice(-5).map((msg, idx, arr) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: idx === arr.length - 1 ? 1 : Math.max(0.4, 1 - (arr.length - 1 - idx) * 0.2) }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-black/50 backdrop-blur-sm max-w-full"
                      >
                        <img src={msg.avatar} alt="" className="w-5 h-5 rounded-full shrink-0" loading="lazy" />
                        <span className="text-[10px] font-bold text-orange-400 shrink-0">{msg.user}:</span>
                        <span className="text-[11px] text-white truncate">{msg.text}</span>
                      </motion.div>
                    ))}
                  </div>
                  {/* Input pill */}
                  <div className="pointer-events-auto flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder={t('livestream.typeMessage')}
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                      className="flex-1 px-3 py-2 rounded-full text-xs bg-black/50 backdrop-blur-sm text-white placeholder-gray-400 border border-white/10 focus:outline-none focus:border-orange-400/50"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim()}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${chatInput.trim() ? 'bg-orange-500 text-white active:scale-90' : 'bg-black/40 text-gray-500'}`}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {linkedAdId && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-orange-600/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg">
                    <Link2 className="w-3.5 h-3.5 text-white" /><span className="text-white text-[10px] font-bold">{t('livestream.linkedAd')}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls bar */}
          <div className={`flex items-center justify-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 border-t ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`} style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button onClick={toggleMic} className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isMicOn ? (darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300') : 'bg-red-500 text-white hover:bg-red-600'}`}>
              {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button onClick={toggleCamera} className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isCamOn ? (darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300') : 'bg-red-500 text-white hover:bg-red-600'}`}>
              {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            <button onClick={flipCamera} className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => setShowAdLinker(true)} className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${linkedAdId ? 'bg-orange-500 text-white hover:bg-orange-600' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
              <Link2 className="w-5 h-5" />
            </button>
            {isLive ? (
              <button onClick={endBroadcast} className="rounded-full flex items-center justify-center bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg active:scale-90" style={{ width: '3.25rem', height: '3.25rem' }}><PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" /></button>
            ) : (
              <button onClick={startBroadcast} className="rounded-full flex items-center justify-center bg-green-600 text-white hover:bg-green-700 transition-all shadow-lg active:scale-90" style={{ width: '3.25rem', height: '3.25rem' }}><Radio className="w-5 h-5 sm:w-6 sm:h-6" /></button>
            )}
          </div>
        </div>

        {/* Chat Panel - Desktop */}
        {isLive && (
          <>
            <div className={`hidden lg:flex w-80 flex-col border-l ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2"><MessageCircle className={`w-4 h-4 ${textMuted}`} /><span className={`text-sm font-black ${textPrimary}`}>{t('livestream.liveChat')}</span></div>
                <div className="flex items-center gap-1.5"><Users className={`w-3.5 h-3.5 ${textMuted}`} /><span className={`text-xs font-bold ${textMuted}`}>{viewerCount}</span></div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full"><p className={`text-xs ${textMuted}`}>{t('livestream.noMessagesYet')}</p></div>
                ) : chatMessages.map(msg => (
                  <div key={msg.id} className="flex items-start gap-2">
                    <img src={msg.avatar} alt={msg.user} className="w-6 h-6 rounded-full shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className={`text-[10px] font-black ${msg.isSelf ? 'text-blue-400' : (darkMode ? 'text-orange-400' : 'text-orange-600')}`}>{msg.user}</span>
                      <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className={`p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder={t('livestream.typeMessage')} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }} className={`flex-1 px-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-orange-400 ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200'}`} />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim()} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${chatInput.trim() ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95' : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}`}><Send className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed inset-0 z-[250] flex items-end justify-center" onClick={() => setShowSettings(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }} className={`relative w-full max-w-lg rounded-t-3xl p-5 shadow-xl ${bgCard}`} onClick={e => e.stopPropagation()} dir={dir}>
              <div className="flex items-center justify-between mb-5">
                <h3 className={`text-lg font-black ${textPrimary}`}>{t('livestream.settings')}</h3>
                <button onClick={() => setShowSettings(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}><X className="w-4 h-4" /></button>
              </div>
              <div className="mb-4">
                <p className={`text-xs font-black mb-2 ${textMuted}`}>{t('livestream.streamQuality')}</p>
                <div className="flex gap-2">
                  {qualityOptions.map(q => (
                    <button key={q.id} onClick={() => setSelectedQuality(q.id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedQuality === q.id ? 'bg-orange-500 text-white shadow-md' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{q.label}</button>
                  ))}
                </div>
              </div>
              <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2"><Video className={`w-4 h-4 ${textMuted}`} /><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('livestream.camera')}</span></div>
                <p className={`text-xs ${textMuted}`}>{isFacingFront ? t('livestream.frontCamera') : t('livestream.rearCamera')}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End Broadcast Confirmation */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowEndConfirm(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={`w-full max-w-sm rounded-2xl p-5 shadow-xl ${bgCard}`} onClick={e => e.stopPropagation()} dir={dir}>
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3"><AlertCircle className="w-7 h-7 text-red-600" /></div>
                <h3 className={`text-lg font-black ${textPrimary}`}>{t('livestream.endStream')}</h3>
                <p className={`text-sm mt-1 ${textMuted}`}>{t('livestream.endStreamConfirm')}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEndConfirm(false)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>{t('livestream.cancel')}</button>
                <button onClick={confirmEndBroadcast} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm transition-colors active:scale-95">{t('livestream.yesEndStream')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ad Linker Modal */}
      <AnimatePresence>
        {showAdLinker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAdLinker(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={`w-full max-w-sm rounded-2xl p-5 shadow-xl ${bgCard}`} onClick={e => e.stopPropagation()} dir={dir}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-lg font-black ${textPrimary}`}>{t('livestream.linkAd')}</h3>
                <button onClick={() => setShowAdLinker(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}><X className="w-4 h-4" /></button>
              </div>
              {myAds.length === 0 ? (
                <p className={`text-sm ${textMuted}`}>{t('livestream.noAdsToLink')}</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {myAds.map(ad => (
                    <button key={ad.id} onClick={() => { setLinkedAdId(ad.id); setShowAdLinker(false); }} className={`w-full text-start p-3 rounded-xl transition-all ${linkedAdId === ad.id ? 'bg-orange-500 text-white' : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                      <p className="text-sm font-bold truncate">{ad.content?.substring(0, 60)}</p>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
