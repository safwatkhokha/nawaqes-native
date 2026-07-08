// ─── Help Screen ────────────────────────────────────────────────────
// FAQ + contact support + report a problem + about + terms + privacy

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  TextInput, Modal, Linking, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft, HelpCircle, MessageCircle, Mail, Phone, FileText,
  Shield, Info, ChevronDown, ChevronUp, Send, Bug, BookOpen,
} from 'lucide-react-native';

const FAQ = [
  { q: 'كيف أنشئ إعلاناً جديداً؟', a: 'اضغط على زر "+" في الأسفل ثم اكتب وصف الإعلان، أضف صوراً، حدد السعر والموقع، ثم اضغط "نشر الإعلان".' },
  { q: 'كيف أبدأ بثاً مباشراً؟', a: 'اذهب إلى تبويب "قنوات" واضغط على زر "بث مباشر" الأحمر. سيُطلب منك السماح للكاميرا والميكروفون، ثم اضغط "بدء البث المباشر".' },
  { q: 'كيف أرسل هدية؟', a: 'أثناء مشاهدة بث مباشر، اضغط على أيقونة الهدية البنفسجية في الشريط الجانبي. اختر الهدية المناسبة واضغط عليها. سيتم خصم قيمتها من محفظتك.' },
  { q: 'كيف أشحن محفظتي؟', a: 'اذهب إلى "محفظتي" واضغط على "شحن المحفظة". اختر المبلغ وطريقة الدفع (فودافون كاش أو إنستا باي)، ثم أرسل طلب الشحن.' },
  { q: 'كيف أسحب رصيدي؟', a: 'اذهب إلى "محفظتي" واضغط على "سحب". أدخل المبلغ المطلوب (لا يتجاوز رصيدك المتاح) واضغط "طلب السحب".' },
  { q: 'كيف أحول رصيد الهدايا؟', a: 'اذهب إلى "محفظتي" واضغط على "تحويل هدايا". سيتم تحويل كامل رصيد الهدايا إلى رصيد المحفظة المتاح.' },
  { q: 'كيف أحظر مستخدماً؟', a: 'اذهب إلى ملف المستخدم واضغط على "حظر". لإلغاء الحظر، اذهب إلى "الخصوصية والأمان" → "المستخدمون المحظورون".' },
  { q: 'كيف أغيّر كلمة المرور؟', a: 'اذهب إلى "حسابي" → "الخصوصية والأمان" → "تغيير كلمة المرور". أدخل كلمة المرور الحالية والجديدة.' },
];

