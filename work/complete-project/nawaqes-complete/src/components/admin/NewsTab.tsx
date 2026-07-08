import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, AlertTriangle, Newspaper } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { NewsItem } from '../../types';
import { adminFetch, formatTimeAgo, inputClass } from './helpers';
import { Badge, Btn, EmptyState } from './shared';

interface NewsTabProps {
  allNews: any[];
  loadNews: () => void;
  refreshData: () => Promise<void>;
  addAdminAlert: (alert: NewsItem) => void;
  darkMode: boolean;
}

export const NewsTab: React.FC<NewsTabProps> = ({ allNews, loadNews, refreshData, addAdminAlert, darkMode }) => {
  const { t } = useTranslation();
  const [newsFilter, setNewsFilter] = useState<'all' | 'egypt' | 'world' | 'urgent' | 'general'>('all');
  const [newsForm, setNewsForm] = useState({ title: '', content: '', source: t('app.nameAr'), category: 'general' as 'egypt' | 'world' | 'urgent' | 'general', isAlert: false });

  const filteredNews = useMemo(
    () => newsFilter === 'all' ? allNews : allNews.filter((n: any) => n.category === newsFilter || ((n as any).is_alert && newsFilter === 'urgent')),
    [allNews, newsFilter]
  );

  const handleAddNews = async () => {
    if (!newsForm.title.trim()) { toast.error(t('admin.enterNewsTitle')); return; }
    try {
      await adminFetch('POST', '/admin/news', { title: newsForm.title.trim(), content: newsForm.content.trim(), source: newsForm.source.trim() || t('app.nameAr'), category: newsForm.category, isAlert: newsForm.isAlert });
      setNewsForm({ title: '', content: '', source: t('app.nameAr'), category: 'general', isAlert: false });
      loadNews(); toast.success(t('admin.newsAdded')); refreshData();
    } catch { toast.error(t('admin.newsAddFailed')); }
  };

  const handleDeleteNews = async (newsId: string) => {
    if (!confirm(t('admin.confirmDeleteNews'))) return;
    try { await adminFetch('DELETE', `/admin/news/${newsId}`); loadNews(); toast.success(t('admin.newsDeleted')); refreshData(); } catch { toast.error(t('admin.newsDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      {/* Add News Form */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-5 space-y-3`}>
        <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <Plus className="w-4 h-4 text-orange-500" />{t('admin.addNewsAlert')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={newsForm.title} onChange={e => setNewsForm(f => ({ ...f, title: e.target.value }))} placeholder={t('admin.newsTitle')} className={inputClass(darkMode)} />
          <div className="flex gap-2">
            <select value={newsForm.category} onChange={e => setNewsForm(f => ({ ...f, category: e.target.value as any }))} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
              <option value="general">{t('admin.cat_general')}</option><option value="egypt">{t('admin.cat_egypt')}</option><option value="world">{t('admin.cat_world')}</option><option value="urgent">{t('admin.cat_urgent')}</option>
            </select>
            <label className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <input type="checkbox" checked={newsForm.isAlert} onChange={e => setNewsForm(f => ({ ...f, isAlert: e.target.checked }))} className="rounded" />{t('admin.alert')}
            </label>
          </div>
        </div>
        <textarea value={newsForm.content} onChange={e => setNewsForm(f => ({ ...f, content: e.target.value }))} placeholder={t('admin.newsContent')} rows={3} className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
        <div className="flex gap-2 justify-end">
          <Btn darkMode={darkMode} variant="primary" onClick={handleAddNews}><Plus className="w-3.5 h-3.5" />{t('admin.add')}</Btn>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'egypt', 'world', 'urgent', 'general'].map(f => (
          <button key={f} onClick={() => setNewsFilter(f as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${newsFilter === f ? 'bg-orange-500 text-white' : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {f === 'all' ? t('common.all') : f === 'egypt' ? t('admin.cat_egypt') : f === 'world' ? t('admin.cat_world') : f === 'urgent' ? t('admin.cat_urgent') : t('admin.cat_general')}
          </button>
        ))}
      </div>

      {/* News List */}
      <div className="grid gap-3 max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
        {filteredNews.map((n: any) => (
          <div key={n.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.is_alert ? (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-500') : (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-500')}`}>
                {n.is_alert ? <AlertTriangle className="w-4 h-4" /> : <Newspaper className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{n.title}</span>
                  {n.is_alert && <Badge darkMode={darkMode} color="red">{t('admin.alert')}</Badge>}
                  <Badge darkMode={darkMode} color={n.category === 'egypt' ? 'orange' : n.category === 'world' ? 'blue' : n.category === 'urgent' ? 'red' : 'gray'}>
                    {n.category === 'egypt' ? t('admin.cat_egypt') : n.category === 'world' ? t('admin.cat_world') : n.category === 'urgent' ? t('admin.cat_urgent') : t('admin.cat_general')}
                  </Badge>
                </div>
                <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{n.content}</p>
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{n.source} • {n.created_at ? formatTimeAgo(n.created_at) : ''}</p>
              </div>
              <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteNews(n.id)}><Trash2 className="w-3 h-3" /></Btn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
