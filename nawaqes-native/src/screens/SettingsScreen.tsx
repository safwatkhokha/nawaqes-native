// ─── Settings Screen ────────────────────────────────────────────────
// App settings: dark mode, language, notifications, privacy, about.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Linking,
  ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import {
  Moon, Sun, Globe, Bell, Shield, HelpCircle, Info, Share2,
  Star, ChevronLeft, LogOut, Trash2, FileText,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { clearToken } from '../services/api';

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');

  const handleNotifToggle = async (value: boolean) => {
    setNotifEnabled(value);
    if (!value) {
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    } else {
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: 'حمّل تطبيق نواقص الآن! https://safwatkhokha-nawaqes.hf.space/install',
      });
    } catch {}
  };

  const handleClearCache = () => {
    Alert.alert(
      'مسح البيانات',
      'هل تريد مسح جميع البيانات المحلية وتسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'مسح',
          style: 'destructive',
          onPress: async () => {
            await clearToken();
            await logout();
          },
        },
      ]
    );
  };

  const settingsGroups = [
    {
      title: 'المظهر',
      items: [
        {
          icon: darkMode ? Moon : Sun,
          label: 'الوضع الداكن',
          color: '#a855f7',
          type: 'toggle',
          value: darkMode,
          onToggle: () => setDarkMode(!darkMode),
        },
        {
          icon: Globe,
          label: 'اللغة',
          color: '#3b82f6',
          type: 'value',
          value: language === 'ar' ? 'العربية' : 'English',
          onPress: () => {
            setLanguage(prev => prev === 'ar' ? 'en' : 'ar');
            Alert.alert('تنبيه', 'سيتم تطبيق اللغة عند إعادة تشغيل التطبيق');
          },
        },
      ],
    },
    {
      title: 'الإشعارات',
      items: [
        {
          icon: Bell,
          label: 'تفعيل الإشعارات',
          color: '#f97316',
          type: 'toggle',
          value: notifEnabled,
          onToggle: () => handleNotifToggle(!notifEnabled),
        },
      ],
    },
    {
      title: 'الحساب',
      items: [
        {
          icon: Shield,
          label: 'الخصوصية والأمان',
          color: '#10b981',
          type: 'link',
          onPress: () => Alert.alert('قريباً'),
        },
        {
          icon: FileText,
          label: 'سجل النشاط',
          color: '#06b6d4',
          type: 'link',
          onPress: () => Alert.alert('قريباً'),
        },
        {
          icon: Trash2,
          label: 'مسح البيانات',
          color: '#ef4444',
          type: 'link',
          onPress: handleClearCache,
        },
      ],
    },
    {
      title: 'عن التطبيق',
      items: [
        {
          icon: Star,
          label: 'تقييم التطبيق',
          color: '#f59e0b',
          type: 'link',
          onPress: () => Alert.alert('شكراً!', 'التقييم سيكون متاحاً قريباً على Play Store'),
        },
        {
          icon: Share2,
          label: 'مشاركة التطبيق',
          color: '#8b5cf6',
          type: 'link',
          onPress: handleShare,
        },
        {
          icon: HelpCircle,
          label: 'المساعدة والدعم',
          color: '#06b6d4',
          type: 'link',
          onPress: () => Alert.alert('قريباً'),
        },
        {
          icon: Info,
          label: 'حول التطبيق',
          color: '#64748b',
          type: 'value',
          value: 'v2.0.0',
          onPress: () => Alert.alert('نواقص v2.0.0', 'تطبيق نواقص الأصلي\nمبني بـ React Native + Expo\n© 2026 نواقص'),
        },
      ],
    },
  ];

  const renderItem = (item: any) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={item.onPress}
      disabled={item.type === 'toggle'}
    >
      <View style={[styles.settingIcon, { backgroundColor: `${item.color}20` }]}>
        <item.icon color={item.color} size={20} />
      </View>
      <Text style={styles.settingLabel}>{item.label}</Text>
      {item.type === 'toggle' ? (
        <Switch
          value={item.value}
          onValueChange={item.onToggle}
          trackColor={{ false: '#334155', true: '#f97316' }}
          thumbColor={item.value ? '#fff' : '#94a3b8'}
        />
      ) : item.type === 'value' ? (
        <Text style={styles.settingValue}>{item.value}</Text>
      ) : (
        <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <ChevronLeft color="#fff" size={22} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإعدادات</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Settings Groups */}
        {settingsGroups.map((group, gIdx) => (
          <View key={gIdx} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupBody}>
              {group.items.map((item, idx) => (
                <View key={idx}>
                  {renderItem(item)}
                  {idx < group.items.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => {
          Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'خروج', style: 'destructive', onPress: () => logout() },
          ]);
        }}>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  group: { marginHorizontal: 14, marginTop: 20 },
  groupTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '800', marginBottom: 8, marginHorizontal: 4 },
  groupBody: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  settingIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  settingValue: { color: '#64748b', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#334155', marginHorizontal: 14 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 24,
    padding: 14,
    backgroundColor: '#ef444420',
    borderRadius: 12,
  },
  logoutText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  versionText: { textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 20 },
});