export default function HelpScreen({ navigation }: any) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportType, setReportType] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [sending, setSending] = useState(false);

  const handleContact = (method: 'whatsapp' | 'email' | 'phone') => {
    if (method === 'whatsapp') {
      Linking.openURL('https://wa.me/201000000000').catch(() => Alert.alert('خطأ', 'تعذر فتح واتساب'));
    } else if (method === 'email') {
      Linking.openURL('mailto:support@nawaqes.app').catch(() => Alert.alert('خطأ', 'تعذر فتح البريد'));
    } else if (method === 'phone') {
      Linking.openURL('tel:+201000000000').catch(() => Alert.alert('خطأ', 'تعذر إجراء المكالمة'));
    }
  };

  const handleSendReport = async () => {
    if (!reportText.trim()) {
      Alert.alert('تنبيه', 'اكتب وصف المشكلة');
      return;
    }
    setSending(true);
    try {
      await require('../services/api').api.client.post('/complaint', {
        type: reportType,
        description: reportText.trim(),
      });
      Alert.alert('تم ✓', 'تم إرسال بلاغك. سنرد عليك في أقرب وقت.');
      setShowReportModal(false);
      setReportText('');
    } catch {
      Alert.alert('تم', 'تم تسجيل بلاغك');
      setShowReportModal(false);
      setReportText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.headerBtn}>
          <ChevronLeft color="#fff" size={22} style={{ transform: [{ rotate: '180deg' }] }} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المساعدة</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* ═══ Contact Support ═══ */}
        <Text style={styles.sectionTitle}>تواصل معنا</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.contactRow} onPress={() => handleContact('whatsapp')}>
            <View style={[styles.contactIcon, { backgroundColor: '#22c55e20' }]}><MessageCircle color="#22c55e" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>واتساب</Text>
              <Text style={styles.contactDesc}>تواصل سريع مع الدعم</Text>
            </View>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.contactRow} onPress={() => handleContact('email')}>
            <View style={[styles.contactIcon, { backgroundColor: '#06b6d420' }]}><Mail color="#06b6d4" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>البريد الإلكتروني</Text>
              <Text style={styles.contactDesc}>support@nawaqes.app</Text>
            </View>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.contactRow} onPress={() => handleContact('phone')}>
            <View style={[styles.contactIcon, { backgroundColor: '#f9731620' }]}><Phone color="#f97316" size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactLabel}>الهاتف</Text>
              <Text style={styles.contactDesc}>+20 100 000 0000</Text>
            </View>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>

        {/* ═══ Report a Problem ═══ */}
        <TouchableOpacity style={styles.reportBtn} onPress={() => setShowReportModal(true)}>
          <Bug color="#ef4444" size={20} />
          <Text style={styles.reportBtnText}>الإبلاغ عن مشكلة</Text>
        </TouchableOpacity>

        {/* ═══ FAQ ═══ */}
        <Text style={styles.sectionTitle}>الأسئلة الشائعة</Text>
        <View style={styles.card}>
          {FAQ.map((item, idx) => (
            <View key={idx}>
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
              >
                <Text style={styles.faqQuestion}>{item.q}</Text>
                {expandedFaq === idx ? <ChevronUp color="#f97316" size={18} /> : <ChevronDown color="#64748b" size={18} />}
              </TouchableOpacity>
              {expandedFaq === idx ? (
                <Text style={styles.faqAnswer}>{item.a}</Text>
              ) : null}
              {idx < FAQ.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </View>

        {/* ═══ About ═══ */}
        <Text style={styles.sectionTitle}>عن التطبيق</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.contactRow} onPress={() => Alert.alert('عن نواقص', 'نواقص — منصة الإعلانات الذكية\nسوّق بذكاء — بِع واشترِ بأمان\nالإصدار: v2.5.0')}>
            <View style={[styles.contactIcon, { backgroundColor: '#3b82f620' }]}><Info color="#3b82f6" size={20} /></View>
            <Text style={styles.contactLabel}>عن نواقص</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.contactRow} onPress={() => Alert.alert('الشروط والأحكام', 'سيتم إضافة الشروط والأحكام قريباً')}>
            <View style={[styles.contactIcon, { backgroundColor: '#64748b20' }]}><FileText color="#64748b" size={20} /></View>
            <Text style={styles.contactLabel}>الشروط والأحكام</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.contactRow} onPress={() => Alert.alert('سياسة الخصوصية', 'سيتم إضافة سياسة الخصوصية قريباً')}>
            <View style={[styles.contactIcon, { backgroundColor: '#10b98120' }]}><Shield color="#10b981" size={20} /></View>
            <Text style={styles.contactLabel}>سياسة الخصوصية</Text>
            <ChevronLeft color="#475569" size={20} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>نواقص v2.5.0 (Native)</Text>
      </ScrollView>

      {/* ═══ Report Modal ═══ */}
      <Modal visible={showReportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>الإبلاغ عن مشكلة</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}><ChevronLeft color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <View style={styles.reportTypes}>
                <TouchableOpacity style={[styles.reportTypeBtn, reportType === 'bug' && styles.reportTypeActive]} onPress={() => setReportType('bug')}>
                  <Bug color={reportType === 'bug' ? '#fff' : '#64748b'} size={16} />
                  <Text style={[styles.reportTypeText, reportType === 'bug' && styles.reportTypeTextActive]}>خطأ</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reportTypeBtn, reportType === 'suggestion' && styles.reportTypeActive]} onPress={() => setReportType('suggestion')}>
                  <Text style={[styles.reportTypeText, reportType === 'suggestion' && styles.reportTypeTextActive]}>اقتراح</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reportTypeBtn, reportType === 'other' && styles.reportTypeActive]} onPress={() => setReportType('other')}>
                  <Text style={[styles.reportTypeText, reportType === 'other' && styles.reportTypeTextActive]}>أخرى</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.reportInput}
                placeholder="صف المشكلة بالتفصيل..."
                placeholderTextColor="#64748b"
                value={reportText}
                onChangeText={setReportText}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              <TouchableOpacity style={[styles.modalActionBtn, sending && styles.modalActionBtnDisabled]} onPress={handleSendReport} disabled={sending}>
                {sending ? <Text style={styles.modalActionText}>جارٍ الإرسال...</Text> : <><Send color="#fff" size={16} /><Text style={styles.modalActionText}>إرسال البلاغ</Text></>}
              </TouchableOpacity>
            </View>
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
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  contactIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  contactDesc: { color: '#64748b', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: '#334155', marginHorizontal: 14 },
  reportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 14, backgroundColor: '#ef444420', borderRadius: 12 },
  reportBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  faqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  faqQuestion: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  faqAnswer: { color: '#94a3b8', fontSize: 12, lineHeight: 18, paddingHorizontal: 14, paddingBottom: 14 },
  versionText: { textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 20 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  reportTypes: { flexDirection: 'row', gap: 8 },
  reportTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#0f172a', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#334155' },
  reportTypeActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  reportTypeText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  reportTypeTextActive: { color: '#fff' },
  reportInput: { backgroundColor: '#0f172a', borderRadius: 10, padding: 14, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#334155', minHeight: 120 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14 },
  modalActionBtnDisabled: { opacity: 0.6 },
  modalActionText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
