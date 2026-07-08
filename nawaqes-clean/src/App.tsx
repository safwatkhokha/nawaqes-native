// ─── Nawaqes App - Refactored with JWT Auth + SQLite Backend + i18n ──
import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Link, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster } from 'sonner';
import { toast } from './lib/silentToast';
import { Filter, Plus, ArrowLeft, Wallet, Megaphone, MessageCircle, TrendingUp, Sparkles, Bell, ChevronLeft, Heart, Eye, Clock, Zap, Star, ArrowUpRight, Flame, Search, Crown, Target, Globe, Activity, ShoppingBag, BarChart3, Gift, Smartphone, X, Video, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// i18n & Language
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

// Contexts
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppProvider, useAppContext } from './contexts/AppContext';

// Components
import { Navbar } from './components/Navbar';
import { Sidebar, MobileSidebarDrawer, SidebarDrawerProvider } from './components/Sidebar';
import { RightSidebar } from './components/RightSidebar';
import { PageHeader } from './components/PageHeader';
import { CreatePost } from './components/CreatePost';
import { GlobalCreatePostModal } from './components/GlobalCreatePostModal';
import { PostCard } from './components/PostCard';
import { FilterBar } from './components/FilterBar';
import { CategoryNav } from './components/CategoryNav';
import { AdminAlertBar } from './components/AdminAlertBar';
// NOTE: AdminAlertBar is no longer rendered (replaced by toast notifications
// that auto-hide after 10 seconds). The import is kept so any other component
// that may reference it doesn't break the build; it can be removed later.
void AdminAlertBar;
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { Stories } from './components/Stories';
import { NewsTicker } from './components/NewsTicker';
import { AdminDashboard } from './components/admin';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { MessagesPage } from './components/MessagesPage';
import { ChatApp } from './chat-app/ChatApp';
import { ChatLayout } from './chat/ChatLayout';
import { MarketPage } from './components/MarketPage';
import { WalletPage } from './components/WalletPage';
import { SavedPage } from './components/SavedPage';
import { PostDetailPage } from './components/PostDetailPage';
import { LoginPage } from './components/LoginPage';
import { UserProfilePage } from './components/UserProfilePage';
import { UserVideosPage } from './components/UserVideosPage';
import { PromotionAnalytics } from './components/PromotionAnalytics';
import { FriendsPage } from './components/FriendsPage';
import { MyPage } from './components/MyPage';
import { ComplaintPage } from './components/ComplaintPage';
import { HelpPage } from './components/HelpPage';
import { MarketPulsePage } from './components/MarketPulsePage';
import { MarketLivePage } from './components/MarketLivePage';
import { FoodPage } from './components/FoodPage';
import { MatchesPage } from './components/MatchesPage';
import { NotificationsPage } from './components/NotificationsPage';
import { NotificationToast } from './components/NotificationToast';
import { FloatingChatButton } from './components/FloatingChatButton';
import { BackgroundUploadBadge } from './components/BackgroundUploadBadge';
import { AIFloatingButton, AIPromotionPage } from './components/AIPromotionAssistant';
import { MobileBottomNav } from './components/MobileBottomNav';
// PWAInstallBanner removed
import { setupAutoInit as setupFirebase } from './lib/firebase';
import { LiveStreamPage } from './components/LiveStreamPage';
// NOTE: LiveStreamPage (standalone /live-stream route) is DEPRECATED.
// Live streaming is now handled exclusively inside Channels (/channels/:id/live).
// The route is kept below only to avoid breaking old links/bookmarks,
// but it redirects to /channels.
import { MarketListingPage } from './components/MarketListingPage';
import { CreateMarketListing } from './components/CreateMarketListing';
import { ChannelsPage } from './components/ChannelsPage';
import { ChannelView } from './components/ChannelView';
import { EmailVerification, EmailBadge } from './components/EmailVerification';
import { SplashScreen } from './components/SplashScreen';
import { ScheduledStreams } from './components/ScheduledStreams';
import { MyMarketListings } from './components/MyMarketListings';
import { SmartReachPage } from './components/SmartReachPage';
import { PromotionPackagesPage } from './components/PromotionPackagesPage';
// API
import { api } from './services/api';
import { parseDBTimestamp } from './utils/time';
import { RouterInner } from './components/RouterInner';
import { usePullToRefresh } from './hooks/usePullToRefresh';

// ─── Auth Guards ────────────────────────────────────────────────────
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, initializing } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir={dir}>
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold text-gray-500">{t('common.loading')}</p>
      </div>
    </div>
  );
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoggedIn, initializing } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir={dir}>
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold text-gray-500">{t('common.loading')}</p>
      </div>
    </div>
  );
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!currentUser?.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

