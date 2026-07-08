import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, XCircle, CreditCard, Phone as PhoneIcon, Image as ImageIcon } from 'lucide-react';
import { ChargingRequest } from '../../types';
import { formatTimeAgo, selectClass } from './helpers';
import { Badge, Btn, EmptyState } from './shared';

interface ChargingTabProps {
  chargingRequests: ChargingRequest[];
  approveCharging: (id: string) => void;
  rejectCharging: (id: string) => void;
  darkMode: boolean;
}

export const ChargingTab: React.FC<ChargingTabProps> = ({ chargingRequests, approveCharging, rejectCharging, darkMode }) => {
  const { t } = useTranslation();
  const [chargingFilter, setChargingFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filteredCharging = useMemo(
    () => chargingFilter === 'all' ? chargingRequests : chargingRequests.filter(c => c.status === chargingFilter),
    [chargingRequests, chargingFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={chargingFilter} onChange={e => setChargingFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('common.all')} ({chargingRequests.length})</option>
          <option value="pending">{t('admin.pending')} ({chargingRequests.filter(c => c.status === 'pending').length})</option>
          <option value="approved">{t('admin.approved')}</option>
          <option value="rejected">{t('admin.rejected')}</option>
        </select>
        <div className="flex gap-2 mr-auto">
          <Badge darkMode={darkMode} color="orange">{t('admin.pendingLabel')} {chargingRequests.filter(c => c.status === 'pending').length}</Badge>
          <Badge darkMode={darkMode} color="green">{t('admin.pendingAmount')} {chargingRequests.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0)} {t('common.egp')}</Badge>
        </div>
      </div>

      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredCharging.map(c => (
          <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
            <div className="flex items-start gap-3">
              <img src={c.userAvatar} alt="" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.userName}</span>
                  <Badge darkMode={darkMode} color={c.status === 'pending' ? 'orange' : c.status === 'approved' ? 'green' : 'red'}>
                    {c.status === 'pending' ? t('admin.pending') : c.status === 'approved' ? t('admin.approved') : t('admin.rejected')}
                  </Badge>
                </div>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{c.amount} {t('common.egp')} • {c.method}</p>
                {/* Phone number */}
                {c.userPhone ? (
                  <div className={`mt-1.5 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                    <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{c.userPhone}</span>
                    <a href={`tel:${c.userPhone}`} className="text-[9px] text-blue-500 hover:text-blue-700 underline">{t('admin.call')}</a>
                  </div>
                ) : (
                  <div className={`mt-1.5 inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'}`}>
                    <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>⚠️ {t('admin.noPhoneNumber')}</span>
                  </div>
                )}
                {/* Additional phone */}
                {c.additionalPhone && c.additionalPhone.trim() !== '' && (
                  <div className={`mt-1 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-orange-900/30 border-orange-700' : 'bg-orange-50 border-orange-200'}`}>
                    <PhoneIcon className="w-3.5 h-3.5 text-orange-600" />
                    <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>{t('admin.additionalPhone')}:</span>
                    <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-orange-400' : 'text-orange-700'}`} dir="ltr">{c.additionalPhone}</span>
                    <a href={`tel:${c.additionalPhone}`} className="text-[9px] text-orange-500 hover:text-orange-700 underline">{t('admin.call')}</a>
                  </div>
                )}
                <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{c.createdAt ? formatTimeAgo(c.createdAt) : ''}</p>
                {/* Receipt Image */}
                {c.receiptImage && (
                  <div className="mt-2">
                    <a href={c.receiptImage} target="_blank" rel="noopener noreferrer" className="inline-block">
                      <img src={c.receiptImage} alt={t('admin.transferReceipt')} className={`max-w-[180px] max-h-[120px] rounded-xl border object-cover cursor-pointer hover:shadow-md transition-all ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </a>
                    <p className={`text-[9px] font-bold mt-1 flex items-center gap-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      <ImageIcon className="w-3 h-3" />{t('admin.transferReceiptClickToEnlarge')}
                    </p>
                  </div>
                )}
                {!c.receiptImage && c.status === 'pending' && (
                  <p className="text-[9px] text-red-500 font-bold mt-1">⚠️ {t('admin.noReceiptAttached')}</p>
                )}
              </div>
              {c.status === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approveCharging(c.id)}><Check className="w-3.5 h-3.5" />{t('admin.approve')}</Btn>
                  <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectCharging(c.id)}><XCircle className="w-3.5 h-3.5" />{t('admin.rejectBtn')}</Btn>
                </div>
              )}
            </div>
          </div>
        ))}
        {filteredCharging.length === 0 && <EmptyState darkMode={darkMode} icon={<CreditCard className="w-12 h-12" />} text={t('admin.noChargeRequests')} />}
      </div>
    </div>
  );
};
