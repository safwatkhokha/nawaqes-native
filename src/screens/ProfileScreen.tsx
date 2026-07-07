// ─── Profile Screen ─────────────────────────────────────────────────
// User profile + settings + logout.

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  Image, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import {
  User, Settings, LogOut, Shield, Bell, HelpCircle,
  ChevronLeft, BadgeCheck, Wallet, Radio, FileText,
} from 'lucide-react-native';

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل تريد تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'خروج', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: 'حمّل تطبيق نواقص الآن! https://safwatkhokha-nawaqes.hf.space/install',
      });
    } catch {}
  };

  const menuItems = [
    { icon: Wallet, label: 'محفظتي', color: '#f97316', onPress: () => navigation?.navigate?.('Wallet') },
    { icon: Radio, label: 'سوق لايف', color: '#ef4444', onPress: () => navigation?.navigate?.('Live') },
    { icon: FileText, label: 'إعلاناتي', color: '#3b82f6', onPress: () => Alert.alert('قريباً') },
    { icon: Bell, label: 'الإشعارات', color: '#a855f7', onPress: () => navigation?.navigate?.('Notifications') },
    { icon: Settings, label: 'الإعدادات', color: '#06b6d4', onPress: () => navigation?.navigate?.('Settings') },
    { icon: Shield, label: 'الخصوصية والأمان', color: '#10b981', onPress: () => Alert.alert('قريباً') },
    { icon: HelpCircle, label: 'المساعدة', color: '#06b6d4', onPress: () => Alert.alert('قريباً') },
  ];

  // Add admin dashboard if user is admin
  if (user?.is_admin) {
    menuItems.unshift({
      icon: Shield,
      label: 'لوحة التحكم',
      color: '#f97316',
      onPress: () => navigation?.navigate?.('AdminDashboard'),
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>حسابي</Text>
        <TouchableOpacity onPress={() => Alert.alert('قريباً', 'الإعدادات قيد التطوير')}>
          <Settings color="#fff" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <Image
            source={{ uri: user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'default'}` }}
            style={styles.avatar}
          />
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{user?.name || 'مستخدم'}</Text>
              {user?.is_verified ? <BadgeCheck color="#3b82f6" size={18} /> : null}
            </View>
            <Text style={styles.email}>{user?.email || ''}</Text>
            {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user?.wallet_balance?.toFixed(0) || 0}</Text>
            <Text style={styles.statLabel}>رصيد المحفظة</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user?.trust_score || 50}</Text>
            <Text style={styles.statLabel}>نقاط الثقة</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              style={[styles.menuItem, idx === menuItems.length - 1 && styles.menuItemLast]}
              onPress={item.onPress}
            >
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}20` }]}>
                <item.icon color={item.color} size={20} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Share App */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareText}>شارك التطبيق مع أصدقائك</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut color="#ef4444" size={20} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>نواقص v2.0.0 (Native)</Text>
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#334155',
  },
  profileInfo: { flex: 1, marginLeft: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#fff', fontSize: 18, fontWeight: '800' },
  email: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  phone: { color: '#64748b', fontSize: 12, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { color: '#f97316', fontSize: 20, fontWeight: '900' },
  statLabel: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  menu: {
    marginHorizontal: 16,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 12,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  shareButton: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: '#f9731620',
    borderRadius: 12,
    alignItems: 'center',
  },
  shareText: { color: '#f97316', fontSize: 14, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#ef444420',
    borderRadius: 12,
  },
  logoutText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  versionText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 11,
    marginTop: 20,
  },
});