// ─── Deposit Confirmation Banner ──────────────────────────────────
const DepositConfirmationBanner: React.FC = () => {
  const { depositConfirmation, hideDepositConfirmation, updateWalletBalance } = useAppContext();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const handleConfirm = () => {
    if (!depositConfirmation) return;
    updateWalletBalance(depositConfirmation.amount);
    toast.success(t('app.chargeSuccess', { amount: depositConfirmation.amount.toLocaleString() }));
    hideDepositConfirmation();
  };
  return (
    <AnimatePresence>
      {depositConfirmation && depositConfirmation.show && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-green-50 border-b border-green-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 max-w-[1600px] mx-auto" dir={dir}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><span className="text-green-600 text-lg">💰</span></div>
              <div>
                <p className="font-bold text-green-900 text-sm">{t('depositBanner.confirmCharge')}</p>
                <p className="text-green-700 text-xs">{t('depositBanner.chargeAmount', { amount: depositConfirmation.amount.toLocaleString() })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleConfirm} className="bg-green-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-green-700 active:scale-95">{t('depositBanner.confirm')}</button>
              <button onClick={hideDepositConfirmation} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-200">{t('common.cancel')}</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Share Modal ──────────────────────────────────────────────────
const ShareModal: React.FC = () => {
  const { shareModalPost, closeShareModal, darkMode } = useAppContext();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // State for friends list
  const [friendsList, setFriendsList] = React.useState<any[]>([]);
  const [friendSearch, setFriendSearch] = React.useState('');
  const [showFriends, setShowFriends] = React.useState(false);

  // State for share stats
  const [shareStats, setShareStats] = React.useState<{ total: number; byPlatform: Record<string, number>; recentShares: any[] } | null>(null);

  // State for QR code
  const [showQR, setShowQR] = React.useState(false);

  // State for smart link analytics
  const [showSmartLinkPanel, setShowSmartLinkPanel] = React.useState(false);
  const [smartLinkStats, setSmartLinkStats] = React.useState<{ totalVisits: number; uniqueVisitors: number; visitsByDate: any[]; recentVisitors: any[] } | null>(null);
  const [customAlias, setCustomAlias] = React.useState('');
  const [aliasGenerated, setAliasGenerated] = React.useState('');

  // Fetch share stats when modal opens
  React.useEffect(() => {
    if (shareModalPost) {
      api.getShareStats(shareModalPost.id).then(setShareStats).catch(() => {});
    }
  }, [shareModalPost?.id]);

  // Fetch friends when friend section opens
  React.useEffect(() => {
    if (showFriends) {
      api.getFriendsList().then((list: any) => { if (Array.isArray(list)) setFriendsList(list); }).catch(() => {});
    }
  }, [showFriends]);

  // Fetch smart link stats when panel opens
  React.useEffect(() => {
    if (showSmartLinkPanel && shareModalPost) {
      api.getSmartLinkStats(shareModalPost.id).then(setSmartLinkStats).catch(() => {});
    }
  }, [showSmartLinkPanel, shareModalPost?.id]);

  if (!shareModalPost) return null;
  // Use /post/:id (without hash) for social media sharing — server returns
  // dynamic OG meta tags so WhatsApp/Facebook/Twitter show rich previews.
  const shareUrl = `${window.location.origin}/post/${shareModalPost.id}`;
  const smartLinkUrl = `${window.location.origin}/api/smart-link/${shareModalPost.id}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(smartLinkUrl)}`;

  const handleShareTimeline = () => {
    api.trackShare(shareModalPost.id, 'internal').catch(() => {});
    closeShareModal();
    toast.success(t('shareModal.sharedOnAccount'), { description: t('shareModal.sharedOnPage'), duration: 3000 });
  };

  const handleShareMessage = () => {
    api.trackShare(shareModalPost.id, 'internal').catch(() => {});
    closeShareModal();
    toast.success(t('shareModal.sentAsMessage'));
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).catch(() => { toast.error(t('shareModal.copyFailed')); });
    api.trackShare(shareModalPost.id, 'link').catch(() => {});
    closeShareModal();
    toast.success(t('shareModal.linkCopied'));
  };

  const handleSmartLink = () => {
    navigator.clipboard.writeText(smartLinkUrl).catch(() => { toast.error(t('shareModal.copyFailed')); });
    api.trackShare(shareModalPost.id, 'smart_link').catch(() => {});
    closeShareModal();
    toast.success(t('postCard.smartLinkCopied'));
  };

  const handleExternal = (p: string) => {
    const txt = encodeURIComponent(shareModalPost.content.slice(0, 100)), u = encodeURIComponent(shareUrl);
    const links: Record<string, string> = { whatsapp: `https://wa.me/?text=${txt}%20${u}`, telegram: `https://t.me/share/url?url=${u}&text=${txt}`, twitter: `https://twitter.com/intent/tweet?text=${txt}&url=${u}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}` };
    if (links[p]) window.open(links[p], '_blank', 'width=600,height=400');
    api.trackShare(shareModalPost.id, p).catch(() => {});
    closeShareModal();
  };

  const handleShareWithFriend = (friend: any) => {
    const msg = `${t('shareModal.title')}: ${shareModalPost.content.slice(0, 80)}... ${shareUrl}`;
    api.sendMessage(friend.id, msg, shareModalPost.id).catch(() => {});
    api.trackShare(shareModalPost.id, 'internal').catch(() => {});
    setShowFriends(false);
    closeShareModal();
    toast.success(t('shareModal.sharedWithFriend'));
  };

  const handleGenerateCustomLink = async () => {
    if (!customAlias.trim()) return;
    try {
      const result = await api.generateSmartLink(shareModalPost.id, customAlias.trim());
      setAliasGenerated(result.alias);
      toast.success(t('shareModal.customLinkGenerated'));
      // Refresh stats
      api.getSmartLinkStats(shareModalPost.id).then(setSmartLinkStats).catch(() => {});
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownloadQR = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const link = document.createElement('a');
        link.download = `qr-post-${shareModalPost.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    img.src = qrCodeUrl;
  };

  const filteredFriends = friendsList.filter((f: any) =>
    !friendSearch || f.name?.toLowerCase().includes(friendSearch.toLowerCase())
  );

  // Platform icons for stats
  const platformIcons: Record<string, { emoji: string; label: string }> = {
    internal: { emoji: '📝', label: t('shareModal.shareOnMyPage') },
    whatsapp: { emoji: '📱', label: t('shareModal.whatsapp') },
    telegram: { emoji: '✈️', label: t('shareModal.telegram') },
    facebook: { emoji: '👤', label: t('shareModal.facebook') },
    twitter: { emoji: '🐦', label: t('shareModal.twitter') },
    link: { emoji: '🔗', label: t('shareModal.copyLink') },
    smart_link: { emoji: '🎯', label: t('postCard.smartLink') },
  };

  return (
    <AnimatePresence>
      {shareModalPost && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeShareModal}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`} dir={dir} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('shareModal.title')}</h3>
              <button onClick={closeShareModal} className={`w-8 h-8 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'} rounded-full flex items-center justify-center`}>✕</button>
            </div>

            {/* Post preview */}
            <div className={`p-4 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3 mb-2">
                <img src={shareModalPost.author.avatar} alt="" className="w-8 h-8 rounded-full" />
                <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{shareModalPost.author.name}</span>
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'} line-clamp-2`}>{shareModalPost.content}</p>
            </div>

            {/* Share on your page section */}
            <div className="p-4 space-y-2">
              <p className={`text-[11px] font-black ${darkMode ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-3`}>{t('shareModal.shareOnYourPage')}</p>
              <button onClick={handleShareTimeline} className={`w-full flex items-center gap-3 p-3 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-orange-50'} rounded-xl transition-colors text-right group`}>
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center group-hover:bg-orange-200"><span className="text-lg">📝</span></div>
                <div><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('shareModal.shareOnMyPage')}</p><p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('shareModal.willAppearOnProfile')}</p></div>
              </button>
              <button onClick={handleShareMessage} className={`w-full flex items-center gap-3 p-3 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-blue-50'} rounded-xl transition-colors text-right group`}>
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200"><span className="text-lg">💬</span></div>
                <div><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('shareModal.sendAsMessage')}</p><p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('shareModal.sendInPrivateChat')}</p></div>
              </button>

              {/* Share with friend */}
              <button onClick={() => setShowFriends(!showFriends)} className={`w-full flex items-center gap-3 p-3 ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-green-50'} rounded-xl transition-colors text-right group`}>
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-200"><span className="text-lg">👥</span></div>
                <div><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('shareModal.shareWithFriend')}</p><p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('shareModal.sendInPrivateChat')}</p></div>
              </button>

              {/* Friends list (expandable) */}
              <AnimatePresence>
                {showFriends && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl p-3 mt-1`}>
                      <input
                        type="text"
                        placeholder={t('shareModal.searchFriends')}
                        value={friendSearch}
                        onChange={e => setFriendSearch(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm ${darkMode ? 'bg-gray-600 text-white placeholder-gray-400 border-gray-600' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-orange-400`}
                      />
                      <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                        {filteredFriends.length === 0 ? (
                          <p className={`text-xs text-center py-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('common.noData')}</p>
                        ) : filteredFriends.map((friend: any) => (
                          <button key={friend.id} onClick={() => handleShareWithFriend(friend)} className={`w-full flex items-center gap-3 p-2 rounded-lg ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-white'} transition-colors`}>
                            <img src={friend.avatar} alt="" className="w-8 h-8 rounded-full" />
                            <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{friend.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Share Statistics */}
            {shareStats && shareStats.total > 0 && (
              <div className={`px-4 pb-3`}>
                <div className={`${darkMode ? 'bg-gray-700/50 border-gray-700' : 'bg-gray-50 border-gray-100'} border rounded-xl p-3`}>
                  <p className={`text-[11px] font-black ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-2`}>{t('shareModal.shareStats')}</p>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('shareModal.totalShares')}</span>
                    <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{shareStats.total}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(shareStats.byPlatform).map(([platform, count]) => {
                      const icon = platformIcons[platform];
                      return icon ? (
                        <span key={platform} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${darkMode ? 'bg-gray-600 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          <span>{icon.emoji}</span>
                          <span>{count}</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* External sharing */}
            <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <p className={`text-[11px] font-black ${darkMode ? 'text-gray-500' : 'text-gray-400'} uppercase tracking-wider mb-3`}>{t('shareModal.shareOutside')}</p>
              <div className="grid grid-cols-4 gap-3">
                {[{ p: 'whatsapp', e: '📱', l: t('shareModal.whatsapp'), c: 'bg-green-100' }, { p: 'telegram', e: '✈️', l: t('shareModal.telegram'), c: 'bg-blue-100' }, { p: 'facebook', e: '👤', l: t('shareModal.facebook'), c: 'bg-blue-100' }, { p: 'twitter', e: '🐦', l: t('shareModal.twitter'), c: 'bg-gray-100' }].map(x => (
                  <button key={x.p} onClick={() => handleExternal(x.p)} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} group`}>
                    <div className={`w-12 h-12 ${x.c} rounded-full flex items-center justify-center group-hover:scale-110 transition-transform`}><span className="text-xl">{x.e}</span></div>
                    <span className={`text-[9px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{x.l}</span>
                  </button>
                ))}
              </div>
              <button onClick={handleCopyLink} className={`w-full mt-3 flex items-center justify-center gap-2 p-3 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'} rounded-xl border`}>
                <span>🔗</span><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('shareModal.copyLink')}</span>
              </button>

              {/* QR Code button */}
              <button onClick={() => setShowQR(!showQR)} className={`w-full mt-2 flex items-center justify-center gap-2 p-3 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 border-gray-600' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'} rounded-xl border`}>
                <span>📷</span><span className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('shareModal.qrCode')}</span>
              </button>

              {/* QR Code popup */}
              <AnimatePresence>
                {showQR && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className={`flex flex-col items-center p-4 mt-2 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-xl`}>
                      <img src={qrCodeUrl} alt="QR Code" className="w-[150px] h-[150px] rounded-lg" />
                      <button onClick={handleDownloadQR} className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-gray-300' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}`}>
                        <span>💾</span>{t('shareModal.downloadQR')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Smart Link button */}
              <button onClick={() => setShowSmartLinkPanel(!showSmartLinkPanel)} className="w-full mt-2 flex items-center justify-center gap-2 p-3 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200">
                <span>🎯</span><span className="text-sm font-bold text-amber-700">{t('postCard.smartLink')}</span>
              </button>

              {/* Smart Link Analytics Panel */}
              <AnimatePresence>
                {showSmartLinkPanel && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className={`mt-2 p-4 ${darkMode ? 'bg-amber-900/20 border-amber-800/40' : 'bg-amber-50 border-amber-200'} border rounded-xl`}>
                      <p className={`text-[11px] font-black ${darkMode ? 'text-amber-400' : 'text-amber-600'} uppercase tracking-wider mb-3`}>{t('shareModal.smartLinkAnalytics')}</p>

                      {/* Custom alias input */}
                      <div className="mb-3">
                        <label className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'} mb-1 block`}>{t('shareModal.customAlias')}</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={t('shareModal.aliasPlaceholder')}
                            value={customAlias}
                            onChange={e => setCustomAlias(e.target.value)}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs ${darkMode ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-amber-400`}
                          />
                          <button onClick={handleGenerateCustomLink} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors active:scale-95">
                            {t('shareModal.generateCustomLink')}
                          </button>
                        </div>
                        {aliasGenerated && (
                          <p className={`text-[10px] mt-1 ${darkMode ? 'text-green-400' : 'text-green-600'} font-bold`}>
                            ✓ {t('shareModal.customLinkGenerated')}: /{aliasGenerated}
                          </p>
                        )}
                      </div>

                      {/* Stats */}
                      {smartLinkStats && (
                        <>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-white'} rounded-lg p-2.5 text-center`}>
                              <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{smartLinkStats.totalVisits}</p>
                              <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('shareModal.totalVisits')}</p>
                            </div>
                            <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-white'} rounded-lg p-2.5 text-center`}>
                              <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{smartLinkStats.uniqueVisitors}</p>
                              <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('shareModal.uniqueVisitors')}</p>
                            </div>
                          </div>

                          {/* Recent visits */}
                          <div>
                            <p className={`text-[10px] font-black ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider mb-2`}>{t('shareModal.recentVisits')}</p>
                            {smartLinkStats.recentVisitors.length === 0 ? (
                              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('shareModal.noVisitsYet')}</p>
                            ) : (
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {smartLinkStats.recentVisitors.slice(0, 10).map((v: any, i: number) => (
                                  <div key={i} className={`flex items-center justify-between py-1 px-2 rounded ${darkMode ? 'bg-gray-700/30' : 'bg-white'}`}>
                                    <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                      {v.visitor_name || v.visitor_ip?.slice(0, 12) || 'Anonymous'}
                                    </span>
                                    <span className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                      {new Date(v.visited_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Copy smart link */}
                      <button onClick={() => { navigator.clipboard.writeText(smartLinkUrl).catch(() => { toast.error(t('shareModal.copyFailed')); }); api.trackShare(shareModalPost.id, 'smart_link').catch(() => {}); toast.success(t('postCard.smartLinkCopied')); }} className="w-full mt-3 flex items-center justify-center gap-2 p-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors active:scale-95">
                        🎯 {t('postCard.smartLink')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ─── Promoted Post Wrapper (tracks AI engagement) ──────────────────
// Wrapper component that uses IntersectionObserver to track when
// promoted posts become visible and when users click on them
const PromotedPostWrapper: React.FC<{
  post: any;
  feedPosition: number;
  isPromoted: boolean;
  onImpression: (postId: string, feedPosition: number) => void;
  onClick: (postId: string, feedPosition: number) => void;
  children: React.ReactNode;
}> = ({ post, feedPosition, isPromoted, onImpression, onClick, children }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const hasTrackedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isPromoted || !ref.current || hasTrackedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasTrackedRef.current) {
            hasTrackedRef.current = true;
            onImpression(post.id, feedPosition);
          }
        }
      },
      { threshold: 0.3 } // 30% of post visible = impression
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isPromoted, post.id, feedPosition, onImpression]);

  const handleClick = React.useCallback(() => {
    if (isPromoted) {
      onClick(post.id, feedPosition);
    }
  }, [isPromoted, post.id, feedPosition, onClick]);

  return (
    <div ref={ref} onClick={handleClick}>
      {children}
    </div>
  );
};

// ─── Main Layout ──────────────────────────────────────────────────
const MainLayout = () => {
  const navigate = useNavigate();
  const ctx = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const { posts, promotedFeedPosts, categories, notifications, newsItems, stories, loading, selectedCategory, setSelectedCategory, filters, setFilters, setShowCreatePost, darkMode, chatUnreadCount, readNotificationIds, deletePost, refreshData } = ctx;

  // ─── Pull to refresh + swipe navigation ──
  const { pullDistance, isRefreshing, touchHandlers, setScrollRef } = usePullToRefresh({
    onRefresh: async () => {
      await refreshData?.();
    },
    onSwipeLeft: () => {
      // Swipe left → next page (RTL: السوق)
      navigate('/market');
    },
    onSwipeRight: () => {
      // Swipe right → prev page (RTL: القنوات)
      navigate('/channels');
    },
  });

  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'all' | 'ads' | 'promoted' | 'trending' | 'live'>('all');

  // ─── Infinite scroll state ────────────────────────────────────────
  // The feed shows `visibleCount` posts at a time. When the user scrolls
  // to the bottom (detected via IntersectionObserver on a sentinel div),
  // we increment visibleCount to load more. Reset to the initial page
  // size whenever the filters/search/category change so the user starts
  // fresh at the top of the new result set.
  const INITIAL_PAGE_SIZE = 8;
  const PAGE_INCREMENT = 8;
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_PAGE_SIZE);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = React.useRef(false);

  // Reset pagination when any filter changes
  React.useEffect(() => {
    setVisibleCount(INITIAL_PAGE_SIZE);
  }, [selectedCategory, activeTab, searchQuery, filters.type, filters.location, filters.minPrice, filters.maxPrice]);
  // Download banner dismiss state — persisted in localStorage so it doesn't
  // annoy users who already closed it or downloaded the app.
  const [showDownloadBanner, setShowDownloadBanner] = React.useState(() => {
    try { return localStorage.getItem('nawaqes_download_banner_dismissed') !== 'true'; } catch { return true; }
  });
  const dismissDownloadBanner = () => {
    setShowDownloadBanner(false);
    try { localStorage.setItem('nawaqes_download_banner_dismissed', 'true'); } catch {}
  };

  // NOTE: The `nawaqes-create-post` event listener and the create-post
  // modal used to live here in MainLayout, but MainLayout is only mounted
  // on the `/` route — so buttons on other pages (e.g. the "+ أضف طبق"
  // button on /food) dispatched the event but nothing was listening and
  // the modal was never rendered. Both have been moved to
  // <GlobalCreatePostModal/> (rendered inside <GlobalUI/>) so they are
  // active on every route.

  // ─── Time-based greeting ────────────────────────────────────────
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t('home.goodMorning');
    if (hour >= 12 && hour < 18) return t('home.goodAfternoon');
    if (hour >= 18 && hour < 22) return t('home.goodEvening');
    return t('home.hello');
  };

  const getGreetingEmoji = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return '☀️';
    if (hour >= 12 && hour < 18) return '🌆';
    return '🌙';
  };

  const getMotivationalMsg = () => {
    const msgs = [
      t('home.motivational1'),
      t('home.motivational2'),
      t('home.motivational3'),
      t('home.motivational4'),
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  };

  const [motivationalMsg] = React.useState(getMotivationalMsg);

  // ─── Unread notifications count ─────────────────────────────────
  const unreadNotifications = notifications.filter(n => !readNotificationIds.has(n.id)).length;

  // ─── New post check (within 24h) ────────────────────────────────
  const isNewPost = (timestamp: string) => {
    try {
      // Use parseDBTimestamp to correctly handle SQLite UTC timestamps.
      // new Date() on "2026-07-01 18:35:46" (no Z) interprets as LOCAL time,
      // causing a timezone offset. parseDBTimestamp appends 'Z' to treat as UTC.
      const postDate = parseDBTimestamp(timestamp);
      const now = new Date();
      const diffHours = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60);
      return diffHours <= 24;
    } catch {
      return false;
    }
  };

  // ─── Stats data ─────────────────────────────────────────────────
  const walletBalance = currentUser?.walletBalance || 0;
  const myAdsCount = posts.filter(p => p.author.id === currentUser?.id && p.type === 'ad').length;
  const promotedCount = posts.filter(p => p.isPromoted && p.promotionStatus === 'approved').length;
  const newTodayCount = posts.filter(p => isNewPost(p.timestamp)).length;

  // ─── Quick Actions ──────────────────────────────────────────────
  const quickActions = [
    { id: 'charge-wallet', label: t('home.chargeWallet'), icon: <Wallet className="w-5 h-5" />, color: 'from-green-500 to-emerald-600', bg: darkMode ? 'bg-green-900/30' : 'bg-green-50', textColor: darkMode ? 'text-green-400' : 'text-green-600', route: '/wallet' },
    { id: 'market-pulse', label: t('home.marketPulse'), icon: <TrendingUp className="w-5 h-5" />, color: 'from-blue-500 to-cyan-600', bg: darkMode ? 'bg-blue-900/30' : 'bg-blue-50', textColor: darkMode ? 'text-blue-400' : 'text-blue-600', route: '/market-pulse' },
    { id: 'matches', label: t('home.matchesForMe'), icon: <Sparkles className="w-5 h-5" />, color: 'from-purple-500 to-pink-600', bg: darkMode ? 'bg-purple-900/30' : 'bg-purple-50', textColor: darkMode ? 'text-purple-400' : 'text-purple-600', route: '/matches' },
  ];

  // --- Promoted Posts (from dedicated endpoint — shows ALL promoted posts regardless of targeting) ---
  const promotedPosts = React.useMemo(() => {
    // Use dedicated promoted posts feed first, fall back to filtering from main posts
    if (promotedFeedPosts.length > 0) {
      return promotedFeedPosts
        .filter(p => p.isPromoted && p.promotionStatus === 'approved')
        .slice(0, 10);
    }
    // Fallback: filter from main posts (for backwards compatibility)
    return posts
      .filter(p => p.isPromoted && p.promotionStatus === 'approved')
      .slice(0, 10);
  }, [promotedFeedPosts, posts]);

  // Handle category from URL search params
  React.useEffect(() => {
    const checkCategoryParam = () => {
      const catParam = new URLSearchParams(window.location.hash.split('?')[1] || '').get('category');
      if (catParam) {
        setSelectedCategory(catParam);
        window.history.replaceState(null, '', window.location.hash.split('?')[0]);
      }
    };
    checkCategoryParam();
    const handleHashChange = () => checkCategoryParam();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setSelectedCategory]);

  const filteredPosts = posts.filter(post => {
    if (selectedCategory === 'market' && post.type !== 'ad') return false;
    if (selectedCategory === 'matches' && post.type !== 'ad') return false;
    if (selectedCategory === 'wallet' && post.type !== 'ad') return false;
    if (selectedCategory === 'saved' && !post.isBoosted) return false;
    if (selectedCategory && !['market', 'matches', 'wallet', 'saved'].includes(selectedCategory) && post.category !== selectedCategory) return false;
    if (activeTab === 'ads' && post.type !== 'ad') return false;
    if (activeTab === 'promoted' && !(post.isPromoted && post.promotionStatus === 'approved')) return false;
    if (activeTab === 'trending' && !(post.isPromoted && post.promotionStatus === 'approved') && post.comments < 3 && post.likes < 5) return false;
    if (filters.type !== "all" && post.type !== filters.type) return false;
    if (filters.location && post.location !== filters.location) return false;
    if (filters.minPrice && post.price && post.price < parseInt(filters.minPrice)) return false;
    if (filters.maxPrice && post.price && post.price > parseInt(filters.maxPrice)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (post.content?.toLowerCase().includes(q) || post.author?.name?.toLowerCase().includes(q) || post.category?.toLowerCase().includes(q));
    }
    return true;
  });
  // ─── Smart Feed: AI-driven placement for promoted posts ──────────────
  // الذكاء الاصطناعي يحدد أفضل موضع لكل منشور مروج
  const [aiPlacementData, setAiPlacementData] = React.useState<any>(null);
  const [engagementQueue, setEngagementQueue] = React.useState<any[]>([]);
  const engagementTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch AI placement strategy when posts change
  React.useEffect(() => {
    const fetchAiPlacement = async () => {
      try {
        const promotedApproved = filteredPosts.filter(p => p.isPromoted && p.promotionStatus === 'approved');
        if (promotedApproved.length === 0 || activeTab === 'promoted') {
          setAiPlacementData(null);
          return;
        }

        const promotedSummary = promotedApproved.map(p => ({
          promotionTier: p.promotionTier,
          promotion_tier: p.promotionTier,
          targetInterests: p.targetInterests,
          target_interests: p.targetInterests,
          category: p.category,
        }));

        const result = await api.aiSmartPlacement({
          promotedPosts: promotedSummary,
          totalPosts: filteredPosts.length,
          feedType: 'home',
          userInterests: currentUser?.interests || [],
        });

        if (result.success && result.positions.length > 0) {
          setAiPlacementData(result);
        } else {
          setAiPlacementData(null);
        }
      } catch (err) {
        console.error('[AI Placement] Error:', err);
        setAiPlacementData(null);
      }
    };

    // Debounce AI placement calls to avoid excessive requests
    const timer = setTimeout(fetchAiPlacement, 500);
    return () => clearTimeout(timer);
  }, [filteredPosts.length, activeTab, currentUser?.interests]);

  // Flush engagement events periodically
  React.useEffect(() => {
    if (engagementQueue.length === 0) return;

    const flushEngagement = () => {
      if (engagementQueue.length > 0) {
        api.aiTrackEngagement(engagementQueue).catch(() => {});
        setEngagementQueue([]);
      }
    };

    // Flush every 10 seconds or when queue has 10+ events
    if (engagementQueue.length >= 10) {
      flushEngagement();
    } else {
      if (engagementTimerRef.current) clearTimeout(engagementTimerRef.current);
      engagementTimerRef.current = setTimeout(flushEngagement, 10000);
    }

    return () => {
      if (engagementTimerRef.current) clearTimeout(engagementTimerRef.current);
    };
  }, [engagementQueue]);

  // Track promoted post impression when visible
  const trackPromotedImpression = React.useCallback((postId: string, feedPosition: number) => {
    setEngagementQueue(prev => {
      // Don't add duplicate impression for same post in same position
      if (prev.some(e => e.postId === postId && e.feedPosition === feedPosition && e.action === 'impression')) {
        return prev;
      }
      return [...prev, {
        postId,
        feedPosition,
        feedType: 'home' as const,
        action: 'impression' as const,
      }];
    });
  }, []);

  // Track promoted post click
  const trackPromotedClick = React.useCallback((postId: string, feedPosition: number) => {
    setEngagementQueue(prev => [...prev, {
      postId,
      feedPosition,
      feedType: 'home' as const,
      action: 'click' as const,
    }]);
  }, []);

  const sortedPosts = React.useMemo(() => {
    const userInterests = currentUser?.interests || [];

    // Helper: check if a promoted post matches user interests
    const matchesInterest = (post: any): boolean => {
      if (!post.isPromoted || post.promotionStatus !== 'approved') return false;
      const targeting = (post as any).targeting;
      if (targeting === 'all') return true;
      const postInterests = (post as any).targetInterests;
      if (postInterests && Array.isArray(postInterests) && userInterests.length > 0) {
        return postInterests.some((pi: string) =>
          userInterests.some((ui: string) =>
            ui.toLowerCase() === pi.toLowerCase() ||
            ui.toLowerCase().includes(pi.toLowerCase()) ||
            pi.toLowerCase().includes(ui.toLowerCase())
          )
        );
      }
      return targeting === 'city' || !targeting;
    };

    // Separate promoted and regular posts
    const promotedApproved = [...filteredPosts].filter(p => p.isPromoted && p.promotionStatus === 'approved');
    const regularPosts = [...filteredPosts].filter(p => !(p.isPromoted && p.promotionStatus === 'approved'));

    // Sort promoted by: interest match first, then by tier, then by date
    const sortedPromoted = promotedApproved.sort((a, b) => {
      const aMatch = matchesInterest(a) ? 1 : 0;
      const bMatch = matchesInterest(b) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      const tierOrder: Record<string, number> = { vip: 4, premium: 3, standard: 2, basic: 1, city_target: 2, interest_target: 3 };
      const aTier = tierOrder[a.promotionTier || ''] || 0;
      const bTier = tierOrder[b.promotionTier || ''] || 0;
      if (aTier !== bTier) return bTier - aTier;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Sort regular posts by date (newest first)
    const sortedRegular = regularPosts.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // If no promoted posts or only promoted tab, return simple sort
    if (sortedPromoted.length === 0 || activeTab === 'promoted') {
      return [...sortedPromoted, ...sortedRegular];
    }

    // ─── Trending tab: Sort by engagement (comments + likes) ──────────
    if (activeTab === 'trending') {
      const allPosts = [...sortedPromoted, ...sortedRegular];
      return allPosts.sort((a, b) => {
        // Promoted posts first
        const aPromoted = (a.isPromoted && a.promotionStatus === 'approved') ? 1 : 0;
        const bPromoted = (b.isPromoted && b.promotionStatus === 'approved') ? 1 : 0;
        if (aPromoted !== bPromoted) return bPromoted - aPromoted;
        // Then by engagement score (comments weighted more than likes)
        const aScore = (a.comments || 0) * 3 + (a.likes || 0);
        const bScore = (b.comments || 0) * 3 + (b.likes || 0);
        if (aScore !== bScore) return bScore - aScore;
        // Then by recency
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }

    // ─── AI-Driven Placement ──────────────────────────────────────
    if (aiPlacementData && aiPlacementData.positions && aiPlacementData.positions.length > 0) {
      const result: typeof filteredPosts = [];
      const usedPromotedIndices = new Set<number>();

      // Build a map: feedPosition -> postIndex
      const placementMap = new Map<number, number>();
      for (const pos of aiPlacementData.positions) {
        placementMap.set(pos.feedPosition, pos.postIndex);
      }

      let regularIdx = 0;
      let feedPosition = 0;

      while (regularIdx < sortedRegular.length || usedPromotedIndices.size < sortedPromoted.length) {
        // Check if AI says to place a promoted post at this position
        if (placementMap.has(feedPosition)) {
          const promoIdx = placementMap.get(feedPosition)!;
          if (!usedPromotedIndices.has(promoIdx) && promoIdx < sortedPromoted.length) {
            result.push(sortedPromoted[promoIdx]);
            usedPromotedIndices.add(promoIdx);
            feedPosition++;
            continue;
          }
        }

        // Insert regular post
        if (regularIdx < sortedRegular.length) {
          result.push(sortedRegular[regularIdx++]);
          feedPosition++;
        } else if (usedPromotedIndices.size < sortedPromoted.length) {
          // No more regular posts, add remaining promoted
          for (let i = 0; i < sortedPromoted.length; i++) {
            if (!usedPromotedIndices.has(i)) {
              result.push(sortedPromoted[i]);
              usedPromotedIndices.add(i);
            }
          }
          break;
        } else {
          break;
        }
      }

      return result;
    }

    // ─── Fallback: Rule-based distribution ────────────────────────
    const getTierFrequency = (tier?: string): number => {
      switch (tier) {
        case 'vip': return 2;
        case 'premium': return 3;
        case 'standard': return 4;
        case 'basic': return 5;
        default: return 3;
      }
    };

    const result: typeof filteredPosts = [];
    let promoIdx = 0;
    let regularIdx = 0;
    const firstPromoOffset = 1;

    while (regularIdx < firstPromoOffset && regularIdx < sortedRegular.length) {
      result.push(sortedRegular[regularIdx++]);
    }

    let postsSinceLastPromo = 0;
    while (regularIdx < sortedRegular.length || promoIdx < sortedPromoted.length) {
      if (promoIdx < sortedPromoted.length) {
        const currentPromo = sortedPromoted[promoIdx];
        const frequency = getTierFrequency(currentPromo.promotionTier);

        if (postsSinceLastPromo >= frequency || result.length === 0) {
          result.push(currentPromo);
          promoIdx++;
          postsSinceLastPromo = 0;
          continue;
        }
      }

      if (regularIdx < sortedRegular.length) {
        result.push(sortedRegular[regularIdx++]);
        postsSinceLastPromo++;
      } else if (promoIdx < sortedPromoted.length) {
        result.push(sortedPromoted[promoIdx++]);
        postsSinceLastPromo = 0;
      } else {
        break;
      }
    }

    return result;
  }, [filteredPosts, currentUser?.interests, activeTab, aiPlacementData]);

  // ─── Visible slice for infinite scroll ────────────────────────────
  const visiblePosts = React.useMemo(
    () => sortedPosts.slice(0, visibleCount),
    [sortedPosts, visibleCount]
  );
  const hasMore = sortedPosts.length > visibleCount;

  // ─── IntersectionObserver: auto-load more when sentinel is visible ──
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMore && !loadingMoreRef.current && !loading) {
            loadingMoreRef.current = true;
            // Small delay so the UI doesn't thrash on rapid scroll
            setTimeout(() => {
              setVisibleCount((prev) => prev + PAGE_INCREMENT);
              loadingMoreRef.current = false;
            }, 150);
          }
        }
      },
      { rootMargin: '300px 0px', threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  const handleCategorySelect = (id: string | null) => {
    setSelectedCategory(id);
    if (id === 'wallet') { navigate('/wallet'); return; }
    if (id === 'saved') { navigate('/saved'); return; }
    if (id === 'market') { navigate('/market'); return; }
    if (id === 'matches') { navigate('/matches'); return; }
    if (id === 'market-pulse') { navigate('/market-pulse'); return; }
    if (id === 'complaint') { navigate('/complaint'); return; }
    if (id === 'help') { navigate('/help'); return; }
  };

  const promotedScrollRef = React.useRef<HTMLDivElement>(null);

  // ─── Tier badge for promoted posts ───────────────────────────────
  const getTierBadge = (tier?: string) => {
    if (!tier) return null;
    const tierConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
      vip: { icon: <Crown className="w-3 h-3" />, label: 'VIP', color: 'bg-yellow-500 text-white' },
      premium: { icon: <Star className="w-3 h-3" />, label: 'Premium', color: 'bg-purple-500 text-white' },
      standard: { icon: <Zap className="w-3 h-3" />, label: 'Standard', color: 'bg-blue-500 text-white' },
      basic: { icon: <Flame className="w-3 h-3" />, label: 'Basic', color: 'bg-green-500 text-white' },
      city_target: { icon: <Target className="w-3 h-3" />, label: 'City', color: 'bg-teal-500 text-white' },
      interest_target: { icon: <Globe className="w-3 h-3" />, label: 'Interest', color: 'bg-indigo-500 text-white' },
    };
    return tierConfig[tier] || null;
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-[#f8f9fa]'}`} dir={dir}>
      <Navbar user={currentUser} />
      <DepositConfirmationBanner />
      <div className="flex justify-center w-full flex-1 min-h-0 overflow-hidden">
        <div className="flex w-full max-w-[1600px] items-stretch min-h-0">
          <Sidebar user={currentUser} categories={categories} onCategorySelect={handleCategorySelect} selectedCategory={selectedCategory} />
          <main
            id="main-feed-scroll"
            className="flex-1 w-full min-w-0 px-3 sm:px-4 pt-4 sm:pt-6 pb-20 lg:pb-6 mx-auto overflow-y-auto overflow-x-hidden relative"
            ref={(el) => {
              setScrollRef(el);
              // Restore scroll position when returning to the feed
              if (el && (window as any).__feedScrollTop) {
                requestAnimationFrame(() => {
                  el.scrollTop = (window as any).__feedScrollTop;
                  (window as any).__feedScrollTop = 0;
                });
              }
            }}
            {...touchHandlers}
          >
            {/* Pull to Refresh indicator */}
            {(pullDistance > 0 || isRefreshing) && (
              <div
                className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center transition-all z-50 pointer-events-none"
                style={{ height: `${pullDistance}px`, opacity: pullDistance / 70 }}
              >
                <div
                  className={`w-8 h-8 border-3 rounded-full flex items-center justify-center transition-all ${
                    isRefreshing ? 'border-orange-500 border-t-transparent animate-spin' : 'border-gray-400 border-t-transparent'
                  }`}
                  style={{ transform: `rotate(${pullDistance * 3}deg)` }}
                >
                  {!isRefreshing && <RefreshCw className="w-4 h-4 text-gray-400" />}
                </div>
                <span className="text-[10px] font-bold text-gray-400 mt-1">
                  {isRefreshing ? 'جاري التحديث...' : pullDistance >= 70 ? 'حرر للتحديث' : 'اسحب للتحديث'}
                </span>
              </div>
            )}

            {/* ══════════════════ CLEAN HERO (mobile-first) ══════════════════ */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-3"
            >
              <div className={`relative overflow-hidden rounded-2xl ${
                darkMode
                  ? 'bg-gradient-to-l from-gray-800 via-gray-800 to-orange-900/30 border border-gray-700'
                  : 'bg-gradient-to-l from-orange-500 via-amber-500 to-orange-600 border border-orange-400'
              }`}>
                {/* Decorative blur circle */}
                <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />

                <div className="relative z-10 px-4 py-3.5">
                  {/* ── Row 1: Greeting + Notification/Admin ── */}
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <img
                        src={currentUser?.avatarBase64 || currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'default'}`}
                        alt={currentUser?.name || ''}
                        className="w-11 h-11 rounded-2xl border-2 border-white/40 object-cover"
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-black text-white leading-tight truncate">
                        {getGreetingEmoji()} {getGreeting()}، {currentUser?.name?.split(' ')[0] || t('common.user')}
                      </h2>
                      <p className="text-white/70 text-xs font-medium truncate mt-0.5">{motivationalMsg}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {unreadNotifications > 0 && (
                        <button
                          onClick={() => navigate('/notifications')}
                          aria-label={t('nav.notifications', { defaultValue: 'الإشعارات' })}
                          className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors active:scale-90"
                        >
                          <Bell className="w-4 h-4" />
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-white">
                            {unreadNotifications > 99 ? '99+' : unreadNotifications}
                          </span>
                        </button>
                      )}
                      {currentUser?.isAdmin && (
                        <Link
                          to="/admin"
                          aria-label="Admin"
                          className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors active:scale-90"
                        >
                          <ShieldCheckIcon className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* ── Row 2: Quick stats (3 pills, equal width) ── */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: t('home.walletBalance'), value: walletBalance.toLocaleString(), icon: <Wallet className="w-3.5 h-3.5" />, route: '/wallet' },
                      { label: t('home.myAds'), value: myAdsCount, icon: <Megaphone className="w-3.5 h-3.5" />, route: '/my-page' },
                      { label: t('home.messages'), value: chatUnreadCount, icon: <MessageCircle className="w-3.5 h-3.5" />, route: '/messages' },
                    ].map((stat) => (
                      <button
                        key={stat.label}
                        onClick={() => navigate(stat.route)}
                        className="flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white active:scale-95"
                      >
                        <div className="flex items-center gap-1">
                          {stat.icon}
                          <span className="text-sm font-black">{stat.value}</span>
                        </div>
                        <span className="text-[9px] font-medium text-white/70 truncate w-full text-center">{stat.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* ── Row 3: Live activity (single line, scrollable on mobile) ── */}
                  <div className="flex items-center gap-2 mt-2.5 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="relative">
                        <Activity className="w-3 h-3 text-green-300" />
                        <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      </div>
                      <span className="text-white/60 text-[10px] font-bold">{t('home.liveActivity')}</span>
                    </div>
                    <span className="text-white/40 text-[10px]">·</span>
                    <span className="text-white/80 text-[10px] font-bold shrink-0">
                      <span className="text-green-300">{newTodayCount}</span> {t('home.newToday')}
                    </span>
                    <span className="text-white/40 text-[10px]">·</span>
                    <span className="text-white/80 text-[10px] font-bold shrink-0">
                      <span className="text-amber-300">{promotedCount}</span> {t('home.promotedAds')}
                    </span>
                    <span className="text-white/40 text-[10px]">·</span>
                    <span className="text-white/80 text-[10px] font-bold shrink-0">
                      <span className="text-blue-300">{posts.length}</span> {t('home.activeAds')}
                    </span>
                    {walletBalance === 0 && myAdsCount > 0 && (
                      <button
                        onClick={() => navigate('/wallet')}
                        className="ms-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold transition-colors active:scale-95"
                      >
                        <Wallet className="w-3 h-3" />
                        {t('home.chargeNow')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 🔧 REMOVED: CategoryNav bar — per user request, the home feed
                should be like Facebook (clean vertical feed without a
                horizontal category icon bar). Categories are still
                accessible via the Sidebar. */}
            {!loading && stories.length > 0 && (
              <div className={`mb-3 rounded-2xl p-2 ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'} shadow-sm`}>
                <Stories stories={stories} currentUser={currentUser} />
              </div>
            )}

            {/* ─── News Ticker (horizontal scrolling news bar) ─── */}
            {newsItems.length > 0 && (
              <div className="mb-3 -mx-1">
                <NewsTicker news={newsItems} />
              </div>
            )}

            {/* ─── Activity Summary bar (small stats) ─── */}
            <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold ${darkMode ? 'bg-gray-800/60 text-gray-300 border border-gray-700/50' : 'bg-white/80 text-gray-600 border border-gray-100 shadow-sm'}`}>
              <Activity className="w-3.5 h-3.5 text-orange-500" />
              <span className="inline-flex items-center gap-1">
                <span className="text-green-500">{newTodayCount}</span>
                <span className="font-medium">{t('home.newToday')}</span>
              </span>
              <span className={darkMode ? 'text-gray-600' : 'text-gray-300'}>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-amber-500">{promotedCount}</span>
                <span className="font-medium">{t('home.promotedAds')}</span>
              </span>
              <span className={darkMode ? 'text-gray-600' : 'text-gray-300'}>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-blue-500">{posts.length}</span>
                <span className="font-medium">{t('home.activeAds')}</span>
              </span>
            </div>

            {/* ─── Download App Banner (compact, dismissible) ─── */}
            {showDownloadBanner && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-3 rounded-xl overflow-hidden border ${
                  darkMode
                    ? 'bg-gray-800 border-orange-800/40'
                    : 'bg-orange-50/80 border-orange-200'
                }`}
              >
                <div className="flex items-center gap-2.5 p-2.5">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    darkMode ? 'bg-orange-600/30' : 'bg-orange-100'
                  }`}>
                    <Smartphone className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  </div>
                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-gray-900'} truncate`}>
                      {t('app.downloadApp', 'حمّل تطبيق نواقص')}
                    </p>
                    <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'} truncate`}>
                      {t('app.downloadAppDesc', 'تجربة أسرع + إشعارات')}
                    </p>
                  </div>
                  {/* Download button */}
                  <a
                    href="/install"
                    onClick={() => dismissDownloadBanner()}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors active:scale-90 flex-shrink-0"
                    aria-label={t('app.download', 'تحميل')}
                  >
                    <Smartphone className="w-4 h-4" />
                  </a>
                  {/* Dismiss button */}
                  <button
                    onClick={dismissDownloadBanner}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors ${
                      darkMode ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                    }`}
                    aria-label={t('common.close', { defaultValue: 'إغلاق' })}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            <FilterBar filters={filters} setFilters={setFilters} onClear={() => { setFilters({ minPrice: "", maxPrice: "", location: "", type: "all" }); toast.success(t('app.filtersCleared')); }} />
            <CreatePost user={currentUser} onPostCreated={() => { toast.success(t('app.postPublished')); setShowCreatePost(false); }} />

            {/* 🔧 REMOVED: Promoted Posts Carousel — per user request, the home
                feed should be like Facebook (show all user posts in one feed)
                without a separate promoted posts bar. Promoted posts are still
                mixed into the main feed via the Smart Feed algorithm below,
                so they still appear — just not in a separate horizontal bar. */}

            {/* 🔧 REMOVED: Feed Tabs (الكل / إعلانات / مروجة / سوق لايف) per user
                request — "بدون تبويبات". The home feed now shows ONE unified
                list of all post types (ads, status, food, news) mixed together.
                Promoted posts are still placed naturally via the Smart Feed AI
                algorithm. The activeTab state is kept internally as 'all' so
                the existing sortedPosts logic still works. */}

            {/* ═══════════════════ MAIN FEED ═══════════════════ */}
            <AnimatePresence mode="popLayout">
              {loading ? (
                /* ─── Loading skeletons: 3 realistic card placeholders ─── */
                <div className="space-y-5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`rounded-2xl overflow-hidden border animate-pulse ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                      {/* Skeleton header */}
                      <div className="p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        <div className="flex-1 space-y-2">
                          <div className={`h-3 w-1/3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                          <div className={`h-2 w-1/4 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        </div>
                      </div>
                      {/* Skeleton content */}
                      <div className="px-4 pb-3 space-y-2">
                        <div className={`h-3 w-full rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        <div className={`h-3 w-5/6 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        <div className={`h-3 w-2/3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                      </div>
                      {/* Skeleton image */}
                      <div className={`h-64 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                      {/* Skeleton action bar */}
                      <div className="p-3 flex items-center justify-between border-t border-gray-100">
                        <div className={`h-6 w-16 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        <div className={`h-6 w-16 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        <div className={`h-6 w-16 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <motion.div layout className="space-y-5">
                  {visiblePosts.length > 0 ? visiblePosts.map((post, feedPosition) => (
                    <div key={post.id} className="relative">
                      {/* Promoted badge for promoted posts in feed */}
                      {post.isPromoted && post.promotionStatus === 'approved' && (
                        <div className={`absolute -top-2 ${dir === 'rtl' ? 'right-4' : 'left-4'} z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black shadow-md ${
                          post.promotionTier === 'vip' ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white' :
                          post.promotionTier === 'premium' ? 'bg-gradient-to-r from-purple-500 to-violet-500 text-white' :
                          'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                        }`}>
                          {getTierBadge(post.promotionTier)?.icon || <Sparkles className="w-2.5 h-2.5" />}
                          {post.promotionTier === 'vip' ? 'VIP' : post.promotionTier === 'premium' ? 'PREMIUM' : t('home.promoted')}
                          {aiPlacementData && <span className="ml-1 opacity-70" title={t('home.aiPositioned')}><Sparkles className="w-2 h-2" /></span>}
                        </div>
                      )}
                      {isNewPost(post.timestamp) && !post.isPromoted && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`absolute -top-2 ${dir === 'rtl' ? 'right-4' : 'left-4'} z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500 text-white text-[9px] font-black shadow-md`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {t('home.new')}
                        </motion.div>
                      )}
                      {/* Trending badge for high-engagement posts in trending tab */}
                      {activeTab === 'trending' && !post.isPromoted && (post.comments >= 3 || post.likes >= 5) && (
                        <div className={`absolute -top-2 ${dir === 'rtl' ? 'left-4' : 'right-4'} z-10 flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black shadow-md bg-gradient-to-r from-red-500 to-orange-500 text-white`}>
                          <Flame className="w-2.5 h-2.5" />
                          {t('home.trending')}
                        </div>
                      )}
                      <PromotedPostWrapper
                        post={post}
                        feedPosition={feedPosition}
                        isPromoted={!!(post.isPromoted && post.promotionStatus === 'approved')}
                        onImpression={trackPromotedImpression}
                        onClick={trackPromotedClick}
                      >
                        <PostCard post={post} onHidePost={deletePost} />
                      </PromotedPostWrapper>
                    </div>
                  )) : (
                    <div className={`p-12 rounded-3xl border text-center space-y-5 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                      {/* Empty state with illustration */}
                      <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center text-5xl ${darkMode ? 'bg-gradient-to-br from-gray-700 to-gray-800' : 'bg-gradient-to-br from-orange-50 to-amber-50'}`}>
                        📭
                      </div>
                      <div className="space-y-1.5">
                        <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('app.noResults')}</p>
                        <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('home.emptyStateHint', 'جرّب تعديل الفلاتر أو انشر إعلانك الأول الآن!')}</p>
                      </div>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button onClick={() => { setFilters({ minPrice: "", maxPrice: "", location: "", type: "all" }); setSelectedCategory(null); setActiveTab('all'); setSearchQuery(''); }} className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition-colors active:scale-95">{t('app.resetFilters')}</button>
                        <button onClick={() => setShowCreatePost(true)} className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-colors active:scale-95 ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>{t('createPost.publish')}</button>
                      </div>
                    </div>
                  )}
                  {/* Infinite scroll sentinel + Load More button */}
                  {hasMore && (
                    <div ref={sentinelRef} className="py-6 flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('home.loadingMore', 'جاري تحميل المزيد...')}</span>
                      </div>
                      <button
                        onClick={() => setVisibleCount((prev) => prev + PAGE_INCREMENT)}
                        className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-colors active:scale-95"
                      >
                        {t('home.loadMore', 'تحميل المزيد')}
                      </button>
                    </div>
                  )}
                  {!hasMore && visiblePosts.length > 0 && (
                    <div className={`py-12 text-center text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                        <Sparkles className={`w-5 h-5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                      <p className="mb-1 font-bold">{t('app.upToDate')}</p>
                      <p>{t('app.copyright')}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
          <RightSidebar user={currentUser} notifications={notifications} />
        </div>
      </div>
      {/* The create-post modal is now rendered globally by
          <GlobalCreatePostModal/> inside <GlobalUI/> so it can be
          opened from any route (not just the home page). */}

    </div>
  );
};

// Simple shield icon for admin button
const ShieldCheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);

// ─── Post Detail Wrapper ────────────────────────────────────────────
const PostDetailWrapper: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <PostDetailPage key={id} />;
};

