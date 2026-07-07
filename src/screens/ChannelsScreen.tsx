// ─── Channels Screen (TikTok-style vertical feed + inline live broadcast) ─
// Full-screen live streams + recorded videos in a vertical scrolling feed.
// Right-side action bar: avatar+follow, like, comment, save, gift, share.
// Bottom: host info card (avatar, name, verified, followers, follow + msg).
// Top: LIVE badge + close button.
// ✅ Backend wired: /api/streams/* (feed, like, save, share, gift, chat, follow)
// ✅ Inline broadcast: camera opens IN THIS SCREEN (no separate page)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, Dimensions,
  TouchableOpacity, Image, Modal, TextInput, ScrollView,
  ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType, CameraView } from 'expo-camera';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Radio, X, Heart, MessageCircle, Bookmark, Share2,
  UserPlus, Mail, BadgeCheck, Gift, Video, Play, Eye,
  ChevronUp, ChevronDown, SwitchCamera, Mic, MicOff, Loader2,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

// ─── Gift catalog (will be fetched from /api/channels/gifts/catalog) ──
const GIFT_CATALOG = [
  { id: 'heart',   icon: '❤️', name: 'قلب',     amount: 5 },
  { id: 'rose',    icon: '🌹', name: 'وردة',    amount: 10 },
  { id: 'star',    icon: '⭐', name: 'نجمة',    amount: 25 },
  { id: 'coffee',  icon: '☕', name: 'قهوة',    amount: 50 },
  { id: 'fire',    icon: '🔥', name: 'نار',     amount: 100 },
  { id: 'rocket',  icon: '🚀', name: 'صاروخ',  amount: 250 },
  { id: 'crown',   icon: '👑', name: 'تاج',     amount: 500 },
  { id: 'diamond', icon: '💎', name: 'ماس',     amount: 1000 },
];

interface StreamItem {
  id: string;
  type: 'live' | 'video';
  title: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  hostVerified?: boolean;
  followersCount?: number;
  isFollowing?: boolean;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  viewers?: number;
}

// Empty mock — UI shows empty state until backend is ready
const MOCK_STREAMS: StreamItem[] = [];

