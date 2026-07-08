import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { formatTimeAgo, selectClass, TX_TYPE_KEYS } from './helpers';
import { TransactionItem } from './types';
import { Badge, Btn, EmptyState } from './shared';

interface TransactionsTabProps {
  transactions: TransactionItem[];
  txFilter: string;
  setTxFilter: React.Dispatch<React.SetStateAction<string>>;
  txPage: number;
  setTxPage: React.Dispatch<React.SetStateAction<number>>;
  txTotal: number;
  darkMode: boolean;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  transactions, txFilter, setTxFilter, txPage, setTxPage, txTotal, darkMode,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select value={txFilter} onChange={e => { setTxFilter(e.target.value); setTxPage(1); }} className={selectClass(darkMode)}>
          <option value="all">{t('admin.allTypes')}</option>
          <option value="deposit">{t('admin.txDeposit')}</option>
          <option value="charge_request">{t('admin.txChargeRequest')}</option>
          <option value="promotion_debit">{t('admin.txPromotionDebit')}</option>
          <option value="promotion_refund">{t('admin.txRefund')}</option>
          <option value="admin_deposit">{t('admin.txAdminDeposit')}</option>
          <option value="admin_withdrawal">{t('admin.txAdminWithdrawal')}</option>
        </select>
        <Badge darkMode={darkMode} color="blue">{t('admin.totalLabel')} {txTotal}</Badge>
      </div>

      <div className="grid gap-2 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {transactions.map(tx => (
          <div key={tx.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-500' : darkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-500'}`}>
              {tx.amount > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{tx.user_name || t('admin.unknown')}</span>
                <Badge darkMode={darkMode} color="gray">{TX_TYPE_KEYS[tx.type] ? t(TX_TYPE_KEYS[tx.type]) : tx.type}</Badge>
                <Badge darkMode={darkMode} color={tx.status === 'completed' ? 'green' : 'orange'}>{tx.status}</Badge>
              </div>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{tx.method} • {tx.created_at ? formatTimeAgo(tx.created_at) : ''}</p>
            </div>
            <span className={`font-black text-sm ${tx.amount > 0 ? darkMode ? 'text-green-400' : 'text-green-600' : darkMode ? 'text-red-400' : 'text-red-500'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount} {t('common.egp')}</span>
          </div>
        ))}
        {transactions.length === 0 && <EmptyState darkMode={darkMode} icon={<Wallet className="w-12 h-12" />} text={t('admin.noTransactions')} />}
      </div>

      {txTotal > 50 && (
        <div className="flex justify-center gap-2">
          <Btn darkMode={darkMode} variant="outline" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>{t('admin.previous')}</Btn>
          <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'} py-2`}>{t('admin.page')} {txPage}</span>
          <Btn darkMode={darkMode} variant="outline" onClick={() => setTxPage(p => p + 1)}>{t('admin.next')}</Btn>
        </div>
      )}
    </div>
  );
};
