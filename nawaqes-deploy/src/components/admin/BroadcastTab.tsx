import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Send, RefreshCw } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, inputClass } from './helpers';
import { Btn } from './shared';

interface BroadcastTabProps {
  darkMode: boolean;
}

export const BroadcastTab: React.FC<BroadcastTabProps> = ({ darkMode }) => {
  const { t } = useTranslation();
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'system' | 'alert' | 'promotion'>('system');
  const [broadcastSending, setBroadcastSending] = useState(false);

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) { toast.error(t('admin.enterBroadcastMessage')); return; }
    setBroadcastSending(true);
    try {
      const result = await adminFetch('POST', '/admin/broadcast', { title: broadcastTitle.trim(), message: broadcastMessage.trim(), type: broadcastType });
      toast.success(t('admin.broadcastSent', { count: (result as any).count || 0 }));
      setBroadcastTitle(''); setBroadcastMessage('');
    } catch { toast.error(t('admin.broadcastFailed')); }
    finally { setBroadcastSending(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-4`}>
        <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <Radio className="w-4 h-4 text-orange-500" />{t('admin.sendBroadcast')}
        </h3>
        <div className="flex gap-2">
          {(['system', 'alert', 'promotion'] as const).map(type => (
            <button key={type} onClick={() => setBroadcastType(type)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${broadcastType === type ? 'bg-orange-500 text-white shadow-sm' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
              {type === 'system' ? t('admin.type_system') : type === 'alert' ? t('admin.type_alert') : t('admin.type_promotion')}
            </button>
          ))}
        </div>
        <input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder={t('admin.broadcastTitle')} className={inputClass(darkMode)} />
        <textarea value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} placeholder={t('admin.broadcastMessage')} rows={4} className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
        <div className="flex justify-end">
          <Btn darkMode={darkMode} variant="primary" size="md" onClick={handleBroadcast} disabled={broadcastSending}>
            {broadcastSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {broadcastSending ? t('admin.sending') : t('admin.sendToAll')}
          </Btn>
        </div>
      </div>
    </div>
  );
};