export default function ChannelsScreen({ navigation }: any) {
  const { user } = useAuth();
  const [streams, setStreams] = useState<StreamItem[]>(MOCK_STREAMS);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [engagement, setEngagement] = useState<Record<string, { liked: boolean; saved: boolean; likes: number; saves: number; comments: number; shares: number }>>({});
  const [followState, setFollowState] = useState<Record<string, boolean>>({});

  // Gift modal
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [giftSending, setGiftSending] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Floating gifts animation (viewer sees these when sending a gift)
  const [floatingGifts, setFloatingGifts] = useState<{ id: number; icon: string; name: string }[]>([]);
  // Floating hearts animation (when liking)
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  // Stream gifts ticker (shows recent gifts from all viewers on the stream)
  const [streamGiftsTicker, setStreamGiftsTicker] = useState<{ id: string; icon: string; name: string; sender: string }[]>([]);
  const [seenTickerGiftIds, setSeenTickerGiftIds] = useState<Set<string>>(new Set());
  // Total gifts counter for current stream
  const [totalGifts, setTotalGifts] = useState(0);

  // Chat panel
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; user: string; text: string }[]>([]);
  const [chatText, setChatText] = useState('');

  // Stream title/description editor (broadcast mode)
  const [streamTitle, setStreamTitle] = useState('');

  // ═══ Inline broadcast state (camera opens IN this screen) ═══
  const [broadcastMode, setBroadcastMode] = useState(false);  // true = showing camera
  const [hasCameraPerm, setHasCameraPerm] = useState<boolean | null>(null);
  const [cameraType, setCameraType] = useState<CameraType>('front');
  const [micOn, setMicOn] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [startingStream, setStartingStream] = useState(false);
  const [myStream, setMyStream] = useState<any>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [viewerCount, setViewerCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const startTimeRef = useRef(0);
  const [hostGifts, setHostGifts] = useState<{ id: number; icon: string; name: string; amount: number; sender: string }[]>([]);
  const [seenGiftIds, setSeenGiftIds] = useState<Set<string>>(new Set());

  // ─── Load feed ─────────────────────────────────────────────────────
  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getStreamsFeed();
      setStreams(data.streams || []);
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Auto-refresh feed every 30s
  useEffect(() => {
    const interval = setInterval(() => loadFeed(), 30000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  // Fetch wallet balance when gift modal opens
  useEffect(() => {
    if (showGiftModal) {
      api.getWalletBalance()
        .then((w: any) => setWalletBalance(w?.balance ?? 0))
        .catch(() => setWalletBalance(0));
    }
  }, [showGiftModal]);

  const currentStream = streams[currentIndex];

  // ─── Engagement handlers ───────────────────────────────────────────
  const handleLike = async () => {
    if (!currentStream) return;
    // Spawn floating heart animation
    const heartId = Date.now() + Math.random();
    setFloatingHearts(prev => [...prev, heartId]);
    setTimeout(() => setFloatingHearts(prev => prev.filter(h => h !== heartId)), 3000);
    try {
      const result = await api.likeStream(currentStream.id);
      setEngagement(prev => ({
        ...prev,
        [currentStream.id]: {
          ...((prev[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares })),
          liked: result.liked,
          likes: result.likes,
        },
      }));
    } catch {}
  };

  const handleSave = async () => {
    if (!currentStream) return;
    try {
      const result = await api.saveStream(currentStream.id);
      setEngagement(prev => ({
        ...prev,
        [currentStream.id]: {
          ...((prev[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares })),
          saved: result.saved,
          saves: result.saves,
        },
      }));
    } catch {}
  };

  const handleShare = async () => {
    if (!currentStream) return;
    try {
      await api.shareStream(currentStream.id);
    } catch {}
    try {
      const Share = require('react-native').Share;
      await Share.share({ message: `${currentStream.title}\nhttps://safwatkhokha-nawaqes.hf.space` });
    } catch {}
  };

  const handleFollow = async () => {
    if (!currentStream) return;
    const wasFollowing = followState[currentStream.hostId] ?? currentStream.isFollowing;
    setFollowState(prev => ({ ...prev, [currentStream.hostId]: !wasFollowing }));
    try {
      if (wasFollowing) {
        await api.unfollowUser(currentStream.hostId);
      } else {
        await api.followUser(currentStream.hostId);
      }
    } catch {
      setFollowState(prev => ({ ...prev, [currentStream.hostId]: wasFollowing }));
    }
  };

  const handleMessage = async () => {
    if (!currentStream) return;
    try {
      const res = await api.client.post('/chat/start', { userId: currentStream.hostId });
      const chatId = res.data?.id || res.data?.chatId;
      if (chatId) navigation?.navigate?.('ChatConversation', { chatId });
    } catch {}
  };

  const handleSendGift = async (gift: typeof GIFT_CATALOG[0]) => {
    if (!currentStream) return;
    if (walletBalance !== null && walletBalance < gift.amount) {
      Alert.alert('رصيد غير كافٍ', `تحتاج ${gift.amount} ج.م — رصيدك: ${walletBalance} ج.م`);
      return;
    }
    setGiftSending(true);
    try {
      const result = await api.sendStreamGift(currentStream.id, gift.id);
      if (typeof result?.newBalance === 'number') setWalletBalance(result.newBalance);
      // Floating gift animation (viewer's own gift)
      const id = Date.now() + Math.random();
      setFloatingGifts(prev => [...prev, { id, icon: gift.icon, name: gift.name }]);
      setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== id)), 4000);
      // Add to gifts ticker (visible to all)
      setStreamGiftsTicker(prev => [...prev, {
        id: 'self_' + id, icon: gift.icon, name: gift.name, sender: user?.name || 'أنت',
      }].slice(-5));
      setTotalGifts(prev => prev + 1);
      setShowGiftModal(false);
      Alert.alert('تم ✓', `تم إرسال ${gift.icon} ${gift.name}!`);
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل إرسال الهدية');
    } finally { setGiftSending(false); }
  };

  const handleSendChat = async () => {
    if (!chatText.trim() || !currentStream) return;
    const text = chatText.trim();
    setChatText('');
    try {
      const msg = await api.sendStreamChat(currentStream.id, text);
      setChatMessages(prev => [...prev, msg]);
    } catch {
      setChatText(text);
    }
  };

  // Load chat when panel opens
  useEffect(() => {
    if (showChat && currentStream) {
      api.getStreamChat(currentStream.id)
        .then((msgs: any) => setChatMessages(msgs || []))
        .catch(() => setChatMessages([]));
    }
  }, [showChat, currentStream?.id]);

  // ═══ Poll stream gifts ticker (viewer sees gifts from ALL viewers) ═══
  useEffect(() => {
    if (!currentStream || broadcastMode) return;
    const interval = setInterval(async () => {
      try {
        const gifts = await api.getStreamGifts(currentStream.id).catch(() => []);
        const giftsArr = (gifts as any[]) || [];
        // Update total gifts count
        if (giftsArr.length > 0) {
          setTotalGifts(giftsArr.length);
        }
        // Find new gifts not in ticker
        const newGifts = giftsArr.filter((g: any) => !seenTickerGiftIds.has(g.id));
        if (newGifts.length > 0) {
          setSeenTickerGiftIds(prev => {
            const next = new Set(prev);
            newGifts.forEach(g => next.add(g.id));
            return next;
          });
          // Add to ticker (skip own gifts — they're already added in handleSendGift)
          const tickerAdditions = newGifts
            .filter((g: any) => g.sender_id !== user?.id)
            .map((g: any) => ({
              id: g.id,
              icon: g.gift_icon || '🎁',
              name: g.gift_name || 'هدية',
              sender: g.sender_name || 'مشاهد',
            }));
          if (tickerAdditions.length > 0) {
            setStreamGiftsTicker(prev => [...prev, ...tickerAdditions].slice(-5));
          }
        }
      } catch {}
    }, 4000); // poll every 4s
    return () => clearInterval(interval);
  }, [currentStream?.id, broadcastMode, seenTickerGiftIds, user?.id]);

  // ═══ BROADCAST HANDLERS (inline camera, no separate page) ══════════
  const enterBroadcastMode = async () => {
    try {
      const camPerm = await Camera.requestCameraPermissionsAsync();
      const micPerm = await Camera.requestMicrophonePermissionsAsync();
      if (!camPerm.granted || !micPerm.granted) {
        Alert.alert('إذن مطلوب', 'يحتاج البث إلى إذن الكاميرا والميكروفون');
        return;
      }
      setHasCameraPerm(true);
      setBroadcastMode(true);
    } catch {
      Alert.alert('خطأ', 'تعذر الوصول للكاميرا');
    }
  };

  const exitBroadcastMode = async () => {
    if (isLive && myStream?.id) {
      try { await api.endStream(myStream.id); } catch {}
    }
    setBroadcastMode(false);
    setIsLive(false);
    setMyStream(null);
    setElapsedTime('00:00');
    setViewerCount(0);
    setHostGifts([]);
    setSeenGiftIds(new Set());
    startTimeRef.current = 0;
    loadFeed();
  };

  const flipCamera = () => setCameraType(prev => prev === 'front' ? 'back' : 'front');
  const toggleMic = () => setMicOn(prev => !prev);

  const handleStartStream = async () => {
    setStartingStream(true);
    try {
      const stream = await api.startStream({
        title: streamTitle.trim() || `بث ${user?.name || ''}`,
      });
      setMyStream(stream);
      setIsLive(true);
      startTimeRef.current = Date.now();
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل بدء البث');
    } finally {
      setStartingStream(false);
    }
  };

  const handleEndStream = () => {
    Alert.alert('إنهاء البث', 'هل تريد إنهاء البث؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إنهاء', style: 'destructive', onPress: () => exitBroadcastMode() },
    ]);
  };

  // Timer when live
  useEffect(() => {
    if (isLive && startTimeRef.current) {
      const interval = setInterval(() => {
        const e = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsedTime(`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLive]);

  // Poll viewer count + gifts + chat while live (host side)
  useEffect(() => {
    if (!isLive || !myStream?.id) return;
    const interval = setInterval(async () => {
      try {
        const stream = await api.getStream(myStream.id);
        if (stream) setViewerCount(stream.viewers || 0);
        // New gifts — use seenGiftIds to never miss any
        const gifts = await api.getStreamGifts(myStream.id).catch(() => []);
        const newGifts = (gifts as any[]).filter((g: any) => !seenGiftIds.has(g.id));
        if (newGifts.length > 0) {
          setSeenGiftIds(prev => {
            const next = new Set(prev);
            newGifts.forEach(g => next.add(g.id));
            return next;
          });
          newGifts.forEach((g: any, idx: number) => {
            const giftId = Date.now() + Math.random() + idx;
            setTimeout(() => {
              setHostGifts(prev => [...prev, {
                id: giftId, icon: g.gift_icon || '🎁', name: g.gift_name || 'هدية',
                amount: g.amount || 0, sender: g.sender_name || 'مشاهد',
              }]);
              setTimeout(() => setHostGifts(prev => prev.filter(x => x.id !== giftId)), 4000);
            }, idx * 500);
          });
        }
        // New chat — use seenChatIds for robustness
        const chat = await api.getStreamChat(myStream.id).catch(() => []);
        const chatArr = (chat as any[]) || [];
        const newMsgs = chatArr.filter((m: any) => !seenGiftIds.has('chat_' + m.id));
        if (newMsgs.length > 0) {
          setSeenGiftIds(prev => {
            const next = new Set(prev);
            newMsgs.forEach(m => next.add('chat_' + m.id));
            return next;
          });
          setChatMessages(prev => {
            const updated = [...prev, ...newMsgs.map((m: any) => ({
              id: m.id, user: m.user || m.user_name || 'مشاهد', text: m.text,
            }))];
            return updated.slice(-10); // keep last 10
          });
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [isLive, myStream, seenGiftIds]);

  // ─── Vertical scroll handler (snap to next stream) ─────────────────
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / height);
    if (idx !== currentIndex && idx >= 0 && idx < streams.length) {
      setCurrentIndex(idx);
      setShowChat(false);
    }
  }, [currentIndex, streams.length]);

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  };

  // ─── Render single stream (full-screen) ────────────────────────────
  const renderStream = ({ item }: { item: StreamItem }) => {
    const eng = engagement[item.id];
    const isFollowing = followState[item.hostId];
    const likes = eng?.likes ?? item.likes;
    const saves = eng?.saves ?? item.saves;
    const comments = eng?.comments ?? item.comments;
    const shares = eng?.shares ?? item.shares;
    const liked = eng?.liked;
    const saved = eng?.saved;

    return (
      <View style={styles.streamContainer}>
        {/* Background video / thumbnail */}
        {item.videoUrl ? (
          <Image source={{ uri: item.thumbnailUrl || item.videoUrl }} style={styles.backgroundImage} resizeMode="cover" />
        ) : item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.backgroundImage} resizeMode="cover" />
        ) : (
          <View style={styles.backgroundFallback} />
        )}
        {/* Dark overlay */}
        <View style={styles.darkOverlay} />

        {/* ═══ Top bar ═══ */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBtn} onPress={() => navigation?.goBack?.()}>
            <X color="#fff" size={22} />
          </TouchableOpacity>
          <View style={styles.liveBadge}>
            <Radio color="#fff" size={12} />
            <Text style={styles.liveText}>مباشر</Text>
            {item.viewers !== undefined && (
              <Text style={styles.viewerText}>· {formatCount(item.viewers)}</Text>
            )}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ═══ Right-side vertical action bar (TikTok style) ═══ */}
        <View style={styles.rightBar}>
          {/* Avatar + follow */}
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: item.hostAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.hostId}` }}
              style={styles.avatar}
            />
            {!isFollowing && (
              <TouchableOpacity style={styles.followPlusBtn} onPress={handleFollow}>
                <UserPlus color="#fff" size={12} />
              </TouchableOpacity>
            )}
          </View>

          {/* Like */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
            <View style={styles.actionCircle}>
              <Heart color={liked ? '#ef4444' : '#fff'} size={26} fill={liked ? '#ef4444' : 'transparent'} />
            </View>
            <Text style={styles.actionText}>{formatCount(likes)}</Text>
          </TouchableOpacity>

          {/* Comment */}
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowChat(true)}>
            <View style={styles.actionCircle}>
              <MessageCircle color="#fff" size={26} />
            </View>
            <Text style={styles.actionText}>{formatCount(comments)}</Text>
          </TouchableOpacity>

          {/* Save */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
            <View style={styles.actionCircle}>
              <Bookmark color={saved ? '#facc15' : '#fff'} size={26} fill={saved ? '#facc15' : 'transparent'} />
            </View>
            <Text style={styles.actionText}>{formatCount(saves)}</Text>
          </TouchableOpacity>

          {/* Gift */}
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowGiftModal(true)}>
            <View style={[styles.actionCircle, { backgroundColor: 'rgba(168,85,247,0.9)' }]}>
              <Gift color="#fff" size={26} />
            </View>
            <Text style={styles.actionText}>هدية</Text>
          </TouchableOpacity>

          {/* Share */}
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <View style={styles.actionCircle}>
              <Share2 color="#fff" size={26} />
            </View>
            <Text style={styles.actionText}>{formatCount(shares)}</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ Floating gifts (viewer's own gifts animation) ═══ */}
        {floatingGifts.map(g => (
          <View key={g.id} style={styles.floatingGift}>
            <Text style={styles.floatingGiftIcon}>{g.icon}</Text>
            <View style={styles.floatingGiftLabel}>
              <Text style={styles.floatingGiftText}>{g.name}</Text>
            </View>
          </View>
        ))}

        {/* ═══ Floating hearts (like animation) ═══ */}
        {floatingHearts.map(id => (
          <View key={id} style={styles.floatingHeart}>
            <Text style={{ fontSize: 32 }}>❤️</Text>
          </View>
        ))}

        {/* ═══ Gifts ticker (top-left, shows recent gifts from all viewers) ═══ */}
        {streamGiftsTicker.length > 0 && (
          <View style={styles.giftsTicker}>
            {streamGiftsTicker.map((g) => (
              <View key={g.id} style={styles.tickerItem}>
                <Text style={styles.tickerIcon}>{g.icon}</Text>
                <Text style={styles.tickerText} numberOfLines={1}>
                  <Text style={styles.tickerSender}>{g.sender}</Text> أرسل {g.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ Total gifts badge (top-center, below LIVE badge) ═══ */}
        {totalGifts > 0 && (
          <View style={styles.totalGiftsBadge}>
            <Gift color="#fbbf24" size={12} />
            <Text style={styles.totalGiftsText}>{totalGifts} هدية</Text>
          </View>
        )}

        {/* ═══ Bottom host info card ═══ */}
        <View style={styles.bottomCard}>
          <View style={styles.hostRow}>
            <Image
              source={{ uri: item.hostAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.hostId}` }}
              style={styles.hostAvatar}
            />
            <View style={styles.hostInfo}>
              <View style={styles.hostNameRow}>
                <Text style={styles.hostName} numberOfLines={1}>@{item.hostName}</Text>
                {item.hostVerified ? <BadgeCheck color="#3b82f6" size={14} /> : null}
              </View>
              <Text style={styles.hostFollowers}>{formatCount(item.followersCount ?? 0)} متابع</Text>
            </View>
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
              onPress={handleFollow}
            >
              <Text style={styles.followText}>{isFollowing ? 'متابَع' : 'متابعة'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageBtn} onPress={handleMessage}>
              <Mail color="#fff" size={14} />
            </TouchableOpacity>
          </View>
          {item.title ? <Text style={styles.streamTitle} numberOfLines={2}>{item.title}</Text> : null}
          {item.description ? <Text style={styles.streamDesc} numberOfLines={2}>{item.description}</Text> : null}
        </View>
      </View>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* ═══ BROADCAST MODE (camera inline, same screen) ═══ */}
      {broadcastMode ? (
        <View style={styles.broadcastContainer}>
          {/* Camera preview fills the screen */}
          {hasCameraPerm && (
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing={cameraType}
              mode="video"
              mute={!micOn}
            />
          )}

          {/* Top bar: close + live badge + timer + viewers */}
          <View style={styles.broadcastTopBar}>
            <TouchableOpacity style={styles.broadcastCloseBtn} onPress={exitBroadcastMode}>
              <X color="#fff" size={22} />
            </TouchableOpacity>
            {isLive ? (
              <View style={styles.broadcastLiveStats}>
                <View style={styles.broadcastLiveBadge}>
                  <Radio color="#fff" size={12} />
                  <Text style={styles.broadcastLiveText}>مباشر</Text>
                </View>
                <Text style={styles.broadcastTimer}>{elapsedTime}</Text>
                <View style={styles.broadcastViewerBadge}>
                  <Eye color="#fff" size={12} />
                  <Text style={styles.broadcastViewerText}>{viewerCount}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.broadcastPreviewText}>معاينة الكاميرا</Text>
            )}
          </View>

          {/* Right controls: flip camera + mic */}
          <View style={styles.broadcastRightControls}>
            <TouchableOpacity style={styles.broadcastControlBtn} onPress={flipCamera}>
              <SwitchCamera color="#fff" size={22} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.broadcastControlBtn, !micOn && styles.broadcastControlBtnDanger]}
              onPress={toggleMic}
            >
              {micOn ? <Mic color="#fff" size={22} /> : <MicOff color="#fff" size={22} />}
            </TouchableOpacity>
          </View>

          {/* Chat overlay (host sees incoming chat) */}
          {isLive && chatMessages.length > 0 && (
            <View style={styles.broadcastChatOverlay}>
              {chatMessages.slice(-5).map((msg, idx) => (
                <View key={msg.id || idx} style={styles.broadcastChatMsg}>
                  <Text style={styles.broadcastChatUser}>{msg.user}:</Text>
                  <Text style={styles.broadcastChatText}>{msg.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Incoming gifts overlay */}
          {hostGifts.map(g => (
            <View key={g.id} style={styles.broadcastGiftOverlay}>
              <Text style={styles.broadcastGiftIcon}>{g.icon}</Text>
              <View style={styles.broadcastGiftInfo}>
                <Text style={styles.broadcastGiftText}>{g.sender} أرسل {g.name}</Text>
                <Text style={styles.broadcastGiftAmount}>{g.amount} ج.م</Text>
              </View>
            </View>
          ))}

          {/* Bottom: host info + start/end button */}
          <View style={styles.broadcastBottomBar}>
            {/* Host info (same style as viewer feed) */}
            <View style={styles.hostRow}>
              <Image
                source={{ uri: user?.avatar ? (user.avatar.startsWith('http') ? user.avatar : `https://safwatkhokha-nawaqes.hf.space${user.avatar}`) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'me'}` }}
                style={styles.hostAvatar}
              />
              <View style={styles.hostInfo}>
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostName} numberOfLines={1}>@{user?.name || 'مستخدم'}</Text>
                  {user?.is_verified ? <BadgeCheck color="#3b82f6" size={14} /> : null}
                </View>
                <Text style={styles.hostFollowers}>أنت تبث الآن</Text>
              </View>
            </View>

            {/* Title input (before going live) */}
            {!isLive ? (
              <TextInput
                style={styles.titleInput}
                placeholder="عنوان البث (اختياري)..."
                placeholderTextColor="#94a3b8"
                value={streamTitle}
                onChangeText={setStreamTitle}
                maxLength={100}
              />
            ) : null}

            {/* Start/End button */}
            {!isLive ? (
              <TouchableOpacity
                style={[styles.broadcastStartBtn, startingStream && styles.broadcastStartBtnDisabled]}
                onPress={handleStartStream}
                disabled={startingStream}
              >
                {startingStream ? (
                  <Loader2 color="#fff" size={20} />
                ) : (
                  <>
                    <Radio color="#fff" size={20} />
                    <Text style={styles.broadcastStartBtnText}>بدء البث المباشر</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.broadcastEndBtn} onPress={handleEndStream}>
                <X color="#fff" size={20} />
                <Text style={styles.broadcastEndBtnText}>إنهاء البث</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
      /* ═══ NORMAL FEED MODE (viewer) ═══ */
      <>
      {streams.length === 0 && !loading ? (
        // ═══ Empty state ═══
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Radio color="#a855f7" size={48} />
          </View>
          <Text style={styles.emptyTitle}>لا يوجد بث مباشر الآن</Text>
          <Text style={styles.emptySub}>كن أول من يبدأ البث على نواقص!</Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={enterBroadcastMode}
          >
            <Video color="#fff" size={18} />
            <Text style={styles.startBtnText}>ابدأ بثك المباشر</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#a855f7" size="large" />
        </View>
      ) : (
        // ═══ Vertical feed (TikTok-style snap scroll) ═══
        <FlatList
          data={streams}
          keyExtractor={(item) => item.id}
          renderItem={renderStream}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        />
      )}

      {/* ═══ Floating "Go Live" button (always visible in feed mode) ═══ */}
      <TouchableOpacity
        style={styles.goLiveBtn}
        onPress={enterBroadcastMode}
      >
        <Video color="#fff" size={20} />
        <Text style={styles.goLiveBtnText}>بث مباشر</Text>
      </TouchableOpacity>
      </>  // close fragment for feed mode
      )}

      {/* ═══ Chat panel (slide-up) ═══ */}
      <Modal visible={showChat} transparent animationType="slide">
        <View style={styles.chatOverlay}>
          <View style={styles.chatPanel}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>التعليقات ({chatMessages.length})</Text>
              <TouchableOpacity onPress={() => setShowChat(false)}>
                <X color="#94a3b8" size={22} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.chatMessages}>
              {chatMessages.length === 0 ? (
                <Text style={styles.chatEmpty}>لا توجد تعليقات بعد — كن أول من يعلق!</Text>
              ) : (
                chatMessages.map(msg => (
                  <View key={msg.id} style={styles.chatMsg}>
                    <Text style={styles.chatMsgUser}>{msg.user}</Text>
                    <Text style={styles.chatMsgText}>{msg.text}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.chatInputBar}>
              <TextInput
                style={styles.chatInput}
                placeholder="أضف تعليقاً..."
                placeholderTextColor="#64748b"
                value={chatText}
                onChangeText={setChatText}
                onSubmitEditing={handleSendChat}
              />
              <TouchableOpacity style={styles.chatSendBtn} onPress={handleSendChat}>
                <MessageCircle color="#fff" size={18} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Gift modal ═══ */}
      <Modal visible={showGiftModal} transparent animationType="slide">
        <View style={styles.giftOverlay}>
          <View style={styles.giftPanel}>
            <View style={styles.giftHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Gift color="#a855f7" size={18} />
                <Text style={styles.giftTitle}>
                  إرسال هدية{currentStream ? ` إلى @${currentStream.hostName}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.walletPill}>
                  <Text style={styles.walletText}>رصيدك: {walletBalance ?? '...'} ج.م</Text>
                </View>
                <TouchableOpacity onPress={() => setShowGiftModal(false)}>
                  <X color="#94a3b8" size={22} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.giftGrid}>
              {GIFT_CATALOG.map(gift => {
                const canAfford = walletBalance === null || walletBalance >= gift.amount;
                return (
                  <TouchableOpacity
                    key={gift.id}
                    style={[styles.giftItem, !canAfford && styles.giftItemDisabled]}
                    disabled={!canAfford || giftSending}
                    onPress={() => handleSendGift(gift)}
                  >
                    <Text style={styles.giftIcon}>{gift.icon}</Text>
                    <Text style={styles.giftName}>{gift.name}</Text>
                    <Text style={styles.giftPrice}>{gift.amount} ج.م</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  // Stream container (full screen)
  streamContainer: { width, height, position: 'relative' },
  backgroundImage: { width: '100%', height: '100%', backgroundColor: '#1e1e2e' },
  backgroundFallback: { width: '100%', height: '100%', backgroundColor: '#1a1a2e' },
  darkOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  // Top bar
  topBar: {
    position: 'absolute', top: 50, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, zIndex: 20,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
  },
  liveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  viewerText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' },
  // Right action bar
  rightBar: {
    position: 'absolute', right: 12, bottom: 140, alignItems: 'center', gap: 16, zIndex: 20,
  },
  avatarWrap: { position: 'relative', marginBottom: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#fff', backgroundColor: '#334155' },
  followPlusBtn: {
    position: 'absolute', bottom: -8, left: '50%', transform: [{ translateX: -12 }],
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#a855f7',
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  // Floating gifts
  floatingGift: {
    position: 'absolute', left: '50%', top: '40%',
    transform: [{ translateX: -40 }], alignItems: 'center', zIndex: 30,
  },
  floatingGiftIcon: { fontSize: 60 },
  floatingGiftLabel: { marginTop: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  floatingGiftText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  // Floating hearts (like animation)
  floatingHeart: {
    position: 'absolute', right: 70, bottom: 200, zIndex: 25,
  },
  // Gifts ticker (top-left)
  giftsTicker: {
    position: 'absolute', top: 100, left: 12, right: 70, zIndex: 18, gap: 4,
  },
  tickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, alignSelf: 'flex-start', maxWidth: '100%',
  },
  tickerIcon: { fontSize: 16 },
  tickerText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  tickerSender: { color: '#fbbf24', fontWeight: '800' },
  // Total gifts badge
  totalGiftsBadge: {
    position: 'absolute', top: 90, left: '50%', transform: [{ translateX: -50 }],
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(251,191,36,0.2)', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 14, zIndex: 17,
  },
  totalGiftsText: { color: '#fbbf24', fontSize: 11, fontWeight: '800' },
  // Title input (broadcast mode)
  titleInput: {
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 14, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  // Bottom host info card
  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 24, zIndex: 20,
    backgroundColor: 'transparent',
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  hostAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#a855f7', backgroundColor: '#334155' },
  hostInfo: { flex: 1, minWidth: 0 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hostName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  hostFollowers: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
  followBtn: {
    backgroundColor: '#a855f7', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
  },
  followingBtn: { backgroundColor: '#475569' },
  followText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  messageBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
  },
  streamTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  streamDesc: { color: '#cbd5e1', fontSize: 12 },
  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(168,85,247,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 8 },
  emptySub: { color: '#94a3b8', fontSize: 14, marginBottom: 32, textAlign: 'center' },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#a855f7', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16,
  },
  startBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  // Floating Go Live button
  goLiveBtn: {
    position: 'absolute', bottom: 30, right: 16, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ef4444', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  goLiveBtnText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  // Loading
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Chat panel
  chatOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  chatPanel: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  chatTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  chatMessages: { padding: 16, maxHeight: 350 },
  chatEmpty: { color: '#64748b', textAlign: 'center', paddingVertical: 32, fontSize: 13 },
  chatMsg: { marginBottom: 12 },
  chatMsgUser: { color: '#a855f7', fontSize: 12, fontWeight: '800', marginBottom: 2 },
  chatMsgText: { color: '#fff', fontSize: 14 },
  chatInputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  chatInput: {
    flex: 1, backgroundColor: '#0f172a', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#334155',
  },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#a855f7', alignItems: 'center', justifyContent: 'center' },
  // Gift modal
  giftOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  giftPanel: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 20 },
  giftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  giftTitle: { color: '#fff', fontSize: 14, fontWeight: '900', flex: 1 },
  walletPill: { backgroundColor: 'rgba(168,85,247,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  walletText: { color: '#a855f7', fontSize: 11, fontWeight: '700' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  giftItem: { width: (width - 56) / 4, alignItems: 'center', gap: 4, backgroundColor: '#0f172a', borderRadius: 12, padding: 10 },
  giftItemDisabled: { opacity: 0.4 },
  giftIcon: { fontSize: 28 },
  giftName: { color: '#fff', fontSize: 10, fontWeight: '700' },
  giftPrice: { color: '#a855f7', fontSize: 10, fontWeight: '800' },
  // ═══ Broadcast mode styles (inline camera) ═══
  broadcastContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  broadcastTopBar: {
    position: 'absolute', top: 50, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, zIndex: 10,
  },
  broadcastCloseBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  broadcastPreviewText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  broadcastLiveStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  broadcastLiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  broadcastLiveText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  broadcastTimer: { color: '#fff', fontSize: 13, fontWeight: '700' },
  broadcastViewerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  broadcastViewerText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  broadcastRightControls: {
    position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -50 }],
    gap: 12, zIndex: 10,
  },
  broadcastControlBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  broadcastControlBtnDanger: { backgroundColor: '#ef4444' },
  broadcastChatOverlay: {
    position: 'absolute', top: 120, left: 12, right: 80, zIndex: 15, gap: 4,
  },
  broadcastChatMsg: {
    flexDirection: 'row', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, alignSelf: 'flex-start', flexWrap: 'wrap',
  },
  broadcastChatUser: { color: '#a855f7', fontSize: 11, fontWeight: '700' },
  broadcastChatText: { color: '#fff', fontSize: 11 },
  broadcastGiftOverlay: {
    position: 'absolute', top: 200, left: '50%', transform: [{ translateX: -100 }],
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(168,85,247,0.85)', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, zIndex: 50,
  },
  broadcastGiftIcon: { fontSize: 32 },
  broadcastGiftInfo: { alignItems: 'flex-start' },
  broadcastGiftText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  broadcastGiftAmount: { color: '#fbbf24', fontSize: 12, fontWeight: '900' },
  broadcastBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 24, zIndex: 20,
  },
  broadcastStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 16, marginTop: 12,
  },
  broadcastStartBtnDisabled: { opacity: 0.6 },
  broadcastStartBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  broadcastEndBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#dc2626', borderRadius: 14, paddingVertical: 16, marginTop: 12,
  },
  broadcastEndBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
