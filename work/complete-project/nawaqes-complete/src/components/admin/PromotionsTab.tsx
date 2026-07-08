import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, XCircle, Zap, ExternalLink, DollarSign, Globe } from 'lucide-react';
import { PromotionRequest } from '../../types';
import { selectClass } from './helpers';
import { Badge, Btn, EmptyState } from './shared';

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
  const [promoFilter, setPromoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filteredPromos = useMemo(
    () => promoFilter === 'all' ? promotionRequests : promotionRequests.filter(p => p.status === promoFilter),
    [promotionRequests, promoFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <select value={promoFilter} onChange={e => setPromoFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('common.all')} ({promotionRequests.length})</option>
          <option value="pending">{t('admin.pending')} ({promotionRequests.filter(p => p.status === 'pending').length})</option>
          <option value="approved">{t('admin.accepted')}</option>
          <option value="rejected">{t('admin.rejected')}</option>
        </select>
      </div>

      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredPromos.map(p => (
          <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <img src={p.postAuthor?.avatar || ''} alt="" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.postAuthor?.name}</span>
                  <Badge darkMode={darkMode} color={p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red'}>
                    {p.status === 'pending' ? t('admin.pending') : p.status === 'approved' ? t('admin.approved') : t('admin.rejected')}
                  </Badge>
                </div>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.packageName || p.tier} • {p.price} {t('common.egp')}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.targetCity && (() => { try { const cities = JSON.parse(p.targetCity); return (Array.isArray(cities) ? cities : [p.targetCity]).map((c: string, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{c}</span>); } catch { return <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{p.targetCity}</span>; } })()}
                  {p.targetAgeMin != null && p.targetAgeMax != null && p.targetAgeMin > 0 && p.targetAgeMax > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>{t('admin.age')} {p.targetAgeMin}-{p.targetAgeMax}</span>}
                </div>
                {/* Post content for review */}
                {p.postContent && (
                  <div className={`mt-2 rounded-xl p-3 border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-xs leading-relaxed whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{p.postContent}</p>
                  </div>
                )}
                {(p as any).postImage && (
                  <div className="mt-2">
                    <img src={(p as any).postImage} alt={t('admin.postImage')} className={`max-w-[200px] max-h-[150px] rounded-xl border object-cover ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                {(p as any).postPrice > 0 && (
                  <div className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}><DollarSign className="w-3 h-3" />{(p as any).postPrice} {t('common.egp')}</div>
                )}
                {(p as any).postLocation && (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><Globe className="w-3 h-3" />{(p as any).postLocation}</div>
                )}
                {p.status === 'pending' && (
                  <button onClick={() => navigate(`/post/${p.postId}`)} className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`} title={t('admin.viewPost')}>
                    <ExternalLink className="w-3 h-3" />{t('admin.viewPost')}
                  </button>
                )}
              </div>
              {p.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approvePromotion(p.id)}><Check className="w-3.5 h-3.5" />{t('admin.approve')}</Btn>
                  <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectPromotion(p.id)}><XCircle className="w-3.5 h-3.5" />{t('admin.rejectBtn')}</Btn>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredPromos.length === 0 && <EmptyState darkMode={darkMode} icon={<Zap className="w-12 h-12" />} text={t('admin.noPromotionRequests')} />}
      </div>
    </div>
  );
};
