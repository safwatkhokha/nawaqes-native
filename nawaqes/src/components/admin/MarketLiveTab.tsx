import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Star, Eye, Heart, Video, Play, EyeOff, Film, TrendingUp } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo } from './helpers';
import { Badge, EmptyState } from './shared';

interface MarketLiveVideo {
  id: string;
  video_url: string;
  thumbnail_url: string;
  duration: number;
  views: number;
  likes: number;
  shares: number;
  saves: number;
  is_featured: number;
  status: string;
  created_at: string;
  author_name: string;
  author_avatar: string;
  avatar_base64: string;
  linked_title: string;
  view_count: number;
  like_count: number;
  save_count: number;
}

interface MarketLiveStats {
  total: number;
  active: number;
  featured: number;
  totalViews: number;
  totalLikes: number;
}

interface MarketLiveTabProps {
  darkMode: boolean;
}

export const MarketLiveTab: React.FC<MarketLiveTabProps> = ({ darkMode }) => {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<MarketLiveVideo[]>([]);
  const [stats, setStats] = useState<MarketLiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'hidden' | 'featured'>('all');

  const loadVideos = async () => {
    try {
      setLoading(true);
      const data = await adminFetch('GET', '/admin/market-live');
      setVideos(data.videos || []);
      setStats(data.stats || null);
    } catch (err: any) {
      toast.error('فشل تحميل الفيديوهات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVideos(); }, []);

  const handleToggleFeature = async (videoId: string, currentFeatured: boolean) => {
    try {
      await adminFetch('PATCH', `/admin/market-live/${videoId}/feature`);
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, is_featured: currentFeatured ? 0 : 1 } : v));
      toast.success(currentFeatured ? 'تم إزالة التمييز' : 'تم تمييز الفيديو ⭐');
    } catch {
      toast.error('فشل تحديث التمييز');
    }
  };

  const handleToggleStatus = async (videoId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'hidden' : 'active';
    try {
      await adminFetch('PATCH', `/admin/market-live/${videoId}/status`, { status: newStatus });
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, status: newStatus } : v));
      toast.success(newStatus === 'active' ? 'تم إظهار الفيديو' : 'تم إخفاء الفيديو');
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الفيديو؟ سيتم حذفه نهائياً.')) return;
    try {
      await adminFetch('DELETE', `/admin/market-live/${videoId}`);
      // Remove from local state + update stats
      setVideos(prev => {
        const filtered = prev.filter(v => v.id !== videoId);
        setStats(s => s ? {
          ...s,
          total: filtered.length,
          active: filtered.filter(v => v.status === 'active').length,
          featured: filtered.filter(v => v.is_featured).length,
          totalViews: filtered.reduce((sum, v) => sum + (v.views || v.view_count || 0), 0),
          totalLikes: filtered.reduce((sum, v) => sum + (v.likes || v.like_count || 0), 0),
        } : null);
        return filtered;
      });
      toast.success('تم حذف الفيديو');
    } catch (err: any) {
      toast.error('فشل حذف الفيديو: ' + (err.message || ''));
    }
  };

  const filteredVideos = videos.filter(v => {
    if (filter === 'all') return true;
    if (filter === 'featured') return v.is_featured;
    return v.status === filter;
  });

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Badge darkMode={darkMode} color="orange">🎬 سوق لايف — {videos.length} فيديو</Badge>
        <button onClick={loadVideos} className={`text-xs px-3 py-1.5 rounded-lg font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          تحديث
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Film className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.total}</p>
            <p className={`text-[10px] ${textMuted}`}>إجمالي</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Play className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.active}</p>
            <p className={`text-[10px] ${textMuted}`}>نشط</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Star className="w-5 h-5 mx-auto mb-1 text-amber-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.featured}</p>
            <p className={`text-[10px] ${textMuted}`}>مميز</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Eye className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.totalViews}</p>
            <p className={`text-[10px] ${textMuted}`}>مشاهدات</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Heart className="w-5 h-5 mx-auto mb-1 text-red-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.totalLikes}</p>
            <p className={`text-[10px] ${textMuted}`}>إعجابات</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'الكل', count: videos.length },
          { id: 'active', label: 'نشط', count: videos.filter(v => v.status === 'active').length },
          { id: 'hidden', label: 'مخفي', count: videos.filter(v => v.status === 'hidden').length },
          { id: 'featured', label: 'مميز', count: videos.filter(v => v.is_featured).length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filter === f.id
                ? 'bg-orange-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Videos */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredVideos.length === 0 ? (
        <EmptyState darkMode={darkMode} icon={<Video className="w-12 h-12" />} text="لا توجد فيديوهات" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[calc(100vh-300px)] overflow-y-auto">
          {filteredVideos.map(v => (
            <div key={v.id} className={`${cardBg} rounded-2xl border overflow-hidden`}>
              {/* Video Preview */}
              <div className={`relative aspect-video ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                {v.video_url ? (
                  <video
                    src={v.video_url}
                    poster={v.thumbnail_url || undefined}
                    className="w-full h-full object-contain"
                    controls
                    muted
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className={`w-10 h-10 ${darkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                  </div>
                )}
                {/* Badges */}
                <div className="absolute top-2 right-2 flex gap-1">
                  {v.is_featured ? (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-current" /> مميز
                    </span>
                  ) : null}
                  {v.status !== 'active' && (
                    <span className="px-2 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-black">
                      {v.status === 'hidden' ? 'مخفي' : 'محذوف'}
                    </span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <img
                    src={v.avatar_base64 || v.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.author_name}`}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${textPrimary}`}>{v.author_name || 'مستخدم'}</p>
                    <p className={`text-[10px] ${textMuted}`}>{formatTimeAgo(v.created_at)}</p>
                  </div>
                </div>

                {v.linked_title && (
                  <p className={`text-xs ${textMuted} line-clamp-2`}>{v.linked_title}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-3 text-[10px] ${textMuted}">
                  <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" /> {v.views || v.view_count || 0}</span>
                  <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" /> {v.likes || v.like_count || 0}</span>
                  <span className="flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> {v.shares || 0}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => handleToggleFeature(v.id, !!v.is_featured)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 ${
                      v.is_featured
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={v.is_featured ? 'إزالة التمييز' : 'تمييز'}
                  >
                    <Star className="w-3 h-3" />
                    {v.is_featured ? 'مميز' : 'تمييز'}
                  </button>
                  <button
                    onClick={() => handleToggleStatus(v.id, v.status)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 ${
                      v.status === 'active'
                        ? 'bg-gray-500 text-white hover:bg-gray-600'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                    title={v.status === 'active' ? 'إخفاء' : 'إظهار'}
                  >
                    {v.status === 'active' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {v.status === 'active' ? 'إخفاء' : 'إظهار'}
                  </button>
                  <button
                    onClick={() => handleDelete(v.id)}
                    className="py-1.5 px-2 rounded-lg bg-red-500 text-white hover:bg-red-600 text-[10px] font-bold"
                    title="حذف"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
