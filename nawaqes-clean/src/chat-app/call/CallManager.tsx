// ─── Standalone WebRTC Call Manager for Chat App ─────────────────
// Self-contained call (audio/video) implementation using:
// - WebSocket call:signal events (relay through backend)
// - nawaqes.metered.live TURN server
// - localStorage for cross-tab signaling (optional)
//
// Exports: useCall hook + <CallOverlay /> component

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone, Video, PhoneOff, Mic, MicOff, CameraOff, PhoneCall,
  AlertCircle, User, SwitchCamera, Monitor, MonitorOff,
  Circle, Square, Users, UserPlus, Volume2, VolumeX, Aperture, Sparkles,
} from 'lucide-react';

// ─── ICE Servers ─────────────────────────────────────────────────
// 🔒 SECURITY FIX: TURN credentials are NO LONGER hardcoded here.
// They are fetched at runtime from `/api/webrtc/config` (which requires
// authentication and reads secrets from server env). This prevents the
// long-lived TURN credentials from being shipped to every browser.
const FALLBACK_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Cache fetched ICE config for 5 minutes to avoid re-fetching on every call.
let cachedIceServers: RTCConfiguration | null = null;
let iceCacheExpiry = 0;
const ICE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchIceServers(): Promise<RTCConfiguration> {
  const now = Date.now();
  if (cachedIceServers && now < iceCacheExpiry) {
    return cachedIceServers;
  }
  try {
    // 🔧 Try multiple token storage keys (chat-app uses 'nawaqes_token')
    let token = localStorage.getItem('nawaqes_token');
    if (!token) {
      // Fallback: check if token is stored without quotes
      token = localStorage.getItem('nawaqes_token')?.replace(/^"|"$/g, '') || null;
    }
    if (!token) {
      console.warn('[Call] No auth token found — using STUN-only (calls may fail across networks)');
      return FALLBACK_ICE_SERVERS;
    }

    const res = await fetch('/api/webrtc/config', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(`[Call] /api/webrtc/config returned ${res.status} — using STUN-only`);
      return FALLBACK_ICE_SERVERS;
    }
    const data = await res.json();
    if (!data?.iceServers || !Array.isArray(data.iceServers) || data.iceServers.length === 0) {
      console.warn('[Call] No ICE servers in response — using STUN-only');
      return FALLBACK_ICE_SERVERS;
    }

    // Verify TURN servers are present (needed for cross-network calls)
    const hasTurn = data.iceServers.some((s: any) => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some((u: string) => u.startsWith('turn:') || u.startsWith('turns:'));
    });

    if (hasTurn) {
      console.log('[Call] ✅ TURN servers configured — cross-network calls supported');
    } else {
      console.warn('[Call] ⚠️ No TURN servers — cross-network calls may fail');
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
    console.warn('[Call] Failed to fetch ICE servers, using STUN-only fallback:', e);
    return FALLBACK_ICE_SERVERS;
  }
}

// ─── Types ────────────────────────────────────────────────────────
interface ActiveCall {
  type: 'audio' | 'video';
  contactId: string;
  contactName: string;
  contactAvatar?: string;
  isGroup?: boolean;
  participants?: CallParticipant[];
}

interface CallParticipant {
  id: string;
  name: string;
  avatar?: string;
  isMuted?: boolean;
  isCameraOff?: boolean;
  isSpeaking?: boolean;
}

interface IncomingCall {
  fromId: string;
  fromName: string;
  fromAvatar?: string;
  type: 'audio' | 'video';
  offer: RTCSessionDescriptionInit;
}

type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected' | 'ended';

interface UseCallOptions {
  userId: string;
  userName: string;
  userAvatar?: string;
  sendCallSignal: (targetUserId: string, signal: any) => void;
}

