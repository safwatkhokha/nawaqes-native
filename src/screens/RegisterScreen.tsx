// ─── Register Screen ────────────────────────────────────────────────
// Native registration with name, email, phone, password, gender.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import {
  Mail, Lock, User as UserIcon, Phone, Eye, EyeOff,
  ArrowRight, Check,
} from 'lucide-react-native';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = (): boolean => {
    if (!name.trim()) { setError('الاسم مطلوب'); return false; }
    if (!email.trim()) { setError('البريد الإلكتروني مطلوب'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('البريد الإلكتروني غير صالح'); return false; }
    if (!phone.trim()) { setError('رقم الهاتف مطلوب'); return false; }
    if (!/^01[0-9]{9}$/.test(phone.replace(/\s/g, ''))) { setError('رقم الهاتف غير صالح (مثال: 01012345678)'); return false; }
    if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return false; }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم');
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setError('');
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        gender,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'فشل التسجيل';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
              <ArrowRight color="#fff" size={22} />
            </TouchableOpacity>
            <Text style={styles.title}>إنشاء حساب</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Name */}
            <View style={styles.inputContainer}>
              <UserIcon color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="الاسم الكامل"
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Email */}
            <View style={styles.inputContainer}>
              <Mail color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor="#64748b"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* Phone */}
            <View style={styles.inputContainer}>
              <Phone color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="رقم الهاتف (01012345678)"
                placeholderTextColor="#64748b"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Gender */}
            <View style={styles.genderRow}>
              <Text style={styles.label}>الجنس:</Text>
              <TouchableOpacity
                style={[styles.genderBtn, gender === 'male' && styles.genderBtnActive]}
                onPress={() => setGender('male')}
              >
                <Text style={[styles.genderText, gender === 'male' && styles.genderTextActive]}>ذكر</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderBtn, gender === 'female' && styles.genderBtnActive]}
                onPress={() => setGender('female')}
              >
                <Text style={[styles.genderText, gender === 'female' && styles.genderTextActive]}>أنثى</Text>
              </TouchableOpacity>
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <Lock color="#94a3b8" size={20} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="كلمة المرور"
                placeholderTextColor="#64748b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                {showPassword ? <EyeOff color="#94a3b8" size={20} /> : <Eye color="#94a3b8" size={20} />}
              </TouchableOpacity>
            </View>

            {/* Requirements hint */}
            <Text style={styles.hint}>
              كلمة المرور: 8 أحرف على الأقل، حرف كبير + حرف صغير + رقم
            </Text>

            {/* Register Button */}
            <TouchableOpacity
              style={[styles.registerButton, loading && styles.registerButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Check color="#fff" size={18} />
                  <Text style={styles.registerButtonText}>إنشاء الحساب</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { flexGrow: 1, padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 24, fontWeight: '900' },
  form: { gap: 12 },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: '#ef4444', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 0 },
  eyeButton: { padding: 4 },
  label: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  genderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  genderBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  genderBtnActive: { backgroundColor: '#f97316', borderColor: '#f97316' },
  genderText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  genderTextActive: { color: '#fff' },
  hint: { color: '#64748b', fontSize: 11, marginTop: -4 },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f97316',
    borderRadius: 12,
    height: 52,
    marginTop: 8,
  },
  registerButtonDisabled: { opacity: 0.6 },
  registerButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
