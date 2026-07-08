// ─── Market Live Stream (REWRITTEN FROM SCRATCH — v2) ───────────────
// Clean TikTok-style live streaming for the market.
//
// Design principles (learned from v1 bugs):
//   1. FIXED LAYOUT — use absolute positioning with explicit z-indexes.
//      No overlapping layers, no "chat appearing inside input" bug.
//   2. SEPARATE ZONES:
//        - Top bar (z-30): back + LIVE + viewers
//        - Right action bar (z-30): like, gift, share (vertical)
//        - Chat zone (z-20): floating comments, bottom-left, ABOVE input
//        - Input bar (z-30): bottom edge, full width
//        - Gift panel (z-40): bottom sheet, slides up OVER everything
//   3. Chat zone has `bottom: 80px` so it NEVER overlaps the input bar.
//   4. All buttons are large (48px+) for mobile touch.
//   5. Camera: no width/height constraints (prevents auto-zoom).
//   6. Pinch-to-zoom disabled globally.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  X, Radio, Heart, Send, Gift, Users, Loader2, Video, ArrowRight,
  SwitchCamera, Mic, MicOff, Share2,
} from 'lucide-react';

const GIFTS = [
  { id: 'heart',   icon: '❤️', name: 'قلب',     amount: 5 },
  { id: 'rose',    icon: '🌹', name: 'وردة',    amount: 10 },
  { id: 'star',    icon: '⭐', name: 'نجمة',    amount: 25 },
  { id: 'coffee',  icon: '☕', name: 'قهوة',    amount: 50 },
  { id: 'fire',    icon: '🔥', name: 'نار',     amount: 100 },
  { id: 'rocket',  icon: '🚀', name: 'صاروخ',  amount: 250 },
  { id: 'crown',   icon: '👑', name: 'تاج',     amount: 500 },
  { id: 'diamond', icon: '💎', name: 'ماس',     amount: 1000 },
];

interface LiveStream {
  id: string; user_id: string; host_name: string; host_avatar: string;
  title: string; viewer_count: number; like_count: number; gift_count: number;
  product_name: string; product_price: number; started_at: string;
}

type FacingMode = 'user' | 'environment';

interface MarketLiveStreamProps {
  onClose?: () => void;
}

