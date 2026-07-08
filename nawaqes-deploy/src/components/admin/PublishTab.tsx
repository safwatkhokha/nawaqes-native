import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Send, Package, Newspaper, MessageCircle } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { api } from '../../services/api';
import { inputClass } from './helpers';
import { Btn } from './shared';

interface PublishTabProps {
  darkMode: boolean;
  refreshData: () => Promise<void>;
}

export const PublishTab: React.FC<PublishTabProps> = ({ darkMode, refreshData }) => {
  const { t } = useTranslation();
  const [adminPostContent, setAdminPostContent] = useState('');
  const [adminPostImage, setAdminPostImage] = useState('');
  const [adminPostType, setAdminPostType] = useState<'ad' | 'news' | 'status'>('news');
  const [adminPostPrice, setAdminPostPrice] = useState('');
  const [adminPostLocation, setAdminPostLocation] = useState('');
  const [adminPostCategory, setAdminPostCategory] = useState('');
  const [adminPostPromoted, setAdminPostPromoted] = useState(false);

  const handlePublishPost = async () => {
    if (!adminPostContent.trim()) { toast.error(t('admin.enterPostContent')); return; }
    try {
      const postData: any = { content: adminPostContent.trim(), type: adminPostType, image: adminPostImage || undefined, isPromoted: adminPostPromoted };
      if (adminPostType === 'ad') { postData.price = parseFloat(adminPostPrice) || 0; postData.location = adminPostLocation; postData.category = adminPostCategory; }
      await api.createPost(postData);
      setAdminPostContent(''); setAdminPostImage(''); setAdminPostPrice(''); setAdminPostLocation(''); setAdminPostCategory(''); setAdminPostPromoted(false);
      toast.success(t('admin.postPublishedSuccess')); refreshData();
    } catch { toast.error(t('admin.postPublishFailed')); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-4`}>
        <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <Plus className="w-4 h-4 text-orange-500" />{t('admin.publishAsAdminTitle')}
        </h3>
        {/* Post Type */}
        <div className="flex gap-2">
          {[
            { type: 'ad' as const, label: t('admin.ad'), icon: <Package className="w-4 h-4" /> },
            { type: 'news' as const, label: t('admin.news'), icon: <Newspaper className="w-4 h-4" /> },
            { type: 'status' as const, label: t('admin.statusType'), icon: <MessageCircle className="w-4 h-4" /> },
          ].map(pt => (
            <button key={pt.type} onClick={() => setAdminPostType(pt.type)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${adminPostType === pt.type ? 'bg-orange-500 text-white shadow-sm' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              {pt.icon}{pt.label}
            </button>
          ))}
        </div>
        <textarea value={adminPostContent} onChange={e => setAdminPostContent(e.target.value)} placeholder={t('admin.postContentPlaceholder')} rows={5} className={`w-full px-4 py-3 rounded-xl border text-sm resize-none focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
        <input value={adminPostImage} onChange={e => setAdminPostImage(e.target.value)} placeholder={t('admin.imageLink')} className={inputClass(darkMode)} />
        {adminPostType === 'ad' && (
          <div className="grid grid-cols-2 gap-3">
            <input value={adminPostPrice} onChange={e => setAdminPostPrice(e.target.value)} type="number" placeholder={t('admin.price')} className={inputClass(darkMode)} />
            <input value={adminPostLocation} onChange={e => setAdminPostLocation(e.target.value)} placeholder={t('admin.location')} className={inputClass(darkMode)} />
          </div>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={adminPostPromoted} onChange={e => setAdminPostPromoted(e.target.checked)} className="rounded" />
          <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('admin.autoPromote')}</span>
        </label>
        <div className="flex justify-end">
          <Btn darkMode={darkMode} variant="primary" size="md" onClick={handlePublishPost}>
            <Send className="w-4 h-4" />{t('admin.publishNow')}
          </Btn>
        </div>
      </div>
    </div>
  );
};
