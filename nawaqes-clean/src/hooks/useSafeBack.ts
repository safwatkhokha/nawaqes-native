// ─── Safe Back Navigation Hook ─────────────────────────────────────
// Prevents navigate(-1) from exiting/minimizing the app on mobile WebView.
//
// Problem: With HashRouter, navigate(-1) goes back in browser history.
// On mobile WebView (APK), going back past the app's initial URL
// minimizes/exits the app.
//
// Solution: Track navigation depth at module level. Only use navigate(-1)
// if we know there's a safe in-app page to go back to.
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Module-level: starts at 0 on app load. Incremented on each in-app
// navigation. Decremented on each safeBack() call.
export let navDepth = 0;

/** Increment nav depth — call on every route change */
export function incrementNavDepth() {
  navDepth++;
}

/** Reset nav depth — call on app load */
export function resetNavDepth() {
  navDepth = 0;
}

/**
 * Safe back navigation. Uses navigate(-1) only if there's in-app
 * history (navDepth >= 1). Otherwise navigates to home '/'.
 */
export function useSafeBack() {
  const navigate = useNavigate();

  return useCallback(() => {
    if (navDepth >= 1) {
      navDepth = Math.max(0, navDepth - 1);
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [navigate]);
}
