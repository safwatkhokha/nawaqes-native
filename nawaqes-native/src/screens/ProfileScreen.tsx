// ─── Profile Screen (Enhanced — TikTok-style) ───────────────────────
// Cover photo + avatar + stats + tabs (posts/ads/saved) + menu

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  Image, Share, FlatList, Dimensions, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  User, Settings, LogOut, Shield, Bell, HelpCircle,
  ChevronLeft, BadgeCheck, Wallet, Radio, FileText,
  Heart, ShoppingBag, Bookmark, Grid3x3, Share2, Edit3,
  Video, Eye, MessageCircle, MapPin, Plus,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface UserPost {
  id: string;
  content: string;
  image?: string;
  type: string;
  price?: number;
  likes: number;
  comments: number;
  created_at: string;
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'posts' | 'ads' | 'saved'>('posts');
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [savedPosts, setSavedPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  // ─── Load user data ────────────────────────────────────────────────
  const loadUserData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      // Refresh user profile
      await refreshUser();

      // Get user's posts
      const [postsRes, savedRes] = await Promise.all([
        api.getFeed(1, 50).catch(() => ({ posts: [] })),
        api.getSavedPosts().catch(() => ({ posts: [] })),
      ]);

      const allPosts = (postsRes as any)?.posts || (postsRes as any) || [];
      const myPosts = allPosts.filter((p: any) => p.author?.id === user?.id);
      const myAds = myPosts.filter((p: any) => p.type === 'ad');
      const saved = (savedRes as any)?.posts || (savedRes as any) || [];

      setUserPosts(myPosts);
      setSavedPosts(saved);

      // Get followers/following count
      try {
        const profile = await api.getProfile();
        setFollowersCount(profile?.followers_count || 0);
        setFollowingCount(profile?.following_count || 0);
      } catch {}
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, refreshUser]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `شاهد ملفي على نواقص!\nhttps://safwatkhokha-nawaqes.hf.space/user/${user?.id}`,
      });
    } catch {}
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 1) return 'اليوم';
    if (diffDays === 1) return 'أمس';
    return `${diffDays} يوم`;
  };

  // ─── Render post in grid ───────────────────────────────────────────
  const currentPosts = activeTab === 'saved' ? savedPosts : (activeTab === 'ads' ? userPosts.filter(p => p.type === 'ad') : userPosts);

  const renderGridItem = ({ item }: { item: UserPost }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
    >
      {item.image ? (
        <Image
          source={{ uri: fixUrl(item.image) }}
          style={styles.gridImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.gridPlaceholder}>
          <FileText color="#475569" size={28} />
        </View>
      )}
      {/* Overlay stats */}
      <View style={styles.gridOverlay}>
        {item.price ? (
          <View style={styles.gridPriceBadge}>
            <Text style={styles.gridPriceText}>{item.price} ج.م</Text>
          </View>
        ) : null}
        <View style={styles.gridStats}>
          <View style={styles.gridStatRow}>
            <Heart color="#fff" size={11} fill="#fff" />
            <Text style={styles.gridStatText}>{item.likes}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // ─── Menu items ────────────────────────────────────────────────────
  const menuItems = [
    { icon: Wallet, label: 'محفظتي', color: '#f97316', onPress: () => navigation?.navigate?.('Wallet') },
    { icon: Video, label: 'قنواتي', color: '#ef4444', onPress: () => navigation?.navigate?.('Channels') },
    { icon: ShoppingBag, label: 'سوقي', color: '#3b82f6', onPress: () => navigation?.navigate?.('SmartMarket') },
    { icon: Bell, label: 'الإشعارات', color: '#a855f7', onPress: () => navigation?.navigate?.('Notifications') },
    { icon: Settings, label: 'الإعدادات', color: '#06b6d4', onPress: () => navigation?.navigate?.('Settings') },
    { icon: Shield, label: 'الخصوصية والأمان', color: '#10b981', onPress: () => Alert.alert('قريباً') },
    { icon: HelpCircle, label: 'المساعدة', color: '#06b6d4', onPress: () => Alert.alert('قريباً') },
  ];

  if (user?.is_admin) {
    menuItems.unshift({
      icon: Shield, label: 'لوحة التحكم', color: '#f97316',
      onPress: () => navigation?.navigate?.('AdminDashboard'),
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadUserData(true)} tintColor="#f97316" />}
      >
        {/* Cover + Avatar */}
        <View style={styles.coverSection}>
          <View style={styles.coverBg} />
          {/* Header actions */}
          <View style={styles.coverHeader}>
            <TouchableOpacity onPress={handleShare} style={styles.coverBtn}>
              <Share2 color="#fff" size={20} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation?.navigate?.('Settings')} style={styles.coverBtn}>
              <Settings color="#fff" size={20} />
            </TouchableOpacity>
          </View>
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: user?.avatar ? fixUrl(user.avatar) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'default'}` }}
              style={styles.avatar}
            />
            <TouchableOpacity style={styles.editAvatarBtn} onPress={() => Alert.alert('قريباً', 'تحديث الصورة قيد التطوير')}>
              <Edit3 color="#fff" size={12} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Name + Verified */}
        <View style={styles.nameSection}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{user?.name || 'مستخدم'}</Text>
            {user?.is_verified ? <BadgeCheck color="#3b82f6" size={20} /> : null}
          </View>
          <Text style={styles.email}>{user?.email || ''}</Text>
          {user?.phone ? (
            <View style={styles.phoneRow}>
              <Text style={styles.phone}>{user.phone}</Text>
            </View>
          ) : null}
          {user?.location ? (
            <View style={styles.locationRow}>
              <MapPin color="#64748b" size={12} />
              <Text style={styles.locationText}>{user.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userPosts.length}</Text>
            <Text style={styles.statLabel}>منشور</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{followersCount}</Text>
            <Text style={styles.statLabel}>متابع</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{followingCount}</Text>
            <Text style={styles.statLabel}>يتابع</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{user?.wallet_balance?.toFixed(0) || 0}</Text>
            <Text style={styles.statLabel}>ج.م</Text>
          </View>
        </View>

        {/* Edit Profile Button */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => Alert.alert('قريباً', 'تحديث الملف الشخصي قيد التطوير')}
          >
            <Edit3 color="#fff" size={16} />
            <Text style={styles.editProfileText}>تعديل الملف</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
          >
            <Share2 color="#fff" size={16} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'posts' && styles.tabActive]}
            onPress={() => setActiveTab('posts')}
          >
            <Grid3x3 color={activeTab === 'posts' ? '#f97316' : '#64748b'} size={20} />
            <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>المنشورات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ads' && styles.tabActive]}
            onPress={() => setActiveTab('ads')}
          >
            <ShoppingBag color={activeTab === 'ads' ? '#f97316' : '#64748b'} size={20} />
            <Text style={[styles.tabText, activeTab === 'ads' && styles.tabTextActive]}>الإعلانات</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'saved' && styles.tabActive]}
            onPress={() => setActiveTab('saved')}
          >
            <Bookmark color={activeTab === 'saved' ? '#f97316' : '#64748b'} size={20} />
            <Text style={[styles.tabText, activeTab === 'saved' && styles.tabTextActive]}>المحفوظات</Text>
          </TouchableOpacity>
        </View>

        {/* Posts Grid */}
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#f97316" size="large" />
          </View>
        ) : currentPosts.length > 0 ? (
          <FlatList
            data={currentPosts}
            keyExtractor={(item) => item.id}
            renderItem={renderGridItem}
            numColumns={3}
            scrollEnabled={false}
            contentContainerStyle={styles.grid}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>لا توجد منشورات</Text>
              </View>
            }
          />
        ) : (
          <View style={styles.emptyState}>
            {activeTab === 'posts' ? <FileText color="#475569" size={40} /> : null}
            {activeTab === 'ads' ? <ShoppingBag color="#475569" size={40} /> : null}
            {activeTab === 'saved' ? <Bookmark color="#475569" size={40} /> : null}
            <Text style={styles.emptyText}>
              {activeTab === 'posts' ? 'لا توجد منشورات بعد' : activeTab === 'ads' ? 'لا توجد إعلانات' : 'لا توجد منشورات محفوظة'}
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation?.navigate?.('CreatePost')}>
              <Plus color="#fff" size={16} />
              <Text style={styles.emptyBtnText}>إضافة</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu */}
        <View style={styles.menuSection}>
          <Text style={styles.menuTitle}>القائمة</Text>
          <View style={styles.menu}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.menuItem, idx === menuItems.length - 1 && styles.menuItemLast]}
                onPress={item.onPress}
              >
                <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                  <item.icon color={item.color} size={20} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Share App */}
        <TouchableOpacity style={styles.shareAppBtn} onPress={handleShare}>
          <Share2 color="#f97316" size={18} />
          <Text style={styles.shareAppText}>شارك التطبيق مع أصدقائك</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut color="#ef4444" size={20} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>نواقص v2.5.0 (Native)</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  // Cover
  coverSection: { position: 'relative', height: 160, marginBottom: 50 },
  coverBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#f97316', opacity: 0.2,
  },
  coverHeader: {
    position: 'absolute', top: 50, right: 16,
    flexDirection: 'row', gap: 10,
  },
  coverBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  // Avatar
  avatarWrap: {
    position: 'absolute', bottom: -50, left: '50%', transform: [{ translateX: -50 }],
  },
  avatar: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#334155', borderWidth: 4, borderColor: '#0f172a',
  },
  editAvatarBtn: {
    position: 'absolute', bottom: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#0f172a',
  },
  // Name section
  nameSection: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#fff', fontSize: 22, fontWeight: '900' },
  email: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  phone: { color: '#64748b', fontSize: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locationText: { color: '#64748b', fontSize: 12 },
  // Stats
  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20, marginBottom: 16, gap: 0,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#334155' },
  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  editProfileBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1e293b', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#334155',
  },
  editProfileText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shareBtn: {
    width: 46, height: 46, borderRadius: 12,
    backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#334155',
  },
  // Tabs
  tabsRow: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e293b',
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#f97316' },
  tabText: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#f97316' },
  // Grid
  grid: { padding: 2 },
  gridItem: {
    flex: 1, margin: 2, aspectRatio: 1, borderRadius: 8, overflow: 'hidden',
    position: 'relative', backgroundColor: '#1e293b',
  },
  gridImage: { width: '100%', height: '100%' },
  gridPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' },
  gridOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, justifyContent: 'flex-end', padding: 6 },
  gridPriceBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: '#f97316', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  gridPriceText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  gridStats: { alignItems: 'center' },
  gridStatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gridStatText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // Loading
  loadingState: { padding: 40, alignItems: 'center' },
  // Empty
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, marginTop: 12 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16,
    backgroundColor: '#f97316', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Menu
  menuSection: { padding: 20, marginTop: 8 },
  menuTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  menu: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: 1, borderBottomColor: '#334155', gap: 12,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  // Share app
  shareAppBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, padding: 14, backgroundColor: '#f9731620', borderRadius: 12,
  },
  shareAppText: { color: '#f97316', fontSize: 14, fontWeight: '700' },
  // Logout
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 12, padding: 14,
    backgroundColor: '#ef444420', borderRadius: 12,
  },
  logoutText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  versionText: { textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 20, marginBottom: 30 },
});
