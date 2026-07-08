import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Story, User } from '../types';
import { Plus, X, ChevronLeft, ChevronRight, Send, Eye, Heart, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useTranslation } from 'react-i18next';
import { toast } from '../lib/silentToast';
import { parseDBTimestamp } from '../utils/time';

interface StoriesProps {
  stories: Story[];
  currentUser: User | null;
}

const STORY_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

interface UserStoryGroup {
  user: User;
  stories: Story[];
  hasUnviewed: boolean;
}

export const Stories: React.FC<StoriesProps> = ({ stories, currentUser }) => {
  const { darkMode } = useAppContext();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [viewingStory, setViewingStory] = useState<Story | null>(null);
  // Index of the story WITHIN the current user's story list (not the global list)
  const [storyIndex, setStoryIndex] = useState(0);
  // Index of the user group currently being viewed
  const [viewingUserGroupIdx, setViewingUserGroupIdx] = useState(-1);
  const [replyText, setReplyText] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [viewedStories, setViewedStories] = useState<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement>(null);

  // ─── Group stories by user (Facebook-style: one avatar per user) ───
  const storyGroups = useMemo<UserStoryGroup[]>(() => {
    const map = new Map<string, UserStoryGroup>();
    for (const s of stories) {
      const key = s.user?.id || 'unknown';
      if (!map.has(key)) {
        map.set(key, { user: s.user, stories: [], hasUnviewed: false });
      }
      const entry = map.get(key)!;
      entry.stories.push(s);
      if (!s.isSeen && !viewedStories.has(s.id)) {
        entry.hasUnviewed = true;
      }
    }
    return Array.from(map.values());
  }, [stories, viewedStories]);

  // ─── Flat list of all stories (used by the full-screen viewer) ───
  // We keep a flat list so the viewer can advance through all stories
  // across all user groups sequentially.
  const flatStories = useMemo(() => {
    return storyGroups.flatMap(g => g.stories);
  }, [storyGroups]);

  const handleStoryClick = async (groupIdx: number) => {
    const group = storyGroups[groupIdx];
    if (!group) return;
    // Open at the first unviewed story (or first if all viewed)
    const firstUnviewedIdx = group.stories.findIndex(
      s => !s.isSeen && !viewedStories.has(s.id)
    );
    const startIdx = firstUnviewedIdx >= 0 ? firstUnviewedIdx : 0;
    setViewingUserGroupIdx(groupIdx);
    setStoryIndex(startIdx);
    setViewingStory(group.stories[startIdx]);
    setShowReactions(false);
    setReplyText('');
    // Mark story as viewed
    const firstStory = group.stories[startIdx];
    if (firstStory?.id && !viewedStories.has(firstStory.id)) {
      try {
        await api.viewStory(firstStory.id);
        setViewedStories(prev => new Set([...prev, firstStory.id]));
      } catch {}
    }
  };

  const handleNextStory = () => {
    const currentGroup = storyGroups[viewingUserGroupIdx];
    if (!currentGroup) {
      setViewingStory(null);
      return;
    }
    const nextIdx = storyIndex + 1;
    if (nextIdx < currentGroup.stories.length) {
      // Next story within the same user's group
      setStoryIndex(nextIdx);
      setViewingStory(currentGroup.stories[nextIdx]);
      setShowReactions(false);
      setReplyText('');
      const next = currentGroup.stories[nextIdx];
      if (next?.id && !viewedStories.has(next.id)) {
        api.viewStory(next.id).catch(() => {});
        setViewedStories(prev => new Set([...prev, next.id]));
      }
    } else {
      // Move to the next user's group
      const nextGroupIdx = viewingUserGroupIdx + 1;
      if (nextGroupIdx < storyGroups.length) {
        setViewingUserGroupIdx(nextGroupIdx);
        setStoryIndex(0);
        const first = storyGroups[nextGroupIdx].stories[0];
        setViewingStory(first);
        setShowReactions(false);
        setReplyText('');
        if (first?.id && !viewedStories.has(first.id)) {
          api.viewStory(first.id).catch(() => {});
          setViewedStories(prev => new Set([...prev, first.id]));
        }
      } else {
        setViewingStory(null);
      }
    }
  };

  const handlePrevStory = () => {
    const currentGroup = storyGroups[viewingUserGroupIdx];
    if (!currentGroup) return;
    const prevIdx = storyIndex - 1;
    if (prevIdx >= 0) {
      // Previous story within the same user's group
      setStoryIndex(prevIdx);
      setViewingStory(currentGroup.stories[prevIdx]);
      setShowReactions(false);
    } else {
      // Move to the previous user's group, last story
      const prevGroupIdx = viewingUserGroupIdx - 1;
      if (prevGroupIdx >= 0) {
        const prevGroup = storyGroups[prevGroupIdx];
        setViewingUserGroupIdx(prevGroupIdx);
        const lastIdx = prevGroup.stories.length - 1;
        setStoryIndex(lastIdx);
        setViewingStory(prevGroup.stories[lastIdx]);
        setShowReactions(false);
      }
    }
  };

  const handleCreateStoryClick = () => {
    const event = new CustomEvent('openStoryCreator');
    window.dispatchEvent(event);
  };

  const handleReply = async () => {
    if (!replyText.trim() || !viewingStory?.id) return;
    try {
      await api.replyToStory(viewingStory.id, replyText.trim());
      toast.success(t('stories.replySent', 'تم إرسال الرد'));
      setReplyText('');
    } catch (err: any) {
      toast.error(err.message || t('stories.replyFailed', 'فشل إرسال الرد'));
    }
  };

  const handleReact = async (emoji: string) => {
    if (!viewingStory?.id) return;
    try {
      await api.reactToStory(viewingStory.id, emoji);
      setShowReactions(false);
      toast.success(t('stories.reactionSent', 'تم إرسال التفاعل'));
    } catch {}
  };

  const handleShowViewers = async () => {
    if (!viewingStory?.id) return;
    try {
      const data = await api.getStoryViewers(viewingStory.id);
      setViewers(data);
      setShowViewers(true);
    } catch {}
  };

  // Auto-advance story (5 seconds for image stories; videos advance on ended)
  useEffect(() => {
    if (viewingStory && !showViewers) {
      const isVideo = (viewingStory as any).videoUrl || (viewingStory as any).type === 'video';
      if (isVideo) return; // Video stories don't auto-advance
      const timer = setTimeout(() => {
        handleNextStory();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [viewingStory, storyIndex, showViewers, viewingUserGroupIdx]);

  // Clean up expired stories on mount
  useEffect(() => {
    api.deleteExpiredStories().catch(() => {});
  }, []);

  // ─── Progress bar segments: only show segments for the current user's stories ───
  const currentGroupStories = viewingUserGroupIdx >= 0 ? storyGroups[viewingUserGroupIdx]?.stories || [] : [];

  return (
    <>
      {/* ════════════════ Facebook-style circular stories bar ════════════════ */}
      <div className={`flex gap-3 overflow-x-auto py-1 no-scrollbar ${darkMode ? '' : ''}`}>
        {/* ─── Add Story (current user) ─── */}
        <button
          onClick={handleCreateStoryClick}
          className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none"
          aria-label={t('stories.createStory')}
        >
          <div className="relative">
            <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'} group-hover:scale-105 transition-transform`}>
              <img
                src={currentUser?.avatarBase64 || currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.id || 'default'}`}
                className="w-full h-full object-cover"
                alt={currentUser?.name || 'me'}
              />
            </div>
            {/* Plus badge */}
            <div className={`absolute -bottom-0.5 ${''}-right-0.5 w-5 h-5 bg-orange-600 rounded-full border-2 ${darkMode ? 'border-gray-900' : 'border-white'} flex items-center justify-center group-hover:scale-110 transition-transform`}>
              <Plus className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          </div>
          <span className={`text-[10px] font-bold max-w-[60px] truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {t('stories.yourStory', 'قصتك')}
          </span>
        </button>

        {/* ─── Divider ─── */}
        {storyGroups.length > 0 && (
          <div className={`self-center w-px h-12 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} shrink-0`} />
        )}

        {/* ─── Other users' stories (grouped by user) ─── */}
        {storyGroups.map((group, groupIdx) => {
          const isViewed = !group.hasUnviewed;
          const storyCount = group.stories.length;
          return (
            <button
              key={group.user.id + '-' + groupIdx}
              onClick={() => handleStoryClick(groupIdx)}
              className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none"
              aria-label={`${group.user.name} — ${storyCount} ${t('stories.storiesCount', 'قصص')}`}
            >
              <div className="relative">
                {/* Gradient ring (unviewed) or gray ring (viewed) */}
                <div className={`p-[2px] rounded-full transition-transform group-hover:scale-105 ${
                  isViewed
                    ? (darkMode ? 'bg-gray-600' : 'bg-gray-300')
                    : 'bg-gradient-to-tr from-orange-500 via-pink-500 to-purple-500'
                }`}>
                  <div className={`p-[2px] rounded-full ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
                    <img
                      src={group.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${group.user.id}`}
                      className="w-14 h-14 rounded-full object-cover"
                      alt={group.user.name}
                    />
                  </div>
                </div>
                {/* Story count badge for users with multiple stories */}
                {storyCount > 1 && (
                  <div className="absolute -top-1 -right-1 bg-orange-600 text-white text-[9px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-white shadow-sm">
                    {storyCount}
                  </div>
                )}
              </div>
              <span className={`text-[10px] font-bold max-w-[64px] truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {group.user.name?.split(' ')[0] || t('common.user')}
              </span>
            </button>
          );
        })}

        {/* Empty hint when no other-user stories */}
        {storyGroups.length === 0 && (
          <div className="flex items-center">
            <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {t('stories.noStoriesYet', 'لا توجد قصص بعد — أضف قصتك الأولى!')}
            </span>
          </div>
        )}
      </div>

      {/* ════════════════ Full-screen Story Viewer ════════════════ */}
      <AnimatePresence>
        {viewingStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] bg-black flex items-center justify-center"
            onClick={() => setViewingStory(null)}
          >
            {/* Progress bars — one segment per story in the CURRENT user's group */}
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="flex gap-1">
                {currentGroupStories.map((s, i) => (
                  <div key={s.id || i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-white rounded-full ${i < storyIndex ? 'w-full' : i === storyIndex ? 'w-full animate-progress' : 'w-0'}`}
                      style={i === storyIndex ? { animation: 'progress 5s linear' } : {}}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* User info */}
            <div className="absolute top-8 right-4 left-4 z-10 flex items-center justify-between">
              <button onClick={() => setViewingStory(null)} className="text-white p-2 hover:bg-white/10 rounded-full">
                <X className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3">
                <img src={viewingStory.user.avatar} alt="" className="w-8 h-8 rounded-full border-2 border-white object-cover" />
                <div>
                  <span className="text-white font-bold text-sm">{viewingStory.user.name}</span>
                  <span className="text-white/60 text-[10px] block">{viewingStory.createdAt ? new Date(viewingStory.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : t('stories.now')}</span>
                </div>
              </div>
            </div>

            {/* Story content */}
            <div className="max-w-md max-h-[80vh] w-full mx-4 relative" onClick={e => e.stopPropagation()}>
              {(viewingStory as any).videoUrl ? (
                <video
                  ref={videoRef}
                  src={(viewingStory as any).videoUrl}
                  className="w-full h-[70vh] object-cover rounded-2xl"
                  autoPlay
                  controls
                  onEnded={handleNextStory}
                />
              ) : viewingStory.type === 'text' && viewingStory.backgroundColor ? (
                <div className={`w-full h-[70vh] bg-gradient-to-br ${viewingStory.backgroundColor} rounded-2xl flex items-center justify-center p-8`}>
                  <p className="text-white text-2xl font-black text-center leading-relaxed" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                    {viewingStory.text}
                  </p>
                </div>
              ) : (
                <img src={viewingStory.image} alt="Story" className="w-full h-[70vh] object-cover rounded-2xl" />
              )}

              {/* Navigation arrows */}
              {(viewingUserGroupIdx > 0 || storyIndex > 0) && (
                <button onClick={handlePrevStory} className="absolute right-[-20px] top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/30">
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              {(viewingUserGroupIdx < storyGroups.length - 1 || storyIndex < (storyGroups[viewingUserGroupIdx]?.stories.length || 0) - 1) && (
                <button onClick={handleNextStory} className="absolute left-[-20px] top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/30">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              {/* Viewers button (only for own stories) */}
              {viewingStory.user.id === user?.id && (
                <button
                  onClick={handleShowViewers}
                  className="absolute top-4 left-4 flex items-center gap-1 bg-black/50 rounded-full px-3 py-1.5 hover:bg-black/70 transition-colors"
                >
                  <Eye className="w-4 h-4 text-white" />
                  <span className="text-white text-xs">{(viewingStory as any).viewCount || 0}</span>
                </button>
              )}
            </div>

            {/* Bottom bar: Reply + Reactions */}
            <div className="absolute bottom-6 left-4 right-4 z-10 flex items-center gap-2" onClick={e => e.stopPropagation()}>
              {/* Reaction button */}
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/30 transition-colors"
              >
                <Heart className="w-5 h-5" />
              </button>

              {/* Reply input */}
              <div className="flex-1 flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReply()}
                  placeholder={t('stories.replyPlaceholder', 'أرسل رد على القصة...')}
                  className="flex-1 bg-transparent text-white placeholder-white/50 text-sm outline-none"
                />
                {replyText.trim() && (
                  <button onClick={handleReply} className="text-orange-400 hover:text-orange-300">
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Reaction picker */}
            <AnimatePresence>
              {showReactions && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-black/70 backdrop-blur-md rounded-full px-4 py-3"
                  onClick={e => e.stopPropagation()}
                >
                  {STORY_REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => handleReact(emoji)}
                      className="text-2xl hover:scale-125 transition-transform active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Viewers modal */}
            <AnimatePresence>
              {showViewers && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-20 left-4 right-4 z-20 bg-black/80 backdrop-blur-md rounded-2xl p-4 max-h-[40vh] overflow-y-auto"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold text-sm">
                      <Eye className="w-4 h-4 inline mr-1" />
                      {viewers.length} {t('stories.viewers', 'مشاهد')}
                    </h3>
                    <button onClick={() => setShowViewers(false)} className="text-white/60 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {viewers.length === 0 ? (
                    <p className="text-white/50 text-sm text-center py-4">{t('stories.noViewers', 'لا يوجد مشاهدين بعد')}</p>
                  ) : (
                    <div className="space-y-2">
                      {viewers.map((v: any) => (
                        <div key={v.id} className="flex items-center gap-3">
                          <img src={v.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                          <span className="text-white text-sm">{v.name}</span>
                          <span className="text-white/40 text-xs mr-auto">{parseDBTimestamp(v.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes progress {
          from { width: 0; }
          to { width: 100%; }
        }
        .animate-progress {
          animation: progress 5s linear forwards;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
};
