import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, Users, CheckCircle, DollarSign, CreditCard, Zap,
  Shield, Wallet, Star, Activity, Package, PieChart,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RePieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import { DashboardStats, ChartDataPoint } from '../../types';
import { StatCard, Section, Badge, Btn, EmptyState } from './shared';
import { ORANGE, PIE_COLORS, getDefaultChartData, getTooltipStyle, formatTimeAgo } from './helpers';

interface OverviewTabProps {
  stats: DashboardStats | null;
  detailedStats: any;
  chartData: ChartDataPoint[];
  posts: any[];
  realtimeStats: any;
  darkMode: boolean;
  loadRealtimeStats: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats, detailedStats, chartData, posts, realtimeStats, darkMode, loadRealtimeStats,
}) => {
  const { t } = useTranslation();
  const defaultStats: DashboardStats = stats || { totalUsers: 0, activeAds: 0, totalTransactions: 0, dailyGrowth: 0, revenue: 0 };
  const defaultChart = chartData.length > 0 ? chartData : getDefaultChartData(t);

  const typePieData = React.useMemo(() => {
    return [
      { name: t('admin.ads'), value: posts.filter((p: any) => p.type === 'ad').length },
      { name: t('admin.news'), value: posts.filter((p: any) => p.type === 'news').length },
      { name: t('admin.statuses'), value: posts.filter((p: any) => p.type === 'status').length },
    ].filter(d => d.value > 0);
  }, [posts, t]);

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard darkMode={darkMode} icon={<Users className="w-5 h-5" />} label={t('admin.users')} value={detailedStats?.totalUsers || defaultStats.totalUsers} trend="+12%" />
        <StatCard darkMode={darkMode} icon={<CheckCircle className="w-5 h-5" />} label={t('admin.activePosts')} value={detailedStats?.activeAds || defaultStats.activeAds} color="#10b981" />
        <StatCard darkMode={darkMode} icon={<DollarSign className="w-5 h-5" />} label={t('admin.revenue')} value={`${detailedStats?.totalRevenue || defaultStats.revenue} ${t('common.egp')}`} color="#8b5cf6" />
        <StatCard darkMode={darkMode} icon={<CreditCard className="w-5 h-5" />} label={t('admin.chargeRequests')} value={detailedStats?.pendingCharging || 0} color="#f59e0b" />
        <StatCard darkMode={darkMode} icon={<Zap className="w-5 h-5" />} label={t('admin.promotionRequestsLabel')} value={detailedStats?.pendingPromotions || 0} color="#06b6d4" />
        <StatCard darkMode={darkMode} icon={<Shield className="w-5 h-5" />} label={t('admin.flaggedPosts')} value={detailedStats?.flaggedPosts || 0} color="#ef4444" />
        <StatCard darkMode={darkMode} icon={<Wallet className="w-5 h-5" />} label={t('admin.walletsBalance')} value={`${detailedStats?.totalWalletBalance || 0} ${t('common.egp')}`} color="#ec4899" />
        <StatCard darkMode={darkMode} icon={<Star className="w-5 h-5" />} label={t('admin.verifiedUsers')} value={detailedStats?.verifiedUsers || 0} color="#f59e0b" />
      </div>

      {/* Realtime Stats */}
      {realtimeStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-80 mb-1">{t('admin.onlineNow')}</p>
            <p className="text-2xl font-black">{realtimeStats.onlineUsers}</p>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-80 mb-1">{t('admin.postsToday')}</p>
            <p className="text-2xl font-black">{realtimeStats.newPostsToday}</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-80 mb-1">{t('admin.newUsersToday')}</p>
            <p className="text-2xl font-black">{realtimeStats.newUsersToday}</p>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white shadow-lg">
            <p className="text-xs opacity-80 mb-1">{t('admin.pendingItems')}</p>
            <p className="text-2xl font-black">{realtimeStats.pendingItems}</p>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section darkMode={darkMode} title={t('admin.weeklyActivity')} icon={<BarChart3 className="w-5 h-5" />}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={defaultChart}>
              <defs>
                <linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ORANGE} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip contentStyle={getTooltipStyle(darkMode)} />
              <Area type="monotone" dataKey="ads" stroke={ORANGE} fill="url(#colorAds)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>

        <Section darkMode={darkMode} title={t('admin.postTypes')} icon={<PieChart className="w-5 h-5" />}>
          {typePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RePieChart>
                <Pie
                  data={typePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {typePieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={getTooltipStyle(darkMode)} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState darkMode={darkMode} icon={<BarChart3 className="w-12 h-12" />} text={t('admin.noPostsYet')} />
          )}
        </Section>
      </div>

      {/* Recent Activity */}
      <Section
        darkMode={darkMode}
        title={t('admin.recentActivity')}
        icon={<Activity className="w-5 h-5" />}
        action={<Btn darkMode={darkMode} onClick={loadRealtimeStats}><Activity className="w-3.5 h-3.5" /></Btn>}
      >
        {realtimeStats?.recentActivity?.length > 0 ? (
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {realtimeStats.recentActivity.map((item: any, i: number) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                  darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.type === 'user'
                      ? darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-500'
                      : item.type === 'post'
                        ? darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-500'
                        : darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-500'
                  }`}
                >
                  {item.type === 'user' ? <Users className="w-4 h-4" /> : item.type === 'post' ? <Package className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {item.description}
                  </p>
                  <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {item.created_at ? formatTimeAgo(item.created_at) : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState darkMode={darkMode} icon={<Activity className="w-12 h-12" />} text={t('admin.noRecentActivity')} />
        )}
      </Section>
    </div>
  );
};
