import { api } from '../../services/api';
import { formatRelativeTimeAr } from '../../utils/time';

// ─── Admin Fetch Helper ──────────────────────────────────────────────
export async function adminFetch<T = any>(method: string, endpoint: string, body?: any): Promise<T> {
  const token = api.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`/api${endpoint}`, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(data.error || 'Request failed');
  }
  const text = await res.text();
  if (!text || text.trim() === '') return {} as T;
  return JSON.parse(text) as T;
}

// ─── Time Formatting ────────────────────────────────────────────────
export const formatTimeAgo = (dateStr: string) => formatRelativeTimeAr(dateStr);

// ─── Colors ──────────────────────────────────────────────────────────
export const ORANGE = '#f27d26';
export const PIE_COLORS = ['#f27d26', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];

// ─── Transaction Type Labels (use i18n keys: admin.txDeposit, etc.) ──
export const TX_TYPE_KEYS: Record<string, string> = {
  deposit: 'admin.txDeposit',
  charge_request: 'admin.txChargeRequest',
  promotion_debit: 'admin.txPromotionDebit',
  promotion_refund: 'admin.txRefund',
  admin_deposit: 'admin.txAdminDeposit',
  admin_withdrawal: 'admin.txAdminWithdrawal',
  withdrawal: 'wallet.withdrawal',
  gift_sent: 'wallet.giftSent',
  gift_received: 'wallet.giftReceived',
};

// ─── Tooltip Style Helper ────────────────────────────────────────────
export const getTooltipStyle = (darkMode: boolean) => ({
  borderRadius: 12,
  border: darkMode ? '1px solid #374151' : '1px solid #f3f4f6',
  fontSize: 12,
  background: darkMode ? '#1f2937' : '#fff',
  color: darkMode ? '#fff' : '#000',
});

// ─── Shared Input Class ──────────────────────────────────────────────
export const inputClass = (darkMode: boolean) =>
  `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${
    darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'
  }`;

// ─── Shared Select Class ─────────────────────────────────────────────
export const selectClass = (darkMode: boolean) =>
  `px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none ${
    darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200 text-gray-600'
  }`;

// ─── Card Class ──────────────────────────────────────────────────────
export const cardClass = (darkMode: boolean) =>
  `${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border`;

// ─── Default Chart Data (use i18n keys for day names) ────────────────
export const getDefaultChartData = (t: (key: string) => string) => [
  { name: t('admin.day_sat'), ads: 400 },
  { name: t('admin.day_sun'), ads: 300 },
  { name: t('admin.day_mon'), ads: 200 },
  { name: t('admin.day_tue'), ads: 278 },
  { name: t('admin.day_wed'), ads: 189 },
  { name: t('admin.day_thu'), ads: 239 },
  { name: t('admin.day_fri'), ads: 349 },
];
