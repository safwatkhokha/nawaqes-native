// ─── Live Broadcast Screen ──────────────────────────────────────────
// Native camera live streaming using expo-camera.
// Host can flip camera, toggle mic, start/end stream.

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType, CameraView } from 'expo-camera';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  X, Radio, SwitchCamera, Mic, MicOff, Users, Loader2,
  Video, Send,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

export default function LiveBroadcastScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>('front');
  const [micOn, setMicOn] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [streamData, setStreamData] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [viewerCount, setViewerCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const startTimeRef = useRef(0);

  // ─── Request camera + mic permissions ─────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const camPerm = await Camera.requestCameraPermissionsAsync();
        const micPerm = await Camera.requestMicrophonePermissionsAsync();
        setHasPermission(camPerm.granted && micPerm.granted);
        if (!camPerm.granted || !micPerm.granted) {
          Alert.alert(
            'إذن مطلوب',
            'يحتاج البث المباشر إلى إذن الكاميرا والميكروفون. يرجى السماح من الإعدادات.',
            [{ text: 'حسناً', onPress: () => navigation?.goBack?.() }]
          );
        }
      } catch (e) {
        setHasPermission(false);
      }
    })();
  }, []);

  // ─── Timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLive && startTimeRef.current) {
      const interval = setInterval(() => {
        const e = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLive]);

  // ─── Poll viewer count ─────────────────────────────────────────────
  useEffect(() => {
    if (isLive && streamData?.id) {
      const interval = setInterval(async () => {
        try {
          const streams = await api.getActiveMarketLiveStreams();
          const current = streams.find((s: any) => s.id === streamData.id);
          if (current) setViewerCount(current.viewer_count);
        } catch {}
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isLive, streamData]);

  const flipCamera = () => {
    setCameraType(prev => prev === 'front' ? 'back' : 'front');
  };

  const toggleMic = () => setMicOn(prev => !prev);

  const handleStartStream = async () => {
    setStarting(true);
    try {
      const stream = await api.startMarketLiveStream({
        title: route?.params?.title || `بث ${user?.name || ''}`,
        productName: route?.params?.productName,
        productPrice: route?.params?.productPrice,
      });
      setStreamData(stream);
      setIsLive(true);
      startTimeRef.current = Date.now();
      Alert.alert('بدأ البث! 🎥', 'أنت الآن تبث مباشر');
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل بدء البث');
    } finally {
      setStarting(false);
    }
  };

  const handleEndStream = () => {
    Alert.alert(
      'إنهاء البث',
      'هل تريد إنهاء البث؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إنهاء',
          style: 'destructive',
          onPress: async () => {
            if (streamData?.id) {
              try { await api.endMarketLiveStream(streamData.id); } catch {}
            }
            setIsLive(false);
            setStreamData(null);
            setElapsedTime('00:00');
            setViewerCount(0);
            startTimeRef.current = 0;
            Alert.alert('تم', 'تم إنهاء البث', [
              { text: 'حسناً', onPress: () => navigation?.goBack?.() },
            ]);
          },
        },
      ]
    );
  };

  if (hasPermission === null) {
    return (
      <View style={styles.loadingContainer}>
        <Loader2 color="#f97316" size={32} />
        <Text style={styles.loadingText}>جارٍ طلب الإذن...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>تم رفض إذن الكاميرا</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation?.goBack?.()}>
          <Text style={styles.closeBtnText}>إغلاق</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Camera Preview (full screen) */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={cameraType}
        mode="video"
        mute={!micOn}
      />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation?.goBack?.()}>
          <X color="#fff" size={22} />
        </TouchableOpacity>

        {isLive ? (
          <View style={styles.liveStats}>
            <View style={styles.liveBadge}>
              <Radio color="#fff" size={12} />
              <Text style={styles.liveBadgeText}>مباشر</Text>
            </View>
            <Text style={styles.timerText}>{elapsedTime}</Text>
            <View style={styles.viewerBadge}>
              <Users color="#fff" size={12} />
              <Text style={styles.viewerText}>{viewerCount}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.previewText}>معاينة الكاميرا</Text>
        )}
      </View>

      {/* Right Controls (camera flip + mic) */}
      <View style={styles.rightControls}>
        <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
          <SwitchCamera color="#fff" size={22} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlBtn, !micOn && styles.controlBtnDanger]}
          onPress={toggleMic}
        >
          {micOn ? <Mic color="#fff" size={22} /> : <MicOff color="#fff" size={22} />}
        </TouchableOpacity>
      </View>

      {/* Bottom: Start/End Stream */}
      <View style={styles.bottomBar}>
        {!isLive ? (
          <TouchableOpacity
            style={[styles.startBtn, starting && styles.startBtnDisabled]}
            onPress={handleStartStream}
            disabled={starting}
          >
            {starting ? (
              <Loader2 color="#fff" size={20} />
            ) : (
              <>
                <Radio color="#fff" size={20} />
                <Text style={styles.startBtnText}>بدء البث المباشر</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.endBtn} onPress={handleEndStream}>
            <X color="#fff" size={20} />
            <Text style={styles.endBtnText}>إنهاء البث</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#94a3b8', fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  closeBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  camera: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  liveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  timerText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  viewerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  viewerText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rightControls: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -50 }],
    gap: 12,
    zIndex: 10,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnDanger: { backgroundColor: '#ef4444' },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    borderRadius: 14,
    paddingVertical: 16,
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 16,
  },
  endBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
