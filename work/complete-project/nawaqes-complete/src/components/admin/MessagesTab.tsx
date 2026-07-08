import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, MessageSquare } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo, inputClass } from './helpers';
import { ChatMessageItem } from './types';
import { Btn, EmptyState } from './shared';

interface MessagesTabProps {
  chatMessages: ChatMessageItem[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessageItem[]>>;
  darkMode: boolean;
}

export const MessagesTab: React.FC<MessagesTabProps> = ({ chatMessages, setChatMessages, darkMode }) => {
  const { t } = useTranslation();
  const [msgSearch, setMsgSearch] = useState('');

  const filteredMessages = useMemo(
    () => !msgSearch ? chatMessages : chatMessages.filter(m => m.text?.includes(msgSearch) || m.sender_name?.includes(msgSearch) || m.receiver_name?.includes(msgSearch)),
    [chatMessages, msgSearch]
  );

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm(t('admin.confirmDeleteMessage'))) return;
    try { await adminFetch('DELETE', `/admin/chat-messages/${msgId}`); setChatMessages(prev => prev.filter(m => m.id !== msgId)); toast.success(t('admin.messageDeleted')); } catch { toast.error(t('admin.messageDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" />
        <input value={msgSearch} onChange={e => setMsgSearch(e.target.value)} placeholder={t('admin.searchMessages')} className={inputClass(darkMode) + ' pr-10'} />
      </div>
      <div className="grid gap-2 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredMessages.map(m => (
          <div key={m.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
            <div className={`w-8 h-8 ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-500'} rounded-lg flex items-center justify-center shrink-0`}><MessageSquare className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{m.sender_name}</span>
                <span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>←</span>
                <span className={`font-bold text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{m.receiver_name}</span>
              </div>
              <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{m.text}</p>
              <p className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{m.created_at ? formatTimeAgo(m.created_at) : ''}</p>
            </div>
            <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteMessage(m.id)}><Trash2 className="w-3 h-3" /></Btn>
          </div>
        ))}
        {filteredMessages.length === 0 && <EmptyState darkMode={darkMode} icon={<MessageSquare className="w-12 h-12" />} text={t('admin.noMessages')} />}
      </div>
    </div>
  );
};