const PageLayout = ({ children }: { children: React.ReactNode }) => {
  const { notifications, categories, selectedCategory, setSelectedCategory, darkMode, newsItems } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const navigate = useNavigate();
  const handleCategorySelect = (id: string | null) => {
    setSelectedCategory(id);
    if (id === 'wallet') navigate('/wallet');
    else if (id === 'saved') navigate('/saved');
    else if (id === 'market') navigate('/market');
    else if (id === 'matches') navigate('/matches');
    else if (id === 'market-pulse') navigate('/market-pulse');
    else if (id === 'complaint') navigate('/complaint');
    else if (id === 'help') navigate('/help');
    else if (!id) navigate('/');
  };
  return (
    <div className={`h-screen flex flex-col overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-[#f8f9fa]'}`} dir={dir}>
      <Navbar user={currentUser} />
      <DepositConfirmationBanner />
      <div className="flex justify-center w-full flex-1 min-h-0 overflow-hidden">
        <div className="flex w-full max-w-[1600px] items-stretch min-h-0">
          <Sidebar user={currentUser} categories={categories} onCategorySelect={handleCategorySelect} selectedCategory={selectedCategory} />
          <main
            id="page-layout-scroll"
            className="flex-1 w-full min-w-0 px-3 sm:px-4 pt-4 sm:pt-6 pb-20 lg:pb-6 mx-auto overflow-y-auto overflow-x-hidden"
            ref={(el) => {
              if (el && (window as any).__pageScrollTop) {
                requestAnimationFrame(() => {
                  el.scrollTop = (window as any).__pageScrollTop;
                  (window as any).__pageScrollTop = 0;
                });
              }
            }}
          >{children}</main>
          <RightSidebar user={currentUser} notifications={notifications} />
        </div>
      </div>
    </div>
  );
};

