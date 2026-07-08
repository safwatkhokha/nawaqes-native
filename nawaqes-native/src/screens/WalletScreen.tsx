// ─── Wallet Screen ──────────────────────────────────────────────────
// Shows wallet balance + transactions + charge/withdraw options.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Gift,
  TrendingUp, TrendingDown, Clock,
} from 'lucide-react-native';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
}

export default function WalletScreen() {
  const { user, refreshUser } = useAuth();
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [giftBalance, setGiftBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      const [bal, txs, gifts] = await Promise.all([
        api.getWalletBalance().catch(() => ({ balance: 0 })),
        api.getTransactions().catch(() => []),
        api.client.get('/wallet/gifts').then(r => r.data).catch(() => ({ giftBalance: 0 })),
      ]);

      setBalance(bal.balance || 0);
      setGiftBalance(gifts.giftBalance || 0);
      setTransactions(txs || []);
      await refreshUser();
    } catch (err) {
      Alert.alert('خطأ', 'فشل تحميل بيانات المحفظة');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getTransactionIcon = (type: string) => {
    if (type === 'gift' || type === 'charge' || type === 'gift_received') {
      return type === 'gift' ? <ArrowUpFromLine color="#ef4444" size={18} /> : <ArrowDownToLine color="#10b981" size={18} />;
    }
    return <Clock color="#64748b" size={18} />;
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.txCard}>
      <View style={styles.txIconContainer}>
        {getTransactionIcon(item.type)}
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txDescription} numberOfLines={1}>{item.description || item.type}</Text>
        <Text style={styles.txTime}>{formatTime(item.created_at)}</Text>
      </View>
      <Text style={[
        styles.txAmount,
        { color: item.amount >= 0 ? '#10b981' : '#ef4444' }
      ]}>
        {item.amount >= 0 ? '+' : ''}{item.amount} ج.م
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>محفظتي</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#f97316" />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <Wallet color="#f97316" size={24} />
            <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
          </View>
          <Text style={styles.balanceAmount}>{balance.toLocaleString()} ج.م</Text>

          {/* Gift Balance */}
          <View style={styles.giftBalanceRow}>
            <Gift color="#a855f7" size={16} />
            <Text style={styles.giftBalanceText}>
              رصيد الهدايا: {giftBalance.toLocaleString()} ج.م
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => Alert.alert('قريباً', 'شاشة شحن المحفظة قيد التطوير')}
            >
              <ArrowDownToLine color="#10b981" size={20} />
              <Text style={styles.actionText}>شحن</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => Alert.alert('قريباً', 'شاشة السحب قيد التطوير')}
            >
              <ArrowUpFromLine color="#f97316" size={20} />
              <Text style={styles.actionText}>سحب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={async () => {
                try {
                  await api.client.post('/wallet/withdraw-gifts');
                  Alert.alert('تم', 'تم تحويل رصيد الهدايا للمحفظة');
                  loadData(true);
                } catch (e: any) {
                  Alert.alert('خطأ', e?.response?.data?.error || 'فشل التحويل');
                }
              }}
            >
              <Gift color="#a855f7" size={20} />
              <Text style={styles.actionText}>تحويل هدايا</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <Text style={styles.sectionTitle}>آخر العمليات</Text>
        {transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>لا توجد عمليات بعد</Text>
          </View>
        ) : (
          <FlatList
            data={transactions.slice(0, 20)}
            keyExtractor={(item) => item.id}
            renderItem={renderTransaction}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 20 }}
          />
        )}
      </ScrollView>
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
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  balanceCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  balanceLabel: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 12 },
  giftBalanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  giftBalanceText: { color: '#a855f7', fontSize: 13, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  txIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  txInfo: { flex: 1 },
  txDescription: { color: '#fff', fontSize: 13, fontWeight: '600' },
  txTime: { color: '#64748b', fontSize: 11, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14 },
});
