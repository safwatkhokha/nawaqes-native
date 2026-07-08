import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { isUserOnline, formatLastSeen } from '../utils/presence';
import {
  Search, Users, UserPlus, UserCheck, MessageCircle,
  Sparkles, Shield, MapPin,
  X, Check, MoreVertical, CheckCircle2, Eye, RefreshCw,
  Handshake, Compass, UserX, Ban, UserMinus, Crown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────
interface FriendUser {
  id: string;
  name: string;
  avatar: string;
  isVerified?: boolean;
  isTrusted?: boolean;
  trustScore?: number;
  location?: string;
  interests?: string[];
  bio?: string;
  gender?: 'male' | 'female' | null;
  lastSeen?: string | null;
  isOnline?: boolean;
  mutualFriends?: number;
  friendSince?: string;
  friendshipId?: string;
  friendLabel?: string;
}

interface FriendRequestItem {
  id: string;
  user: {
    id: string;
    name: string;
    avatar: string;
    isVerified?: boolean;
    location?: string;
    interests?: string[];
    trustScore?: number;
    mutualFriends?: number;
  };
  timestamp: string;
}

type Tab = 'friends' | 'requests' | 'suggestions';

// ─── Page ─────────────────────────────────────────────────────────────
export const FriendsPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode, acceptFriendRequest, rejectFriendRequest, isUserOnlineWs } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);
  const [suggestions, setSuggestions] = useState<FriendUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<FriendUser | null>(null);
  const [confirmBlock, setConfirmBlock] = useState<FriendUser | null>(null);

  // ─── Theme ────────────────────────────────────────────────────────
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const inputBg = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400';

  // ─── Loaders ──────────────────────────────────────────────────────
  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getFriends();
      const mapped: FriendUser[] = (Array.isArray(list) ? list : []).map((f: any) => {
        const online = f.isOnline === true || isUserOnlineWs(f.id) || isUserOnline(f.id);
        return {
          id: f.id,
          friendshipId: f.friendshipId || '',
          name: f.name || t('common.user'),
          avatar: f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.id}`,
          isVerified: !!f.isVerified,
          isTrusted: !!f.isTrusted,
          trustScore: f.trustScore || 50,
          location: f.location || '',
          interests: Array.isArray(f.interests) ? f.interests : [],
          gender: f.gender || null,
          isOnline: online,
          lastSeen: online ? t('friends.activeNow') : (f.lastSeen ? formatLastSeen(new Date(f.lastSeen).getTime()) : ''),
          mutualFriends: f.mutualFriends || 0,
          friendSince: f.friendSince || '',
          friendLabel: f.friendLabel || 'general',
          bio: f.bio || '',
        };
      });
      setFriends(mapped);
    } catch (err) {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [t, isUserOnlineWs]);

  const loadRequests = useCallback(async () => {
    try {
      const list = await api.getFriendRequests();
      setRequests((Array.isArray(list) ? list : []).map((r: any) => ({
        id: r.id,
        user: {
          id: r.user?.id || r.user_id || '',
          name: r.user?.name || '',
          avatar: r.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user?.id || r.user_id || ''}`,
          isVerified: !!r.user?.isVerified,
          location: r.user?.location || '',
          interests: Array.isArray(r.user?.interests) ? r.user.interests : [],
          trustScore: r.user?.trustScore || 50,
          mutualFriends: r.user?.mutualFriends || 0,
        },
        timestamp: r.timestamp || r.created_at || '',
      })));
    } catch {
      setRequests([]);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const list = await api.getFriendSuggestions();
      const mapped: FriendUser[] = (Array.isArray(list) ? list : []).map((s: any) => {
        const online = s.isOnline === true || isUserOnlineWs(s.id) || isUserOnline(s.id);
        return {
          id: s.id,
          name: s.name || t('common.user'),
          avatar: s.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.id}`,
          isVerified: !!s.isVerified,
          isTrusted: !!s.isTrusted,
          trustScore: s.trustScore || 50,
          location: s.location || '',
          interests: Array.isArray(s.interests) ? s.interests : [],
          gender: s.gender || null,
          isOnline: online,
          mutualFriends: s.mutualFriends || 0,
        };
      });
      setSuggestions(mapped);
    } catch {
      setSuggestions([]);
    }
  }, [t, isUserOnlineWs]);

  useEffect(() => {
    loadFriends();
    loadRequests();
    loadSuggestions();
  }, [loadFriends, loadRequests, loadSuggestions]);

  // ─── Add friend search (global users) — delegated to AddFriendDialog internal state ────
  const handleSearchUsers = useCallback(async (query: string): Promise<any[]> => {
    if (!query || query.length < 2) return [];
    try {
      const results = await api.searchUsers(query);
      return Array.isArray(results) ? results : [];
    } catch {
      return [];
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadFriends();
    loadRequests();
    loadSuggestions();
  }, [loadFriends, loadRequests, loadSuggestions]);

  // ─── Actions ──────────────────────────────────────────────────────
  const handleAccept = async (reqId: string) => {
    try {
      await acceptFriendRequest(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
      toast.success('تم قبول طلب الصداقة');
      // Refresh friends list to include the new friend
      setTimeout(loadFriends, 200);
    } catch (err: any) {
      criticalError(err?.message || 'فشل قبول الطلب');
    }
  };

  const handleReject = async (reqId: string) => {
    try {
      await rejectFriendRequest(reqId);
      setRequests(prev => prev.filter(r => r.id !== reqId));
      toast.info('تم رفض طلب الصداقة');
    } catch (err: any) {
      criticalError(err?.message || 'فشل رفض الطلب');
    }
  };

  const handleAddSuggestion = async (userId: string) => {
    setAddingIds(prev => new Set([...prev, userId]));
    try {
      await api.sendFriendRequest(userId);
      setSuggestions(prev => prev.filter(s => s.id !== userId));
      toast.success('تم إرسال طلب الصداقة');
    } catch (err: any) {
      criticalError(err?.message || 'فشل إرسال الطلب');
    } finally {
      setAddingIds(prev => { const n = new Set(prev); n.delete(userId); return n; });
    }
  };

  const handleRemoveFriend = async () => {
    if (!confirmRemove) return;
    const f = confirmRemove;
    setConfirmRemove(null);
    try {
      if (f.friendshipId) {
        await api.unfriend(f.friendshipId);
      } else {
        await api.unfriendByUserId(f.id);
      }
      setFriends(prev => prev.filter(x => x.id !== f.id));
      toast.info('تمت إزالة الصداقة');
    } catch {
      // Fallback to local removal
      setFriends(prev => prev.filter(x => x.id !== f.id));
      toast.info('تمت إزالة الصداقة');
    }
  };

  const handleBlockUser = async () => {
    if (!confirmBlock) return;
    const f = confirmBlock;
    setConfirmBlock(null);
    try {
      await api.blockUser(f.id);
      setFriends(prev => prev.filter(x => x.id !== f.id));
      setSuggestions(prev => prev.filter(x => x.id !== f.id));
      toast.success('تم حظر المستخدم');
    } catch (err: any) {
      criticalError(err?.message || 'فشل حظر المستخدم');
    }
  };

  const sendMessage = (userId: string) => {
    setMenuOpenFor(null);
    navigate('/connect');
  };

  // ─── Filter friends by search query ───────────────────────────────
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.trim().toLowerCase();
    return friends.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.location || '').toLowerCase().includes(q) ||
      (f.interests || []).some(i => i.toLowerCase().includes(q))
    );
  }, [friends, searchQuery]);

  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return suggestions;
    const q = searchQuery.trim().toLowerCase();
    return suggestions.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.location || '').toLowerCase().includes(q)
    );
  }, [suggestions, searchQuery]);

  const myInterests = currentUser?.interests || [];
  const getSharedInterests = (other?: string[]) => {
    if (!other) return [];
    return myInterests.filter(i => other.includes(i));
  };

  // ─── Tabs config ──────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'friends',     label: 'الأصدقاء',     icon: <Users className="w-4 h-4" />,     count: friends.length },
    { id: 'requests',    label: 'طلبات الصداقة', icon: <UserCheck className="w-4 h-4" />, count: requests.length },
    { id: 'suggestions', label: 'اقتراحات',     icon: <Sparkles className="w-4 h-4" />,  count: suggestions.length },
  ];

  return (
    <div className="max-w-3xl mx-auto" dir={dir}>
      {/* ─── Header ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-3xl overflow-hidden mb-5 relative border ${cardBg}`}
      >
        {/* Banner */}
        <div className="h-28 sm:h-32 bg-gradient-to-l from-orange-500 via-rose-500 to-pink-500 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-3 right-6 w-20 h-20 bg-white/30 rounded-full blur-xl" />
            <div className="absolute bottom-1 left-10 w-28 h-28 bg-white/20 rounded-full blur-2xl" />
          </div>
          <div className="absolute inset-0 flex items-center justify-between px-5">
            <div className="text-white">
              <h1 className="text-xl sm:text-2xl font-black mb-0.5">الأصدقاء</h1>
              <p className="text-white/85 text-[11px] font-bold">ابقَ على تواصل مع من يهمك</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAll}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-800/80 hover:bg-gray-700 text-gray-200' : 'bg-white/90 hover:bg-white text-gray-700'}`}
                aria-label="تحديث"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowAddFriend(true)}
                className="w-9 h-9 rounded-xl bg-white/90 hover:bg-white text-orange-600 flex items-center justify-center transition-colors"
                aria-label="إضافة صديق"
              >
                <UserPlus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className={`text-[11px] font-bold ${textMuted}`}>متصل الآن: {friends.filter(f => f.isOnline).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className={`w-3.5 h-3.5 ${textMuted}`} />
            <span className={`text-[11px] font-bold ${textMuted}`}>{friends.length} صديق</span>
          </div>
          {requests.length > 0 && (
            <button onClick={() => setActiveTab('requests')} className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[11px] font-bold text-orange-600">{requests.length} طلب جديد</span>
            </button>
          )}
        </div>

        {/* Search bar */}
        <div className="px-5 pb-4">
          <div className="relative">
            <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
            <input
              type="text"
              placeholder="ابحث في الأصدقاء بالاسم أو الموقع أو الاهتمامات"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${inputBg}`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className={`w-3.5 h-3.5 ${textMuted}`} />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── Tabs ─────────────────────────────────────────────────── */}
      <div className={`flex gap-1.5 p-1.5 rounded-2xl mb-5 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-gradient-to-l from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-200/30'
                : darkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                activeTab === tab.id
                  ? 'bg-white/25 text-white'
                  : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Content ──────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'friends' && (
          <motion.div
            key="friends"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {loading ? (
              <LoadingState darkMode={darkMode} />
            ) : filteredFriends.length === 0 ? (
              <EmptyState
                darkMode={darkMode}
                icon={<Users className="w-12 h-12 mx-auto mb-3 opacity-30" />}
                title={searchQuery ? 'لا توجد نتائج مطابقة' : 'لا يوجد أصدقاء بعد'}
                subtitle={searchQuery ? 'جرّب كلمات بحث مختلفة' : 'ابدأ بإضافة أصدقاء من تبويب الاقتراحات'}
                actionLabel={!searchQuery ? 'استكشف الاقتراحات' : undefined}
                onAction={!searchQuery ? () => setActiveTab('suggestions') : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredFriends.map(f => (
                  <FriendCard
                    key={f.id}
                    friend={f}
                    darkMode={darkMode}
                    myInterests={myInterests}
                    menuOpen={menuOpenFor === f.id}
                    onToggleMenu={() => setMenuOpenFor(menuOpenFor === f.id ? null : f.id)}
                    onMessage={() => sendMessage(f.id)}
                    onViewProfile={() => { setMenuOpenFor(null); navigate(`/user/${f.id}`); }}
                    onRemove={() => { setMenuOpenFor(null); setConfirmRemove(f); }}
                    onBlock={() => { setMenuOpenFor(null); setConfirmBlock(f); }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'requests' && (
          <motion.div
            key="requests"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {requests.length === 0 ? (
              <EmptyState
                darkMode={darkMode}
                icon={<UserCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />}
                title="لا توجد طلبات صداقة معلقة"
                subtitle="عندما يرسل لك أحدهم طلب صداقة، ستجده هنا"
              />
            ) : (
              requests.map(req => (
                <RequestCard
                  key={req.id}
                  request={req}
                  darkMode={darkMode}
                  myInterests={myInterests}
                  onAccept={() => handleAccept(req.id)}
                  onReject={() => handleReject(req.id)}
                  onViewProfile={() => navigate(`/user/${req.user.id}`)}
                />
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'suggestions' && (
          <motion.div
            key="suggestions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            <div className={`flex items-center gap-2 px-1 pb-1`}>
              <Compass className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
              <p className={`text-xs font-bold ${textMuted}`}>أشخاص قد تعرفهم — بناءً على الاهتمامات المشتركة والأصدقاء المشتركين</p>
            </div>
            {filteredSuggestions.length === 0 ? (
              <EmptyState
                darkMode={darkMode}
                icon={<Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />}
                title={searchQuery ? 'لا توجد نتائج' : 'لا توجد اقتراحات حالياً'}
                subtitle={searchQuery ? 'جرّب كلمات بحث مختلفة' : 'أضف اهتماماتك من ملفك الشخصي لتحصل على اقتراحات أفضل'}
                actionLabel={!searchQuery ? 'تعديل الاهتمامات' : undefined}
                onAction={!searchQuery ? () => navigate('/profile') : undefined}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredSuggestions.map(s => (
                  <SuggestionCard
                    key={s.id}
                    user={s}
                    darkMode={darkMode}
                    myInterests={myInterests}
                    adding={addingIds.has(s.id)}
                    onAdd={() => handleAddSuggestion(s.id)}
                    onViewProfile={() => navigate(`/user/${s.id}`)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Add Friend Dialog ────────────────────────────────────── */}
      <AnimatePresence>
        {showAddFriend && (
          <AddFriendDialog
            darkMode={darkMode}
            addingIds={addingIds}
            onAdd={handleAddSuggestion}
            onSearch={handleSearchUsers}
            onClose={() => setShowAddFriend(false)}
            onViewProfile={(id) => { setShowAddFriend(false); navigate(`/user/${id}`); }}
          />
        )}
      </AnimatePresence>

      {/* ─── Confirm dialogs ──────────────────────────────────────── */}
      <AnimatePresence>
        {confirmRemove && (
          <ConfirmDialog
            darkMode={darkMode}
            title="إزالة الصداقة"
            message={`هل أنت متأكد من إزالة ${confirmRemove.name} من قائمة الأصدقاء؟ لن يتمكن من مراسلتك.`}
            confirmLabel="إزالة"
            confirmColor="bg-red-600 hover:bg-red-700"
            onConfirm={handleRemoveFriend}
            onCancel={() => setConfirmRemove(null)}
          />
        )}
        {confirmBlock && (
          <ConfirmDialog
            darkMode={darkMode}
            title="حظر المستخدم"
            message={`هل تريد حظر ${confirmBlock.name}؟ لن يتمكن من التواصل معك أو رؤية ملفك.`}
            confirmLabel="حظر"
            confirmColor="bg-red-600 hover:bg-red-700"
            onConfirm={handleBlockUser}
            onCancel={() => setConfirmBlock(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Friend Card ──────────────────────────────────────────────────────
const FriendCard: React.FC<{
  friend: FriendUser;
  darkMode: boolean;
  myInterests: string[];
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  onRemove: () => void;
  onBlock: () => void;
}> = ({ friend, darkMode, myInterests, menuOpen, onToggleMenu, onMessage, onViewProfile, onRemove, onBlock }) => {
  const { t } = useTranslation();
  const shared = myInterests.filter(i => (friend.interests || []).includes(i));
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      className={`relative rounded-2xl border ${cardBg} p-4 shadow-sm hover:shadow-md transition-shadow`}
    >
      {/* Top row: avatar + name + menu */}
      <div className="flex items-start gap-3">
        <button onClick={onViewProfile} className="relative flex-shrink-0">
          <img
            src={friend.avatar}
            alt={friend.name}
            className={`w-14 h-14 rounded-2xl object-cover border-2 ${friend.isOnline ? 'border-green-400' : 'border-transparent'}`}
          />
          {friend.isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={onViewProfile} className="text-right min-w-0">
              <h3 className={`text-sm font-black truncate ${textPrimary}`}>{friend.name}</h3>
            </button>
            {friend.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />}
            {friend.isTrusted && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
            <div className="relative ml-auto">
              <button
                onClick={onToggleMenu}
                className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                aria-label="المزيد"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -5 }}
                    className={`absolute top-full mt-1 left-0 rounded-xl border shadow-xl py-1 min-w-[160px] z-30 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                  >
                    <MenuItem darkMode={darkMode} icon={<Eye className="w-4 h-4" />} label="عرض الملف" onClick={onViewProfile} />
                    <MenuItem darkMode={darkMode} icon={<MessageCircle className="w-4 h-4" />} label="مراسلة" onClick={onMessage} />
                    <div className={`my-1 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />
                    <MenuItem darkMode={darkMode} icon={<UserMinus className="w-4 h-4" />} label="إزالة الصداقة" danger onClick={onRemove} />
                    <MenuItem darkMode={darkMode} icon={<Ban className="w-4 h-4" />} label="حظر" danger onClick={onBlock} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Last seen / online */}
          <div className="flex items-center gap-1 mt-0.5">
            <div className={`w-1.5 h-1.5 rounded-full ${friend.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            <p className={`text-[10px] font-bold ${friend.isOnline ? 'text-green-600' : textMuted}`}>
              {friend.isOnline ? 'متصل الآن' : (friend.lastSeen || 'غير متصل')}
            </p>
          </div>
          {/* Location */}
          {friend.location && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className={`w-3 h-3 ${textMuted}`} />
              <p className={`text-[10px] font-bold ${textMuted}`}>{friend.location}</p>
            </div>
          )}
        </div>
      </div>

      {/* Trust score */}
      {friend.trustScore != null && friend.trustScore > 0 && (
        <div className="flex items-center gap-1.5 mt-2.5">
          <Shield className={`w-3 h-3 ${textMuted}`} />
          <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(friend.trustScore, 100)}%`,
                background: friend.trustScore >= 70 ? '#22c55e' : friend.trustScore >= 40 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
          <span className={`text-[9px] font-black ${textMuted}`}>{friend.trustScore}%</span>
        </div>
      )}

      {/* Shared interests */}
      {shared.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <Handshake className="w-3 h-3 text-orange-500 flex-shrink-0" />
          {shared.slice(0, 3).map(i => {
            const cfg = interestCategories.find(c => c.id === i);
            return (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 flex items-center gap-0.5">
                {cfg?.icon && <span>{cfg.icon}</span>}
                {t(cfg?.nameKey || `interests.${i}`, i)}
              </span>
            );
          })}
          {shared.length > 3 && (
            <span className={`text-[9px] font-bold ${textMuted}`}>+{shared.length - 3}</span>
          )}
        </div>
      )}

      {/* Action button */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onMessage}
          className="flex-1 bg-gradient-to-l from-orange-500 to-rose-500 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition"
        >
          <MessageCircle className="w-3.5 h-3.5" /> مراسلة
        </button>
        <button
          onClick={onViewProfile}
          className={`px-3 py-2 rounded-xl text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
};

// ─── Request Card ─────────────────────────────────────────────────────
const RequestCard: React.FC<{
  request: FriendRequestItem;
  darkMode: boolean;
  myInterests: string[];
  onAccept: () => void;
  onReject: () => void;
  onViewProfile: () => void;
}> = ({ request, darkMode, myInterests, onAccept, onReject, onViewProfile }) => {
  const { t } = useTranslation();
  const shared = myInterests.filter(i => (request.user.interests || []).includes(i));
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className={`rounded-2xl border ${cardBg} p-4 shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <button onClick={onViewProfile}>
          <img src={request.user.avatar} alt={request.user.name} className="w-14 h-14 rounded-2xl object-cover" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={onViewProfile} className="text-right min-w-0">
              <h3 className={`text-sm font-black truncate ${textPrimary}`}>{request.user.name}</h3>
            </button>
            {request.user.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />}
          </div>
          {request.user.location && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className={`w-3 h-3 ${textMuted}`} />
              <p className={`text-[10px] font-bold ${textMuted}`}>{request.user.location}</p>
            </div>
          )}
          {request.timestamp && (
            <p className={`text-[10px] font-bold ${textMuted} mt-0.5`}>
              أرسل الطلب {formatRelativeTime(request.timestamp)}
            </p>
          )}
          {shared.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              <Handshake className="w-3 h-3 text-orange-500 flex-shrink-0" />
              {shared.slice(0, 3).map(i => {
                const cfg = interestCategories.find(c => c.id === i);
                return (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 flex items-center gap-0.5">
                    {cfg?.icon && <span>{cfg.icon}</span>}
                    {t(cfg?.nameKey || `interests.${i}`, i)}
                  </span>
                );
              })}
            </div>
          )}
          {(request.user.mutualFriends || 0) > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <Users className={`w-3 h-3 ${textMuted}`} />
              <p className={`text-[10px] font-bold ${textMuted}`}>{request.user.mutualFriends} صديق مشترك</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onAccept}
          className="flex-1 bg-gradient-to-l from-green-500 to-emerald-500 text-white py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition"
        >
          <Check className="w-4 h-4" /> قبول
        </button>
        <button
          onClick={onReject}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'} flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition`}
        >
          <X className="w-4 h-4" /> رفض
        </button>
      </div>
    </motion.div>
  );
};

// ─── Suggestion Card ──────────────────────────────────────────────────
const SuggestionCard: React.FC<{
  user: FriendUser;
  darkMode: boolean;
  myInterests: string[];
  adding: boolean;
  onAdd: () => void;
  onViewProfile: () => void;
}> = ({ user, darkMode, myInterests, adding, onAdd, onViewProfile }) => {
  const { t } = useTranslation();
  const shared = myInterests.filter(i => (user.interests || []).includes(i));
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      className={`relative rounded-2xl border ${cardBg} p-4 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start gap-3">
        <button onClick={onViewProfile} className="relative flex-shrink-0">
          <img src={user.avatar} alt={user.name} className="w-14 h-14 rounded-2xl object-cover" />
          {user.isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <button onClick={onViewProfile} className="text-right min-w-0">
              <h3 className={`text-sm font-black truncate ${textPrimary}`}>{user.name}</h3>
            </button>
            {user.isVerified && <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />}
            {user.isTrusted && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
          </div>
          {user.location && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className={`w-3 h-3 ${textMuted}`} />
              <p className={`text-[10px] font-bold ${textMuted}`}>{user.location}</p>
            </div>
          )}
          {(user.mutualFriends || 0) > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              <Users className={`w-3 h-3 ${textMuted}`} />
              <p className={`text-[10px] font-bold ${textMuted}`}>{user.mutualFriends} صديق مشترك</p>
            </div>
          )}
        </div>
      </div>
      {/* Shared interests */}
      {shared.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          <Sparkles className="w-3 h-3 text-orange-500 flex-shrink-0" />
          {shared.slice(0, 4).map(i => {
            const cfg = interestCategories.find(c => c.id === i);
            return (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 flex items-center gap-0.5">
                {cfg?.icon && <span>{cfg.icon}</span>}
                {t(cfg?.nameKey || `interests.${i}`, i)}
              </span>
            );
          })}
          {shared.length > 4 && (
            <span className={`text-[9px] font-bold ${textMuted}`}>+{shared.length - 4}</span>
          )}
        </div>
      ) : user.interests && user.interests.length > 0 ? (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {user.interests.slice(0, 3).map(i => {
            const cfg = interestCategories.find(c => c.id === i);
            return (
              <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} flex items-center gap-0.5`}>
                {cfg?.icon && <span>{cfg.icon}</span>}
                {t(cfg?.nameKey || `interests.${i}`, i)}
              </span>
            );
          })}
        </div>
      ) : null}
      {/* Add button */}
      <button
        onClick={onAdd}
        disabled={adding}
        className="mt-3 w-full bg-gradient-to-l from-orange-500 to-rose-500 text-white py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-95 transition disabled:opacity-60"
      >
        {adding ? (
          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> جاري الإرسال</>
        ) : (
          <><UserPlus className="w-4 h-4" /> إضافة صديق</>
        )}
      </button>
    </motion.div>
  );
};

// ─── Add Friend Dialog ────────────────────────────────────────────────
const AddFriendDialog: React.FC<{
  darkMode: boolean;
  addingIds: Set<string>;
  onAdd: (id: string) => void;
  onSearch: (q: string) => Promise<any[]>;
  onClose: () => void;
  onViewProfile: (id: string) => void;
}> = ({ darkMode, addingIds, onAdd, onSearch, onClose, onViewProfile }) => {
  const [localQuery, setLocalQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500'
    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400';

  useEffect(() => {
    let active = true;
    if (localQuery.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await onSearch(localQuery);
      if (active) {
        setResults(r);
        setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [localQuery, onSearch]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl border shadow-2xl ${cardBg} max-h-[80vh] flex flex-col`}
      >
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-500" />
            <h3 className={`font-black text-base ${textPrimary}`}>إضافة صديق</h3>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
            <input
              type="text"
              placeholder="ابحث بالاسم أو البريد الإلكتروني"
              value={localQuery}
              onChange={e => setLocalQuery(e.target.value)}
              className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-sm outline-none ${inputBg}`}
              autoFocus
            />
            {searching && (
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <p className={`text-[10px] font-bold ${textMuted} mt-2`}>اكتب حرفين على الأقل للبحث</p>
        </div>
        <div className="overflow-y-auto px-4 pb-4 flex-1 space-y-2">
          {localQuery.length >= 2 && results.length === 0 && !searching && (
            <div className="text-center py-8">
              <UserX className={`w-10 h-10 mx-auto mb-2 ${textMuted} opacity-40`} />
              <p className={`text-xs font-bold ${textMuted}`}>لا توجد نتائج مطابقة</p>
            </div>
          )}
          {results.map((u: any) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}
            >
              <button onClick={() => onViewProfile(u.id)}>
                <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-xl object-cover" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold truncate ${textPrimary}`}>{u.name}</span>
                  {u.is_verified && <CheckCircle2 className="w-3 h-3 text-sky-500 flex-shrink-0" />}
                </div>
                {u.location && <p className={`text-[10px] font-bold ${textMuted}`}>{u.location}</p>}
              </div>
              {u.friendshipStatus ? (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${u.friendshipStatus === 'accepted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                  {u.friendshipStatus === 'accepted' ? 'صديق' : 'بانتظار'}
                </span>
              ) : (
                <button
                  onClick={() => onAdd(u.id)}
                  disabled={addingIds.has(u.id)}
                  className="p-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition disabled:opacity-60"
                >
                  {addingIds.has(u.id) ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Confirm Dialog ───────────────────────────────────────────────────
const ConfirmDialog: React.FC<{
  darkMode: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ darkMode, title, message, confirmLabel, confirmColor = 'bg-red-600 hover:bg-red-700', onConfirm, onCancel }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onCancel}
    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  >
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      onClick={e => e.stopPropagation()}
      className={`w-full max-w-sm rounded-2xl border shadow-2xl p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
    >
      <h3 className={`font-black text-base mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
      <p className={`text-sm mb-5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{message}</p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          إلغاء
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white ${confirmColor}`}
        >
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  </motion.div>
);

// ─── Empty State ──────────────────────────────────────────────────────
const EmptyState: React.FC<{
  darkMode: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ darkMode, icon, title, subtitle, actionLabel, onAction }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className={`p-10 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
  >
    <div className={darkMode ? 'text-gray-500' : 'text-gray-400'}>{icon}</div>
    <p className={`font-black text-base mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</p>
    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-4 max-w-xs mx-auto`}>{subtitle}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="bg-gradient-to-l from-orange-500 to-rose-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:opacity-90 active:scale-95 transition"
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
);

// ─── Loading State ────────────────────────────────────────────────────
const LoadingState: React.FC<{ darkMode: boolean }> = ({ darkMode }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {[1, 2, 3, 4].map(i => (
      <div
        key={i}
        className={`rounded-2xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} animate-pulse`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-14 h-14 rounded-2xl ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className="flex-1 space-y-2">
            <div className={`h-3 w-24 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-2 w-16 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
            <div className={`h-2 w-20 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          </div>
        </div>
        <div className={`h-8 mt-3 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
      </div>
    ))}
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'منذ لحظات';
    if (diffSec < 3600) return `منذ ${Math.floor(diffSec / 60)} دقيقة`;
    if (diffSec < 86400) return `منذ ${Math.floor(diffSec / 3600)} ساعة`;
    return `منذ ${Math.floor(diffSec / 86400)} يوم`;
  } catch {
    return '';
  }
}

// Helper: show a critical error toast (bypasses silentToast suppression)
function criticalError(msg: string) {
  (toast as unknown as { error: (m: string, opts?: Record<string, unknown>) => void }).error(msg, { critical: true });
}

// ─── Menu Item (for friend action dropdown) ───────────────────────────
const MenuItem: React.FC<{ darkMode: boolean; icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ darkMode, icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors ${
      danger
        ? darkMode ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'
        : darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
    }`}
  >
    {icon} {label}
  </button>
);

export default FriendsPage;