// ─── App Root ──────────────────────────────────────────────────────
export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

// ─── Global UI components (hidden on /chat-app) ─────────────────────
function GlobalUI() {
  const location = useLocation();
  const isChatApp = location.pathname.includes('/chat-app');
  // GlobalCreatePostModal is rendered unconditionally so the
  // `nawaqes-create-post` event listener is always active and the
  // modal can be opened from any page (e.g. /food "+ أضف طبق" button).
  return (
    <>
      <GlobalCreatePostModal />
      {/* Background upload progress badge — persists across navigation */}
      <BackgroundUploadBadge />
      {isChatApp ? null : (
        <>
          <NotificationToast />
          <FloatingChatButton />
          <AIFloatingButton />
          <MobileBottomNav />
          <ShareModal />
          <MobileSidebarDrawer user={null} categories={[]} />
        </>
      )}
    </>
  );
}

function AppInner() {
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const [showSplash, setShowSplash] = React.useState(true);

  // Firebase Push Notifications — RE-ENABLED for background notifications.
  React.useEffect(() => {
    setupFirebase();
  }, []);

  // Show splash only once per session (not on every route change)
  useEffect(() => {
    const seen = sessionStorage.getItem('nawaqes_splash_seen');
    if (seen) setShowSplash(false);
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem('nawaqes_splash_seen', 'true');
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // 🔧 NOTE: The standalone "Nawaqes Chat" APK was removed in v1.3.0 —
  // there is now a single unified Nawaqes app that opens the home page.
  // The previous ?app=chat redirect logic for the chat APK has been removed.
  return (
    <AuthProvider>
      <AppProvider>
        <SidebarDrawerProvider>
        <HashRouter>
          <RouterInner>
          <Toaster position="bottom-left" dir={dir} expand={true} richColors />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><PageLayout><ProfilePage /></PageLayout></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><PageLayout><SettingsPage /></PageLayout></RequireAuth>} />
            <Route path="/messages" element={<RequireAuth><ChatLayout /></RequireAuth>} />
            {/* Standalone Chat App (Messenger-like, no PageLayout chrome) */}
            <Route path="/chat-app" element={<RequireAuth><ChatLayout /></RequireAuth>} />
            <Route path="/market" element={<RequireAuth><PageLayout><MarketPage /></PageLayout></RequireAuth>} />
            <Route path="/market/listing/:id" element={<RequireAuth><PageLayout><MarketListingPage /></PageLayout></RequireAuth>} />
            <Route path="/market/new" element={<RequireAuth><PageLayout><CreateMarketListing /></PageLayout></RequireAuth>} />
            <Route path="/market/edit/:id" element={<RequireAuth><PageLayout><CreateMarketListing editMode /></PageLayout></RequireAuth>} />
            <Route path="/market/my-listings" element={<RequireAuth><PageLayout><MyMarketListings /></PageLayout></RequireAuth>} />
            <Route path="/market/saved" element={<RequireAuth><PageLayout><MyMarketListings initialTab="expired" /></PageLayout></RequireAuth>} />
            <Route path="/wallet" element={<RequireAuth><PageLayout><WalletPage /></PageLayout></RequireAuth>} />
            <Route path="/saved" element={<RequireAuth><PageLayout><SavedPage /></PageLayout></RequireAuth>} />
            <Route path="/channels" element={<RequireAuth><PageLayout><ChannelsPage /></PageLayout></RequireAuth>} />
            <Route path="/channels/:id" element={<RequireAuth><PageLayout><ChannelView /></PageLayout></RequireAuth>} />
            <Route path="/post/:id" element={<RequireAuth><PageLayout><PostDetailWrapper /></PageLayout></RequireAuth>} />
            <Route path="/promotions" element={<RequireAuth><PageLayout><PromotionAnalytics /></PageLayout></RequireAuth>} />
            <Route path="/ai-assistant" element={<RequireAuth><PageLayout><AIPromotionPage /></PageLayout></RequireAuth>} />
            <Route path="/promotion-packages" element={<RequireAuth><PageLayout><PromotionPackagesPage /></PageLayout></RequireAuth>} />
            <Route path="/smart-reach" element={<RequireAuth><PageLayout><SmartReachPage /></PageLayout></RequireAuth>} />
            <Route path="/my-page" element={<RequireAuth><PageLayout><MyPage /></PageLayout></RequireAuth>} />
            <Route path="/friends" element={<RequireAuth><PageLayout><FriendsPage /></PageLayout></RequireAuth>} />
            <Route path="/matches" element={<RequireAuth><MatchesPage /></RequireAuth>} />
            <Route path="/complaint" element={<RequireAuth><PageLayout><ComplaintPage /></PageLayout></RequireAuth>} />
            <Route path="/help" element={<RequireAuth><PageLayout><HelpPage /></PageLayout></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><PageLayout><NotificationsPage /></PageLayout></RequireAuth>} />
            <Route path="/market-pulse" element={<RequireAuth><PageLayout><MarketPulsePage /></PageLayout></RequireAuth>} />
            {/* 🔧 FIX: market-live uses FullScreenLayout (no padding, no sidebar)
                so the video fills the entire screen like TikTok. PageLayout's
                px/pt/pb padding was creating a gap around the video. */}
            <Route path="/market-live" element={<RequireAuth><MarketLivePage /></RequireAuth>} />
            <Route path="/food" element={<RequireAuth><PageLayout><FoodPage /></PageLayout></RequireAuth>} />
            {/* 🔧 DEPRECATED: /live-stream now redirects to /channels.
                Standalone live streaming is removed — use Channels instead. */}
            <Route path="/live-stream/:hostId?" element={<RequireAuth><Navigate to="/channels" replace /></RequireAuth>} />
            <Route path="/verify-email" element={<RequireAuth><EmailVerification /></RequireAuth>} />
            <Route path="/scheduled-streams" element={<RequireAuth><PageLayout><ScheduledStreams /></PageLayout></RequireAuth>} />
            <Route path="/user/:userId" element={<RequireAuth><PageLayout><UserProfilePage /></PageLayout></RequireAuth>} />
            <Route path="/user/:userId/videos" element={<RequireAuth><PageLayout><UserVideosPage /></PageLayout></RequireAuth>} />
            <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
            <Route path="*" element={<div className="min-h-screen flex items-center justify-center bg-gray-50" dir={dir}><div className="text-center space-y-6"><div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto"><span className="text-4xl">🔍</span></div><h1 className="text-3xl font-black text-gray-900">{t('app.pageNotFound')}</h1><Link to="/" className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700"><ArrowLeft className="w-5 h-5" />{t('app.backToHome')}</Link></div></div>} />
          </Routes>
          <GlobalUI />
          </RouterInner>
        </HashRouter>
        </SidebarDrawerProvider>
      </AppProvider>
    </AuthProvider>
  );
}
