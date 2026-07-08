// ─── Wallet Screen (Enhanced) ───────────────────────────────────────
// Gradient balance card + gift balance + charge/withdraw/transfer
// + transaction tabs (all/income/expense) + stats + savings goals

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  TouchableOpacity, Alert, ScrollView, Dimensions, Modal, TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  Wallet, ArrowDownToLine, ArrowUpFromLine, Gift,
  TrendingUp, TrendingDown, Clock, ChevronLeft, BadgeCheck,
  Plus, Minus, Send, X, CreditCard, Smartphone, Target,
  PieChart, Zap, History,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  method?: string;
}

type TabType = 'all' | 'income' | 'expense';

export default function WalletScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [balance, setBalance] = useState(user?.wallet_balance || 0);
  const [giftBalance, setGiftBalance] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeMethod, setChargeMethod] = useState<'vodafone' | 'instapay' | 'bank'>('vodafone');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);

      const [bal, txs, gifts] = await Promise.all([
        api.getWalletBalance().catch(() => ({ balance: 0 })),
        api.getTransactions().catch(() => []),
        api.client.get('/wallet/gifts').then(r => r.data).catch(() => ({ giftBalance: 0, totalReceived: 0 })),
      ]);

      setBalance(bal.balance || 0);
      setGiftBalance(gifts.giftBalance || 0);
      setTotalReceived(gifts.totalReceived || 0);
      setTransactions(txs || []);
      await refreshUser();
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Format helpers ────────────────────────────────────────────────
  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `${diffMins} د`;
    if (diffHours < 24) return `${diffHours} س`;
    if (diffDays === 1) return 'أمس';
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  };

  const getTransactionIcon = (type: string) => {
    if (type === 'gift_sent' || type === 'gift') return <Gift color="#ef4444" size={18} />;
    if (type === 'gift_received') return <Gift color="#10b981" size={18} />;
    if (type === 'charge' || type === 'charge_request') return <ArrowDownToLine color="#10b981" size={18} />;
    if (type === 'withdraw' || type === 'withdrawal') return <ArrowUpFromLine color="#ef4444" size={18} />;
    if (type === 'transfer') return <Send color="#06b6d4" size={18} />;
    return <Clock color="#64748b" size={18} />;
  };

  const getTransactionColor = (amount: number) => amount >= 0 ? '#10b981' : '#ef4444';

  // ─── Filtered transactions ─────────────────────────────────────────
  const filteredTx = transactions.filter(tx => {
    if (activeTab === 'income') return tx.amount >= 0;
    if (activeTab === 'expense') return tx.amount < 0;
    return true;
  });

  const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleCharge = async () => {
    const amount = parseFloat(chargeAmount);
    if (!amount || amount <= 0) {
      Alert.alert('تنبيه', 'أدخل مبلغاً صحيحاً');
      return;
    }
    setProcessing(true);
    try {
      await api.client.post('/wallet/charge-request', {
        amount,
        method: chargeMethod,
      });
      Alert.alert('تم ✓', `تم إرسال طلب شحن ${amount} ج.م. سيتم مراجعته خلال 24 ساعة.`);
      setShowChargeModal(false);
      setChargeAmount('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.error || 'فشل طلب الشحن');
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('تنبيه', 'أدخل مبلغاً صحيحاً');
      return;
    }
    if (amount > balance) {
      Alert.alert('رصيد غير كافٍ', `رصيدك: ${balance} ج.م`);
      return;
    }
    setProcessing(true);
    try {
      await api.client.post('/wallet/withdraw', { amount });
      Alert.alert('تم ✓', `تم إرسال طلب سحب ${amount} ج.م`);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      loadData(true);
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.error || 'فشل طلب السحب');
    } finally {
      setProcessing(false);
    }
  };

  const handleTransferGifts = async () => {
    if (giftBalance <= 0) {
      Alert.alert('تنبيه', 'لا يوجد رصيد هدايا لتحويله');
      return;
    }
    Alert.alert(
      'تحويل رصيد الهدايا',
      `سيتم تحويل ${giftBalance.toLocaleString()} ج.م من رصيد الهدايا إلى محفظتك.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تحويل',
          onPress: async () => {
            try {
              await api.client.post('/wallet/withdraw-gifts');
              Alert.alert('تم ✓', 'تم تحويل رصيد الهدايا للمحفظة');
              loadData(true);
            } catch (e: any) {
              Alert.alert('خطأ', e?.response?.data?.error || 'فشل التحويل');
            }
          },
        },
      ]
    );
  };

  // ─── Render transaction ────────────────────────────────────────────
  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.txCard}>
      <View style={[styles.txIconContainer, { backgroundColor: `${getTransactionColor(item.amount)}20` }]}>
        {getTransactionIcon(item.type)}
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txDescription} numberOfLines={1}>{item.description || item.type}</Text>
        <View style={styles.txMetaRow}>
          <Text style={styles.txTime}>{formatTime(item.created_at)}</Text>
          {item.status && item.status !== 'completed' ? (
            <View style={[styles.txStatusBadge, item.status === 'pending' && styles.txStatusPending]}>
              <Text style={styles.txStatusText}>{item.status === 'pending' ? 'قيد المراجعة' : item.status}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={[styles.txAmount, { color: getTransactionColor(item.amount) }]}>
        {item.amount >= 0 ? '+' : ''}{item.amount.toLocaleString()} ج.م
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.headerBtn}>
          <ChevronLeft color="#fff" size={22} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>محفظتي</Text>
        <TouchableOpacity onPress={() => loadData(true)} style={styles.headerBtn}>
          <History color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#f97316" size="large" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor="#f97316" />}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          {/* ═══ Balance Card (gradient) ═══ */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardBg} />
            <View style={styles.balanceContent}>
              <View style={styles.balanceTopRow}>
                <View style={styles.balanceLabelRow}>
                  <Wallet color="#fff" size={20} />
                  <Text style={styles.balanceLabel}>الرصيد المتاح</Text>
                </View>
                {user?.is_verified ? <BadgeCheck color="#fff" size={18} /> : null}
              </View>
              <Text style={styles.balanceAmount}>{balance.toLocaleString('ar-EG')} <Text style={styles.balanceCurrency}>ج.م</Text></Text>
              
              {/* Gift balance mini card */}
              <TouchableOpacity style={styles.giftCard} onPress={handleTransferGifts}>
                <View style={styles.giftCardLeft}>
                  <Gift color="#fbbf24" size={16} />
                  <View>
                    <Text style={styles.giftCardLabel}>رصيد الهدايا</Text>
                    <Text style={styles.giftCardAmount}>{giftBalance.toLocaleString('ar-EG')} ج.م</Text>
                  </View>
                </View>
                <View style={styles.transferBtn}>
                  <Text style={styles.transferBtnText}>تحويل ←</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* ═══ Action Buttons ═══ */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionCard} onPress={() => setShowChargeModal(true)}>
              <View style={[styles.actionIcon, { backgroundColor: '#10b98120' }]}>
                <ArrowDownToLine color="#10b981" size={22} />
              </View>
              <Text style={styles.actionText}>شحن المحفظة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => setShowWithdrawModal(true)}>
              <View style={[styles.actionIcon, { backgroundColor: '#ef444420' }]}>
                <ArrowUpFromLine color="#ef4444" size={22} />
              </View>
              <Text style={styles.actionText}>سحب</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={handleTransferGifts}>
              <View style={[styles.actionIcon, { backgroundColor: '#a855f720' }]}>
                <Gift color="#a855f7" size={22} />
              </View>
              <Text style={styles.actionText}>تحويل هدايا</Text>
            </TouchableOpacity>
          </View>

          {/* ═══ Stats Row ═══ */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <TrendingUp color="#10b981" size={14} />
                <Text style={styles.statLabel}>إجمالي الدخل</Text>
              </View>
              <Text style={[styles.statValue, { color: '#10b981' }]}>+{totalIncome.toLocaleString('ar-EG')}</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statHeader}>
                <TrendingDown color="#ef4444" size={14} />
                <Text style={styles.statLabel}>إجمالي المصروفات</Text>
              </View>
              <Text style={[styles.statValue, { color: '#ef4444' }]}>-{totalExpense.toLocaleString('ar-EG')}</Text>
            </View>
          </View>

          {/* ═══ Transactions Section ═══ */}
          <View style={styles.transactionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>آخر العمليات</Text>
              <Text style={styles.sectionCount}>{transactions.length}</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                onPress={() => setActiveTab('all')}
              >
                <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>الكل</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'income' && styles.tabActive]}
                onPress={() => setActiveTab('income')}
              >
                <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>دخل</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'expense' && styles.tabActive]}
                onPress={() => setActiveTab('expense')}
              >
                <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>مصروفات</Text>
              </TouchableOpacity>
            </View>

            {/* Transactions list */}
            {filteredTx.length === 0 ? (
              <View style={styles.emptyState}>
                <Wallet color="#475569" size={40} />
                <Text style={styles.emptyText}>لا توجد عمليات</Text>
              </View>
            ) : (
              <FlatList
                data={filteredTx.slice(0, 30)}
                keyExtractor={(item) => item.id}
                renderItem={renderTransaction}
                scrollEnabled={false}
              />
            )}
          </View>
        </ScrollView>
      )}

      {/* ═══ Charge Modal ═══ */}
      <Modal visible={showChargeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>شحن المحفظة</Text>
              <TouchableOpacity onPress={() => setShowChargeModal(false)}><X color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 14 }}>
              <Text style={styles.modalLabel}>المبلغ (ج.م)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0"
                placeholderTextColor="#64748b"
                value={chargeAmount}
                onChangeText={setChargeAmount}
                keyboardType="numeric"
              />
              {/* Quick amounts */}
              <View style={styles.quickAmounts}>
                {[50, 100, 200, 500].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={styles.quickAmountBtn}
                    onPress={() => setChargeAmount(String(amt))}
                  >
                    <Text style={styles.quickAmountText}>{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>طريقة الدفع</Text>
              <View style={styles.methodsRow}>
                <TouchableOpacity
                  style={[styles.methodBtn, chargeMethod === 'vodafone' && styles.methodBtnActive]}
                  onPress={() => setChargeMethod('vodafone')}
                >
                  <Smartphone color={chargeMethod === 'vodafone' ? '#fff' : '#94a3b8'} size={18} />
                  <Text style={[styles.methodText, chargeMethod === 'vodafone' && styles.methodTextActive]}>فودافون كاش</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.methodBtn, chargeMethod === 'instapay' && styles.methodBtnActive]}
                  onPress={() => setChargeMethod('instapay')}
                >
                  <CreditCard color={chargeMethod === 'instapay' ? '#fff' : '#94a3b8'} size={18} />
                  <Text style={[styles.methodText, chargeMethod === 'instapay' && styles.methodTextActive]}>إنستا باي</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.modalActionBtn, processing && styles.modalActionBtnDisabled]}
                onPress={handleCharge}
                disabled={processing}
              >
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <><Plus color="#fff" size={18} /><Text style={styles.modalActionText}>طلب الشحن</Text></>}
              </TouchableOpacity>
              <Text style={styles.modalHint}>سيتم مراجعة طلب الشحن خلال 24 ساعة</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Withdraw Modal ═══ */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>سحب رصيد</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}><X color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 14 }}>
              <Text style={styles.modalLabel}>المبلغ (ج.م)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="0"
                placeholderTextColor="#64748b"
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="numeric"
              />
              <View style={styles.balanceHint}>
                <Text style={styles.balanceHintText}>الرصيد المتاح: {balance.toLocaleString('ar-EG')} ج.م</Text>
                <TouchableOpacity onPress={() => setWithdrawAmount(String(balance))}>
                  <Text style={styles.balanceHintAction}>سحب الكل</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.modalActionBtn, { backgroundColor: '#ef4444' }, processing && styles.modalActionBtnDisabled]}
                onPress={handleWithdraw}
                disabled={processing}
              >
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <><Minus color="#fff" size={18} /><Text style={styles.modalActionText}>طلب السحب</Text></>}
              </TouchableOpacity>
              <Text style={styles.modalHint}>سيتم تحويل المبلغ خلال 1-3 أيام عمل</Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Balance card
  balanceCard: { margin: 16, borderRadius: 20, overflow: 'hidden' },
  balanceCardBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#f97316',
  },
  balanceContent: { padding: 20 },
  balanceTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balanceLabel: { color: '#fff', fontSize: 14, fontWeight: '600', opacity: 0.9 },
  balanceAmount: { color: '#fff', fontSize: 38, fontWeight: '900', marginBottom: 16 },
  balanceCurrency: { fontSize: 20, fontWeight: '700', opacity: 0.8 },
  // Gift card inside balance
  giftCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, padding: 12,
  },
  giftCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  giftCardLabel: { color: '#fff', fontSize: 11, opacity: 0.8 },
  giftCardAmount: { color: '#fbbf24', fontSize: 16, fontWeight: '800' },
  transferBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  transferBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  // Actions
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  actionCard: { flex: 1, alignItems: 'center', gap: 8 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  // Stats
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 14, padding: 14 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  statLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: '900' },
  // Transactions
  transactionsSection: { paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sectionCount: { color: '#64748b', fontSize: 13 },
  // Tabs
  tabsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, backgroundColor: '#1e293b', borderRadius: 10, padding: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: '#f97316' },
  tabText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  // Transaction card
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b',
    marginBottom: 8, padding: 14, borderRadius: 12, gap: 12,
  },
  txIconContainer: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  txInfo: { flex: 1 },
  txDescription: { color: '#fff', fontSize: 13, fontWeight: '600' },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  txTime: { color: '#64748b', fontSize: 11 },
  txStatusBadge: { backgroundColor: '#334155', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  txStatusPending: { backgroundColor: '#f59e0b20' },
  txStatusText: { color: '#f59e0b', fontSize: 9, fontWeight: '700' },
  txAmount: { fontSize: 14, fontWeight: '800' },
  // Empty
  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, marginTop: 12 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  modalInput: {
    backgroundColor: '#0f172a', borderRadius: 12, padding: 14,
    color: '#fff', borderWidth: 1, borderColor: '#334155',
  },
  quickAmounts: { flexDirection: 'row', gap: 8 },
  quickAmountBtn: { flex: 1, backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  quickAmountText: { color: '#f97316', fontSize: 14, fontWeight: '700' },
  methodsRow: { flexDirection: 'row', gap: 8 },
  methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#334155' },
  methodBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  methodText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  methodTextActive: { color: '#fff' },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  modalActionBtnDisabled: { opacity: 0.6 },
  modalActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  modalHint: { color: '#64748b', fontSize: 11, textAlign: 'center' },
  balanceHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f172a', borderRadius: 10, padding: 10 },
  balanceHintText: { color: '#94a3b8', fontSize: 12 },
  balanceHintAction: { color: '#f97316', fontSize: 12, fontWeight: '700' },
});
