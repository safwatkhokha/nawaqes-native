import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Phone as PhoneIcon, Globe } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { api } from '../../services/api';
import { formatTimeAgo, inputClass, selectClass } from './helpers';
import { Badge, Btn, EmptyState } from './shared';

interface SupportTabProps {
  posts: any[];
  setPosts: React.Dispatch<React.SetStateAction<any[]>>;
  darkMode: boolean;
  navigate: (path: string) => void;
}

export const SupportTab: React.FC<SupportTabProps> = ({ posts, setPosts, darkMode }) => {
  const { t } = useTranslation();
  const [supportFilter, setSupportFilter] = useState<'all' | 'support' | 'complaint'>('all');
  const [postSearch, setPostSearch] = useState('');

  const filteredPosts = useMemo(() => {
    return posts
      .filter((p: any) => {
        if (supportFilter === 'support') return p.category === 'support_ticket';
        if (supportFilter === 'complaint') return p.category?.startsWith('complaint_');
        return p.category === 'support_ticket' || p.category?.startsWith('complaint_');
      })
      .filter((p: any) => !postSearch || p.content?.includes(postSearch) || p.author_name?.includes(postSearch) || p.sender_phone?.includes(postSearch) || p.author_phone?.includes(postSearch));
  }, [posts, supportFilter, postSearch]);

  const supportCount = posts.filter((p: any) => p.category === 'support_ticket').length;
  const complaintCount = posts.filter((p: any) => p.category?.startsWith('complaint_')).length;
  const totalCount = posts.filter((p: any) => p.category === 'support_ticket' || p.category?.startsWith('complaint_')).length;

  const deletePost = async (postId: string) => {
    if (!confirm(t('admin.confirmDeletePost'))) return;
    try { await api.deletePost(postId); setPosts(prev => prev.filter((p: any) => p.id !== postId)); toast.success(t('admin.postDeleted')); } catch { toast.error(t('admin.postDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" />
          <input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder={t('admin.searchSupport')} className={inputClass(darkMode) + ' pr-10'} />
        </div>
        <select value={supportFilter} onChange={e => setSupportFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('common.all')} ({totalCount})</option>
          <option value="support">{t('admin.support')} ({supportCount})</option>
          <option value="complaint">{t('admin.complaints')} ({complaintCount})</option>
        </select>
      </div>

      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredPosts.map((p: any) => (
          <div key={p.id} className={`rounded-2xl border p-4 ${
            p.category === 'support_ticket'
              ? (darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50/50 border-blue-200')
              : (darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50/50 border-red-200')
          }`}>
            <div className="flex items-start gap-3">
              <img src={p.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.author_id}`} alt="" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.author_name || t('admin.unknown')}</span>
                  {p.category === 'support_ticket' && <Badge darkMode={darkMode} color="blue">{t('admin.support')}</Badge>}
                  {p.category?.startsWith('complaint_') && <Badge darkMode={darkMode} color="red">{t('admin.complaint')}</Badge>}
                  {p.category === 'complaint_user' && <Badge darkMode={darkMode} color="orange">{t('admin.cat_user')}</Badge>}
                  {p.category === 'complaint_ad' && <Badge darkMode={darkMode} color="orange">{t('admin.cat_ad')}</Badge>}
                  {p.category === 'complaint_payment' && <Badge darkMode={darkMode} color="green">{t('admin.payment')}</Badge>}
                  {p.category === 'complaint_chat' && <Badge darkMode={darkMode} color="purple">{t('admin.chat')}</Badge>}
                  {p.category === 'complaint_other' && <Badge darkMode={darkMode} color="gray">{t('admin.cat_other')}</Badge>}
                </div>
                {/* Phone number */}
                {(p.sender_phone || p.author_phone) ? (
                  <div className={`mt-2 inline-flex items-center gap-2 border-2 rounded-xl px-3 py-1.5 shadow-sm ${darkMode ? 'bg-gray-700 border-blue-600' : 'bg-white border-blue-300'}`}>
                    <PhoneIcon className="w-4 h-4 text-blue-600" />
                    <span className={`text-sm font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{p.sender_phone || p.author_phone}</span>
                    <a href={`tel:${p.sender_phone || p.author_phone}`} className="text-[10px] text-white bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded-lg font-bold transition-colors">{t('admin.call')}</a>
                    <a href={`https://wa.me/${(p.sender_phone || p.author_phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white bg-green-500 hover:bg-green-600 px-2 py-0.5 rounded-lg font-bold transition-colors">{t('admin.whatsapp')}</a>
                  </div>
                ) : (
                  <div className={`mt-2 inline-flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-100 border-red-300'}`}>
                    <PhoneIcon className="w-4 h-4 text-red-500" />
                    <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-700'}`}>{t('admin.noPhoneNumber')}</span>
                  </div>
                )}
                <p className={`text-sm mt-2 whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{p.content}</p>
                {p.image && (
                  <div className="mt-2">
                    <img src={p.image} alt={t('admin.attachment')} className={`max-w-[200px] max-h-[150px] rounded-xl border object-cover ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <p className={`text-[10px] mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.created_at ? formatTimeAgo(p.created_at) : ''}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deletePost(p.id)}><Trash2 className="w-3 h-3" /></Btn>
              </div>
            </div>
          </div>
        ))}
        {filteredPosts.length === 0 && <EmptyState darkMode={darkMode} icon={<PhoneIcon className="w-12 h-12" />} text={t('admin.noSupportMessages')} />}
      </div>
    </div>
  );
};
