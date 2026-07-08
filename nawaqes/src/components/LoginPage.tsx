// ─── Nawaqes Login & Register Page ─────────────────────────────────
// Modern full-screen design with:
//   • Animated gradient background (orange/amber/dark) with floating shapes
//   • Glass-morphism card with backdrop-blur
//   • Single-form Login + Register (no tabs — toggle mode inline)
//   • Password strength meter (5 bars) + requirements checklist
//   • Real-time validation (green check / red X)
//   • Rate limiting UI (5 attempts → 60s lockout with countdown)
//   • Remember-me checkbox + forgot-password 3-step modal flow
//   • Social login buttons (visual only — toast "قريباً")
//   • Demo credentials quick-fill button
//   • Full RTL + dark-mode support
//   • motion/react animations throughout

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Mail, Lock, User, Eye, EyeOff, ShieldCheck, KeyRound, Phone,
  Check, X, Sparkles, AlertCircle, Clock, Loader2, Zap,
  TrendingUp, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
  Download, Smartphone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { api } from '../services/api';
import { interestCategories } from '../config/interests';

// ─── Constants ─────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

// ─── Helpers ───────────────────────────────────────────────────────

/** Email regex — simple but practical. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Egyptian phone regex: 010|011|012|015 + 8 digits = 11 digits total. */
const PHONE_EG_RE = /^01[0125][0-9]{8}$/;

type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4 | 5; // 0 = empty, 5 = very strong
  label: string;
  bars: number; // 0..5
  color: string; // tailwind bg class for active bars
  textColor: string; // tailwind text class for label
  checks: { id: 'length' | 'upper' | 'lower' | 'number'; ok: boolean; label: string };
};

