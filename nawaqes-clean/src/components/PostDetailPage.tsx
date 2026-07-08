import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext, mapApiPost } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr, parseDBTimestamp } from '../utils/time';
import { api } from '../services/api';
import { PromotionWizard } from './PromotionWizard';
import { EditPostModal } from './EditPostModal';
import {
  ArrowRight,
  ThumbsUp,
  MessageCircle,
  Share2,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  ShoppingBag,
  Send,
  Bookmark,
  BookmarkCheck,
  Globe,
  BarChart3,
  Flag,
  EyeOff,
  MoreHorizontal,
  Zap,
  X,
  Loader2,
  ImagePlus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Edit3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useSafeBack } from '../hooks/useSafeBack';

interface CommentData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  parent_id: string;
  likes: number;
  image_url: string;
  isLiked: boolean;
  created_at: string;
  replies: CommentData[];
}

export const PostDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { id } = useParams<{ id: string }>();
  const { darkMode, posts, savedPosts, toggleSavePost, openShareModal, sendMessage, refreshData } = useAppContext();
  const { currentUser, refreshCurrentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [liked, setLiked] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<CommentData[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const commentInputRef = React.useRef<HTMLInputElement>(null);
  const [promotingPost, setPromotingPost] = useState<typeof post | null>(null);
  const [editingPost, setEditingPost] = useState<typeof post | null>(null);
  const [fetchingPost, setFetchingPost] = useState(false);
  const [fetchedPost, setFetchedPost] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Parse post.image: supports JSON array (multi-image) or single URL string
  const getPostImages = (img: string | undefined | null): string[] => {
    if (!img) return [];
    try {
      const parsed = JSON.parse(img);
      if (Array.isArray(parsed)) {
        return parsed.filter((x: any) => typeof x === 'string' && x.length > 0);
      }
      if (typeof parsed === 'string' && parsed.length > 0) return [parsed];
    } catch {
      // Not JSON — treat as a plain URL string
      if (typeof img === 'string' && img.length > 0) return [img];
    }
    return [];
  };

  // Try to find post from local state first, then from fetched data
  const localPost = posts.find(p => p.id === id);
  const post = localPost || fetchedPost;

  // If post is not in local state, try fetching from API
  useEffect(() => {
    if (!localPost && id && !fetchingPost && !fetchedPost) {
      setFetchingPost(true);
      api.getPost(id)
        .then((data: any) => {
          const loadedPost = mapApiPost(data);
          setFetchedPost(loadedPost);
          // Track click for promoted posts when user opens the detail page
          if (loadedPost?.isPromoted && loadedPost?.promotionStatus === 'approved') {
            api.trackClick(loadedPost.id).catch(() => { /* silent fail */ });
          }
        })
        .catch(() => {
          setFetchedPost(null);
        })
        .finally(() => {
          setFetchingPost(false);
        });
    }
  }, [id, localPost, fetchingPost, fetchedPost]);

  // Load comments from API
  useEffect(() => {
    if (id) {
      api.getComments(id)
        .then((data) => {
          setComments(data as CommentData[]);
        })
        .catch(() => {
          // fallback to empty
        });
    }
  }, [id]);

  const [likesCount, setLikesCount] = useState(post?.likes || 0);

  // Sync likesCount with post data
  useEffect(() => {
    if (post) {
      setLikesCount(post.likes || 0);
    }
  }, [post?.likes]);

  // Loading state
  if (fetchingPost) {
    return (
      <div className="max-w-2xl mx-auto" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('common.loading')}</h1>
        </div>
        <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <Loader2 className="w-10 h-10 mx-auto animate-spin text-orange-600 mb-4" />
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-2xl mx-auto" dir={dir}>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => safeBack()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <h1 className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('postDetail.postNotFound')}</h1>
        </div>
        <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('postDetail.postNotFoundDesc')}</p>
          <button onClick={() => safeBack()} className="mt-4 text-orange-600 font-bold text-sm hover:underline">{t('app.backToHome')}</button>
        </div>
      </div>
    );
  }

  const isSaved = savedPosts.includes(post.id);
  const isMyPost = currentUser?.id === post.author.id;
  const canPromote = isMyPost && !post.isPromoted && post.promotionStatus !== 'pending';


  // Similar ads (same type, different id)
  const similarAds = posts.filter(p => p.type === 'ad' && p.id !== post.id).slice(0, 3);

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    // Optimistic update of like count
    setLikesCount((prev: number) => newLiked ? prev + 1 : prev - 1);
    try {
      const result = await api.likePost(post.id);
      // Sync with server state
      setLiked(result.liked);
      setLikesCount(result.likes);
    } catch {
      // Revert on error
      setLiked(!newLiked);
      setLikesCount((prev: number) => newLiked ? prev - 1 : prev + 1);
    }
  };

  const handleSave = () => {
    toggleSavePost(post.id);
    toast.success(isSaved ? t('postCard.removedFromSaved') : t('postCard.savedPost'));
  };

  const handleShare = () => {
    openShareModal(post);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() && !commentImage) return;
    const text = commentText.trim();
    try {
      const newComment = await api.commentPost(post.id, text, undefined, commentImage || undefined) as any;
      setComments(prev => [{
        id: newComment?.id || `c_${Date.now()}`,
        author_id: currentUser?.id || '',
        author_name: currentUser?.name || t('common.you'),
        author_avatar: currentUser?.avatar || '',
        content: text,
        parent_id: '',
        likes: 0,
        image_url: commentImage || '',
        isLiked: false,
        created_at: new Date().toISOString(),
        replies: [],
      }, ...prev]);
      setCommentText('');
      setCommentImage(null);
      toast.success(t('postCard.commentSent'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleReplyToComment = async (parentId: string) => {
    if (!replyText.trim()) return;
    const text = replyText.trim();
    try {
      const newReply = await api.commentPost(post.id, text, parentId, undefined) as any;
      // Add reply to the correct parent comment
      const addReply = (comments: CommentData[]): CommentData[] => {
        return comments.map(c => {
          if (c.id === parentId) {
            return {
              ...c,
              replies: [...c.replies, {
                id: newReply?.id || `r_${Date.now()}`,
                author_id: currentUser?.id || '',
                author_name: currentUser?.name || t('common.you'),
                author_avatar: currentUser?.avatar || '',
                content: text,
                parent_id: parentId,
                likes: 0,
                image_url: '',
                isLiked: false,
                created_at: new Date().toISOString(),
                replies: [],
              }],
            };
          }
          if (c.replies.length > 0) {
            return { ...c, replies: addReply(c.replies) };
          }
          return c;
        });
      };
      setComments(prev => addReply(prev));
      setReplyText('');
      setReplyingTo(null);
      // Auto-expand replies for this parent
      setExpandedReplies(prev => new Set(prev).add(parentId));
      toast.success(t('postCard.commentSent'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      const result = await api.likeComment(post.id, commentId) as any;
      // Update the comment's like status
      const updateLike = (comments: CommentData[]): CommentData[] => {
        return comments.map(c => {
          if (c.id === commentId) {
            return { ...c, isLiked: result.liked, likes: result.likes };
          }
          if (c.replies.length > 0) {
            return { ...c, replies: updateLike(c.replies) };
          }
          return c;
        });
      };
      setComments(prev => updateLike(prev));
    } catch {
      // ignore
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t('postCard.confirmDeleteComment'))) return;
    try {
      await api.deleteComment(post.id, commentId);
      const removeComment = (comments: CommentData[]): CommentData[] => {
        return comments.filter(c => c.id !== commentId).map(c => {
          if (c.replies.length > 0) {
            return { ...c, replies: removeComment(c.replies) };
          }
          return c;
        });
      };
      setComments(prev => removeComment(prev));
      toast.success(t('postCard.commentDeleted'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const handleCommentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('createPost.imageSizeError'));
      return;
    }
    try {
      const result = await api.uploadImage(file);
      setCommentImage(result.url);
    } catch {
      toast.error(t('common.error'));
    }
    // Reset input
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleContactSeller = async () => {
    if (!currentUser) {
      // Redirect to login instead of a toast (which is now silent)
      navigate('/login');
      return;
    }
    if (isMyPost) {
      // Don't navigate to messages with yourself — just stay on the page.
      // (Toast was removed per user request — silent UI.)
      return;
    }
    try {
      // Navigate to messages with the ?chat= param so ChatContext
      // auto-selects the seller's conversation.
      navigate(`/messages?chat=${post.author.id}`);
    } catch (err: any) {
      // Silent fail — toast removed per user request
      console.error('Failed to navigate to messages:', err);
    }
  };

  const renderComment = (comment: CommentData, depth: number = 0) => {
    const isOwn = currentUser?.id === comment.author_id;
    const isRTL = dir === 'rtl';
    const hasReplies = comment.replies && comment.replies.length > 0;
    const showReplies = expandedReplies.has(comment.id);

    return (
      <div key={comment.id}>
        <div
          className={`flex items-start gap-3 ${depth > 0 ? (isRTL ? 'mr-6 sm:mr-10 border-r-2 border-orange-300 pr-2 sm:pr-3' : 'ml-6 sm:ml-10 border-l-2 border-orange-300 pl-2 sm:pl-3') : ''}`}
          dir={dir}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden ${darkMode ? 'bg-gray-600 text-gray-300' : 'bg-orange-100 text-orange-700'}`}>
            {comment.author_avatar ? (
              <img src={comment.author_avatar} alt="" className="w-full h-full object-cover rounded-full" />
            ) : (
              comment.author_name?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`rounded-xl px-3 py-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{comment.author_name}</span>
                {isOwn && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className={`p-1 rounded-full transition-colors ${darkMode ? 'hover:bg-gray-600 text-gray-500 hover:text-red-400' : 'hover:bg-gray-100 text-gray-400 hover:text-red-500'}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className={`text-sm sm:text-base mt-1 break-words ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{comment.content}</p>
              {comment.image_url && (
                <img src={comment.image_url} alt="" className="mt-2 rounded-lg max-h-40 object-cover cursor-pointer" onClick={() => window.open(comment.image_url, '_blank')} />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1.5">
              <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {comment.created_at ? parseDBTimestamp(comment.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : t('common.now')}
              </span>
              <button
                onClick={() => handleLikeComment(comment.id)}
                className={`flex items-center gap-1 text-xs font-semibold transition-colors ${comment.isLiked ? 'text-blue-600' : darkMode ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${comment.isLiked ? 'fill-blue-600' : ''}`} />
                {comment.likes > 0 && <span>{comment.likes}</span>}
              </button>
              <button
                onClick={() => { setReplyingTo(replyingTo === comment.id ? null : comment.id); setReplyText(''); }}
                className={`text-xs font-semibold transition-colors ${darkMode ? 'text-gray-500 hover:text-orange-400' : 'text-gray-400 hover:text-orange-600'}`}
              >
                {t('postCard.reply')}
              </button>
            </div>

            {/* Reply input */}
            {replyingTo === comment.id && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2">
                <form onSubmit={(e) => { e.preventDefault(); handleReplyToComment(comment.id); }} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={t('postCard.writeReply')}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    autoFocus
                    className={`flex-1 text-sm px-3 py-2 rounded-lg border outline-none transition-colors ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'}`}
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim()}
                    className={`p-2 rounded-lg transition-all ${replyText.trim() ? 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95' : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'}`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </motion.div>
            )}

            {/* View Replies toggle */}
            {hasReplies && depth === 0 && (
              <button
                onClick={() => toggleReplies(comment.id)}
                className={`flex items-center gap-1 mt-1.5 text-xs font-semibold transition-colors ${darkMode ? 'text-orange-400 hover:text-orange-300' : 'text-orange-600 hover:text-orange-700'}`}
              >
                {showReplies ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />{t('postCard.hideReplies')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />{t('postCard.viewReplies', { count: comment.replies.length })}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Nested replies */}
        {hasReplies && (depth > 0 || showReplies) && (
          <div className="mt-2 space-y-3">
            {comment.replies.map(reply => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    );
  };



  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4" dir={dir}>
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
        <h1 className={`text-xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('postDetail.title')}</h1>
      </div>

      {/* Promote Button */}
      {canPromote && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => setPromotingPost(post)}
          className={`w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] ${
            darkMode
              ? 'bg-gradient-to-l from-orange-600 to-orange-700 text-white hover:from-orange-500 hover:to-orange-600'
              : 'bg-gradient-to-l from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700'
          } shadow-lg shadow-orange-200/50`}
        >
          <Zap className="w-5 h-5" />
          {t('postCard.promotePost')}
        </motion.button>
      )}

      {/* Pending Promotion Badge */}
      {isMyPost && post.promotionStatus === 'pending' && (
        <div className={`w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm ${
          darkMode ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-800' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        }`}>
          <Zap className="w-4 h-4" />
          {t('postCard.promotionPending')}
        </div>
      )}

      {/* Post Card */}
      <div className={`rounded-2xl border overflow-hidden mb-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        {/* Author Header */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative" onClick={() => navigate(`/user/${post.author.id}`)}>
              <img
                src={post.author.avatar}
                alt={post.author.name}
                className="w-12 h-12 rounded-full bg-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
              />
              <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-bold text-base cursor-pointer hover:underline ${darkMode ? 'text-white' : 'text-gray-900'}`} onClick={() => navigate(`/user/${post.author.id}`)}>
                  {post.author.name}
                </h4>
                {post.author.isVerified && (
                  <CheckCircle2 className="w-4 h-4 text-orange-600 fill-orange-600/10" />
                )}
                {post.author.trustScore && (
                  <div className="bg-green-50 text-green-700 text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    {post.author.trustScore}%
                  </div>
                )}
              </div>
              <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <span>{formatRelativeTimeAr(post.timestamp)}</span>
                <span>·</span>
                <Globe className="w-3 h-3" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 relative">
            <button
              onClick={handleSave}
              className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'} ${isSaved ? 'text-orange-600' : ''}`}
            >
              {isSaved ? <BookmarkCheck className="w-5 h-5 fill-orange-600" /> : <Bookmark className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  className={`absolute top-full left-0 mt-1 w-44 rounded-xl shadow-xl border z-50 overflow-hidden ${
                    darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {isMyPost && (
                    <button onClick={() => { setShowMoreMenu(false); setEditingPost(post); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}>
                      <Edit3 className="w-4 h-4" /> {t('common.edit')}
                    </button>
                  )}
                  {canPromote && (
                    <button onClick={() => { setShowMoreMenu(false); setPromotingPost(post); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-orange-400 hover:bg-gray-700' : 'text-orange-600 hover:bg-orange-50'}`}>
                      <Zap className="w-4 h-4" /> {t('postCard.promotePost')}
                    </button>
                  )}
                  <button onClick={() => { setShowMoreMenu(false); toast.success(t('postCard.postHidden')); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'}`}>
                    <EyeOff className="w-4 h-4" /> {t('postCard.hidePost')}
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); toast.success(t('postCard.postReported')); }} className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${darkMode ? 'text-red-400 hover:bg-gray-700' : 'text-red-600 hover:bg-red-50'}`}>
                    <Flag className="w-4 h-4" /> {t('postCard.reportPost')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 pb-4">
          <p className={`text-base leading-relaxed whitespace-pre-wrap ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {post.content}
          </p>
        </div>

        {/* Location */}
        {post.location && (
          <div className={`px-5 pb-3 flex items-center gap-1.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <MapPin className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium">{post.location}</span>
          </div>
        )}

        {/* Image — supports multiple images (JSON array) or single image */}
        {(() => {
          const images = getPostImages(post.image);
          if (images.length === 0) return null;

          // Single image
          if (images.length === 1) {
            return (
              <div className={`border-y ${darkMode ? 'bg-gray-700 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                <img
                  src={images[0]}
                  alt="Post content"
                  className="w-full h-auto object-contain max-h-[500px]"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            );
          }

          // Multiple images — gallery with main view + thumbnail strip
          const safeIndex = Math.min(activeImageIndex, images.length - 1);
          return (
            <div className={`border-y ${darkMode ? 'bg-gray-700 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
              {/* Main image */}
              <div className="relative w-full" style={{ minHeight: '280px', maxHeight: '500px' }}>
                <img
                  src={images[safeIndex]}
                  alt={`صورة ${safeIndex + 1}`}
                  className="w-full h-auto object-contain max-h-[500px]"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {/* Image counter badge */}
                <div className="absolute top-2 left-2 bg-black/60 text-white text-[11px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
                  {safeIndex + 1} / {images.length}
                </div>
                {/* Navigation arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((safeIndex - 1 + images.length) % images.length);
                      }}
                      className="absolute top-1/2 right-2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                      aria-label="السابق"
                    >
                      <ChevronDown className="w-5 h-5 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex((safeIndex + 1) % images.length);
                      }}
                      className="absolute top-1/2 left-2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                      aria-label="التالي"
                    >
                      <ChevronUp className="w-5 h-5 rotate-90" />
                    </button>
                  </>
                )}
              </div>
              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className={`flex gap-1 p-2 overflow-x-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveImageIndex(idx);
                      }}
                      className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-all ${
                        idx === safeIndex
                          ? 'border-orange-500 scale-105'
                          : darkMode
                            ? 'border-gray-600 opacity-60 hover:opacity-100'
                            : 'border-gray-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt={`صورة ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Ad Details */}
        {post.type === 'ad' && (
          <div className={`mx-5 my-4 p-5 rounded-2xl border ${darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('postCard.listedPrice')}</span>
                <span className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {post.price?.toLocaleString()} {post.currency}
                </span>
              </div>
              {post.isBoosted && (
                <div className="flex flex-col items-end gap-1">
                  <div className="bg-orange-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg shadow-orange-100">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    {t('postCard.smartReach')}
                  </div>
                  {post.reachCount && (
                    <div className="flex items-center gap-1 text-[9px] text-orange-500 font-bold">
                      <BarChart3 className="w-3 h-3" />
                      {t('postCard.reached', { count: post.reachCount.toLocaleString() })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {post.paymentMethods && post.paymentMethods.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('postCard.paymentAvailable')}</span>
                {post.paymentMethods.includes('vf_cash') && (
                  <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${darkMode ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {t('postCard.vodafoneCash')}
                  </div>
                )}
                {post.paymentMethods.includes('instapay') && (
                  <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${darkMode ? 'bg-blue-900/30 text-blue-400 border-blue-800' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                    {t('postCard.instaPay')}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleContactSeller}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-orange-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              {t('postCard.contactForPurchase')}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className={`px-5 py-3 flex items-center justify-between text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <span className="font-medium">{likesCount} {t('postCard.like')}</span>
          <div className="flex items-center gap-3">
            <span>{comments.length} {t('postCard.comment')}</span>
            <span>{post.shares} {t('postCard.share')}</span>
          </div>
        </div>

        {/* Actions */}
        <div className={`mx-3 border-t py-1 flex items-center justify-between mb-1 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button
            onClick={handleLike}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors group ${
              liked ? 'text-blue-600' : darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <ThumbsUp className={`w-5 h-5 ${liked ? 'text-blue-600 fill-blue-600' : darkMode ? 'text-gray-400 group-hover:text-blue-500' : 'text-gray-500 group-hover:text-blue-600'}`} />
            <span className={`text-sm font-semibold ${liked ? 'text-blue-600' : darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('postCard.liked')}</span>
          </button>
          <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors group ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`} onClick={() => commentInputRef.current?.focus()}>
            <MessageCircle className={`w-5 h-5 ${darkMode ? 'text-gray-400 group-hover:text-gray-200' : 'text-gray-500 group-hover:text-gray-900'}`} />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('postCard.comment')}</span>
          </button>
          <button
            onClick={handleShare}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors group ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            <Share2 className={`w-5 h-5 ${darkMode ? 'text-gray-400 group-hover:text-green-400' : 'text-gray-500 group-hover:text-green-600'}`} />
            <span className={`text-sm font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('postCard.share')}</span>
          </button>
        </div>
      </div>

      {/* Comments Section */}
      <div className={`rounded-2xl border overflow-hidden mb-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className={`px-4 sm:px-5 py-3 sm:py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`font-black text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('postDetail.comments')} ({comments.length})
          </h3>
        </div>

        {/* Comments List */}
        <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'} max-h-[500px] overflow-y-auto`}>
          {comments.length > 0 ? (
            <div className="p-3 sm:p-5 space-y-4">
              {comments.map(comment => renderComment(comment))}
            </div>
          ) : (
            <div className={`px-5 py-8 text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-bold">{t('postDetail.noComments')}</p>
            </div>
          )}
        </div>

        {/* Comment Input */}
        <form onSubmit={handleAddComment} className={`flex items-center gap-2 px-3 sm:px-5 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          {/* Comment image preview */}
          {commentImage && (
            <div className="relative flex-shrink-0">
              <img src={commentImage} alt="" className="w-10 h-10 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setCommentImage(null)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          <input
            ref={commentInputRef}
            type="text"
            placeholder={t('postCard.writeComment')}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            className={`flex-1 text-sm px-4 py-2.5 rounded-xl border outline-none transition-colors ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'
            }`}
          />
          {/* Image upload button */}
          <input type="file" ref={imageInputRef} accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.avif,.heic,.heif,.ico,.jfif" className="sr-only" onChange={handleCommentImageUpload} />
          <label htmlFor="imageInputRef-input" className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-orange-400' : 'hover:bg-gray-100 text-gray-400 hover:text-orange-600'}`} style={{cursor:"pointer"}}>
            <ImagePlus className="w-4 h-4" />
          </label>
          <button
            type="submit"
            disabled={!commentText.trim() && !commentImage}
            className={`p-2.5 rounded-xl transition-all ${
              commentText.trim() || commentImage
                ? 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95'
                : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Similar Ads */}
      {similarAds.length > 0 && (
        <div>
          <h3 className={`font-black text-lg mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t('postDetail.similarAds')}</h3>
          <div className="grid grid-cols-1 gap-3">
            {similarAds.map(ad => (
              <div
                key={ad.id}
                onClick={() => navigate(`/post/${ad.id}`)}
                className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                  darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {(() => {
                    const adImgs = getPostImages(ad.image);
                    if (adImgs.length === 0) return null;
                    return (
                      <img src={adImgs[0]} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                    );
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <img src={ad.author.avatar} alt="" className="w-5 h-5 rounded-full" />
                      <span className={`text-[11px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{ad.author.name}</span>
                    </div>
                    <p className={`text-sm leading-relaxed mb-2 line-clamp-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{ad.content}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {ad.price && (
                        <span className="text-sm font-black text-orange-600">{ad.price.toLocaleString()} {ad.currency}</span>
                      )}
                      {ad.location && (
                        <span className={`text-[11px] flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <MapPin className="w-3 h-3" />{ad.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotion Wizard */}
      {promotingPost && (
        <PromotionWizard
          post={promotingPost}
          onClose={() => setPromotingPost(null)}
          onPromotionCreated={() => {
            refreshData();
            refreshCurrentUser();
            if (fetchedPost && fetchedPost.id === promotingPost.id) {
              setFetchedPost({ ...fetchedPost, promotionStatus: 'pending' });
            }
          }}
        />
      )}

      {/* Edit Post Modal */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            refreshData();
            setEditingPost(null);
            // Re-fetch the post to reflect updated data
            if (id) {
              api.getPost(id)
                .then((data: any) => {
                  setFetchedPost(mapApiPost(data));
                })
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
};
