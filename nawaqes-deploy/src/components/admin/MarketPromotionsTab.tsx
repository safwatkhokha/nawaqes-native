import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, XCircle, ShoppingBag } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { api } from '../../services/api';
import { selectClass } from './helpers';
import { MarketPromoRequest } from './types';
import { Badge, Btn, EmptyState } from './shared';

interface MarketPromotionsTabProps {
  marketPromoRequests: MarketPromoRequest[];
  setMarketPromoRequests: React.Dispatch<React.SetStateAction<MarketPromoRequest[]>>;
  darkMode: boolean;
}

export const MarketPromotionsTab: React.FC<MarketPromotionsTabProps> = ({
  marketPromoRequests, setMarketPromoRequests, darkMode,
}) => {
  const { t } = useTranslation();
  const [marketPromoFilter, setMarketPromoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filteredMarketPromos = useMemo(
    () => marketPromoFilter === 'all' ? marketPromoRequests : marketPromoRequests.filter(p => p.status === marketPromoFilter),
    [marketPromoRequests, marketPromoFilter]
  );

  const approveMarketPromo = async (id: string) => {
    try { await api.approveMarketPromotion(id); setMarketPromoRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r)); toast.success(t('admin.marketPromoApproved')); } catch (err: any) { toast.error(err.message || t('admin.marketPromoApproveFailed')); }
  };
  const rejectMarketPromo = async (id: string) => {
    try { await api.rejectMarketPromotion(id); setMarketPromoRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r)); toast.success(t('admin.marketPromoRejected')); } catch (err: any) { toast.error(err.message || t('admin.marketPromoRejectFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={marketPromoFilter} onChange={e => setMarketPromoFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('common.all')} ({marketPromoRequests.length})</option>
          <option value="pending">{t('admin.pending')} ({marketPromoRequests.filter(p => p.status === 'pending').length})</option>
          <option value="approved">{t('admin.accepted')}</option>
          <option value="rejected">{t('admin.rejected')}</option>
        </select>
        <div className="flex gap-2 mr-auto">
          <Badge darkMode={darkMode} color="orange">{t('admin.pendingLabel')} {marketPromoRequests.filter(p => p.status === 'pending').length}</Badge>
          <Badge darkMode={darkMode} color="blue">{t('admin.totalLabel')} {marketPromoRequests.length}</Badge>
        </div>
      </div>

      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredMarketPromos.map(p => (
          <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-center gap-3">
              <img src={p.sellerAvatar} alt="" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.sellerName}</span>
                  <Badge darkMode={darkMode} color={p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red'}>
                    {p.status === 'pending' ? t('admin.pending') : p.status === 'approved' ? t('admin.approved') : t('admin.rejected')}
                  </Badge>
                </div>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.packageName || p.tier} • {p.price} {t('common.egp')}</p>
                <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.adLabel')} {p.listingTitle}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {p.targetCity && (() => { try { const cities = JSON.parse(p.targetCity); return (Array.isArray(cities) ? cities : [p.targetCity]).map((c: string, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{c}</span>); } catch { return <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{p.targetCity}</span>; } })()}
                  {(p.targetAgeMin ?? 0) > 0 && (p.targetAgeMax ?? 0) > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>{t('admin.age')} {p.targetAgeMin}-{p.targetAgeMax}</span>}
                </div>
                <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('ar-EG') : ''}</p>
              </div>
              {p.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approveMarketPromo(p.id)}><Check className="w-3.5 h-3.5" />{t('admin.approve')}</Btn>
                  <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectMarketPromo(p.id)}><XCircle className="w-3.5 h-3.5" />{t('admin.rejectBtn')}</Btn>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredMarketPromos.length === 0 && <EmptyState darkMode={darkMode} icon={<ShoppingBag className="w-12 h-12" />} text={t('admin.noMarketPromoRequests')} />}
      </div>
    </div>
  );
};