function calcStrength(pw: string): PasswordStrength {
  const length = pw.length >= 8;
  const upper = /[A-Z]/.test(pw);
  const lower = /[a-z]/.test(pw);
  const number = /[0-9]/.test(pw);

  let raw = 0;
  if (length) raw++;
  if (upper) raw++;
  if (lower) raw++;
  if (number) raw++;
  // bonus for length ≥ 12 + symbol
  if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) raw++;
  // Map to 0..5 (5 = very strong)
  const score = (pw.length === 0 ? 0 : Math.min(5, raw)) as PasswordStrength['score'];

  const map: Record<number, { label: string; color: string; textColor: string }> = {
    0: { label: '—', color: 'bg-gray-300 dark:bg-gray-600', textColor: 'text-gray-500 dark:text-gray-400' },
    1: { label: 'ضعيفة جداً', color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
    2: { label: 'ضعيفة', color: 'bg-orange-500', textColor: 'text-orange-600 dark:text-orange-400' },
    3: { label: 'متوسطة', color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
    4: { label: 'جيدة', color: 'bg-lime-500', textColor: 'text-lime-600 dark:text-lime-400' },
    5: { label: 'قوية جداً', color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400' },
  };

  return {
    score,
    label: map[score].label,
    bars: score,
    color: map[score].color,
    textColor: map[score].textColor,
    checks: { id: 'length', ok: false, label: '' },
  };
}

function meetsRequirements(pw: string): {
  length: boolean; upper: boolean; lower: boolean; number: boolean;
} {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
  };
}

// ─── Floating shapes (background) ──────────────────────────────────
// Pre-defined shapes for stable animation. Each shape drifts slowly.
const FLOATING_SHAPES = [
  { size: 220, top: '8%', start: '5%', drift: 80, duration: 18, opacity: 0.18, hue: 'amber' },
  { size: 160, top: '62%', start: '78%', drift: -60, duration: 22, opacity: 0.15, hue: 'orange' },
  { size: 300, top: '40%', start: '70%', drift: 40, duration: 26, opacity: 0.12, hue: 'rose' },
  { size: 120, top: '82%', start: '20%', drift: -50, duration: 16, opacity: 0.20, hue: 'amber' },
  { size: 90, top: '18%', start: '85%', drift: -30, duration: 14, opacity: 0.22, hue: 'orange' },
  { size: 200, top: '88%', start: '55%', drift: 70, duration: 24, opacity: 0.14, hue: 'rose' },
];

const SHAPE_HUE_CLASSES: Record<string, string> = {
  amber: 'bg-amber-300',
  orange: 'bg-orange-400',
  rose: 'bg-rose-500',
};

// ─── Main Component ────────────────────────────────────────────────
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, currentUser, isLoggedIn } = useAuth();
  const { t } = useTranslation();
  const { dir, language, toggleLanguage } = useLanguage();

  const [mode, setMode] = useState<'login' | 'register'>('login');

  // ── Shared UI state ──
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ── Login fields ──
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Rate-limit state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null); // epoch ms
  const [nowTick, setNowTick] = useState(Date.now());

  // ── Register fields ──
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  // Date of birth — split into 3 simple dropdowns (much easier on mobile than <input type="date">)
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  // Compose into ISO date (YYYY-MM-DD) for the backend
  const registerDateOfBirth = useMemo(() => {
    if (!dobYear || !dobMonth || !dobDay) return '';
    return `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
  }, [dobYear, dobMonth, dobDay]);
  const [registerGender, setRegisterGender] = useState<'male' | 'female'>('male');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // ── Forgot password modal ──
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotNewPwConfirm, setForgotNewPwConfirm] = useState('');
  const [forgotShowPw, setForgotShowPw] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // ── Shake animation triggers ──
  const [loginShake, setLoginShake] = useState(0);
  const [registerShake, setRegisterShake] = useState(0);

  // Refs for uncontrolled focus on step transitions
  const cardRef = useRef<HTMLDivElement>(null);

  // ── Load saved email for "remember me" ──
  useEffect(() => {
    const saved = localStorage.getItem('nawaqes_remember_email');
    if (saved) {
      setLoginEmail(saved);
      setRememberMe(true);
    }
  }, []);

  // ── Tick every second while lockout is active (for countdown) ──
  useEffect(() => {
    if (lockoutUntil === null) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockoutUntil]);

  // Clear lockout when timer elapses
  useEffect(() => {
    if (lockoutUntil !== null && Date.now() >= lockoutUntil) {
      setLockoutUntil(null);
      setFailedAttempts(0);
    }
  }, [nowTick, lockoutUntil]);

  // ── Navigate after auth state populated ──
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      if (currentUser.isAdmin) navigate('/admin', { replace: true });
      else navigate('/', { replace: true });
    }
  }, [isLoggedIn, currentUser, navigate]);

  // ── Android hardware back: close forgot modal if open ──
  useEffect(() => {
    if (!showForgot) return;
    const handler = (e: PopStateEvent) => {
      e.preventDefault();
      setShowForgot(false);
      return false;
    };
    window.history.pushState({ nawaqesForgot: true }, '');
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [showForgot]);

  // ── Validation memo (register) ──
  const rNameValid = useMemo(() => registerName.trim().length >= 3, [registerName]);
  const rEmailValid = useMemo(() => EMAIL_RE.test(registerEmail), [registerEmail]);
  const rPhoneValid = useMemo(() => PHONE_EG_RE.test(registerPhone), [registerPhone]);
  const rPwReqs = useMemo(() => meetsRequirements(registerPassword), [registerPassword]);
  // rPwStrength recomputed inline where needed (renderStrengthBars) — no memo needed here.
  const rPwMatch = useMemo(
    () => registerConfirm.length > 0 && registerPassword === registerConfirm,
    [registerPassword, registerConfirm]
  );
  const rDobValid = useMemo(() => !!registerDateOfBirth, [registerDateOfBirth]);
  const rInterestsValid = useMemo(() => selectedInterests.length > 0, [selectedInterests]);
  const [termsAgreed, setTermsAgreed] = useState(false);

  const rCanSubmit =
    rNameValid && rEmailValid && rPhoneValid && rPwReqs.length && rPwReqs.upper &&
    rPwReqs.lower && rPwReqs.number && rPwMatch && rDobValid && rInterestsValid && termsAgreed;

  // ── Lockout helpers ──
  const isLockedOut = lockoutUntil !== null && Date.now() < lockoutUntil;
  const remainingSeconds = isLockedOut ? Math.max(0, Math.ceil(((lockoutUntil ?? 0) - Date.now()) / 1000)) : 0;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - failedAttempts);

  // ── Login handler ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut) return;
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const ok = await login(loginEmail.trim(), loginPassword);
      if (ok) {
        // Persist email if remember me
        if (rememberMe) localStorage.setItem('nawaqes_remember_email', loginEmail.trim());
        else localStorage.removeItem('nawaqes_remember_email');
        // Navigate is handled by effect watching isLoggedIn
      } else {
        // Login failed (toast already shown by AuthContext)
        const next = failedAttempts + 1;
        setFailedAttempts(next);
        setLoginShake(s => s + 1);
        if (next >= MAX_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setLoginError('محاولات كثيرة، حاول بعد دقيقة');
        } else {
          setLoginError(`بيانات الدخول غير صحيحة — محاولات متبقية: ${MAX_ATTEMPTS - next}`);
        }
      }
    } catch (err: any) {
      setLoginError(err?.message || 'تعذّر تسجيل الدخول');
      setLoginShake(s => s + 1);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // ── Register handler ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);
    if (!rCanSubmit) {
      setRegisterShake(s => s + 1);
      // helpful inline error
      if (!termsAgreed) setRegisterError('يجب الموافقة على الشروط والأحكام');
      else if (!rInterestsValid) setRegisterError('اختر اهتماماً واحداً على الأقل');
      else setRegisterError('يرجى مراجعة الحقول المطلوبة');
      return;
    }
    setIsRegistering(true);
    try {
      const ok = await register(
        registerName.trim(),
        registerEmail.trim(),
        registerPassword,
        selectedInterests,
        registerPhone.trim(),
        registerGender,
        registerDateOfBirth,
      );
      if (ok) {
        // AuthContext shows welcome toast; navigate via effect
      } else {
        setRegisterShake(s => s + 1);
        setRegisterError('تعذّر إنشاء الحساب — تحقق من البيانات');
      }
    } catch (err: any) {
      setRegisterShake(s => s + 1);
      setRegisterError(err?.message || 'تعذّر إنشاء الحساب');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleInterestToggle = (id: string) => {
    setSelectedInterests(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // ── Forgot password flow ──
  const openForgot = () => {
    setForgotStep('email');
    setForgotEmail(loginEmail || '');
    setForgotCode('');
    setForgotNewPw('');
    setForgotNewPwConfirm('');
    setForgotError(null);
    setShowForgot(true);
  };

  const handleForgotSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(forgotEmail)) {
      setForgotError('بريد إلكتروني غير صالح');
      return;
    }
    setForgotError(null);
    setForgotBusy(true);
    try {
      const data = await api.forgotPassword(forgotEmail.trim());
      // In dev the backend returns the code — surface it for convenience.
      if (data.resetCode) {
        toast.success?.(t('auth.resetCodeInfo', { code: data.resetCode }));
      } else {
        toast.success?.('تم إرسال رمز إعادة التعيين إلى بريدك');
      }
      setForgotStep('code');
    } catch (err: any) {
      setForgotError(err?.message || 'تعذّر إرسال الرمز');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleForgotVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotCode.trim().length < 4) {
      setForgotError('أدخل رمز إعادة التعيين');
      return;
    }
    setForgotError(null);
    setForgotBusy(true);
    try {
      // Backend doesn't have a separate verify endpoint — moving to password step.
      // The reset call validates the code; we let the user pick a password now.
      setForgotStep('password');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const reqs = meetsRequirements(forgotNewPw);
    if (!reqs.length || !reqs.upper || !reqs.lower || !reqs.number) {
      setForgotError('كلمة المرور لا تستوفي المتطلبات');
      return;
    }
    if (forgotNewPw !== forgotNewPwConfirm) {
      setForgotError('كلمتا المرور غير متطابقتين');
      return;
    }
    setForgotError(null);
    setForgotBusy(true);
    try {
      await api.resetPassword(forgotCode.trim(), forgotNewPw);
      setForgotStep('done');
      toast.success?.('تم إعادة تعيين كلمة المرور بنجاح');
    } catch (err: any) {
      setForgotError(err?.message || 'فشل إعادة التعيين — تحقق من الرمز');
    } finally {
      setForgotBusy(false);
    }
  };

  const closeForgot = () => setShowForgot(false);

  // RTL-aware forward arrow used inside the login submit button.
  const FwdArrow = dir === 'rtl' ? ArrowRight : ArrowLeft;

  // ── Floating shapes render ──
  const renderFloatingShapes = () => (
    <>
      {FLOATING_SHAPES.map((s, i) => (
        <motion.div
          key={i}
          aria-hidden
          className={`absolute rounded-full blur-3xl pointer-events-none ${SHAPE_HUE_CLASSES[s.hue]}`}
          style={{
            width: s.size,
            height: s.size,
            top: s.top,
            [dir === 'rtl' ? 'right' : 'left']: s.start,
            opacity: s.opacity,
          }}
          animate={{
            x: [0, s.drift, 0],
            y: [0, s.drift * 0.6, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: s.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 1.2,
          }}
        />
      ))}
    </>
  );

  // ── Field-level validation icon ──
  const FieldStatus = ({ ok, show }: { ok: boolean; show: boolean }) => (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className={`absolute ${dir === 'rtl' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2`}
        >
          {ok
            ? <CheckCircle2 className="w-5 h-5 text-green-500" />
            : <XCircle className="w-5 h-5 text-red-500" />}
        </motion.span>
      )}
    </AnimatePresence>
  );

  // ── Password strength bars (5) ──
  const renderStrengthBars = (pw: string) => {
    const s = calcStrength(pw);
    return (
      <div className="mt-2">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= s.bars ? s.color : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-[11px] font-bold ${s.textColor}`}>
            {pw.length === 0 ? 'متطلبات كلمة المرور' : s.label}
          </span>
        </div>
      </div>
    );
  };

  // ── Password requirements checklist ──
  const renderRequirements = (pw: string) => {
    const r = meetsRequirements(pw);
    const items: { ok: boolean; label: string }[] = [
      { ok: r.length, label: '٨ أحرف على الأقل' },
      { ok: r.upper, label: 'حرف كبير (A-Z)' },
      { ok: r.lower, label: 'حرف صغير (a-z)' },
      { ok: r.number, label: 'رقم (0-9)' },
    ];
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
              it.ok ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            }`}>
              {it.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            </span>
            <span className={`text-[11px] font-medium ${it.ok ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {it.label}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // ── Input class ──
  const inputCls = (hasError?: boolean, hasIcon = true) =>
    `w-full ${hasIcon ? (dir === 'rtl' ? 'pr-10' : 'pl-10') : ''} ${hasIcon ? (dir === 'rtl' ? 'pl-10' : 'pr-10') : ''} py-3.5 rounded-xl border bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm text-gray-900 dark:text-gray-100 text-sm font-medium outline-none focus:ring-2 transition-all placeholder:text-gray-400 ${
      hasError
        ? 'border-red-400 focus:border-red-500 focus:ring-red-200 dark:focus:ring-red-900/40'
        : 'border-gray-200 dark:border-gray-700 focus:border-orange-500 focus:ring-orange-200 dark:focus:ring-orange-900/40'
    }`;

  // ── Login form ──
  const renderLoginForm = () => (
    <motion.form
      key="login"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      onSubmit={handleLogin}
      className="space-y-4"
    >
      {/* Email */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.email')}
        </label>
        <div className="relative">
          <Mail className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type="email"
            autoComplete="email"
            value={loginEmail}
            onChange={e => { setLoginEmail(e.target.value); setLoginError(null); }}
            placeholder="example@email.com"
            className={inputCls(false)}
            required
            dir="ltr"
          />
        </div>
      </motion.div>

      {/* Password */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.password')}
        </label>
        <div className="relative">
          <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={loginPassword}
            onChange={e => { setLoginPassword(e.target.value); setLoginError(null); }}
            placeholder="••••••••"
            className={`${inputCls(false)} ${dir === 'rtl' ? 'pl-10' : 'pr-10'}`}
            required
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className={`absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </motion.div>

      {/* Remember + Forgot row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex items-center justify-between"
      >
        <button
          type="button"
          onClick={() => setRememberMe(v => !v)}
          className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 select-none"
        >
          <span className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
            rememberMe
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600'
          }`}>
            {rememberMe && <Check className="w-3.5 h-3.5" />}
          </span>
          تذكرني
        </button>
        <button
          type="button"
          onClick={openForgot}
          className="text-xs font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
        >
          {t('auth.forgotPassword')}
        </button>
      </motion.div>

      {/* Inline error */}
      <AnimatePresence>
        {loginError && (
          <motion.div
            key={loginShake}
            initial={{ opacity: 0, y: -5 }}
            animate={{
              opacity: 1, y: 0,
              x: [0, -8, 8, -6, 6, -3, 3, 0],
            }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-bold"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{loginError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lockout countdown banner */}
      <AnimatePresence>
        {isLockedOut && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 text-xs font-bold"
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>محاولات كثيرة، حاول بعد {remainingSeconds} ثانية</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attempts remaining (after first failure) */}
      <AnimatePresence>
        {failedAttempts > 0 && !isLockedOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[11px] font-bold text-amber-600 dark:text-amber-400 text-center"
          >
            محاولات متبقية: {attemptsLeft}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={isLoggingIn || isLockedOut}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full py-4 rounded-xl font-black text-base text-white shadow-lg shadow-orange-500/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-l from-orange-600 via-orange-500 to-amber-500 hover:shadow-orange-500/40 transition-shadow"
      >
        {isLoggingIn ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('common.loading')}
          </>
        ) : (
          <>
            {t('auth.login')}
            <FwdArrow className="w-5 h-5" />
          </>
        )}
      </motion.button>

      {/* Register link */}
      <div className="text-center pt-2">
        <span className="text-xs text-gray-600 dark:text-gray-400">ليس لديك حساب؟ </span>
        <button
          type="button"
          onClick={() => { setMode('register'); setRegisterError(null); }}
          className="text-xs font-black text-orange-600 hover:text-orange-700 dark:text-orange-400"
        >
          أنشئ حساباً جديداً
        </button>
      </div>
    </motion.form>
  );

  // ── Register form ──
  const renderRegisterForm = () => (
    <motion.form
      key="register"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      onSubmit={handleRegister}
      className="space-y-4"
    >
      {/* Full name */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.fullName')}
        </label>
        <div className="relative">
          <User className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            autoComplete="name"
            value={registerName}
            onChange={e => setRegisterName(e.target.value)}
            placeholder={t('auth.namePlaceholder')}
            className={inputCls(false)}
            required
            dir={dir === 'rtl' ? 'rtl' : 'ltr'}
          />
          <FieldStatus ok={rNameValid} show={registerName.length > 0} />
        </div>
      </motion.div>

      {/* Email */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.email')}
        </label>
        <div className="relative">
          <Mail className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type="email"
            autoComplete="email"
            value={registerEmail}
            onChange={e => setRegisterEmail(e.target.value)}
            placeholder="example@email.com"
            className={inputCls(false)}
            required
            dir="ltr"
          />
          <FieldStatus ok={rEmailValid} show={registerEmail.length > 0} />
        </div>
      </motion.div>

      {/* Phone */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.phone')} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Phone className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={registerPhone}
            onChange={e => setRegisterPhone(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="01xxxxxxxxx"
            maxLength={11}
            className={inputCls(false)}
            required
            dir="ltr"
          />
          <FieldStatus ok={rPhoneValid} show={registerPhone.length > 0} />
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">صيغة مصرية: 01٠١٢٥ ثم ٨ أرقام</p>
      </motion.div>

      {/* Password */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.password')}
        </label>
        <div className="relative">
          <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={registerPassword}
            onChange={e => setRegisterPassword(e.target.value)}
            placeholder="••••••••"
            className={`${inputCls(false)} ${dir === 'rtl' ? 'pl-10' : 'pr-10'}`}
            required
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            className={`absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
            aria-label={showPassword ? 'إخفاء' : 'إظهار'}
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {renderStrengthBars(registerPassword)}
        {registerPassword.length > 0 && renderRequirements(registerPassword)}
      </motion.div>

      {/* Confirm password */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          تأكيد كلمة المرور
        </label>
        <div className="relative">
          <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={registerConfirm}
            onChange={e => setRegisterConfirm(e.target.value)}
            placeholder="••••••••"
            className={`${inputCls(registerConfirm.length > 0 && !rPwMatch)} ${dir === 'rtl' ? 'pl-10' : 'pr-10'}`}
            required
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(v => !v)}
            className={`absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
            aria-label={showConfirmPassword ? 'إخفاء' : 'إظهار'}
          >
            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          <FieldStatus ok={rPwMatch} show={registerConfirm.length > 0} />
        </div>
        {registerConfirm.length > 0 && !rPwMatch && (
          <p className="text-[11px] font-bold text-red-500 mt-1">كلمتا المرور غير متطابقتين</p>
        )}
      </motion.div>

      {/* Date of birth — 3 simple dropdowns (mobile-friendly) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.dateOfBirth')} <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {/* Day */}
          <select
            value={dobDay}
            onChange={e => setDobDay(e.target.value)}
            className={`${inputCls(false)} pr-2 ${dir === 'rtl' ? 'pl-7' : 'pl-2'} appearance-none cursor-pointer`}
            required
          >
            <option value="">اليوم</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>{d}</option>
            ))}
          </select>
          {/* Month */}
          <select
            value={dobMonth}
            onChange={e => setDobMonth(e.target.value)}
            className={`${inputCls(false)} pr-2 ${dir === 'rtl' ? 'pl-7' : 'pl-2'} appearance-none cursor-pointer`}
            required
          >
            <option value="">الشهر</option>
            {[
              'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
              'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
            ].map((name, i) => (
              <option key={i + 1} value={String(i + 1)}>{name}</option>
            ))}
          </select>
          {/* Year */}
          <select
            value={dobYear}
            onChange={e => setDobYear(e.target.value)}
            className={`${inputCls(false)} pr-2 ${dir === 'rtl' ? 'pl-7' : 'pl-2'} appearance-none cursor-pointer`}
            required
          >
            <option value="">السنة</option>
            {(() => {
              const currentYear = new Date().getFullYear();
              const minYear = currentYear - 120;
              const maxYear = currentYear - 13; // must be at least 13
              const years: number[] = [];
              for (let y = maxYear; y >= minYear; y--) years.push(y);
              return years.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ));
            })()}
          </select>
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          يجب أن يكون عمرك 13 سنة على الأقل
        </p>
      </motion.div>

      {/* Gender — pill buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28 }}
      >
        <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
          {t('auth.gender')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setRegisterGender('male')}
            className={`flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all active:scale-95 ${
              registerGender === 'male'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-500/30'
                : 'bg-white/70 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            <span className="text-base">👨</span>
            {t('auth.male')}
          </button>
          <button
            type="button"
            onClick={() => setRegisterGender('female')}
            className={`flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all active:scale-95 ${
              registerGender === 'female'
                ? 'bg-orange-600 text-white shadow-md shadow-orange-500/30'
                : 'bg-white/70 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
            }`}
          >
            <span className="text-base">👩</span>
            {t('auth.female')}
          </button>
        </div>
      </motion.div>

      {/* Interests picker (inline grid) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
            اختر اهتماماتك <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
            {selectedInterests.length} مُختار
          </span>
        </div>
        <div className="max-h-56 overflow-y-auto pr-1 -mr-1 rounded-2xl bg-white/40 dark:bg-gray-900/30 backdrop-blur border border-gray-200 dark:border-gray-700 p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {interestCategories.map(it => {
            const selected = selectedInterests.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => handleInterestToggle(it.id)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-full text-[11px] font-bold transition-all active:scale-95 ${
                  selected
                    ? 'bg-orange-600 text-white shadow-md shadow-orange-500/30'
                    : 'bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-orange-300'
                }`}
              >
                <span className="text-sm">{it.icon}</span>
                <span className="truncate">{t(it.nameKey)}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Terms */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36 }}
      >
        <button
          type="button"
          onClick={() => setTermsAgreed(v => !v)}
          className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 select-text"
        >
          <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
            termsAgreed
              ? 'bg-orange-600 text-white border-orange-600'
              : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600'
          }`}>
            {termsAgreed && <Check className="w-3.5 h-3.5" />}
          </span>
          <span>
            أوافق على <span className="font-bold text-orange-600 dark:text-orange-400">الشروط والأحكام</span> و
            <span className="font-bold text-orange-600 dark:text-orange-400"> سياسة الخصوصية</span>
          </span>
        </button>
      </motion.div>

      {/* Inline error */}
      <AnimatePresence>
        {registerError && (
          <motion.div
            key={registerShake}
            initial={{ opacity: 0, y: -5 }}
            animate={{
              opacity: 1, y: 0,
              x: [0, -8, 8, -6, 6, -3, 3, 0],
            }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-bold"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{registerError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={isRegistering || !rCanSubmit}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full py-4 rounded-xl font-black text-base text-white shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-gradient-to-l from-orange-600 via-orange-500 to-amber-500 hover:shadow-orange-500/40 transition-shadow"
      >
        {isRegistering ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            {t('common.loading')}
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            إنشاء حساب جديد
          </>
        )}
      </motion.button>

      {/* Login link */}
      <div className="text-center pt-1">
        <span className="text-xs text-gray-600 dark:text-gray-400">لديك حساب بالفعل؟ </span>
        <button
          type="button"
          onClick={() => { setMode('login'); setLoginError(null); }}
          className="text-xs font-black text-orange-600 hover:text-orange-700 dark:text-orange-400"
        >
          {t('auth.login')}
        </button>
      </div>
    </motion.form>
  );

  // ── Forgot password modal ──
  const renderForgotModal = () => {
    if (!showForgot) return null;
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={closeForgot}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800"
            dir={dir}
          >
            {/* Header */}
            <div className="p-6 bg-gradient-to-l from-orange-600 to-amber-500 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-lg">استعادة كلمة المرور</h3>
                    <p className="text-xs text-white/80">
                      الخطوة {forgotStep === 'email' ? 1 : forgotStep === 'code' ? 2 : forgotStep === 'password' ? 3 : 3} من 3
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeForgot}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Step indicator */}
              <div className="flex gap-1.5 mt-4">
                {['email', 'code', 'password'].map((s, i) => {
                  const order = { email: 1, code: 2, password: 3 } as const;
                  const current = forgotStep === 'done' ? 4 : order[forgotStep as 'email' | 'code' | 'password'];
                  const active = current >= i + 1;
                  return (
                    <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${active ? 'bg-white' : 'bg-white/30'}`} />
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {forgotError && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotStep === 'email' && (
                <form onSubmit={handleForgotSendCode} className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    أدخل بريدك الإلكتروني وسنرسل لك رمز إعادة التعيين.
                  </p>
                  <div className="relative">
                    <Mail className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
                    <input
                      type="email"
                      autoComplete="email"
                      value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value); setForgotError(null); }}
                      placeholder="example@email.com"
                      className={inputCls(false)}
                      required
                      dir="ltr"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {forgotBusy ? t('common.loading') : 'إرسال الرمز'}
                  </button>
                </form>
              )}

              {forgotStep === 'code' && (
                <form onSubmit={handleForgotVerifyCode} className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    أدخل رمز إعادة التعيين المُرسل إلى بريدك.
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={forgotCode}
                    onChange={e => { setForgotCode(e.target.value.replace(/[^\d]/g, '')); setForgotError(null); }}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-2xl font-black text-center tracking-[0.5em] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                    required
                    dir="ltr"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    {forgotBusy ? t('common.loading') : 'تحقق من الرمز'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep('email')}
                    className="w-full text-xs font-bold text-gray-500 hover:text-orange-600"
                  >
                    {t('common.back')}
                  </button>
                </form>
              )}

              {forgotStep === 'password' && (
                <form onSubmit={handleForgotReset} className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    أدخل كلمة المرور الجديدة.
                  </p>
                  <div className="relative">
                    <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
                    <input
                      type={forgotShowPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={forgotNewPw}
                      onChange={e => { setForgotNewPw(e.target.value); setForgotError(null); }}
                      placeholder="كلمة المرور الجديدة"
                      className={`${inputCls(false)} ${dir === 'rtl' ? 'pl-10' : 'pr-10'}`}
                      required
                      dir="ltr"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setForgotShowPw(v => !v)}
                      className={`absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ${dir === 'rtl' ? 'left-3' : 'right-3'}`}
                    >
                      {forgotShowPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {renderStrengthBars(forgotNewPw)}
                  <div className="relative">
                    <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${dir === 'rtl' ? 'right-3' : 'left-3'}`} />
                    <input
                      type={forgotShowPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={forgotNewPwConfirm}
                      onChange={e => { setForgotNewPwConfirm(e.target.value); setForgotError(null); }}
                      placeholder="تأكيد كلمة المرور"
                      className={`${inputCls(false)} ${dir === 'rtl' ? 'pl-10' : 'pr-10'}`}
                      required
                      dir="ltr"
                    />
                  </div>
                  {forgotNewPwConfirm.length > 0 && forgotNewPw !== forgotNewPwConfirm && (
                    <p className="text-[11px] font-bold text-red-500">كلمتا المرور غير متطابقتين</p>
                  )}
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    {forgotBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {forgotBusy ? t('common.loading') : 'إعادة التعيين'}
                  </button>
                </form>
              )}

              {forgotStep === 'done' && (
                <div className="text-center py-4 space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                    className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center"
                  >
                    <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" />
                  </motion.div>
                  <h4 className="font-black text-lg text-gray-900 dark:text-gray-100">تم بنجاح!</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    تم إعادة تعيين كلمة المرور. يمكنك الآن تسجيل الدخول.
                  </p>
                  <button
                    onClick={() => {
                      closeForgot();
                      setLoginEmail(forgotEmail);
                      setMode('login');
                    }}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white bg-orange-600 hover:bg-orange-700 active:scale-[0.98]"
                  >
                    الذهاب لتسجيل الدخول
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div
      className="fixed inset-0 overflow-y-auto bg-gradient-to-br from-orange-600 via-orange-700 to-amber-900 dark:from-gray-950 dark:via-orange-950 dark:to-black"
      dir={dir}
    >
      {/* Animated background layer (lighter) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {renderFloatingShapes()}
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            color: 'white',
          }}
        />
        {/* Top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-400/20 dark:bg-amber-500/10 blur-3xl" />
      </div>

      {/* Top-right language toggle */}
      <div className="absolute top-4 left-4 z-30">
        <button
          onClick={toggleLanguage}
          className="px-3 py-2 rounded-full bg-white/20 dark:bg-gray-900/40 backdrop-blur text-white text-xs font-bold hover:bg-white/30 transition-colors flex items-center gap-1.5"
        >
          <span>🌐</span>
          {language === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      {/* Logo + tagline */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 pt-10 pb-6 px-6 text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 14 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/15 backdrop-blur-xl border border-white/30 shadow-2xl mb-4 relative"
        >
          <span className="text-4xl font-black text-white drop-shadow-lg">ن</span>
          {/* Glow */}
          <div className="absolute inset-0 rounded-3xl bg-orange-400/40 blur-xl -z-10" />
        </motion.div>
        <h1 className="text-3xl font-black text-white drop-shadow-md mb-1">
          نواقص
        </h1>
        <p className="text-orange-50/90 text-sm font-bold">منصة الإعلانات الذكية</p>
        <p className="text-orange-100/70 text-xs mt-1">سوّق بذكاء — بِع واشترِ بأمان</p>
      </motion.div>

      {/* Glass card */}
      <div className="relative z-10 px-4 pb-10 flex justify-center">
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md bg-white/80 dark:bg-gray-900/70 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/40 dark:border-gray-700/50 p-6 sm:p-8"
        >
          {/* Mode toggle (single form — switch via buttons) */}
          <div className="flex gap-1 p-1 bg-gray-200/70 dark:bg-gray-800/60 rounded-2xl mb-6">
            {[
              { id: 'login' as const, label: t('auth.login') },
              { id: 'register' as const, label: t('auth.register') },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id); setLoginError(null); setRegisterError(null); }}
                className={`relative flex-1 py-2.5 rounded-xl text-sm font-black transition-colors ${
                  mode === tab.id
                    ? 'text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {mode === tab.id && (
                  <motion.div
                    layoutId="modePill"
                    className="absolute inset-0 bg-gradient-to-l from-orange-600 to-amber-500 rounded-xl shadow-md shadow-orange-500/30"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Form (animated switch) */}
          <AnimatePresence mode="wait">
            {mode === 'login' ? renderLoginForm() : renderRegisterForm()}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Trust badges row */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="relative z-10 px-6 pb-10 flex justify-center"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-white/80 text-[11px] font-bold">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> حماية وموثوقية</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> وصول ذكي</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> تقارير سوق</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> مجتمع آمن</span>
        </div>
      </motion.div>

      {/* ─── Download App Link ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="relative z-10 px-6 pb-4 flex flex-col items-center gap-2"
      >
        <div className="flex items-center gap-2 text-white/80 text-xs font-bold">
          <Smartphone className="w-4 h-4" />
          <span>حمّل تطبيق نواقص الآن</span>
        </div>
        <a
          href="https://huggingface.co/datasets/safwatkhokha/nawaqes-backup/resolve/main/nawaqes-native-v2.5.0.apk"
          download
          className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 hover:bg-white/20 transition-all active:scale-95"
          style={{ textDecoration: 'none' }}
        >
          <Download className="w-5 h-5 text-white" />
          <div className="text-start">
            <p className="text-white text-xs font-bold leading-tight">تطبيق نواقص v2.5.0 Native</p>
            <p className="text-white/60 text-[9px] leading-tight">APK — السوق الذكي + قنوات + بث مباشر</p>
          </div>
        </a>
      </motion.div>

      {/* Footer */}
      <div className="relative z-10 pb-6 text-center">
        <p className="text-white/60 text-[10px]">© 2026 نواقص — جميع الحقوق محفوظة</p>
      </div>

      {/* Forgot password modal */}
      {renderForgotModal()}
    </div>
  );
};
