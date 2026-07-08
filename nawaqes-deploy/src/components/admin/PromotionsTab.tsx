// ─── Admin: Promotions Tab (redesigned — clean, professional cards) ──
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, XCircle, Zap, ExternalLink, DollarSign, Globe, Clock, Package, MapPin, User } from 'lucide-react';
import { motion } from 'motion/react';
import { PromotionRequest } from '../../types';
import { Badge, EmptyState } from './shared';

interface PromotionsTabProps {
  promotionRequests: PromotionRequest[];
  approvePromotion: (id: string) => void;
  rejectPromotion: (id: string) => void;
  darkMode: boolean;
  navigate: (path: string) => void;
}

export const PromotionsTab: React.FC<PromotionsTabProps> = ({
  promotionRequests, approvePromotion, rejectPromotion, darkMode, navigate,
}) => {
  const { t } = useTranslation();
  const [promoFilter, setPromoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const filteredPromos = useMemo(
    () => promoFilter === 'all' ? promotionRequests : promotionRequests.filter(p => p.status === promoFilter),
    [promotionRequests, promoFilter]
  );

  const pendingCount = promotionRequests.filter(p => p.status === 'pending').length;
  const approvedCount = promotionRequests.filter(p => p.status === 'approved').length;
  const rejectedCount = promotionRequests.filter(p => p.status === 'rejected').length;

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const sectionBg = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';

  // Parse cities safely
  const parseCities = (targetCity: string | undefined): string[] => {
    if (!targetCity) return [];
    try {
      const parsed = JSON.parse(targetCity);
      return Array.isArray(parsed) ? parsed : [targetCity];
    } catch {
      return [targetCity];
    }
  };

  // Format time ago
  const formatTimeAgo = (iso: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays === 1) return 'أمس';
    return `منذ ${diffDays} يوم`;
  };

  return (
    <div className="space-y-4">
      {/* ─── Stats Bar ─── */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`${cardBg} rounded-xl p-3 border text-center`}>
          <p className={`text-2xl font-black ${pendingCount > 0 ? 'text-orange-500' : textMuted}`}>{pendingCount}</p>
          <p className={`text-[10px] font-bold ${textMuted}`}>قيد الانتظار</p>
        </div>
        <div className={`${cardBg} rounded-xl p-3 border text-center`}>
          <p className={`text-2xl font-black text-green-500`}>{approvedCount}</p>
          <p className={`text-[10px] font-bold ${textMuted}`}>مقبولة</p>
        </div>
        <div className={`${cardBg} rounded-xl p-3 border text-center`}>
          <p className={`text-2xl font-black text-red-500`}>{rejectedCount}</p>
          <p className={`text-[10px] font-bold ${textMuted}`}>مرفوضة</p>
        </div>
      </div>

      {/* ─── Filter Tabs (pill style) ─── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'pending' as const, label: 'قيد الانتظار', count: pendingCount, color: 'orange' },
          { id: 'approved' as const, label: 'مقبولة', count: approvedCount, color: 'green' },
          { id: 'rejected' as const, label: 'مرفوضة', count: rejectedCount, color: 'red' },
          { id: 'all' as const, label: 'الكل', count: promotionRequests.length, color: 'gray' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setPromoFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              promoFilter === tab.id
                ? tab.color === 'orange' ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : tab.color === 'green' ? 'bg-green-500 text-white shadow-md shadow-green-500/30'
                  : tab.color === 'red' ? 'bg-red-500 text-white shadow-md shadow-red-500/30'
                  : `${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-800 text-white'}`
                : `${darkMode ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ─── Promotion Cards ─── */}
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredPromos.map((p, idx) => {
          const cities = parseCities(p.targetCity);
          const isPending = p.status === 'pending';
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`${cardBg} rounded-2xl border overflow-hidden`}
            >
              {/* ─── Card Header ─── */}
              <div className={`flex items-center justify-between p-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={p.postAuthor?.avatar || ''}
                    alt=""
                    className="w-10 h-10 rounded-full shrink-0 object-cover bg-gray-200"
                    onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.postAuthor?.id || 'x'}`; }}
                  />
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${textPrimary} truncate`}>{p.postAuthor?.name || 'مستخدم'}</p>
                    <p className={`text-[10px] ${textMuted} flex items-center gap-1`}>
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimeAgo(p.createdAt || '')}
                    </p>
                  </div>
                </div>
                {/* Status badge */}
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 ${
                  isPending ? 'bg-orange-500/20 text-orange-500'
                  : p.status === 'approved' ? 'bg-green-500/20 text-green-500'
                  : 'bg-red-500/20 text-red-500'
                }`}>
                  {isPending ? '⏳ قيد الانتظار' : p.status === 'approved' ? '✓ مقبولة' : '✗ مرفوضة'}
                </span>
              </div>

              {/* ─── Card Body ─── */}
              <div className="p-3 space-y-3">
                {/* Package info */}
                <div className={`flex items-center gap-2 rounded-xl p-2.5 ${sectionBg}`}>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${textPrimary}`}>{p.packageName || p.tier || 'باقة ترويج'}</p>
                    <p className={`text-[10px] ${textMuted}`}>باقة ترويجية</p>
                  </div>
                  <span className={`text-sm font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                    {p.price} ج.م
                  </span>
                </div>

                {/* Post content preview */}
                {p.postContent && (
                  <div className={`rounded-xl p-3 ${sectionBg}`}>
                    <p className={`text-[10px] font-bold ${textMuted} mb-1`}>📝 محتوى المنشور:</p>
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'} line-clamp-3`}>
                      {p.postContent}
                    </p>
                  </div>
                )}

                {/* Post image */}
                {(p as any).postImage && (
                  <img
                    src={(p as any).postImage}
                    alt=""
                    className="w-full max-h-40 rounded-xl object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}

                {/* Post details (price + location) */}
                <div className="flex flex-wrap gap-2">
                  {(p as any).postPrice > 0 && (
                    <div className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-700'}`}>
                      <DollarSign className="w-3 h-3" />
                      {(p as any).postPrice} ج.م
                    </div>
                  )}
                  {(p as any).postLocation && (
                    <div className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
                      <MapPin className="w-3 h-3" />
                      {(p as any).postLocation}
                    </div>
                  )}
                </div>

                {/* Target cities — clean grid */}
                {cities.length > 0 && (
                  <div>
                    <p className={`text-[10px] font-bold ${textMuted} mb-1.5`}>🎯 المدن المستهدفة:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cities.map((c, i) => (
                        <span
                          key={i}
                          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${
                            darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-700'
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target age */}
                {p.targetAgeMin != null && p.targetAgeMax != null && p.targetAgeMin > 0 && p.targetAgeMax > 0 && (
                  <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>
                    <User className="w-3 h-3" />
                    الفئة العمرية: {p.targetAgeMin} - {p.targetAgeMax} سنة
                  </div>
                )}

                {/* View post link */}
                {isPending && (
                  <button
                    onClick={() => navigate(`/post/${p.postId}`)}
                    className={`flex items-center gap-1 text-xs font-bold ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    عرض المنشور
                  </button>
                )}
              </div>

              {/* ─── Card Actions ─── */}
              {isPending && (
                <div className={`flex gap-2 p-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <button
                    onClick={() => approvePromotion(p.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-black active:scale-95 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    قبول
                  </button>
                  <button
                    onClick={() => rejectPromotion(p.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black active:scale-95 transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    رفض
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}

        {filteredPromos.length === 0 && (
          <EmptyState darkMode={darkMode} icon={<Zap className="w-12 h-12" />} text={t('admin.noPromotionRequests')} />
        )}
      </div>
    </div>
  );
};