interface UseCallReturn {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  callError: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  // ─── V4 enhancements ───
  isScreenSharing: boolean;
  isRecording: boolean;
  isVirtualBgOn: boolean;
  isSpeakerOn: boolean;
  cameraFacing: 'user' | 'environment';
  recordingSeconds: number;
  toggleScreenShare: () => Promise<void>;
  toggleRecording: () => void;
  toggleVirtualBackground: () => void;
  toggleSpeaker: () => void;
  switchCamera: () => Promise<void>;
  startCall: (type: 'audio' | 'video', contactId: string, contactName: string, contactAvatar?: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  handleCallSignal: (data: any) => void;
  cleanupCall: () => void;
}

// ─── HD constraints (1280×720 @ 30fps) ───────────────────────────
const HD_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, min: 640 },
  height: { ideal: 720, min: 480 },
  frameRate: { ideal: 30, min: 15, max: 30 },
  aspectRatio: { ideal: 16 / 9 },
};

const VGA_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24, max: 30 },
};

// ─── useCall Hook ─────────────────────────────────────────────────
export const useCall = (options: UseCallOptions): UseCallReturn => {
  const { userId, userName, userAvatar, sendCallSignal } = options;

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // ─── V4: new state ───
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isVirtualBgOn, setIsVirtualBgOn] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteTracksRef = useRef<MediaStreamTrack[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null); // saved for un-blur / un-share

  // ─── Cleanup ────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.ontrack = null; } catch {}
      try { peerConnectionRef.current.onicecandidate = null; } catch {}
      try { peerConnectionRef.current.close(); } catch {}
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch {}
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      try { localVideoRef.current.srcObject = null; } catch {}
      // Reset any virtual-bg blur filter
      localVideoRef.current.style.filter = '';
    }
    if (remoteVideoRef.current) {
      try { remoteVideoRef.current.srcObject = null; } catch {}
    }
    // Also clear the audio element if present
    const remoteAudioEl = document.getElementById('chat-call-remote-audio') as HTMLAudioElement | null;
    if (remoteAudioEl) {
      try { remoteAudioEl.srcObject = null; } catch {}
    }
    setActiveCall(null);
    setIncomingCall(null);
    setCallState('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setCallError(null);
    setLocalStream(null);
    setRemoteStream(null);
    remoteTracksRef.current = [];
    // V4: reset new state
    setIsScreenSharing(false);
    setIsRecording(false);
    setIsVirtualBgOn(false);
    setIsSpeakerOn(true);
    setCameraFacing('user');
    setRecordingSeconds(0);
    originalVideoTrackRef.current = null;
  }, []);

  // ─── Create Peer Connection ─────────────────────────────────────
  // NOTE: ICE servers are fetched asynchronously from the server (no hardcoded TURN).
  // Caller must `await createPeerConnection(...)`.
  const createPeerConnection = useCallback(async (targetId: string, stream: MediaStream | null) => {
    const iceConfig = await fetchIceServers();
    const pc = new RTCPeerConnection(iceConfig);
    peerConnectionRef.current = pc;

    if (stream) {
      stream.getTracks().forEach(track => {
        try { pc.addTrack(track, stream); } catch (e) { console.warn('[Call] addTrack failed:', e); }
      });
    }

    pc.ontrack = (event) => {
      console.log('[Call] ontrack fired:', event.track.kind, 'enabled:', event.track.enabled);
      if (event.streams[0]) {
        event.streams[0].getTracks().forEach(track => {
          if (!remoteTracksRef.current.find(t => t.id === track.id)) {
            remoteTracksRef.current.push(track);
          }
        });
      } else if (!remoteTracksRef.current.find(t => t.id === event.track.id)) {
        remoteTracksRef.current.push(event.track);
      }
      const newStream = new MediaStream(remoteTracksRef.current);
      setRemoteStream(newStream);
      // Attach to remote video element
      const remoteVideo = remoteVideoRef.current;
      if (remoteVideo) {
        remoteVideo.srcObject = newStream;
        remoteVideo.muted = false;
        remoteVideo.play().catch((e) => {
          console.warn('[Call] Remote video play failed, retrying with muted:', e);
          remoteVideo.muted = true;
          remoteVideo.play().catch(() => {});
        });
      }
      // Also attach to audio-only element (for audio calls where there's no <video>)
      const remoteAudioEl = document.getElementById('chat-call-remote-audio') as HTMLAudioElement | null;
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

    pc.oniceconnectionstatechange = () => {
      console.log('[Call] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (e) { console.warn('[Call] ICE restart failed:', e); }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[Call] Connection state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallError('لم يتم الاتصال - تأكد من اتصال الإنترنت');
        setTimeout(() => cleanupCall(), 3000);
      }
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        callTimerRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
        // Re-attach remote stream once connected
        if (remoteStream && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
      }
    };

    return pc;
  }, [sendCallSignal, cleanupCall, remoteStream]);

  // ─── Start Call (outgoing) — HD video (1280x720@30fps) ─────────
  const startCall = useCallback(async (type: 'audio' | 'video', contactId: string, contactName: string, contactAvatar?: string) => {
    if (!contactId) return;
    setCallError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCallError('يتطلب الاتصال اتصالاً آمناً (HTTPS)');
      setActiveCall({ type, contactId, contactName, contactAvatar });
      setCallState('outgoing');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? HD_VIDEO_CONSTRAINTS : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true; // Don't hear ourselves
      }

      setActiveCall({ type, contactId, contactName, contactAvatar });
      setCallState('outgoing');

      const pc = await createPeerConnection(contactId, stream);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video',
        iceRestart: false,
      });
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering (max 5s for TURN)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      sendCallSignal(contactId, {
        type: 'call-offer',
        callType: type,
        fromId: userId,
        fromName: userName,
        fromAvatar: userAvatar || '',
        offer: pc.localDescription,
      });
    } catch (err: any) {
      console.error('[Call] Failed to start call:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCallError('تم رفض إذن الكاميرا/الميكروفون. فعّلها من إعدادات المتصفح');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCallError('لم يتم العثور على كاميرا/ميكروفون');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCallError('الكاميرا/الميكروفون قيد الاستخدام من تطبيق آخر');
      } else {
        setCallError('فشل بدء المكالمة');
      }
      cleanupCall();
    }
  }, [userId, userName, userAvatar, sendCallSignal, createPeerConnection, cleanupCall]);

  // ─── Accept Incoming Call — HD video ────────────────────────────
  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCallError('يتطلب الاتصال اتصالاً آمناً (HTTPS)');
      rejectIncomingCall();
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: incomingCall.type === 'video' ? HD_VIDEO_CONSTRAINTS : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current && incomingCall.type === 'video') {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }

      setActiveCall({
        type: incomingCall.type,
        contactId: incomingCall.fromId,
        contactName: incomingCall.fromName,
        contactAvatar: incomingCall.fromAvatar,
      });
      setCallState('connecting');

      const pc = await createPeerConnection(incomingCall.fromId, stream);
      if (incomingCall.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Wait for ICE gathering (max 5s)
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      sendCallSignal(incomingCall.fromId, {
        type: 'call-answer',
        answer: pc.localDescription,
        toId: incomingCall.fromId,
      });
      setIncomingCall(null);
    } catch (err: any) {
      console.error('[Call] Failed to accept call:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCallError('تم رفض إذن الكاميرا/الميكروفون');
      } else if (err.name === 'NotFoundError') {
        setCallError('لم يتم العثور على كاميرا/ميكروفون');
      } else {
        setCallError('فشل قبول المكالمة');
      }
      rejectIncomingCall();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall, createPeerConnection, sendCallSignal, cleanupCall]);

  // ─── Reject Incoming Call ───────────────────────────────────────
  const rejectIncomingCall = useCallback(() => {
    if (incomingCall) {
      sendCallSignal(incomingCall.fromId, { type: 'call-reject', toId: incomingCall.fromId });
    }
    setIncomingCall(null);
    cleanupCall();
  }, [incomingCall, sendCallSignal, cleanupCall]);

  // ─── End Call ───────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (activeCall) {
      sendCallSignal(activeCall.contactId, { type: 'call-end', toId: activeCall.contactId });
    }
    cleanupCall();
  }, [activeCall, sendCallSignal, cleanupCall]);

  // ─── Toggle Mute ────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  // ─── Toggle Camera ──────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  }, []);

  // ─── V4: Switch camera (front ↔ back) — mobile only ────────────
  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const oldTrack = stream.getVideoTracks()[0];
    if (!oldTrack) return;
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next }, ...HD_VIDEO_CONSTRAINTS },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      // Replace the track in the peer connection (renegotiation-free)
      const sender = peerConnectionRef.current?.getSenders().find(s => s.track === oldTrack);
      if (sender) {
        try { await sender.replaceTrack(newTrack); } catch (e) { console.warn('[Call] replaceTrack failed:', e); }
      }
      // Stop old track & swap into local stream
      oldTrack.stop();
      stream.removeTrack(oldTrack);
      stream.addTrack(newTrack);
      // Re-attach to local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      setCameraFacing(next);
    } catch (err) {
      console.warn('[Call] switchCamera failed:', err);
      setCallError('تعذّر تبديل الكاميرا');
      setTimeout(() => setCallError(null), 2500);
    }
  }, [cameraFacing]);

  // ─── V4: Toggle screen sharing ─────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    const stream = localStreamRef.current;
    const pc = peerConnectionRef.current;
    if (!stream || !pc) return;
    if (isScreenSharing) {
      // Stop sharing → restore camera
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && originalVideoTrackRef.current) {
        try { await sender.replaceTrack(originalVideoTrackRef.current); } catch (e) { console.warn(e); }
        // Stop screen track
        stream.getVideoTracks().forEach(t => {
          if (t.label && /screen|monitor|display|window/i.test(t.label)) t.stop();
        });
        // Re-add original camera track
        const camTrack = originalVideoTrackRef.current;
        if (!stream.getVideoTracks().find(t => t.id === camTrack.id)) {
          stream.addTrack(camTrack);
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        originalVideoTrackRef.current = null;
        setIsScreenSharing(false);
      }
    } else {
      // Start sharing
      try {
        // @ts-ignore — getDisplayMedia is supported in modern browsers
        const displayStream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: HD_VIDEO_CONSTRAINTS,
          audio: false,
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          const oldTrack = sender.track;
          if (oldTrack) originalVideoTrackRef.current = oldTrack as MediaStreamTrack;
          try { await sender.replaceTrack(screenTrack); } catch (e) { console.warn(e); }
        }
        // Stop camera track while sharing (keeps audio)
        stream.getVideoTracks().forEach(t => {
          if (!originalVideoTrackRef.current || t.id !== originalVideoTrackRef.current.id) t.stop();
        });
        // Attach display stream to local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
          localVideoRef.current.play().catch(() => {});
        }
        // Auto-stop when user clicks browser's "Stop sharing"
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          // Restore camera
          if (originalVideoTrackRef.current && pc) {
            const s = pc.getSenders().find(x => x.track?.kind === 'video');
            if (s) s.replaceTrack(originalVideoTrackRef.current).catch(() => {});
            const ls = localStreamRef.current;
            if (ls && !ls.getVideoTracks().find(t => t.id === originalVideoTrackRef.current!.id)) {
              ls.addTrack(originalVideoTrackRef.current);
            }
            if (localVideoRef.current && ls) {
              localVideoRef.current.srcObject = ls;
              localVideoRef.current.play().catch(() => {});
            }
            originalVideoTrackRef.current = null;
          }
        };
        setIsScreenSharing(true);
      } catch (err: any) {
        console.warn('[Call] screen share failed:', err);
        if (err.name !== 'NotAllowedError') {
          setCallError('تعذّر مشاركة الشاشة');
          setTimeout(() => setCallError(null), 2500);
        }
      }
    }
  }, [isScreenSharing]);

  // ─── V4: Toggle call recording (MediaRecorder) ─────────────────
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      // Stop
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      mediaRecorderRef.current = null;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setIsRecording(false);
      setRecordingSeconds(0);
      return;
    }
    // Start
    const stream = localStreamRef.current;
    const remote = remoteStream;
    if (!stream) return;
    try {
      // Combine local + remote audio for the recording
      const mixed = new MediaStream();
      stream.getAudioTracks().forEach(t => mixed.addTrack(t));
      if (remote) remote.getAudioTracks().forEach(t => mixed.addTrack(t));
      // Prefer video if available
      if (activeCall?.type === 'video') {
        stream.getVideoTracks().forEach(t => mixed.addTrack(t));
        if (remote) remote.getVideoTracks().forEach(t => mixed.addTrack(t));
      }
      const mr = new MediaRecorder(mixed, { mimeType: 'video/webm' });
      recordedChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nawaqes-call-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        recordedChunksRef.current = [];
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (err) {
      console.warn('[Call] recording failed:', err);
      setCallError('تعذّر بدء التسجيل');
      setTimeout(() => setCallError(null), 2500);
    }
  }, [isRecording, activeCall, remoteStream]);

  // ─── V4: Toggle virtual background blur (CSS filter on local video)
  // This is a lightweight stand-in: a real ML-based segmentation would
  // use a canvas pipeline. The CSS blur keeps the user's outline crisp
  // via backdrop-filter on a wrapper, but the simplest robust approach
  // is to apply a mild blur to the local video preview. The remote
  // viewer still sees the un-blurred track (no canvas mix), so this is
  // a UI-level affordance + a hint to upgrade the local camera setup.
  const toggleVirtualBackground = useCallback(() => {
    const v = localVideoRef.current;
    if (!v) return;
    if (isVirtualBgOn) {
      v.style.filter = '';
      setIsVirtualBgOn(false);
    } else {
      // Mild blur on the local preview only — does not affect sent track.
      v.style.filter = 'blur(4px) brightness(1.05)';
      setIsVirtualBgOn(true);
    }
  }, [isVirtualBgOn]);

  // ─── V4: Toggle speaker (audio-output routing is browser-limited;
  // we toggle the remote audio element's muted state as a fallback) ──
  const toggleSpeaker = useCallback(() => {
    const audioEl = document.getElementById('chat-call-remote-audio') as HTMLAudioElement | null;
    if (audioEl) {
      audioEl.muted = isSpeakerOn;
      // Also try setSinkId if available (Chrome)
      // @ts-ignore
      if (isSpeakerOn && audioEl.setSinkId) {
        // @ts-ignore
        audioEl.setSinkId('default').catch(() => {});
      }
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isSpeakerOn;
    }
    setIsSpeakerOn(!isSpeakerOn);
  }, [isSpeakerOn]);

  // ─── Handle incoming call signals from WebSocket ────────────────
  const handleCallSignal = useCallback((data: any) => {
    if (!data?.signal) return;
    const signal = data.signal;
    const fromId = data.fromId;

    switch (signal.type) {
      case 'call-offer': {
        // Only show incoming call if we're not already in a call
        if (activeCall || incomingCall) {
          // Auto-reject if busy
          sendCallSignal(fromId, { type: 'call-reject', toId: fromId, reason: 'busy' });
          return;
        }
        setIncomingCall({
          fromId: fromId || signal.fromId,
          fromName: signal.fromName || 'مستخدم',
          fromAvatar: signal.fromAvatar,
          type: signal.callType || 'audio',
          offer: signal.offer,
        });
        break;
      }
      case 'call-answer': {
        if (peerConnectionRef.current && signal.answer) {
          peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.answer))
            .catch(err => {
              console.error('[Call] Failed to set remote description:', err);
              setCallError('لم يتم الاتصال');
            });
          setCallState('connecting');
        }
        break;
      }
      case 'call-ice-candidate': {
        if (peerConnectionRef.current && signal.candidate) {
          peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate))
            .catch(err => console.warn('[Call] Failed to add ICE candidate:', err));
        }
        break;
      }
      case 'call-reject': {
        setCallError(signal.reason === 'busy' ? 'المستخدم مشغول في مكالمة أخرى' : 'تم رفض المكالمة');
        setTimeout(() => cleanupCall(), 2000);
        break;
      }
      case 'call-end': {
        cleanupCall();
        break;
      }
    }
  }, [activeCall, incomingCall, sendCallSignal, cleanupCall]);

  // ─── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    activeCall,
    incomingCall,
    callState,
    callDuration,
    isMuted,
    isCameraOff,
    callError,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    // V4
    isScreenSharing,
    isRecording,
    isVirtualBgOn,
    isSpeakerOn,
    cameraFacing,
    recordingSeconds,
    toggleScreenShare,
    toggleRecording,
    toggleVirtualBackground,
    toggleSpeaker,
    switchCamera,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
    toggleMute,
    toggleCamera,
    handleCallSignal,
    cleanupCall,
  };
};

