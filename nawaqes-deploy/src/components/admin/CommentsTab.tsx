import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, MessageCircle, Trash2 } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo, inputClass } from './helpers';
import { CommentItem } from './types';
import { Badge, Btn, EmptyState } from './shared';

interface CommentsTabProps {
  adminComments: CommentItem[];
  setAdminComments: React.Dispatch<React.SetStateAction<CommentItem[]>>;
  darkMode: boolean;
}

export const CommentsTab: React.FC<CommentsTabProps> = ({ adminComments, setAdminComments, darkMode }) => {
  const { t } = useTranslation();
  const [commentSearch, setCommentSearch] = useState('');

  const filteredComments = useMemo(
    () => !commentSearch ? adminComments : adminComments.filter(c => c.content?.includes(commentSearch) || c.author_name?.includes(commentSearch)),
    [adminComments, commentSearch]
  );

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm(t('admin.confirmDeleteComment'))) return;
    try {
      await adminFetch('DELETE', `/admin/comments/${commentId}`);
      setAdminComments(prev => prev.filter(c => c.id !== commentId));
      toast.success(t('admin.commentDeleted'));
    } catch { toast.error(t('admin.commentDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" />
        <input value={commentSearch} onChange={e => setCommentSearch(e.target.value)} placeholder={t('admin.searchComments')} className={inputClass(darkMode) + ' pr-10'} />
      </div>
      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredComments.map(c => (
          <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <img src={c.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`} alt="" className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.author_name}</span>
                  {c.author_verified && <Badge darkMode={darkMode} color="green">{t('admin.verified')}</Badge>}
                </div>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{c.content}</p>
                {c.post_content && <p className={`text-[10px] mt-1 rounded-lg p-2 line-clamp-1 ${darkMode ? 'text-gray-500 bg-gray-700' : 'text-gray-300 bg-gray-50'}`}>{t('admin.on')} {c.post_content}</p>}
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{c.created_at ? formatTimeAgo(c.created_at) : ''}</p>
              </div>
              <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteComment(c.id)}><Trash2 className="w-3 h-3" /></Btn>
            </div>
          </div>
        ))}
        {filteredComments.length === 0 && <EmptyState darkMode={darkMode} icon={<MessageCircle className="w-12 h-12" />} text={t('admin.noComments')} />}
      </div>
    </div>
  );
};
