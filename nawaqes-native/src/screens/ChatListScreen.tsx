// ─── Chat List Screen (Enhanced) ────────────────────────────────────
// Conversations list with: search, online status, unread badges,
// last message preview, time, avatar with online dot, new chat button.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Image, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, MessageCircle, Plus, Send, BadgeCheck,
  Users, Circle, ChevronLeft,
} from 'lucide-react-native';

interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  is_verified?: boolean;
}

export default function ChatListScreen({ navigation }: any) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filtered, setFiltered] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  const loadConversations = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await api.client.get('/chat/contacts');
      const data = res.data || [];
      const mapped = data.map((c: any) => ({
        id: c.id,
        name: c.name || 'مستخدم',
        avatar: fixUrl(c.avatar),
        lastMessage: c.lastMessage || c.last_message || '',
        lastTime: c.lastTime || c.last_time || '',
        unreadCount: c.unreadCount || c.unread_count || 0,
        isOnline: c.isOnline || c.is_online || false,
        is_verified: c.is_verified || false,
      }));
      setConversations(mapped);
      setFiltered(mapped);
    } catch {
      setConversations([]);
      setFiltered([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    // Poll for new messages every 15s
    const interval = setInterval(() => loadConversations(true), 15000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Filter by search
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(conversations);
      return;
    }
    const q = search.toLowerCase().trim();
    setFiltered(conversations.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.lastMessage?.toLowerCase().includes(q)
    ));
  }, [search, conversations]);

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
    if (diffHours < 24) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'أمس';
    if (diffDays < 7) return `${diffDays} يوم`;
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);

  const openConversation = (conv: Conversation) => {
    navigation?.navigate?.('ChatConversation', {
      contactId: conv.id,
      contactName: conv.name,
      contactAvatar: conv.avatar,
    });
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.convCard}
      onPress={() => openConversation(item)}
      activeOpacity={0.7}
    >
      {/* Avatar with online dot */}
      <View style={styles.avatarWrap}>
        <Image
          source={{ uri: item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }}
          style={styles.avatar}
        />
        {item.isOnline ? <View style={styles.onlineDot} /> : null}
      </View>

      {/* Content */}
      <View style={styles.convContent}>
        <View style={styles.convTopRow}>
          <View style={styles.convNameRow}>
            <Text style={styles.convName} numberOfLines={1}>{item.name}</Text>
            {item.is_verified ? <BadgeCheck color="#3b82f6" size={14} /> : null}
          </View>
          <Text style={[styles.convTime, (item.unreadCount || 0) > 0 && styles.convTimeUnread]}>
            {formatTime(item.lastTime || '')}
          </Text>
        </View>
        <View style={styles.convBottomRow}>
          <Text
            style={[styles.convLastMsg, (item.unreadCount || 0) > 0 && styles.convLastMsgUnread]}
            numberOfLines={1}
          >
            {item.lastMessage || 'لا توجد رسائل بعد'}
          </Text>
          {(item.unreadCount || 0) > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount! > 99 ? '99+' : item.unreadCount}</Text>
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
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>الرسائل</Text>
          {totalUnread > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowSearch(s => !s)} style={styles.iconBtn}>
            <Search color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => navigation?.navigate?.('Search')}
          >
            <Plus color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar (collapsible) */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Search color="#64748b" size={16} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن محادثة..."
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Conversations list */}
      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : filtered.length > 0 ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadConversations(true)}
              tintColor="#f97316"
            />
          }
          contentContainerStyle={{ padding: 12, gap: 6 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <MessageCircle color="#475569" size={48} />
          </View>
          <Text style={styles.emptyTitle}>
            {search ? 'لا توجد نتائج' : 'لا توجد محادثات'}
          </Text>
          <Text style={styles.emptySub}>
            {search ? 'جرّب كلمات بحث أخرى' : 'ابدأ محادثة جديدة مع أي مستخدم'}
          </Text>
          {!search ? (
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => navigation?.navigate?.('Search')}
            >
              <Plus color="#fff" size={18} />
              <Text style={styles.emptyBtnText}>محادثة جديدة</Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  headerBadge: {
    backgroundColor: '#f97316', minWidth: 22, height: 22, borderRadius: 11,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
  },
  headerBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  newChatBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' },
  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e293b', margin: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#334155',
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  clearBtn: { color: '#64748b', fontSize: 16 },
  // Loading
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Conversation card
  convCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1e293b', borderRadius: 14, padding: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#334155' },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e',
    borderWidth: 3, borderColor: '#1e293b',
  },
  convContent: { flex: 1, minWidth: 0 },
  convTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  convName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  convTime: { color: '#64748b', fontSize: 11 },
  convTimeUnread: { color: '#f97316', fontWeight: '700' },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convLastMsg: { color: '#64748b', fontSize: 12, flex: 1 },
  convLastMsgUnread: { color: '#e2e8f0', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#f97316', minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#1e293b',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f97316', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
