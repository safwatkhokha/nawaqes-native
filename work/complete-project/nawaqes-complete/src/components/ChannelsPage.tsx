// ─── Channels Page (TikTok-style card grid) ─────────────────────────
// Lists all channels with cover image backdrop + logo + name + subscriber
// count + LIVE badge for active channels.
//
// Filter tabs: Trending / New / Following / Mine
// Search bar (on Trending + New)
// "Create Channel" button → opens CreateChannelModal
// Each card: clicking navigates to /channels/:id

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Plus, X, Users, Megaphone, Crown, Check, Loader2,
  Flame, Sparkles, Bookmark, Radio, Lock, Eye, Image as ImageIcon,
} from 'lucide-react';

type Tab = 'trending' | 'new' | 'following' | 'mine';

// TikTok-style gradient covers used when channel has no cover_photo.
const COVER_GRADIENTS = [
  'from-orange-500 via-pink-500 to-red-500',
  'from-purple-500 via-pink-500 to-orange-400',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-amber-400 via-orange-500 to-rose-500',
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-rose-500 via-red-500 to-orange-500',
  'from-teal-500 via-emerald-500 to-lime-500',
  'from-fuchsia-500 via-rose-500 to-amber-500',
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n || 0);
}

export const ChannelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      let data: any[] = [];
      if (activeTab === 'trending') {
        if (searchQuery.trim()) data = await api.searchChannels(searchQuery);
        else data = await api.listChannels({ limit: 30, sort: 'trending' });
      } else if (activeTab === 'new') {
        if (searchQuery.trim()) data = await api.searchChannels(searchQuery);
        else data = await api.listChannels({ limit: 30, sort: 'new' });
      } else if (activeTab === 'following') {
        data = await api.getSubscribedChannels();
      } else {
        data = await api.getMyChannels();
      }
      // Trending tab: push live channels to the top
      if (activeTab === 'trending' && !searchQuery.trim()) {
        data = [...data].sort((a, b) => {
          if (!!b.is_live !== !!a.is_live) return (b.is_live ? 1 : 0) - (a.is_live ? 1 : 0);
          return (b.subscriber_count || 0) - (a.subscriber_count || 0);
        });
      }
      setChannels(data);
    } catch (err: any) {
      toast.error(err.message || t('channels.loadFailed'));
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery, t]);

  useEffect(() => {
    // Debounce search to avoid spamming the API on each keystroke
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { loadChannels(); }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [loadChannels]);

  const handleSubscribe = async (channelId: string, currentlySubscribed: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (currentlySubscribed) {
        await api.unsubscribeFromChannel(channelId);
        toast.success(t('channels.unsubscribed'));
      } else {
        await api.subscribeToChannel(channelId);
        toast.success(t('channels.subscribed'));
      }
      // Update local state without reload for snappy UX
      setChannels(prev => prev.map(c => c.id === channelId ? {
        ...c,
        is_subscribed: !currentlySubscribed,
        subscriber_count: c.subscriber_count + (currentlySubscribed ? -1 : 1),
      } : c));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'trending', label: 'الأكثر رواجًا', icon: <Flame className="w-4 h-4" /> },
    { id: 'new', label: 'جديد', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'following', label: 'متابَع', icon: <Bookmark className="w-4 h-4" /> },
    { id: 'mine', label: 'قنواتي', icon: <Megaphone className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-black flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            <Megaphone className="w-6 h-6 text-orange-500" />
            {t('channels.title')}
          </h1>
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('channels.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold transition-all active:scale-95 shadow-md shadow-orange-200"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t('channels.create')}</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-orange-600 text-white shadow-md shadow-orange-200'
                : darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search bar (only on discover tabs) */}
      {(activeTab === 'trending' || activeTab === 'new') && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          <Search className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            placeholder={t('channels.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`flex-1 bg-transparent border-none outline-none text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Channels grid (TikTok-style cards) */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : channels.length === 0 ? (
        <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold">{t('channels.empty')}</p>
          <p className="text-xs mt-1">{t('channels.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {channels.map((channel, idx) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              index={idx}
              darkMode={darkMode}
              t={t}
              onClick={() => navigate(`/channels/${channel.id}`)}
              onSubscribeToggle={(e) => handleSubscribe(channel.id, !!channel.is_subscribed, e)}
            />
          ))}
        </div>
      )}

      {/* Create channel modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateChannelModal
            darkMode={darkMode}
            onClose={() => setShowCreateModal(false)}
            onCreated={(channel) => {
              setShowCreateModal(false);
              navigate(`/channels/${channel.id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Channel Card (TikTok-style) ───────────────────────────────────
function ChannelCard({ channel, index, darkMode, t, onClick, onSubscribeToggle }: {
  channel: any;
  index: number;
  darkMode: boolean;
  t: (key: string, opts?: any) => string;
  onClick: () => void;
  onSubscribeToggle: (e: React.MouseEvent) => void;
}) {
  const gradient = pickGradient(channel.id || channel.handle || channel.name);
  const isLive = !!channel.is_live;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-2xl overflow-hidden border transition-all hover:shadow-xl hover:-translate-y-0.5 ${
        darkMode ? 'border-gray-800' : 'border-gray-100'
      }`}
    >
      {/* Cover backdrop */}
      <div className="relative aspect-[4/5] overflow-hidden">
        {channel.cover_photo ? (
          <img
            src={channel.cover_photo}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} transition-transform duration-500 group-hover:scale-105`} />
        )}
        {/* Dark gradient overlay for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

        {/* LIVE badge (top-right in LTR / top-left in RTL via flex) */}
        {isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-white text-[10px] font-black shadow-lg">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            مباشر
          </div>
        )}

        {/* Visibility lock (private channel) */}
        {!channel.is_public && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
            <Lock className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Owner crown badge */}
        {channel.is_owner && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
            <Crown className="w-3.5 h-3.5 text-white" />
          </div>
        )}

        {/* Logo (overlapping the cover bottom) */}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2">
          <div className="relative">
            {channel.avatar ? (
              <img
                src={channel.avatar}
                alt={channel.name}
                className="w-12 h-12 rounded-full object-cover border-[3px] border-white dark:border-gray-900 shadow-lg"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-lg font-black border-[3px] border-white dark:border-gray-900 shadow-lg">
                {channel.name?.charAt(0) || '?'}
              </div>
            )}
            {channel.is_verified && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Live viewer count pill */}
        {isLive && channel.live_stream && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/70 text-white text-[10px] font-bold">
            <Eye className="w-2.5 h-2.5" />
            {formatCount(channel.live_stream.viewer_count)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className={`pt-6 pb-3 px-2.5 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <h3 className={`text-sm font-black text-center truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {channel.name}
        </h3>
        {channel.handle && (
          <p className={`text-[10px] text-center truncate ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            @{channel.handle}
          </p>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-center gap-2 mt-1.5 text-[10px]">
          <span className={`flex items-center gap-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <Users className="w-3 h-3" />
            {formatCount(channel.subscriber_count || 0)}
          </span>
          {channel.post_count > 0 && (
            <span className={`flex items-center gap-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Megaphone className="w-3 h-3" />
              {formatCount(channel.post_count)}
            </span>
          )}
        </div>

        {/* Subscribe button (compact pill) */}
        {!channel.is_owner && (
          <button
            onClick={onSubscribeToggle}
            className={`w-full mt-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
              channel.is_subscribed
                ? darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-red-900/40 hover:text-red-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                : 'bg-orange-600 text-white hover:bg-orange-700 shadow'
            }`}
          >
            {channel.is_subscribed ? t('channels.subscribed') : t('channels.subscribe')}
          </button>
        )}
        {channel.is_owner && (
          <div className="w-full mt-2.5 py-1.5 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-500 text-center">
            {channel.role === 'owner' ? t('channels.ownerRole') : t('channels.adminRole')}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Create Channel Modal (with cover photo upload) ─────────────────
function CreateChannelModal({ darkMode, onClose, onCreated }: {
  darkMode: boolean;
  onClose: () => void;
  onCreated: (channel: any) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState('');
  const [creating, setCreating] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatar(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCover(file);
    const reader = new FileReader();
    reader.onload = (ev) => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error(t('channels.nameMinLength'));
      return;
    }
    setCreating(true);
    try {
      const channel = await api.createChannel({
        name: name.trim(),
        handle: handle.trim() || undefined,
        description: description.trim(),
        is_public: isPublic,
        allow_comments: allowComments,
        allow_reactions: allowReactions,
      }, avatar || undefined, cover || undefined);
      toast.success(t('channels.created'));
      onCreated(channel);
    } catch (err: any) {
      toast.error(err.message || t('channels.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('channels.createTitle')}
          </h2>
          <button onClick={onClose} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
            <X className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
          </button>
        </div>

        {/* Cover photo picker (TikTok-style banner) */}
        <div className="mb-3">
          <div
            onClick={() => coverInputRef.current?.click()}
            className={`relative h-24 rounded-xl overflow-hidden cursor-pointer border-2 border-dashed ${
              darkMode ? 'border-gray-600 bg-gray-700/50' : 'border-gray-300 bg-gray-50'
            }`}
          >
            {coverPreview ? (
              <>
                <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-bold">تغيير الغلاف</span>
                </div>
              </>
            ) : (
              <div className={`w-full h-full flex flex-col items-center justify-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <ImageIcon className="w-6 h-6 mb-1" />
                <span className="text-xs font-bold">صورة الغلاف</span>
                <span className="text-[10px] opacity-70">اختياري</span>
              </div>
            )}
            <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-2xl font-black">
                  {name.charAt(0) || '?'}
                </div>
              )}
              <label
                onClick={(e) => { e.preventDefault(); avatarInputRef.current?.click(); }}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center cursor-pointer border-2 border-white"
              >
                <Plus className="w-3 h-3 text-white" />
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
            </div>
            <div className="flex-1">
              <p className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {t('channels.avatar')}
              </p>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t('channels.avatarHint')}
              </p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className={`block text-xs font-bold mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('channels.nameLabel')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder={t('channels.namePlaceholder')}
              required
              className={`w-full px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-orange-200 ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* Handle */}
          <div>
            <label className={`block text-xs font-bold mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('channels.handleLabel')}
            </label>
            <div className={`flex items-center px-3 py-2.5 rounded-xl border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
              <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                maxLength={30}
                placeholder={t('channels.handlePlaceholder')}
                className={`flex-1 bg-transparent border-none outline-none ms-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}
              />
            </div>
            <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('channels.handleHint')}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className={`block text-xs font-bold mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('channels.descriptionLabel')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('channels.descriptionPlaceholder')}
              className={`w-full px-3 py-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-orange-200 resize-none ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <Toggle label={t('channels.publicLabel')} hint={t('channels.publicHint')} checked={isPublic} onChange={setIsPublic} darkMode={darkMode} />
            <Toggle label={t('channels.commentsLabel')} hint={t('channels.commentsHint')} checked={allowComments} onChange={setAllowComments} darkMode={darkMode} />
            <Toggle label={t('channels.reactionsLabel')} hint={t('channels.reactionsHint')} checked={allowReactions} onChange={setAllowReactions} darkMode={darkMode} />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={creating}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            {creating ? t('common.loading') : t('channels.createBtn')}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

function Toggle({ label, hint, checked, onChange, darkMode }: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  darkMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
        darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
      }`}
    >
      <div className="text-start">
        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{label}</p>
        <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p>
      </div>
      <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-orange-600' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}>
        <div className={`w-5 h-5 rounded-full bg-white transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
