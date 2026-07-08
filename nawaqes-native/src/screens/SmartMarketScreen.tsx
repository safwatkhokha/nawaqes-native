// ─── Smart Market Screen ────────────────────────────────────────────
// Browse marketplace listings (posts with type='ad').
// Features: search, category filter, grid layout, price display,
// contact seller, create listing.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, Alert, Dimensions, TextInput,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ShoppingBag, Search, Plus, MapPin, Heart, MessageCircle,
  BadgeCheck, Filter, X, TrendingUp, DollarSign, Tag,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 36) / 2;

const CATEGORIES = [
  { id: 'all', label: 'الكل', icon: Tag },
  { id: 'electronics', label: 'إلكترونيات', icon: ShoppingBag },
  { id: 'vehicles', label: 'سيارات', icon: ShoppingBag },
  { id: 'fashion', label: 'أزياء', icon: ShoppingBag },
  { id: 'home', label: 'منزل', icon: ShoppingBag },
  { id: 'services', label: 'خدمات', icon: ShoppingBag },
];

interface Listing {
  id: string;
  content: string;
  image?: string;
  type: string;
  price?: number;
  currency?: string;
  location?: string;
  likes: number;
  comments: number;
  category?: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
    is_verified?: boolean;
    phone?: string;
  };
  created_at: string;
}

