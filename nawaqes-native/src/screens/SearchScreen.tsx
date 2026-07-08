// ─── Search Screen ──────────────────────────────────────────────────
// Search posts + users.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Search, X, User, FileText } from 'lucide-react-native';

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'posts' | 'users'>('posts');

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      let data: any[] = [];
      if (tab === 'posts') {
        const res = await api.client.get(`/posts/search?q=${encodeURIComponent(query.trim())}`);
        data = res.data?.posts || res.data || [];
      } else {
        const res = await api.client.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
        data = res.data?.users || res.data || [];
      }
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, tab]);

  const renderPost = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => navigation?.navigate?.('PostDetail', { postId: item.id })}
    >
      <View style={styles.resultIcon}>
        <FileText color="#3b82f6" size={20} />
      </View>
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item.content?.slice(0, 60) || 'منشور'}
        </Text>
        <Text style={styles.resultSub}>{item.author?.name || 'مستخدم'}</Text>
      </View>
      {item.price ? (
        <Text style={styles.priceText}>{item.price} ج.م</Text>
      ) : null}
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => Alert.alert('قريباً', 'عرض الملف الشخصي قيد التطوير')}
    >
      <Image
        source={{ uri: item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }}
        style={styles.userAvatar}
      />
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle}>{item.name}</Text>
        {item.email ? <Text style={styles.resultSub} numberOfLines={1}>{item.email}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>بحث</Text>
      </View>

      {/* Search Box */}
      <View style={styles.searchBox}>
        <Search color="#64748b" size={18} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="ابحث عن منشورات أو مستخدمين..."
          placeholderTextColor="#64748b"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
            <X color="#64748b" size={18} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'posts' && styles.tabActive]}
          onPress={() => { setTab('posts'); setResults([]); }}
        >
          <FileText color={tab === 'posts' ? '#fff' : '#64748b'} size={16} />
          <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>منشورات</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'users' && styles.tabActive]}
          onPress={() => { setTab('users'); setResults([]); }}
        >
          <User color={tab === 'users' ? '#fff' : '#64748b'} size={16} />
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>مستخدمون</Text>
        </TouchableOpacity>
      </View>

      {/* Results */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={tab === 'posts' ? renderPost : renderUser}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#f97316" size="large" />
            </View>
          ) : query ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Search color="#475569" size={40} />
              <Text style={styles.emptyText}>ابدأ البحث عن منشورات أو مستخدمين</Text>
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  resultIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#3b82f620',
    alignItems: 'center', justifyContent: 'center',
  },
  resultInfo: { flex: 1 },
  resultTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  resultSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  priceText: { color: '#f97316', fontSize: 13, fontWeight: '800' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#334155' },
  emptyState: { padding: 40, alignItems: 'center', gap: 12 },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
});
