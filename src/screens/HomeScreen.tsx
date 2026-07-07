// ─── Home Screen (Enhanced Feed) ────────────────────────────────────
// Vertical scrollable feed of posts/ads with:
// - Story bar (horizontal avatars at top)
// - Active live streams carousel
// - Posts with like/comment/share/save
// - Pull-to-refresh + infinite scroll
// - User avatar in header (tap → profile)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, Alert, Dimensions, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Home, Plus, Heart, MessageCircle, Share2, Search, Bell,
  Bookmark, BadgeCheck, Radio, Play, Eye, MapPin, ChevronLeft,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface Post {
  id: string;
  content: string;
  image?: string;
  type: string;
  price?: number;
  currency?: string;
  location?: string;
  likes: number;
  comments: number;
  shares?: number;
  liked?: boolean;
  saved?: boolean;
  author: {
    id: string;
    name: string;
    avatar?: string;
    is_verified?: boolean;
  };
  created_at: string;
}

interface LiveStream {
  id: string;
  hostName: string;
  hostAvatar?: string;
  title: string;
  viewers: number;
  thumbnailUrl?: string;
}

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [liveStreams, setLiveStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  // ─── Load posts ────────────────────────────────────────────────────
  const loadPosts = useCallback(async (pageNum = 1, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);

      const data = await api.getFeed(pageNum, 10);
      const newPosts = data.posts || data || [];

      if (refresh || pageNum === 1) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setHasMore(newPosts.length >= 10);
      setPage(pageNum);
    } catch (err: any) {
      // Silent fail — don't crash on network error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ─── Load active live streams (for carousel) ───────────────────────
  const loadLiveStreams = useCallback(async () => {
    try {
      const streams = await api.getActiveStreams().catch(() => []);
      const arr = (streams as any[]) || [];
      setLiveStreams(arr.map((s: any) => ({
        id: s.id,
        hostName: s.hostName || s.host_name || 'مستخدم',
        hostAvatar: fixUrl(s.hostAvatar || s.host_avatar),
        title: s.title || 'بث مباشر',
        viewers: s.viewers || 0,
        thumbnailUrl: fixUrl(s.thumbnailUrl || s.thumbnail_url),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    loadPosts(1);
    loadLiveStreams();
    // Refresh live streams every 30s
    const interval = setInterval(loadLiveStreams, 30000);
    return () => clearInterval(interval);
  }, [loadPosts, loadLiveStreams]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleLike = async (postId: string) => {
    // Optimistic update
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      likes: p.likes + (likedPosts.has(postId) ? -1 : 1),
    } : p));
    try {
      await api.likePost(postId);
    } catch {}
  };

  const handleSave = (postId: string) => {
    setSavedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
    try {
      api.savePost(postId).catch(() => {});
    } catch {}
  };

  const handleShare = async (post: Post) => {
    try {
      const Share = require('react-native').Share;
      await Share.share({
        message: `${post.content || 'منشور على نواقص'}\nhttps://safwatkhokha-nawaqes.hf.space/post/${post.id}`,
      });
    } catch {}
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins} د`;
    if (diffHours < 24) return `${diffHours} س`;
    if (diffDays === 1) return 'أمس';
    return `${diffDays} يوم`;
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${n}`;
  };

  // ─── Story bar (horizontal avatars) ────────────────────────────────
  const renderStoryBar = () => (
    <View style={styles.storyBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyScroll}>
        {/* My story (add) */}
        <TouchableOpacity style={styles.storyItem} onPress={() => navigation?.navigate?.('CreatePost')}>
          <View style={styles.storyAvatarWrap}>
            <Image
              source={{ uri: user?.avatar ? fixUrl(user.avatar) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'me'}` }}
              style={styles.storyAvatar}
            />
            <View style={styles.storyAddBtn}>
              <Plus color="#fff" size={14} />
            </View>
          </View>
          <Text style={styles.storyName} numberOfLines={1}>أنت</Text>
        </TouchableOpacity>
        {/* Other users (from posts authors) */}
        {posts.slice(0, 10).map((post, idx) => (
          <TouchableOpacity
            key={post.author?.id || idx}
            style={styles.storyItem}
            onPress={() => navigation?.navigate?.('PostDetail', { postId: post.id })}
          >
            <View style={styles.storyAvatarWrap}>
              <Image
                source={{ uri: fixUrl(post.author?.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.id}` }}
                style={[styles.storyAvatar, styles.storyAvatarActive]}
              />
            </View>
            <Text style={styles.storyName} numberOfLines={1}>{post.author?.name?.split(' ')[0] || 'مستخدم'}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ─── Live streams carousel ─────────────────────────────────────────
  const renderLiveCarousel = () => {
    if (liveStreams.length === 0) return null;
    return (
      <View style={styles.liveSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Radio color="#ef4444" size={16} />
            <Text style={styles.sectionTitle}>بث مباشر الآن</Text>
          </View>
          <Text style={styles.sectionCount}>{liveStreams.length}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveScroll}>
          {liveStreams.map((stream) => (
            <TouchableOpacity
              key={stream.id}
              style={styles.liveCard}
              onPress={() => navigation?.navigate?.('Channels')}
            >
              <Image
                source={{ uri: stream.thumbnailUrl || stream.hostAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.id}` }}
                style={styles.liveThumb}
              />
              <View style={styles.liveOverlay}>
                <View style={styles.liveBadge}>
                  <Radio color="#fff" size={8} />
                  <Text style={styles.liveBadgeText}>مباشر</Text>
                </View>
                <View style={styles.liveViewers}>
                  <Eye color="#fff" size={10} />
                  <Text style={styles.liveViewersText}>{formatCount(stream.viewers)}</Text>
                </View>
              </View>
              <View style={styles.liveInfo}>
                <Text style={styles.liveHostName} numberOfLines={1}>{stream.hostName}</Text>
                <Text style={styles.liveTitle} numberOfLines={1}>{stream.title}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // ─── Post card ─────────────────────────────────────────────────────
  const renderPost = ({ item }: { item: Post }) => {
    const isLiked = likedPosts.has(item.id);
    const isSaved = savedPosts.has(item.id);
    return (
      <View style={styles.postCard}>
        {/* Author */}
        <View style={styles.postHeader}>
          <Image
            source={{ uri: fixUrl(item.author?.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author?.id}` }}
            style={styles.avatar}
          />
          <View style={styles.authorInfo}>
            <View style={styles.authorNameRow}>
              <Text style={styles.authorName}>{item.author?.name || 'مستخدم'}</Text>
              {item.author?.is_verified ? <BadgeCheck color="#3b82f6" size={14} /> : null}
            </View>
            <Text style={styles.postTime}>{formatTime(item.created_at)}</Text>
          </View>
          {item.type === 'ad' && item.price ? (
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>{item.price} {item.currency || 'ج.م'}</Text>
            </View>
          ) : null}
        </View>

        {/* Content */}
        {item.content ? (
          <Text style={styles.postContent}>{item.content}</Text>
        ) : null}

        {/* Image */}
        {item.image ? (
          <Image
            source={{ uri: fixUrl(item.image) }}
            style={styles.postImage}
            resizeMode="cover"
          />
        ) : null}

        {/* Location */}
        {item.location ? (
          <View style={styles.locationRow}>
            <MapPin color="#64748b" size={12} />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item.id)}>
            <Heart color={isLiked ? '#ef4444' : '#64748b'} size={22} fill={isLiked ? '#ef4444' : 'transparent'} />
            <Text style={[styles.actionText, isLiked && styles.actionTextActive]}>{formatCount(item.likes)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
          >
            <MessageCircle color="#64748b" size={22} />
            <Text style={styles.actionText}>{formatCount(item.comments)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleSave(item.id)}>
            <Bookmark color={isSaved ? '#facc15' : '#64748b'} size={22} fill={isSaved ? '#facc15' : 'transparent'} />
            <Text style={styles.actionText}>{isSaved ? 'محفوظ' : 'حفظ'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(item)}>
            <Share2 color="#64748b" size={22} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── List header (stories + live carousel) ─────────────────────────
  const renderListHeader = () => (
    <View>
      {renderStoryBar()}
      {renderLiveCarousel()}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.navigate?.('Profile')}>
          <Image
            source={{ uri: user?.avatar ? fixUrl(user.avatar) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'me'}` }}
            style={styles.headerAvatar}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>نواقص</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation?.navigate?.('Search')} style={styles.iconBtn}>
            <Search color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation?.navigate?.('Notifications')} style={styles.iconBtn}>
            <Bell color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation?.navigate?.('ChatList')} style={styles.iconBtn}>
            <MessageCircle color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          ListHeaderComponent={renderListHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { loadPosts(1, true); loadLiveStreams(); }}
              tintColor="#f97316"
            />
          }
          onEndReached={() => hasMore && loadPosts(page + 1)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Home color="#475569" size={48} />
              <Text style={styles.emptyTitle}>لا توجد منشورات بعد</Text>
              <Text style={styles.emptySub}>كن أول من ينشر!</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation?.navigate?.('CreatePost')}>
                <Plus color="#fff" size={18} />
                <Text style={styles.emptyBtnText}>إنشاء منشور</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Floating create button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation?.navigate?.('CreatePost')}
      >
        <Plus color="#fff" size={26} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', borderWidth: 2, borderColor: '#f97316' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  // Story bar
  storyBar: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', paddingVertical: 12 },
  storyScroll: { paddingHorizontal: 12, gap: 14 },
  storyItem: { alignItems: 'center', width: 64 },
  storyAvatarWrap: { position: 'relative', marginBottom: 4 },
  storyAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#334155', borderWidth: 2, borderColor: '#334155' },
  storyAvatarActive: { borderColor: '#f97316' },
  storyAddBtn: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#f97316',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1e293b',
  },
  storyName: { color: '#cbd5e1', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  // Live section
  liveSection: { backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155', paddingVertical: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionCount: { color: '#64748b', fontSize: 12 },
  liveScroll: { paddingHorizontal: 12, gap: 10 },
  liveCard: { width: 140, height: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0f172a' },
  liveThumb: { width: '100%', height: '100%' },
  liveOverlay: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  liveBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  liveViewers: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  liveViewersText: { color: '#fff', fontSize: 8, fontWeight: '700' },
  liveInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.7)' },
  liveHostName: { color: '#fff', fontSize: 11, fontWeight: '800' },
  liveTitle: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  // List
  list: { padding: 12, gap: 12, paddingBottom: 80 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Post card
  postCard: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden' },
  postHeader: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155' },
  authorInfo: { flex: 1, marginLeft: 10 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  postTime: { fontSize: 12, color: '#64748b', marginTop: 2 },
  priceBadge: { backgroundColor: '#ea580c', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  priceText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  postContent: { color: '#e2e8f0', fontSize: 14, lineHeight: 20, paddingHorizontal: 12, paddingBottom: 8 },
  postImage: { width: '100%', height: 280, backgroundColor: '#0f172a' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  locationText: { color: '#64748b', fontSize: 12 },
  actions: { flexDirection: 'row', padding: 12, gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  actionTextActive: { color: '#ef4444' },
  // Empty state
  emptyState: { padding: 40, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { color: '#64748b', fontSize: 14, marginTop: 4 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // FAB
  fab: {
    position: 'absolute', bottom: 20, right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#f97316',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#f97316', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
