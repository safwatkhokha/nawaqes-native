// ─── Home Screen (Feed) ─────────────────────────────────────────────
// Vertical scrollable feed of posts/ads.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Home, Plus, Heart, MessageCircle, Share2, Search, Bell, Bookmark, BadgeCheck, MapPin, Play } from 'lucide-react-native';


interface Post {
  id: string;
  content: string;
  image?: string;
  images?: string[];
  video_url?: string;
  type: string;
  price?: number;
  currency?: string;
  location?: string;
  likes: number;
  comments: number;
  author: {
    id: string;
    name: string;
    avatar?: string;
    is_verified?: boolean;
  };
  created_at: string;
}

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  // Parse images: backend may return JSON array string or single URL
  const parseImages = (img?: string): string[] => {
    if (!img) return [];
    try {
      const parsed = JSON.parse(img);
      if (Array.isArray(parsed)) return parsed.map((u: string) => fixUrl(u) || '');
      return [fixUrl(img) || ''];
    } catch {
      return [fixUrl(img) || ''];
    }
  };

  const loadPosts = useCallback(async (pageNum = 1, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);

      const data = await api.getFeed(pageNum, 10);
      const rawPosts = data.posts || data || [];
      // Normalize posts: parse image JSON, add images array + video_url
      const newPosts = rawPosts.map((p: any) => ({
        ...p,
        images: parseImages(p.image),
        video_url: p.video_url ? fixUrl(p.video_url) : undefined,
        image: p.image ? fixUrl(p.image.startsWith('[') ? parseImages(p.image)[0] : p.image) : undefined,
      }));

      if (refresh || pageNum === 1) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }

      setHasMore(newPosts.length >= 10);
      setPage(pageNum);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  const handleLike = async (postId: string) => {
    try {
      await api.likePost(postId);
      setPosts(prev =>
        prev.map(p =>
          p.id === postId
            ? { ...p, likes: p.likes + 1 }
            : p
        )
      );
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

  const renderPost = ({ item }: { item: Post }) => {
    const isLiked = likedPosts.has(item.id);
    const isSaved = savedPosts.has(item.id);
    const images = item.images && item.images.length > 0 ? item.images : (item.image ? [fixUrl(item.image)] : []);
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
        ) : item.type === 'ad' ? (
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>إعلان</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      {item.content ? (
        <Text style={styles.postContent}>{item.content}</Text>
      ) : null}

      {/* Video */}
      {item.video_url ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
        >
          <Image
            source={{ uri: images[0] || item.video_url }}
            style={styles.postVideo}
            resizeMode="cover"
          />
          <View style={styles.videoPlayOverlay}>
            <View style={styles.videoPlayBtn}>
              <Play color="#fff" size={28} fill="#fff" />
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Images (multiple) */}
      {images.length > 0 && !item.video_url ? (
        <View>
          <Image
            source={{ uri: images[0] }}
            style={styles.postImage}
            resizeMode="cover"
          />
          {images.length > 1 ? (
            <View style={styles.imageCountBadge}>
              <Text style={styles.imageCountText}>+{images.length - 1} صور</Text>
            </View>
          ) : null}
        </View>
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
          <Heart color={isLiked ? '#ef4444' : '#64748b'} size={20} fill={isLiked ? '#ef4444' : 'transparent'} />
          <Text style={[styles.actionText, isLiked && { color: '#ef4444' }]}>{item.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
        >
          <MessageCircle color="#64748b" size={20} />
          <Text style={styles.actionText}>{item.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            setSavedPosts(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
            try { api.savePost(item.id).catch(() => {}); } catch {}
          }}
        >
          <Bookmark color={isSaved ? '#facc15' : '#64748b'} size={20} fill={isSaved ? '#facc15' : 'transparent'} />
          <Text style={styles.actionText}>{isSaved ? 'محفوظ' : 'حفظ'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={async () => {
            try {
              const Share = require('react-native').Share;
              await Share.share({ message: `${item.content || 'منشور'}\nhttps://safwatkhokha-nawaqes.hf.space/post/${item.id}` });
            } catch {}
          }}
        >
          <Share2 color="#64748b" size={20} />
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>نواقص</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('Search')}
            style={styles.iconBtn}
          >
            <Search color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('Notifications')}
            style={styles.iconBtn}
          >
            <Bell color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('ChatList')}
            style={styles.iconBtn}
          >
            <MessageCircle color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation?.navigate?.('CreatePost')}
          >
            <Plus color="#fff" size={22} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Feed */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPosts(1, true)}
            tintColor="#f97316"
          />
        }
        onEndReached={() => hasMore && loadPosts(page + 1)}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 12,
    gap: 12,
  },
  postCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
  },
  authorInfo: {
    flex: 1,
    marginLeft: 10,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  postTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  priceBadge: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  priceText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  postContent: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  postImage: {
    width: '100%',
    height: 280,
    backgroundColor: '#0f172a',
  },
  postVideo: {
    width: '100%',
    height: 280,
    backgroundColor: '#000',
  },
  videoPlayOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoPlayBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(249,115,22,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageCountBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  imageCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  adBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  adBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8 },
  locationText: {
    color: '#64748b',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
});
