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
import { Home, Plus, Heart, MessageCircle, Share2, Search, Bell } from 'lucide-react-native';

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
      Alert.alert('خطأ', 'فشل تحميل المنشورات');
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

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
      style={styles.postCard}
    >
      {/* Author */}
      <View style={styles.postHeader}>
        <Image
          source={{ uri: item.author?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author?.id}` }}
          style={styles.avatar}
        />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>
            {item.author?.name || 'مستخدم'}
            {item.author?.is_verified ? ' ✓' : ''}
          </Text>
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
          source={{ uri: item.image.startsWith('http') ? item.image : `https://safwatkhokha-nawaqes.hf.space${item.image}` }}
          style={styles.postImage}
          resizeMode="cover"
        />
      ) : null}

      {/* Location */}
      {item.location ? (
        <Text style={styles.locationText}>📍 {item.location}</Text>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item.id)}>
          <Heart color="#ef4444" size={20} />
          <Text style={styles.actionText}>{item.likes}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <MessageCircle color="#64748b" size={20} />
          <Text style={styles.actionText}>{item.comments}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Share2 color="#64748b" size={20} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

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
    height: 250,
    backgroundColor: '#0f172a',
  },
  locationText: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
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
