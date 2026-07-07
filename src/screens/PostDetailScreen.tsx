// ─── Post Detail Screen ─────────────────────────────────────────────
// Full post view with comments + image gallery.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Alert, Image, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight, Heart, MessageCircle, Share2, Send, BadgeCheck,
  MapPin, Image as ImageIcon,
} from 'lucide-react-native';

interface Comment {
  id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  created_at: string;
}

export default function PostDetailScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const postId = route?.params?.postId;
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [sending, setSending] = useState(false);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const data = await api.client.get(`/posts/${postId}`);
      const p = data.data;
      setPost(p);
      setLikes(p.likes || 0);
      setLiked(p.isLiked || false);
      setComments(p.commentsList || []);
    } catch {
      Alert.alert('خطأ', 'فشل تحميل المنشور');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  const handleLike = async () => {
    try {
      await api.likePost(postId);
      setLiked(prev => !prev);
      setLikes(prev => liked ? prev - 1 : prev + 1);
    } catch {}
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    setSending(true);
    try {
      const res = await api.client.post(`/posts/${postId}/comments`, {
        content: text,
      });
      setComments(prev => [...prev, res.data]);
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل إرسال التعليق');
      setCommentText(text);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // Parse images
  let images: string[] = [];
  if (post?.image) {
    try {
      const parsed = JSON.parse(post.image);
      images = Array.isArray(parsed) ? parsed : [post.image];
    } catch {
      images = [post.image];
    }
  }
  const fixUrl = (url: string) => url.startsWith('http') ? url : `https://safwatkhokha-nawaqes.hf.space${url}`;

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentCard}>
      <Image
        source={{ uri: item.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author_name}` }}
        style={styles.commentAvatar}
      />
      <View style={styles.commentBody}>
        <Text style={styles.commentAuthor}>{item.author_name}</Text>
        <Text style={styles.commentText}>{item.content}</Text>
        <Text style={styles.commentTime}>{formatTime(item.created_at)}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={{ color: '#94a3b8' }}>جارٍ التحميل...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={{ color: '#ef4444' }}>المنشور غير موجود</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <ArrowRight color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المنشور</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* Author */}
          <View style={styles.authorRow}>
            <Image
              source={{ uri: post.author?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author?.id}` }}
              style={styles.avatar}
            />
            <View style={styles.authorInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.authorName}>{post.author?.name || 'مستخدم'}</Text>
                {post.author?.is_verified ? <BadgeCheck color="#3b82f6" size={14} /> : null}
              </View>
              <Text style={styles.postTime}>{formatTime(post.created_at)}</Text>
            </View>
            {post.type === 'ad' && post.price ? (
              <View style={styles.priceBadge}>
                <Text style={styles.priceText}>{post.price} {post.currency || 'ج.م'}</Text>
              </View>
            ) : null}
          </View>

          {/* Content */}
          {post.content ? <Text style={styles.content}>{post.content}</Text> : null}

          {/* Image Gallery */}
          {images.length > 0 ? (
            <View>
              <Image
                source={{ uri: fixUrl(images[currentImageIdx]) }}
                style={styles.mainImage}
                resizeMode="cover"
              />
              {images.length > 1 ? (
                <View style={styles.thumbnailsRow}>
                  {images.map((img, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setCurrentImageIdx(idx)}
                      style={[
                        styles.thumbnail,
                        idx === currentImageIdx && styles.thumbnailActive,
                      ]}
                    >
                      <Image source={{ uri: fixUrl(img) }} style={styles.thumbnailImg} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Location */}
          {post.location ? (
            <View style={styles.locationRow}>
              <MapPin color="#64748b" size={14} />
              <Text style={styles.locationText}>{post.location}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
              <Heart color={liked ? '#ef4444' : '#64748b'} size={22} fill={liked ? '#ef4444' : 'none'} />
              <Text style={[styles.actionText, liked && { color: '#ef4444' }]}>{likes}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <MessageCircle color="#64748b" size={22} />
              <Text style={styles.actionText}>{comments.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Share2 color="#64748b" size={22} />
            </TouchableOpacity>
          </View>

          {/* Comments */}
          <Text style={styles.commentsTitle}>التعليقات ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.noComments}>لا توجد تعليقات بعد</Text>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={renderComment}
              scrollEnabled={false}
            />
          )}
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.commentInputBar}>
          <TextInput
            style={styles.commentInput}
            placeholder="اكتب تعليقًا..."
            placeholderTextColor="#64748b"
            value={commentText}
            onChangeText={setCommentText}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSendComment}
            disabled={!commentText.trim() || sending}
          >
            <Send color="#fff" size={18} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  authorRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155' },
  authorInfo: { flex: 1 },
  authorName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  postTime: { color: '#64748b', fontSize: 12, marginTop: 2 },
  priceBadge: { backgroundColor: '#ea580c', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  priceText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  content: { color: '#e2e8f0', fontSize: 15, lineHeight: 22, paddingHorizontal: 14, paddingBottom: 12 },
  mainImage: { width: '100%', height: 320, backgroundColor: '#000' },
  thumbnailsRow: { flexDirection: 'row', gap: 6, padding: 10, overflow: 'hidden' },
  thumbnail: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbnailActive: { borderColor: '#f97316' },
  thumbnailImg: { width: '100%', height: '100%' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingTop: 8 },
  locationText: { color: '#64748b', fontSize: 12 },
  actionsRow: { flexDirection: 'row', gap: 24, paddingHorizontal: 14, paddingVertical: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  commentsTitle: { color: '#fff', fontSize: 15, fontWeight: '800', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  noComments: { color: '#64748b', fontSize: 13, paddingHorizontal: 14, paddingBottom: 20 },
  commentCard: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155' },
  commentBody: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 10 },
  commentAuthor: { color: '#f97316', fontSize: 12, fontWeight: '700' },
  commentText: { color: '#e2e8f0', fontSize: 13, marginTop: 2 },
  commentTime: { color: '#64748b', fontSize: 10, marginTop: 4 },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
