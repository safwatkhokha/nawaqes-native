import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Trash2, Ban, Flag } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo } from './helpers';
import { ReportItem } from './types';
import { Badge, Btn, EmptyState } from './shared';

interface ReportsTabProps {
  reports: ReportItem[];
  setReports: React.Dispatch<React.SetStateAction<ReportItem[]>>;
  darkMode: boolean;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ reports, setReports, darkMode }) => {
  const { t } = useTranslation();

  const reportAction = async (reportId: string, action: string) => {
    try { await adminFetch('POST', `/admin/reports/${reportId}/action`, { action }); setReports(prev => prev.filter(r => r.id !== reportId)); toast.success(t('admin.actionExecuted')); } catch { toast.error(t('admin.actionFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <Badge darkMode={darkMode} color="red">{t('admin.reportsCount', { count: reports.length })}</Badge>
      </div>
      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {reports.map(r => (
          <div key={r.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 ${darkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-500'} rounded-xl flex items-center justify-center shrink-0`}><AlertTriangle className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{r.userName || t('admin.unknown')}</span>
                  <Badge darkMode={darkMode} color="red">{r.reason || t('admin.violatingContent')}</Badge>
                  <Badge darkMode={darkMode} color={r.status === 'flagged' ? 'orange' : 'gray'}>{r.status}</Badge>
                </div>
                <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.postContent}</p>
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{r.createdAt ? formatTimeAgo(r.createdAt) : ''}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'dismiss')}><Check className="w-3 h-3" />{t('admin.rejectBtn')}</Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'warn_user')}><AlertTriangle className="w-3 h-3" />{t('admin.warn')}</Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'delete_post')}><Trash2 className="w-3 h-3" />{t('common.delete')}</Btn>
                <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => reportAction(r.id, 'ban_user')}><Ban className="w-3 h-3" />{t('admin.ban')}</Btn>
              </div>
            </div>
          </div>
        ))}
        {reports.length === 0 && <EmptyState darkMode={darkMode} icon={<Flag className="w-12 h-12" />} text={t('admin.noReports')} />}
      </div>
    </div>
  );
};