export const MarketLiveStream: React.FC<MarketLiveStreamProps> = ({ onClose }) => {
  const { currentUser } = useAuth();

  const [mode, setMode] = useState<'browse' | 'host-setup' | 'host' | 'viewer'>('browse');
  const [activeStreams, setActiveStreams] = useState<LiveStream[]>([]);
  const [currentStream, setCurrentStream] = useState<LiveStream | null>(null);
  const [loading, setLoading] = useState(true);

  // Host state
  const [hostTitle, setHostTitle] = useState('');
  const [hostProduct, setHostProduct] = useState('');
  const [hostPrice, setHostPrice] = useState('');
  const [starting, setStarting] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [streamStartTime, setStreamStartTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [facingMode, setFacingMode] = useState<FacingMode>('user');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Viewer state
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [showGifts, setShowGifts] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const [floatingGifts, setFloatingGifts] = useState<{ id: number; icon: string; name: string; amount: number; sender: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ─── Load active streams ───────────────────────────────────────────
  const loadActiveStreams = useCallback(async () => {
    try {
      setLoading(true);
      const streams = await api.getActiveMarketLiveStreams();
      setActiveStreams(streams || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (mode === 'browse') loadActiveStreams(); }, [mode, loadActiveStreams]);

  // ─── Host timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'host' && streamStartTime) {
      const interval = setInterval(() => {
        const e = Math.floor((Date.now() - streamStartTime) / 1000);
        setElapsedTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [mode, streamStartTime]);

  // ─── Attach stream to <video> AFTER mode changes (React render cycle) ─
  useEffect(() => {
    if ((mode === 'host' || mode === 'host-setup') && (localStream || previewStream) && videoRef.current) {
      const v = videoRef.current;
      const stream = localStream || previewStream;
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      (v as any).setAttribute('webkit-playsinline', 'true');
      v.play().catch(() => {});
    }
  }, [mode, localStream, previewStream]);

  // ─── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      [localStreamRef.current, previewStream].forEach(s => s?.getTracks().forEach(t => t.stop()));
    };
  }, [previewStream]);

  // ─── Camera helper (no width/height → no auto-zoom) ────────────────
  const acquireStream = async (facing: FacingMode, withMic: boolean): Promise<MediaStream> => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MEDIA_API_UNAVAILABLE');
    const constraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: facing } },
      audio: withMic ? { echoCancellation: true, noiseSuppression: true } : false,
    };
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError')
        throw new Error('تم رفض إذن الكاميرا. يرجى السماح بالوصول من الإعدادات.');
      if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError')
        throw new Error('لا توجد كاميرا متاحة.');
      if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError')
        throw new Error('الكاميرا مستخدمة بواسطة تطبيق آخر.');
      if (err?.name === 'OverconstrainedError')
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: withMic });
      throw new Error(err?.message || 'فشل الوصول للكاميرا.');
    }
  };

  // ─── Preview camera (host-setup) ───────────────────────────────────
  const startPreview = useCallback(async (facing: FacingMode) => {
    setCameraError(null);
    if (previewStream) previewStream.getTracks().forEach(t => t.stop());
    try {
      const stream = await acquireStream(facing, false);
      setPreviewStream(stream);
      setFacingMode(facing);
    } catch (err: any) {
      setCameraError(err.message || 'فشل فتح الكاميرا');
    }
  }, [previewStream]);

  // ─── Start hosting ─────────────────────────────────────────────────
  const handleStartStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { toast.error('البث يتطلب HTTPS وإذن الكاميرا'); return; }
    setStarting(true); setCameraError(null);
    try {
      if (previewStream) { previewStream.getTracks().forEach(t => t.stop()); setPreviewStream(null); }
      const mediaStream = await acquireStream(facingMode, micEnabled);
      localStreamRef.current = mediaStream;
      setLocalStream(mediaStream);
      const stream = await api.startMarketLiveStream({
        title: hostTitle.trim(), productName: hostProduct.trim(),
        productPrice: parseFloat(hostPrice) || 0,
      });
      setCurrentStream(stream);
      setMode('host');
      setStreamStartTime(Date.now());
      toast.success('بدأ البث! 🎥');
    } catch (err: any) {
      toast.error(err.message || 'فشل بدء البث');
      setCameraError(err.message || 'فشل بدء البث');
    } finally { setStarting(false); }
  };

  // ─── Flip camera ───────────────────────────────────────────────────
  const handleFlipCamera = async () => {
    const next: FacingMode = facingMode === 'user' ? 'environment' : 'user';
    const oldStream = localStreamRef.current || previewStream;
    if (oldStream) oldStream.getTracks().forEach(t => t.stop());
    try {
      if (mode === 'host') {
        const newStream = await acquireStream(next, micEnabled);
        localStreamRef.current = newStream;
        setLocalStream(newStream);
      } else if (mode === 'host-setup') {
        const newStream = await acquireStream(next, false);
        setPreviewStream(newStream);
      }
      setFacingMode(next);
      toast.success(next === 'user' ? 'الكاميرا الأمامية' : 'الكاميرا الخلفية');
    } catch (err: any) { toast.error(err.message || 'فشل تبديل الكاميرا'); }
  };

  // ─── Toggle mic ────────────────────────────────────────────────────
  const handleToggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) { toast.error('لا يوجد ميكروفون'); return; }
    const newEnabled = !micEnabled;
    audioTracks.forEach(t => { t.enabled = newEnabled; });
    setMicEnabled(newEnabled);
  };

  // ─── End hosting ───────────────────────────────────────────────────
  const handleEndStream = () => {
    if (!confirm('هل تريد إنهاء البث؟')) return;
    if (currentStream) api.endMarketLiveStream(currentStream.id).catch(() => {});
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setCurrentStream(null);
    setMode('browse');
    setHostTitle(''); setHostProduct(''); setHostPrice('');
    setElapsedTime('00:00'); setFacingMode('user'); setMicEnabled(true);
    toast.success('تم إنهاء البث');
    loadActiveStreams();
  };

  // ─── Cancel host-setup ─────────────────────────────────────────────
  const handleCancelSetup = () => {
    if (previewStream) { previewStream.getTracks().forEach(t => t.stop()); setPreviewStream(null); }
    setCameraError(null);
    setMode('browse');
  };

  // ─── Join as viewer ────────────────────────────────────────────────
  const handleJoinStream = async (stream: LiveStream) => {
    setMode('viewer');
    setCurrentStream(stream);
    setViewerCount(stream.viewer_count);
    setLikeCount(stream.like_count);
    try {
      await api.joinMarketLiveStream(stream.id);
      const msgs = await api.getMarketLiveChat(stream.id);
      setChatMessages(msgs || []);
    } catch {}
    try {
      const wallet = await api.getWalletBalance();
      setWalletBalance(wallet?.balance ?? 0);
    } catch { setWalletBalance(0); }
  };

  // ─── Leave stream ──────────────────────────────────────────────────
  const handleLeaveStream = () => {
    if (currentStream) api.leaveMarketLiveStream(currentStream.id).catch(() => {});
    setCurrentStream(null);
    setChatMessages([]);
    setWalletBalance(null);
    setMode('browse');
    loadActiveStreams();
  };

  // ─── Send chat ─────────────────────────────────────────────────────
  const handleSendChat = async () => {
    if (!chatText.trim() || !currentStream) return;
    const text = chatText.trim();
    setChatText('');
    try {
      const msg = await api.sendMarketLiveChat(currentStream.id, text);
      setChatMessages(prev => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { toast.error('فشل إرسال الرسالة'); setChatText(text); }
  };

  // ─── Like ──────────────────────────────────────────────────────────
  const handleLike = () => {
    if (!currentStream) return;
    api.likeMarketLiveStream(currentStream.id).catch(() => {});
    setLikeCount(prev => prev + 1);
    const id = Date.now() + Math.random();
    setFloatingHearts(prev => [...prev, id]);
    setTimeout(() => setFloatingHearts(prev => prev.filter(h => h !== id)), 3000);
  };

  // ─── Send gift ─────────────────────────────────────────────────────
  const handleSendGift = async (gift: typeof GIFTS[0]) => {
    if (!currentStream) return;
    if (walletBalance !== null && walletBalance < gift.amount) {
      toast.error(`رصيد المحفظة غير كافٍ (رصيدك: ${walletBalance} ج.م)`);
      return;
    }
    setShowGifts(false);
    try {
      const result: any = await api.sendLiveStreamGift(currentStream.id, gift.id, gift.amount);
      if (result?.newBalance !== undefined) setWalletBalance(result.newBalance);
      else if (walletBalance !== null) setWalletBalance(walletBalance - gift.amount);
      const giftAnimId = Date.now() + Math.random();
      setFloatingGifts(prev => [...prev, { id: giftAnimId, icon: gift.icon, name: gift.name, amount: gift.amount, sender: 'أنت' }]);
      setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== giftAnimId)), 4000);
      toast.success(`تم إرسال ${gift.icon} ${gift.name}! 🎁`);
    } catch (err: any) {
      toast.error(err.message || 'رصيد غير كافٍ');
      try { const w = await api.getWalletBalance(); setWalletBalance(w?.balance ?? 0); } catch {}
    }
  };

  // ─── Share ─────────────────────────────────────────────────────────
  const handleShare = () => {
    try { navigator.share?.({ title: currentStream?.title || 'بث مباشر', url: window.location.href }); } catch {}
  };

  // ═══════════════════════════════════════════════════════════════════
  // HOST VIEW (live broadcasting)
  // ═══════════════════════════════════════════════════════════════════
  if (mode === 'host' && currentStream) {
    const mirror = facingMode === 'user';
    return (
      <div className="fixed inset-0 z-[2000] bg-black overflow-hidden select-none" dir="rtl"
        onTouchMove={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
        style={{ touchAction: 'pinch-zoom' }}>
        <video ref={videoRef} autoPlay muted playsInline
          className="w-full h-full object-cover pointer-events-none"
          style={{ transform: mirror ? 'scaleX(-1)' : 'none', touchAction: 'none', userSelect: 'none' }} />

        {/* Top bar */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent z-30">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full">
              <Radio className="w-4 h-4 text-white animate-pulse" />
              <span className="text-white text-xs font-black">مباشر</span>
            </div>
            <span className="text-white text-sm font-bold">{elapsedTime}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full">
            <Users className="w-4 h-4 text-white" />
            <span className="text-white text-xs font-bold">{viewerCount}</span>
          </div>
        </div>

        {/* Right controls (camera flip, mic) */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-30">
          <button onClick={handleFlipCamera} className="w-12 h-12 rounded-full bg-black/50 backdrop-blur flex items-center justify-center active:scale-90" aria-label="تبديل الكاميرا">
            <SwitchCamera className="w-6 h-6 text-white" />
          </button>
          <button onClick={handleToggleMic} className={`w-12 h-12 rounded-full backdrop-blur flex items-center justify-center active:scale-90 ${micEnabled ? 'bg-black/50' : 'bg-red-600'}`} aria-label="ميكروفون">
            {micEnabled ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
          </button>
        </div>

        {/* Bottom: end stream */}
        <div className="absolute bottom-0 inset-x-0 p-4 space-y-3 bg-gradient-to-t from-black/60 to-transparent z-30">
          {currentStream?.title && <p className="text-white text-sm font-bold text-center">{currentStream.title}</p>}
          {currentStream?.product_name && (
            <div className="flex items-center justify-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 mx-auto w-fit">
              <span className="text-white text-xs font-bold">{currentStream.product_name}</span>
              {currentStream.product_price > 0 && <span className="text-orange-400 text-xs font-black">{currentStream.product_price} ج.م</span>}
            </div>
          )}
          <button onClick={handleEndStream} className="w-full py-3 rounded-2xl bg-red-600 text-white font-black text-sm hover:bg-red-700 active:scale-95">إنهاء البث</button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // HOST-SETUP VIEW (preview + form)
  // ═══════════════════════════════════════════════════════════════════
  if (mode === 'host-setup') {
    const mirror = facingMode === 'user';
    return (
      <div className="fixed inset-0 z-[2000] bg-black overflow-hidden select-none" dir="rtl"
        onTouchMove={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
        style={{ touchAction: 'pinch-zoom' }}>
        <video ref={videoRef} autoPlay muted playsInline
          className="w-full h-full object-cover pointer-events-none"
          style={{ transform: mirror ? 'scaleX(-1)' : 'none', touchAction: 'none', userSelect: 'none' }} />

        {/* Top: cancel + title + flip */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent z-30">
          <button onClick={handleCancelSetup} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-90">
            <ArrowRight className="w-5 h-5 text-white" />
          </button>
          <span className="text-white text-sm font-black">إعداد البث</span>
          <button onClick={handleFlipCamera} className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-90">
            <SwitchCamera className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Camera error */}
        {cameraError && (
          <div className="absolute top-20 inset-x-4 p-3 rounded-xl bg-red-900/80 backdrop-blur border border-red-500/50 z-30">
            <p className="text-white text-xs font-bold text-center">{cameraError}</p>
            <button onClick={() => startPreview(facingMode)} className="mt-2 w-full py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold">إعادة المحاولة</button>
          </div>
        )}

        {/* Bottom: setup form */}
        <div className="absolute bottom-0 inset-x-0 p-4 space-y-3 bg-gradient-to-t from-black/80 via-black/60 to-transparent z-30">
          <input type="text" value={hostTitle} onChange={e => setHostTitle(e.target.value)} placeholder="عنوان البث (مثال: عرض خاص)"
            className="w-full py-3 px-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white text-sm outline-none placeholder:text-gray-300" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={hostProduct} onChange={e => setHostProduct(e.target.value)} placeholder="اسم المنتج"
              className="py-3 px-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white text-sm outline-none placeholder:text-gray-300" />
            <input type="number" value={hostPrice} onChange={e => setHostPrice(e.target.value)} placeholder="السعر"
              className="py-3 px-4 rounded-xl bg-white/10 backdrop-blur border border-white/20 text-white text-sm outline-none placeholder:text-gray-300" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCancelSetup} className="flex-1 py-3 rounded-xl text-sm font-bold bg-white/10 text-white">إلغاء</button>
            <button onClick={handleStartStream} disabled={starting || !!cameraError}
              className="flex-1 py-3 rounded-xl bg-gradient-to-l from-red-500 to-orange-500 text-white font-black text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              {starting ? 'جاري...' : 'بدء البث'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEWER VIEW (TikTok-style — clean separation of zones)
  // ═══════════════════════════════════════════════════════════════════
  if (mode === 'viewer' && currentStream) {
    return (
      <div className="fixed inset-0 z-[2000] bg-black overflow-hidden select-none" dir="rtl"
        onTouchMove={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
        style={{ touchAction: 'pinch-zoom' }}>

        {/* Host info (center) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6">
            <img src={currentStream.host_avatar} alt="" className="w-28 h-28 rounded-full mx-auto mb-4 object-cover ring-4 ring-white/20" />
            <p className="text-white text-xl font-black drop-shadow-lg">@{currentStream.host_name}</p>
            {currentStream.title && <p className="text-gray-300 text-sm mt-2 drop-shadow-lg">{currentStream.title}</p>}
            {currentStream.product_name && (
              <div className="mt-3 inline-flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-1.5">
                <span className="text-white text-xs font-bold">{currentStream.product_name}</span>
                {currentStream.product_price > 0 && <span className="text-orange-400 text-xs font-black">{currentStream.product_price} ج.م</span>}
              </div>
            )}
          </div>
        </div>

        {/* Floating hearts */}
        <div className="absolute right-20 bottom-48 pointer-events-none z-20">
          <AnimatePresence>
            {floatingHearts.map(id => (
              <motion.div key={id} initial={{ y: 0, opacity: 1, scale: 0.5 }} animate={{ y: -300, opacity: 0, scale: 1.5 }} transition={{ duration: 3 }} className="absolute text-4xl drop-shadow-lg">❤️</motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Floating gifts */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-56 pointer-events-none z-20">
          <AnimatePresence>
            {floatingGifts.map(g => (
              <motion.div key={g.id} initial={{ y: 0, opacity: 1, scale: 0.3 }} animate={{ y: -250, opacity: 0, scale: 1.8 }} transition={{ duration: 4 }} className="absolute flex flex-col items-center">
                <span className="text-6xl drop-shadow-2xl">{g.icon}</span>
                <span className="text-white text-xs font-bold mt-1 drop-shadow-lg bg-black/50 px-2 py-0.5 rounded-full">{g.sender} أرسل {g.name}</span>
                <span className="text-orange-400 text-[10px] font-black mt-0.5">{g.amount} ج.م</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ═══ TOP BAR (z-30) — back + LIVE + viewers ═══ */}
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent z-30">
          <button onClick={handleLeaveStream} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center flex-shrink-0 active:scale-90">
            <ArrowRight className="w-5 h-5 text-white" />
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 bg-red-600 px-3 py-1.5 rounded-full">
              <Radio className="w-4 h-4 text-white animate-pulse" />
              <span className="text-white text-xs font-black">مباشر</span>
            </div>
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full">
              <Users className="w-4 h-4 text-white" />
              <span className="text-white text-xs font-bold">{viewerCount}</span>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT ACTION BAR (z-30) — like, gift, share ═══ */}
        <div className="absolute bottom-28 right-3 flex flex-col items-center gap-4 z-30">
          <button onClick={handleLike} className="flex flex-col items-center gap-1 active:scale-90">
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
              <Heart className="w-7 h-7 text-red-500" fill="currentColor" />
            </div>
            <span className="text-white text-[10px] font-bold drop-shadow-lg">{likeCount}</span>
          </button>
          <button onClick={() => setShowGifts(true)} className="flex flex-col items-center gap-1 active:scale-90">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
              <Gift className="w-7 h-7 text-white" />
            </div>
            <span className="text-white text-[10px] font-bold drop-shadow-lg">هدية</span>
          </button>
          <button onClick={handleShare} className="flex flex-col items-center gap-1 active:scale-90">
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-white text-[10px] font-bold drop-shadow-lg">مشاركة</span>
          </button>
        </div>

        {/* ═══ CHAT ZONE (z-20) — floating comments, bottom-left, ABOVE input ═══ */}
        {/* 🔧 CRITICAL: bottom-24 (96px) keeps chat ABOVE the input bar (which is at bottom-0, ~64px tall) */}
        <div className="absolute left-0 bottom-24 w-[70%] max-w-xs max-h-[45%] overflow-y-auto px-3 space-y-2 z-20" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <AnimatePresence initial={false}>
            {chatMessages.slice(-20).map((msg) => (
              <motion.div key={msg.id} initial={{ opacity: 0, x: -30, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                className="flex items-start gap-2 bg-black/50 backdrop-blur-md rounded-2xl px-3 py-1.5 max-w-full">
                {msg.user_avatar && <img src={msg.user_avatar} alt="" className="w-6 h-6 rounded-full flex-shrink-0 object-cover" />}
                <div className="min-w-0 flex-1">
                  <span className="text-orange-400 text-[11px] font-black block leading-tight">{msg.user_name}</span>
                  <span className="text-white text-[12px] block leading-tight break-words">{msg.text}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* ═══ INPUT BAR (z-30) — bottom edge, full width ═══ */}
        {/* 🔧 CRITICAL: this is SEPARATE from the chat zone. No overlap possible. */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent z-30">
          <div className="flex items-center gap-2">
            <input type="text" value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSendChat(); } }} placeholder="أضف تعليقًا..."
              className="flex-1 min-w-0 py-3 px-4 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white text-sm outline-none placeholder:text-gray-400" />
            <button onClick={handleSendChat} disabled={!chatText.trim()}
              className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 active:scale-90 disabled:opacity-40">
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* ═══ GIFT PANEL (z-40) — bottom sheet, OVER everything ═══ */}
        <AnimatePresence>
          {showGifts && (
            <>
              <div className="absolute inset-0 bg-black/70 z-40" onClick={() => setShowGifts(false)} />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="absolute bottom-0 inset-x-0 bg-gray-900 rounded-t-3xl p-4 border-t border-gray-700 z-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-black text-base">إرسال هدية 🎁</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400 text-xs font-bold bg-orange-500/10 px-2 py-1 rounded-full">رصيدك: {walletBalance ?? '...'} ج.م</span>
                    <button onClick={() => setShowGifts(false)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {GIFTS.map(gift => {
                    const canAfford = walletBalance === null || walletBalance >= gift.amount;
                    return (
                      <button key={gift.id} onClick={() => handleSendGift(gift)} disabled={!canAfford}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${canAfford ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-800/50 opacity-40'}`}>
                        <span className="text-3xl">{gift.icon}</span>
                        <span className="text-white text-[10px] font-bold">{gift.name}</span>
                        <span className="text-orange-400 text-[10px] font-black">{gift.amount} ج.م</span>
                      </button>
                    );
                  })}
                </div>
                {walletBalance !== null && walletBalance < 5 && (
                  <p className="text-yellow-500 text-[10px] mt-3 text-center">رصيدك منخفض — شحن المحفظة من صفحة المحفظة</p>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // BROWSE VIEW (list of active streams + "start broadcast" button)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[2000] bg-black flex flex-col select-none" dir="rtl"
      onTouchMove={(e) => { if (e.touches.length > 1) e.preventDefault(); }}
      style={{ touchAction: 'pinch-zoom' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent flex-shrink-0">
        {/* 🔧 FIX: left side has back button (to close overlay) + title */}
        <div className="flex items-center gap-3">
          {onClose && (
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center active:scale-90" aria-label="رجوع">
              <ArrowRight className="w-5 h-5 text-white" />
            </button>
          )}
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-red-500" />بث مباشر
          </h2>
        </div>
        <button onClick={async () => { setMode('host-setup'); await startPreview('user'); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-l from-red-500 to-orange-500 text-white font-black text-sm shadow-md active:scale-95">
          <Video className="w-4 h-4" />ابدأ بث
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
        ) : activeStreams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-800 rounded-2xl border border-gray-700">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-gray-700"><Radio className="w-8 h-8 text-gray-500" /></div>
            <p className="text-sm font-bold text-white">لا يوجد بث مباشر الآن</p>
            <p className="text-xs mt-1 text-gray-400">كن أول من يبدأ البث!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {activeStreams.map(stream => (
              <button key={stream.id} onClick={() => handleJoinStream(stream)} className="relative rounded-2xl overflow-hidden bg-gray-800 border border-gray-700 active:scale-95">
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-red-600 px-2 py-1 rounded-full">
                  <Radio className="w-3 h-3 text-white animate-pulse" /><span className="text-white text-[9px] font-black">مباشر</span>
                </div>
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/50 px-2 py-1 rounded-full">
                  <Users className="w-3 h-3 text-white" /><span className="text-white text-[9px] font-bold">{stream.viewer_count}</span>
                </div>
                <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                  <img src={stream.host_avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
                </div>
                <div className="p-2.5 text-start">
                  <p className="text-xs font-black text-white truncate">{stream.host_name}</p>
                  {stream.title && <p className="text-[10px] text-gray-400 truncate">{stream.title}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
