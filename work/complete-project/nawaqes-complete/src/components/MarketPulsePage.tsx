// ─── نبض السوق — Market Pulse (Most Engaging Content) ────────────
// Shows: Top Posts + Top Ads + Top Videos (sorted by engagement)
// NO private data — only public content ranked by likes/comments/views
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight, Eye, Heart, MessageCircle, TrendingUp, Flame,
  ShoppingBag, Video, FileText, RefreshCw, Play,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';

type TabType = 'all' | 'posts' | 'ads' | 'videos';

interface TopItem {
  id: string;
  type: 'post' | 'ad' | 'video';
  content: string;
  title?: string;
  image: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  price?: number;
  currency?: string;
  category?: string;
  likes: number;
  comments: number;
  views: number;
  shares: number;
  authorName: string;
  authorAvatar: string;
  createdAt: string;
}

export const MarketPulsePage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, adsRes, videosRes] = await Promise.all([
        api.getPosts({ limit: 20 }).catch(() => ({ posts: [] })),
        api.getMarketListings({ limit: 20 }).catch(() => ({ listings: [] })),
        api.getMarketLiveFeed(undefined, 1, 20).catch(() => ({ videos: [] })),
      ]);

      const allItems: TopItem[] = [];

      // Top posts
      const posts = (postsRes as any)?.posts || (postsRes as any) || [];
      posts.forEach((p: any) => {
        if (p.type !== 'ad' && p.status !== 'deleted') {
          let img = '';
          try { const parsed = JSON.parse(p.image || '[]'); img = Array.isArray(parsed) ? parsed[0] || '' : p.image || ''; } catch { img = p.image || ''; }
          allItems.push({
            id: p.id,
            type: 'post' as const,
            content: p.content || '',
            image: img,
            likes: p.likes || 0,
            comments: p.comments || 0,
            views: p.reachCount || p.views || 0,
            shares: p.shares || 0,
            authorName: p.author?.name || '',
            authorAvatar: p.author?.avatar || '',
            createdAt: p.timestamp || p.created_at || '',
          });
        }
      });

      // Top ads
      const ads = (adsRes as any)?.listings || (adsRes as any) || [];
      ads.forEach((a: any) => {
        let img = '';
        try { const parsed = JSON.parse(a.images || '[]'); img = Array.isArray(parsed) ? parsed[0] || '' : ''; } catch {}
        allItems.push({
          id: a.id,
          type: 'ad' as const,
          content: a.title || a.description || '',
          title: a.title,
          image: img,
          price: a.price,
          currency: a.currency || 'ج.م',
          category: a.category,
          likes: a.saves_count || 0,
          comments: a.inquiries_count || 0,
          views: a.views_count || 0,
          shares: 0,
          authorName: a.seller?.name || '',
          authorAvatar: a.seller?.avatar || '',
          createdAt: a.created_at || '',
        });
      });

      // Top videos
      const videos = (videosRes as any)?.videos || [];
      videos.forEach((v: any) => {
        allItems.push({
          id: v.id,
          type: 'video' as const,
          content: v.description || v.content || '',
          image: v.thumbnailUrl || v.imageUrl || '',
          videoUrl: v.videoUrl,
          thumbnailUrl: v.thumbnailUrl,
          likes: v.likes || 0,
          comments: 0,
          views: v.views || 0,
          shares: v.shares || 0,
          authorName: v.authorName || v.author_name || '',
          authorAvatar: v.authorAvatar || v.author_avatar || '',
          createdAt: v.createdAt || v.created_at || '',
        });
      });

      // Sort by engagement score: likes*2 + comments*3 + views*0.1 + shares*2
      allItems.sort((a, b) => {
        const scoreA = a.likes * 2 + a.comments * 3 + a.views * 0.1 + a.shares * 2;
        const scoreB = b.likes * 2 + b.comments * 3 + b.views * 0.1 + b.shares * 2;
        return scoreB - scoreA;
      });

      setItems(allItems);
    } catch (err) {
      toast.error('فشل تحميل نبض السوق');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredItems = items.filter(item => {
    if (activeTab === 'all') return true;
    return item.type === activeTab;
  });

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';

  const typeIcon = (type: string) => {
    if (type === 'ad') return <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />;
    if (type === 'video') return <Video className="w-3.5 h-3.5 text-red-500" />;
    return <FileText className="w-3.5 h-3.5 text-blue-500" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'ad') return 'إعلان';
    if (type === 'video') return 'فيديو';
    return 'منشور';
  };

  const handleItemClick = (item: TopItem) => {
    if (item.type === 'ad') navigate(`/market/listing/${item.id}`);
    else if (item.type === 'video') navigate('/market-live');
    else navigate(`/post/${item.id}`);
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'all', label: 'الكل', icon: <Flame className="w-3.5 h-3.5" />, count: items.length },
    { id: 'posts', label: 'منشورات', icon: <FileText className="w-3.5 h-3.5" />, count: items.filter(i => i.type === 'post').length },
    { id: 'ads', label: 'إعلانات', icon: <ShoppingBag className="w-3.5 h-3.5" />, count: items.filter(i => i.type === 'ad').length },
    { id: 'videos', label: 'فيديوهات', icon: <Video className="w-3.5 h-3.5" />, count: items.filter(i => i.type === 'video').length },
  ];

  return (
    <div className="w-full max-w-md lg:max-w-2xl xl:max-w-4xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 px-1">
        <button
          onClick={() => navigate('/')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-xl font-black flex items-center gap-2 ${textPrimary}`}>
            <TrendingUp className="w-5 h-5 text-orange-500" />
            نبض السوق
          </h1>
          <p className={`text-[10px] ${textMuted}`}>الأكثر تفاعلاً اليوم</p>
        </div>
        <button
          onClick={loadData}
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
        >
          <RefreshCw className={`w-4 h-4 ${textMuted}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: darkMode ? '#1F2937' : '#F3F4F6' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === tab.id
                ? darkMode ? 'text-white' : 'text-gray-900'
                : darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="pulseTabBg"
                className={`absolute inset-0 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-white'} shadow-sm`}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                {tab.count}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className={`rounded-2xl border p-8 text-center ${cardBg}`}>
          <TrendingUp className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-sm font-bold ${textMuted}`}>لا يوجد محتوى بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, idx) => (
              <motion.div
                key={`${item.type}-${item.id}`}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => handleItemClick(item)}
                className={`rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg ${cardBg}`}
              >
                <div className="flex gap-3 p-3">
                  {/* Image/Video thumbnail */}
                  <div className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    {item.image || item.thumbnailUrl ? (
                      <img
                        src={item.image || item.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {item.type === 'video' ? <Video className="w-6 h-6 text-gray-500" /> :
                         item.type === 'ad' ? <ShoppingBag className="w-6 h-6 text-gray-500" /> :
                         <FileText className="w-6 h-6 text-gray-500" />}
                      </div>
                    )}
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                    )}
                    {/* Rank badge */}
                    <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[9px] font-black">
                      #{idx + 1}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {typeIcon(item.type)}
                      <span className={`text-[9px] font-bold ${textMuted}`}>{typeLabel(item.type)}</span>
                      {item.price ? (
                        <span className="text-[10px] font-black text-orange-500 mr-auto">
                          {Number(item.price).toLocaleString('ar-EG')} {item.currency || 'ج.م'}
                        </span>
                      ) : null}
                    </div>
                    <p className={`text-xs font-bold line-clamp-2 mb-1.5 ${textPrimary}`}>
                      {item.content || 'بدون وصف'}
                    </p>
                    {/* Author */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <img
                        src={item.authorAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.authorName}`}
                        alt=""
                        className="w-4 h-4 rounded-full"
                      />
                      <span className={`text-[10px] ${textMuted}`}>{item.authorName || 'مستخدم'}</span>
                    </div>
                    {/* Stats */}
                    <div className="flex items-center gap-3 text-[10px] font-bold" style={{ color: textMuted.includes('gray-400') ? '#9CA3AF' : '#6B7280' }}>
                      <span className="flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> {(item.likes || 0).toLocaleString('ar-EG')}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="w-3 h-3" /> {(item.comments || 0).toLocaleString('ar-EG')}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Eye className="w-3 h-3" /> {(item.views || 0).toLocaleString('ar-EG')}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
