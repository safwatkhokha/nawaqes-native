import React from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Package, DollarSign, Zap, Flag, Activity } from 'lucide-react';
import { formatTimeAgo } from './helpers';
import { ActivityItem } from './types';
import { Badge, EmptyState } from './shared';

interface ActivityTabProps {
  activityLog: ActivityItem[];
  darkMode: boolean;
}

export const ActivityTab: React.FC<ActivityTabProps> = ({ activityLog, darkMode }) => {
  const { t } = useTranslation();
  const colors: Record<string, string> = { user: 'green', post: 'blue', transaction: 'purple', promotion: 'orange', report: 'red' };
  const icons: Record<string, React.ReactNode> = {
    user: <Users className="w-3.5 h-3.5" />,
    post: <Package className="w-3.5 h-3.5" />,
    transaction: <DollarSign className="w-3.5 h-3.5" />,
    promotion: <Zap className="w-3.5 h-3.5" />,
    report: <Flag className="w-3.5 h-3.5" />,
  };
  const bgColors: Record<string, string> = darkMode ? {
    user: 'bg-green-900/40 text-green-400',
    post: 'bg-blue-900/40 text-blue-400',
    transaction: 'bg-purple-900/40 text-purple-400',
    promotion: 'bg-orange-900/40 text-orange-400',
    report: 'bg-red-900/40 text-red-400',
  } : {
    user: 'bg-green-50 text-green-500',
    post: 'bg-blue-50 text-blue-500',
    transaction: 'bg-purple-50 text-purple-500',
    promotion: 'bg-orange-50 text-orange-500',
    report: 'bg-red-50 text-red-500',
  };

  return (
    <div className="space-y-4">
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar space-y-2">
        {activityLog.map((item, i) => {
          const activityType = item.activity_type || item.type || 'post';
          return (
            <div key={item.id || i} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgColors[activityType] || (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-50 text-gray-500')}`}>
                {icons[activityType] || <Activity className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  <span className="font-bold">{item.user_name || t('admin.unknown')}</span>{' '}
                  {item.content || item.package_name || item.tx_type || ''}{' '}
                  {item.amount ? `• ${item.amount} ${t('common.egp')}` : ''}
                </p>
                <p className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{item.created_at ? formatTimeAgo(item.created_at) : ''}</p>
              </div>
              <Badge darkMode={darkMode} color={colors[activityType] || 'gray'}>{activityType}</Badge>
            </div>
          );
        })}
        {activityLog.length === 0 && <EmptyState darkMode={darkMode} icon={<Activity className="w-12 h-12" />} text={t('admin.noActivity')} />}
      </div>
    </div>
  );
};