export default function SmartMarketScreen({ navigation }: any) {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filtered, setFiltered] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showSearch, setShowSearch] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  // ─── Load listings ─────────────────────────────────────────────────
  const loadListings = useCallback(async (pageNum = 1, refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else if (pageNum === 1) setLoading(true);

      // Use posts API with type=ad filter for marketplace listings
      const data = await api.getFeed(pageNum, 20);
      const allPosts = data.posts || data || [];
      // Filter to ads only (type='ad')
      const ads = allPosts.filter((p: any) => p.type === 'ad' || p.type === 'market');

      if (refresh || pageNum === 1) {
        setListings(ads);
      } else {
        setListings(prev => [...prev, ...ads]);
      }

      setHasMore(ads.length >= 20);
      setPage(pageNum);
    } catch {
      if (pageNum === 1) setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadListings(1);
  }, [loadListings]);

  // ─── Filter by search + category ───────────────────────────────────
  useEffect(() => {
    let result = listings;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(l =>
        l.content?.toLowerCase().includes(q) ||
        l.author?.name?.toLowerCase().includes(q) ||
        l.location?.toLowerCase().includes(q)
      );
    }
    if (activeCategory !== 'all') {
      result = result.filter(l => l.category === activeCategory);
    }
    setFiltered(result);
  }, [listings, search, activeCategory]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleLike = (id: string) => {
    setLikedPosts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try { api.likePost(id).catch(() => {}); } catch {}
  };

  const handleContactSeller = async (listing: Listing) => {
    const sellerId = listing.author?.id || (listing as any).author_id;
    if (!sellerId) {
      Alert.alert('خطأ', 'تعذر تحديد هوية البائع');
      return;
    }
    try {
      // Navigate directly to chat with seller's user ID as contactId
      navigation?.navigate?.('ChatConversation', {
        contactId: sellerId,
        contactName: listing.author?.name || 'بائع',
        contactAvatar: fixUrl(listing.author?.avatar),
      });
    } catch (e: any) {
      Alert.alert('خطأ', 'تعذر فتح المحادثة');
    }
  };

  const formatPrice = (price?: number, currency?: string) => {
    if (!price) return '';
    return `${price.toLocaleString('ar-EG')} ${currency || 'ج.م'}`;
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffHours < 1) return 'الآن';
    if (diffHours < 24) return `${diffHours} س`;
    if (diffDays === 1) return 'أمس';
    return `${diffDays} يوم`;
  };

  // ─── Render listing card ───────────────────────────────────────────
  const renderListing = ({ item }: { item: Listing }) => {
    const isLiked = likedPosts.has(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
      >
        {/* Image */}
        <View style={styles.imageContainer}>
          {item.image ? (
            <Image
              source={{ uri: fixUrl(item.image) }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardImagePlaceholder}>
              <ShoppingBag color="#475569" size={32} />
            </View>
          )}
          {item.price ? (
            <View style={styles.priceBadge}>
              <DollarSign color="#fff" size={10} />
              <Text style={styles.priceText}>{formatPrice(item.price, item.currency)}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.likeBtn}
            onPress={() => handleLike(item.id)}
          >
            <Heart color={isLiked ? '#ef4444' : '#fff'} size={16} fill={isLiked ? '#ef4444' : 'transparent'} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.content || 'منتج بدون عنوان'}</Text>

          {/* Author */}
          <View style={styles.authorRow}>
            <Image
              source={{ uri: fixUrl(item.author?.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.author?.id}` }}
              style={styles.authorAvatar}
            />
            <Text style={styles.authorName} numberOfLines={1}>{item.author?.name || 'بائع'}</Text>
            {item.author?.is_verified ? <BadgeCheck color="#3b82f6" size={12} /> : null}
          </View>

          {/* Location + Time */}
          <View style={styles.metaRow}>
            {item.location ? (
              <View style={styles.metaItem}>
                <MapPin color="#64748b" size={11} />
                <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
              </View>
            ) : null}
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>

          {/* Contact button */}
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => handleContactSeller(item)}
          >
            <MessageCircle color="#fff" size={14} />
            <Text style={styles.contactBtnText}>تواصل</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Category bar ──────────────────────────────────────────────────
  const renderCategoryBar = () => (
    <View style={styles.categoryBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              onPress={() => setActiveCategory(cat.id)}
            >
              <Icon color={isActive ? '#fff' : '#94a3b8'} size={14} />
              <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ShoppingBag color="#f97316" size={22} />
          <Text style={styles.headerTitle}>السوق الذكي</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowSearch(s => !s)} style={styles.iconBtn}>
            <Search color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => navigation?.navigate?.('CreatePost')}
          >
            <Plus color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar (collapsible) */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Search color="#64748b" size={16} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن منتج، بائع، أو موقع..."
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X color="#64748b" size={18} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Category bar */}
      {renderCategoryBar()}

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <TrendingUp color="#10b981" size={14} />
          <Text style={styles.statText}>{filtered.length} منتج</Text>
        </View>
      </View>

      {/* Listings grid */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderListing}
          numColumns={2}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadListings(1, true)}
              tintColor="#f97316"
            />
          }
          onEndReached={() => hasMore && loadListings(page + 1)}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <ShoppingBag color="#475569" size={48} />
              <Text style={styles.emptyTitle}>لا توجد منتجات</Text>
              <Text style={styles.emptySub}>
                {search ? 'جرّب كلمات بحث أخرى' : 'كن أول من يضيف منتجاً للسوق!'}
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation?.navigate?.('CreatePost')}>
                <Plus color="#fff" size={18} />
                <Text style={styles.emptyBtnText}>إضافة منتج</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  createBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' },
  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 10, margin: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  searchIcon: {},
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  // Category bar
  categoryBar: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  categoryScroll: { paddingHorizontal: 12, gap: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    borderWidth: 1, borderColor: '#334155',
  },
  categoryChipActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  categoryText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: '#fff' },
  // Stats
  statsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText: { color: '#10b981', fontSize: 12, fontWeight: '700' },
  // List
  list: { padding: 12, paddingBottom: 20 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Card
  card: {
    flex: 1, maxWidth: '48%', margin: 4,
    backgroundColor: '#1e293b', borderRadius: 14, overflow: 'hidden',
  },
  imageContainer: { position: 'relative', height: 140, backgroundColor: '#0f172a' },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  priceBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#f97316', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  priceText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  likeBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { padding: 10 },
  cardTitle: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  authorAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#334155' },
  authorName: { color: '#cbd5e1', fontSize: 11, fontWeight: '600', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  metaText: { color: '#64748b', fontSize: 10 },
  timeText: { color: '#64748b', fontSize: 10 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#f97316', paddingVertical: 8, borderRadius: 10,
  },
  contactBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  // Empty
  emptyState: { padding: 40, alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySub: { color: '#64748b', fontSize: 13, marginTop: 4, textAlign: 'center' },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
