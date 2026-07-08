import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Star, StarOff, Flag, Package } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { api } from '../../services/api';
import { adminFetch, formatTimeAgo, inputClass, selectClass } from './helpers';
import { Badge, Btn, EmptyState } from './shared';

interface PostsTabProps {
  posts: any[];
  setPosts: React.Dispatch<React.SetStateAction<any[]>>;
  darkMode: boolean;
}

export const PostsTab: React.FC<PostsTabProps> = ({ posts, setPosts, darkMode }) => {
  const { t } = useTranslation();
  const [postSearch, setPostSearch] = useState('');
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'active' | 'flagged'>('all');
  const [postTypeFilter, setPostTypeFilter] = useState<'all' | 'ad' | 'news' | 'status' | 'support' | 'complaint'>('all');

  const filteredPosts = useMemo(() => {
    let r = posts.filter((p: any) => p.content?.includes(postSearch) || p.author_name?.includes(postSearch));
    if (postStatusFilter !== 'all') r = r.filter((p: any) => p.status === postStatusFilter);
    if (postTypeFilter === 'support') r = r.filter((p: any) => p.category === 'support_ticket');
    else if (postTypeFilter === 'complaint') r = r.filter((p: any) => p.category?.startsWith('complaint_'));
    else if (postTypeFilter !== 'all') r = r.filter((p: any) => p.type === postTypeFilter);
    return r;
  }, [posts, postSearch, postStatusFilter, postTypeFilter]);

  const deletePost = async (postId: string) => {
    if (!confirm(t('admin.confirmDeletePost'))) return;
    try { await api.deletePost(postId); setPosts(prev => prev.filter((p: any) => p.id !== postId)); toast.success(t('admin.postDeleted')); } catch { toast.error(t('admin.postDeleteFailed')); }
  };
  const featurePostHandler = async (postId: string) => {
    try { await adminFetch('PUT', `/admin/posts/${postId}/feature`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, is_featured: true } : p)); toast.success(t('admin.postFeatured')); } catch { toast.error(t('admin.postFeatureFailed')); }
  };
  const removeFeature = async (postId: string) => {
    try { await adminFetch('DELETE', `/admin/posts/${postId}/feature`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, is_featured: false } : p)); toast.success(t('admin.postUnfeatured')); } catch { toast.error(t('admin.postUnfeatureFailed')); }
  };
  const flagPostHandler = async (postId: string) => {
    try { await adminFetch('PATCH', `/admin/posts/${postId}/flag`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, status: 'flagged' } : p)); toast.success(t('admin.postFlagged')); } catch { toast.error(t('admin.postFlagFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" />
          <input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder={t('admin.searchPosts')} className={inputClass(darkMode) + ' pr-10'} />
        </div>
        <select value={postStatusFilter} onChange={e => setPostStatusFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('admin.allStatuses')}</option><option value="active">{t('admin.active')}</option><option value="flagged">{t('admin.flagged')}</option>
        </select>
        <select value={postTypeFilter} onChange={e => setPostTypeFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('admin.allTypes')}</option><option value="ad">{t('admin.ad')}</option><option value="news">{t('admin.news')}</option><option value="status">{t('admin.statusType')}</option><option value="support">{t('admin.support')}</option><option value="complaint">{t('admin.complaints')}</option>
        </select>
      </div>
      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredPosts.map((p: any) => (
          <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <img src={p.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.author_id}`} alt="" className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.author_name || t('admin.unknown')}</span>
                  {p.status === 'flagged' && <Badge darkMode={darkMode} color="red">{t('admin.flagged')}</Badge>}
                  {p.is_featured && <Badge darkMode={darkMode} color="orange">{t('admin.featured')}</Badge>}
                  {p.is_promoted && <Badge darkMode={darkMode} color="purple">{t('admin.promoted')}</Badge>}
                  <Badge darkMode={darkMode} color={p.type === 'ad' ? 'orange' : p.type === 'news' ? 'blue' : 'green'}>
                    {p.type === 'ad' ? t('admin.ad') : p.type === 'news' ? t('admin.news') : t('admin.statusType')}
                  </Badge>
                </div>
                <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{p.content}</p>
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{p.created_at ? formatTimeAgo(p.created_at) : ''}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!p.is_featured && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => featurePostHandler(p.id)} title={t('admin.feature')}><Star className="w-3 h-3" /></Btn>}
                {p.is_featured && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => removeFeature(p.id)} title={t('admin.unfeature')}><StarOff className="w-3 h-3" /></Btn>}
                {p.status !== 'flagged' && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => flagPostHandler(p.id)} title={t('admin.flag')}><Flag className="w-3 h-3" /></Btn>}
                <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deletePost(p.id)}><Trash2 className="w-3 h-3" /></Btn>
              </div>
            </div>
          </div>
        ))}
        {filteredPosts.length === 0 && <EmptyState darkMode={darkMode} icon={<Package className="w-12 h-12" />} text={t('admin.noPosts')} />}
      </div>
    </div>
  );
};
