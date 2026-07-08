// ─── Channel Settings Modal (per-user) ──────────────────────────────
// Lets a subscriber configure their per-channel preferences:
//   - Notification level (all / live_only / important / none)
//   - Mute duration (1h / 8h / until I turn it back on)
//   - Auto-load media
//   - Share channel / copy link
//   - Report channel
//   - Block channel (with confirmation)
//   - Unsubscribe (with confirmation)
//
// Owner/admin of the channel ALSO sees a "Channel Management" section at
// the top where they can edit the channel's name + description (the
// official name that all subscribers see).
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Bell, BellOff, BellRing, Volume2, VolumeX, Eye, EyeOff,
  Share2, Copy, Flag, Ban, LogOut, AlertTriangle, Check, Loader2,
  Clock, Settings as SettingsIcon, Edit3, Save, Crown, Camera, Image as ImageIcon,
  Globe, Lock, Tag,
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { toast as sonnerToast } from 'sonner';

export type NotificationLevel = 'all' | 'live_only' | 'important' | 'none';

interface ChannelSettingsModalProps {
  open: boolean;
  onClose: () => void;
  channel: any;
  darkMode: boolean;
  /** Called after any setting changes so the parent can refresh channel state */
  onSettingsChanged?: () => void;
  /** Called when the user unsubscribes (parent should navigate away or refresh) */
  onUnsubscribed?: () => void;
  /** Called when the user blocks the channel (parent should navigate away) */
  onBlocked?: () => void;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  open, onClose, channel, darkMode, onSettingsChanged, onUnsubscribed, onBlocked,
}) => {
  // 🔑 Channel admin/owner can edit the channel's official name + description.
  // We use is_admin here (covers both owner + admin roles) so that admins
  // the owner appointed can also manage the channel.
  const canManageChannel = !!channel?.is_admin;
  const isOwner = channel?.is_owner;
  const isBlocked = !!channel?.is_blocked;

  // Local state mirrors channel.* so we can update optimistically
  const [notifLevel, setNotifLevel] = useState<NotificationLevel>(
    channel?.notification_level || 'all'
  );
  const [mutedUntil, setMutedUntil] = useState<string | null>(channel?.muted_until || null);
  const [autoLoadMedia, setAutoLoadMedia] = useState<boolean>(
    channel?.auto_load_media === undefined ? true : !!channel.auto_load_media
  );
  const [saving, setSaving] = useState(false);

  // ─── Channel management (admin/owner only) ────────────────────────
  // Edit the channel's official name + description + avatar + cover +
  // category + public/private. These are the values every subscriber
  // sees (not a per-user override).
  const [editName, setEditName] = useState(channel?.name || '');
  const [editDescription, setEditDescription] = useState(channel?.description || '');
  const [editCategory, setEditCategory] = useState(channel?.category || '');
  const [editIsPublic, setEditIsPublic] = useState(channel?.is_public !== false && channel?.is_public !== 0);
  const [editingChannel, setEditingChannel] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);

  // Avatar + cover uploads (File objects + preview data URLs)
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Available categories (loaded once when the modal opens + user is admin)
  const [categories, setCategories] = useState<any[]>([]);

  // Sub-modals: report + confirm-block + confirm-unsubscribe
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showUnsubConfirm, setShowUnsubConfirm] = useState(false);

  // Sync local state when channel data changes (e.g. parent re-fetches)
  useEffect(() => {
    if (open) {
      setNotifLevel(channel?.notification_level || 'all');
      setMutedUntil(channel?.muted_until || null);
      setAutoLoadMedia(channel?.auto_load_media === undefined ? true : !!channel.auto_load_media);
      // Sync channel-edit fields too so opening the editor shows fresh values
      setEditName(channel?.name || '');
      setEditDescription(channel?.description || '');
      setEditCategory(channel?.category || '');
      setEditIsPublic(channel?.is_public !== false && channel?.is_public !== 0);
      // Reset file previews to the current server-side URLs (so the user
      // sees the existing avatar/cover, not a stale preview from a previous edit)
      setAvatarFile(null);
      setAvatarPreview(channel?.avatar || '');
      setCoverFile(null);
      setCoverPreview(channel?.cover_photo || '');
      setEditingChannel(false);
    }
  }, [open, channel?.notification_level, channel?.muted_until, channel?.auto_load_media, channel?.name, channel?.description, channel?.category, channel?.is_public, channel?.avatar, channel?.cover_photo]);

  // Load categories list when the management section becomes editable
  useEffect(() => {
    if (open && canManageChannel && categories.length === 0) {
      api.getCategories().then(cats => {
        if (Array.isArray(cats)) setCategories(cats);
      }).catch(() => {});
    }
  }, [open, canManageChannel, categories.length]);

  // ─── Avatar / cover file handlers ─────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة كبير (الحد 5MB)');
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('حجم الصورة كبير (الحد 5MB)');
      return;
    }
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ─── Helpers ──────────────────────────────────────────────────────
  const isCurrentlyMuted = mutedUntil && new Date(mutedUntil) > new Date();

  const persistSettings = async (updates: {
    notification_level?: NotificationLevel;
    muted_until?: string | null;
    auto_load_media?: boolean;
  }) => {
    setSaving(true);
    try {
      await api.updateChannelSubscriberSettings(channel.id, updates);
      // Update local state to match what we just persisted
      if (updates.notification_level !== undefined) setNotifLevel(updates.notification_level);
      if (updates.muted_until !== undefined) setMutedUntil(updates.muted_until);
      if (updates.auto_load_media !== undefined) setAutoLoadMedia(updates.auto_load_media);
      toast.success('تم تحديث الإعدادات');
      onSettingsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تحديث الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleNotifLevelChange = (level: NotificationLevel) => {
    // If switching away from 'none', also clear any active mute
    const updates: any = { notification_level: level };
    if (level !== 'none' && isCurrentlyMuted) {
      updates.muted_until = null;
    }
    persistSettings(updates);
  };

  const handleMuteDuration = (hours: number | null) => {
    // hours = null → unmute
    // hours = 0 → mute until I turn it back on (year 2099)
    // hours > 0 → mute for N hours
    let until: string | null = null;
    if (hours === null) {
      until = null;
    } else if (hours === 0) {
      until = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(); // ~10 years
    } else {
      until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }
    persistSettings({ muted_until: until });
  };

  const handleAutoLoadMediaToggle = () => {
    persistSettings({ auto_load_media: !autoLoadMedia });
  };

  // ─── Channel management: save all edits ───────────────────────────
  // Validates the new name (3-100 chars), sends a PATCH to the channel
  // endpoint with name/description/category/is_public + optional avatar
  // and cover File objects (multipart upload), then refreshes the parent
  // so the header / channel list reflect the changes immediately.
  const handleSaveChannelEdits = async () => {
    const trimmedName = editName.trim();
    if (trimmedName.length < 3) {
      toast.error('اسم القناة يجب أن يكون 3 أحرف على الأقل');
      return;
    }
    if (trimmedName.length > 100) {
      toast.error('اسم القناة طويل جداً (الحد 100 حرف)');
      return;
    }
    setSavingChannel(true);
    try {
      await api.updateChannel(channel.id, {
        name: trimmedName,
        description: editDescription.trim().slice(0, 500),
        category: editCategory,
        is_public: editIsPublic,
      }, avatarFile || undefined, coverFile || undefined);
      toast.success('تم تحديث بيانات القناة');
      setEditingChannel(false);
      // Clear file state (the previews will refresh from the new server URLs
      // via the useEffect when the parent re-fetches)
      setAvatarFile(null);
      setCoverFile(null);
      onSettingsChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تحديث القناة');
    } finally {
      setSavingChannel(false);
    }
  };

  const handleCancelChannelEdit = () => {
    // Reset all edit fields to the current channel values
    setEditName(channel?.name || '');
    setEditDescription(channel?.description || '');
    setEditCategory(channel?.category || '');
    setEditIsPublic(channel?.is_public !== false && channel?.is_public !== 0);
    setAvatarFile(null);
    setAvatarPreview(channel?.avatar || '');
    setCoverFile(null);
    setCoverPreview(channel?.cover_photo || '');
    setEditingChannel(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/#/channels/${channel.id}`;
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({
          title: channel.name,
          text: channel.description || '',
          url,
        });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('تم نسخ رابط القناة');
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/#/channels/${channel.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('تم نسخ الرابط');
    } catch {
      toast.error('تعذّر النسخ');
    }
  };

  const handleBlock = async () => {
    setShowBlockConfirm(false);
    try {
      await api.blockChannel(channel.id);
      sonnerToast.success('تم حظر القناة');
      onBlocked?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'فشل الحظر');
    }
  };

  const handleUnsubscribe = async () => {
    setShowUnsubConfirm(false);
    try {
      await api.unsubscribeFromChannel(channel.id);
      sonnerToast.success('تم إلغاء الاشتراك');
      onUnsubscribed?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'فشل إلغاء الاشتراك');
    }
  };

  // ─── Theme helpers ────────────────────────────────────────────────
  const cardBg = darkMode ? 'bg-gray-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const border = darkMode ? 'border-gray-700' : 'border-gray-200';
  const hoverBg = darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50';

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col ${cardBg}`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${border}`}>
                <div className="flex items-center gap-2">
                  <SettingsIcon className={`w-5 h-5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
                  <h3 className={`font-black text-base ${textPrimary}`}>إعدادات القناة</h3>
                </div>
                <button
                  onClick={onClose}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto">
                {/* Channel mini-header */}
                <div className={`px-5 py-3 flex items-center gap-3 border-b ${border}`}>
                  <img
                    src={channel?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${channel?.id}`}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${textPrimary}`}>{channel?.name}</p>
                    <p className={`text-xs ${textMuted}`}>@{channel?.handle}</p>
                  </div>
                  {/* Crown badge for owner/admin */}
                  {canManageChannel && (
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
                      <Crown className="w-3 h-3" />
                      {isOwner ? 'مالك' : 'مشرف'}
                    </span>
                  )}
                </div>

                {/* ─── Channel Management (admin/owner only) ─── */}
                {/* Lets the channel admin edit the OFFICIAL name, description,
                    avatar, cover photo, category, and public/private toggle.
                    These are the values every subscriber sees (not a per-user
                    override). */}
                {canManageChannel && (
                  <div className="px-5 pt-4 pb-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${textMuted}`}>
                        إدارة القناة
                      </p>
                      {!editingChannel && (
                        <button
                          onClick={() => setEditingChannel(true)}
                          className={`flex items-center gap-1 text-[11px] font-bold text-orange-500 hover:text-orange-600 transition-colors`}
                        >
                          <Edit3 className="w-3 h-3" />
                          تعديل
                        </button>
                      )}
                    </div>

                    {editingChannel ? (
                      <div className="space-y-3">
                        {/* Hidden file inputs for avatar + cover uploads */}
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarChange}
                        />
                        <input
                          ref={coverInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCoverChange}
                        />

                        {/* ─── Cover photo upload ─── */}
                        <div>
                          <label className={`text-[11px] font-bold block mb-1.5 ${textMuted}`}>
                            صورة الغلاف
                          </label>
                          <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            className={`relative w-full h-24 rounded-xl overflow-hidden border-2 border-dashed transition-all ${darkMode ? 'border-gray-600 hover:border-orange-500 bg-gray-700/40' : 'border-gray-300 hover:border-orange-400 bg-gray-50'}`}
                          >
                            {coverPreview ? (
                              <>
                                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="text-white text-xs font-bold flex items-center gap-1">
                                    <Camera className="w-3.5 h-3.5" />
                                    تغيير
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                <ImageIcon className={`w-6 h-6 ${textMuted}`} />
                                <span className={`text-[11px] font-bold ${textMuted}`}>اضغط لاختيار صورة غلاف</span>
                              </div>
                            )}
                          </button>
                        </div>

                        {/* ─── Avatar upload ─── */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => avatarInputRef.current?.click()}
                            className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-dashed flex-shrink-0 transition-all ${darkMode ? 'border-gray-600 hover:border-orange-500' : 'border-gray-300 hover:border-orange-400'}"
                            style={{ borderWidth: '2px', borderStyle: 'dashed' }}
                          >
                            {avatarPreview ? (
                              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
                                <Camera className={`w-5 h-5 ${textMuted}`} />
                              </div>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <label className={`text-[11px] font-bold block ${textMuted}`}>
                              الصورة الرمزية
                            </label>
                            <p className={`text-[10px] mt-0.5 ${textMuted}`}>
                              اضغط على الصورة لتغييرها (الحد 5MB)
                            </p>
                            <button
                              type="button"
                              onClick={() => avatarInputRef.current?.click()}
                              className="mt-1 text-[11px] font-bold text-orange-500 hover:text-orange-600"
                            >
                              اختيار صورة
                            </button>
                          </div>
                        </div>

                        {/* ─── Name input ─── */}
                        <div>
                          <label className={`text-[11px] font-bold block mb-1.5 ${textMuted}`}>
                            اسم القناة
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={100}
                            placeholder="اسم القناة"
                            className={`w-full px-3 py-2.5 rounded-xl border outline-none text-sm font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
                          />
                          <p className={`text-[10px] mt-1 text-end ${textMuted}`}>
                            {editName.length}/100
                          </p>
                        </div>

                        {/* ─── Description input ─── */}
                        <div>
                          <label className={`text-[11px] font-bold block mb-1.5 ${textMuted}`}>
                            الوصف
                          </label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder="وصف القناة..."
                            className={`w-full px-3 py-2.5 rounded-xl border outline-none text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
                          />
                          <p className={`text-[10px] mt-1 text-end ${textMuted}`}>
                            {editDescription.length}/500
                          </p>
                        </div>

                        {/* ─── Category select ─── */}
                        <div>
                          <label className={`text-[11px] font-bold block mb-1.5 ${textMuted} flex items-center gap-1`}>
                            <Tag className="w-3 h-3" />
                            الفئة
                          </label>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-xl border outline-none text-sm font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-400'}`}
                          >
                            <option value="">بدون فئة</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.name}>
                                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                              </option>
                            ))}
                          </select>
                          {categories.length === 0 && (
                            <p className={`text-[10px] mt-1 ${textMuted}`}>
                              لم يتم تحميل الفئات — اتركها فارغة إذا لا تريد فئة
                            </p>
                          )}
                        </div>

                        {/* ─── Public / Private toggle ─── */}
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${darkMode ? 'border-gray-700 bg-gray-700/40' : 'border-gray-200 bg-gray-50'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${editIsPublic ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'}`}>
                            {editIsPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${textPrimary}`}>
                              {editIsPublic ? 'قناة عامة' : 'قناة خاصة'}
                            </p>
                            <p className={`text-[11px] ${textMuted}`}>
                              {editIsPublic ? 'يستطيع أي شخص رؤيتها والاشتراك بها' : 'يحتاج المشتركون الجدد لموافقتك'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditIsPublic(p => !p)}
                            className={`relative w-[44px] h-[26px] rounded-full transition-colors flex-shrink-0 ${editIsPublic ? 'bg-orange-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}
                            aria-label="تبديل عام/خاص"
                          >
                            <div className={`absolute top-[2px] w-[22px] h-[22px] bg-white rounded-full shadow transition-all ${editIsPublic ? 'left-[20px]' : 'left-[2px]'}`} />
                          </button>
                        </div>

                        {/* ─── Save / Cancel ─── */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleCancelChannelEdit}
                            disabled={savingChannel}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            إلغاء
                          </button>
                          <button
                            onClick={handleSaveChannelEdits}
                            disabled={savingChannel || editName.trim().length < 3}
                            className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {savingChannel ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            {savingChannel ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // ─── Read-only summary view ───
                      <div className={`rounded-xl p-3 space-y-2 ${darkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
                        {/* Cover + avatar preview */}
                        {coverPreview && (
                          <div className="relative h-16 rounded-lg overflow-hidden mb-1">
                            <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          </div>
                        )}
                        <div className="flex items-center gap-2.5">
                          {avatarPreview && (
                            <img src={avatarPreview} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${textPrimary}`}>{channel?.name}</p>
                            {channel?.description ? (
                              <p className={`text-xs truncate ${textMuted}`}>{channel.description}</p>
                            ) : (
                              <p className={`text-xs italic ${textMuted}`}>لا يوجد وصف</p>
                            )}
                          </div>
                        </div>
                        {/* Category + visibility badges */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {channel?.category && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'}`}>
                              <Tag className="w-2.5 h-2.5" />
                              {channel.category}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${channel?.is_public ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700') : (darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700')}`}>
                            {channel?.is_public ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            {channel?.is_public ? 'عامة' : 'خاصة'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Notification Level ─── */}
                {!isOwner && (
                  <div className="px-5 pt-4 pb-2">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${textMuted}`}>
                      مستوى الإشعارات
                    </p>
                    <div className="space-y-1.5">
                      {([
                        { value: 'all', icon: <BellRing className="w-4 h-4" />, label: 'كل المنشورات والبثوث', desc: 'إشعار لكل منشور جديد وبث مباشر' },
                        { value: 'live_only', icon: <Bell className="w-4 h-4" />, label: 'البثوث المباشرة فقط', desc: 'إشعار فقط عند بدء بث مباشر' },
                        { value: 'important', icon: <BellRing className="w-4 h-4" />, label: 'المهم فقط', desc: 'إشعارات مختارة (بثوث + إعلانات رئيسية)' },
                        { value: 'none', icon: <BellOff className="w-4 h-4" />, label: 'بدون إشعارات', desc: 'لن تستقبل أي إشعار من هذه القناة' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => handleNotifLevelChange(opt.value)}
                          disabled={saving}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-start disabled:opacity-50 ${
                            notifLevel === opt.value
                              ? (darkMode ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50')
                              : (darkMode ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300')
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            notifLevel === opt.value
                              ? 'bg-orange-600 text-white'
                              : (darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600')
                          }`}>
                            {opt.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${textPrimary}`}>{opt.label}</p>
                            <p className={`text-[11px] ${textMuted}`}>{opt.desc}</p>
                          </div>
                          {notifLevel === opt.value && (
                            <Check className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ─── Mute Duration ─── */}
                {!isOwner && (
                  <div className="px-5 pt-4 pb-2">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${textMuted}`}>
                      كتم مؤقت
                    </p>
                    {isCurrentlyMuted ? (
                      <div className={`rounded-xl p-3 mb-2 ${darkMode ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                        <div className="flex items-center gap-2">
                          <VolumeX className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                          <p className={`text-xs font-bold ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                            القناة مكتومة
                          </p>
                        </div>
                        <p className={`text-[11px] mt-1 ${textMuted}`}>
                          {mutedUntil && new Date(mutedUntil) > new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000)
                            ? 'حتى تعيد تشغيلها'
                            : `حتى ${new Date(mutedUntil!).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}`}
                        </p>
                        <button
                          onClick={() => handleMuteDuration(null)}
                          disabled={saving}
                          className="mt-2 w-full py-2 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50"
                        >
                          إلغاء الكتم
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { hours: 1, label: 'ساعة' },
                          { hours: 8, label: '8 ساعات' },
                          { hours: 0, label: 'دائم' },
                        ] as const).map(opt => (
                          <button
                            key={opt.hours}
                            onClick={() => handleMuteDuration(opt.hours)}
                            disabled={saving}
                            className={`py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${
                              darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5 inline ml-1" />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Display ─── */}
                <div className="px-5 pt-4 pb-2">
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${textMuted}`}>
                    العرض
                  </p>
                  <button
                    onClick={handleAutoLoadMediaToggle}
                    disabled={saving}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start disabled:opacity-50 ${border} ${hoverBg}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {autoLoadMedia ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${textPrimary}`}>تحميل الوسائط تلقائياً</p>
                      <p className={`text-[11px] ${textMuted}`}>عرض الصور والفيديوهات في الشبكة</p>
                    </div>
                    <div className={`relative w-[44px] h-[26px] rounded-full transition-colors flex-shrink-0 ${autoLoadMedia ? 'bg-orange-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}>
                      <div className={`absolute top-[2px] w-[22px] h-[22px] bg-white rounded-full shadow transition-all ${autoLoadMedia ? 'left-[20px]' : 'left-[2px]'}`} />
                    </div>
                  </button>
                </div>

                {/* ─── Share & Copy ─── */}
                <div className="px-5 pt-4 pb-2">
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${textMuted}`}>
                    المشاركة
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleShare}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      مشاركة
                    </button>
                    <button
                      onClick={handleCopyLink}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      نسخ الرابط
                    </button>
                  </div>
                </div>

                {/* ─── Danger Zone (non-owners only) ─── */}
                {!isOwner && (
                  <div className="px-5 pt-4 pb-5">
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 text-red-500`}>
                      إجراءات
                    </p>
                    <div className="space-y-1.5">
                      {/* Report */}
                      <button
                        onClick={() => setShowReportModal(true)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${darkMode ? 'border-gray-700 hover:bg-amber-900/20' : 'border-gray-200 hover:bg-amber-50'}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/15 text-amber-500">
                          <Flag className="w-4 h-4" />
                        </div>
                        <p className={`text-sm font-bold flex-1 ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                          الإبلاغ عن القناة
                        </p>
                      </button>

                      {/* Block / Unblock */}
                      {isBlocked ? (
                        <button
                          onClick={async () => {
                            try {
                              await api.unblockChannel(channel.id);
                              sonnerToast.success('تم إلغاء حظر القناة');
                              onSettingsChanged?.();
                            } catch (err: any) {
                              toast.error(err?.message || 'فشل إلغاء الحظر');
                            }
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${darkMode ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-500/15 text-gray-500">
                            <Ban className="w-4 h-4" />
                          </div>
                          <p className={`text-sm font-bold flex-1 ${textPrimary}`}>
                            إلغاء الحظر
                          </p>
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowBlockConfirm(true)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${darkMode ? 'border-gray-700 hover:bg-red-900/20' : 'border-gray-200 hover:bg-red-50'}`}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/15 text-red-500">
                            <Ban className="w-4 h-4" />
                          </div>
                          <p className={`text-sm font-bold flex-1 ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                            حظر القناة
                          </p>
                        </button>
                      )}

                      {/* Unsubscribe (only if subscribed) */}
                      {channel?.is_subscribed && (
                        <button
                          onClick={() => setShowUnsubConfirm(true)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${darkMode ? 'border-gray-700 hover:bg-red-900/20' : 'border-gray-200 hover:bg-red-50'}`}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500/15 text-red-500">
                            <LogOut className="w-4 h-4" />
                          </div>
                          <p className={`text-sm font-bold flex-1 ${darkMode ? 'text-red-300' : 'text-red-700'}`}>
                            إلغاء الاشتراك
                          </p>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {saving && (
                  <div className="px-5 pb-5 flex items-center justify-center gap-2 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جاري الحفظ...
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Report sub-modal ─── */}
      <ReportChannelModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        channel={channel}
        darkMode={darkMode}
        onReported={() => {
          setShowReportModal(false);
          sonnerToast.success('تم إرسال بلاغك — شكراً لك');
        }}
      />

      {/* ─── Block confirmation ─── */}
      <ConfirmDialog
        open={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={handleBlock}
        darkMode={darkMode}
        title="حظر القناة"
        message={`سيتم إلغاء اشتراكك من "${channel?.name}" ولن تظهر في الاقتراحات أو البحث. يمكنك إلغاء الحظر لاحقاً من إعدادات القناة.`}
        confirmLabel="حظر"
        confirmColor="red"
        icon={<Ban className="w-5 h-5" />}
      />

      {/* ─── Unsubscribe confirmation ─── */}
      <ConfirmDialog
        open={showUnsubConfirm}
        onClose={() => setShowUnsubConfirm(false)}
        onConfirm={handleUnsubscribe}
        darkMode={darkMode}
        title="إلغاء الاشتراك"
        message={`سيتم إلغاء اشتراكك من "${channel?.name}". يمكنك إعادة الاشتراك في أي وقت.`}
        confirmLabel="إلغاء الاشتراك"
        confirmColor="red"
        icon={<LogOut className="w-5 h-5" />}
      />
    </>
  );
};

// ─── Report Channel Modal ───────────────────────────────────────────
const ReportChannelModal: React.FC<{
  open: boolean;
  onClose: () => void;
  channel: any;
  darkMode: boolean;
  onReported: () => void;
}> = ({ open, onClose, channel, darkMode, onReported }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = [
    { value: 'spam', label: 'سبام / إعلانات مزعجة' },
    { value: 'abuse', label: 'محتوى مسيء' },
    { value: 'scam', label: 'احتيال' },
    { value: 'copyright', label: 'انتهاك حقوق ملكية' },
    { value: 'illegal', label: 'محتوى غير قانوني' },
    { value: 'other', label: 'سبب آخر' },
  ];

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await api.reportChannel(channel.id, reason, details);
      onReported();
    } catch (err: any) {
      toast.error(err?.message || 'فشل إرسال البلاغ');
    } finally {
      setSubmitting(false);
    }
  };

  const cardBg = darkMode ? 'bg-gray-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl w-full max-w-md shadow-2xl overflow-hidden ${cardBg}`}
          >
            <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-black text-base ${textPrimary}`}>الإبلاغ عن القناة</h3>
              <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className={`text-sm ${textMuted}`}>
                اختر السبب الذي يجعلك تبلغ عن "{channel?.name}":
              </p>
              <div className="space-y-2">
                {reasons.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-start ${
                      reason === r.value
                        ? (darkMode ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50')
                        : (darkMode ? 'border-gray-700' : 'border-gray-200')
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      reason === r.value ? 'border-orange-500' : darkMode ? 'border-gray-600' : 'border-gray-300'
                    }`}>
                      {reason === r.value && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                    </div>
                    <span className={`text-sm font-bold ${textPrimary}`}>{r.label}</span>
                  </button>
                ))}
              </div>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="تفاصيل إضافية (اختياري)..."
                rows={3}
                className={`w-full px-3 py-2 rounded-xl border outline-none text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
              />
              <div className="flex gap-2 pt-2">
                <button
                  onClick={onClose}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!reason || submitting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  إرسال البلاغ
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Generic Confirmation Dialog ────────────────────────────────────
const ConfirmDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  darkMode: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: 'red' | 'orange' | 'green';
  icon?: React.ReactNode;
}> = ({ open, onClose, onConfirm, darkMode, title, message, confirmLabel, confirmColor = 'red', icon }) => {
  const colorMap = {
    red: 'bg-red-600 hover:bg-red-700',
    orange: 'bg-orange-600 hover:bg-orange-700',
    green: 'bg-emerald-600 hover:bg-emerald-700',
  };
  const iconBgMap = {
    red: 'bg-red-500/15 text-red-500',
    orange: 'bg-orange-500/15 text-orange-500',
    green: 'bg-emerald-500/15 text-emerald-500',
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={`rounded-2xl w-full max-w-sm shadow-2xl p-5 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className="flex items-start gap-3 mb-3">
              {icon && (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBgMap[confirmColor]}`}>
                  {icon}
                </div>
              )}
              <div>
                <h3 className={`font-black text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{message}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
              >
                إلغاء
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white ${colorMap[confirmColor]} active:scale-95 transition-all`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChannelSettingsModal;
