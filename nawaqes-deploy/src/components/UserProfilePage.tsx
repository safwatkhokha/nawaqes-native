import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Phone,
  ShoppingBag,
  FileText,
  User as UserIcon,
  Calendar,
  Award,
  MessageCircle,
  UserPlus,
  RefreshCw,
  Radio,
  Image as ImageIcon,
  Video as VideoIcon,
  Play,
  Eye,
  Heart,
  MoreVertical,
  Ban,
  Flag,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { ImageLightbox } from './ImageLightbox';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr } from '../utils/time';
import { useSafeBack } from '../hooks/useSafeBack';

type ProfileTab = 'posts' | 'ads' | 'portfolio' | 'about' | 'videos';

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { userId } = useParams<{ userId: string }>();
  const { darkMode, posts, sendMessage } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [targetUser, setTargetUser] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUserLive, setIsUserLive] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  // 🔧 NEW: videos state for the "videos" tab + count in stats
  const [userVideos, setUserVideos] = useState<any[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  // 🔧 NEW: preview video player for "آخر فيديو" section on the profile
  const [previewVideo, setPreviewVideo] = useState<any>(null);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ─── More menu (block/report) ───
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<string>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  const handleBlockUser = async () => {
    if (!targetUser) return;
    try {
      await api.blockUser(targetUser.id);
      setIsBlocked(true);
      toast.success('تم حظر المستخدم');
      setShowMoreMenu(false);
    } catch (err: any) {
      toast.error(err?.message || 'فشل حظر المستخدم');
    }
  };

  const handleUnblockUser = async () => {
    if (!targetUser) return;
    try {
      await api.unblockUser(targetUser.id);
      setIsBlocked(false);
      toast.success('تم إلغاء الحظر');
      setShowMoreMenu(false);
    } catch (err: any) {
      toast.error(err?.message || 'فشل إلغاء الحظر');
    }
  };

  const handleReportSubmit = async () => {
    if (!targetUser) return;
    setSubmittingReport(true);
    try {
      await api.reportUser(targetUser.id, reportReason, reportDetails || undefined);
      toast.success('تم إرسال البلاغ، شكراً لك');
      setShowReportModal(false);
      setReportDetails('');
      setShowMoreMenu(false);
    } catch (err: any) {
      toast.error(err?.message || 'فشل إرسال البلاغ');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Fetch user profile from API
  useEffect(() => {
    if (!userId) {
      setTargetUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    
    api.getUserProfile(userId)
      .then((data: any) => {
        if (data && data.id) {
          setTargetUser(data);
          // Map posts from API
          if (data.posts && Array.isArray(data.posts)) {
            const mapped = data.posts.map((p: any) => ({
              id: p.id,
              content: p.content || '',
              image: p.image || undefined,
              likes: p.likes || 0,
              comments: p.comments || 0,
              shares: p.shares || 0,
              timestamp: p.created_at || '',
              type: p.type || 'ad',
              price: p.price || undefined,
              currency: p.currency || 'EGP',
              location: p.location || undefined,
              category: p.category || undefined,
              status: p.status,
            }));
            setUserPosts(mapped);
          }
          // Check friendship status using the dedicated endpoint
          if (currentUser && currentUser.id !== userId) {
            api.getFriendshipStatus(userId).then(data => {
              setFriendshipStatus(data?.friendshipStatus || null);
            }).catch(() => {
              setFriendshipStatus(null);
            });
            // Check follow status
            api.getFollowStatus(userId).then(data => {
              setIsFollowing(data.following);
              setFollowersCount(data.followersCount);
              setFollowingCount(data.followingCount);
            }).catch(() => {});
            // Check block status
            api.getBlockedUsers().then(blocked => {
              if (Array.isArray(blocked)) {
                setIsBlocked(blocked.some((u: any) => u.id === userId));
              }
            }).catch(() => {});
          }
          // Load portfolio
          api.getPortfolio(userId).then(imgs => {
            setPortfolioImages(Array.isArray(imgs) ? imgs : []);
          }).catch(() => {});
          // 🔧 NEW: Load user's videos for the "videos" tab + count
          api.getUserVideos(userId).then(data => {
            setUserVideos((data as any)?.videos || []);
          }).catch(() => setUserVideos([]));
        } else {
          setTargetUser(null);
          setError(t('userProfile.userNotFound'));
        }
      })
      .catch((err) => {
        console.error('Error fetching user profile:', err);
        setTargetUser(null);
        setError(t('userProfile.profileLoadFailed'));
      })
      .finally(() => setLoading(false));
  }, [userId, currentUser]);

  // Check if this user is currently live streaming
  useEffect(() => {
    if (!userId) return;
    const checkLiveStatus = async () => {
      try {
        const activeStreams = await api.getActiveLivestreams();
        if (Array.isArray(activeStreams)) {
          setIsUserLive(activeStreams.some((s: any) => s.hostId === userId));
        }
      } catch {}
    };
    checkLiveStatus();
    // Poll every 15 seconds
    const interval = setInterval(checkLiveStatus, 15000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleSendFriendRequest = async () => {
    if (!userId) return;
    setSendingFriendRequest(true);
    try {
      await api.sendFriendRequest(userId);
      setFriendshipStatus('pending');
      toast.success(t('userProfile.friendRequestSent'));
      // Redirect to friend requests page so user can see sent requests
      navigate('/friends?tab=sent');
    } catch (err: any) {
      toast.error(err.message || t('userProfile.friendRequestFailed'));
    } finally {
      setSendingFriendRequest(false);
    }
  };

  const handleMessage = async () => {
    if (!targetUser) return;
    try {
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || t('userProfile.conversationFailed'));
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20" dir={dir}>
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-4" />
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.loadingProfile')}</p>
      </div>
    );
  }

  if (!targetUser) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20" dir={dir}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <UserIcon className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        </div>
        <h2 className={`text-xl font-black mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {error || t('userProfile.userNotFound')}
        </h2>
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          {userId ? t('userProfile.userNotFoundDesc') : t('userProfile.noUserSelected')}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/')} className="bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-orange-700">{t('userProfile.backToHome')}</button>
          {userId && (
            <button onClick={() => window.location.reload()} className={`px-6 py-2.5 rounded-xl font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t('userProfile.retry')}</button>
          )}
        </div>
      </div>
    );
  }

  const userAds = userPosts.filter((p: any) => p.type === 'ad');

  const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'posts', label: t('userProfile.tabPosts'), icon: <FileText className="w-4 h-4" /> },
    { id: 'videos', label: 'فيديوهات', icon: <VideoIcon className="w-4 h-4" /> },
    { id: 'ads', label: t('userProfile.tabAds'), icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'portfolio', label: t('userProfile.tabPortfolio', 'معرض الأعمال'), icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'about', label: t('userProfile.tabAbout'), icon: <UserIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-2xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('userProfile.title')}</h1>
      </div>

      {/* Cover Image */}
      <div className="relative mb-20">
        <div className="h-40 bg-gradient-to-l from-orange-500 via-orange-600 to-red-500 relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ij48cGF0aCBkPSJNMzYgMzRjMC0yIDItNCA0LTRzNCAyIDQgNC0yIDQtNCA0LTQtMi00LTR6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-30" />
        </div>

        {/* Avatar */}
        <div className="absolute -bottom-14 right-6">
          <div className="relative">
            <div className={`w-28 h-28 rounded-2xl border-4 ${darkMode ? 'border-gray-800' : 'border-white'} shadow-xl overflow-hidden`}>
              <img src={targetUser.avatarBase64 || targetUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.id}`} alt={targetUser.name} className="w-full h-full object-cover" />
            </div>
            {targetUser.is_verified && (
              <div className="absolute -bottom-1 -left-1 w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center border-2 border-white shadow-lg z-10">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {currentUser && currentUser.id !== targetUser.id && (
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            {/* 🔧 REMOVED: "Watch Live" button — standalone /live-stream is deprecated.
                Live streaming is now inside Channels. */}
            <button
              onClick={handleMessage}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'
              } backdrop-blur-md shadow-lg`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t('userProfile.message')}
            </button>
            {friendshipStatus === 'accepted' ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-green-50 text-green-600 backdrop-blur-md shadow-lg">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('userProfile.friend')}
              </span>
            ) : friendshipStatus === 'pending' ? (
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-yellow-50 text-yellow-600 backdrop-blur-md shadow-lg">
                {t('userProfile.pending')}
              </span>
            ) : (
              <button
                onClick={handleSendFriendRequest}
                disabled={sendingFriendRequest}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-95 backdrop-blur-md shadow-lg disabled:opacity-50"
              >
                {sendingFriendRequest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                {t('userProfile.addFriend')}
              </button>
            )}
            {/* Follow button */}
            <button
              onClick={async () => {
                try {
                  if (isFollowing) {
                    await api.unfollowUser(userId!);
                    setIsFollowing(false);
                    setFollowersCount(c => Math.max(0, c - 1));
                  } else {
                    await api.followUser(userId!);
                    setIsFollowing(true);
                    setFollowersCount(c => c + 1);
                  }
                } catch {}
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 backdrop-blur-md shadow-lg ${
                isFollowing
                  ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isFollowing ? t('userProfile.following', 'تتابع') : t('userProfile.follow', 'متابعة')}
            </button>
            {/* More menu (block/report) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(s => !s)}
                className={`flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold transition-all active:scale-95 backdrop-blur-md shadow-lg ${darkMode ? 'bg-gray-800/80 text-gray-200 hover:bg-gray-700' : 'bg-white/90 text-gray-700 hover:bg-white'}`}
                aria-label="المزيد"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className={`absolute top-full left-0 mt-2 w-44 rounded-xl border shadow-2xl z-30 overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                  >
                    <button
                      onClick={() => { setShowReportModal(true); setShowMoreMenu(false); }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <Flag className="w-3.5 h-3.5 text-amber-500" />
                      إبلاغ عن المستخدم
                    </button>
                    {isBlocked ? (
                      <button
                        onClick={handleUnblockUser}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors ${darkMode ? 'text-green-400 hover:bg-gray-700' : 'text-green-600 hover:bg-gray-50'}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        إلغاء الحظر
                      </button>
                    ) : (
                      <button
                        onClick={handleBlockUser}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-colors ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        حظر المستخدم
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* User Info */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h2 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{targetUser.name}</h2>
          {targetUser.is_verified && <CheckCircle2 className="w-5 h-5 text-orange-600 fill-orange-600/10" />}
          {/* 🔧 REMOVED: "مباشر" live badge — standalone /live-stream is deprecated. */}
        </div>
        {/* Profession */}
        {targetUser.profession && (
          <p className={`text-sm font-bold mb-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
            {targetUser.profession}
          </p>
        )}
        <div className="flex items-center gap-3 mb-3">
          {targetUser.trust_score && (
            <div className="bg-green-50 text-green-700 text-[11px] px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {targetUser.trust_score}% {t('userProfile.trustScore')}
            </div>
          )}
          {targetUser.gender && (
            <div className={`text-[11px] px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 ${targetUser.gender === 'female' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
              {targetUser.gender === 'female' ? t('userProfile.female') : t('userProfile.male')}
            </div>
          )}
          {targetUser.is_admin && (
            <div className="bg-orange-50 text-orange-700 text-[11px] px-2.5 py-1 rounded-lg font-bold">{t('userProfile.admin')}</div>
          )}
          {targetUser.is_trusted && (
            <div className="bg-blue-50 text-blue-700 text-[11px] px-2.5 py-1 rounded-lg font-bold">{t('userProfile.trusted')}</div>
          )}
        </div>
        {targetUser.bio && (
          <p className={`text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{targetUser.bio}</p>
        )}
        <div className="flex items-center gap-4 flex-wrap">
          {targetUser.location && (
            <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <MapPin className="w-3.5 h-3.5 text-orange-500" />
              {targetUser.location}
            </div>
          )}
          {targetUser.phone && (
            <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Phone className="w-3.5 h-3.5 text-green-500" />
              {targetUser.phone}
            </div>
          )}
        </div>
        {targetUser.interests && Array.isArray(targetUser.interests) && targetUser.interests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {targetUser.interests.map((int: string) => (
              <span key={int} className={`text-[10px] px-2.5 py-1 rounded-lg font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                {t(`interests.${int}`, int)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 🔧 NEW: "آخر فيديو" section — preview the user's latest video inline.
          Shows a playable video card with thumbnail, title, views, and a
          "play" button that opens a full-screen modal player. This gives
          visitors a quick preview of the user's content without leaving
          the profile. */}
      {userVideos.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-black flex items-center gap-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <VideoIcon className="w-3.5 h-3.5 text-orange-500" />
              آخر فيديو
            </h3>
            <button
              onClick={() => navigate(`/user/${userId}/videos`)}
              className="text-[10px] font-bold text-orange-500 hover:text-orange-600"
            >
              عرض الكل ←
            </button>
          </div>
          <div
            className={`relative rounded-2xl overflow-hidden cursor-pointer group ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
            onClick={() => setPreviewVideo(userVideos[0])}
          >
            <div className="aspect-video relative">
              {userVideos[0].thumbnailUrl ? (
                <img src={userVideos[0].thumbnailUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <VideoIcon className={`w-10 h-10 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                </div>
              )}
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 text-gray-900 fill-gray-900 ml-0.5" />
                </div>
              </div>
              {/* Stats overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-3 text-white text-[10px] font-bold">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {userVideos[0].views >= 1000 ? (userVideos[0].views / 1000).toFixed(1) + 'K' : userVideos[0].views || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3" />
                  {userVideos[0].likes >= 1000 ? (userVideos[0].likes / 1000).toFixed(1) + 'K' : userVideos[0].likes || 0}
                </span>
                {userVideos[0].duration > 0 && (
                  <span className="mr-auto px-1.5 py-0.5 rounded bg-black/50">
                    {Math.floor(userVideos[0].duration / 60)}:{Math.floor(userVideos[0].duration % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
            </div>
            {userVideos[0].title && (
              <div className={`p-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                <p className="text-xs font-bold truncate">{userVideos[0].title}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {/* 🔧 NEW: 5-column stats grid with videos count + following count */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 mb-6">
        {[
          { label: 'فيديوهات', value: userVideos.length, icon: <VideoIcon className="w-3.5 h-3.5" />, onClick: () => setActiveTab('videos') },
          { label: t('userProfile.tabPosts'), value: userPosts.length, icon: <FileText className="w-3.5 h-3.5" />, onClick: () => setActiveTab('posts') },
          { label: t('userProfile.followers', 'متابعون'), value: followersCount, icon: <UserPlus className="w-3.5 h-3.5" />, onClick: undefined },
          { label: 'يتابع', value: followingCount, icon: <UserIcon className="w-3.5 h-3.5" />, onClick: undefined },
          { label: t('userProfile.trustScore'), value: `${targetUser.trust_score || 0}%`, icon: <Award className="w-3.5 h-3.5" />, onClick: undefined },
        ].map(stat => (
          <div key={stat.label} className={`rounded-2xl border p-3 text-center ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center mx-auto mb-1.5 ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
              {stat.icon}
            </div>
            <p className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{stat.value}</p>
            <p className={`text-[9px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl mb-6 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id ? darkMode ? 'bg-gray-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm' : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'posts' && (
          <motion.div key="posts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {userPosts.length > 0 ? (
              <div className="space-y-3">
                {userPosts.map((post: any) => (
                  <div key={post.id} onClick={() => navigate(`/post/${post.id}`)}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                    <p className={`text-sm leading-relaxed mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{post.content}</p>
                    <div className={`flex items-center gap-3 text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <span>{formatRelativeTimeAr(post.timestamp)}</span><span>·</span><span>{post.likes} {t('userProfile.likes')}</span><span>·</span><span>{post.comments} {t('userProfile.comments')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <FileText className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                </div>
                <p className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>{t('userProfile.noPostsYet')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* 🔧 NEW: Videos tab — grid of video thumbnails (Instagram Reels style) */}
        {activeTab === 'videos' && (
          <motion.div key="videos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {userVideos.length > 0 ? (
              <>
                {/* Link to full videos page */}
                <button
                  onClick={() => navigate(`/user/${userId}/videos`)}
                  className="w-full mb-3 flex items-center justify-between p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs font-bold hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <VideoIcon className="w-4 h-4" />
                    عرض جميع الفيديوهات ({userVideos.length})
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {/* 3-column grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {userVideos.slice(0, 9).map((video: any, idx: number) => (
                    <button
                      key={video.id || idx}
                      onClick={() => navigate(`/user/${userId}/videos`)}
                      className={`relative aspect-[9/16] rounded-lg overflow-hidden group ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
                    >
                      {video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <VideoIcon className={`w-6 h-6 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="flex items-center gap-1.5 text-white text-[8px] font-bold">
                          <span className="flex items-center gap-0.5">
                            <Eye className="w-2.5 h-2.5" />
                            {(video.views || 0) >= 1000 ? ((video.views || 0) / 1000).toFixed(1) + 'K' : (video.views || 0)}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Heart className="w-2.5 h-2.5" />
                            {(video.likes || 0) >= 1000 ? ((video.likes || 0) / 1000).toFixed(1) + 'K' : (video.likes || 0)}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className={`text-center py-12 rounded-2xl border ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <VideoIcon className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>لا توجد فيديوهات</p>
                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {currentUser?.id === userId ? 'ابدأ بنشر فيديوهاتك في سوق لايف' : 'لم ينشر هذا المستخدم فيديوهات بعد'}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'ads' && (
          <motion.div key="ads" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {userAds.length > 0 ? (
              <div className="space-y-3">
                {userAds.map((ad: any) => (
                  <div key={ad.id} onClick={() => navigate(`/post/${ad.id}`)}
                    className={`rounded-xl border p-4 cursor-pointer transition-colors ${darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                    <div className="flex items-start gap-3">
                      {ad.image && (() => {
                        let imgs: string[] = [];
                        try { const p = JSON.parse(ad.image); imgs = Array.isArray(p) ? p : [ad.image]; } catch { imgs = [ad.image]; }
                        return imgs.length > 0 ? <img src={imgs[0]} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" /> : null;
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-relaxed mb-2 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{ad.content}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {ad.price && <span className="text-sm font-black text-orange-600">{ad.price.toLocaleString()} {ad.currency}</span>}
                          {ad.location && <span className={`text-[11px] flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><MapPin className="w-3 h-3" />{ad.location}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <ShoppingBag className={`w-8 h-8 ${darkMode ? 'text-gray-500' : 'text-gray-300'}`} />
                </div>
                <p className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>{t('userProfile.noAdsYet')}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ Portfolio Tab ═══ */}
        {activeTab === 'portfolio' && (
          <motion.div key="portfolio" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {portfolioImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {portfolioImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in bg-gray-200"
                    onClick={() => { setLightboxImages(portfolioImages); setLightboxIndex(idx); }}
                  >
                    <img src={img} alt={`عمل ${idx + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform" loading="lazy" />
                  </div>
                ))}
              </div>
            ) : (
              <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <ImageIcon className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>لا توجد أعمال منشورة بعد</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'about' && (
          <motion.div key="about" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><UserIcon className="w-4 h-4" /></div>
                    <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.aboutName')}</p><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{targetUser.name}</p></div>
                  </div>
                </div>
                {targetUser.gender && (
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${targetUser.gender === 'female' ? (darkMode ? 'bg-pink-900/30 text-pink-400' : 'bg-pink-50 text-pink-600') : (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')}`}>
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.aboutGender')}</p><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{targetUser.gender === 'female' ? t('userProfile.female') : t('userProfile.male')}</p></div>
                    </div>
                  </div>
                )}
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'}`}><ShieldCheck className="w-4 h-4" /></div>
                    <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.trustScore')}</p><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{targetUser.trust_score || 0}%</p></div>
                  </div>
                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${targetUser.trust_score || 0}%` }} /></div>
                </div>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><CheckCircle2 className="w-4 h-4" /></div>
                    <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.aboutVerification')}</p><p className={`text-sm font-bold ${targetUser.is_verified ? 'text-green-600' : darkMode ? 'text-gray-300' : 'text-gray-900'}`}>{targetUser.is_verified ? t('userProfile.verified') : t('userProfile.unverified')}</p></div>
                  </div>
                </div>
                {targetUser.location && (
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600'}`}><MapPin className="w-4 h-4" /></div>
                      <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.aboutLocation')}</p><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{targetUser.location}</p></div>
                    </div>
                  </div>
                )}
                {targetUser.join_date && (
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600'}`}><Calendar className="w-4 h-4" /></div>
                      <div><p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('userProfile.aboutJoinDate')}</p><p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{new Date(targetUser.join_date).toLocaleDateString(dir === 'rtl' ? 'ar-EG' : 'en-US')}</p></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Lightbox for portfolio */}
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxImages(null)}
        />
      )}

      {/* 🔧 NEW: Full-screen video player modal for the "آخر فيديو" preview */}
      <AnimatePresence>
        {previewVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black flex items-center justify-center"
            onClick={() => setPreviewVideo(null)}
          >
            <button
              onClick={() => setPreviewVideo(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-xl"
            >
              ✕
            </button>
            <video
              src={previewVideo.videoUrl}
              className="w-full h-full object-contain"
              controls
              autoPlay
              loop
              onClick={(e) => e.stopPropagation()}
            />
            {/* Video info overlay */}
            <div
              className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent"
              onClick={(e) => e.stopPropagation()}
            >
              {previewVideo.title && (
                <p className="text-white font-bold text-sm mb-1">{previewVideo.title}</p>
              )}
              <div className="flex items-center gap-4 text-white/80 text-xs">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  {previewVideo.views >= 1000 ? (previewVideo.views / 1000).toFixed(1) + 'K' : previewVideo.views || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  {previewVideo.likes >= 1000 ? (previewVideo.likes / 1000).toFixed(1) + 'K' : previewVideo.likes || 0}
                </span>
              </div>
              {/* Link to full videos page */}
              <button
                onClick={() => {
                  setPreviewVideo(null);
                  navigate(`/user/${userId}/videos`);
                }}
                className="mt-2 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors"
              >
                عرض جميع الفيديوهات
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Report User Modal ─── */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`rounded-2xl w-full max-w-md shadow-2xl overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-white'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <h3 className={`font-black text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>إبلاغ عن {targetUser?.name}</h3>
                <button onClick={() => setShowReportModal(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className={`text-xs font-bold block mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>سبب الإبلاغ</label>
                  <div className="space-y-2">
                    {[
                      ['spam', 'محتوى مزعج أو ترويج غير مرغوب'],
                      ['harassment', 'مضايقة أو تنمر'],
                      ['fake', 'حساب وهمي أو انتحال شخصية'],
                      ['inappropriate', 'محتوى غير لائق'],
                      ['scam', 'احتيال أو نصب'],
                      ['other', 'سبب آخر'],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        onClick={() => setReportReason(val)}
                        className={`w-full text-start px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${reportReason === val ? 'bg-orange-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>تفاصيل إضافية (اختياري)</label>
                  <textarea
                    value={reportDetails}
                    onChange={e => setReportDetails(e.target.value)}
                    rows={3}
                    placeholder="اكتب تفاصيل إضافية..."
                    className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-bold resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'}`}
                  />
                </div>
                <button
                  onClick={handleReportSubmit}
                  disabled={submittingReport}
                  className="w-full bg-red-600 text-white py-3.5 rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Flag className="w-4 h-4" />
                  {submittingReport ? 'جارٍ الإرسال...' : 'إرسال البلاغ'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
