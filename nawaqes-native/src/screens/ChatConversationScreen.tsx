// ─── Chat Conversation Screen ───────────────────────────────────────
// Message thread + send text/images.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  Image, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../services/api';
import { ArrowRight, Send, Image as ImageIcon, Plus } from 'lucide-react-native';

interface Message {
  id: string;
  text?: string;
  image_url?: string;
  sender_id: string;
  created_at: string;
  isMine: boolean;
}

export default function ChatConversationScreen({ route, navigation }: any) {
  const { contactId, contactName, contactAvatar } = route?.params || {};
  const { user } = require('../contexts/AuthContext').useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.client.get(`/chat/messages/${contactId}`);
      const data = res.data || [];
      setMessages(data.map((m: any) => ({
        id: m.id,
        text: m.text || m.content,
        image_url: m.image_url || m.image,
        sender_id: m.sender_id,
        created_at: m.created_at,
        isMine: m.sender_id === user?.id,
      })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [contactId, user?.id]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000); // poll every 5s
    return () => clearInterval(interval);
  }, [loadMessages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const msgText = text.trim();
    setText('');
    setSending(true);
    try {
      const res = await api.client.post(`/chat/messages/${contactId}`, { text: msgText });
      setMessages(prev => [...prev, {
        id: res.data?.id || Date.now().toString(),
        text: msgText,
        sender_id: user?.id,
        created_at: new Date().toISOString(),
        isMine: true,
      }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('خطأ', 'فشل إرسال الرسالة');
      setText(msgText);
    } finally {
      setSending(false);
    }
  };

  const handleSendImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;
      const uploadRes = await api.uploadImage(uri);
      if (!uploadRes?.url) throw new Error('Upload failed');

      const res = await api.client.post(`/chat/messages/${contactId}`, {
        text: '',
        image: uploadRes.url,
      });

      setMessages(prev => [...prev, {
        id: res.data?.id || Date.now().toString(),
        image_url: uploadRes.url,
        sender_id: user?.id,
        created_at: new Date().toISOString(),
        isMine: true,
      }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('خطأ', 'فشل إرسال الصورة');
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const fixUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `https://safwatkhokha-nawaqes.hf.space${url}`;
  };

  const renderMessage = ({ item }: { item: Message }) => (
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
        <Text style={[styles.msgTime, item.isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
          {formatTime(item.created_at)}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <ArrowRight color="#fff" size={22} />
        </TouchableOpacity>
        <Image
          source={{ uri: contactAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contactId}` }}
          style={styles.headerAvatar}
        />
        <Text style={styles.headerName} numberOfLines={1}>{contactName || 'مستخدم'}</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={handleSendImage}>
            <ImageIcon color="#94a3b8" size={22} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="اكتب رسالة..."
            placeholderTextColor="#64748b"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Send color="#fff" size={18} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155' },
  headerName: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  msgRow: { flexDirection: 'row', marginVertical: 2 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
  },
  msgBubbleMine: { backgroundColor: '#f97316', borderBottomRightRadius: 4 },
  msgBubbleTheirs: { backgroundColor: '#1e293b', borderBottomLeftRadius: 4 },
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMine: { color: '#fff' },
  msgTextTheirs: { color: '#e2e8f0' },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMine: { color: 'rgba(255,255,255,0.7)' },
  msgTimeTheirs: { color: '#64748b' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
});
