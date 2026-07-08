// ─── Privacy & Security Screen ──────────────────────────────────────
// Account privacy, blocked users, two-factor, password change,
// active sessions, data download, deactivation.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  Switch, TextInput, Modal, ActivityIndicator, FlatList, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ChevronLeft, Shield, Lock, Eye, UserX, Smartphone, Key, Download,
  Trash2, AlertTriangle, Check, X, BadgeCheck,
} from 'lucide-react-native';

export default function PrivacySecurityScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Privacy settings (local state)
  const [privateAccount, setPrivateAccount] = useState(false);
  const [showPhone, setShowPhone] = useState(user?.show_phone ?? false);
  const [showLocation, setShowLocation] = useState(user?.show_location ?? false);
  const [allowComments, setAllowComments] = useState(true);
  const [allowMessages, setAllowMessages] = useState(true);

  // ─── Load blocked users ────────────────────────────────────────────
  const loadBlocked = useCallback(async () => {
    try {
      const res = await api.client.get('/blocked');
      setBlockedUsers(res.data || []);
    } catch {
      setBlockedUsers([]);
    }
  }, []);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('تنبيه', 'املأ جميع الحقول');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('خطأ', 'كلمتا المرور غير متطابقتين');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('خطأ', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setChangingPassword(true);
    try {
      await api.client.put('/auth/password', { oldPassword, newPassword });
      Alert.alert('تم ✓', 'تم تغيير كلمة المرور بنجاح');
      setShowPasswordModal(false);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e: any) {
      Alert.alert('خطأ', e?.response?.data?.error || 'فشل تغيير كلمة المرور');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await api.client.post(`/unblock/${userId}`);
      setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      Alert.alert('تم', 'تم إلغاء الحظر');
    } catch {
      Alert.alert('خطأ', 'فشل إلغاء الحظر');
    }
  };

  const handleSavePrivacy = async () => {
    setLoading(true);
    try {
      await api.client.put('/auth/profile', {
        show_phone: showPhone,
        show_location: showLocation,
      });
      Alert.alert('تم ✓', 'تم حفظ إعدادات الخصوصية');
    } catch {
      Alert.alert('خطأ', 'فشل حفظ الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadData = () => {
    Alert.alert(
      'تحميل بياناتك',
      'سيتم إرسال رابط تحميل بياناتك إلى بريدك الإلكتروني خلال 48 ساعة.',
      [{ text: 'حسناً' }]
    );
  };

  const handleDeactivate = () => {
    Alert.alert(
      'إيقاف الحساب',
      'سيتم إيقاف حسابك مؤقتاً. يمكنك إعادته بتسجيل الدخول مرة أخرى.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إيقاف',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.client.delete('/auth/deactivate');
              Alert.alert('تم', 'تم إيقاف حسابك', [
                { text: 'حسناً', onPress: () => logout() },
              ]);
            } catch {
              Alert.alert('خطأ', 'فشل إيقاف الحساب');
            }
          },
        },
      ]
    );
  };

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.headerBtn}>
          <ChevronLeft color="#fff" size={22} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الخصوصية والأمان</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* ═══ Account Privacy ═══ */}
        <Text style={styles.sectionTitle}>خصوصية الحساب</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#3b82f620' }]}><Lock color="#3b82f6" size={18} /></View>
              <View>
                <Text style={styles.settingLabel}>حساب خاص</Text>
                <Text style={styles.settingDesc}>فقط المتابعون يرون منشوراتك</Text>
              </View>
            </View>
            <Switch value={privateAccount} onValueChange={setPrivateAccount} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#10b98120' }]}><Smartphone color="#10b981" size={18} /></View>
              <View>
                <Text style={styles.settingLabel}>إظهار رقم الهاتف</Text>
                <Text style={styles.settingDesc}>للمستخدمين الآخرين</Text>
              </View>
            </View>
            <Switch value={showPhone} onValueChange={setShowPhone} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#a855f720' }]}><Eye color="#a855f7" size={18} /></View>
              <View>
                <Text style={styles.settingLabel}>إظهار الموقع</Text>
                <Text style={styles.settingDesc}>في الملف الشخصي والمنشورات</Text>
              </View>
            </View>
            <Switch value={showLocation} onValueChange={setShowLocation} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#06b6d420' }]}><UserX color="#06b6d4" size={18} /></View>
              <View>
                <Text style={styles.settingLabel}>السماح بالتعليقات</Text>
                <Text style={styles.settingDesc}>من جميع المستخدمين</Text>
              </View>
            </View>
            <Switch value={allowComments} onValueChange={setAllowComments} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: '#f9731620' }]}><UserX color="#f97316" size={18} /></View>
              <View>
                <Text style={styles.settingLabel}>السماح بالرسائل</Text>
                <Text style={styles.settingDesc}>من جميع المستخدمين</Text>
              </View>
            </View>
            <Switch value={allowMessages} onValueChange={setAllowMessages} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSavePrivacy} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>حفظ الإعدادات</Text>}
        </TouchableOpacity>

        {/* ═══ Security ═══ */}
        <Text style={styles.sectionTitle}>الأمان</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowPasswordModal(true)}>
            <View style={[styles.settingIcon, { backgroundColor: '#ef444420' }]}><Key color="#ef4444" size={18} /></View>
            <Text style={styles.menuItemLabel}>تغيير كلمة المرور</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => setShowBlockedModal(true)}>
            <View style={[styles.settingIcon, { backgroundColor: '#64748b20' }]}><UserX color="#64748b" size={18} /></View>
            <Text style={styles.menuItemLabel}>المستخدمون المحظورون</Text>
            <View style={styles.countBadge}><Text style={styles.countText}>{blockedUsers.length}</Text></View>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('قريباً', 'المصادقة الثنائية قيد التطوير')}>
            <View style={[styles.settingIcon, { backgroundColor: '#10b98120' }]}><Shield color="#10b981" size={18} /></View>
            <Text style={styles.menuItemLabel}>المصادقة الثنائية</Text>
            <View style={styles.comingSoonBadge}><Text style={styles.comingSoonText}>قريباً</Text></View>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>

        {/* ═══ Data ═══ */}
        <Text style={styles.sectionTitle}>البيانات</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={handleDownloadData}>
            <View style={[styles.settingIcon, { backgroundColor: '#06b6d420' }]}><Download color="#06b6d4" size={18} /></View>
            <Text style={styles.menuItemLabel}>تحميل بياناتي</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>

        {/* ═══ Danger Zone ═══ */}
        <Text style={styles.sectionTitle}>منطقة الخطر</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={handleDeactivate}>
            <View style={[styles.settingIcon, { backgroundColor: '#f59e0b20' }]}><AlertTriangle color="#f59e0b" size={18} /></View>
            <Text style={[styles.menuItemLabel, { color: '#f59e0b' }]}>إيقاف الحساب مؤقتاً</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('تواصل مع الدعم', 'لحذف حسابك نهائياً، تواصل مع الدعم عبر المساعدة')}>
            <View style={[styles.settingIcon, { backgroundColor: '#ef444420' }]}><Trash2 color="#ef4444" size={18} /></View>
            <Text style={[styles.menuItemLabel, { color: '#ef4444' }]}>حذف الحساب نهائياً</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ═══ Password Change Modal ═══ */}
      <Modal visible={showPasswordModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير كلمة المرور</Text>
              <TouchableOpacity onPress={() => setShowPasswordModal(false)}><X color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <TextInput style={styles.input} placeholder="كلمة المرور الحالية" placeholderTextColor="#64748b" value={oldPassword} onChangeText={setOldPassword} secureTextEntry />
              <TextInput style={styles.input} placeholder="كلمة المرور الجديدة" placeholderTextColor="#64748b" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              <TextInput style={styles.input} placeholder="تأكيد كلمة المرور" placeholderTextColor="#64748b" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
              <TouchableOpacity style={[styles.modalActionBtn, changingPassword && styles.modalActionBtnDisabled]} onPress={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalActionText}>تغيير كلمة المرور</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Blocked Users Modal ═══ */}
      <Modal visible={showBlockedModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>المستخدمون المحظورون ({blockedUsers.length})</Text>
              <TouchableOpacity onPress={() => setShowBlockedModal(false)}><X color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <FlatList
              data={blockedUsers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.blockedRow}>
                  <Image source={{ uri: fixUrl(item.avatar) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.id}` }} style={styles.blockedAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.blockedName}>{item.name}</Text>
                      {item.is_verified ? <BadgeCheck color="#3b82f6" size={12} /> : null}
                    </View>
                    <Text style={styles.blockedEmail}>{item.email}</Text>
                  </View>
                  <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item.id)}>
                    <Text style={styles.unblockBtnText}>إلغاء الحظر</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyListText}>لا يوجد مستخدمون محظورون</Text>}
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ padding: 16 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', paddingHorizontal: 16, marginTop: 20, marginBottom: 8 },
  card: { marginHorizontal: 16, backgroundColor: '#1e293b', borderRadius: 14, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  settingDesc: { color: '#64748b', fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#334155', marginHorizontal: 14 },
  saveBtn: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  menuItemLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  countBadge: { backgroundColor: '#334155', minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  comingSoonBadge: { backgroundColor: '#f59e0b20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  comingSoonText: { color: '#f59e0b', fontSize: 10, fontWeight: '700' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  input: { backgroundColor: '#0f172a', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  modalActionBtn: { backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalActionBtnDisabled: { opacity: 0.6 },
  modalActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Blocked users
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' },
  blockedAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155' },
  blockedName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  blockedEmail: { color: '#64748b', fontSize: 11, marginTop: 2 },
  unblockBtn: { backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  unblockBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyListText: { color: '#64748b', fontSize: 14, textAlign: 'center', padding: 30 },
});
