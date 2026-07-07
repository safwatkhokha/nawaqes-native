// ─── Admin Dashboard Screen ─────────────────────────────────────────
// Admin panel: overview stats + manage users/posts/reports.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import {
  Users, FileText, DollarSign, Radio, TrendingUp, AlertTriangle,
  CheckCircle, XCircle, Eye, Trash2, Shield, Activity,
} from 'lucide-react-native';

export default function AdminDashboardScreen({ navigation }: any) {
  const [stats, setStats] = useState<any>({});
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'posts' | 'reports'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      const [statsRes, usersRes, postsRes, reportsRes] = await Promise.all([
        api.client.get('/admin/stats').catch(() => ({ data: {} })),
        api.client.get('/admin/users?limit=10').catch(() => ({ data: [] })),
        api.client.get('/admin/posts?limit=10').catch(() => ({ data: [] })),
        api.client.get('/admin/reports?limit=10').catch(() => ({ data: [] })),
      ]);

      setStats(statsRes.data || {});
      setRecentUsers(usersRes.data?.users || usersRes.data || []);
      setRecentPosts(postsRes.data?.posts || postsRes.data || []);
      setReports(reportsRes.data?.reports || reportsRes.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDeletePost = (postId: string) => {
    Alert.alert('حذف المنشور', 'هل تريد حذف هذا المنشور؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.client.delete(`/admin/posts/${postId}`);
            setRecentPosts(prev => prev.filter(p => p.id !== postId));
            Alert.alert('تم', 'تم حذف المنشور');
          } catch {
            Alert.alert('خطأ', 'فشل الحذف');
          }
        },
      },
    ]);
  };

  const handleVerifyUser = async (userId: string, verify: boolean) => {
    try {
      await api.client.patch(`/admin/users/${userId}/verify`, { is_verified: verify });
      setRecentUsers(prev => prev.map(u => u.id === userId ? { ...u, is_verified: verify } : u));
    } catch {
      Alert.alert('خطأ', 'فشل التحديث');
    }
  };

  const formatNumber = (n: number) => n?.toLocaleString('ar-EG') || '0';

  const statCards = [
    { icon: Users, label: 'المستخدمون', value: stats.totalUsers || stats.users || 0, color: '#3b82f6' },
    { icon: FileText, label: 'المنشورات', value: stats.totalPosts || stats.posts || 0, color: '#10b981' },
    { icon: DollarSign, label: 'المعاملات', value: stats.totalTransactions || stats.transactions || 0, color: '#f97316' },
    { icon: Radio, label: 'البثوث', value: stats.totalStreams || stats.streams || 0, color: '#ef4444' },
  ];

  const renderUser = ({ item }: { item: any }) => (
    <View style={styles.rowCard}>
      <Image
        source={{ uri: item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }}
        style={styles.rowAvatar}
      />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{item.name}</Text>
        <Text style={styles.rowSub}>{item.email}</Text>
      </View>
      {item.is_verified ? (
        <CheckCircle color="#10b981" size={20} />
      ) : (
        <TouchableOpacity
          style={styles.verifyBtn}
          onPress={() => handleVerifyUser(item.id, true)}
        >
          <Shield color="#fff" size={14} />
          <Text style={styles.verifyBtnText}>توثيق</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderPost = ({ item }: { item: any }) => (
    <View style={styles.rowCard}>
      <View style={styles.postIcon}>
        <FileText color="#10b981" size={18} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.content?.slice(0, 50) || 'منشور'}</Text>
        <Text style={styles.rowSub}>{item.author?.name || 'مستخدم'}</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeletePost(item.id)}
      >
        <Trash2 color="#fff" size={16} />
      </TouchableOpacity>
    </View>
  );

  const renderReport = ({ item }: { item: any }) => (
    <View style={styles.rowCard}>
      <View style={[styles.postIcon, { backgroundColor: '#ef444420' }]}>
        <AlertTriangle color="#ef4444" size={18} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.reason || 'بلاغ'}</Text>
        <Text style={styles.rowSub}>{item.reporter?.name || 'مستخدم'} → {item.reported?.name || 'مستخدم'}</Text>
      </View>
      <TouchableOpacity
        style={[styles.verifyBtn, { backgroundColor: '#10b981' }]}
        onPress={async () => {
          try {
            await api.client.post(`/admin/reports/${item.id}/resolve`);
            setReports(prev => prev.filter(r => r.id !== item.id));
          } catch {}
        }}
      >
        <CheckCircle color="#fff" size={14} />
        <Text style={styles.verifyBtnText}>حل</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>لوحة التحكم</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {[
          { id: 'overview', label: 'نظرة عامة', icon: TrendingUp },
          { id: 'users', label: 'المستخدمون', icon: Users },
          { id: 'posts', label: 'المنشورات', icon: FileText },
          { id: 'reports', label: 'البلاغات', icon: AlertTriangle },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <tab.icon color={activeTab === tab.id ? '#fff' : '#64748b'} size={14} />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === 'overview' ? (
        <ScrollView
          contentContainerStyle={{ padding: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#f97316" />}
        >
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            {statCards.map((stat, idx) => (
              <View key={idx} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
                  <stat.icon color={stat.color} size={22} />
                </View>
                <Text style={styles.statValue}>{formatNumber(stat.value)}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Recent Activity */}
          <Text style={styles.sectionTitle}>آخر النشاطات</Text>
          <View style={styles.activityCard}>
            <Activity color="#f97316" size={20} />
            <Text style={styles.activityText}>جدد المستخدمين: {stats.newUsers || 0} هذا الأسبوع</Text>
          </View>
          <View style={styles.activityCard}>
            <TrendingUp color="#10b981" size={20} />
            <Text style={styles.activityText}>نمو المنشورات: {stats.newPosts || 0} هذا الأسبوع</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={activeTab === 'users' ? recentUsers : activeTab === 'posts' ? recentPosts : reports}
          keyExtractor={(item) => item.id}
          renderItem={activeTab === 'users' ? renderUser : activeTab === 'posts' ? renderPost : renderReport}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#f97316" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>لا توجد بيانات</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  tabsRow: { flexDirection: 'row', padding: 10, gap: 6, backgroundColor: '#1e293b' },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: 10, backgroundColor: '#0f172a',
  },
  tabActive: { backgroundColor: '#f97316' },
  tabText: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: '#1e293b', borderRadius: 14, padding: 14, alignItems: 'center',
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '900' },
  statLabel: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  activityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  activityText: { color: '#e2e8f0', fontSize: 13 },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1e293b', borderRadius: 12, padding: 12,
  },
  rowAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155' },
  postIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#10b98120', alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 13, fontWeight: '600' },
  rowSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  verifyBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14 },
});
