// ─── Market Live Screen ─────────────────────────────────────────────
// List of active live streams + start broadcast button.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Radio, Video, Users, Plus } from 'lucide-react-native';

interface LiveStream {
  id: string;
  host_name: string;
  host_avatar: string;
  title: string;
  viewer_count: number;
  product_name?: string;
  product_price?: number;
}

export default function MarketLiveScreen({ navigation }: any) {
  const { user } = useAuth();
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStreams = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const data = await api.getActiveMarketLiveStreams();
      setStreams(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStreams();
    // Refresh every 15 seconds
    const interval = setInterval(() => loadStreams(true), 15000);
    return () => clearInterval(interval);
  }, [loadStreams]);

  const handleStartStream = () => {
    navigation?.navigate?.('LiveBroadcast', {
      title: `بث ${user?.name || ''}`,
    });
  };

  const handleJoinStream = (stream: LiveStream) => {
    Alert.alert('قريباً', `البث المباشر من التطبيق الأصلي قيد التطوير.\n\nالبث الحالي: ${stream.host_name}`);
  };

  const renderStream = ({ item }: { item: LiveStream }) => (
    <TouchableOpacity style={styles.streamCard} onPress={() => handleJoinStream(item)}>
      {/* Live badge */}
      <View style={styles.liveBadge}>
        <Radio color="#fff" size={10} />
        <Text style={styles.liveText}>مباشر</Text>
      </View>

      {/* Viewers count */}
      <View style={styles.viewersBadge}>
        <Users color="#fff" size={10} />
        <Text style={styles.viewersText}>{item.viewer_count}</Text>
      </View>

      {/* Avatar */}
      <Image
        source={{ uri: item.host_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }}
        style={styles.hostAvatar}
      />

      {/* Info */}
      <Text style={styles.hostName} numberOfLines={1}>{item.host_name}</Text>
      {item.title ? <Text style={styles.streamTitle} numberOfLines={1}>{item.title}</Text> : null}
      {item.product_name ? (
        <View style={styles.productBadge}>
          <Text style={styles.productText} numberOfLines={1}>{item.product_name}</Text>
          {item.product_price ? <Text style={styles.priceText}>{item.product_price} ج.م</Text> : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.headerTitle}>سوق لايف</Text>
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={handleStartStream}>
          <Video color="#fff" size={16} />
          <Text style={styles.startBtnText}>ابدأ بث</Text>
        </TouchableOpacity>
      </View>

      {/* Streams Grid */}
      <FlatList
        data={streams}
        keyExtractor={(item) => item.id}
        renderItem={renderStream}
        numColumns={2}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadStreams(true)} tintColor="#f97316" />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <Radio color="#334155" size={48} />
              <Text style={styles.emptyTitle}>جارٍ التحميل...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Radio color="#475569" size={32} />
              </View>
              <Text style={styles.emptyTitle}>لا يوجد بث مباشر الآن</Text>
              <Text style={styles.emptySub}>كن أول من يبدأ البث!</Text>
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
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  list: { padding: 12, gap: 12 },
  streamCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 12,
    margin: 6,
    alignItems: 'center',
    position: 'relative',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  viewersBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  viewersText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  hostAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#334155',
    marginTop: 20,
  },
  hostName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  streamTitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  productBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 6,
  },
  productText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  priceText: { color: '#f97316', fontSize: 10, fontWeight: '800' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#64748b', fontSize: 12, marginTop: 4 },
});
