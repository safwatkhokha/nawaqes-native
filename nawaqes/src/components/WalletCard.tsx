import React, { useState, useRef } from 'react';
import { User } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Wallet, Smartphone, Plus, Cpu, ShieldCheck, X, CheckCircle2, ArrowUpRight, Camera, Image as ImageIcon, Phone, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';

export const WalletCard: React.FC<{ user: User | null }> = ({ user }) => {
  const { addChargingRequest, addTransaction, addNotification } = useAppContext();
  const { currentUser, refreshCurrentUser } = useAuth();
  const { t } = useTranslation();
  const [showDeposit, setShowDeposit] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);
  const [amount, setAmount] = useState('');
  const [confirmStep, setConfirmStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [pendingAmount, setPendingAmount] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<string>('vfcash');
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [additionalPhone, setAdditionalPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const paymentAccounts = [
    { id: 'vfcash', name: t('wallet.vodafoneCash'), icon: Smartphone, color: 'bg-red-500', number: '01010023494' },
    { id: 'instapay', name: t('wallet.instaPay'), icon: Cpu, color: 'bg-purple-500', number: 'swIze9495' },
  ];

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
    // Require phone number for wallet charging
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
    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload the file to server and store the URL
    try {
      const result = await api.uploadImage(file);
      setReceiptImage(result.url);
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
    if (!currentUser) return;
    const methodName = selectedMethod === 'vfcash' ? t('wallet.vodafoneCash') : t('wallet.instaPay');
    setIsSubmitting(true);
    try {
      // Call the real API to persist the charging request to the database
      await api.chargeRequest(pendingAmount, selectedMethod, receiptImage, additionalPhone);

      // Update local state for immediate UI feedback
      addChargingRequest({
        id: `charge_${Date.now()}`,
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        userPhone: currentUser.phone || '',
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
      // Single toast notification (no duplicate addNotification)
      toast.success(t('wallet.chargeRequestSubmitted', { amount: pendingAmount.toLocaleString() }));

      // Refresh user balance from server
      await refreshCurrentUser();

      setConfirmStep('success');
      setAmount('');
      setReceiptImage('');
      setReceiptPreview('');
      setAdditionalPhone('');
    } catch (err: any) {
      toast.error(err.message || t('wallet.chargeFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTransaction = () => {
    setConfirmStep('input');
    setPendingAmount(0);
  };

  const handleCloseDeposit = () => {
    setShowDeposit(false);
    setAmount('');
    setConfirmStep('input');
    setReceiptImage('');
    setReceiptPreview('');
    setAdditionalPhone('');
  };

  return (
    <div className="bg-gradient-to-l from-orange-500 via-orange-600 to-amber-600 rounded-2xl p-4 text-white shadow-xl shadow-orange-100 mb-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12 blur-2xl" />

      {/* Top Row: Icon + Balance */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-lg">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[9px] text-white/60 font-bold leading-none">{t('wallet.availableBalance')}</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-black tracking-tight leading-none">{user.walletBalance?.toLocaleString() || '0'}</span>
              <span className="text-sm font-bold opacity-70">{t('common.egp')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 bg-white/10 px-1.5 py-0.5 rounded">
            <ShieldCheck className="w-3 h-3" />
            <span className="text-[8px] font-black">{t('wallet.walletSafe')}</span>
          </div>
        </div>
      </div>

      {/* Compact Deposit Button */}
      <div className="relative z-10">
        <button
          onClick={() => { setShowDeposit(true); setConfirmStep('input'); setAmount(''); setAdditionalPhone(''); }}
          className="w-full bg-white text-orange-600 py-2.5 rounded-xl font-black text-xs hover:bg-gray-50 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-1.5"
        >
          <ArrowUpRight className="w-4 h-4" />
          {t('wallet.chargeWallet')}
        </button>
      </div>

      {/* Hidden file input */}
      <input id="fileInputRef-input" ref={fileInputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.avif,.heic,.heif,.ico,.jfif" className="sr-only" onChange={handleImageUpload} />

      {/* Deposit Form */}
      <AnimatePresence>
        {showDeposit && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden relative z-10">
            <div className="mt-4 pt-4 border-t border-white/10">
              {confirmStep === 'input' && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold">{t('wallet.chargeWallet')}</span>
                    <button onClick={handleCloseDeposit} className="p-1 hover:bg-white/10 rounded-full"><X className="w-4 h-4" /></button>
                  </div>
                  {/* Phone number warning */}
                  {(!currentUser?.phone || currentUser.phone.trim() === '') && (
                    <div className="mb-3 bg-red-500/20 border border-red-400/30 rounded-xl p-3 flex items-start gap-2">
                      <Phone className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-300" />
                      <div>
                        <p className="text-xs font-bold text-red-200">{t('wallet.phoneRequiredTitle')}</p>
                        <p className="text-[10px] text-red-300/80 mt-0.5">{t('wallet.phoneRequiredDesc')}</p>
                      </div>
                    </div>
                  )}
                  {/* Phone number display - sender phone for transfer matching */}
                  {currentUser?.phone && currentUser.phone.trim() !== '' && (
                    <div className="mb-3 bg-green-500/15 border border-green-400/30 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="w-3.5 h-3.5 text-green-300" />
                        <span className="text-[10px] font-bold text-green-200">{t('wallet.senderPhoneLabel')}</span>
                        <span className="text-[8px] bg-green-500/30 text-green-200 px-1.5 py-0.5 rounded-full font-bold">{t('wallet.mandatory')}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2">
                        <span className="text-[11px] font-black text-white tracking-wide" dir="ltr">{currentUser.phone}</span>
                        <span className="text-[9px] text-white/50 ms-auto">{t('wallet.phoneMatchHint')}</span>
                      </div>
                    </div>
                  )}
                  {/* Additional Phone Number Field */}
                  <div className="mb-3">
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Phone className="w-3.5 h-3.5 text-orange-300" />
                        <span className="text-[10px] font-bold text-white/90">{t('wallet.additionalPhoneLabel')}</span>
                      </div>
                      <p className="text-[9px] text-white/50 mb-2">{t('wallet.additionalPhoneHint')}</p>
                      <input
                        type="tel"
                        value={additionalPhone}
                        onChange={(e) => setAdditionalPhone(e.target.value)}
                        placeholder={t('wallet.additionalPhonePlaceholder')}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[11px] font-bold text-white outline-none focus:ring-2 focus:ring-orange-400/40 placeholder:text-white/30"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  {/* Payment Method Selection */}
                  <div className="mb-3">
                    <span className="text-[10px] text-white/70 block mb-2">{t('wallet.chooseMethod')}</span>
                    <div className="flex gap-2">
                      {paymentAccounts.map(acc => (
                        <button key={acc.id} onClick={() => setSelectedMethod(acc.id)}
                          className={`flex-1 p-2 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5 justify-center ${
                            selectedMethod === acc.id ? 'bg-white text-orange-600' : 'bg-white/10 hover:bg-white/20'
                          }`}>
                          <acc.icon className="w-3.5 h-3.5" />
                          {acc.name}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 bg-white/10 rounded-lg p-2">
                      <span className="text-[9px] text-white/60">{t('wallet.transferTo')} </span>
                      <span className="text-[11px] font-black text-white">{paymentAccounts.find(a => a.id === selectedMethod)?.number}</span>
                    </div>
                  </div>
                  {/* Amount Input */}
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={t('wallet.amountInEgp')}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-lg font-black outline-none focus:ring-2 focus:ring-white/30 placeholder:text-white/40 text-center"
                      />
                    </div>
                    <div className="flex gap-2">
                      {[100, 500, 1000, 5000].map(v => (
                        <button key={v} onClick={() => setAmount(v.toString())}
                          className="flex-1 bg-white/10 hover:bg-white/20 py-2 rounded-lg text-[10px] font-bold transition-colors">
                          {v}
                        </button>
                      ))}
                    </div>
                    {/* Receipt Image Upload - Prominent Section */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Camera className="w-3.5 h-3.5 text-green-300" />
                        <span className="text-[11px] font-bold text-white/90">{t('wallet.receiptImage')}</span>
                        <span className="text-[9px] bg-red-500/30 text-red-200 px-1.5 py-0.5 rounded-full font-bold">{t('wallet.receiptRequired')}</span>
                      </div>
                      <p className="text-[9px] text-white/50 mb-2">{t('wallet.receiptHint')}</p>
                      {receiptPreview ? (
                        <div className="relative mb-2">
                          <img src={receiptPreview} alt="Receipt" className="w-full max-h-32 object-cover rounded-xl border border-white/20" />
                          <button onClick={removeReceiptImage} className="absolute top-1 left-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70">
                            <X className="w-3 h-3" />
                          </button>
                          <div className="absolute bottom-1 right-1 bg-green-500/80 text-white text-[8px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {t('wallet.receiptAttached')}
                          </div>
                        </div>
                      ) : (
                        <label htmlFor="fileInputRef-input" className="w-full bg-white/15 border-2 border-dashed border-white/30 hover:bg-white/25 py-5 rounded-xl text-[11px] font-bold transition-colors flex flex-col items-center justify-center gap-2 group" style={{cursor:"pointer"}}>
                          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center group-hover:bg-white/20 transition-colors">
                            <Camera className="w-5 h-5" />
                          </div>
                          <span>{t('wallet.uploadReceipt')}</span>
                          <span className="text-[8px] text-white/40">{t('wallet.maxSize')}</span>
                        </label>
                      )}
                    </div>
                    {/* Confirm button */}
                    <button
                      onClick={handleDeposit}
                      className="w-full bg-white text-orange-600 py-4 rounded-xl text-base font-black hover:bg-gray-50 transition-colors active:scale-95 shadow-lg"
                    >
                      {t('wallet.confirmCharge')}
                    </button>
                  </div>
                </>
              )}

              {confirmStep === 'confirm' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{t('wallet.sendChargeRequest')}</span>
                    <button onClick={handleCancelTransaction} className="p-1 hover:bg-white/10 rounded-full"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 text-center">
                    <p className="text-white/70 text-xs mb-1">{t('wallet.willBeCharged')}</p>
                    <p className="text-3xl font-black">{pendingAmount.toLocaleString()} <span className="text-lg">{t('common.egp')}</span></p>
                    <p className="text-white/50 text-[10px] mt-1">{t('wallet.via')} {selectedMethod === 'vfcash' ? t('wallet.vodafoneCash') : t('wallet.instaPay')}</p>
                    {currentUser?.phone && <p className="text-white/70 text-[10px] mt-2 flex items-center justify-center gap-1"><Phone className="w-3 h-3" /> {t('wallet.sentFromPhone')}: {currentUser.phone}</p>}
                    {additionalPhone && additionalPhone.trim() !== '' && <p className="text-white/70 text-[10px] mt-1 flex items-center justify-center gap-1"><Phone className="w-3 h-3" /> {t('wallet.additionalPhoneLabel')}: <span dir="ltr">{additionalPhone}</span></p>}
                  </div>
                  {/* Receipt preview in confirm step */}
                  {receiptPreview && (
                    <div className="rounded-xl overflow-hidden border border-white/20">
                      <img src={receiptPreview} alt="Receipt" className="w-full max-h-24 object-cover" />
                      <div className="bg-white/10 px-3 py-1.5 text-[9px] text-white/60">{t('wallet.receiptImage')}</div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleConfirmTransaction} disabled={isSubmitting}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl text-xs font-black transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                      <CheckCircle2 className="w-4 h-4" /> {isSubmitting ? '...' : t('wallet.sendRequest')}
                    </button>
                    <button onClick={handleCancelTransaction} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl text-xs font-bold">{t('common.cancel')}</button>
                  </div>
                </div>
              )}

              {confirmStep === 'success' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="w-8 h-8 text-green-300" /></div>
                  <p className="font-bold text-green-200">{t('wallet.chargeRequestSent')}</p>
                  <p className="text-white/60 text-xs mt-1">{t('wallet.chargeRequestPending', { amount: pendingAmount.toLocaleString() })}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 border-t border-white/10 pt-2.5 relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            <CreditCard className="w-3 h-3 text-orange-200" />
            <span className="text-[9px] text-orange-200 font-bold">{t('wallet.activeMethods')}</span>
          </div>
          <button onClick={() => setShowAddMethod(!showAddMethod)} title={t('wallet.chooseMethod')}
            className={`p-1 rounded-md transition-all ${showAddMethod ? 'bg-white text-orange-600 rotate-45' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <AnimatePresence>
          {showAddMethod ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden space-y-1.5">
              <div className="grid grid-cols-1 gap-1.5 py-1">
                {paymentAccounts.map(acc => (
                  <button key={acc.id} className="flex items-center justify-between p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all group text-right" onClick={() => toast.info(t('wallet.paymentMethodActive', { name: acc.name }))}>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${acc.color} shadow-sm`}><acc.icon className="w-3 h-3" /></div>
                      <div className="text-start">
                        <span className="text-[10px] font-black block">{acc.name}</span>
                        <span className="text-[8px] text-green-300">✓ {acc.number}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="flex gap-1.5">
              {paymentAccounts.map(acc => (
                <div key={acc.id} className="p-1.5 bg-white/10 rounded-md flex items-center justify-center" title={`${acc.name} - ${acc.number}`}>
                  <acc.icon className="w-3.5 h-3.5 opacity-80" />
                </div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
