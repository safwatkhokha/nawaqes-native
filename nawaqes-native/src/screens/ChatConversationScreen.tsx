// ─── Chat Conversation Screen (Enhanced) ────────────────────────────
// Message thread with: bubble chat, image send, typing indicator,
// message timestamps, delete messages, online status, auto-scroll.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight, Send, Image as ImageIcon, Plus, BadgeCheck,
  Trash2, Camera, Mic, Smile, X, Phone, Video,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface Message {
  id: string;
  text?: string;
  image_url?: string;
  sender_id: string;
  created_at: string;
  isMine: boolean;
  status?: string;
}

export default function ChatConversationScreen({ route, navigation }: any) {
  const { contactId, contactName, contactAvatar } = route?.params || {};
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const fixUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://safwatkhokha-nawaqes.hf.space${url}`;
  };

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.client.get(`/chat/messages/${contactId}`);
      const data = res.data || [];
      const mapped = data.map((m: any) => ({
        id: m.id,
        text: m.text || m.content || '',
        image_url: m.image_url || m.image || '',
        sender_id: m.sender_id,
        created_at: m.created_at,
        isMine: m.sender_id === user?.id,
        status: m.status,
      }));
      setMessages(mapped);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [contactId, user?.id]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // ─── Send text ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim()) return;
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      const res = await api.client.post('/chat/send', { receiverId: contactId, text: msgText });
      setMessages(prev => [...prev, {
        id: res.data?.id || Date.now().toString(),
        text: msgText,
        sender_id: user?.id || '',
        created_at: new Date().toISOString(),
        isMine: true,
      }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('خطأ', 'فشل إرسال الرسالة');
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  // ─── Send image from gallery ───────────────────────────────────────
  const handleSendImage = async () => {
    setShowImageOptions(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;
      await uploadAndSendImage(result.assets[0].uri);
    } catch {
      Alert.alert('خطأ', 'فشل إرسال الصورة');
    }
  };

  // ─── Take photo and send ───────────────────────────────────────────
  const handleTakePhoto = async () => {
    setShowImageOptions(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;
      await uploadAndSendImage(result.assets[0].uri);
    } catch {
      Alert.alert('خطأ', 'فشل التقاط الصورة');
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    try {
      const uploadRes = await api.uploadImage(uri);
      if (!uploadRes?.url) throw new Error('Upload failed');

      const res = await api.client.post(`/chat/messages/${contactId}`, {
        text: '',
        image: uploadRes.url,
      });

      setMessages(prev => [...prev, {
        id: res.data?.id || Date.now().toString(),
        image_url: uploadRes.url,
        sender_id: user?.id || '',
        created_at: new Date().toISOString(),
        isMine: true,
      }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('خطأ', 'فشل رفع الصورة');
    }
  };

  // ─── Delete message ────────────────────────────────────────────────
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await api.client.delete(`/chat/messages/${selectedMessage.id}`);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      setSelectedMessage(null);
    } catch {
      Alert.alert('خطأ', 'فشل حذف الرسالة');
    }
  };

  // ─── Format helpers ────────────────────────────────────────────────
  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'اليوم';
    if (diffDays === 1) return 'أمس';
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ─── Render message ────────────────────────────────────────────────
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const prevMsg = messages[index - 1];
    const showDateSep = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(item.created_at).toDateString();

    return (
      <View>
        {showDateSep ? (
          <View style={styles.dateSeparator}>
            <View style={styles.dateSepLine} />
            <Text style={styles.dateSepText}>{formatDateSeparator(item.created_at)}</Text>
            <View style={styles.dateSepLine} />
          </View>
        ) : null}

        <TouchableOpacity
          onLongPress={() => item.isMine && setSelectedMessage(item)}
          activeOpacity={0.8}
        >
          <View style={[styles.msgRow, item.isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
            <View style={[styles.msgBubble, item.isMine ? styles.msgBubbleMine : styles.msgBubbleTheirs]}>
              {item.image_url ? (
                <Image
                  source={{ uri: fixUrl(item.image_url) }}
                  style={styles.msgImage}
                  resizeMode="cover"
                />
              ) : null}
              {item.text ? (
                <Text style={[styles.msgText, item.isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
                  {item.text}
                </Text>
              ) : null}
              <View style={styles.msgMetaRow}>
                <Text style={[styles.msgTime, item.isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
                  {formatTime(item.created_at)}
                </Text>
                {item.isMine ? (
                  <Text style={styles.msgCheck}>✓✓</Text>
                ) : null}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.headerBtn}>
          <ArrowRight color="#fff" size={22} />
        </TouchableOpacity>
        <View style={styles.headerAvatarWrap}>
          <Image
            source={{ uri: contactAvatar ? (contactAvatar.startsWith('http') ? contactAvatar : fixUrl(contactAvatar)) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${contactId}` }}
            style={styles.headerAvatar}
          />
          <View style={styles.headerOnlineDot} />
        </View>
        <View style={styles.headerInfo}>
          <View style={styles.headerNameRow}>
            <Text style={styles.headerName} numberOfLines={1}>{contactName || 'مستخدم'}</Text>
          </View>
          <Text style={styles.headerStatus}>متصل الآن</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('قريباً', 'المكالمات قيد التطوير')}>
          <Phone color="#fff" size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerBtn} onPress={() => Alert.alert('قريباً', 'مكالمات الفيديو قيد التطوير')}>
          <Video color="#fff" size={18} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#f97316" size="large" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 12, gap: 4, paddingBottom: 20 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <MessageCircleIcon />
                <Text style={styles.emptyChatText}>لا توجد رسائل بعد</Text>
                <Text style={styles.emptyChatSub}>ابدأ المحادثة بإرسال رسالة!</Text>
              </View>
            }
          />
        )}

        {/* Typing indicator */}
        {isTyping ? (
          <View style={styles.typingBar}>
            <View style={styles.typingDots}>
              <View style={[styles.typingDot, styles.typingDot1]} />
              <View style={[styles.typingDot, styles.typingDot2]} />
              <View style={[styles.typingDot, styles.typingDot3]} />
            </View>
            <Text style={styles.typingText}>يكتب...</Text>
          </View>
        ) : null}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={() => setShowImageOptions(true)}>
            <Plus color="#f97316" size={22} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="اكتب رسالة..."
            placeholderTextColor="#64748b"
            value={text}
            onChangeText={(t) => { setText(t); setIsTyping(t.length > 0); }}
            multiline
            maxLength={1000}
          />
          {text.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              <Send color="#fff" size={18} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.attachBtn} onPress={() => Alert.alert('قريباً', 'الرموز التعبيرية قيد التطوير')}>
              <Smile color="#94a3b8" size={22} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Image options modal */}
      <Modal visible={showImageOptions} transparent animationType="slide">
        <TouchableOpacity style={styles.imageOptionsOverlay} activeOpacity={1} onPress={() => setShowImageOptions(false)}>
          <View style={styles.imageOptionsPanel}>
            <View style={styles.imageOptionsHandle} />
            <Text style={styles.imageOptionsTitle}>إرسال صورة</Text>
            <TouchableOpacity style={styles.imageOption} onPress={handleTakePhoto}>
              <View style={[styles.imageOptionIcon, { backgroundColor: '#f9731620' }]}>
                <Camera color="#f97316" size={22} />
              </View>
              <Text style={styles.imageOptionText}>التقاط صورة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageOption} onPress={handleSendImage}>
              <View style={[styles.imageOptionIcon, { backgroundColor: '#3b82f620' }]}>
                <ImageIcon color="#3b82f6" size={22} />
              </View>
              <Text style={styles.imageOptionText}>اختيار من المعرض</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageOptionCancel} onPress={() => setShowImageOptions(false)}>
              <Text style={styles.imageOptionCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete message modal */}
      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity style={styles.deleteOverlay} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
          <View style={styles.deletePanel}>
            <TouchableOpacity style={styles.deleteOption} onPress={handleDeleteMessage}>
              <Trash2 color="#ef4444" size={20} />
              <Text style={styles.deleteOptionText}>حذف الرسالة</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteCancel} onPress={() => setSelectedMessage(null)}>
              <Text style={styles.deleteCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// Simple inline icon for empty state
function MessageCircleIcon() {
  return <Plus color="#475569" size={40} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#334155' },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e',
    borderWidth: 2, borderColor: '#1e293b',
  },
  headerInfo: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerStatus: { color: '#22c55e', fontSize: 11, marginTop: 1 },
  // Loading
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Empty chat
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyChatText: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 16 },
  emptyChatSub: { color: '#64748b', fontSize: 13, marginTop: 4 },
  // Date separator
  dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: '#334155' },
  dateSepText: { color: '#64748b', fontSize: 11, fontWeight: '600' },
  // Message
  msgRow: { flexDirection: 'row', marginVertical: 2 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgBubble: { maxWidth: '75%', borderRadius: 16, padding: 10 },
  msgBubbleMine: { backgroundColor: '#f97316', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: '#1e293b', borderBottomLeftRadius: 4 },
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMine: { color: '#fff' },
  msgTextTheirs: { color: '#e2e8f0' },
  msgMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-end' },
  msgTime: { fontSize: 10 },
  msgTimeMine: { color: 'rgba(255,255,255,0.7)' },
  msgTimeTheirs: { color: '#64748b' },
  msgCheck: { fontSize: 10, color: 'rgba(255,255,255,0.9)' },
  // Typing
  typingBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 6 },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#64748b' },
  typingDot1: { opacity: 0.4 },
  typingDot2: { opacity: 0.7 },
  typingDot3: { opacity: 1 },
  typingText: { color: '#64748b', fontSize: 11 },
  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155',
  },
  attachBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, backgroundColor: '#0f172a', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14,
    maxHeight: 100, borderWidth: 1, borderColor: '#334155',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  // Image options modal
  imageOptionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  imageOptionsPanel: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  imageOptionsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155', alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  imageOptionsTitle: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  imageOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  imageOptionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  imageOptionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  imageOptionCancel: { marginTop: 8, padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155' },
  imageOptionCancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  // Delete modal
  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  deletePanel: { backgroundColor: '#1e293b', borderRadius: 16, width: '80%', overflow: 'hidden' },
  deleteOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  deleteOptionText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
  deleteCancel: { padding: 16, alignItems: 'center' },
  deleteCancelText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
});
