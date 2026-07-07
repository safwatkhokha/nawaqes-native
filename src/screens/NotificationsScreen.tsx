// ─── Notifications List Screen ──────────────────────────────────────
// List of in-app notifications.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import {
  Bell, Heart, MessageCircle, UserPlus, Radio, Gift, ShoppingBag,
} from 'lucide-react-native';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: any;
  read: boolean;
  created_at: string;
}

export default function NotificationsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.client.get('/notifications');
      setNotifications(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await api.client.put('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart color="#ef4444" size={20} />;
      case 'comment': return <MessageCircle color="#3b82f6" size={20} />;
      case 'follow': return <UserPlus color="#10b981" size={20} />;
      case 'live': return <Radio color="#ef4444" size={20} />;
      case 'gift': return <Gift color="#a855f7" size={20} />;
      case 'order': return <ShoppingBag color="#f97316" size={20} />;
      default: return <Bell color="#64748b" size={20} />;
    }
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

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notifCard, !item.read && styles.notifCardUnread]}
      onPress={() => {
        // Navigate based on type
        if (item.type === 'live') navigation?.navigate?.('Live');
        else if (item.data?.postId) navigation?.navigate?.('PostDetail', { postId: item.data.postId });
      }}
    >
      <View style={[styles.notifIcon, !item.read && styles.notifIconUnread]}>
        {getNotificationIcon(item.type)}
      </View>
      <View style={styles.notifBody}>
        <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.notifText} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.notifTime}>{formatTime(item.created_at)}</Text>
      </View>
      {!item.read ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        {notifications.some(n => !n.read) ? (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>تعليم الكل كمقروء</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadNotifications(true)} tintColor="#f97316" />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>جارٍ التحميل...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Bell color="#475569" size={32} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد إشعارات</Text>
              <Text style={styles.emptySub}>ستظهر هنا الإشعارات الجديدة</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  markAllText: { color: '#f97316', fontSize: 12, fontWeight: '700' },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  notifCardUnread: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#f9731640' },
  notifIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#0f172a',
    alignItems: 'center', justifyContent: 'center',
  },
  notifIconUnread: { backgroundColor: '#f9731620' },
  notifBody: { flex: 1 },
  notifTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  notifText: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  notifTime: { color: '#64748b', fontSize: 10, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  emptyText: { color: '#64748b', fontSize: 14 },
});
