import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Star, Eye, EyeOff, Megaphone, Users, Video, Radio, BadgeCheck } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, formatTimeAgo } from './helpers';
import { Badge, EmptyState } from './shared';

interface AdminChannel {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatar: string;
  is_public: number;
  is_verified: number;
  status: string;
  created_at: string;
  owner_name: string;
  owner_avatar: string;
  owner_avatar_base64: string;
  subscriber_count: number;
  post_count: number;
  stream_count: number;
}

interface ChannelStats {
  total: number;
  verified: number;
  public: number;
  totalSubscribers: number;
  totalPosts: number;
}

interface ChannelsTabProps {
  darkMode: boolean;
}

export const ChannelsTab: React.FC<ChannelsTabProps> = ({ darkMode }) => {
  const { t } = useTranslation();
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'verified' | 'public' | 'suspended' | 'inactive'>('all');

  const loadChannels = async () => {
    try {
      setLoading(true);
      const data = await adminFetch('GET', '/admin/channels');
      setChannels(data.channels || []);
      setStats(data.stats || null);
    } catch {
      toast.error('فشل تحميل القنوات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChannels(); }, []);

  const handleToggleVerify = async (channelId: string, currentVerified: boolean) => {
    try {
      await adminFetch('PATCH', `/admin/channels/${channelId}/verify`);
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, is_verified: currentVerified ? 0 : 1 } : c));
      toast.success(currentVerified ? 'تم إلغاء التوثيق' : 'تم توثيق القناة ✓');
    } catch {
      toast.error('فشل تحديث التوثيق');
    }
  };

  const handleToggleStatus = async (channelId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await adminFetch('PATCH', `/admin/channels/${channelId}/status`, { status: newStatus });
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, status: newStatus } : c));
      toast.success(newStatus === 'active' ? 'تم تفعيل القناة' : 'تم تعليق القناة');
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  const handleReactivate = async (channelId: string) => {
    try {
      await adminFetch('PATCH', `/admin/channels/${channelId}/reactivate`);
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, status: 'active' } : c));
      toast.success('تم تفعيل القناة');
    } catch {
      toast.error('فشل تفعيل القناة');
    }
  };

  const handleDelete = async (channelId: string, channelName: string) => {
    if (!confirm(`هل أنت متأكد من حذف القناة "${channelName}"؟ سيتم حذف جميع المنشورات والبثوث والمشتركين نهائياً.`)) return;
    try {
      await adminFetch('DELETE', `/admin/channels/${channelId}`);
      setChannels(prev => prev.filter(c => c.id !== channelId));
      toast.success('تم حذف القناة');
    } catch (err: any) {
      toast.error(err.message || 'فشل حذف القناة');
    }
  };

  const filteredChannels = channels.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'verified') return c.is_verified;
    if (filter === 'public') return c.is_public;
    if (filter === 'suspended') return c.status === 'suspended';
    if (filter === 'inactive') return c.status === 'inactive';
    return true;
  });

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Badge darkMode={darkMode} color="orange">📡 القنوات — {channels.length}</Badge>
        <button onClick={loadChannels} className={`text-xs px-3 py-1.5 rounded-lg font-bold ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          تحديث
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Megaphone className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.total}</p>
            <p className={`text-[10px] ${textMuted}`}>إجمالي</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <BadgeCheck className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.verified}</p>
            <p className={`text-[10px] ${textMuted}`}>موثقة</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Users className="w-5 h-5 mx-auto mb-1 text-green-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.totalSubscribers}</p>
            <p className={`text-[10px] ${textMuted}`}>مشترك</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Eye className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.totalPosts}</p>
            <p className={`text-[10px] ${textMuted}`}>منشورات</p>
          </div>
          <div className={`${cardBg} rounded-xl p-3 border text-center`}>
            <Video className="w-5 h-5 mx-auto mb-1 text-red-500" />
            <p className={`text-xl font-black ${textPrimary}`}>{stats.public}</p>
            <p className={`text-[10px] ${textMuted}`}>عامة</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'الكل', count: channels.length },
          { id: 'verified', label: 'موثقة', count: channels.filter(c => c.is_verified).length },
          { id: 'public', label: 'عامة', count: channels.filter(c => c.is_public).length },
          { id: 'suspended', label: 'معلقة', count: channels.filter(c => c.status === 'suspended').length },
          { id: 'inactive', label: 'متوقفة (30 يوم)', count: channels.filter(c => c.status === 'inactive').length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filter === f.id
                ? 'bg-orange-500 text-white'
                : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Channels */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredChannels.length === 0 ? (
        <EmptyState darkMode={darkMode} icon={<Megaphone className="w-12 h-12" />} text="لا توجد قنوات" />
      ) : (
        <div className="space-y-3">
          {filteredChannels.map(ch => (
            <div key={ch.id} className={`${cardBg} rounded-2xl border p-4`}>
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {ch.avatar ? (
                    <img src={ch.avatar} alt="" className="w-12 h-12 rounded-xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xl font-black">
                      {ch.name?.charAt(0) || '؟'}
                    </div>
                  )}
                  {ch.is_verified ? (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                      <BadgeCheck className="w-3 h-3 text-white" />
                    </div>
                  ) : null}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm font-black truncate ${textPrimary}`}>{ch.name}</h4>
                    {ch.status === 'suspended' && (
                      <span className="px-1.5 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-black">معلقة</span>
                    )}
                  </div>
                  <p className={`text-xs ${textMuted}`}>@{ch.handle}</p>
                  {ch.description && (
                    <p className={`text-xs mt-1 line-clamp-1 ${textMuted}`}>{ch.description}</p>
                  )}

                  {/* Owner */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <img
                      src={ch.owner_avatar_base64 || ch.owner_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ch.owner_name}`}
                      alt=""
                      className="w-4 h-4 rounded-full"
                    />
                    <span className={`text-[10px] ${textMuted}`}>{ch.owner_name || 'مستخدم'}</span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-bold" style={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {(ch.subscriber_count || 0).toLocaleString('ar-EG')}</span>
                    <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" /> {(ch.post_count || 0).toLocaleString('ar-EG')}</span>
                    <span className="flex items-center gap-0.5"><Radio className="w-3 h-3" /> {(ch.stream_count || 0).toLocaleString('ar-EG')}</span>
                    <span className={textMuted}>{formatTimeAgo(ch.created_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggleVerify(ch.id, !!ch.is_verified)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                      ch.is_verified
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={ch.is_verified ? 'إلغاء التوثيق' : 'توثيق'}
                  >
                    <BadgeCheck className="w-3 h-3" />
                    {ch.is_verified ? 'موثقة' : 'توثيق'}
                  </button>
                  <button
                    onClick={() => ch.status === 'inactive' ? handleReactivate(ch.id) : handleToggleStatus(ch.id, ch.status)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                      ch.status === 'active'
                        ? 'bg-gray-500 text-white hover:bg-gray-600'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                    title={ch.status === 'active' ? 'تعليق' : ch.status === 'inactive' ? 'إعادة تفعيل' : 'تفعيل'}
                  >
                    {ch.status === 'active' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {ch.status === 'active' ? 'تعليق' : ch.status === 'inactive' ? 'تفعيل' : 'تفعيل'}
                  </button>
                  <button
                    onClick={() => handleDelete(ch.id, ch.name)}
                    className="px-2 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 text-[10px] font-bold"
                    title="حذف"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
