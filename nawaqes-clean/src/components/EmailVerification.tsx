// ─── Email Verification Component ──────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, CheckCircle, Shield, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';

interface EmailVerificationProps {
  /** If true, show as a compact inline badge/banner instead of a full page */
  compact?: boolean;
  /** Called when verification succeeds */
  onVerified?: () => void;
}

export const EmailVerification: React.FC<EmailVerificationProps> = ({ compact = false, onVerified }) => {
  const { darkMode } = useAppContext();
  const { currentUser, setCurrentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isVerified = currentUser?.email_verified || currentUser?.is_verified;
  const userEmail = currentUser?.email || '';

  // Auto-focus first input when code is requested
  useEffect(() => {
    if (codeSent && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [codeSent]);

  const handleSendCode = async () => {
    setSendingCode(true);
    setError('');
    try {
      const result = await api.sendEmailVerification();
      setCodeSent(true);
      // In development, show the code
      if (result.code) {
        toast.success(`رمز التحقق (تجريبي): ${result.code}`);
      } else {
        toast.success(t('emailVerification.codeSent'));
      }
    } catch (err: any) {
      setError(err.message || t('emailVerification.invalidCode'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError(t('emailVerification.enterCode'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.verifyEmail(userEmail, fullCode);
      if (result.user) {
        // Update current user state
        setCurrentUser(result.user);
        if (result.token) {
          api.setToken(result.token);
        }
        toast.success(t('emailVerification.verificationSuccess'));
        onVerified?.();
      }
    } catch (err: any) {
      setError(err.message || t('emailVerification.invalidCode'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste: distribute digits across inputs
      const digits = value.replace(/\D/g, '').split('');
      const newCode = [...code];
      for (let i = 0; i < 6 && i + index < 6; i++) {
        if (digits[i] !== undefined) {
          newCode[index + i] = digits[i];
        }
      }
      setCode(newCode);
      // Focus the next empty input or the last one
      const nextEmpty = newCode.findIndex((c, i) => i > index && c === '');
      if (nextEmpty !== -1) inputRefs.current[nextEmpty]?.focus();
      else inputRefs.current[5]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (digit && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        // Small delay to let state settle, then auto-verify
        setTimeout(() => {
          const btn = document.getElementById('verify-btn');
          btn?.click();
        }, 200);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  // ─── Compact mode: just a badge/banner ────────────────────────────
  if (compact && isVerified) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>
        <CheckCircle className="w-3.5 h-3.5" />
        {t('emailVerification.badge')}
      </div>
    );
  }

  if (compact && !isVerified) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSendCode}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${darkMode ? 'bg-amber-900/30 text-amber-400 hover:bg-amber-900/50' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        {t('emailVerification.verifyNow')}
      </motion.button>
    );
  }

  // ─── Full page mode ──────────────────────────────────────────────
  const bgCard = darkMode ? 'bg-gray-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const bgInput = darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir={dir}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${bgCard}`}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${isVerified ? (darkMode ? 'bg-green-900/30' : 'bg-green-100') : (darkMode ? 'bg-orange-900/30' : 'bg-orange-100')}`}>
            {isVerified ? (
              <CheckCircle className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            ) : (
              <Mail className={`w-8 h-8 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
            )}
          </div>
          <h2 className={`text-xl font-black ${textPrimary}`}>{t('emailVerification.title')}</h2>
          <p className={`text-sm mt-1 ${textMuted}`}>
            {isVerified ? t('emailVerification.alreadyVerified') : t('emailVerification.verifyDesc')}
          </p>
        </div>

        {isVerified ? (
          /* ─── Already Verified ─── */
          <div className={`text-center p-4 rounded-xl ${darkMode ? 'bg-green-900/20' : 'bg-green-50'}`}>
            <CheckCircle className={`w-12 h-12 mx-auto mb-2 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
            <p className={`font-bold ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
              {t('emailVerification.verified')}
            </p>
            <p className={`text-xs mt-1 ${textMuted}`}>{userEmail}</p>
          </div>
        ) : (
          /* ─── Verification Flow ─── */
          <AnimatePresence mode="wait">
            {!codeSent ? (
              <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className={`p-4 rounded-xl mb-4 ${darkMode ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                  <div className="flex items-start gap-3">
                    <Shield className={`w-5 h-5 shrink-0 mt-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <div>
                      <p className={`text-sm font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        {userEmail}
                      </p>
                      <p className={`text-xs mt-1 ${textMuted}`}>
                        {t('emailVerification.verifyDesc')}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSendCode}
                  disabled={sendingCode}
                  className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sendingCode ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>
                  ) : (
                    <><Mail className="w-4 h-4" /> {t('emailVerification.sendCode')}</>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Code Input */}
                <p className={`text-sm text-center mb-3 ${textMuted}`}>
                  {t('emailVerification.enterCode')}
                </p>
                <div className="flex justify-center gap-2 mb-4" dir="ltr">
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={e => handleCodeChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      className={`w-11 h-13 text-center text-lg font-black rounded-xl border-2 focus:outline-none focus:border-orange-500 transition-all ${bgInput} ${textPrimary}`}
                    />
                  ))}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-500 text-xs text-center mb-3"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  id="verify-btn"
                  onClick={handleVerify}
                  disabled={loading || code.join('').length !== 6}
                  className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>
                  ) : (
                    <><CheckCircle className="w-4 h-4" /> {t('emailVerification.verify')}</>
                  )}
                </button>

                <div className="flex items-center justify-between mt-4">
                  <p className={`text-xs ${textMuted}`}>
                    {t('emailVerification.codeExpiresIn')}
                  </p>
                  <button
                    onClick={handleSendCode}
                    disabled={sendingCode}
                    className={`text-xs font-bold flex items-center gap-1 ${darkMode ? 'text-orange-400 hover:text-orange-300' : 'text-orange-600 hover:text-orange-500'}`}
                  >
                    <RefreshCw className={`w-3 h-3 ${sendingCode ? 'animate-spin' : ''}`} />
                    {t('emailVerification.resendCode')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
};

// ─── Email Badge Component (for ProfilePage) ──────────────────────
export const EmailBadge: React.FC<{ emailVerified?: boolean }> = ({ emailVerified }) => {
  const { darkMode } = useAppContext();
  const { t } = useTranslation();

  if (emailVerified) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>
        <CheckCircle className="w-3 h-3" />
        {t('emailVerification.badge')}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
      <AlertCircle className="w-3 h-3" />
      {t('emailVerification.notVerified')}
    </span>
  );
};

export default EmailVerification;
