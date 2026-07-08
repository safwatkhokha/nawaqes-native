import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo } from './helpers';
import { StoryItem } from './types';
import { Badge, Btn, EmptyState } from './shared';

interface StoriesTabProps {
  adminStories: StoryItem[];
  setAdminStories: React.Dispatch<React.SetStateAction<StoryItem[]>>;
  darkMode: boolean;
}

export const StoriesTab: React.FC<StoriesTabProps> = ({ adminStories, setAdminStories, darkMode }) => {
  const { t } = useTranslation();
  const handleDeleteStory = async (storyId: string) => {
    if (!confirm(t('admin.confirmDeleteStory'))) return;
    try { await adminFetch('DELETE', `/admin/stories/${storyId}`); setAdminStories(prev => prev.filter(s => s.id !== storyId)); toast.success(t('admin.storyDeleted')); } catch { toast.error(t('admin.storyDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <Badge darkMode={darkMode} color="orange">{t('admin.storiesLabel')} {adminStories.length}</Badge>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {adminStories.map(s => (
          <div key={s.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border overflow-hidden group`}>
            <div className={`aspect-[9/16] ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} relative`}>
              {s.image ? <img src={s.image} alt="" className="w-full h-full object-cover" /> : <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}><ImageIcon className="w-8 h-8" /></div>}
              <button onClick={() => handleDeleteStory(s.id)} className="absolute top-2 left-2 w-7 h-7 bg-red-500/80 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-2">
              <p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{s.user_name}</p>
              <p className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{s.created_at ? formatTimeAgo(s.created_at) : ''}</p>
            </div>
          </div>
        ))}
        {adminStories.length === 0 && <EmptyState darkMode={darkMode} icon={<ImageIcon className="w-12 h-12" />} text={t('admin.noStories')} />}
      </div>
    </div>
  );
};
