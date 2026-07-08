// ─── Create Post Screen ─────────────────────────────────────────────
// Native image picker + upload + post creation.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { X, Image as ImageIcon, Send, Loader2 } from 'lucide-react-native';

export default function CreatePostScreen({ navigation }: any) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [posting, setPosting] = useState(false);

  const pickImages = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('إذن مطلوب', 'يجب السماح بالوصول للصور لرفعها');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 8 - selectedImages.length,
      });

      if (!result.canceled && result.assets) {
        const newUris = result.assets.map(a => a.uri);
        setSelectedImages(prev => [...prev, ...newUris].slice(0, 8));
      }
    } catch (err: any) {
      Alert.alert('خطأ', 'فشل اختيار الصور');
    }
  };

  const removeImage = (idx: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePost = async () => {
    if (!content.trim() && selectedImages.length === 0) {
      Alert.alert('تنبيه', 'اكتب محتوى أو أضف صورة');
      return;
    }

    setPosting(true);
    try {
      // Upload images first
      let imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        setUploading(true);
        for (let i = 0; i < selectedImages.length; i++) {
          setUploadProgress(Math.round(((i) / selectedImages.length) * 100));
          try {
            const result = await api.uploadImage(selectedImages[i]);
            if (result?.url) imageUrls.push(result.url);
          } catch (err: any) {
            Alert.alert('خطأ', `فشل رفع الصورة ${i + 1}: ${err?.message || ''}`);
            setPosting(false);
            setUploading(false);
            return;
          }
        }
        setUploading(false);
      }

      // Create post
      setUploadProgress(100);
      await api.createPost({
        content: content.trim(),
        image: imageUrls.length > 0 ? JSON.stringify(imageUrls) : '',
        type: 'ad',
        price: price ? parseFloat(price) : null,
        location: location.trim(),
      });

      Alert.alert('تم', 'تم نشر الإعلان بنجاح ✓', [
        { text: 'حسناً', onPress: () => navigation?.navigate?.('Home') },
      ]);
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل النشر');
    } finally {
      setPosting(false);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <X color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إعلان جديد</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Content */}
          <TextInput
            style={styles.contentInput}
            placeholder="ما الذي تبيعه؟ اكتب وصف الإعلان..."
            placeholderTextColor="#64748b"
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />

          {/* Selected Images */}
          {selectedImages.length > 0 ? (
            <View style={styles.imagesGrid}>
              {selectedImages.map((uri, idx) => (
                <View key={idx} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.imageThumb} />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeImage(idx)}
                  >
                    <X color="#fff" size={14} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {/* Add Image Button */}
          {selectedImages.length < 8 ? (
            <TouchableOpacity style={styles.addImageBtn} onPress={pickImages}>
              <ImageIcon color="#f97316" size={24} />
              <Text style={styles.addImageText}>
                إضافة صور ({selectedImages.length}/8)
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Price + Location */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>السعر (اختياري)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#64748b"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.label}>الموقع (اختياري)</Text>
              <TextInput
                style={styles.input}
                placeholder="المدينة"
                placeholderTextColor="#64748b"
                value={location}
                onChangeText={setLocation}
              />
            </View>
          </View>

          {/* Upload Progress */}
          {uploading ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color="#f97316" size="small" />
              <Text style={styles.progressText}>جارٍ رفع الصور... {uploadProgress}%</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Post Button (fixed bottom) */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.postBtn, posting && styles.postBtnDisabled]}
            onPress={handlePost}
            disabled={posting}
          >
            {posting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Send color="#fff" size={18} />
                <Text style={styles.postBtnText}>نشر</Text>
              </>
            )}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  contentInput: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 15,
    minHeight: 100,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  imageWrapper: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  imageThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 12,
    marginBottom: 16,
  },
  addImageText: { color: '#f97316', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', marginBottom: 12 },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    marginBottom: 12,
  },
  progressText: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  bottomBar: {
    padding: 16,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f97316',
    borderRadius: 12,
    paddingVertical: 14,
  },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
