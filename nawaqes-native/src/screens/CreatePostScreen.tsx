// ─── Create Post Screen (v3 — Full Marketplace Ad) ──────────────────
// Multi-image + video + category + condition + price/negotiable + location
// + description + tags + schedule + draft + preview + post type toggle

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView,
  Platform, Dimensions, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  X, Image as ImageIcon, Send, Loader2, Tag, MapPin, DollarSign,
  Video as VideoIcon, ShoppingBag, FileText, Camera, ChevronLeft,
  Check, Clock, Star, Package, Sparkles, Hash, ChevronDown, ChevronUp,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { id: 'electronics', label: 'إلكترونيات', icon: '📱' },
  { id: 'vehicles', label: 'سيارات', icon: '🚗' },
  { id: 'fashion', label: 'أزياء', icon: '👕' },
  { id: 'home', label: 'منزل وأثاث', icon: '🏠' },
  { id: 'services', label: 'خدمات', icon: '🔧' },
  { id: 'jobs', label: 'وظائف', icon: '💼' },
  { id: 'realestate', label: 'عقارات', icon: '🏢' },
  { id: 'other', label: 'أخرى', icon: '📦' },
];

const CONDITIONS = [
  { id: 'new', label: 'جديد', icon: '✨', color: '#10b981' },
  { id: 'like-new', label: 'مثل الجديد', icon: '🌟', color: '#3b82f6' },
  { id: 'good', label: 'جيد', icon: '👍', color: '#f59e0b' },
  { id: 'fair', label: 'مقبول', icon: '🔧', color: '#ef4444' },
];

