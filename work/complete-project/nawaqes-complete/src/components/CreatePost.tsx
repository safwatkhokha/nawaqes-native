import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { User, Post } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Video, Image as ImageIcon, Smile, X, MapPin, Tag, Camera, Type, Palette, Send, Loader2, Truck } from 'lucide-react';
import { toast } from '../lib/silentToast';
import { useLanguage } from '../contexts/LanguageContext';
import { interestCategories } from '../config/interests';

interface CreatePostProps {
  user: User | null;
  onPostCreated?: () => void;
  isModal?: boolean;
  /** When the modal is opened from a specific context (e.g. the FoodPage
   *  "+ أضف طبق" button), pre-select the matching post type so the user
   *  doesn't have to manually switch from "إعلان" to the correct type. */
  initialPostType?: 'ad' | 'status' | 'food';
}

const storyColors = [
  'from-purple-600 to-blue-600',
  'from-orange-500 to-red-500',
  'from-green-500 to-teal-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-purple-500',
  'from-yellow-500 to-orange-500',
];

export const CreatePost: React.FC<CreatePostProps> = ({ user, onPostCreated, isModal, initialPostType = 'ad' }) => {
  const { addPost, addStory, darkMode, refreshData, setShowCreatePost } = useAppContext();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  // 🔧 FIX: Generate a unique ID for the file input so that multiple
  // CreatePost instances (e.g. the inline one on the home page + the
  // modal one from GlobalCreatePostModal) don't share the same ID.
  // Previously the hardcoded id="fileInputRef-input" caused the browser
  // to activate the FIRST input with that ID when a <label htmlFor> was
  // clicked — which was always the inline CreatePost, not the modal one.
  // Result: the image was selected in the wrong instance and the modal
  // created a post without the image.
  const uniqueId = useId();
  const fileInputId = `file-input-${uniqueId}`;

  const feelings = [
    { emoji: '😊', key: 'feeling_happy' },
    { emoji: '😍', key: 'feeling_pleased' },
    { emoji: '🥰', key: 'feeling_loving' },
    { emoji: '😎', key: 'feeling_confident' },
    { emoji: '🤔', key: 'feeling_thinking' },
    { emoji: '😢', key: 'feeling_sad' },
    { emoji: '🔥', key: 'feeling_excited' },
    { emoji: '💪', key: 'feeling_active' },
    { emoji: '🎉', key: 'feeling_celebrating' },
    { emoji: '😴', key: 'feeling_tired' },
    { emoji: '🤩', key: 'feeling_amazed' },
    { emoji: '🙏', key: 'feeling_grateful' },
  ];

  const activities = [
    { emoji: '🛒', key: 'activity_shopping' },
    { emoji: '📱', key: 'activity_sellingPhone' },
    { emoji: '🚗', key: 'activity_sellingCar' },
    { emoji: '🏠', key: 'activity_listingProperty' },
    { emoji: '💻', key: 'activity_sellingLaptop' },
    { emoji: '🎮', key: 'activity_sellingGames' },
    { emoji: '💼', key: 'activity_jobHunting' },
    { emoji: '📦', key: 'activity_offeringService' },
  ];

  const adCategories = interestCategories.map(cat => ({
    id: cat.id,
    nameKey: cat.nameKey,
    icon: cat.icon,
  }));

  // Auto-expand when opened as modal
  const [isOpen, setIsOpen] = useState(isModal ? true : false);
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const MAX_IMAGES = 8;
  const [selectedFeeling, setSelectedFeeling] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyColor, setStoryColor] = useState(storyColors[0]);
  const [postLocation, setPostLocation] = useState('');
  const [postPrice, setPostPrice] = useState('');
  const [postType, setPostType] = useState<'ad' | 'status' | 'food'>(initialPostType);
  const [postCategory, setPostCategory] = useState<string>('');
  // 🍔 Food-specific fields — only shown when postType='food'
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState('');
  const [workingHours, setWorkingHours] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storyImageRef = useRef<HTMLInputElement>(null);
  const [storyImage, setStoryImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Listen for 'openStoryCreator' custom event from Stories component
  useEffect(() => {
    const handleOpenStoryCreator = () => {
      setShowStoryCreator(true);
    };
    window.addEventListener('openStoryCreator', handleOpenStoryCreator);
    return () => {
      window.removeEventListener('openStoryCreator', handleOpenStoryCreator);
    };
  }, []);

  // Auto-focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // ─── Auto-resize textarea ───────────────────────────────────────
  // As the user types, the textarea grows to fit its content (max ~240px),
  // then scrolls internally — like Facebook/WhatsApp post composers.
  const autoResizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };
  useEffect(() => {
    autoResizeTextarea();
  }, [content, isOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - selectedImages.length;
    if (remaining <= 0) { toast.error('الحد الأقصى ' + MAX_IMAGES + ' صور/فيديو'); e.target.value = ''; return; }
    Array.from(files).slice(0, remaining).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) { toast.error(isVideo ? 'حجم الفيديو كبير' : 'حجم الصورة كبير'); return; }
      // 🔧 FIX: Store BOTH the File object (for upload) AND the data URL (for preview)
      setSelectedFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onload = (ev) => { setSelectedImages(prev => [...prev, ev.target?.result as string]); };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleClose = () => {
    if (isModal) {
      setShowCreatePost(false);
    } else {
      setIsOpen(false);
    }
    setContent('');
    setSelectedImages([]);
    setSelectedFiles([]);
    setSelectedFeeling(null);
    setSelectedActivity(null);
    setPostPrice('');
    setPostLocation('');
    setPostCategory('');
    setShowFeelingPicker(false);
    setShowActivityPicker(false);
  };

  const handleSubmit = async () => {
    if ((!content.trim() && selectedImages.length === 0) || isSubmitting) return;

    const postContent = content.trim() + (selectedFeeling ? ` ${selectedFeeling}` : '') + (selectedActivity ? ` ${selectedActivity}` : '');

    // Capture form state BEFORE uploading so we still have it if the
    // upload fails and the user needs to retry.
    const savedContent = content;
    const savedImages = selectedImages;
    const savedFiles = selectedFiles;
    const savedFeeling = selectedFeeling;
    const savedActivity = selectedActivity;
    const savedLocation = postLocation;
    const savedPrice = postPrice;
    const savedCategory = postCategory;

    // 🔧 FIX: Show loading state but DON'T close the modal or clear the
    // form until the upload + post creation succeed. Previously the modal
    // closed immediately and the form was cleared — so if the image
    // upload failed, the user lost their content and saw no feedback.
    setIsSubmitting(true);

    // 🔧 FIX: Upload each image to server first, then send URLs (not base64)
    // This prevents timeout/failure from sending huge base64 JSON payloads
    let uploadedImageUrls: string[] = [];
    // 🔧 FIX: Use the original File objects directly (no base64 conversion)
    if (savedFiles.length > 0) {
      for (let i = 0; i < savedFiles.length; i++) {
        const file = savedFiles[i];
        try {
          let result;
          if (file.type.startsWith('video/')) {
            result = await api.uploadVideo(file);
          } else {
            result = await api.uploadImage(file);
          }
          if (result?.url) {
            uploadedImageUrls.push(result.url);
          } else {
            toast.error(`فشل رفع الصورة ${i + 1}`);
          }
        } catch (err: any) {
          console.error('[CreatePost] Upload failed:', i, err);
          toast.error(`فشل رفع الصورة ${i + 1}: ${err.message || ''}`);
          // 🔧 FIX: If ANY image fails to upload, abort the entire submit
          // so the user can see the error and retry — instead of creating
          // a post without the image silently.
          setIsSubmitting(false);
          return;
        }
      }
    }

    // Persist to database via API — send server URLs (not base64)
    try {
      const savedPost = await api.createPost({
        content: postContent,
        image: uploadedImageUrls.length > 0 ? JSON.stringify(uploadedImageUrls) : '',
        type: postType,
        price: savedPrice ? parseInt(savedPrice) : null,
        currency: savedPrice ? t('common.egp') : 'ج.م',
        location: savedLocation || '',
        category: (postType === 'ad' || postType === 'food') && savedCategory ? savedCategory : '',
        feeling: savedFeeling || '',
        activity: savedActivity || '',
        // 🍔 Food-specific fields — only sent when postType='food'
        ...(postType === 'food' ? {
          delivery_available: deliveryAvailable,
          delivery_fee: deliveryFee ? Number(deliveryFee) : 0,
          working_hours: workingHours.trim(),
          prep_time: prepTime.trim(),
          contact_phone: contactPhone.trim(),
        } : {}),
      });

      // Add the server-returned post to local state with the correct database ID
      const newPost: Post = {
        id: savedPost.id,
        author: {
          id: savedPost.author?.id || user?.id || 'me',
          name: savedPost.author?.name || user?.name || t('common.user'),
          avatar: savedPost.author?.avatar || user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default',
          isVerified: savedPost.author?.is_verified || savedPost.author?.isVerified,
          trustScore: savedPost.author?.trust_score || savedPost.author?.trustScore,
          interests: savedPost.author?.interests,
        },
        content: savedPost.content || postContent,
        image: savedPost.image || (uploadedImageUrls.length > 0 ? JSON.stringify(uploadedImageUrls) : undefined),
        likes: savedPost.likes || 0,
        comments: savedPost.comments || 0,
        shares: savedPost.shares || 0,
        timestamp: new Date().toISOString(),
        type: savedPost.type || postType,
        price: savedPost.price || (savedPrice ? parseInt(savedPrice) : undefined),
        currency: savedPost.currency || (savedPrice ? t('common.egp') : undefined),
        location: savedPost.location || savedLocation || undefined,
        feeling: savedPost.feeling || savedFeeling || undefined,
        activity: savedPost.activity || savedActivity || undefined,
        category: savedPost.category || (postType === 'ad' && savedCategory ? savedCategory : undefined),
        isPromoted: savedPost.is_promoted || savedPost.isPromoted,
        promotionStatus: savedPost.promotion_status || savedPost.promotionStatus,
        promotionTier: savedPost.promotion_tier || savedPost.promotionTier,
      };
      addPost(newPost);
      toast.success(t('app.postPublished'));
      // 🔧 CRITICAL: Refresh from server to sync the real post data
      // (the optimistic local post may have different ID/structure than server)
      refreshData();
      // 🔧 FIX: Only clear the form and close the modal AFTER the post
      // was successfully created. This way the user retains their content
      // if the upload or post creation fails.
      setContent('');
      setSelectedImages([]);
      setSelectedFiles([]);
      setSelectedFeeling(null);
      setSelectedActivity(null);
      setPostLocation('');
      setPostPrice('');
      setPostCategory('');
      // 🍔 Reset food-specific fields too
      setDeliveryAvailable(false);
      setDeliveryFee('');
      setWorkingHours('');
      setPrepTime('');
      setContactPhone('');
      setShowFeelingPicker(false);
      setShowActivityPicker(false);
      setIsOpen(false);
      if (isModal) setShowCreatePost(false);
      // ─── Scroll the feed to top so the user sees their new post ──
      // (Only for the inline home composer — not for the modal, which
      // closes via setShowCreatePost and the user is already looking at
      // the feed behind it.)
      if (!isModal) {
        const mainScroll = document.getElementById('main-feed-scroll');
        if (mainScroll) {
          mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } catch (err: any) {
      // Fallback: add post with local ID if API fails, so user doesn't lose content
      const fallbackPost: Post = {
        id: `p_${Date.now()}`,
        author: user || { id: 'me', name: t('common.user'), avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default' },
        content: postContent,
        image: uploadedImageUrls.length > 0 ? JSON.stringify(uploadedImageUrls) : undefined,
        likes: 0,
        comments: 0,
        shares: 0,
        timestamp: new Date().toISOString(),
        type: postType,
        price: savedPrice ? parseInt(savedPrice) : undefined,
        currency: savedPrice ? t('common.egp') : undefined,
        location: savedLocation || undefined,
        feeling: savedFeeling || undefined,
        activity: savedActivity || undefined,
        category: postType === 'ad' && savedCategory ? savedCategory : undefined,
      };
      addPost(fallbackPost);
      toast.error(err.message || t('common.error'));
      // Still try to refresh — maybe the post was actually saved on the server
      refreshData();
    } finally {
      setIsSubmitting(false);
    }

    if (onPostCreated) onPostCreated();
  };

  const handleCreateStory = async () => {
    if (!storyText.trim() && !storyImage) return;
    const newStory = {
      id: `story_${Date.now()}`,
      user: { id: user?.id || 'me', name: user?.name || t('common.user'), avatar: user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Default' },
      image: storyImage || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="500"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:%23933ea1"/><stop offset="100%" style="stop-color:%232196F3"/></linearGradient></defs><rect fill="url(%23g)" width="300" height="500"/><text x="150" y="250" text-anchor="middle" fill="white" font-size="20" font-weight="bold">${storyText.slice(0, 30)}</text></svg>`)}`,
      isSeen: false,
      createdAt: new Date().toISOString(),
      type: storyImage ? 'image' as const : 'text' as const,
      text: storyText,
      backgroundColor: storyColor,
    };
    // Add to local state immediately
    addStory(newStory);
    setStoryText('');
    setStoryImage(null);
    setShowStoryCreator(false);

    // Persist story to database via API
    try {
      await api.createStory({
        text: storyText,
        image: storyImage || '',
        backgroundColor: storyColor,
        type: storyImage ? 'image' : 'text',
      });
      toast.success(t('createPost.storyCreated'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  // 🔧 REMOVED: handleLiveVideo — standalone /live-stream is deprecated.
  // Live streaming is now done inside Channels (/channels/:id/live).

  // Validation: can submit if content or image provided
  const canSubmit = (content.trim() || selectedImages.length > 0) && !isSubmitting;

  return (
    <div dir={dir} className={`${isModal ? 'pb-4' : `${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl shadow-sm border p-4 mb-4`}`}>
      {/* Story Creator Modal */}
      {showStoryCreator && (
        <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowStoryCreator(false)}>
          <div dir={dir} className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('createPost.createStory')}</h3>
              <button onClick={() => setShowStoryCreator(false)} className={`w-8 h-8 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} rounded-full flex items-center justify-center`}><X className="w-4 h-4" /></button>
            </div>
            {/* Story Preview */}
            <div className={`relative h-80 bg-gradient-to-br ${storyColor} flex items-center justify-center p-6`}>
              {storyImage ? (
                <img src={storyImage} alt="Story" className="absolute inset-0 w-full h-full object-cover" />
              ) : null}
              <div className="relative z-10 text-center">
                <textarea
                  value={storyText}
                  onChange={e => setStoryText(e.target.value)}
                  placeholder={t('createPost.writeStoryText')}
                  className="w-full bg-transparent text-white text-2xl font-black text-center outline-none resize-none placeholder:text-white/50"
                  rows={3}
                  maxLength={100}
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                />
              </div>
            </div>
            {/* Color picker */}
            <div className={`p-4 space-y-3 ${darkMode ? 'bg-gray-800' : ''}`}>
              <div className="flex gap-2 justify-center">
                {storyColors.map((color, i) => (
                  <button key={i} onClick={() => setStoryColor(color)}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${color} ${storyColor === color ? `ring-2 ring-orange-600 ${darkMode ? 'ring-offset-gray-800' : ''} ring-offset-2` : ''}`} />
                ))}
              </div>
              <input id="storyImageRef-input" ref={storyImageRef} type="file" accept="image/*" className="sr-only" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) { const reader = new FileReader(); reader.onload = (ev) => setStoryImage(ev.target?.result as string); reader.readAsDataURL(file); }
              }} />
              <label htmlFor="storyImageRef-input" className={`w-full flex items-center justify-center gap-2 p-3 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl transition-colors`} style={{cursor:"pointer"}}>
                <Camera className="w-5 h-5 text-green-600" />
                <span className={`text-sm font-bold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>{t('createPost.addImageBtn')}</span>
              </label>
              <button onClick={handleCreateStory} disabled={!storyText.trim() && !storyImage}
                className="w-full bg-orange-600 text-white py-3 rounded-xl font-black hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {t('createPost.publishStory')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Header (only in modal mode) */}
      {isModal && (
        <div className={`flex items-center justify-between px-4 pt-2 pb-1`}>
          <h3 className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('createPost.publish')}</h3>
          <button onClick={handleClose} className={`w-8 h-8 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} rounded-full flex items-center justify-center transition-colors`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Input Row (only when NOT expanded) */}
      {!isOpen && !isModal && (
        <div className="flex items-center gap-3 mb-4">
          <img src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Default"} className={`w-10 h-10 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} alt={user?.name || t('common.user')} />
          <button
            onClick={() => setIsOpen(true)}
            className={`flex-1 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} text-start px-4 py-2.5 rounded-full transition-colors truncate`}
          >
            {t('createPost.whatAreYouThinking', { name: user?.name?.split(' ')[0] || t('common.user') })}
          </button>
        </div>
      )}

      {/* Expanded Post Form */}
      {isOpen && (
        <div className={`${isModal ? 'px-4 pt-2' : `mb-4 border ${darkMode ? 'border-gray-700' : 'border-gray-100'} rounded-2xl p-4`}`}>
          {/* User info row */}
          <div className="flex items-center gap-3 mb-3">
            <img src={user?.avatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=Default"} className={`w-10 h-10 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`} alt={user?.name || t('common.user')} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user?.name || t('common.user')}</p>
              {/* Post type toggle */}
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => setPostType('ad')} className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                  postType === 'ad'
                    ? 'bg-orange-600 text-white'
                    : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                  🏷️ {t('createPost.adType') || 'إعلان'}
                </button>
                <button onClick={() => setPostType('status')} className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                  postType === 'status'
                    ? 'bg-orange-600 text-white'
                    : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                  💬 {t('createPost.statusType') || 'حالة'}
                </button>
                <button onClick={() => setPostType('food')} className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all ${
                  postType === 'food'
                    ? 'bg-orange-600 text-white'
                    : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                  🍽️ هتاكل
                </button>
              </div>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('createPost.shareThoughts')}
            className={`w-full bg-transparent border-none outline-none text-sm resize-none min-h-[80px] sm:min-h-[100px] ${darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'}`}
            autoFocus
          />

          {/* Selected Image Preview */}
          {selectedImages.length > 0 && (
            <div className="mb-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden">
                    <img src={img} alt={'Selected ' + (idx+1)} className="w-full h-full object-cover" />
                    <button onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1.5 left-1.5 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black/80 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {selectedImages.length < MAX_IMAGES && (
                <label htmlFor={fileInputId} className={'mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed cursor-pointer ' + (darkMode ? 'border-gray-600 hover:border-orange-500' : 'border-gray-200 hover:border-orange-400')}>
                  <span className="text-xs font-bold">إضافة المزيد ({selectedImages.length}/{MAX_IMAGES})</span>
                </label>
              )}
            </div>
          )}

          {/* Image upload area (when no image selected) */}
          {selectedImages.length === 0 && (
            <label htmlFor={fileInputId} className={`w-full mb-3 flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl transition-all ${
                darkMode
                  ? 'border-gray-600 hover:border-orange-500 hover:bg-gray-700/50'
                  : 'border-gray-200 hover:border-orange-400 hover:bg-orange-50/50'
              }`} style={{cursor:"pointer"}}>
              <ImageIcon className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
              <span className={`text-xs font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('createPost.addImageBtn') || 'إضافة صورة'}</span>
            </label>
          )}

          <input id={fileInputId} ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="sr-only" onChange={handleImageSelect} />

          {/* Selected Feeling/Activity */}
          {(selectedFeeling || selectedActivity) && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {selectedFeeling && (
                <span className={`${darkMode ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-50 text-orange-700'} px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1`}>
                  {selectedFeeling}
                  <button onClick={() => setSelectedFeeling(null)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                </span>
              )}
              {selectedActivity && (
                <span className={`${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'} px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1`}>
                  {selectedActivity}
                  <button onClick={() => setSelectedActivity(null)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                </span>
              )}
            </div>
          )}

          {/* Feeling Picker */}
          {showFeelingPicker && (
            <div className={`mb-3 p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl`}>
              <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>{t('createPost.feelingNow')}</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {feelings.map(f => (
                  <button key={f.key} onClick={() => { setSelectedFeeling(`${f.emoji} ${t('createPost.feeling', { feeling: t('createPost.' + f.key) })}`); setShowFeelingPicker(false); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-white'} transition-colors`}>
                    <span className="text-xl">{f.emoji}</span>
                    <span className={`text-[9px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('createPost.' + f.key)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Activity Picker */}
          {showActivityPicker && (
            <div className={`mb-3 p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl`}>
              <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>{t('createPost.whatDoing')}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {activities.map(a => (
                  <button key={a.key} onClick={() => { setSelectedActivity(`${a.emoji} ${t('createPost.' + a.key)}`); setShowActivityPicker(false); }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-white'} transition-colors`}>
                    <span className="text-xl">{a.emoji}</span>
                    <span className={`text-[9px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('createPost.' + a.key)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category Selector — Different categories for Ads vs Food */}
          {(postType === 'ad' || postType === 'food') && (
            <div className="mb-3">
              <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`}>
                {postType === 'food' ? '🍽️ فئة الطعام' : t('createPost.category')}
              </p>
              <div
                ref={categoryScrollRef}
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin"
                style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}
              >
                {postType === 'food' ? (
                  // Food categories
                  [
                    { id: 'meals', icon: '🍔', label: 'وجبات' },
                    { id: 'desserts', icon: '🍰', label: 'حلويات' },
                    { id: 'drinks', icon: '🥤', label: 'مشروبات' },
                    { id: 'groceries', icon: '🛒', label: 'مكونات' },
                    { id: 'restaurants', icon: '🏪', label: 'مطاعم' },
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setPostCategory(postCategory === cat.id ? '' : cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                        postCategory === cat.id
                          ? 'bg-orange-600 text-white shadow-md shadow-orange-300/30'
                          : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))
                ) : (
                  // Ad categories (existing)
                  adCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setPostCategory(postCategory === cat.id ? '' : cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 ${
                        postCategory === cat.id
                          ? 'bg-orange-600 text-white shadow-md shadow-orange-300/30'
                          : darkMode
                            ? `${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <span>{cat.icon}</span>
                      {t(cat.nameKey)}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Price & Location */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="relative">
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>💰</span>
              <input type="text" value={postPrice} onChange={e => setPostPrice(e.target.value)} placeholder={t('createPost.price')} className={`w-full px-3 pr-8 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'} rounded-xl border text-sm outline-none transition-colors`} />
            </div>
            <div className="relative">
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>📍</span>
              <input type="text" value={postLocation} onChange={e => setPostLocation(e.target.value)} placeholder={t('createPost.location')} className={`w-full px-3 pr-8 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'} rounded-xl border text-sm outline-none transition-colors`} />
            </div>
          </div>

          {/* 🍔 Food-specific fields — only shown when postType='food' */}
          {/* Pre-configured for food data: delivery toggle + fee, working
              hours, prep time, contact phone. Helps restaurant owners fill
              in the details that matter to customers without typing them
              in the content body. */}
          {postType === 'food' && (
            <div className={`rounded-xl p-3 mb-3 space-y-2.5 ${darkMode ? 'bg-orange-900/10 border border-orange-900/30' : 'bg-orange-50 border border-orange-100'}`}>
              <p className={`text-[10px] font-black uppercase tracking-wider ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                🍔 تفاصيل الطعام
              </p>

              {/* Delivery toggle + fee */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryAvailable(d => !d)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                    deliveryAvailable
                      ? 'bg-blue-600 text-white'
                      : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600 border border-gray-200'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  {deliveryAvailable ? 'توصيل متاح' : 'لا توصيل'}
                </button>
                {deliveryAvailable && (
                  <div className="flex-1 relative">
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>رسوم</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={deliveryFee}
                      onChange={e => setDeliveryFee(e.target.value)}
                      placeholder="رسوم التوصيل"
                      className={`w-full px-3 pr-12 pl-2 py-2 rounded-lg border text-xs outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}`}
                    />
                    <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>ج.م</span>
                  </div>
                )}
              </div>

              {/* Working hours + Prep time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>⏰</span>
                  <input
                    type="text"
                    value={workingHours}
                    onChange={e => setWorkingHours(e.target.value)}
                    placeholder="ساعات العمل"
                    className={`w-full px-3 pr-7 py-2 rounded-lg border text-xs outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}`}
                  />
                </div>
                <div className="relative">
                  <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>⏱️</span>
                  <input
                    type="text"
                    value={prepTime}
                    onChange={e => setPrepTime(e.target.value)}
                    placeholder="وقت التحضير"
                    className={`w-full px-3 pr-7 py-2 rounded-lg border text-xs outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}`}
                  />
                </div>
              </div>

              {/* Contact phone */}
              <div className="relative">
                <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>📞</span>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="رقم الهاتف للطلب / الحجز"
                  dir="ltr"
                  className={`w-full px-3 pr-7 py-2 rounded-lg border text-xs outline-none text-left ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}`}
                />
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className={`flex items-center justify-between mt-2 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex gap-1">
              <label htmlFor={fileInputId} className={`p-2 ${darkMode ? 'hover:bg-green-900/30' : 'hover:bg-green-50'} rounded-lg transition-colors group`} title={t('createPost.addImage')} style={{cursor:"pointer"}}>
                <ImageIcon className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" />
              </label>
              <button onClick={() => { fileInputRef.current?.click(); }} className={`p-2 ${darkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-50'} rounded-lg transition-colors group`} title="إضافة فيديو">
                <Video className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => { setShowFeelingPicker(!showFeelingPicker); setShowActivityPicker(false); }} className={`p-2 rounded-lg transition-colors group ${showFeelingPicker ? (darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50') : (darkMode ? 'hover:bg-yellow-900/30' : 'hover:bg-yellow-50')}`} title={t('createPost.feelingBtn')}>
                <Smile className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => { setShowActivityPicker(!showActivityPicker); setShowFeelingPicker(false); }} className={`p-2 rounded-lg transition-colors group ${showActivityPicker ? (darkMode ? 'bg-blue-900/30' : 'bg-blue-50') : (darkMode ? 'hover:bg-blue-900/30' : 'hover:bg-blue-50')}`} title={t('createPost.activityBtn')}>
                <Tag className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
              </button>
              <button onClick={() => setShowStoryCreator(true)} className={`p-2 ${darkMode ? 'hover:bg-purple-900/30' : 'hover:bg-purple-50'} rounded-lg transition-colors group`} title={t('createPost.createStory')}>
                <Type className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
              </button>
            </div>
            <div className="flex gap-2">
              {!isModal && (
                <button onClick={handleClose}
                  className={`px-4 py-2 text-sm font-bold ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'} rounded-xl transition-colors`}>
                  {t('common.cancel')}
                </button>
              )}
              <button onClick={handleSubmit} disabled={!canSubmit}
                className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-orange-600 text-white rounded-xl hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {t('createPost.publish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick action buttons (only when NOT expanded and NOT modal) */}
      {!isOpen && !isModal && (
        <div className={`border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'} pt-3 flex items-center justify-between`}>
          <button onClick={() => setShowStoryCreator(true)} className={`flex-1 flex items-center justify-center gap-2 py-2 ${darkMode ? 'hover:bg-purple-900/30' : 'hover:bg-purple-50'} rounded-lg transition-colors group`}>
            <Type className="w-5 h-5 text-purple-500" />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300 group-hover:text-purple-400' : 'text-gray-600 group-hover:text-purple-700'}`}>{t('createPost.createStory')}</span>
          </button>
          {/* 🔧 REMOVED: Live Stream video button — standalone /live-stream is deprecated. */}
          <button onClick={() => { setIsOpen(true); setTimeout(() => fileInputRef.current?.click(), 100); }} className={`flex-1 flex items-center justify-center gap-2 py-2 ${darkMode ? 'hover:bg-green-900/30' : 'hover:bg-green-50'} rounded-lg transition-colors group`}>
            <ImageIcon className="w-5 h-5 text-green-500" />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300 group-hover:text-green-400' : 'text-gray-600 group-hover:text-green-700'}`}>{t('createPost.photosVideo')}</span>
          </button>
          <button onClick={() => { setIsOpen(true); setTimeout(() => setShowFeelingPicker(true), 100); }} className={`flex-1 flex items-center justify-center gap-2 py-2 ${darkMode ? 'hover:bg-yellow-900/30' : 'hover:bg-yellow-50'} rounded-lg transition-colors group`}>
            <Smile className="w-5 h-5 text-yellow-500" />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-300 group-hover:text-yellow-400' : 'text-gray-600 group-hover:text-yellow-700'}`}>{t('createPost.feelingActivity')}</span>
          </button>
        </div>
      )}
    </div>
  );
};
