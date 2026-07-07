// ─── Chat List Screen ───────────────────────────────────────────────
// List of conversations + search.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Search, MessageCircle, Plus, Send } from 'lucide-react-native';

interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
}

export default function ChatListScreen({ navigation }: any) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.client.get('/chat/contacts');
      const data = res.data || [];
      setConversations(data.map((c: any) => ({
        id: c.id,
        name: c.name || 'مستخدم',
        avatar: c.avatar,
        lastMessage: c.lastMessage || c.last_message,
        lastTime: c.lastTime || c.last_time,
        unreadCount: c.unreadCount || c.unread_count || 0,
        isOnline: c.isOnline || c.is_online,
      })));
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => loadConversations(true), 30000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  const filtered = conversations.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins} د`;
    if (diffHours < 24) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'أمس';
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' });
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.convCard}
      onPress={() => navigation?.navigate?.('ChatConversation', { contactId: item.id, contactName: item.name, contactAvatar: item.avatar })}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image
          source={{ uri: item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }}
          style={styles.avatar}
        />
        {item.isOnline ? <View style={styles.onlineDot} /> : null}
      </View>

      {/* Info */}
      <View style={styles.convInfo}>
        <View style={styles.convHeader}>
          <Text style={styles.convName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.convTime}>{formatTime(item.lastTime)}</Text>
        </View>
        <View style={styles.convFooter}>
          <Text style={styles.convLastMsg} numberOfLines={1}>
            {item.lastMessage || 'ابدأ المحادثة'}
          </Text>
          {item.unreadCount ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الرسائل</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Search color="#64748b" size={18} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث في المحادثات..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadConversations(true)} tintColor="#f97316" />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>جارٍ التحميل...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <MessageCircle color="#475569" size={32} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد محادثات</Text>
              <Text style={styles.emptySub}>ابدأ محادثة جديدة من صفحة منشور</Text>
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    margin: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 44,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  convCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  avatarContainer: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#334155' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  convInfo: { flex: 1 },
  convHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  convTime: { color: '#64748b', fontSize: 11 },
  convFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  convLastMsg: { color: '#94a3b8', fontSize: 12, flex: 1 },
  unreadBadge: {
    backgroundColor: '#f97316',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center' },
  emptyText: { color: '#64748b', fontSize: 14 },
});
