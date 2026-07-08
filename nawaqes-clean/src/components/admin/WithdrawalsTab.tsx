import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check, XCircle, Banknote, CreditCard, RefreshCw,
  Smartphone, Cpu, Store, Building2, Phone as PhoneIcon, Image as ImageIcon, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../services/api';
import { formatTimeAgo, selectClass } from './helpers';
import { Badge, Btn, EmptyState, LoadingSpinner } from './shared';
import { toast as sonnerToast } from 'sonner';

// ─── Network metadata for display ────────────────────────────────────
// Must match WITHDRAWAL_NETWORKS in src/routes/wallet.ts.
const NETWORK_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  vodafone_cash:  { label: 'فودافون كاش',  icon: Smartphone, color: 'bg-red-500' },
  instapay:       { label: 'إنستا باي',    icon: Cpu,        color: 'bg-purple-500' },
  fawry:          { label: 'فوري',         icon: Store,      color: 'bg-yellow-500' },
  etisalat_cash:  { label: 'اتصالات كاش',  icon: Smartphone, color: 'bg-emerald-500' },
  orange_cash:    { label: 'أورانج كاش',   icon: Smartphone, color: 'bg-orange-500' },
  bank_transfer:  { label: 'تحويل بنكي',   icon: Building2,  color: 'bg-blue-500' },
};

function networkMeta(network: string) {
  return NETWORK_META[network] || { label: network || 'غير محدد', icon: Banknote, color: 'bg-gray-500' };
}

// ─── Types ───────────────────────────────────────────────────────────
interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  userPhone?: string;
  amount: number;
  fee: number;
  netAmount: number;
  network: string;
  accountNumber: string;
  method?: string;
  accountDetails?: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
  createdAt: string;
  processedAt?: string;
}

interface ChargeRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  user_phone?: string;
  additional_phone?: string;
  amount: number;
  method: string;
  receipt_image?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  processed_at?: string;
}

