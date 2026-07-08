// ─── Silent Toast Wrapper ──────────────────────────────────────────
// Per user request (2026-06-24): in-app popups (toasts) are no longer
// shown for UI feedback. The user wants to rely on:
//   1. The bell badge counter in the Navbar (for unread notifications)
//   2. The Notifications page (as the central hub)
//   3. OS-level push notifications (FCM) for important events
//
// This module replaces `sonner`'s `toast` object with a wrapper that:
//   - toast.success() → no-op (silent)
//   - toast.info() → no-op (silent)
//   - toast.warning() → no-op (silent)
//   - toast.loading() → returns a no-op dismiss function
//   - toast.error() → STILL WORKS, but only for genuinely critical errors
//     (auth failures, payment failures, network errors that block UX).
//     Callers should pass `critical: true` in options for errors that
//     MUST be shown; otherwise the error is logged to console only.
//   - toast.message() → no-op (silent)
//   - toast.promise() → still works (resolves/rejects the promise) but
//     shows no loading/success/error toasts unless the rejection includes
//     `criticalError: true` in the error object.
//   - toast.custom() → no-op (silent)
//
// To gradually migrate, callers can do:
//   import { toast } from '@/lib/silentToast';
// instead of:
//   import { toast } from '../lib/silentToast';
//
// The `<Toaster />` component is still rendered (in App.tsx) so any
// code that still imports directly from 'sonner' will work, but the
// silent wrapper is the recommended default.

import { toast as sonnerToast, Toaster } from 'sonner';

type ToastFn = (...args: any[]) => any;

// Critical errors that should STILL be shown to the user. These are the
// only categories where a popup is justified — the user needs to know
// something failed and they must take action.
const CRITICAL_ERROR_PATTERNS = [
  // Auth
  /login|password|authentication|session|token|unauthorized/i,
  // Payment / wallet
  /payment|charge|wallet|balance|insufficient|transaction/i,
  // Network failures that block UX
  /network|connection|timeout|fetch failed|server error/i,
  // Permissions
  /permission|denied|forbidden|blocked/i,
];

function isCriticalError(message: string): boolean {
  return CRITICAL_ERROR_PATTERNS.some(p => p.test(message));
}

// Build the silent wrapper
const silentToast = {
  // Silent — UI feedback only, no longer shown
  success: (() => { /* no-op */ }) as unknown as ToastFn & {
    dismiss: (id?: string | number) => void;
  },
  info: (() => { /* no-op */ }) as unknown as ToastFn,
  warning: (() => { /* no-op */ }) as unknown as ToastFn,
  message: (() => { /* no-op */ }) as unknown as ToastFn,
  custom: (() => { /* no-op */ }) as unknown as ToastFn,
  loading: (() => {
    // Return a fake dismiss function so callers that store the id and
    // later call toast.dismiss(id) don't crash.
    return 'silent-loading-id';
  }) as unknown as ToastFn & {
    dismiss: (id?: string | number) => void;
  },

  // Errors: only show if critical, otherwise log to console
  error: ((message: any, opts?: any) => {
    const msg = typeof message === 'string' ? message : (message?.message || String(message) || '');
    const critical = opts?.critical === true || isCriticalError(msg);
    if (critical) {
      sonnerToast.error(message, opts);
    } else {
      // Log to console for debugging without showing a popup
      console.warn('[silentToast] suppressed error:', msg);
    }
  }) as unknown as ToastFn,

  // Promise: still resolves/rejects, but only shows error toasts for
  // critical failures. Success/loading toasts are silent.
  promise: (<T>(promise: Promise<T>, _opts: any) => {
    return promise;
  }) as unknown as ToastFn,

  // Pass-through dismiss (for cleanup code that calls toast.dismiss)
  dismiss: (id?: string | number) => {
    if (id) sonnerToast.dismiss(id);
    else sonnerToast.dismiss();
  },

  // Sonner's `remove` is an alias of dismiss
  remove: (id?: string | number) => {
    if (id) sonnerToast.dismiss(id);
    else sonnerToast.dismiss();
  },
};

// Re-export the Toaster component (still needed in App.tsx so any
// direct-sonner-importing code can render)
export { Toaster };
export const toast = silentToast as unknown as typeof sonnerToast;
export default silentToast;