export default function CreatePostScreen({ navigation }: any) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('ج.م');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [negotiable, setNegotiable] = useState(true);
  const [exchange, setExchange] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [postType, setPostType] = useState<'ad' | 'post'>('ad');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [posting, setPosting] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const fixUrl = (u?: string) => u ? (u.startsWith('http') ? u : `https://safwatkhokha-nawaqes.hf.space${u}`) : undefined;

  // ─── Pick images ───────────────────────────────────────────────────
  const pickImages = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('إذن مطلوب', 'يجب السماح بالوصول للصور'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true, quality: 0.8,
        selectionLimit: 8 - selectedImages.length,
      });
      if (!result.canceled && result.assets) {
        setSelectedImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 8));
      }
    } catch { Alert.alert('خطأ', 'فشل اختيار الصور'); }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('إذن مطلوب', 'يجب السماح بالوصول للكاميرا'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        setSelectedImages(prev => [...prev, result.assets[0].uri].slice(0, 8));
      }
    } catch { Alert.alert('خطأ', 'فشل التقاط الصورة'); }
  };

  const removeImage = (idx: number) => setSelectedImages(prev => prev.filter((_, i) => i !== idx));

  const pickVideo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8, videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets?.[0]) setSelectedVideo(result.assets[0].uri);
    } catch { Alert.alert('خطأ', 'فشل اختيار الفيديو'); }
  };

  const removeVideo = () => setSelectedVideo(null);

  // ─── Tags ──────────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim().replace(/#/g, '');
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));

  // ─── Handle post ───────────────────────────────────────────────────
  const handlePost = async (asDraft = false) => {
    if (!content.trim() && selectedImages.length === 0 && !selectedVideo && !title.trim()) {
      Alert.alert('تنبيه', 'اكتب عنواناً أو محتوى أو أضف صورة/فيديو');
      return;
    }

    setPosting(true);
    try {
      let imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        setUploading(true);
        for (let i = 0; i < selectedImages.length; i++) {
          setUploadProgress(Math.round((i / selectedImages.length) * 100));
          try {
            const result = await api.uploadImage(selectedImages[i]);
            if (result?.url) imageUrls.push(result.url);
          } catch (err: any) {
            Alert.alert('خطأ', `فشل رفع الصورة ${i + 1}`);
            setPosting(false); setUploading(false); return;
          }
        }
        setUploading(false);
      }

      let videoUrl = '';
      if (selectedVideo) {
        setVideoUploading(true); setUploading(true); setUploadProgress(0);
        try {
          const result = await api.uploadVideo(selectedVideo, (p: number) => setUploadProgress(p));
          videoUrl = result?.url || '';
        } catch {
          Alert.alert('خطأ', 'فشل رفع الفيديو');
          setPosting(false); setUploading(false); setVideoUploading(false); return;
        }
        setUploading(false); setVideoUploading(false);
      }

      setUploadProgress(100);
      await api.createPost({
        content: (title.trim() ? `【${title.trim()}】\n` : '') + content.trim(),
        image: imageUrls.length > 0 ? JSON.stringify(imageUrls) : '',
        video_url: videoUrl || undefined,
        type: postType,
        price: price ? parseFloat(price) : null,
        currency: currency,
        location: location.trim(),
        category: category,
        condition: condition,
        tags: tags.length > 0 ? JSON.stringify(tags) : undefined,
        negotiable: negotiable,
        exchange: exchange,
        delivery: delivery,
        status: asDraft ? 'draft' : 'active',
      });

      Alert.alert('تم ✓', asDraft ? 'تم حفظ المسودة' : (postType === 'ad' ? 'تم نشر الإعلان بنجاح' : 'تم نشر المنشور بنجاح'), [
        { text: 'حسناً', onPress: () => navigation?.navigate?.('Home') },
      ]);
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.error || 'فشل النشر');
    } finally {
      setPosting(false); setUploading(false); setVideoUploading(false); setUploadProgress(0);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.id === category);
  const selectedCondition = CONDITIONS.find(c => c.id === condition);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()}>
          <X color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{postType === 'ad' ? 'إعلان جديد' : 'منشور جديد'}</Text>
        <TouchableOpacity onPress={() => handlePost(true)} disabled={posting}>
          <Text style={[styles.draftBtn, posting && { opacity: 0.4 }]}>مسودة</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollViewRef} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* Post type toggle */}
          <View style={styles.typeToggle}>
            <TouchableOpacity style={[styles.typeBtn, postType === 'ad' && styles.typeBtnActive]} onPress={() => setPostType('ad')}>
              <ShoppingBag color={postType === 'ad' ? '#fff' : '#64748b'} size={16} />
              <Text style={[styles.typeBtnText, postType === 'ad' && styles.typeBtnTextActive]}>إعلان للبيع</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeBtn, postType === 'post' && styles.typeBtnActive]} onPress={() => setPostType('post')}>
              <FileText color={postType === 'post' ? '#fff' : '#64748b'} size={16} />
              <Text style={[styles.typeBtnText, postType === 'post' && styles.typeBtnTextActive]}>منشور عادي</Text>
            </TouchableOpacity>
          </View>

          {/* Title (for ads) */}
          {postType === 'ad' ? (
            <View>
              <Text style={styles.label}>عنوان الإعلان</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="مثال: آيفون 14 برو ماكس بحالة ممتازة"
                placeholderTextColor="#64748b"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </View>
          ) : null}

          {/* Content */}
          <TextInput
            style={styles.contentInput}
            placeholder={postType === 'ad' ? 'صف المنتج بالتفصيل: الحالة، المواصفات، الملحقات...' : 'بم تفكر؟ اكتب منشورك...'}
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
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(idx)}>
                    <X color="#fff" size={14} />
                  </TouchableOpacity>
                  {idx === 0 && selectedImages.length > 1 ? (
                    <View style={styles.coverBadge}><Text style={styles.coverText}>غلاف</Text></View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* Video preview */}
          {selectedVideo ? (
            <View style={styles.videoPreviewWrap}>
              <View style={styles.videoPreview}><VideoIcon color="#a855f7" size={48} /></View>
              <TouchableOpacity style={styles.removeVideoBtn} onPress={removeVideo}>
                <X color="#fff" size={16} />
              </TouchableOpacity>
              <View style={styles.videoLabel}>
                <VideoIcon color="#fff" size={12} />
                <Text style={styles.videoLabelText}>فيديو</Text>
              </View>
            </View>
          ) : null}

          {/* Media buttons */}
          {selectedImages.length < 8 && !selectedVideo ? (
            <View style={styles.mediaRow}>
              <TouchableOpacity style={styles.mediaBtn} onPress={pickImages}>
                <ImageIcon color="#f97316" size={20} />
                <Text style={styles.mediaBtnText}>صور ({selectedImages.length}/8)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaBtn} onPress={takePhoto}>
                <Camera color="#f97316" size={20} />
                <Text style={styles.mediaBtnText}>كاميرا</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mediaBtn, { borderColor: '#a855f7' }]} onPress={pickVideo}>
                <VideoIcon color="#a855f7" size={20} />
                <Text style={[styles.mediaBtnText, { color: '#a855f7' }]}>فيديو</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Video upload progress */}
          {videoUploading ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color="#a855f7" size="small" />
              <Text style={[styles.progressText, { color: '#a855f7' }]}>جارٍ رفع الفيديو... {uploadProgress}%</Text>
            </View>
          ) : null}

          {/* Price + Currency + Location (for ads) */}
          {postType === 'ad' ? (
            <>
              <View style={styles.row}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}><DollarSign color="#94a3b8" size={12} /> السعر</Text>
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor="#64748b" value={price} onChangeText={setPrice} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>العملة</Text>
                  <TextInput style={styles.input} placeholder="ج.م" placeholderTextColor="#64748b" value={currency} onChangeText={setCurrency} />
                </View>
              </View>

              <Text style={styles.label}><MapPin color="#94a3b8" size={12} /> الموقع</Text>
              <TextInput style={styles.input} placeholder="المدينة، الحي" placeholderTextColor="#64748b" value={location} onChangeText={setLocation} />

              {/* Category selector */}
              <Text style={styles.label}><Tag color="#94a3b8" size={12} /> التصنيف</Text>
              <TouchableOpacity style={styles.categoryBtn} onPress={() => setShowCategoryModal(true)}>
                <Text style={styles.categoryBtnText}>
                  {selectedCategory ? `${selectedCategory.icon} ${selectedCategory.label}` : 'اختر التصنيف'}
                </Text>
                <ChevronLeft color="#64748b" size={18} style={{ transform: [{ rotate: '180deg' }] }} />
              </TouchableOpacity>

              {/* Condition selector */}
              <Text style={styles.label}><Package color="#94a3b8" size={12} /> حالة المنتج</Text>
              <View style={styles.conditionRow}>
                {CONDITIONS.map(cond => (
                  <TouchableOpacity
                    key={cond.id}
                    style={[styles.conditionChip, condition === cond.id && { backgroundColor: cond.color, borderColor: cond.color }]}
                    onPress={() => setCondition(cond.id)}
                  >
                    <Text style={styles.conditionIcon}>{cond.icon}</Text>
                    <Text style={[styles.conditionText, condition === cond.id && styles.conditionTextActive]}>{cond.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Toggles */}
              <View style={styles.togglesCard}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleLabel}>السعر قابل للتفاوض</Text>
                    <Text style={styles.toggleDesc}>يمكن للمشترين التفاوض</Text>
                  </View>
                  <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ false: '#334155', true: '#f97316' }} thumbColor="#fff" />
                </View>
                <View style={styles.toggleDivider} />
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleLabel}>قابل للمبادلة</Text>
                    <Text style={styles.toggleDesc}>أقبل المبادلة بمنتج آخر</Text>
                  </View>
                  <Switch value={exchange} onValueChange={setExchange} trackColor={{ false: '#334155', true: '#10b981' }} thumbColor="#fff" />
                </View>
                <View style={styles.toggleDivider} />
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLeft}>
                    <Text style={styles.toggleLabel}>توصيل متاح</Text>
                    <Text style={styles.toggleDesc}>أوصل المنتج للمشتري</Text>
                  </View>
                  <Switch value={delivery} onValueChange={setDelivery} trackColor={{ false: '#334155', true: '#3b82f6' }} thumbColor="#fff" />
                </View>
              </View>

              {/* Advanced section */}
              <TouchableOpacity style={styles.advancedBtn} onPress={() => setShowAdvanced(!showAdvanced)}>
                <Sparkles color="#f97316" size={16} />
                <Text style={styles.advancedBtnText}>خيارات متقدمة</Text>
                {showAdvanced ? <ChevronUp color="#64748b" size={18} /> : <ChevronDown color="#64748b" size={18} />}
              </TouchableOpacity>

              {showAdvanced ? (
                <View style={styles.advancedSection}>
                  {/* Tags */}
                  <Text style={styles.label}><Hash color="#94a3b8" size={12} /> الوسوم (حد أقصى 5)</Text>
                  <View style={styles.tagsRow}>
                    {tags.map(t => (
                      <View key={t} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>#{t}</Text>
                        <TouchableOpacity onPress={() => removeTag(t)}><X color="#94a3b8" size={12} /></TouchableOpacity>
                      </View>
                    ))}
                    {tags.length < 5 ? (
                      <View style={styles.tagInputWrap}>
                        <Hash color="#64748b" size={14} />
                        <TextInput
                          style={styles.tagInput}
                          placeholder="إضافة وسم"
                          placeholderTextColor="#64748b"
                          value={tagInput}
                          onChangeText={setTagInput}
                          onSubmitEditing={addTag}
                          maxLength={20}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {/* Upload Progress */}
          {uploading && !videoUploading ? (
            <View style={styles.progressBox}>
              <ActivityIndicator color="#f97316" size="small" />
              <Text style={styles.progressText}>جارٍ رفع الصور... {uploadProgress}%</Text>
            </View>
          ) : null}

          {/* Preview card */}
          {(content || selectedImages.length > 0 || title) ? (
            <View style={styles.previewSection}>
              <Text style={styles.previewLabel}>معاينة</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Image
                    source={{ uri: user?.avatar ? fixUrl(user.avatar) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id || 'me'}` }}
                    style={styles.previewAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewName}>{user?.name}</Text>
                    <Text style={styles.previewTime}>الآن</Text>
                  </View>
                  {postType === 'ad' ? <View style={styles.previewAdBadge}><Text style={styles.previewAdText}>إعلان</Text></View> : null}
                </View>
                {title ? <Text style={styles.previewTitle}>{title}</Text> : null}
                {content ? <Text style={styles.previewContent} numberOfLines={3}>{content}</Text> : null}
                {selectedImages.length > 0 ? (
                  <Image source={{ uri: selectedImages[0] }} style={styles.previewImage} resizeMode="cover" />
                ) : null}
                {price ? (
                  <View style={styles.previewPriceRow}>
                    <Text style={styles.previewPrice}>{price} {currency}</Text>
                    {negotiable ? <Text style={styles.previewNeg}>قابل للتفاوض</Text> : null}
                  </View>
                ) : null}
                {location ? <Text style={styles.previewLocation}>📍 {location}</Text> : null}
                {selectedCondition ? (
                  <View style={styles.previewCondition}>
                    <Text style={styles.previewConditionText}>{selectedCondition.icon} {selectedCondition.label}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* Post Button */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.postBtn, posting && styles.postBtnDisabled]}
            onPress={() => handlePost(false)}
            disabled={posting}
          >
            {posting ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Send color="#fff" size={18} />
                <Text style={styles.postBtnText}>{postType === 'ad' ? 'نشر الإعلان' : 'نشر المنشور'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Category Modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>اختر التصنيف</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}><X color="#94a3b8" size={22} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryOption, category === cat.id && styles.categoryOptionActive]}
                  onPress={() => { setCategory(cat.id); setShowCategoryModal(false); }}
                >
                  <Text style={styles.categoryOptionIcon}>{cat.icon}</Text>
                  <Text style={styles.categoryOptionLabel}>{cat.label}</Text>
                  {category === cat.id ? <View style={styles.categoryCheck}><Text style={styles.categoryCheckText}>✓</Text></View> : null}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.categoryOption, !category && styles.categoryOptionActive]}
                onPress={() => { setCategory(''); setShowCategoryModal(false); }}
              >
                <Text style={styles.categoryOptionIcon}>❌</Text>
                <Text style={styles.categoryOptionLabel}>بدون تصنيف</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  draftBtn: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: 12, backgroundColor: '#1e293b', borderRadius: 12, padding: 4 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  typeBtnActive: { backgroundColor: '#f97316' },
  typeBtnText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  typeBtnTextActive: { color: '#fff' },
  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  titleInput: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  contentInput: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, minHeight: 100, marginBottom: 12, borderWidth: 1, borderColor: '#334155', lineHeight: 22 },
  imagesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  imageWrapper: { position: 'relative', width: 100, height: 100 },
  imageThumb: { width: '100%', height: '100%', borderRadius: 12 },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' },
  coverBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: '#f97316', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  coverText: { color: '#fff', fontSize: 8, fontWeight: '800' },
  videoPreviewWrap: { position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  videoPreview: { height: 200, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  removeVideoBtn: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' },
  videoLabel: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(168,85,247,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  videoLabelText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  mediaRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  mediaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderWidth: 2, borderColor: '#334155', borderStyle: 'dashed', borderRadius: 12 },
  mediaBtnText: { color: '#f97316', fontSize: 12, fontWeight: '700' },
  progressBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 12 },
  progressText: { color: '#f97316', fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', marginBottom: 12 },
  input: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#334155' },
  categoryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e293b', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#334155' },
  categoryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  conditionRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  conditionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  conditionIcon: { fontSize: 14 },
  conditionText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  conditionTextActive: { color: '#fff' },
  togglesCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 4, marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  toggleLeft: { flex: 1 },
  toggleLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  toggleDesc: { color: '#64748b', fontSize: 11, marginTop: 2 },
  toggleDivider: { height: 1, backgroundColor: '#334155', marginHorizontal: 12 },
  advancedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 12 },
  advancedBtnText: { color: '#f97316', fontSize: 13, fontWeight: '700', flex: 1 },
  advancedSection: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 12 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f9731620', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  tagChipText: { color: '#f97316', fontSize: 12, fontWeight: '700' },
  tagInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  tagInput: { color: '#fff', fontSize: 12, minWidth: 60 },
  previewSection: { marginTop: 8 },
  previewLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  previewCard: { backgroundColor: '#1e293b', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  previewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155' },
  previewName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  previewTime: { color: '#64748b', fontSize: 10, marginTop: 1 },
  previewAdBadge: { backgroundColor: '#3b82f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  previewAdText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  previewTitle: { color: '#fff', fontSize: 15, fontWeight: '800', paddingHorizontal: 12, paddingBottom: 4 },
  previewContent: { color: '#e2e8f0', fontSize: 13, paddingHorizontal: 12, paddingBottom: 8, lineHeight: 18 },
  previewImage: { width: '100%', height: 160, backgroundColor: '#0f172a' },
  previewPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  previewPrice: { color: '#f97316', fontSize: 18, fontWeight: '900' },
  previewNeg: { color: '#10b981', fontSize: 11, fontWeight: '600', backgroundColor: '#10b98120', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  previewLocation: { color: '#64748b', fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  previewCondition: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12 },
  previewConditionText: { color: '#94a3b8', fontSize: 11, fontWeight: '600', backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bottomBar: { padding: 16, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155' },
  postBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f97316', borderRadius: 12, paddingVertical: 14 },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  categoryOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  categoryOptionActive: { backgroundColor: '#f9731620' },
  categoryOptionIcon: { fontSize: 24 },
  categoryOptionLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  categoryCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center' },
  categoryCheckText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