interface WithdrawalsTabProps {
  darkMode: boolean;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export const WithdrawalsTab: React.FC<WithdrawalsTabProps> = ({ darkMode }) => {
  const { t } = useTranslation();

  // ─── Data state ──
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [charges, setCharges] = useState<ChargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // ─── Filter state (separate per section) ──
  const [withdrawalFilter, setWithdrawalFilter] = useState<StatusFilter>('pending');
  const [chargeFilter, setChargeFilter] = useState<StatusFilter>('pending');

  // ─── Section toggle ──
  const [collapsedWithdrawals, setCollapsedWithdrawals] = useState(false);
  const [collapsedCharges, setCollapsedCharges] = useState(false);

  // ─── Load both lists ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [wds, chs] = await Promise.all([
        api.getAdminWithdrawalRequests().catch(() => [] as any[]),
        api.getAdminChargeRequests().catch(() => [] as any[]),
      ]);
      setWithdrawals(Array.isArray(wds) ? (wds as WithdrawalRequest[]) : []);
      setCharges(Array.isArray(chs) ? (chs as ChargeRequest[]) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Filtered lists ──
  const filteredWithdrawals = useMemo(
    () => withdrawalFilter === 'all' ? withdrawals : withdrawals.filter(w => w.status === withdrawalFilter),
    [withdrawals, withdrawalFilter],
  );
  const filteredCharges = useMemo(
    () => chargeFilter === 'all' ? charges : charges.filter(c => c.status === chargeFilter),
    [charges, chargeFilter],
  );

  // ─── Counts (for badges) ──
  const pendingWithdrawalsCount = withdrawals.filter(w => w.status === 'pending').length;
  const pendingChargesCount = charges.filter(c => c.status === 'pending').length;
  const pendingWithdrawalsAmount = withdrawals
    .filter(w => w.status === 'pending')
    .reduce((s, w) => s + Number(w.amount || 0), 0);
  const pendingChargesAmount = charges
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  // ─── Withdrawal actions ──
  const handleApproveWithdrawal = async (id: string) => {
    setActionLoadingId(`w-approve-${id}`);
    try {
      await api.approveAdminWithdrawal(id);
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: 'approved' as const } : w));
      sonnerToast.success('تمت الموافقة على طلب السحب');
    } catch (err: any) {
      sonnerToast.error(err.message || 'فشلت الموافقة على طلب السحب');
    } finally {
      setActionLoadingId(null);
    }
  };
  const handleRejectWithdrawal = async (id: string) => {
    setActionLoadingId(`w-reject-${id}`);
    try {
      await api.rejectAdminWithdrawal(id);
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: 'rejected' as const } : w));
      sonnerToast.success('تم رفض طلب السحب واسترجاع المبلغ للمستخدم');
    } catch (err: any) {
      sonnerToast.error(err.message || 'فشل رفض طلب السحب');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ─── Charge actions ──
  const handleApproveCharge = async (id: string) => {
    setActionLoadingId(`c-approve-${id}`);
    try {
      await api.approveAdminCharge(id);
      setCharges(prev => prev.map(c => c.id === id ? { ...c, status: 'approved' as const } : c));
      sonnerToast.success('تم تأكيد طلب الشحن وإضافة المبلغ للمحفظة');
    } catch (err: any) {
      sonnerToast.error(err.message || 'فشل تأكيد طلب الشحن');
    } finally {
      setActionLoadingId(null);
    }
  };
  const handleRejectCharge = async (id: string) => {
    setActionLoadingId(`c-reject-${id}`);
    try {
      await api.rejectAdminCharge(id);
      setCharges(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' as const } : c));
      sonnerToast.success('تم رفض طلب الشحن');
    } catch (err: any) {
      sonnerToast.error(err.message || 'فشل رفض الطلب');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner darkMode={darkMode} text={t('common.loading', 'جارٍ التحميل...')} />;
  }

  const cardCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const mutedCls = darkMode ? 'text-gray-400' : 'text-gray-500';
  const textCls = darkMode ? 'text-white' : 'text-gray-900';
  const sectionCls = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';

  return (
    <div className="space-y-5">
      {/* ─── Header summary ─── */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${cardCls} rounded-2xl border p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <Banknote className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
            <span className={`text-[10px] font-bold ${mutedCls}`}>سحب معلّق</span>
          </div>
          <p className={`text-2xl font-black ${textCls}`}>{pendingWithdrawalsCount}</p>
          <p className={`text-[10px] ${mutedCls}`}>{pendingWithdrawalsAmount.toLocaleString()} {t('common.egp')}</p>
        </div>
        <div className={`${cardCls} rounded-2xl border p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            <span className={`text-[10px] font-bold ${mutedCls}`}>شحن معلّق</span>
          </div>
          <p className={`text-2xl font-black ${textCls}`}>{pendingChargesCount}</p>
          <p className={`text-[10px] ${mutedCls}`}>{pendingChargesAmount.toLocaleString()} {t('common.egp')}</p>
        </div>
      </div>

      {/* ─── Section 1: Withdrawal Requests ─── */}
      <div className={`${cardCls} rounded-2xl border overflow-hidden`}>
        <button
          onClick={() => setCollapsedWithdrawals(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-50'}`}
        >
          <h3 className={`text-sm font-black flex items-center gap-2 ${textCls}`}>
            <span className="text-orange-500"><Banknote className="w-4 h-4" /></span>
            طلبات السحب (خارجية)
            {pendingWithdrawalsCount > 0 && (
              <Badge darkMode={darkMode} color="orange">{pendingWithdrawalsCount} {t('admin.pending', 'قيد الانتظار')}</Badge>
            )}
          </h3>
          {collapsedWithdrawals ? <ChevronDown className={`w-4 h-4 ${mutedCls}`} /> : <ChevronUp className={`w-4 h-4 ${mutedCls}`} />}
        </button>
        {!collapsedWithdrawals && (
          <div className="p-5 space-y-3">
            {/* Filter + refresh */}
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={withdrawalFilter}
                onChange={e => setWithdrawalFilter(e.target.value as StatusFilter)}
                className={selectClass(darkMode)}
              >
                <option value="all">الكل ({withdrawals.length})</option>
                <option value="pending">قيد المراجعة ({withdrawals.filter(w => w.status === 'pending').length})</option>
                <option value="approved">تمت الموافقة</option>
                <option value="rejected">مرفوض</option>
              </select>
              <button
                onClick={loadAll}
                className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl transition-colors ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('common.refresh', 'تحديث')}
              </button>
            </div>

            {/* List */}
            <div className="grid gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {filteredWithdrawals.map(w => {
                const meta = networkMeta(w.network || w.method || '');
                const Icon = meta.icon;
                const statusBadge = w.status === 'pending'
                  ? <Badge darkMode={darkMode} color="orange">قيد المراجعة</Badge>
                  : w.status === 'approved'
                    ? <Badge darkMode={darkMode} color="green">تمت الموافقة</Badge>
                    : <Badge darkMode={darkMode} color="red">مرفوض</Badge>;
                return (
                  <div key={w.id} className={`rounded-2xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-start gap-3">
                      {/* Network icon */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <img src={w.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${w.userId}`} alt="" className="w-6 h-6 rounded-full shrink-0" />
                          <span className={`font-bold text-sm ${textCls}`}>{w.userName}</span>
                          {statusBadge}
                        </div>
                        {/* Amount + fee + net */}
                        <div className={`mt-2 rounded-xl p-3 ${sectionCls}`}>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className={`font-bold ${mutedCls}`}>المبلغ</span>
                            <span className={`font-black ${textCls}`}>{Number(w.amount).toLocaleString()} {t('common.egp')}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] mt-1">
                            <span className={`font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>رسوم 5%</span>
                            <span className={`font-black ${darkMode ? 'text-red-400' : 'text-red-600'}`}>- {Number(w.fee).toLocaleString()} {t('common.egp')}</span>
                          </div>
                          <div className={`pt-1 mt-1 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'} flex items-center justify-between`}>
                            <span className={`text-xs font-black ${textCls}`}>الصافي (سيصله)</span>
                            <span className={`text-sm font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{Number(w.netAmount).toLocaleString()} {t('common.egp')}</span>
                          </div>
                        </div>
                        {/* Network + account */}
                        <div className={`mt-2 flex items-center gap-2 text-[11px] ${mutedCls}`}>
                          <span className={`font-bold ${textCls}`}>{meta.label}</span>
                          <span>•</span>
                          <span dir="ltr" className="font-mono">{w.accountNumber || w.accountDetails || '—'}</span>
                        </div>
                        {/* Phone */}
                        {w.userPhone && (
                          <div className={`mt-1 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{w.userPhone}</span>
                            <a href={`tel:${w.userPhone}`} className="text-[9px] text-blue-500 hover:text-blue-700 underline">{t('admin.call', 'اتصال')}</a>
                          </div>
                        )}
                        {/* Date */}
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                          {w.createdAt ? formatTimeAgo(w.createdAt) : ''}
                          {w.processedAt && w.status !== 'pending' && ` • ${w.status === 'approved' ? 'تم' : 'رُفض'}: ${formatTimeAgo(w.processedAt)}`}
                        </p>
                        {w.adminNote && <p className={`text-[10px] mt-1 ${mutedCls}`}>ملاحظة: {w.adminNote}</p>}
                      </div>
                      {/* Actions */}
                      {w.status === 'pending' && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Btn
                            darkMode={darkMode}
                            variant="primary"
                            size="sm"
                            disabled={actionLoadingId === `w-approve-${w.id}`}
                            onClick={() => handleApproveWithdrawal(w.id)}
                          >
                            {actionLoadingId === `w-approve-${w.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            موافقة
                          </Btn>
                          <Btn
                            darkMode={darkMode}
                            variant="danger"
                            size="sm"
                            disabled={actionLoadingId === `w-reject-${w.id}`}
                            onClick={() => handleRejectWithdrawal(w.id)}
                          >
                            {actionLoadingId === `w-reject-${w.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            رفض
                          </Btn>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredWithdrawals.length === 0 && (
                <EmptyState darkMode={darkMode} icon={<Banknote className="w-12 h-12" />} text="لا توجد طلبات سحب" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Section 2: Charge Requests ─── */}
      <div className={`${cardCls} rounded-2xl border overflow-hidden`}>
        <button
          onClick={() => setCollapsedCharges(v => !v)}
          className={`w-full flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-50'}`}
        >
          <h3 className={`text-sm font-black flex items-center gap-2 ${textCls}`}>
            <span className="text-green-500"><CreditCard className="w-4 h-4" /></span>
            طلبات الشحن
            {pendingChargesCount > 0 && (
              <Badge darkMode={darkMode} color="green">{pendingChargesCount} {t('admin.pending', 'قيد الانتظار')}</Badge>
            )}
          </h3>
          {collapsedCharges ? <ChevronDown className={`w-4 h-4 ${mutedCls}`} /> : <ChevronUp className={`w-4 h-4 ${mutedCls}`} />}
        </button>
        {!collapsedCharges && (
          <div className="p-5 space-y-3">
            {/* Filter */}
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={chargeFilter}
                onChange={e => setChargeFilter(e.target.value as StatusFilter)}
                className={selectClass(darkMode)}
              >
                <option value="all">الكل ({charges.length})</option>
                <option value="pending">قيد المراجعة ({charges.filter(c => c.status === 'pending').length})</option>
                <option value="approved">تم الشحن</option>
                <option value="rejected">مرفوض</option>
              </select>
            </div>

            {/* List */}
            <div className="grid gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {filteredCharges.map(c => {
                const statusBadge = c.status === 'pending'
                  ? <Badge darkMode={darkMode} color="orange">قيد المراجعة</Badge>
                  : c.status === 'approved'
                    ? <Badge darkMode={darkMode} color="green">تم الشحن</Badge>
                    : <Badge darkMode={darkMode} color="red">مرفوض</Badge>;
                return (
                  <div key={c.id} className={`rounded-2xl border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                    <div className="flex items-start gap-3">
                      <img src={c.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.user_id}`} alt="" className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-sm ${textCls}`}>{c.user_name}</span>
                          {statusBadge}
                        </div>
                        <p className={`text-xs mt-0.5 ${mutedCls}`}>{Number(c.amount).toLocaleString()} {t('common.egp')} • {c.method}</p>
                        {/* Phone number */}
                        {c.user_phone ? (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{c.user_phone}</span>
                            <a href={`tel:${c.user_phone}`} className="text-[9px] text-blue-500 hover:text-blue-700 underline">{t('admin.call', 'اتصال')}</a>
                          </div>
                        ) : (
                          <div className={`mt-1.5 inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'}`}>
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>⚠️ لا يوجد رقم هاتف</span>
                          </div>
                        )}
                        {/* Additional phone */}
                        {c.additional_phone && c.additional_phone.trim() !== '' && (
                          <div className={`mt-1 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-orange-900/30 border-orange-700' : 'bg-orange-50 border-orange-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-orange-600" />
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>رقم آخر:</span>
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-orange-400' : 'text-orange-700'}`} dir="ltr">{c.additional_phone}</span>
                            <a href={`tel:${c.additional_phone}`} className="text-[9px] text-orange-500 hover:text-orange-700 underline">{t('admin.call', 'اتصال')}</a>
                          </div>
                        )}
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>{c.created_at ? formatTimeAgo(c.created_at) : ''}</p>
                        {/* Receipt Image */}
                        {c.receipt_image && (
                          <div className="mt-2">
                            <a href={c.receipt_image} target="_blank" rel="noopener noreferrer" className="inline-block">
                              <img
                                src={c.receipt_image}
                                alt={t('admin.transferReceipt', 'إيصال التحويل')}
                                className={`max-w-[180px] max-h-[120px] rounded-xl border object-cover cursor-pointer hover:shadow-md transition-all ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </a>
                            <p className={`text-[9px] font-bold mt-1 flex items-center gap-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                              <ImageIcon className="w-3 h-3" />{t('admin.transferReceiptClickToEnlarge', 'إيصال التحويل — اضغط للتكبير')}
                            </p>
                          </div>
                        )}
                        {!c.receipt_image && c.status === 'pending' && (
                          <p className="text-[9px] text-red-500 font-bold mt-1">⚠️ {t('admin.noReceiptAttached', 'لا يوجد إيصال مرفق')}</p>
                        )}
                      </div>
                      {c.status === 'pending' && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Btn
                            darkMode={darkMode}
                            variant="primary"
                            size="sm"
                            disabled={actionLoadingId === `c-approve-${c.id}`}
                            onClick={() => handleApproveCharge(c.id)}
                          >
                            {actionLoadingId === `c-approve-${c.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            تأكيد الشحن
                          </Btn>
                          <Btn
                            darkMode={darkMode}
                            variant="danger"
                            size="sm"
                            disabled={actionLoadingId === `c-reject-${c.id}`}
                            onClick={() => handleRejectCharge(c.id)}
                          >
                            {actionLoadingId === `c-reject-${c.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            رفض
                          </Btn>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredCharges.length === 0 && (
                <EmptyState darkMode={darkMode} icon={<CreditCard className="w-12 h-12" />} text="لا توجد طلبات شحن" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
