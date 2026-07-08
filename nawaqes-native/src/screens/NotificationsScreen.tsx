// ─── Notifications Screen (Enhanced) ────────────────────────────────
// Tabs (all/unread) + colored icons + swipe delete + filter by type
// + mark read on tap + clear all + smart time

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import {
  Bell, Heart, MessageCircle, UserPlus, Radio, Gift, ShoppingBag,
  Trash2, X, CheckCheck, ChevronLeft, BadgeCheck,
} from 'lucide-react-native';

interface Notification {
  id: string;
  type: string;
  message: string;
  link?: string;
  read?: boolean;
  created_at: string;
  user_id_ref?: string;
  post_id?: string;
  user?: { name?: string; avatar?: string; is_verified?: boolean };
}

type TabType = 'all' | 'unread';

export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showClearModal, setShowClearModal] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  const loadNotifications = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.client.get('/notifications');
      const data = res.data || [];
      // Support both array and { notifications: [...] } formats
      const arr = Array.isArray(data) ? data : (data.notifications || []);
      setNotifications(arr.map((n: any) => ({
        id: n.id,
        type: n.type || 'default',
        message: n.message || n.body || '',
        link: n.link,
        read: !!n.read || n.is_read,
        created_at: n.created_at,
        user_id_ref: n.user_id_ref,
        post_id: n.post_id,
        user: n.user || { name: n.user_name, avatar: n.user_avatar },
      })));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleMarkAllRead = async () => {
    try {
      await api.client.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.client.post(`/notifications/${id}/mark-read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await api.client.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  const handleClearAll = async () => {
    setShowClearModal(false);
    try {
      await api.client.delete('/notifications');
      setNotifications([]);
    } catch {}
  };

  const handlePress = (item: Notification) => {
    if (!item.read) handleMarkRead(item.id);
    // Navigate based on type/link
    if (item.link?.includes('/post/') || item.post_id) {
      navigation?.navigate?.('PostDetail', { postId: item.post_id || item.link?.split('/').pop() });
    } else if (item.type === 'live' || item.type === 'livestream') {
      navigation?.navigate?.('Channels');
    } else if (item.type === 'market' || item.type === 'order') {
      navigation?.navigate?.('SmartMarket');
    } else if (item.type === 'follow' && item.user_id_ref) {
      // Could navigate to user profile
    }
  };

  // ─── Filtered notifications ────────────────────────────────────────
  const filtered = activeTab === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  // ─── Helpers ───────────────────────────────────────────────────────
  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'like': return { icon: Heart, color: '#ef4444', bg: '#ef444420' };
      case 'comment': return { icon: MessageCircle, color: '#3b82f6', bg: '#3b82f620' };
      case 'follow': return { icon: UserPlus, color: '#10b981', bg: '#10b98120' };
      case 'live': case 'livestream': return { icon: Radio, color: '#ef4444', bg: '#ef444420' };
      case 'gift': case 'gift_received': return { icon: Gift, color: '#a855f7', bg: '#a855f720' };
      case 'market': case 'order': return { icon: ShoppingBag, color: '#f97316', bg: '#f9731620' };
      default: return { icon: Bell, color: '#64748b', bg: '#64748b20' };
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins} دقيقة`;
    if (diffHours < 24) return `${diffHours} ساعة`;
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `${diffDays} أيام`;
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  // ─── Render ────────────────────────────────────────────────────────
  const renderNotification = ({ item }: { item: Notification }) => {
    const { icon: Icon, color, bg } = getNotifIcon(item.type);
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.read && styles.notifCardUnread]}
        onPress={() => handlePress(item)}
        onLongPress={() => setSelectedNotif(item)}
        activeOpacity={0.7}
      >
        {/* User avatar or icon */}
        <View style={[styles.notifIconWrap, { backgroundColor: bg }]}>
          {item.user?.avatar ? (
            <Image source={{ uri: fixUrl(item.user.avatar) }} style={styles.notifAvatar} />
          ) : (
            <Icon color={color} size={20} />
          )}
          {/* Small type icon overlay */}
          <View style={[styles.notifTypeBadge, { backgroundColor: color }]}>
            <Icon color="#fff" size={8} />
          </View>
        </View>

        {/* Content */}
        <View style={styles.notifBody}>
          <View style={styles.notifHeaderRow}>
            {item.user?.name ? (
              <View style={styles.notifUserRow}>
                <Text style={styles.notifUserName} numberOfLines={1}>{item.user.name}</Text>
                {item.user.is_verified ? <BadgeCheck color="#3b82f6" size={12} /> : null}
              </View>
            ) : null}
            <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={[styles.notifText, !item.read && styles.notifTextUnread]} numberOfLines={2}>
            {item.message}
          </Text>
        </View>

        {/* Unread dot */}
        {!item.read ? <View style={styles.unreadDot} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>الإشعارات</Text>
          {unreadCount > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead} style={styles.headerBtn}>
              <CheckCheck color="#f97316" size={20} />
            </TouchableOpacity>
          ) : null}
          {notifications.length > 0 ? (
            <TouchableOpacity onPress={() => setShowClearModal(true)} style={styles.headerBtn}>
              <Trash2 color="#ef4444" size={18} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>الكل ({notifications.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'unread' && styles.tabActive]}
          onPress={() => setActiveTab('unread')}
        >
          <Text style={[styles.tabText, activeTab === 'unread' && styles.tabTextActive]}>
            غير مقروء ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNotifications(true)} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Bell color="#475569" size={40} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
              </Text>
              <Text style={styles.emptySub}>ستظهر هنا الإشعارات الجديدة</Text>
            </View>
          }
        />
      )}

      {/* Clear all modal */}
      <Modal visible={showClearModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowClearModal(false)}>
          <View style={styles.modalPanel}>
            <View style={styles.modalIconWrap}>
              <Trash2 color="#ef4444" size={28} />
            </View>
            <Text style={styles.modalTitle}>حذف كل الإشعارات</Text>
            <Text style={styles.modalText}>هل تريد حذف جميع الإشعارات؟ لا يمكن التراجع.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowClearModal(false)}>
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={handleClearAll}>
                <Text style={styles.modalDeleteText}>حذف الكل</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Single notification actions modal */}
      <Modal visible={!!selectedNotif} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedNotif(null)}>
          <View style={styles.modalPanel}>
            {selectedNotif && !selectedNotif.read ? (
              <TouchableOpacity
                style={styles.actionOption}
                onPress={() => { handleMarkRead(selectedNotif.id); setSelectedNotif(null); }}
              >
                <CheckCheck color="#10b981" size={20} />
                <Text style={styles.actionOptionText}>تعليم كمقروء</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => { if (selectedNotif) handleDelete(selectedNotif.id); setSelectedNotif(null); }}
            >
              <Trash2 color="#ef4444" size={20} />
              <Text style={[styles.actionOptionText, { color: '#ef4444' }]}>حذف الإشعار</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancel} onPress={() => setSelectedNotif(null)}>
              <Text style={styles.actionCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerBadge: { backgroundColor: '#f97316', minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  // Tabs
  tabsRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#0f172a' },
  tabActive: { backgroundColor: '#f97316' },
  tabText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  // Loading
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Notification card
  notifCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e293b', borderRadius: 14, padding: 12,
  },
  notifCardUnread: { borderWidth: 1, borderColor: '#f9731640', backgroundColor: '#1e293b' },
  notifIconWrap: { position: 'relative', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notifAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155' },
  notifTypeBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#1e293b',
  },
  notifBody: { flex: 1, minWidth: 0 },
  notifHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  notifUserRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
  notifUserName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  notifTime: { color: '#64748b', fontSize: 10 },
  notifText: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  notifTextUnread: { color: '#e2e8f0', fontWeight: '600' },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f97316', marginLeft: 4 },
  // Empty
  emptyState: { padding: 60, alignItems: 'center' },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptySub: { color: '#64748b', fontSize: 13, marginTop: 4 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalPanel: { backgroundColor: '#1e293b', borderRadius: 20, width: '85%', padding: 24, alignItems: 'center' },
  modalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ef444420', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  modalText: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#334155', alignItems: 'center' },
  modalCancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  modalDeleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' },
  modalDeleteText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  actionOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, width: '100%', borderBottomWidth: 1, borderBottomColor: '#334155' },
  actionOptionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionCancel: { padding: 14, width: '100%', alignItems: 'center', marginTop: 4 },
  actionCancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
});