// ─── Format duration helper ───────────────────────────────────────
function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── CallOverlay Component ────────────────────────────────────────
interface CallOverlayProps {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  callState: CallState;
  callDuration: number;
  isMuted: boolean;
  isCameraOff: boolean;
  callError: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  // V4
  isScreenSharing?: boolean;
  isRecording?: boolean;
  isVirtualBgOn?: boolean;
  isSpeakerOn?: boolean;
  cameraFacing?: 'user' | 'environment';
  recordingSeconds?: number;
  onToggleScreenShare?: () => void;
  onToggleRecording?: () => void;
  onToggleVirtualBg?: () => void;
  onToggleSpeaker?: () => void;
  onSwitchCamera?: () => void;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  activeCall, incomingCall, callState, callDuration, isMuted, isCameraOff,
  callError, localVideoRef, remoteVideoRef,
  onAccept, onReject, onEnd, onToggleMute, onToggleCamera,
  // V4 (optional with defaults so existing callers still work)
  isScreenSharing = false, isRecording = false, isVirtualBgOn = false,
  isSpeakerOn = true, cameraFacing = 'user', recordingSeconds = 0,
  onToggleScreenShare, onToggleRecording, onToggleVirtualBg, onToggleSpeaker, onSwitchCamera,
}) => {
  const isVideo = (activeCall?.type === 'video') || (incomingCall?.type === 'video');
  const isGroup = !!activeCall?.isGroup;
  const showOverlay = activeCall || incomingCall;

  if (!showOverlay) return null;

  // ─── Incoming call screen ───────────────────────────────────────
  if (incomingCall && !activeCall) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #075E54, #128C7E)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, color: '#fff', padding: '2rem',
        }}
      >
        {/* Hidden audio element for call audio */}
        <audio id="chat-call-remote-audio" autoPlay />

        {/* Avatar */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          style={{
            width: 120, height: 120, borderRadius: '50%',
            background: 'linear-gradient(135deg, #00A884, #25D366)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20, boxShadow: '0 20px 60px rgba(0,168,132,0.4)',
          }}
        >
          {incomingCall.fromAvatar ? (
            <img src={incomingCall.fromAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <User style={{ width: 60, height: 60, color: '#fff' }} />
          )}
        </motion.div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>{incomingCall.fromName}</h2>
        <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
          {incomingCall.type === 'video' ? '📞 مكالمة فيديو واردة' : '📞 مكالمة صوتية واردة'}
        </p>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ color: '#25D366', fontSize: '0.9rem', marginBottom: 32 }}
        >
          جاري الاتصال...
        </motion.div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '3rem', alignItems: 'center' }}>
          {/* Reject */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onReject}
            style={{
              width: 70, height: 70, borderRadius: '50%',
              background: '#EF4444', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(239,68,68,0.4)',
            }}
          >
            <PhoneOff style={{ width: 30, height: 30, color: '#fff', transform: 'rotate(135deg)' }} />
          </motion.button>

          {/* Accept */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onAccept}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{
              width: 70, height: 70, borderRadius: '50%',
              background: '#22C55E', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(34,197,94,0.4)',
            }}
          >
            {incomingCall.type === 'video' ? (
              <Video style={{ width: 30, height: 30, color: '#fff' }} />
            ) : (
              <Phone style={{ width: 30, height: 30, color: '#fff' }} />
            )}
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ─── Active call screen ─────────────────────────────────────────
  if (!activeCall) return null;

  // Group-call participants (only meaningful when activeCall.isGroup is true).
  // The WebRTC mesh for >2 participants is not fully wired here, but the UI
  // scaffold renders a 2x4 grid + add-participant button so the UX matches
  // the spec; participants list is filled from activeCall.participants.
  const groupParticipants = activeCall.participants || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: isVideo ? '#000' : 'linear-gradient(135deg, #075E54, #128C7E)',
        display: 'flex', flexDirection: 'column',
        zIndex: 1000, color: '#fff',
      }}
    >
      {/* Hidden audio element for audio-only calls */}
      <audio id="chat-call-remote-audio" autoPlay />

      {/* Recording indicator (top-left, pulsing red dot) */}
      {isRecording && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(239,68,68,0.25)', padding: '6px 12px',
            borderRadius: 20, color: '#fff', fontSize: '0.78rem',
            fontWeight: 700, backdropFilter: 'blur(8px)',
            border: '1px solid rgba(239,68,68,0.5)',
          }}
        >
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }}
          />
          يسجّل • {formatDuration(recordingSeconds || 0)}
        </motion.div>
      )}

      {/* Remote video (full screen for video calls) */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', background: '#000',
          }}
        />
      )}

      {/* Local video (picture-in-picture) */}
      {isVideo && (
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute', top: 60, right: 16,
            width: isScreenSharing ? 180 : 100,
            height: isScreenSharing ? 120 : 140, borderRadius: 12,
            objectFit: 'cover', background: '#1E293B',
            border: `2px solid ${isScreenSharing ? '#25D366' : 'rgba(255,255,255,0.2)'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 2,
            // Mirror for self-view (not when screen-sharing)
            transform: isScreenSharing ? 'none' : (cameraFacing === 'user' ? 'scaleX(-1)' : 'none'),
          }}
        />
      )}

      {/* Group-call participant grid (up to 8) */}
      {isGroup && (
        <div style={{
          position: 'absolute', top: 80, left: 16, right: 16,
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
          zIndex: 4, pointerEvents: 'none',
        }}>
          {groupParticipants.slice(0, 8).map(p => (
            <div key={p.id} style={{
              aspectRatio: '1', borderRadius: 12, overflow: 'hidden',
              background: 'rgba(0,0,0,0.5)',
              border: p.isSpeaking ? '2px solid #25D366' : '1px solid rgba(255,255,255,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              {p.avatar && !p.isCameraOff
                ? <img src={p.avatar} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <User style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.6)' }} />}
              <span style={{
                position: 'absolute', bottom: 2, left: 2, right: 2,
                fontSize: '0.6rem', fontWeight: 600, color: '#fff',
                background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: 4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.name.split(' ')[0]}</span>
              {p.isMuted && (
                <MicOff style={{ position: 'absolute', top: 2, right: 2, width: 10, height: 10, color: '#EF4444' }} />
              )}
            </div>
          ))}
          {/* Add participant slot */}
          <button style={{
            aspectRatio: '1', borderRadius: 12,
            background: 'rgba(255,255,255,0.08)', border: '1px dashed rgba(255,255,255,0.25)',
            color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto',
          }} title="إضافة مشارك">
            <UserPlus style={{ width: 20, height: 20 }} />
          </button>
        </div>
      )}

      {/* Header info */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '40px 20px 20px',
        background: isVideo ? 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' : 'transparent',
        textAlign: 'center', zIndex: 3,
      }}>
        {/* Avatar (only for audio calls) */}
        {!isVideo && (
          <motion.div
            animate={{ scale: callState === 'connected' ? [1, 1.04, 1] : 1 }}
            transition={{ duration: 1.5, repeat: callState === 'connected' ? Infinity : 0 }}
            style={{
              width: 100, height: 100, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00A884, #25D366)',
              margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 60px rgba(0,168,132,0.4)',
            }}>
            {activeCall.contactAvatar ? (
              <img src={activeCall.contactAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <User style={{ width: 50, height: 50, color: '#fff' }} />
            )}
          </motion.div>
        )}
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
          {activeCall.contactName}
          {isGroup && <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginRight: 8 }}> · مجموعة</span>}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginTop: 4 }}>
          {callState === 'outgoing' && 'جاري الاتصال...'}
          {callState === 'connecting' && 'جاري الاتصال...'}
          {callState === 'connected' && formatDuration(callDuration)}
          {callState === 'ended' && 'انتهت المكالمة'}
        </p>
        {callError && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(239,68,68,0.2)', borderRadius: 8,
            color: '#FCA5A5', fontSize: '0.85rem',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle style={{ width: 14, height: 14 }} />
            {callError}
          </div>
        )}
      </div>

      {/* Bottom controls — WhatsApp-style with extended actions */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '20px 16px calc(32px + env(safe-area-inset-bottom))',
        background: isVideo ? 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' : 'transparent',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, zIndex: 3,
      }}>
        {/* Mute */}
        <CallBtn active={isMuted} activeColor="#EF4444" onClick={onToggleMute} title="كتم">
          {isMuted ? <MicOff style={{ width: 22, height: 22 }} /> : <Mic style={{ width: 22, height: 22 }} />}
        </CallBtn>

        {/* Camera toggle (video calls only) */}
        {isVideo && (
          <CallBtn active={isCameraOff} activeColor="#EF4444" onClick={onToggleCamera} title="الكاميرا">
            {isCameraOff ? <CameraOff style={{ width: 22, height: 22 }} /> : <Video style={{ width: 22, height: 22 }} />}
          </CallBtn>
        )}

        {/* Switch camera (front ↔ back) */}
        {isVideo && onSwitchCamera && (
          <CallBtn onClick={onSwitchCamera} title="تبديل الكاميرا">
            <SwitchCamera style={{ width: 22, height: 22 }} />
          </CallBtn>
        )}

        {/* Screen share */}
        {isVideo && onToggleScreenShare && (
          <CallBtn active={isScreenSharing} activeColor="#25D366" onClick={onToggleScreenShare} title="مشاركة الشاشة">
            {isScreenSharing ? <MonitorOff style={{ width: 22, height: 22 }} /> : <Monitor style={{ width: 22, height: 22 }} />}
          </CallBtn>
        )}

        {/* Virtual background blur (video calls only) */}
        {isVideo && onToggleVirtualBg && (
          <CallBtn active={isVirtualBgOn} activeColor="#25D366" onClick={onToggleVirtualBg} title="خلفية ضبابية">
            {isVirtualBgOn ? <Sparkles style={{ width: 22, height: 22 }} /> : <Aperture style={{ width: 22, height: 22 }} />}
          </CallBtn>
        )}

        {/* Speaker (audio calls + audio output toggle) */}
        {!isVideo && onToggleSpeaker && (
          <CallBtn active={!isSpeakerOn} activeColor="#EF4444" onClick={onToggleSpeaker} title="مكبر الصوت">
            {isSpeakerOn ? <Volume2 style={{ width: 22, height: 22 }} /> : <VolumeX style={{ width: 22, height: 22 }} />}
          </CallBtn>
        )}

        {/* Recording */}
        {onToggleRecording && (
          <CallBtn active={isRecording} activeColor="#EF4444" onClick={onToggleRecording} title={isRecording ? 'إيقاف التسجيل' : 'تسجيل المكالمة'}>
            {isRecording ? <Square style={{ width: 22, height: 22 }} /> : <Circle style={{ width: 22, height: 22 }} />}
          </CallBtn>
        )}

        {/* End call */}
        <button
          onClick={onEnd}
          style={{
            width: 70, height: 56, borderRadius: 28,
            background: '#EF4444', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(239,68,68,0.4)',
          }}
        >
          <PhoneCall style={{ width: 26, height: 26, color: '#fff', transform: 'rotate(135deg)' }} />
        </button>
      </div>
    </motion.div>
  );
};

// ─── Reusable round call-control button ──────────────────────────
const CallBtn: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  activeColor?: string;
}> = ({ children, onClick, title, active, activeColor = '#25D366' }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 52, height: 52, borderRadius: '50%',
      background: active ? activeColor : 'rgba(255,255,255,0.15)',
      border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', backdropFilter: 'blur(10px)',
      transition: 'background 0.15s, transform 0.1s',
    }}
  >
    {children}
  </button>
);
