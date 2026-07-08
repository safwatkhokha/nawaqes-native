import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Layers, HardDrive, Wrench, Clock, Zap, Trash2, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch } from './helpers';
import { DatabaseInfo } from './types';
import { StatCard, Section, Btn } from './shared';

interface DatabaseTabProps {
  dbInfo: DatabaseInfo | null;
  loadDatabaseInfo: () => void;
  darkMode: boolean;
}

export const DatabaseTab: React.FC<DatabaseTabProps> = ({ dbInfo, loadDatabaseInfo, darkMode }) => {
  const { t } = useTranslation();
  const [cleanupRunning, setCleanupRunning] = useState(false);

  const handleCleanup = async (action: string) => {
    setCleanupRunning(true);
    try {
      const result = await adminFetch('POST', '/admin/cleanup', { action });
      toast.success((result as any).message || t('admin.cleanupSuccess'));
      loadDatabaseInfo();
    } catch { toast.error(t('admin.cleanupFailed')); }
    finally { setCleanupRunning(false); }
  };

  return (
    <div className="space-y-6">
      {dbInfo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard darkMode={darkMode} icon={<Database className="w-5 h-5" />} label={t('admin.dbSize')} value={dbInfo.dbSizeFormatted} color="#8b5cf6" />
          <StatCard darkMode={darkMode} icon={<Layers className="w-5 h-5" />} label={t('admin.dbTables')} value={dbInfo.totalTables} color="#06b6d4" />
          <StatCard darkMode={darkMode} icon={<HardDrive className="w-5 h-5" />} label={t('admin.dbSizeBytes')} value={dbInfo.dbSize.toLocaleString()} color="#10b981" />
        </div>
      )}

      {dbInfo?.tables && (
        <Section darkMode={darkMode} title={t('admin.dbTableSizes')} icon={<Database className="w-5 h-5" />}>
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {Object.entries(dbInfo.tables).sort(([, a], [, b]) => (b as number) - (a as number)).map(([table, count]) => (
              <div key={table} className="flex items-center gap-3">
                <span className={`text-xs font-bold w-32 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{table}</span>
                <div className={`flex-1 rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full bg-gradient-to-l from-orange-400 to-orange-500" style={{ width: `${Math.min(100, ((count as number) / Math.max(...Object.values(dbInfo.tables))) * 100)}%` }} />
                </div>
                <span className={`text-xs font-bold w-16 text-left ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{count as number}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section darkMode={darkMode} title={t('admin.cleanupOperations')} icon={<Wrench className="w-5 h-5" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { action: 'sessions', label: t('admin.cleanupSessions'), icon: <Clock className="w-4 h-4" />, desc: t('admin.cleanupSessionsDesc') },
            { action: 'expired_promotions', label: t('admin.cleanupExpiredPromos'), icon: <Zap className="w-4 h-4" />, desc: t('admin.cleanupExpiredPromosDesc') },
            { action: 'old_stories', label: t('admin.cleanupOldStories'), icon: <ImageIcon className="w-4 h-4" />, desc: t('admin.cleanupOldStoriesDesc') },
            { action: 'orphan_data', label: t('admin.cleanupOrphanData'), icon: <Trash2 className="w-4 h-4" />, desc: t('admin.cleanupOrphanDataDesc') },
            { action: 'optimize', label: t('admin.cleanupOptimize'), icon: <Wrench className="w-4 h-4" />, desc: t('admin.cleanupOptimizeDesc') },
          ].map(item => (
            <div key={item.action} className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-4 space-y-2`}>
              <div className="flex items-center gap-2">
                <span className="text-orange-500">{item.icon}</span>
                <span className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{item.label}</span>
              </div>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{item.desc}</p>
              <Btn darkMode={darkMode} variant="outline" size="sm" disabled={cleanupRunning} onClick={() => { if (confirm(`${t('admin.confirmCleanup')} ${item.label}؟`)) handleCleanup(item.action); }}>
                {cleanupRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}{t('admin.execute')}
              </Btn>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};
