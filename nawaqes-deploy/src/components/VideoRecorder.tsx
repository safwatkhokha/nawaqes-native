import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  X,
  Upload,
  Video,
  Play,
  Check,
  AlertCircle,
  Loader2,
  Film,
  Image,
  ChevronDown,
  Camera,
  SwitchCamera,
  Mic,
  MicOff,
  Circle,
  Square,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';

interface VideoRecorderProps {
  onClose: () => void;
  onLinked: () => void;
}

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB (increased)
const ACCEPTED_FORMATS = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv', 'video/x-m4v', 'video/ogg', 'video/mpeg', 'video/x-mpeg', 'video/mp2t', 'video/x-msvideo', 'video/avi', 'video/ogv', 'video/x-m4v', 'video/x-ms-asf', 'video/x-realvideo', 'video/vnd.rn-realvideo', 'video/divx', 'video/x-divx', 'video/x-xvid'];
const MAX_RECORDING_SECONDS = 60;

export const VideoRecorder: React.FC<VideoRecorderProps> = ({ onClose, onLinked }) => {
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [userAds, setUserAds] = useState<any[]>([]);
  const [selectedAdId, setSelectedAdId] = useState('');
  const [selectedAdType, setSelectedAdType] = useState<'post' | 'listing'>('listing');
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [loadingAds, setLoadingAds] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'upload' | 'record'>('upload');

  // Camera recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isCamReady, setIsCamReady] = useState(false);
  const [isFacingFront, setIsFacingFront] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bgCard = darkMode ? 'bg-gray-800' : 'bg-white';
  const bgInput = darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Load user's ads (both posts and market listings)
  useEffect(() => {
    const loadAds = async () => {
      try {
        // Load market listings
        const listingsRes = await fetch('/api/market/my-listings', {
          headers: { 'Authorization': `Bearer ${api.getToken()}` },
        });
        const listingsData = listingsRes.ok ? await listingsRes.json() : null;
        const listings = (listingsData?.listings || []).map((l: any) => ({
          ...l,
          _type: 'listing',
          displayName: l.title?.substring(0, 60) || l.id,
          priceDisplay: l.price ? `- ${Number(l.price).toLocaleString()} ${l.currency || t('common.egp')}` : '',
        }));

        // Load posts with type=ad
        const postsRes = await fetch('/api/posts?type=ad&author=me', {
          headers: { 'Authorization': `Bearer ${api.getToken()}` },
        });
        const postsData = postsRes.ok ? await postsRes.json() : null;
        const posts = (postsData?.posts || []).map((p: any) => ({
          ...p,
          _type: 'post',
          displayName: p.content?.substring(0, 60) || p.id,
          priceDisplay: p.price ? `- ${Number(p.price).toLocaleString()} ${p.currency || t('common.egp')}` : '',
        }));

        setUserAds([...listings, ...posts]);
      } catch (err) {
        // Fallback to posts only
        try {
          const data = await api.getPosts({ type: 'ad', author: 'me' });
          if (data && data.posts) {
            setUserAds(data.posts.map((p: any) => ({
              ...p,
              _type: 'post',
              displayName: p.content?.substring(0, 60) || p.id,
              priceDisplay: p.price ? `- ${Number(p.price).toLocaleString()} ${t('common.egp')}` : '',
            })));
          }
        } catch {}
      }
      setLoadingAds(false);
    };
    loadAds();
  }, [t]);

  // Start camera for recording mode
  useEffect(() => {
    if (mode === 'record') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode, isFacingFront]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isFacingFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: !isMuted,
      });
      streamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      setIsCamReady(true);
    } catch {
      toast.error(t('marketLive.cameraError'));
      setIsCamReady(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCamReady(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
    });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'video/webm' });
      setVideoFile(file);
      const url = URL.createObjectURL(blob);
      setVideoPreview(url);
      setVideoDuration(recordingTime);
      setMode('upload'); // Switch back to upload mode to show preview
      toast.success(t('marketLive.recordingSaved'));
    };

    mediaRecorder.start(100);
    setIsRecording(true);
    setRecordingTime(0);

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= MAX_RECORDING_SECONDS) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  };

  // Handle video file selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_FORMATS.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi|3gp|mkv|flv|wmv|m4v|ogg|ogv|mpeg|mpg|mpe|ts|m2ts|vob|asf|rm|rmvb|divx|xvid|hevc|h264|h265|av1|prores|dnxhd)$/i)) {
      toast.error(t('marketLive.invalidFormat'));
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      toast.error(t('marketLive.fileTooLarge'));
      return;
    }

    setVideoFile(file);
    setError('');

    const url = URL.createObjectURL(file);
    setVideoPreview(url);

    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration);
      URL.revokeObjectURL(tempVideo.src);
    };
    tempVideo.src = url;
  };

  const clearVideo = () => {
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setVideoDuration(0);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  // Submit: upload video + link to ad
  const handleSubmit = async () => {
    if (!standaloneMode && !selectedAdId) {
      setError(t('marketLive.selectAd'));
      return;
    }
    if (!videoFile) {
      setError(t('marketLive.uploadVideo'));
      return;
    }

    setError('');
    setUploading(true);
    setUploadProgress(0);

    try {
      setUploadProgress(20);
      const uploadResult = await api.uploadVideo(videoFile);
      setUploadProgress(60);

      if (!uploadResult || !uploadResult.url) {
        throw new Error(t('marketLive.uploadFailed'));
      }

      setUploadProgress(80);
      setLinking(true);
      setUploading(false);

      if (standaloneMode) {
        // 🔧 Standalone video — no ad needed
        const res = await fetch('/api/market-live/link-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.getToken()}`,
          },
          body: JSON.stringify({
            videoUrl: uploadResult.url,
            thumbnailUrl: undefined,
            duration: Math.round(videoDuration),
            title: videoTitle || 'فيديو',
            description: videoDescription,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(data.error || 'فشل رفع الفيديو');
        }
      } else {
        const selectedAd = userAds.find((a: any) => a.id === selectedAdId);
        const adType = selectedAd?._type || 'listing';

      if (adType === 'listing') {
        // Link to market listing - use direct API call
        const res = await fetch('/api/market-live/link-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.getToken()}`,
          },
          body: JSON.stringify({
            postId: selectedAdId,
            videoUrl: uploadResult.url,
            thumbnailUrl: undefined,
            duration: Math.round(videoDuration),
            listingType: 'market_listing',
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Link failed' }));
          throw new Error(data.error || t('marketLive.videoLinkFailed'));
        }
      } else {
        await api.linkVideo(
          selectedAdId,
          uploadResult.url,
          undefined,
          Math.round(videoDuration)
        );
      }

      }
      setUploadProgress(100);
      toast.success(standaloneMode ? 'تم رفع الفيديو بنجاح' : t('marketLive.videoLinked'));
      onLinked();
    } catch (err: any) {
      const message = err?.message || t('marketLive.videoLinkFailed');
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      setLinking(false);
      setUploadProgress(0);
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${bgCard} border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}
        dir={dir}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <h3 className={`font-black text-base ${textPrimary}`}>
              {t('marketLive.addYourVideo')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mode switcher */}
          {!videoFile && (
            <div className={`flex items-center gap-1 p-1 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <button
                onClick={() => setMode('upload')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'upload'
                    ? 'bg-orange-500 text-white'
                    : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                {t('marketLive.uploadVideo')}
              </button>
              <button
                onClick={() => setMode('record')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'record'
                    ? 'bg-red-500 text-white'
                    : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                {t('marketLive.recordVideo')}
              </button>
            </div>
          )}

          {/* Recording Mode */}
          {mode === 'record' && !videoFile && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-[300px] flex items-center justify-center">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: isFacingFront ? 'scaleX(-1)' : 'none' }}
                />
                {!isCamReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                    <Camera className="w-12 h-12 text-gray-600" />
                  </div>
                )}
                {/* Recording timer */}
                {isRecording && (
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-red-600/90 px-3 py-1.5 rounded-full">
                    <Circle className="w-2 h-2 text-white fill-white animate-pulse" />
                    <span className="text-white text-xs font-black tabular-nums">{formatRecordingTime(recordingTime)}</span>
                  </div>
                )}
                {/* Max time warning */}
                {recordingTime >= MAX_RECORDING_SECONDS - 10 && isRecording && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-amber-500/90 px-3 py-1 rounded-full">
                    <span className="text-white text-[10px] font-black">{MAX_RECORDING_SECONDS - recordingTime}s {t('marketLive.remaining')}</span>
                  </div>
                )}
              </div>
              {/* Camera controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setIsFacingFront(prev => !prev)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={!isCamReady}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-700 active:scale-95'
                      : 'bg-orange-500 hover:bg-orange-600 active:scale-95'
                  } ${!isCamReady ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isRecording ? <Square className="w-7 h-7 text-white fill-white" /> : <Circle className="w-7 h-7 text-white" />}
                </button>
                <button
                  onClick={() => setIsMuted(prev => !prev)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isMuted
                      ? 'bg-red-500/20 text-red-400'
                      : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {/* Upload Mode */}
          {mode === 'upload' && !videoFile && (
            <div>
              <p className={`text-[10px] mb-2 ${textMuted}`}>
                {t('marketLive.uploadVideoHint')}
              </p>
              <label htmlFor="videoInputRef-input" className={`w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-3 transition-colors ${
                  darkMode
                    ? 'border-gray-600 hover:border-orange-500/50 bg-gray-700/30'
                    : 'border-gray-300 hover:border-orange-400 bg-gray-50'
                }`} style={{cursor:"pointer"}}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  darkMode ? 'bg-gray-600' : 'bg-orange-50'
                }`}>
                  <Upload className={`w-6 h-6 ${darkMode ? 'text-gray-400' : 'text-orange-400'}`} />
                </div>
                <span className={`text-sm font-bold ${textMuted}`}>
                  {t('marketLive.uploadVideo')}
                </span>
              </label>
            </div>
          )}

          {/* Video Preview (from upload or recording) */}
          {videoFile && (
            <div className={`relative rounded-xl overflow-hidden border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              {videoPreview && (
                <div className="relative">
                  <video
                    ref={previewVideoRef}
                    src={videoPreview}
                    className="w-full h-48 object-cover"
                    controls
                    playsInline
                  />
                  <button
                    onClick={clearVideo}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className={`p-3 flex items-center justify-between ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <Film className={`w-4 h-4 ${textMuted}`} />
                  <span className={`text-xs font-medium truncate max-w-[200px] ${textSecondary}`}>
                    {videoFile.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {videoDuration > 0 && (
                    <span className={`text-[10px] font-bold ${textMuted}`}>
                      {Math.round(videoDuration)} {t('marketLive.seconds')}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold ${textMuted}`}>
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                </div>
              </div>
            </div>
          )}

          <input
            id="videoInputRef-input" ref={videoInputRef}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.avi,.3gp,.mkv,.flv,.wmv,.m4v,.ogg,.ogv,.mpeg,.mpg,.ts,.m2ts,.vob,.asf,.rm,.rmvb,.divx,.xvid,.hevc,.h264,.h265,.av1,.prores,.dnxhd"
            className="sr-only"
            onChange={handleVideoSelect}
          />

          {/* 🔧 Mode Toggle: Standalone Video vs Linked Ad */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setStandaloneMode(true)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                standaloneMode
                  ? 'bg-orange-600 text-white shadow-lg'
                  : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              🎬 فيديو فقط
            </button>
            <button
              type="button"
              onClick={() => setStandaloneMode(false)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                !standaloneMode
                  ? 'bg-orange-600 text-white shadow-lg'
                  : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              }`}
            >
              📢 ربط بإعلان
            </button>
          </div>

          {/* Standalone video fields */}
          {standaloneMode && (
            <div className="space-y-3 mb-4">
              <div>
                <label className={`text-xs font-bold mb-1.5 block ${textSecondary}`}>عنوان الفيديو</label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={e => setVideoTitle(e.target.value)}
                  placeholder="مثال: عرض منتج، شرح..."
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />
              </div>
              <div>
                <label className={`text-xs font-bold mb-1.5 block ${textSecondary}`}>وصف الفيديو (اختياري)</label>
                <textarea
                  value={videoDescription}
                  onChange={e => setVideoDescription(e.target.value)}
                  placeholder="اكتب وصفاً للفيديو..."
                  rows={2}
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />
              </div>
            </div>
          )}

          {/* Select Ad (only in linked mode) */}
          {!standaloneMode && (
          <div>
            <label className={`text-xs font-bold mb-1.5 block ${textSecondary}`}>
              {t('marketLive.selectAd')} *
            </label>
            {loadingAds ? (
              <div className={`h-12 rounded-xl animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} />
            ) : userAds.length === 0 ? (
              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-orange-50 border-orange-100'}`}>
                <AlertCircle className={`w-5 h-5 mx-auto mb-2 ${darkMode ? 'text-gray-400' : 'text-orange-400'}`} />
                <p className={`text-xs font-bold text-center ${textMuted}`}>
                  {t('marketLive.noAdsYet')}
                </p>
                <p className={`text-[10px] text-center mt-1 ${textMuted}`}>
                  {t('marketLive.createAdFirst')}
                </p>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={selectedAdId}
                  onChange={(e) => {
                    setSelectedAdId(e.target.value);
                    const ad = userAds.find((a: any) => a.id === e.target.value);
                    if (ad) setSelectedAdType(ad._type || 'listing');
                  }}
                  className={`w-full px-4 py-3 rounded-xl border appearance-none text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 ${bgInput} ${textPrimary}`}
                >
                  <option value="">{t('marketLive.selectAdHint')}</option>
                  {userAds.map((ad: any) => (
                    <option key={ad.id} value={ad.id}>
                      {ad._type === 'listing' ? '🏪 ' : '📢 '}{ad.displayName} {ad.priceDisplay}
                    </option>
                  ))}
                </select>
                <ChevronDown className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'left-3' : 'right-3'} w-4 h-4 ${textMuted} pointer-events-none`} />
              </div>
            )}
          </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 dark:bg-red-900/20 dark:border-red-800/40">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-xs font-bold text-red-600 dark:text-red-400">{error}</span>
            </div>
          )}

          {/* Progress indicator */}
          {(uploading || linking) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                <span className={`text-xs font-bold ${textSecondary}`}>
                  {linking ? t('marketLive.linking') : t('marketLive.uploadVideo')}
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={(!standaloneMode && !selectedAdId) || !videoFile || uploading || linking}
              className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all ${
                !selectedAdId || !videoFile || uploading || linking
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/20'
              }`}
            >
              {uploading || linking ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {linking ? t('marketLive.linking') : t('marketLive.upload')}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {t('marketLive.upload')}
                </span>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
