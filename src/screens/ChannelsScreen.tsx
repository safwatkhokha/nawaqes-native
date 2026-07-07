// ─── Channels Screen (TikTok-style vertical feed) ────────────────────
// Full-screen live streams + recorded videos in a vertical scrolling feed.
// Right-side action bar: avatar+follow, like, comment, save, gift, share.
// Bottom: host info card (avatar, name, verified, followers, follow + msg).
// Top: LIVE badge + close button.
//
// 🔧 Backend is being rebuilt — uses mock empty data until /api/channels/feed
//    is implemented. All engagement actions are in-memory only.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, Dimensions,
  TouchableOpacity, Image, Modal, TextInput, ScrollView,
  ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Radio, X, Heart, MessageCircle, Bookmark, Share2,
  UserPlus, Mail, BadgeCheck, Gift, Video, Play, Eye,
  ChevronUp, ChevronDown,
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

  // Floating gifts animation
  const [floatingGifts, setFloatingGifts] = useState<{ id: number; icon: string; name: string }[]>([]);

  // Chat panel
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; user: string; text: string }[]>([]);
  const [chatText, setChatText] = useState('');

  // ─── Load feed ─────────────────────────────────────────────────────
  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // 🔧 TODO: const data = await api.getChannelsFeed();
      setStreams(MOCK_STREAMS);
    } catch {
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

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
  const handleLike = () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    const liked = !cur.liked;
    setEngagement(prev => ({ ...prev, [currentStream.id]: { ...cur, liked, likes: cur.likes + (liked ? 1 : -1) } }));
  };

  const handleSave = () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    const saved = !cur.saved;
    setEngagement(prev => ({ ...prev, [currentStream.id]: { ...cur, saved, saves: cur.saves + (saved ? 1 : -1) } }));
  };

  const handleShare = () => {
    if (!currentStream) return;
    const cur = engagement[currentStream.id] || { liked: false, saved: false, likes: currentStream.likes, saves: currentStream.saves, comments: currentStream.comments, shares: currentStream.shares };
    setEngagement(prev => ({ ...prev, [currentStream.id]: { ...cur, shares: cur.shares + 1 } }));
    try {
      const Share = require('react-native').Share;
      Share.share({ message: `${currentStream.title}\nhttps://safwatkhokha-nawaqes.hf.space` });
    } catch {}
  };

  const handleFollow = () => {
    if (!currentStream) return;
    setFollowState(prev => ({ ...prev, [currentStream.hostId]: !prev[currentStream.hostId] }));
  };

  const handleMessage = () => {
    if (!currentStream) return;
    // 🔧 TODO: open chat with host
  };

  const handleSendGift = async (gift: typeof GIFT_CATALOG[0]) => {
    if (!currentStream) return;
    if (walletBalance !== null && walletBalance < gift.amount) {
      return;
    }
    setGiftSending(true);
    try {
      await new Promise(r => setTimeout(r, 500));
      if (walletBalance !== null) setWalletBalance(walletBalance - gift.amount);
      const id = Date.now() + Math.random();
      setFloatingGifts(prev => [...prev, { id, icon: gift.icon, name: gift.name }]);
      setTimeout(() => setFloatingGifts(prev => prev.filter(g => g.id !== id)), 4000);
      setShowGiftModal(false);
    } catch {} finally { setGiftSending(false); }
  };

  const handleSendChat = () => {
    if (!chatText.trim() || !currentStream) return;
    setChatMessages(prev => [...prev, { id: Date.now().toString(), user: 'أنت', text: chatText.trim() }]);
    setChatText('');
  };

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

        {/* ═══ Floating gifts ═══ */}
        {floatingGifts.map(g => (
          <View key={g.id} style={styles.floatingGift}>
            <Text style={styles.floatingGiftIcon}>{g.icon}</Text>
            <View style={styles.floatingGiftLabel}>
              <Text style={styles.floatingGiftText}>{g.name}</Text>
            </View>
          </View>
        ))}

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
            onPress={() => navigation?.navigate?.('LiveBroadcast')}
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
});
