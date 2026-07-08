import React from 'react';
import {
  Phone, Video, PhoneOff, Mic, MicOff, CameraOff, PhoneCall,
  Volume2, VolumeX, AlertCircle, Monitor, MonitorOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

export const CallOverlay: React.FC = () => {
  const {
    activeCall, incomingCall, callState, callDuration, isMuted, isCameraOff,
    isSpeakerOn, callError, showPermissionGuide, localStream, remoteStream,
    localVideoRef, remoteVideoRef, acceptIncomingCall, rejectIncomingCall,
    endCall, toggleMute, toggleCamera, toggleSpeaker, setShowPermissionGuide,
    retryCallWithPermission, formatCallDuration,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  // ─── Screen sharing state ──────────────────────────────────────
  const [isScreenSharing, setIsScreenSharing] = React.useState(false);
  const screenStreamRef = React.useRef<MediaStream | null>(null);
  const originalVideoTrackRef = React.useRef<MediaStreamTrack | null>(null);

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as MediaTrackConstraints,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in peer connection
        const pc = (ctx as any).peerConnectionRef?.current as RTCPeerConnection | null;
        if (pc) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            originalVideoTrackRef.current = videoSender.track;
            await videoSender.replaceTrack(screenTrack);
          }
        }

        // Update local video preview
        if (localVideoRef?.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // Handle screen share stop (user clicks browser's "Stop sharing" button)
        screenTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err: any) {
      console.error('[ScreenShare] Error:', err.message);
      setIsScreenSharing(false);
    }
  };

  const stopScreenShare = async () => {
    // Stop screen stream
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    // Restore original video track
    const pc = (ctx as any).peerConnectionRef?.current as RTCPeerConnection | null;
    if (pc && originalVideoTrackRef.current) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(originalVideoTrackRef.current);
      }
    }

    // Restore local video preview
    if (localVideoRef?.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }

    originalVideoTrackRef.current = null;
    setIsScreenSharing(false);
  };

  return (
    <>
      {/* ─── Incoming Call UI ──────────────────────────────────────────── */}
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[310] flex items-center justify-center"
            dir={dir}
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className="relative z-10 flex flex-col items-center text-center px-6">
              {/* Avatar with ringing animation */}
              <div className="relative mb-6">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl"
                >
                  <img src={incomingCall.fromAvatar} alt="" className="w-full h-full object-cover" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full border-2 border-green-400"
                />
                <motion.div
                  animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute inset-0 rounded-full border-2 border-green-400"
                />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg border-2 border-white">
                  {incomingCall.type === 'audio' ? <PhoneCall className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-white" />}
                </div>
              </div>

              <h2 className="text-2xl font-black text-white mb-2">{incomingCall.fromName}</h2>
              <p className="text-green-300 text-sm font-bold mb-1">
                {incomingCall.type === 'video' ? t('messages.videoCall', 'مكالمة فيديو') : t('messages.audioCall', 'مكالمة صوتية')}
              </p>
              <p className="text-white/60 text-sm mb-8">{t('messages.incomingCall', 'مكالمة واردة...')}</p>

              {/* Accept / Reject */}
              <div className="flex items-center gap-10">
                <button
                  onClick={rejectIncomingCall}
                  className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center transition-all active:scale-90 hover:bg-red-600 shadow-lg shadow-red-500/30"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </button>
                <button
                  onClick={acceptIncomingCall}
                  className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center transition-all active:scale-90 hover:bg-green-600 shadow-lg shadow-green-500/30"
                >
                  <Phone className="w-7 h-7 text-white" />
                </button>
              </div>
              <p className="text-white/40 text-[10px] mt-4">{t('messages.tapToAccept', 'اضغط للقبول أو الرفض')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Active Call UI ────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex flex-col"
            dir={dir}
          >
            {/* Hidden audio for reliable remote audio */}
            <audio id="remote-call-audio" autoPlay style={{ display: 'none' }} />

            {/* Background */}
            <div className="absolute inset-0 bg-gray-900">
              {!(activeCall.type === 'video' && remoteStream) && (
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" />
                  <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                </div>
              )}
            </div>

            {/* Remote video (full screen).
                 `muted` is set initially so Android WebView/iOS Safari allow autoplay
                 without a user gesture. The createPeerConnection ontrack handler
                 unmutes it once the stream is attached, and the actual remote audio
                 is played through the separate <audio> element below. */}
            {activeCall.type === 'video' && remoteStream && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover z-[1]"
              />
            )}

            {/* Local video PIP */}
            {activeCall.type === 'video' && !isCameraOff && localStream && (
              <div className="absolute top-16 right-4 z-[10] w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gray-800">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                <div className="absolute bottom-1 left-1 right-1 bg-black/50 rounded-lg px-1.5 py-0.5 text-center">
                  <span className="text-white text-[9px] font-bold">{t('common.you', 'أنت')}</span>
                </div>
              </div>
            )}

            {/* Remote user avatar (when no remote video) */}
            {!(activeCall.type === 'video' && remoteStream) && (
              <div className="relative z-[5] flex-1 flex flex-col items-center justify-center px-6">
                <div className="relative mb-6">
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl"
                  >
                    <img src={activeCall.contactAvatar} alt="" className="w-full h-full object-cover" />
                  </motion.div>
                  {callState === 'outgoing' && (
                    <>
                      <motion.div
                        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute inset-0 rounded-full border-2 border-green-400"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                        className="absolute inset-0 rounded-full border-2 border-green-400"
                      />
                    </>
                  )}
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg border-2 border-white">
                    {activeCall.type === 'audio' ? <PhoneCall className="w-5 h-5 text-white" /> : <Video className="w-5 h-5 text-white" />}
                  </div>
                </div>

                <h2 className="text-2xl font-black text-white mb-2">{activeCall.contactName}</h2>
                <p className="text-green-300 text-sm font-bold mb-1">
                  {callState === 'outgoing'
                    ? t('messages.calling', 'جاري الاتصال...')
                    : activeCall.type === 'video'
                      ? t('messages.videoCall', 'مكالمة فيديو')
                      : t('messages.audioCall', 'مكالمة صوتية')}
                </p>
              </div>
            )}

            {/* When remote video IS showing, overlay name at top */}
            {activeCall.type === 'video' && remoteStream && (
              <div className="relative z-[5] pt-4 px-4">
                <div className="inline-flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-xl">
                  <h2 className="text-sm font-bold text-white">{activeCall.contactName}</h2>
                  <span className="text-green-300 text-[10px] font-bold">
                    {callState === 'outgoing' ? t('messages.calling', 'جاري الاتصال...') : t('messages.videoCall', 'مكالمة فيديو')}
                  </span>
                </div>
              </div>
            )}

            {/* Call error */}
            {callError && (
              <div className="relative z-[5] flex justify-center mt-2">
                <div className="px-4 py-2 bg-red-500/20 rounded-xl border border-red-500/30">
                  <p className="text-red-300 text-sm font-bold">{callError}</p>
                </div>
              </div>
            )}

            {/* Duration display */}
            <div className="relative z-[5] flex justify-center mt-1">
              <p className="text-white/80 text-lg font-mono font-bold">
                {formatCallDuration(callDuration)}
              </p>
            </div>

            {/* Spacer */}
            <div className="relative z-[5] flex-1" />

            {/* Call Controls */}
            <div className="relative z-[5] flex items-center justify-center gap-5 py-8 pb-10 bg-gradient-to-t from-black/60 to-transparent">
              {/* Mute */}
              <button
                onClick={toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  isMuted ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {/* Camera toggle (video only) */}
              {activeCall.type === 'video' && (
                <button
                  onClick={toggleCamera}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                    isCameraOff ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {isCameraOff ? <CameraOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
              )}

              {/* Screen share toggle (video calls only) */}
              {activeCall.type === 'video' && callState === 'connected' && (
                <button
                  onClick={toggleScreenShare}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                    isScreenSharing ? 'bg-blue-500 text-white' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title={isScreenSharing ? t('messages.stopScreenShare', 'إيقاف مشاركة الشاشة') : t('messages.startScreenShare', 'مشاركة الشاشة')}
                >
                  {isScreenSharing ? <MonitorOff className="w-6 h-6" /> : <Monitor className="w-6 h-6" />}
                </button>
              )}

              {/* End Call */}
              <button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center transition-all active:scale-90 hover:bg-red-600 shadow-lg shadow-red-500/30"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </button>

              {/* Speaker */}
              <button
                onClick={toggleSpeaker}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  isSpeakerOn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-orange-500 text-white'
                }`}
              >
                {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Permission Guide Dialog ───────────────────────────────────── */}
      <AnimatePresence>
        {showPermissionGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[320] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            dir={dir}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-l from-orange-500 to-amber-600 px-5 py-4 text-center">
                <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  {showPermissionGuide === 'video' ? (
                    <Video className="w-7 h-7 text-white" />
                  ) : (
                    <Mic className="w-7 h-7 text-white" />
                  )}
                </div>
                <h3 className="text-white font-black text-lg">
                  {showPermissionGuide === 'video'
                    ? t('messages.permissionVideoTitle', 'السماح بالوصول للكاميرا والميكروفون')
                    : t('messages.permissionAudioTitle', 'السماح بالوصول للميكروفون')}
                </h3>
              </div>

              {/* Instructions */}
              <div className="p-5 space-y-3">
                <p className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('messages.permissionInstructions', 'لإجراء مكالمة، يحتاج المتصفح إلى إذن الوصول. اتبع الخطوات التالية:')}
                </p>
                <div className="space-y-2">
                  {[
                    { num: 1, text: t('messages.permissionStep1', 'انقر على أيقونة القفل (🔒) أو إعدادات الموقع في شريط العنوان') },
                    { num: 2, text: showPermissionGuide === 'video'
                      ? t('messages.permissionStep2Video', 'ابحث عن "الكاميرا" و"الميكروفون" واختر "السماح"')
                      : t('messages.permissionStep2Audio', 'ابحث عن "الميكروفون" واختر "السماح"') },
                    { num: 3, text: t('messages.permissionStep3', 'أعد تحميل الصفحة ثم حاول المكالمة مرة أخرى') },
                  ].map(step => (
                    <div key={step.num} className={`flex items-start gap-3 p-3 rounded-xl ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                      <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">
                        {step.num}
                      </div>
                      <p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{step.text}</p>
                    </div>
                  ))}
                </div>

                {/* HTTPS Note */}
                <div className={`flex items-start gap-2 p-3 rounded-xl border ${
                  darkMode ? 'bg-amber-900/20 border-amber-800/40' : 'bg-amber-50 border-amber-200'
                }`}>
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-[11px] font-bold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                    {t('messages.permissionHTTPSNote', 'ملاحظة: يتطلب الاتصال الصوتي/الفيديو اتصالاً آمناً (HTTPS).')}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-5 pb-5 flex gap-3">
                <button
                  onClick={() => setShowPermissionGuide(null)}
                  className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                    darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t('common.cancel', 'إلغاء')}
                </button>
                <button
                  onClick={retryCallWithPermission}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-l from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 transition-all active:scale-95"
                >
                  {t('messages.retryCall', 'حاول مرة أخرى')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
