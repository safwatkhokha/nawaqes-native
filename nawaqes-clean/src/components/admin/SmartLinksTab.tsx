import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, MousePointer, Users, TrendingUp, Star } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { StatCard, Section, EmptyState } from './shared';
import { getTooltipStyle, ORANGE } from './helpers';

interface SmartLinksTabProps {
  smartLinksData: any;
  darkMode: boolean;
}

export const SmartLinksTab: React.FC<SmartLinksTabProps> = ({ smartLinksData, darkMode }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard darkMode={darkMode} icon={<Link2 className="w-5 h-5" />} label={t('admin.totalLinks')} value={smartLinksData?.totalLinks || 0} color="#f27d26" />
        <StatCard darkMode={darkMode} icon={<MousePointer className="w-5 h-5" />} label={t('admin.totalVisits')} value={smartLinksData?.totalVisits || 0} color="#10b981" />
        <StatCard darkMode={darkMode} icon={<Users className="w-5 h-5" />} label={t('admin.uniqueVisitors')} value={smartLinksData?.uniqueVisitors || 0} color="#3b82f6" />
      </div>

      {smartLinksData?.visitsByDate?.length > 0 && (
        <Section darkMode={darkMode} title={t('admin.dailyVisits')} icon={<TrendingUp className="w-5 h-5" />}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={smartLinksData.visitsByDate}>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={getTooltipStyle(darkMode)} />
              <Line type="monotone" dataKey="count" stroke={ORANGE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      <Section darkMode={darkMode} title={t('admin.topLinks')} icon={<Star className="w-5 h-5" />}>
        {smartLinksData?.topLinks?.length > 0 ? (
          <div className="space-y-2">
            {smartLinksData.topLinks.map((link: any, i: number) => (
              <div key={i} className={`flex items-center gap-3 p-2 rounded-xl ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                <span className={`w-6 h-6 ${darkMode ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-50 text-orange-500'} rounded-lg flex items-center justify-center text-xs font-black`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{link.content?.slice(0, 50) || t('admin.post')}</p>
                  <p className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{link.smart_link_alias}</p>
                </div>
                <div className="text-left">
                  <p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{link.visit_count} {t('admin.visits')}</p>
                  <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{link.unique_visitors} {t('admin.unique')}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState darkMode={darkMode} icon={<Link2 className="w-12 h-12" />} text={t('admin.noSmartLinks')} />
        )}
      </Section>
    </div>
  );
};
