import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight,
  Wallet,
  Smartphone,
  Cpu,
  ShieldCheck,
  X,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CreditCard,
  Camera,
  ImagePlus,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Zap,
  Phone,
  Gift,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Lock,
  Shield,
  Star,
  Info,
  ArrowLeftRight,
  PiggyBank,
  Award,
  Medal,
  Search,
  Target,
  Calendar,
  Plus,
  Trash2,
  Banknote,
  Building2,
  Users,
  Send,
  PartyPopper,
  Store,
  PieChart as PieChartIcon,
  AlertCircle,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast as sonnerToast } from 'sonner';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { useSafeBack } from '../hooks/useSafeBack';

// Critical error toast — bypasses silentToast's silent-success wrapper
// so genuinely important errors (money failures, network errors) still
// surface to the user.
function criticalError(msg: string) {
  (toast as unknown as { error: (m: string, opts?: Record<string, unknown>) => void }).error(msg, { critical: true });
}

export const WalletPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode, transactions, addTransaction, addChargingRequest, addNotification } = useAppContext();
  const { currentUser, refreshCurrentUser } = useAuth();
  const { t } = useTranslation();
  const { dir, language } = useLanguage();

  const [showDeposit, setShowDeposit] = useState(false);
  const [amount, setAmount] = useState('');
  const [confirmStep, setConfirmStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [pendingAmount, setPendingAmount] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<string>('vfcash');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [additionalPhone, setAdditionalPhone] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'charge_request' | 'deposit' | 'promotion_debit' | 'promotion_refund' | 'withdrawal' | 'admin_deposit' | 'admin_withdrawal' | 'gift_sent' | 'gift_received' | 'savings_debit' | 'savings_refund' | 'transfer_out' | 'transfer_in' | 'gift_withdrawal'>('all');
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [activeWalletTab, setActiveWalletTab] = useState<'overview' | 'charge' | 'transfer' | 'withdraw' | 'history' | 'savings' | 'gifts' | 'insights'>('overview');
  const [txSearch, setTxSearch] = useState('');
  const [showNewGoalForm, setShowNewGoalForm] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [savingsGoals, setSavingsGoals] = useState<{
    id: string;
    name: string;
    target: number;
    current: number;
    deadline: string;
  }[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Gift balance state (gift_balance is separate from wallet_balance) ──
  const [giftBalance, setGiftBalance] = useState(0);
  const [giftHistory, setGiftHistory] = useState<any[]>([]);
  const [isLoadingGifts, setIsLoadingGifts] = useState(false);
  const [showGiftWithdrawConfirm, setShowGiftWithdrawConfirm] = useState(false);
  const [isWithdrawingGifts, setIsWithdrawingGifts] = useState(false);

  // ─── External Withdrawal state (5% fee + admin approval) ──
  // `withdrawStep` mirrors the transfer flow: select network/amount →
  // review fee breakdown → submit → success.
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNetwork, setWithdrawNetwork] = useState<string>('vodafone_cash');
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState('');
  const [withdrawStep, setWithdrawStep] = useState<'form' | 'confirm' | 'success'>('form');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<any[]>([]);
  const [isLoadingWithdrawHistory, setIsLoadingWithdrawHistory] = useState(false);
  const [lastWithdrawResult, setLastWithdrawResult] = useState<{ amount: number; fee: number; net: number; network: string; accountNumber: string } | null>(null);

  // ─── Transfer to friend state (NEW) ───────────────────────────────
  const [transferSearch, setTransferSearch] = useState('');
  const [transferSearchResults, setTransferSearchResults] = useState<any[]>([]);
  const [transferSelectedFriend, setTransferSelectedFriend] = useState<any | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferStep, setTransferStep] = useState<'select' | 'amount' | 'confirm' | 'success'>('select');
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  // ─── Celebration state (NEW) ──────────────────────────────────────
  const [celebratingGoalId, setCelebratingGoalId] = useState<string | null>(null);

  // NOTE: All hooks must run on every render — never place an early `return`
  // before the last hook. The `if (!currentUser) return null;` guard lives
  // just before the JSX return at the bottom of this component.

  // Load savings goals from API
  useEffect(() => {
    const loadGoals = async () => {
      setIsLoadingGoals(true);
      try {
        const goals = await api.getSavingsGoals();
        if (Array.isArray(goals) && goals.length > 0) {
          setSavingsGoals(goals.map((g: any) => ({
            id: g.id,
            name: g.name,
            target: g.target_amount || g.target,
            current: g.current_amount || g.current,
            deadline: g.deadline || '',
          })));
        }
      } catch {
        // Goals not available yet, use empty array
      } finally {
        setIsLoadingGoals(false);
      }
    };
    loadGoals();
  }, []);

  const paymentAccounts = [
    { id: 'vfcash', name: t('wallet.vodafoneCash'), icon: Smartphone, color: 'bg-red-500', number: '01010023494', subtitle: 'Vodafone Cash', instructions: t('wallet.vfcashInstructions', 'حوّل المبلغ إلى رقم فودافون كاش الموضح، ثم ارفع صورة الإيصال.'), comingSoon: false },
    { id: 'instapay', name: t('wallet.instaPay'), icon: Cpu, color: 'bg-purple-500', number: 'swIze9495', subtitle: 'InstaPay', instructions: t('wallet.instapayInstructions', 'حوّل عبر تطبيق إنستا باي إلى المعرف الموضح، ثم ارفع صورة الإيصال.'), comingSoon: false },
    { id: 'fawry', name: t('wallet.fawry', 'فوري'), icon: Store, color: 'bg-yellow-500', number: '782451', subtitle: 'Fawry', instructions: t('wallet.fawryInstructions', 'ادفع عند أي ماكينة فوري باستخدام كود الخدمة الموضح، ثم ارفع صورة الإيصال.'), comingSoon: true },
    { id: 'etisalat', name: t('wallet.etisalatCash'), icon: Smartphone, color: 'bg-emerald-500', number: '01112345678', subtitle: 'Etisalat Cash', instructions: t('wallet.etisalatInstructions', 'حوّل المبلغ إلى رقم اتصالات كاش الموضح، ثم ارفع صورة الإيصال.'), comingSoon: true },
    { id: 'orange', name: t('wallet.orangeCash', 'أورانج كاش'), icon: Smartphone, color: 'bg-orange-500', number: '01223456789', subtitle: 'Orange Cash', instructions: t('wallet.orangeInstructions', 'حوّل المبلغ إلى رقم أورانج كاش الموضح، ثم ارفع صورة الإيصال.'), comingSoon: true },
    { id: 'bank', name: t('wallet.bankTransfer'), icon: Building2, color: 'bg-blue-500', number: 'EG-00123456789', subtitle: t('wallet.bankTransferSubtitle', 'حساب بنكي'), instructions: t('wallet.bankInstructions', 'حوّل بنكيًا إلى الحساب الموضح، ثم ارفع صورة إيصال التحويل.'), comingSoon: true },
  ];

  // Wallet Stats
  const walletStats = useMemo(() => {
    const deposits = transactions.filter(tx => tx.type === 'deposit');
    const promotions = transactions.filter(tx => tx.type === 'promotion_debit');
    const refunds = transactions.filter(tx => tx.type === 'promotion_refund');
    const chargeRequests = transactions.filter(tx => tx.type === 'charge_request');
    const totalDeposited = deposits.reduce((s, tx) => s + tx.amount, 0);
    // H8 fix: totalSpent now subtracts refunds so rejected promotions
    // don't count as "spent". Previously a 5000 EGP promotion that was
    // rejected (and refunded) still counted as 5000 EGP spent.
    const totalSpent = promotions.reduce((s, tx) => s + tx.amount, 0) - refunds.reduce((s, tx) => s + tx.amount, 0);
    const totalRefunded = refunds.reduce((s, tx) => s + tx.amount, 0);
    const pendingCount = transactions.filter(tx => tx.status === 'pending').length;
    const pendingAmount = transactions.filter(tx => tx.status === 'pending').reduce((s, tx) => s + tx.amount, 0);
    return { totalDeposited, totalSpent: Math.max(0, totalSpent), totalRefunded, pendingCount, pendingAmount, depositCount: deposits.length, promotionCount: promotions.length, chargeRequestCount: chargeRequests.length };
  }, [transactions]);

  // Recent transactions (last 5)
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  // Filtered transactions (with search)
  const filteredTransactions = useMemo(() => {
    let filtered = txFilter === 'all' ? transactions : transactions.filter(tx => tx.type === txFilter);
    if (txSearch.trim()) {
      const q = txSearch.trim().toLowerCase();
      filtered = filtered.filter(tx =>
        (tx.method && tx.method.toLowerCase().includes(q)) ||
        (tx.type && tx.type.toLowerCase().includes(q)) ||
        (tx.amount && tx.amount.toString().includes(q))
      );
    }
    return filtered;
  }, [transactions, txFilter, txSearch]);

  // Balance history for mini-chart (last 7 entries based on running balance)
  const balanceHistory = useMemo(() => {
    // Credit types increase balance, debit types decrease balance
    // H7 fix: added 'savings_refund' (credit) and 'savings_debit' (debit)
    const creditTypes = ['deposit', 'promotion_refund', 'admin_deposit', 'gift_received', 'savings_refund', 'transfer_in', 'gift_withdrawal'];
    const debitTypes = ['promotion_debit', 'admin_withdrawal', 'withdrawal', 'gift_sent', 'savings_debit', 'transfer_out'];
    // charge_request is pending — doesn't affect balance yet
    
    let runningBalance = currentUser?.walletBalance || 0;
    const entries: { label: string; value: number }[] = [];
    // Start from current balance and work backwards
    const recent = transactions.slice(0, 7).reverse();
    for (const tx of recent) {
      // Reverse the effect: if it was a credit, subtract; if debit, add back
      if (creditTypes.includes(tx.type) && tx.status === 'completed') {
        runningBalance -= tx.amount;
      } else if (debitTypes.includes(tx.type) && (tx.status === 'completed' || tx.status === 'pending')) {
        runningBalance += tx.amount;
      }
      // charge_request with pending/approved status doesn't affect balance
      entries.push({
        label: tx.timestamp ? parseDBTimestamp(tx.timestamp).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { day: 'numeric', month: 'short' }) : '',
        value: Math.max(0, runningBalance),
      });
    }
    entries.push({ label: t('common.now'), value: currentUser?.walletBalance || 0 });
    return entries.slice(-7);
  }, [transactions, currentUser?.walletBalance, t, language]);

  // Rewards & Cashback calculations
  const rewardsInfo = useMemo(() => {
    const totalSpent = walletStats.totalSpent;
    const points = Math.floor(totalSpent / 10);
    let tier: string;
    let tierColor: string;
    let tierBg: string;
    let cashbackPercent: number;
    let nextTierAmount: number;
    if (totalSpent >= 2000) {
      tier = 'ذهبي';
      tierColor = 'text-yellow-500';
      tierBg = darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50';
      cashbackPercent = 5;
      nextTierAmount = 0;
    } else if (totalSpent >= 500) {
      tier = 'فضي';
      tierColor = 'text-gray-400';
      tierBg = darkMode ? 'bg-gray-600/30' : 'bg-gray-100';
      cashbackPercent = 3;
      nextTierAmount = 2000 - totalSpent;
    } else {
      tier = 'برونزي';
      tierColor = 'text-orange-600';
      tierBg = darkMode ? 'bg-orange-900/30' : 'bg-orange-50';
      cashbackPercent = 1;
      nextTierAmount = 500 - totalSpent;
    }
    return { points, tier, tierColor, tierBg, cashbackPercent, nextTierAmount, totalSpent };
  }, [walletStats.totalSpent, darkMode]);

  // Add savings goal handler (persisted to DB)
  const handleAddGoal = async () => {
    if (!newGoalName.trim() || !newGoalTarget || parseFloat(newGoalTarget) <= 0) {
      toast.error(t('wallet.invalidGoalInfo'));
      return;
    }
    try {
      const goal = await api.createSavingsGoal(
        newGoalName.trim(),
        parseFloat(newGoalTarget),
        newGoalDeadline || undefined
      );
      setSavingsGoals(prev => [...prev, {
        id: goal.id,
        name: goal.name,
        target: goal.target_amount || goal.target,
        current: goal.current_amount || goal.current || 0,
        deadline: goal.deadline || '',
      }]);
      setNewGoalName('');
      setNewGoalTarget('');
      setNewGoalDeadline('');
      setShowNewGoalForm(false);
      toast.success(t('wallet.goalAdded'));
    } catch {
      toast.error(t('wallet.goalAddFailed'));
    }
  };

  // Delete savings goal handler (persisted to DB)
  const handleDeleteGoal = async (id: string) => {
    try {
      await api.deleteSavingsGoal(id);
      setSavingsGoals(prev => prev.filter(g => g.id !== id));
      toast.success(t('wallet.goalDeleted'));
    } catch {
      toast.error(t('wallet.goalDeleteFailed'));
    }
  };

  // Add amount to savings goal (persisted to DB)
  const handleAddToGoal = async (id: string, amount: number) => {
    if (!amount || amount <= 0) {
      toast.error(t('wallet.enterValidAmount'));
      return;
    }
    if (amount > (currentUser?.walletBalance || 0)) {
      toast.error(t('wallet.insufficientBalance', 'رصيد المحفظة غير كافٍ'));
      return;
    }
    try {
      const updated = await api.addToSavingsGoal(id, amount);
      const newCurrent = updated.current_amount || updated.current || 0;
      const target = updated.target_amount || updated.target || 0;
      setSavingsGoals(prev => prev.map(g =>
        g.id === id ? {
          ...g,
          current: newCurrent,
        } : g
      ));
      toast.success(t('wallet.goalAmountAdded', { amount: amount.toLocaleString() }));
      // 🎉 Trigger celebration if goal reached
      if (target > 0 && newCurrent >= target) {
        setCelebratingGoalId(id);
        setTimeout(() => setCelebratingGoalId(null), 4000);
      }
      // Refresh wallet balance
      await refreshCurrentUser();
    } catch (err: any) {
      toast.error(err.message || t('wallet.goalUpdateFailed'));
    }
  };

  // Withdraw amount from savings goal back to wallet
  const handleWithdrawFromGoal = async (id: string, amount: number) => {
    if (!amount || amount <= 0) {
      toast.error(t('wallet.enterValidAmount'));
      return;
    }
    try {
      const updated = await api.withdrawFromSavingsGoal(id, amount);
      setSavingsGoals(prev => prev.map(g =>
        g.id === id ? {
          ...g,
          current: updated.current_amount || updated.current || g.current,
        } : g
      ));
      toast.success(t('wallet.goalAmountWithdrawn', { amount: amount.toLocaleString() }));
      await refreshCurrentUser();
    } catch (err: any) {
      toast.error(err.message || t('wallet.goalUpdateFailed'));
    }
  };

  // Spending percentage for visual bar
  const spendingPercentage = walletStats.totalDeposited > 0
    ? Math.round((walletStats.totalSpent / walletStats.totalDeposited) * 100)
    : 0;

  // Quick charge amounts
  const quickAmounts = [50, 100, 200, 500, 1000, 5000];

  const handleDeposit = () => {
    const val = parseFloat(amount);
    if (!amount || val <= 0) {
      toast.error(t('wallet.enterValidAmount'));
      return;
    }
    if (!receiptImage || receiptImage.trim() === '') {
      toast.error(t('wallet.receiptRequiredError'));
      return;
    }
    if (!currentUser?.phone || currentUser.phone.trim() === '') {
      toast.error(t('wallet.phoneRequired'));
      return;
    }
    setPendingAmount(val);
    setConfirmStep('confirm');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('wallet.imageTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const result = await api.uploadImage(file);
      setReceiptImage(result.url);
      toast.success(t('wallet.receiptUploadSuccess'));
    } catch {
      toast.error(t('wallet.imageUploadFailed'));
    }
  };

  const removeReceiptImage = () => {
    setReceiptImage('');
    setReceiptPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmTransaction = async () => {
    const acc = paymentAccounts.find(a => a.id === selectedMethod);
    const methodName = acc ? acc.name : selectedMethod;
    try {
      await api.chargeRequest(pendingAmount, selectedMethod, receiptImage, additionalPhone);
      addChargingRequest({
        id: `charge_${Date.now()}`,
        userId: currentUser!.id,
        userName: currentUser!.name,
        userAvatar: currentUser!.avatar,
        userPhone: currentUser!.phone || '',
        amount: pendingAmount,
        method: methodName,
        receiptImage: receiptImage || undefined,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      addTransaction({
        id: `tx_${Date.now()}`,
        type: 'charge_request',
        amount: pendingAmount,
        method: methodName,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
      toast.success(t('wallet.chargeRequestSubmitted', { amount: pendingAmount.toLocaleString() }));
      await refreshCurrentUser();
      setConfirmStep('success');
      setAmount('');
      setReceiptImage('');
      setReceiptPreview('');
      setAdditionalPhone('');
      setTimeout(() => {
        setConfirmStep('input');
        setShowDeposit(false);
        setActiveWalletTab('overview');
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || t('wallet.chargeFailed'));
    }
  };

  const handleCancelTransaction = () => {
    setConfirmStep('input');
    setPendingAmount(0);
  };

  // ─── Gift balance: load + withdraw-to-wallet handler ─────────────
  const loadGifts = useCallback(async () => {
    setIsLoadingGifts(true);
    try {
      const data = await api.getWalletGifts();
      setGiftBalance(Number(data?.giftBalance || 0));
      setGiftHistory(Array.isArray(data?.history) ? data.history : []);
    } catch {
      // best-effort — gifts endpoint may be unavailable
      setGiftBalance(0);
      setGiftHistory([]);
    } finally {
      setIsLoadingGifts(false);
    }
  }, []);

  // Reload gift balance whenever the Gifts tab is opened.
  useEffect(() => {
    if (activeWalletTab === 'gifts') loadGifts();
  }, [activeWalletTab, loadGifts]);

  // Reload gift balance on mount (so the balance card can show it too).
  useEffect(() => { loadGifts(); }, [loadGifts]);

  const handleWithdrawGifts = async () => {
    if (giftBalance <= 0) {
      toast.error('لا يوجد رصيد هدايا لتحويله');
      return;
    }
    setIsWithdrawingGifts(true);
    try {
      const result = await api.withdrawGifts();
      // Use sonner directly so the success toast is actually shown
      // (silentToast.success is a no-op by design).
      sonnerToast.success(`تم تحويل ${result.net.toLocaleString()} ج.م إلى محفظتك بالكامل بدون رسوم`);
      setGiftBalance(Number(result.newGiftBalance || 0));
      setShowGiftWithdrawConfirm(false);
      await refreshCurrentUser();
      // Reload history to reflect the new balance
      loadGifts();
    } catch (err: any) {
      criticalError(err.message || 'فشل تحويل رصيد الهدايا');
    } finally {
      setIsWithdrawingGifts(false);
    }
  };

  // ─── External Withdrawal handlers (NEW — 5% fee + admin approval) ──
  // Networks supported by the backend (must match WITHDRAWAL_NETWORKS in
  // src/routes/wallet.ts). Each entry includes a friendly Arabic label,
  // the Lucide icon, the brand color, and the placeholder for the
  // account-number input (phone / handle / code / IBAN).
  const withdrawNetworks = useMemo(() => ([
    { id: 'vodafone_cash',  label: 'فودافون كاش',   icon: Smartphone, color: 'bg-red-500',     accent: darkMode ? 'text-red-400' : 'text-red-600',     placeholder: '01xxxxxxxxx', inputMode: 'tel' as const, comingSoon: false },
    { id: 'instapay',       label: 'إنستا باي',     icon: Cpu,        color: 'bg-purple-500',  accent: darkMode ? 'text-purple-400' : 'text-purple-600',  placeholder: 'اسم المستخدم أو المعرف', inputMode: 'text' as const, comingSoon: false },
    { id: 'fawry',          label: 'فوري',          icon: Store,      color: 'bg-yellow-500',  accent: darkMode ? 'text-yellow-400' : 'text-yellow-700',  placeholder: 'كود فوري (7 أرقام)', inputMode: 'numeric' as const, comingSoon: true },
    { id: 'etisalat_cash',  label: 'اتصالات كاش',   icon: Smartphone, color: 'bg-emerald-500', accent: darkMode ? 'text-emerald-400' : 'text-emerald-600', placeholder: '011xxxxxxxx', inputMode: 'tel' as const, comingSoon: true },
    { id: 'orange_cash',    label: 'أورانج كاش',    icon: Smartphone, color: 'bg-orange-500',  accent: darkMode ? 'text-orange-400' : 'text-orange-600',  placeholder: '012xxxxxxxx', inputMode: 'tel' as const, comingSoon: true },
    { id: 'bank_transfer',  label: 'تحويل بنكي',    icon: Building2,  color: 'bg-blue-500',    accent: darkMode ? 'text-blue-400' : 'text-blue-600',      placeholder: 'رقم الحساب البنكي / IBAN', inputMode: 'text' as const, comingSoon: true },
  ]), [darkMode]);

  // 5% external withdrawal fee (must match EXTERNAL_WITHDRAWAL_FEE_RATE
  // in src/routes/wallet.ts).
  const WITHDRAW_FEE_RATE = 0.05;

  // Live fee/net preview based on the current input.
  const withdrawPreview = useMemo(() => {
    const amt = parseFloat(withdrawAmount) || 0;
    const fee = Math.round(amt * WITHDRAW_FEE_RATE * 100) / 100;
    const net = Math.round((amt - fee) * 100) / 100;
    return { amount: amt, fee, net };
  }, [withdrawAmount]);

  const loadWithdrawHistory = useCallback(async () => {
    setIsLoadingWithdrawHistory(true);
    try {
      const data = await api.getWithdrawalRequests();
      setWithdrawHistory(Array.isArray(data) ? data : []);
    } catch {
      setWithdrawHistory([]);
    } finally {
      setIsLoadingWithdrawHistory(false);
    }
  }, []);

  // Reload the user's withdrawal history whenever the Withdraw tab is opened.
  useEffect(() => {
    if (activeWalletTab === 'withdraw') loadWithdrawHistory();
  }, [activeWalletTab, loadWithdrawHistory]);

  const resetWithdrawForm = () => {
    setWithdrawAmount('');
    setWithdrawAccountNumber('');
    setWithdrawNetwork('vodafone_cash');
    setWithdrawStep('form');
    setLastWithdrawResult(null);
  };

  const handleWithdrawSubmit = () => {
    const amt = parseFloat(withdrawAmount);
    if (!withdrawAmount || amt <= 0) {
      toast.error(t('wallet.enterValidAmount'));
      return;
    }
    if (amt < 50) {
      toast.error(t('wallet.minWithdraw', 'الحد الأدنى للسحب 50 ج.م'));
      return;
    }
    if (amt > (currentUser?.walletBalance || 0)) {
      toast.error(t('wallet.insufficientBalance', 'رصيد المحفظة غير كافٍ'));
      return;
    }
    const acct = withdrawAccountNumber.trim();
    if (!acct) {
      toast.error('أدخل رقم الحساب / المحفظة الخارجية');
      return;
    }
    if (acct.length < 4) {
      toast.error('رقم الحساب غير صالح');
      return;
    }
    setWithdrawStep('confirm');
  };

  const handleWithdrawConfirm = async () => {
    setIsSubmittingWithdraw(true);
    try {
      const amt = parseFloat(withdrawAmount);
      const result = await api.requestExternalWithdrawal(
        amt,
        withdrawNetwork,
        withdrawAccountNumber.trim(),
      );
      // Record the pending withdrawal in the local transactions list so
      // it shows up immediately in the History tab without a refetch.
      addTransaction({
        id: `tx_${Date.now()}`,
        type: 'withdrawal',
        amount: amt,
        method: `withdraw:${withdrawNetwork}`,
        timestamp: new Date().toISOString(),
        status: 'pending',
        referenceId: result.withdrawalId,
      });
      setLastWithdrawResult({
        amount: result.amount,
        fee: result.fee,
        net: result.net,
        network: result.network,
        accountNumber: result.accountNumber,
      });
      // Use sonner directly so the success toast is actually shown.
      sonnerToast.success('تم إنشاء طلب السحب، سيتم مراجعته خلال 24 ساعة');
      await refreshCurrentUser();
      setWithdrawStep('success');
      // Refresh the history list in the background so the new request shows up.
      loadWithdrawHistory();
    } catch (err: any) {
      criticalError(err.message || t('wallet.withdrawFailed', 'فشل إنشاء طلب السحب'));
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  // ─── Transfer-to-friend handlers (NEW) ───────────────────────────
  const handleSearchUsers = async (query: string) => {
    setTransferSearch(query);
    if (query.trim().length < 2) {
      setTransferSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const results = await api.searchUsers(query.trim());
      setTransferSearchResults(Array.isArray(results) ? results.slice(0, 8) : []);
    } catch {
      setTransferSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleSelectFriend = (user: any) => {
    setTransferSelectedFriend(user);
    setTransferSearch('');
    setTransferSearchResults([]);
    setTransferStep('amount');
  };

  const handleTransferSubmit = async () => {
    const val = parseFloat(transferAmount);
    if (!transferAmount || val <= 0) {
      toast.error(t('wallet.enterValidAmount'));
      return;
    }
    if (val > (currentUser?.walletBalance || 0)) {
      toast.error(t('wallet.insufficientBalance'));
      return;
    }
    setTransferStep('confirm');
  };

  const handleTransferConfirm = async () => {
    if (!transferSelectedFriend) return;
    setIsSubmittingTransfer(true);
    try {
      const val = parseFloat(transferAmount);
      const result = await api.walletTransfer(
        transferSelectedFriend.id,
        val,
        transferNote.trim() || undefined,
      );
      const methodLabel = `${t('wallet.transferToFriend', 'تحويل لصديق')}: ${transferSelectedFriend.name || transferSelectedFriend.id}`;
      addTransaction({
        id: `tx_${Date.now()}`,
        type: 'transfer_out',
        amount: val,
        method: methodLabel,
        timestamp: new Date().toISOString(),
        status: 'pending',
        referenceId: result.transferId,
      });
      // Use sonner directly so the success toast is actually shown
      // (silentToast.success is a no-op by design).
      sonnerToast.success(`تم إرسال التحويل — بانتظار موافقة ${transferSelectedFriend.name || 'المستلم'}`);
      await refreshCurrentUser();
      setTransferStep('success');
    } catch (err: any) {
      criticalError(err.message || t('wallet.transferFailed', 'فشل إرسال التحويل'));
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const resetTransferForm = () => {
    setTransferSelectedFriend(null);
    setTransferAmount('');
    setTransferNote('');
    setTransferSearch('');
    setTransferSearchResults([]);
    setTransferStep('select');
  };

  // ─── Spending insights by category (NEW) ─────────────────────────
  const spendingByCategory = useMemo(() => {
    // Categorize spending transactions into marketing buckets
    const buckets: { key: string; label: string; amount: number; color: string; icon: React.ElementType }[] = [
      { key: 'promotion', label: t('wallet.promotionDebit'), amount: 0, color: 'bg-orange-500', icon: Zap },
      { key: 'gifts', label: t('wallet.giftSent', 'هدايا'), amount: 0, color: 'bg-pink-500', icon: Gift },
      { key: 'transfers', label: t('wallet.transferToFriend', 'تحويلات'), amount: 0, color: 'bg-blue-500', icon: ArrowLeftRight },
      { key: 'savings', label: t('wallet.savingsDebit', 'ادخار'), amount: 0, color: 'bg-emerald-500', icon: PiggyBank },
      { key: 'withdrawals', label: t('wallet.withdrawal', 'سحب'), amount: 0, color: 'bg-red-500', icon: Banknote },
    ];
    for (const tx of transactions) {
      if (tx.status !== 'completed' && tx.status !== 'pending') continue;
      const type = tx.type as string;
      if (type === 'promotion_debit') buckets[0].amount += tx.amount;
      else if (type === 'gift_sent') buckets[1].amount += tx.amount;
      else if (type === 'transfer_out') buckets[2].amount += tx.amount;
      else if (type === 'withdrawal' || type === 'admin_withdrawal') buckets[4].amount += tx.amount;
      else if (type === 'savings_debit') buckets[3].amount += tx.amount;
    }
    return buckets;
  }, [transactions, t]);

  const totalSpendingForInsights = spendingByCategory.reduce((s, b) => s + b.amount, 0);

  // Transaction type helpers
  const isCreditTx = (type: string) => ['deposit', 'promotion_refund', 'admin_deposit', 'gift_received', 'savings_refund', 'transfer_in', 'gift_withdrawal'].includes(type);
  const isPendingTx = (type: string) => type === 'charge_request' || type === 'transfer_out'; // Pending requests — not yet credited
  const isDebitTx = (type: string) => ['promotion_debit', 'admin_withdrawal', 'withdrawal', 'gift_sent', 'savings_debit', 'transfer_out'].includes(type);

  const getTxLabel = (type: string) => {
    switch (type) {
      case 'charge_request': return t('wallet.chargeRequest');
      case 'deposit': return t('wallet.deposit');
      case 'promotion_debit': return t('wallet.promotionDebit');
      case 'promotion_refund': return t('wallet.promotionRefund');
      case 'admin_deposit': return t('wallet.adminDeposit', 'إيداع أدمن');
      case 'admin_withdrawal': return t('wallet.adminWithdrawal', 'سحب أدمن');
      case 'withdrawal': return t('wallet.withdrawal', 'سحب');
      case 'gift_sent': return t('wallet.giftSent', 'هدية مرسلة');
      case 'gift_received': return t('wallet.giftReceived', 'هدية مستلمة');
      case 'savings_debit': return t('wallet.savingsDebit', 'إيداع في هدف توفير');
      case 'savings_refund': return t('wallet.savingsRefund', 'سحب من هدف توفير');
      case 'transfer_out': return t('wallet.transferOut', 'تحويل صادر');
      case 'transfer_in': return t('wallet.transferIn', 'تحويل وارد');
      case 'gift_withdrawal': return t('wallet.giftWithdrawal', 'تحويل هدايا للمحفظة');
      default: return type;
    }
  };

  const getTxIcon = (type: string) => {
    if (isCreditTx(type)) return <ArrowDownRight className="w-5 h-5" />;
    if (isPendingTx(type)) return <Clock className="w-5 h-5" />;
    return <CreditCard className="w-5 h-5" />;
  };

  const getTxColor = (type: string) => {
    if (isCreditTx(type)) return 'text-green-600';
    if (isPendingTx(type)) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getTxBgColor = (type: string, darkMode: boolean) => {
    if (isCreditTx(type)) return darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600';
    if (isPendingTx(type)) return darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600';
    return darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600';
  };

  const getTxSign = (type: string) => {
    if (isCreditTx(type)) return '+';
    if (isPendingTx(type)) return ''; // No sign for pending
    return '-';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('wallet.copiedToClipboard'));
    }).catch(() => {});
  };

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bgSection = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Guard: must run AFTER all hooks above. Returning null here is safe
  // because every hook has already executed unconditionally.
  if (!currentUser) return null;

  return (
    <div className="max-w-2xl mx-auto overflow-x-hidden" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-black ${textPrimary}`}>
            {t('wallet.smartWallet')}
          </h1>
          <p className={`text-sm ${textMuted}`}>
            {t('wallet.manageBalance')}
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
          <Shield className={`w-3.5 h-3.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
          <span className={`text-[10px] font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{t('wallet.walletSafe')}</span>
        </div>
      </div>

      {/* ═══════════ COMPACT BALANCE CARD ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl mb-4"
      >
        <div className="relative bg-gradient-to-l from-orange-500 via-orange-600 to-amber-600 p-4 text-white shadow-xl shadow-orange-200/20">
          {/* Single decorative glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />

          {/* Top Row: Wallet Icon + Balance */}
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] text-white/60 font-bold leading-none">{t('wallet.availableBalance')}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-3xl font-black tracking-tight leading-none">{currentUser.walletBalance?.toLocaleString() || '0'}</span>
                  <span className="text-sm font-bold opacity-70">{t('common.egp')}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 bg-white/10 px-1.5 py-0.5 rounded">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="text-[8px] font-black">{t('wallet.walletSafe')}</span>
                </div>
                <div className="flex items-center gap-0.5 bg-white/10 px-1.5 py-0.5 rounded">
                  <Lock className="w-3 h-3" />
                  <span className="text-[8px] font-black">SSL</span>
                </div>
              </div>
              {walletStats.pendingCount > 0 && (
                <div className="flex items-center gap-1 bg-yellow-400/20 px-1.5 py-0.5 rounded">
                  <Clock className="w-3 h-3 text-yellow-200" />
                  <span className="text-[8px] font-bold text-yellow-100">{walletStats.pendingCount} {t('wallet.pendingRequests')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions - Horizontal compact row */}
          <div className="flex gap-2 relative z-10">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setActiveWalletTab('charge'); setShowDeposit(true); setConfirmStep('input'); setAmount(''); setReceiptImage(''); setReceiptPreview(''); setAdditionalPhone(''); }}
              className="flex-1 bg-white text-orange-600 py-2 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md hover:bg-gray-50 transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>{t('wallet.chargeWallet')}</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setActiveWalletTab('transfer'); resetTransferForm(); }}
              className="flex-1 bg-white/15 backdrop-blur-sm text-white py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 border border-white/20 hover:bg-white/25 transition-colors"
            >
              <Users className="w-4 h-4" />
              <span>{t('wallet.transferToFriend', 'تحويل')}</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setActiveWalletTab('withdraw'); resetWithdrawForm(); }}
              className="flex-1 bg-white/15 backdrop-blur-sm text-white py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 border border-white/20 hover:bg-white/25 transition-colors"
            >
              <Banknote className="w-4 h-4" />
              <span>{t('wallet.withdraw', 'سحب')}</span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setActiveWalletTab('gifts'); }}
              className="flex-1 bg-white/15 backdrop-blur-sm text-white py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 border border-white/20 hover:bg-white/25 transition-colors"
            >
              <Gift className="w-4 h-4" />
              <span>{t('wallet.gifts', 'الهدايا')}</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ═══════════ WALLET TABS ═══════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className={`flex gap-1 p-1.5 rounded-2xl border mb-6 overflow-x-auto hide-scrollbar ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
      >
        {[
          { id: 'overview' as const, label: t('wallet.overview'), icon: <Wallet className="w-4 h-4" /> },
          { id: 'charge' as const, label: t('wallet.chargeWallet'), icon: <ArrowUpRight className="w-4 h-4" /> },
          { id: 'transfer' as const, label: t('wallet.transferToFriend', 'تحويل'), icon: <Users className="w-4 h-4" /> },
          { id: 'withdraw' as const, label: t('wallet.withdraw', 'سحب'), icon: <Banknote className="w-4 h-4" /> },
          { id: 'gifts' as const, label: t('wallet.gifts', 'الهدايا'), icon: <Gift className="w-4 h-4" /> },
          { id: 'history' as const, label: t('wallet.history'), icon: <Clock className="w-4 h-4" /> },
          { id: 'savings' as const, label: t('wallet.savingsGoals'), icon: <PiggyBank className="w-4 h-4" /> },
          { id: 'insights' as const, label: t('wallet.insights', 'تحليلات'), icon: <PieChartIcon className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveWalletTab(tab.id)}
            className={`flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeWalletTab === tab.id
                ? 'bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-200/30'
                : darkMode
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </motion.div>

      {/* ═══════════ OVERVIEW TAB ═══════════ */}
      <AnimatePresence mode="wait">
        {activeWalletTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            {/* Wallet policy banner — internal transfers are free; external withdrawals have a 5% fee */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <div className="flex-1">
                <p className={`text-sm font-bold ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                  {t('wallet.policyTitle', 'تحويلات داخلية مجانية • سحب خارجي برسوم 5%')}
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400/80' : 'text-blue-700'}`}>
                  {t('wallet.policyDesc', 'التحويل بين مستخدمي نواقص بدون رسوم. السحب إلى فودافون كاش / إنستا باي / فوري وغيرها برسوم 5% ويحتاج موافقة الإدارة خلال 24 ساعة. تحويل الهدايا للمحفظة بدون رسوم.')}
                </p>
              </div>
            </motion.div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={`rounded-2xl border p-4 ${bgCard}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                    <TrendingUp className={`w-4.5 h-4.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                  </div>
                  <span className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.totalDeposited')}</span>
                </div>
                <p className={`text-2xl font-black ${textPrimary}`}>{walletStats.totalDeposited.toLocaleString()}</p>
                <p className={`text-[9px] ${textMuted}`}>{t('common.egp')}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`rounded-2xl border p-4 ${bgCard}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${darkMode ? 'bg-red-900/30' : 'bg-red-50'}`}>
                    <TrendingDown className={`w-4.5 h-4.5 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                  </div>
                  <span className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.totalSpent')}</span>
                </div>
                <p className={`text-2xl font-black ${textPrimary}`}>{walletStats.totalSpent.toLocaleString()}</p>
                <p className={`text-[9px] ${textMuted}`}>{t('common.egp')}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={`rounded-2xl border p-4 ${bgCard}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${darkMode ? 'bg-orange-900/30' : 'bg-orange-50'}`}>
                    <Activity className={`w-4.5 h-4.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  </div>
                  <span className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.pendingRequests')}</span>
                </div>
                <p className={`text-2xl font-black ${textPrimary}`}>{walletStats.pendingCount}</p>
                <p className={`text-[9px] ${textMuted}`}>{t('wallet.waitingApproval')}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`rounded-2xl border p-4 ${bgCard}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${darkMode ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                    <RefreshCw className={`w-4.5 h-4.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>
                  <span className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.totalRefunded')}</span>
                </div>
                <p className={`text-2xl font-black ${textPrimary}`}>{walletStats.totalRefunded.toLocaleString()}</p>
                <p className={`text-[9px] ${textMuted}`}>{t('common.egp')}</p>
              </motion.div>
            </div>

            {/* Spending Progress */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={`rounded-2xl border p-5 ${bgCard}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
                  <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.spendingRatio')}</h3>
                <span className={`text-sm font-black ${darkMode ? 'text-purple-400' : 'text-purple-600'} ms-auto`}>{spendingPercentage}%</span>
              </div>

              <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(spendingPercentage, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    spendingPercentage > 80 ? 'bg-gradient-to-l from-red-500 to-red-400' :
                    spendingPercentage > 50 ? 'bg-gradient-to-l from-orange-500 to-amber-400' :
                    'bg-gradient-to-l from-green-500 to-emerald-400'
                  }`}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-[9px] ${textMuted}`}>{t('wallet.totalSpent')}: {walletStats.totalSpent.toLocaleString()}</span>
                <span className={`text-[9px] ${textMuted}`}>{t('wallet.totalDeposited')}: {walletStats.totalDeposited.toLocaleString()}</span>
              </div>
            </motion.div>

            {/* Balance History Mini-Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.27 }}
              className={`rounded-2xl border p-5 ${bgCard}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                  <Activity className={`w-4 h-4 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.balanceHistory')}</h3>
              </div>
              {balanceHistory.length > 1 ? (
                <div className="flex items-end gap-2 h-28">
                  {balanceHistory.map((entry, i) => {
                    const maxVal = Math.max(...balanceHistory.map(e => e.value), 1);
                    const heightPct = (entry.value / maxVal) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className={`text-[8px] font-bold ${textMuted}`}>{entry.value > 0 ? entry.value.toLocaleString() : '0'}</span>
                        <div className="w-full relative" style={{ height: '80px' }}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(heightPct, 4)}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                            className={`absolute bottom-0 left-0 right-0 rounded-t-lg ${
                              i === balanceHistory.length - 1
                                ? 'bg-gradient-to-t from-orange-500 to-amber-400'
                                : darkMode ? 'bg-gray-600' : 'bg-gray-300'
                            }`}
                          />
                        </div>
                        <span className={`text-[7px] font-bold ${textMuted} truncate w-full text-center`}>{entry.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-xs ${textMuted} text-center py-4`}>{t('wallet.noBalanceHistory')}</p>
              )}
            </motion.div>

            {/* ═══ Rewards & Cashback Section — REMOVED (C6) ═══
                The rewards/cashback UI was removed because there was
                zero backend logic to actually credit cashback to users.
                Showing "5% cashback" with no crediting mechanism was a
                user-trust issue. When a real rewards system is built,
                re-add this section with actual backend crediting. */}



            {/* Payment Methods */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`rounded-2xl border p-5 ${bgCard}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-amber-900/30' : 'bg-amber-50'}`}>
                  <CreditCard className={`w-4 h-4 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.availableMethods')}</h3>
              </div>
              <div className="space-y-3">
                {paymentAccounts.map(acc => (
                  <div key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl ${bgSection} relative ${acc.comingSoon ? 'opacity-60' : ''}`}>
                    <div className={`p-2.5 rounded-xl ${acc.color} shadow-md`}>
                      <acc.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black block ${textPrimary}`}>{acc.name}</span>
                        {acc.comingSoon && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-400 text-white">قريباً</span>
                        )}
                      </div>
                      <span className={`text-[10px] ${textMuted}`}>{acc.subtitle}</span>
                    </div>
                    {acc.comingSoon ? (
                      <div className="flex items-center">
                        <span className={`text-xs font-bold ${textMuted}`}>غير متاح حالياً</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <code className={`text-xs font-bold px-3 py-1.5 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`} dir="ltr">{acc.number}</code>
                        <button
                          onClick={() => copyToClipboard(acc.number)}
                          className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Recent Transactions Preview */}
            {recentTransactions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className={`rounded-2xl border overflow-hidden ${bgCard}`}
              >
                <div className={`px-5 py-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.recentTransactions')}</h3>
                  </div>
                  <button
                    onClick={() => setActiveWalletTab('history')}
                    className="text-[10px] font-bold text-orange-600 hover:underline"
                  >
                    {t('wallet.viewAll')}
                  </button>
                </div>
                <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                  {recentTransactions.map(tx => (
                    <div key={tx.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${getTxBgColor(tx.type, darkMode)}`}>
                          {getTxIcon(tx.type)}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${textPrimary}`}>
                            {getTxLabel(tx.type)}
                          </p>
                          <p className={`text-[10px] ${textMuted}`}>{tx.method}</p>
                        </div>
                      </div>
                      <div className="text-end">
                        <span className={`text-sm font-black ${getTxColor(tx.type)}`}>
                          {getTxSign(tx.type)}{tx.amount.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 justify-end">
                          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                            tx.status === 'completed'
                              ? darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
                              : tx.status === 'pending'
                                ? darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
                                : tx.status === 'approved'
                                  ? darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                                  : tx.status === 'failed'
                                    ? darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                                    : darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'
                          }`}>
                            {tx.status === 'completed' ? t('wallet.completed') : tx.status === 'pending' ? t('wallet.inProgress') : tx.status === 'approved' ? t('wallet.approved', 'معتمد') : tx.status === 'failed' ? t('wallet.failed', 'فشل') : t('common.cancel')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </motion.div>
        )}

        {/* ═══════════ CHARGE TAB ═══════════ */}
        {activeWalletTab === 'charge' && (
          <motion.div
            key="charge"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            {/* Charge Form Card */}
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              {/* Method Selection */}
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.chooseMethod')}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {paymentAccounts.map(acc => (
                    <button
                      key={acc.id}
                      onClick={() => !acc.comingSoon && setSelectedMethod(acc.id)}
                      disabled={acc.comingSoon}
                      className={`p-4 rounded-xl text-center transition-all border-2 relative ${
                        acc.comingSoon
                          ? 'opacity-50 cursor-not-allowed ' + (darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100')
                          : selectedMethod === acc.id
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-md'
                            : darkMode ? 'border-gray-700 bg-gray-700/50 hover:border-gray-600' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                      }`}
                    >
                      {acc.comingSoon && (
                        <span className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-400 text-white">قريباً</span>
                      )}
                      <div className={`p-2.5 rounded-xl ${acc.color} shadow-sm mx-auto w-fit mb-2`}>
                        <acc.icon className="w-5 h-5 text-white" />
                      </div>
                      <p className={`text-xs font-black ${textPrimary}`}>{acc.name}</p>
                      {acc.comingSoon ? (
                        <p className={`text-[9px] mt-1.5 ${textMuted}`}>غير متاح</p>
                      ) : (
                        <div className="flex items-center justify-center gap-1 mt-1.5">
                          <code className={`text-[10px] font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} dir="ltr">{acc.number}</code>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(acc.number); }}
                            className={`p-1 rounded ${darkMode ? 'hover:bg-gray-600 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}
                          >
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {/* Transfer instructions */}
                <div className={`mt-3 rounded-xl p-3 ${darkMode ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100'} border`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Info className={`w-3.5 h-3.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <span className={`text-[10px] font-black ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>{t('wallet.transferInstructions')}</span>
                  </div>
                  <p className={`text-[9px] leading-relaxed ${darkMode ? 'text-blue-400/70' : 'text-blue-600'}`}>
                    {t('wallet.transferInstructionsDesc')}
                  </p>
                </div>
              </div>

              {/* Phone Number Section */}
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                {(!currentUser?.phone || currentUser.phone.trim() === '') ? (
                  <div className={`rounded-xl p-3 flex items-start gap-2 ${darkMode ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-100'} border`}>
                    <Phone className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                    <div>
                      <p className={`text-xs font-bold ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{t('wallet.phoneRequiredTitle')}</p>
                      <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-red-400/70' : 'text-red-600'}`}>{t('wallet.phoneRequiredDesc')}</p>
                      <button onClick={() => navigate('/settings')} className={`text-[10px] font-bold mt-1.5 underline ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{t('wallet.goToSettings')}</button>
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-xl p-3 ${darkMode ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-100'} border`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Phone className={`w-3.5 h-3.5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                      <span className={`text-[10px] font-bold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{t('wallet.senderPhoneLabel')}</span>
                      <span className="text-[8px] bg-green-500/30 text-green-200 px-1.5 py-0.5 rounded-full font-bold">{t('wallet.mandatory')}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'} tracking-wide`} dir="ltr">{currentUser.phone}</span>
                      <span className={`text-[9px] ms-auto ${darkMode ? 'text-green-400/60' : 'text-green-500'}`}>{t('wallet.phoneMatchHint')}</span>
                    </div>
                  </div>
                )}

                {/* Additional Phone */}
                <div className="mt-3">
                  <div className={`rounded-xl p-3 ${bgSection}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Phone className={`w-3.5 h-3.5 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                      <span className={`text-[10px] font-bold ${textSecondary}`}>{t('wallet.additionalPhoneLabel')}</span>
                    </div>
                    <p className={`text-[9px] mb-2 ${textMuted}`}>{t('wallet.additionalPhoneHint')}</p>
                    <input
                      type="tel"
                      value={additionalPhone}
                      onChange={(e) => setAdditionalPhone(e.target.value)}
                      placeholder={t('wallet.additionalPhonePlaceholder')}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-bold outline-none transition-colors ${
                        darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'
                      } border focus:ring-2`}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>

              {/* Amount & Receipt Section */}
              <div className="p-5">
                {/* Amount Input */}
                <div className="mb-4">
                  <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>{t('wallet.amountInEgp')}</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={t('wallet.amountInEgp')}
                    className={`w-full px-4 py-4 rounded-xl text-2xl font-black outline-none text-center transition-colors ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:ring-orange-500/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-300 focus:ring-orange-400/30'
                    } border focus:ring-2`}
                  />
                </div>

                {/* Quick Amounts */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {quickAmounts.map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(v.toString())}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        amount === v.toString()
                          ? 'bg-orange-600 text-white shadow-md'
                          : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {v.toLocaleString()} {t('common.egp')}
                    </button>
                  ))}
                </div>

                {/* Receipt Upload */}
                <div className={`rounded-xl p-4 mb-4 ${bgSection}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                    <span className={`text-xs font-black ${textPrimary}`}>{t('wallet.receiptImage')}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'}`}>{t('wallet.receiptRequired')}</span>
                    {receiptPreview && (
                      <button onClick={removeReceiptImage} className={`ms-auto p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}>
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className={`text-[9px] mb-3 ${textMuted}`}>{t('wallet.receiptHint')}</p>
                  {receiptPreview ? (
                    <div className="relative rounded-xl overflow-hidden border-2 border-green-500/30">
                      <img src={receiptPreview} alt="Receipt" className="w-full h-36 object-cover" />
                      <div className={`absolute bottom-0 left-0 right-0 p-2 flex items-center justify-center gap-1.5 ${darkMode ? 'bg-green-900/80' : 'bg-green-500/90'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        <span className="text-[10px] text-white font-bold">{t('wallet.receiptAttached')}</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center justify-center gap-2 transition-colors group ${
                        darkMode ? 'border-gray-600 hover:border-orange-500/50 hover:bg-gray-700/50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'
                      }`}
                      style={{ cursor: "pointer", background: 'none', borderStyle: 'dashed' }}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${darkMode ? 'bg-gray-700 group-hover:bg-orange-900/30' : 'bg-gray-100 group-hover:bg-orange-100'}`}>
                        <ImagePlus className={`w-5 h-5 ${darkMode ? 'text-gray-400 group-hover:text-orange-400' : 'text-gray-400 group-hover:text-orange-500'}`} />
                      </div>
                      <span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('wallet.clickToUpload')}</span>
                      <span className={`text-[9px] ${textMuted}`}>{t('wallet.maxSize')}</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" style={{ display: 'none' }} />
                </div>

                {/* Confirm Button */}
                <AnimatePresence mode="wait">
                  {confirmStep === 'input' && (
                    <motion.button
                      key="confirm-input"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={handleDeposit}
                      className="w-full bg-gradient-to-l from-orange-500 to-orange-600 text-white py-4 rounded-xl text-base font-black hover:from-orange-600 hover:to-orange-700 transition-all active:scale-[0.98] shadow-lg shadow-orange-200/30 flex items-center justify-center gap-2"
                    >
                      <ArrowUpRight className="w-5 h-5" />
                      {t('wallet.confirmCharge')}
                    </motion.button>
                  )}
                  {confirmStep === 'confirm' && (
                    <motion.div
                      key="confirm-step"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      <div className={`rounded-xl p-4 text-center ${bgSection}`}>
                        <p className={`text-xs mb-1 ${textMuted}`}>{t('wallet.willBeCharged')}</p>
                        <p className={`text-3xl font-black ${textPrimary}`}>{pendingAmount.toLocaleString()} <span className="text-lg">{t('common.egp')}</span></p>
                        <p className={`text-[10px] mt-1 ${textMuted}`}>{t('wallet.via')} {paymentAccounts.find(a => a.id === selectedMethod)?.name || selectedMethod}</p>
                        <p className={`text-[10px] mt-1 ${textMuted}`}>{t('wallet.balanceAfterCharge')} {((currentUser.walletBalance || 0) + pendingAmount).toLocaleString()} {t('common.egp')}</p>
                        {currentUser?.phone && <p className={`text-[10px] mt-2 flex items-center justify-center gap-1 ${textSecondary}`}><Phone className="w-3 h-3" /> {t('wallet.sentFromPhone')}: {currentUser.phone}</p>}
                        {additionalPhone && additionalPhone.trim() !== '' && <p className={`text-[10px] mt-1 flex items-center justify-center gap-1 ${textSecondary}`}><Phone className="w-3 h-3" /> {t('wallet.additionalPhoneLabel')}: <span dir="ltr">{additionalPhone}</span></p>}
                      </div>
                      {receiptPreview && (
                        <div className={`rounded-xl overflow-hidden border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <img src={receiptPreview} alt="Receipt" className="w-full max-h-20 object-cover" />
                          <div className={`${bgSection} px-3 py-1.5 text-[9px] flex items-center gap-1 ${textMuted}`}>
                            <Camera className="w-3 h-3" />
                            {t('wallet.receiptImage')}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button onClick={handleConfirmTransaction} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3.5 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md">
                          <CheckCircle2 className="w-4 h-4" /> {t('wallet.sendRequest')}
                        </button>
                        <button onClick={handleCancelTransaction} className={`flex-1 py-3.5 rounded-xl text-xs font-bold transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{t('common.cancel')}</button>
                      </div>
                    </motion.div>
                  )}
                  {confirmStep === 'success' && (
                    <motion.div
                      key="confirm-success"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-center py-6"
                    >
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                        <CheckCircle2 className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                      </div>
                      <p className={`font-black ${textPrimary}`}>{t('wallet.chargeRequestSent')}</p>
                      <p className={`text-sm mt-1 ${textMuted}`}>{t('wallet.chargeRequestPending', { amount: pendingAmount.toLocaleString() })}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════ HISTORY TAB ═══════════ */}
        {activeWalletTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            {/* Transaction Filters */}
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.transactionHistory')}</h3>
                  </div>
                  <span className={`text-[10px] ${textMuted}`}>{t('wallet.transactionCount', { count: filteredTransactions.length })}</span>
                </div>
                {/* Search Input */}
                <div className="relative mb-3">
                  <Search className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'right-3' : 'left-3'} w-4 h-4 ${textMuted}`} />
                  <input
                    type="text"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    placeholder={t('wallet.searchTransactions')}
                    className={`w-full ${dir === 'rtl' ? 'pr-10 pl-3' : 'pl-10 pr-3'} py-2.5 rounded-xl text-xs font-bold outline-none transition-colors ${
                      darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'
                    } border focus:ring-2`}
                  />
                  {txSearch && (
                    <button
                      onClick={() => setTxSearch('')}
                      className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'left-3' : 'right-3'} p-0.5 rounded ${darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { id: 'all' as const, label: t('common.all') },
                    { id: 'charge_request' as const, label: t('wallet.chargeRequest') },
                    { id: 'deposit' as const, label: t('wallet.deposit') },
                    { id: 'promotion_debit' as const, label: t('wallet.promotionDebit') },
                    { id: 'promotion_refund' as const, label: t('wallet.promotionRefund') },
                    { id: 'withdrawal' as const, label: t('wallet.withdrawal', 'سحب') },
                    { id: 'admin_deposit' as const, label: t('wallet.adminDeposit', 'إيداع أدمن') },
                    { id: 'admin_withdrawal' as const, label: t('wallet.adminWithdrawal', 'سحب أدمن') },
                    // H6 fix: added the 4 missing filter buttons
                    { id: 'gift_sent' as const, label: t('wallet.giftSent', 'هدية مرسلة') },
                    { id: 'gift_received' as const, label: t('wallet.giftReceived', 'هدية مستلمة') },
                    { id: 'savings_debit' as const, label: t('wallet.savingsDebit', 'إيداع هدف') },
                    { id: 'savings_refund' as const, label: t('wallet.savingsRefund', 'سحب من هدف') },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setTxFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                        txFilter === f.id
                          ? 'bg-orange-600 text-white shadow-sm'
                          : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTransactions.length > 0 ? (
                <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                  {filteredTransactions.map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="px-5 py-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${getTxBgColor(tx.type, darkMode)}`}>
                          {getTxIcon(tx.type)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${textPrimary}`}>
                              {getTxLabel(tx.type)}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                              tx.status === 'completed'
                                ? darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
                                : tx.status === 'pending'
                                  ? darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
                                  : tx.status === 'approved'
                                    ? darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                                    : tx.status === 'failed'
                                      ? darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                                      : darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'
                            }`}>
                              {tx.status === 'completed' ? t('wallet.completed') : tx.status === 'pending' ? t('wallet.inProgress') : tx.status === 'approved' ? t('wallet.approved', 'معتمد') : tx.status === 'failed' ? t('wallet.failed', 'فشل') : t('common.cancel')}
                            </span>
                          </div>
                          <span className={`text-[11px] ${textMuted}`}>
                            {tx.method} · {tx.timestamp}
                          </span>
                        </div>
                      </div>
                      <span className={`text-sm font-black ${getTxColor(tx.type)}`}>
                        {getTxSign(tx.type)}{tx.amount.toLocaleString()} {t('common.egp')}
                      </span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <Clock className={`w-8 h-8 ${textMuted}`} />
                  </div>
                  <p className={`font-bold ${textPrimary}`}>{t('wallet.noTransactions')}</p>
                  <p className={`text-sm mt-1 ${textMuted}`}>{t('wallet.noTransactionsDesc')}</p>
                </div>
              )}
            </div>

            {/* Monthly Summary */}
            {transactions.length > 0 && (
              <div className={`rounded-2xl border p-5 ${bgCard}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-indigo-900/30' : 'bg-indigo-50'}`}>
                    <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  </div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.monthlySummary')}</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                    <TrendingUp className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                    <p className={`text-sm font-black ${textPrimary}`}>{walletStats.depositCount}</p>
                    <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.deposit')}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                    <TrendingDown className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                    <p className={`text-sm font-black ${textPrimary}`}>{walletStats.promotionCount}</p>
                    <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.promotionDebit')}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                    <RefreshCw className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <p className={`text-sm font-black ${textPrimary}`}>{walletStats.chargeRequestCount}</p>
                    <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.chargeRequest')}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════ SAVINGS TAB ═══════════ */}
        {activeWalletTab === 'savings' && (
          <motion.div
            key="savings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            {/* Savings Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={`rounded-2xl border p-5 ${bgCard}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
                  <PiggyBank className={`w-5 h-5 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.savingsGoals')}</h3>
                  <p className={`text-[10px] ${textMuted}`}>{t('wallet.savingsGoalsDesc')}</p>
                </div>
                <button
                  onClick={() => setShowNewGoalForm(!showNewGoalForm)}
                  className={`ms-auto w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    showNewGoalForm
                      ? 'bg-orange-500 text-white'
                      : darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Add New Goal Form */}
              <AnimatePresence>
                {showNewGoalForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={`rounded-xl p-4 mb-4 ${bgSection} space-y-3`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Target className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                        <span className={`text-xs font-black ${textPrimary}`}>{t('wallet.addNewGoal')}</span>
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('wallet.goalName')}</label>
                        <input
                          type="text"
                          value={newGoalName}
                          onChange={(e) => setNewGoalName(e.target.value)}
                          placeholder={t('wallet.goalNamePlaceholder')}
                          className={`w-full px-3 py-2.5 rounded-lg text-xs font-bold outline-none transition-colors ${
                            darkMode ? 'bg-gray-800 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'
                          } border focus:ring-2`}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('wallet.targetAmount')}</label>
                          <input
                            type="number"
                            value={newGoalTarget}
                            onChange={(e) => setNewGoalTarget(e.target.value)}
                            placeholder="0"
                            className={`w-full px-3 py-2.5 rounded-lg text-xs font-bold outline-none transition-colors ${
                              darkMode ? 'bg-gray-800 text-white placeholder-gray-500 border-gray-600 focus:ring-orange-500/30' : 'bg-white text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-orange-400/30'
                            } border focus:ring-2`}
                          />
                        </div>
                        <div>
                          <label className={`text-[10px] font-bold ${textMuted} block mb-1.5`}>{t('wallet.deadline')}</label>
                          <input
                            type="date"
                            value={newGoalDeadline}
                            onChange={(e) => setNewGoalDeadline(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-lg text-xs font-bold outline-none transition-colors ${
                              darkMode ? 'bg-gray-800 text-white border-gray-600 focus:ring-orange-500/30' : 'bg-white text-gray-900 border-gray-200 focus:ring-orange-400/30'
                            } border focus:ring-2`}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddGoal}
                        className="w-full bg-gradient-to-l from-orange-500 to-orange-600 text-white py-3 rounded-xl text-xs font-black hover:from-orange-600 hover:to-orange-700 transition-all active:scale-[0.98] shadow-lg shadow-orange-200/30 flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('wallet.addGoal')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Savings Goals List */}
              {savingsGoals.length > 0 ? (
                <div className="space-y-3">
                  {savingsGoals.map((goal, i) => {
                    const progressPct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
                    const deadlineDate = new Date(goal.deadline);
                    const now = new Date();
                    const daysRemaining = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                    const isCompleted = progressPct >= 100;
                    return (
                      <motion.div
                        key={goal.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`rounded-xl p-4 ${bgSection} relative overflow-hidden`}
                      >
                        {/* Completion overlay */}
                        {isCompleted && (
                          <div className="absolute inset-0 bg-green-500/5 flex items-center justify-center pointer-events-none">
                            <CheckCircle2 className={`w-12 h-12 ${darkMode ? 'text-green-400/20' : 'text-green-500/20'}`} />
                          </div>
                        )}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isCompleted
                                ? darkMode ? 'bg-green-900/30' : 'bg-green-50'
                                : darkMode ? 'bg-orange-900/30' : 'bg-orange-50'
                            }`}>
                              <Target className={`w-4 h-4 ${
                                isCompleted
                                  ? darkMode ? 'text-green-400' : 'text-green-600'
                                  : darkMode ? 'text-orange-400' : 'text-orange-600'
                              }`} />
                            </div>
                            <div>
                              <p className={`text-sm font-black ${textPrimary}`}>{goal.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Calendar className={`w-3 h-3 ${textMuted}`} />
                                <span className={`text-[9px] ${textMuted}`}>{daysRemaining > 0 ? t('wallet.daysRemaining', { count: daysRemaining }) : t('wallet.deadlinePassed')}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-900/30 text-gray-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Progress */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold ${textPrimary}`}>{goal.current.toLocaleString()} / {goal.target.toLocaleString()} {t('common.egp')}</span>
                            <span className={`text-xs font-black ${isCompleted ? 'text-green-600' : 'text-orange-600'}`}>{progressPct}%</span>
                          </div>
                          <div className={`h-2.5 rounded-full overflow-hidden ${darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(progressPct, 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={`h-full rounded-full ${
                                isCompleted
                                  ? 'bg-gradient-to-l from-green-500 to-emerald-400'
                                  : progressPct > 60
                                    ? 'bg-gradient-to-l from-orange-500 to-amber-400'
                                    : 'bg-gradient-to-l from-orange-400 to-yellow-300'
                              }`}
                            />
                          </div>
                        </div>
                        {/* Quick add to goal */}
                        {!isCompleted && (
                          <div className="flex items-center gap-2 mt-2">
                            {[50, 100, 200].map(amt => (
                              <button
                                key={amt}
                                onClick={() => {
                                  handleAddToGoal(goal.id, amt);
                                }}
                                disabled={(currentUser?.walletBalance || 0) < amt}
                                className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 enabled:hover:bg-gray-700' : 'bg-white text-gray-600 enabled:hover:bg-gray-50'
                                } border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                                title={t('wallet.addToGoal')}
                              >
                                +{amt}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* Withdraw from goal — visible if there's any money saved */}
                        {goal.current > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => handleWithdrawFromGoal(goal.id, goal.current)}
                              className={`w-full py-1.5 rounded-lg text-[9px] font-bold transition-colors ${
                                darkMode ? 'bg-blue-900/20 text-blue-300 hover:bg-blue-900/40' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                              } border ${darkMode ? 'border-blue-800' : 'border-blue-200'}`}
                              title={t('wallet.withdrawFromGoal')}
                            >
                              {t('wallet.withdrawFromGoal')} ({goal.current.toLocaleString()} ج.م)
                            </button>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <PiggyBank className={`w-8 h-8 ${textMuted}`} />
                  </div>
                  <p className={`font-bold ${textPrimary}`}>{t('wallet.noSavingsGoals')}</p>
                  <p className={`text-sm mt-1 ${textMuted}`}>{t('wallet.noSavingsGoalsDesc')}</p>
                  <button
                    onClick={() => setShowNewGoalForm(true)}
                    className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('wallet.createFirstGoal')}
                  </button>
                </div>
              )}
            </motion.div>

            {/* Savings Summary */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`rounded-2xl border p-5 ${bgCard}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-teal-900/30' : 'bg-teal-50'}`}>
                  <BarChart3 className={`w-4 h-4 ${darkMode ? 'text-teal-400' : 'text-teal-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.savingsSummary')}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                  <Target className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  <p className={`text-sm font-black ${textPrimary}`}>{savingsGoals.length}</p>
                  <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.totalGoals')}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                  <PiggyBank className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                  <p className={`text-sm font-black ${textPrimary}`}>{savingsGoals.reduce((s, g) => s + g.current, 0).toLocaleString()}</p>
                  <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.totalSaved')}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${bgSection}`}>
                  <CheckCircle2 className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                  <p className={`text-sm font-black ${textPrimary}`}>{savingsGoals.filter(g => g.current >= g.target).length}</p>
                  <p className={`text-[9px] font-bold ${textMuted}`}>{t('wallet.completedGoals')}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══════════ GIFTS TAB (NEW) ═══════════ */}
        {activeWalletTab === 'gifts' && (
          <motion.div
            key="gifts"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            {/* Gift balance card */}
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Gift className={`w-4 h-4 ${darkMode ? 'text-pink-400' : 'text-pink-600'}`} />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.gifts', 'الهدايا')}</h3>
                </div>
                <p className={`text-[10px] ${textMuted}`}>
                  {t('wallet.giftsDesc', 'الهدايا التي تتلقاها تُضاف هنا. يمكنك تحويلها إلى محفظتك بالكامل بدون رسوم.')}
                </p>
              </div>
              <div className="p-5">
                <div className={`rounded-2xl p-5 text-center bg-gradient-to-l ${darkMode ? 'from-pink-900/30 to-rose-900/20' : 'from-pink-50 to-rose-50'} border ${darkMode ? 'border-pink-800/40' : 'border-pink-100'}`}>
                  <p className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.currentGiftBalance', 'رصيد الهدايا الحالي')}</p>
                  <motion.p
                    key={giftBalance}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-4xl font-black mt-2 ${darkMode ? 'text-pink-300' : 'text-pink-600'}`}
                  >
                    {giftBalance.toLocaleString()} <span className="text-lg">{t('common.egp')}</span>
                  </motion.p>
                </div>

                {/* Convert-to-wallet action */}
                {isLoadingGifts ? (
                  <div className="flex items-center justify-center gap-2 mt-4 py-3">
                    <RefreshCw className={`w-4 h-4 animate-spin ${textMuted}`} />
                    <span className={`text-xs font-bold ${textMuted}`}>{t('common.loading', 'جارٍ التحميل...')}</span>
                  </div>
                ) : giftBalance > 0 ? (
                  <>
                    {!showGiftWithdrawConfirm ? (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowGiftWithdrawConfirm(true)}
                        className="w-full mt-4 bg-gradient-to-l from-pink-500 to-rose-600 text-white py-3.5 rounded-xl text-sm font-black shadow-lg flex items-center justify-center gap-2"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                        {t('wallet.convertGiftsToWallet', 'تحويل للمحفظة')}
                      </motion.button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-3"
                      >
                        {/* Fee breakdown */}
                        <div className={`rounded-xl p-4 ${bgSection}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold ${textMuted}`}>{t('wallet.giftAmount', 'إجمالي الهدايا')}</span>
                            <span className={`text-sm font-black ${textPrimary}`}>{giftBalance.toLocaleString()} {t('common.egp')}</span>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                              <Check className="w-3 h-3" />
                              {t('wallet.noFee', 'بدون رسوم')}
                            </span>
                            <span className={`text-sm font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>0 {t('common.egp')}</span>
                          </div>
                          <div className={`pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                            <span className={`text-xs font-black ${textPrimary}`}>{t('wallet.amountToWallet', 'يُضاف للمحفظة')}</span>
                            <span className={`text-lg font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>+ {giftBalance.toLocaleString()} {t('common.egp')}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleWithdrawGifts}
                            disabled={isWithdrawingGifts}
                            className="flex-1 bg-pink-500 hover:bg-pink-600 text-white py-3.5 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                          >
                            {isWithdrawingGifts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {isWithdrawingGifts ? t('wallet.processing', 'جارٍ المعالجة...') : t('wallet.confirmConvert', 'تأكيد التحويل')}
                          </button>
                          <button
                            onClick={() => setShowGiftWithdrawConfirm(false)}
                            className={`flex-1 py-3.5 rounded-xl text-xs font-bold transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            {t('common.cancel', 'إلغاء')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 mt-3">
                    <Gift className={`w-10 h-10 mx-auto mb-2 ${textMuted}`} />
                    <p className={`text-xs font-bold ${textMuted}`}>{t('wallet.noGiftsYet', 'لا توجد هدايا بعد')}</p>
                    <p className={`text-[10px] mt-1 ${textMuted}`}>{t('wallet.noGiftsDesc', 'عندما يرسل لك مستخدمون هدايا، ستظهر هنا.')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Gift history list */}
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.giftHistory', 'سجل الهدايا')}</h3>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {isLoadingGifts ? (
                  <div className="p-6 text-center">
                    <RefreshCw className={`w-5 h-5 mx-auto animate-spin ${textMuted}`} />
                  </div>
                ) : giftHistory.length === 0 ? (
                  <div className="p-6 text-center">
                    <Gift className={`w-8 h-8 mx-auto mb-2 ${textMuted}`} />
                    <p className={`text-xs font-bold ${textMuted}`}>{t('wallet.noGiftHistory', 'لا يوجد سجل هدايا')}</p>
                  </div>
                ) : (
                  <div className="divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}">
                    {giftHistory.map((g, i) => (
                      <motion.div
                        key={g.id || i}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                        className={`flex items-center gap-3 p-3.5 ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${darkMode ? 'bg-pink-900/30' : 'bg-pink-50'}`}>
                          {g.giftIcon || '🎁'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${textPrimary}`}>
                            {g.giftName || g.giftType} — {Number(g.amount).toLocaleString()} {t('common.egp')}
                          </p>
                          <p className={`text-[11px] ${textMuted}`}>
                            {t('wallet.from', 'من')}: {g.sender?.name || 'مستخدم'}
                          </p>
                          <p className={`text-[10px] ${textMuted}`}>
                            {g.createdAt ? new Date(g.createdAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : ''}
                          </p>
                          {g.message && (
                            <p className={`text-[10px] mt-1 italic ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>"{g.message}"</p>
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${darkMode ? 'bg-pink-900/30 text-pink-400' : 'bg-pink-50 text-pink-600'}`}>
                          +{Number(g.amount).toLocaleString()}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════ WITHDRAW TAB (external — 5% fee + admin approval) ═══════════ */}
        {activeWalletTab === 'withdraw' && (
          <motion.div
            key="withdraw"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className={`w-4 h-4 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.withdrawFunds', 'سحب الأموال')}</h3>
                </div>
                <p className={`text-[10px] ${textMuted}`}>
                  {t('wallet.withdrawDesc', 'اسحب رصيدك إلى حساب خارجي (فودافون كاش، إنستا باي، فوري...). رسوم التحويل 5% ويتم المراجعة خلال 24 ساعة.')}
                </p>
              </div>
              <div className="p-5">
                <AnimatePresence mode="wait">
                  {/* ─── Step 1: Form (amount + network + account) ─── */}
                  {withdrawStep === 'form' && (
                    <motion.div key="wd-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                      {/* Amount input */}
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>
                          {t('wallet.amount', 'المبلغ')} ({t('common.egp')})
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder={t('wallet.amountInEgp', 'المبلغ بالجنيه')}
                          className={`w-full px-4 py-4 rounded-xl text-2xl font-black outline-none text-center transition-colors ${
                            darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:ring-orange-500/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-300 focus:ring-orange-400/30'
                          } border focus:ring-2`}
                        />
                        {/* Quick-charge chips */}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {[100, 200, 500, 1000].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setWithdrawAmount(String(v))}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {v.toLocaleString()}
                            </button>
                          ))}
                        </div>
                        <p className={`text-[10px] mt-2 ${textMuted}`}>
                          {t('wallet.minWithdrawNote', 'الحد الأدنى للسحب 50 ج.م')} • {t('wallet.availableBalance', 'الرصيد المتاح')}: {(currentUser?.walletBalance || 0).toLocaleString()} {t('common.egp')}
                        </p>
                      </div>

                      {/* Network selection */}
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>
                          {t('wallet.withdrawNetwork', 'شبكة السحب')} <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {withdrawNetworks.map(n => {
                            const active = withdrawNetwork === n.id;
                            return (
                              <button
                                key={n.id}
                                type="button"
                                onClick={() => !n.comingSoon && setWithdrawNetwork(n.id)}
                                disabled={n.comingSoon}
                                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all relative ${
                                  n.comingSoon
                                    ? 'opacity-50 cursor-not-allowed ' + (darkMode ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-gray-100 border-gray-200 text-gray-400')
                                    : active
                                      ? `${n.color} border-transparent text-white shadow-md`
                                      : darkMode
                                        ? 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                }`}
                              >
                                {n.comingSoon && (
                                  <span className="absolute top-1 right-1 text-[7px] font-bold px-1 py-0.5 rounded-full bg-gray-400 text-white">قريباً</span>
                                )}
                                <n.icon className="w-5 h-5" />
                                <span className="text-[10px] font-black text-center leading-tight">{n.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Account number input — placeholder depends on selected network */}
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>
                          {t('wallet.accountNumber', 'رقم الحساب / المحفظة')} <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode={withdrawNetworks.find(n => n.id === withdrawNetwork)?.inputMode || 'text'}
                          value={withdrawAccountNumber}
                          onChange={(e) => setWithdrawAccountNumber(e.target.value)}
                          placeholder={withdrawNetworks.find(n => n.id === withdrawNetwork)?.placeholder || ''}
                          dir="ltr"
                          className={`w-full px-4 py-3 rounded-xl text-sm font-bold outline-none transition-colors text-start ${
                            darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:ring-orange-500/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-orange-400/30'
                          } border focus:ring-2`}
                        />
                      </div>

                      {/* Live fee/net preview */}
                      {withdrawPreview.amount > 0 && (
                        <div className={`rounded-xl p-4 ${bgSection}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold ${textMuted}`}>{t('wallet.amount', 'المبلغ')}</span>
                            <span className={`text-sm font-black ${textPrimary}`}>{withdrawPreview.amount.toLocaleString()} {t('common.egp')}</span>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                              <AlertCircle className="w-3 h-3" />
                              {t('wallet.withdrawFee', 'رسوم التحويل (5%)')}
                            </span>
                            <span className={`text-sm font-black ${darkMode ? 'text-red-400' : 'text-red-600'}`}>- {withdrawPreview.fee.toLocaleString()} {t('common.egp')}</span>
                          </div>
                          <div className={`pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                            <span className={`text-xs font-black ${textPrimary}`}>{t('wallet.netAmount', 'المبلغ الصافي')}</span>
                            <span className={`text-lg font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{withdrawPreview.net.toLocaleString()} {t('common.egp')}</span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleWithdrawSubmit}
                        className="w-full bg-gradient-to-l from-orange-500 to-orange-600 text-white py-4 rounded-xl text-base font-black hover:from-orange-600 hover:to-orange-700 transition-all active:scale-[0.98] shadow-lg shadow-orange-200/30 flex items-center justify-center gap-2"
                      >
                        <Banknote className="w-5 h-5" />
                        {t('wallet.continueWithdraw', 'متابعة السحب')}
                      </button>
                    </motion.div>
                  )}

                  {/* ─── Step 2: Confirm review ─── */}
                  {withdrawStep === 'confirm' && (
                    <motion.div key="wd-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className={`rounded-xl p-4 text-center ${bgSection}`}>
                        <p className={`text-xs mb-1 ${textMuted}`}>{t('wallet.withdrawTo', 'سحب إلى')}</p>
                        <p className={`text-sm font-black ${textPrimary}`}>
                          {withdrawNetworks.find(n => n.id === withdrawNetwork)?.label}
                        </p>
                        <p className={`text-[11px] mt-1 ${textMuted}`} dir="ltr">{withdrawAccountNumber.trim()}</p>
                        <p className={`text-3xl font-black mt-2 ${textPrimary}`}>{withdrawPreview.amount.toLocaleString()} <span className="text-lg">{t('common.egp')}</span></p>
                      </div>
                      {/* Fee breakdown */}
                      <div className={`rounded-xl p-4 ${bgSection}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold ${textMuted}`}>{t('wallet.amount', 'المبلغ')}</span>
                          <span className={`text-sm font-black ${textPrimary}`}>{withdrawPreview.amount.toLocaleString()} {t('common.egp')}</span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                            <AlertCircle className="w-3 h-3" />
                            {t('wallet.withdrawFee', 'رسوم التحويل (5%)')}
                          </span>
                          <span className={`text-sm font-black ${darkMode ? 'text-red-400' : 'text-red-600'}`}>- {withdrawPreview.fee.toLocaleString()} {t('common.egp')}</span>
                        </div>
                        <div className={`pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                          <span className={`text-xs font-black ${textPrimary}`}>{t('wallet.netAmount', 'المبلغ الصافي (سيصلك)')}</span>
                          <span className={`text-lg font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{withdrawPreview.net.toLocaleString()} {t('common.egp')}</span>
                        </div>
                      </div>
                      <div className={`rounded-xl p-3 flex items-start gap-2 ${darkMode ? 'bg-yellow-900/20 border border-yellow-800' : 'bg-yellow-50 border border-yellow-200'}`}>
                        <Clock className={`w-4 h-4 flex-shrink-0 mt-0.5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                        <p className={`text-[10px] font-bold ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                          {t('wallet.withdrawPendingNote', 'سيتم خصم المبلغ فوراً من محفظتك ومراجعة الطلب من الإدارة خلال 24 ساعة. في حالة الرفض يُعاد المبلغ كاملاً.')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleWithdrawConfirm}
                          disabled={isSubmittingWithdraw}
                          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                        >
                          {isSubmittingWithdraw ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {isSubmittingWithdraw ? t('wallet.processing', 'جارٍ المعالجة...') : t('wallet.confirmWithdraw', 'تأكيد السحب')}
                        </button>
                        <button
                          onClick={() => setWithdrawStep('form')}
                          className={`flex-1 py-3.5 rounded-xl text-xs font-bold transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {t('common.cancel', 'إلغاء')}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* ─── Step 3: Success ─── */}
                  {withdrawStep === 'success' && lastWithdrawResult && (
                    <motion.div key="wd-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-6">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                        <CheckCircle2 className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                      </div>
                      <p className={`font-black ${textPrimary}`}>{t('wallet.withdrawSubmittedTitle', 'تم إنشاء طلب السحب')}</p>
                      <p className={`text-xs mt-1 ${textMuted}`}>
                        {t('wallet.withdrawSubmittedDesc', 'سيتم مراجعته خلال 24 ساعة')}
                      </p>
                      <div className={`rounded-xl p-3 mt-3 ${bgSection} text-start`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold ${textMuted}`}>{t('wallet.amount', 'المبلغ')}</span>
                          <span className={`text-xs font-black ${textPrimary}`}>{lastWithdrawResult.amount.toLocaleString()} {t('common.egp')}</span>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>{t('wallet.withdrawFee', 'رسوم 5%')}</span>
                          <span className={`text-xs font-black ${darkMode ? 'text-red-400' : 'text-red-600'}`}>- {lastWithdrawResult.fee.toLocaleString()} {t('common.egp')}</span>
                        </div>
                        <div className={`pt-1 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between mt-1`}>
                          <span className={`text-[10px] font-black ${textPrimary}`}>{t('wallet.netAmount', 'الصافي')}</span>
                          <span className={`text-sm font-black ${darkMode ? 'text-green-400' : 'text-green-600'}`}>{lastWithdrawResult.net.toLocaleString()} {t('common.egp')}</span>
                        </div>
                      </div>
                      <button
                        onClick={resetWithdrawForm}
                        className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                      >
                        {t('wallet.newWithdraw', 'سحب جديد')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Withdrawal history */}
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`p-4 border-b flex items-center gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <Clock className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.withdrawalHistory', 'سجل السحوبات')}</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {isLoadingWithdrawHistory ? (
                  <div className="p-6 text-center">
                    <RefreshCw className={`w-5 h-5 mx-auto animate-spin ${textMuted}`} />
                  </div>
                ) : withdrawHistory.length === 0 ? (
                  <div className="p-6 text-center">
                    <Banknote className={`w-8 h-8 mx-auto mb-2 ${textMuted}`} />
                    <p className={`text-xs font-bold ${textMuted}`}>{t('wallet.noWithdrawals', 'لا توجد طلبات سحب')}</p>
                  </div>
                ) : (
                  <div>
                    {withdrawHistory.map((w, i) => {
                      const network = withdrawNetworks.find(n => n.id === (w.network || w.method)) || withdrawNetworks[0];
                      const statusColor = w.status === 'pending' ? (darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600')
                        : w.status === 'approved' ? (darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600')
                        : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600');
                      const statusLabel = w.status === 'pending' ? t('wallet.pending', 'قيد المراجعة')
                        : w.status === 'approved' ? t('wallet.approved', 'تمت الموافقة')
                        : t('wallet.rejected', 'مرفوض');
                      return (
                        <motion.div
                          key={w.id || i}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(i * 0.03, 0.3) }}
                          className={`flex items-center gap-3 p-3.5 ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${network.color}`}>
                            <network.icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${textPrimary}`}>{network.label}</p>
                            <p className={`text-[11px] ${textMuted}`} dir="ltr">{w.accountNumber || w.accountDetails || '—'}</p>
                            <p className={`text-[10px] ${textMuted}`}>{w.createdAt ? parseDBTimestamp(w.createdAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US') : ''}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className={`text-sm font-black ${textPrimary}`}>{Number(w.amount).toLocaleString()} {t('common.egp')}</p>
                            <p className={`text-[10px] font-bold ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {t('wallet.netAmount', 'الصافي')}: {Number(w.netAmount || (w.amount - (w.fee || 0))).toLocaleString()}
                            </p>
                            <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${statusColor}`}>{statusLabel}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════ TRANSFER TAB (NEW) ═══════════ */}
        {activeWalletTab === 'transfer' && (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            <div className={`rounded-2xl border overflow-hidden ${bgCard}`}>
              <div className={`p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Users className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.transferToFriend', 'تحويل لصديق')}</h3>
                </div>
                <p className={`text-[10px] ${textMuted}`}>{t('wallet.transferDesc', 'حوّل رصيداً من محفظتك إلى صديق على المنصة')}</p>
              </div>
              <div className="p-5">
                <AnimatePresence mode="wait">
                  {transferStep === 'select' && (
                    <motion.div key="tf-select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className="relative">
                        <Search className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'right-3' : 'left-3'} w-4 h-4 ${textMuted}`} />
                        <input
                          type="text"
                          value={transferSearch}
                          onChange={(e) => handleSearchUsers(e.target.value)}
                          placeholder={t('wallet.searchFriend', 'ابحث بالاسم أو المعرف...')}
                          className={`w-full ${dir === 'rtl' ? 'pr-10 pl-3' : 'pl-10 pr-3'} py-3 rounded-xl text-sm font-bold outline-none transition-colors ${
                            darkMode ? 'bg-gray-700 text-white placeholder-gray-500 border-gray-600 focus:ring-blue-500/30' : 'bg-gray-50 text-gray-900 placeholder-gray-400 border-gray-200 focus:ring-blue-400/30'
                          } border focus:ring-2`}
                        />
                        {isSearchingUsers && <RefreshCw className={`absolute top-1/2 -translate-y-1/2 ${dir === 'rtl' ? 'left-3' : 'right-3'} w-3.5 h-3.5 animate-spin ${textMuted}`} />}
                      </div>
                      {transferSearchResults.length > 0 && (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {transferSearchResults.map((u: any) => (
                            <button
                              key={u.id}
                              onClick={() => handleSelectFriend(u)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${darkMode ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'}`}
                            >
                              <img src={u.avatar || u.profile_image || ''} alt="" className="w-10 h-10 rounded-full bg-gray-300" />
                              <div className="flex-1 text-start min-w-0">
                                <p className={`text-sm font-black truncate ${textPrimary}`}>{u.name || u.username || 'مستخدم'}</p>
                                <p className={`text-[10px] ${textMuted}`} dir="ltr">{u.phone || u.email || u.id}</p>
                              </div>
                              <ArrowLeftRight className={`w-4 h-4 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                            </button>
                          ))}
                        </div>
                      )}
                      {transferSearch && transferSearch.length >= 2 && transferSearchResults.length === 0 && !isSearchingUsers && (
                        <div className="text-center py-6">
                          <Users className={`w-10 h-10 mx-auto mb-2 ${textMuted}`} />
                          <p className={`text-xs font-bold ${textMuted}`}>{t('wallet.noUsersFound', 'لا يوجد مستخدمون مطابقون')}</p>
                        </div>
                      )}
                      {!transferSearch && (
                        <div className="text-center py-6">
                          <Users className={`w-10 h-10 mx-auto mb-2 ${textMuted}`} />
                          <p className={`text-xs font-bold ${textMuted}`}>{t('wallet.searchToTransfer', 'ابدأ بالبحث عن صديق للتحويل') }</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                  {transferStep === 'amount' && transferSelectedFriend && (
                    <motion.div key="tf-amount" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className={`rounded-xl p-3 flex items-center gap-3 ${bgSection}`}>
                        <img src={transferSelectedFriend.avatar || transferSelectedFriend.profile_image || ''} alt="" className="w-10 h-10 rounded-full bg-gray-300" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-black truncate ${textPrimary}`}>{transferSelectedFriend.name || transferSelectedFriend.username}</p>
                          <p className={`text-[10px] ${textMuted}`} dir="ltr">{transferSelectedFriend.phone || transferSelectedFriend.id}</p>
                        </div>
                        <button
                          onClick={() => { setTransferSelectedFriend(null); setTransferStep('select'); }}
                          className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>{t('wallet.amount', 'المبلغ')} ({t('common.egp')})</label>
                        <input
                          type="number"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          placeholder={t('wallet.amountInEgp')}
                          className={`w-full px-4 py-4 rounded-xl text-2xl font-black outline-none text-center transition-colors ${
                            darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:ring-blue-500/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-300 focus:ring-blue-400/30'
                          } border focus:ring-2`}
                        />
                      </div>
                      <div>
                        <label className={`text-[10px] font-bold ${textMuted} block mb-2`}>{t('wallet.transferNote', 'ملاحظة (اختياري)')}</label>
                        <input
                          type="text"
                          value={transferNote}
                          onChange={(e) => setTransferNote(e.target.value)}
                          placeholder={t('wallet.transferNotePlaceholder', 'مثال: هدية، عيد ميلاد...')}
                          className={`w-full px-4 py-3 rounded-xl text-sm font-bold outline-none transition-colors ${
                            darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:ring-blue-500/30' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-blue-400/30'
                          } border focus:ring-2`}
                        />
                      </div>
                      <button
                        onClick={handleTransferSubmit}
                        className="w-full bg-gradient-to-l from-blue-500 to-indigo-600 text-white py-4 rounded-xl text-base font-black hover:from-blue-600 hover:to-indigo-700 transition-all active:scale-[0.98] shadow-lg shadow-blue-200/30 flex items-center justify-center gap-2"
                      >
                        <Send className="w-5 h-5" />
                        {t('wallet.continueTransfer', 'متابعة التحويل')}
                      </button>
                    </motion.div>
                  )}
                  {transferStep === 'confirm' && transferSelectedFriend && (
                    <motion.div key="tf-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                      <div className={`rounded-xl p-4 text-center ${bgSection}`}>
                        <p className={`text-xs mb-1 ${textMuted}`}>{t('wallet.transferTo', 'تحويل إلى')}</p>
                        <p className={`text-sm font-black ${textPrimary}`}>{transferSelectedFriend.name || transferSelectedFriend.username}</p>
                        <p className={`text-3xl font-black mt-2 ${textPrimary}`}>{parseFloat(transferAmount).toLocaleString()} <span className="text-lg">{t('common.egp')}</span></p>
                        {transferNote && <p className={`text-[10px] mt-1 ${textMuted}`}>{transferNote}</p>}
                      </div>
                      {/* Free internal transfer badge */}
                      <div className={`rounded-xl p-3 flex items-center justify-between ${darkMode ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200'}`}>
                        <span className={`text-[11px] font-bold flex items-center gap-1.5 ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('wallet.freeInternalTransfer', 'تحويل داخل الموقع بدون رسوم')}
                        </span>
                        <span className={`text-[11px] font-black ${darkMode ? 'text-green-400' : 'text-green-700'}`}>0% {t('wallet.fee', 'رسوم')}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleTransferConfirm}
                          disabled={isSubmittingTransfer}
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3.5 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                        >
                          {isSubmittingTransfer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {isSubmittingTransfer ? t('wallet.processing', 'جارٍ المعالجة...') : t('wallet.sendTransfer', 'إرسال التحويل')}
                        </button>
                        <button
                          onClick={() => setTransferStep('amount')}
                          className={`flex-1 py-3.5 rounded-xl text-xs font-bold transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {t('common.cancel', 'إلغاء')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                  {transferStep === 'success' && (
                    <motion.div key="tf-success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-6">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${darkMode ? 'bg-green-900/30' : 'bg-green-50'}`}>
                        <CheckCircle2 className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                      </div>
                      <p className={`font-black ${textPrimary}`}>{t('wallet.transferSubmitted', 'تم إرسال التحويل بنجاح')}</p>
                      <p className={`text-xs mt-1 ${textMuted}`}>{parseFloat(transferAmount).toLocaleString()} {t('common.egp')} → {transferSelectedFriend?.name}</p>
                      <button
                        onClick={resetTransferForm}
                        className="mt-3 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        {t('wallet.newTransfer', 'تحويل جديد')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════ INSIGHTS TAB (NEW) ═══════════ */}
        {activeWalletTab === 'insights' && (
          <motion.div
            key="insights"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-5"
          >
            <div className={`rounded-2xl border p-5 ${bgCard}`}>
              <div className="flex items-center gap-2 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
                  <PieChartIcon className={`w-4 h-4 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                </div>
                <h3 className={`font-black text-sm ${textPrimary}`}>{t('wallet.spendingInsights', 'تحليلات الإنفاق')}</h3>
              </div>
              {totalSpendingForInsights > 0 ? (
                <>
                  {/* Stacked bar */}
                  <div className="flex h-4 rounded-full overflow-hidden mb-4">
                    {spendingByCategory.map((b) => {
                      const pct = (b.amount / totalSpendingForInsights) * 100;
                      if (pct <= 0) return null;
                      return (
                        <div
                          key={b.key}
                          className={`${b.color} h-full transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${b.label}: ${b.amount.toLocaleString()} ${t('common.egp')}`}
                        />
                      );
                    })}
                  </div>
                  {/* Category breakdown */}
                  <div className="space-y-2">
                    {spendingByCategory
                      .slice()
                      .sort((a, b) => b.amount - a.amount)
                      .map((b, i) => {
                        const pct = totalSpendingForInsights > 0 ? Math.round((b.amount / totalSpendingForInsights) * 100) : 0;
                        return (
                          <motion.div
                            key={b.key}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`rounded-xl p-3 flex items-center gap-3 ${bgSection}`}
                          >
                            <div className={`w-8 h-8 rounded-lg ${b.color} flex items-center justify-center flex-shrink-0`}>
                              <b.icon className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={`text-xs font-black ${textPrimary}`}>{b.label}</p>
                                <p className={`text-xs font-black ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{b.amount.toLocaleString()} {t('common.egp')}</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, delay: i * 0.05 }}
                                    className={`h-full ${b.color} rounded-full`}
                                  />
                                </div>
                                <span className={`text-[9px] font-bold ${textMuted} w-8 text-end`}>{pct}%</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                  </div>
                  <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'} flex items-center justify-between`}>
                    <span className={`text-xs font-bold ${textMuted}`}>{t('wallet.totalSpending', 'إجمالي الإنفاق')}</span>
                    <span className={`text-sm font-black ${textPrimary}`}>{totalSpendingForInsights.toLocaleString()} {t('common.egp')}</span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <PieChartIcon className={`w-12 h-12 mx-auto mb-3 ${textMuted}`} />
                  <p className={`font-bold ${textPrimary}`}>{t('wallet.noInsightsYet', 'لا توجد بيانات كافية')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('wallet.noInsightsDesc', 'ابدأ بالإنفاق على الترويج أو الادخار لرؤية تحليلاتك هنا')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ CELEBRATION OVERLAY (NEW) ═══════════ */}
      <AnimatePresence>
        {celebratingGoalId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none bg-black/40"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: -30 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className={`relative rounded-3xl p-8 mx-6 max-w-sm text-center ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-2xl pointer-events-auto`}
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6, repeat: 2 }}
                className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-300/50"
              >
                <PartyPopper className="w-10 h-10 text-white" />
              </motion.div>
              <h3 className={`text-xl font-black mb-2 ${textPrimary}`}>{t('wallet.goalReached', 'تهاني! وصلت لهدفك 🎉')}</h3>
              <p className={`text-sm ${textMuted}`}>{t('wallet.goalReachedDesc', 'لقد حققت هدفك الادخاري بنجاح! يمكنك الآن سحب المبلغ أو بدء هدف جديد.')}</p>
              {/* Confetti pieces */}
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
                  animate={{
                    opacity: 0,
                    x: (Math.random() - 0.5) * 300,
                    y: (Math.random() - 0.5) * 400,
                    rotate: Math.random() * 360,
                  }}
                  transition={{ duration: 2, delay: i * 0.05 }}
                  className={`absolute top-1/2 left-1/2 w-2 h-2 rounded-sm ${['bg-orange-500', 'bg-pink-500', 'bg-yellow-400', 'bg-emerald-500', 'bg-blue-500'][i % 5]}`}
                />
              ))}
              <button
                onClick={() => setCelebratingGoalId(null)}
                className="mt-5 px-6 py-2 rounded-xl text-xs font-black bg-gradient-to-l from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 transition-colors"
              >
                {t('common.ok', 'حسناً')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

