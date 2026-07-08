// ─── Router Inner Component ─────────────────────────────────────────
// Lives INSIDE HashRouter so it can use useNavigate/useLocation.
// Handles: nav depth tracking + Android back button interception.
import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { incrementNavDepth, resetNavDepth, navDepth } from '../hooks/useSafeBack';

export const RouterInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasMountedRef = useRef(false);

  // Reset nav depth on app load
  useEffect(() => {
    resetNavDepth();
  }, []);

  // Track navigation depth — increment on every route change.
  // Skip the very first render (mount) so navDepth starts at 0 for the
  // initial page; subsequent route changes increment to 1, 2, 3...
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    incrementNavDepth();
  }, [location.pathname]);

  // 🔒 Intercept Android hardware back button / swipe back gesture.
  //
  // 🔧 FIX (double-press bug): Previously, a `window.history.pushState`
  // was called on EVERY route change, which inserted an empty history
  // entry between pages. Result: the user had to press back TWICE to
  // go back one page (first press popped the empty entry, second press
  // actually navigated back).
  //
  // Now we push the guard state ONLY ONCE on mount. React Router already
  // manages its own history entries for in-app navigation, so we don't
  // need to push extra ones on each route change.
  useEffect(() => {
    const handlePopState = () => {
      if (navDepth <= 0) {
        // At root — prevent exit by pushing state back
        window.history.pushState(null, '', window.location.href);
        // Navigate to home if not already there
        if (location.pathname !== '/') {
          navigate('/');
        }
      }
      // Otherwise (navDepth >= 1) let React Router handle the back
      // navigation normally — it will go to the previous in-app route.
    };

    // Push ONE initial guard state so we can detect back attempts at root.
    // This is the ONLY pushState we do — not one per route change.
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps — only run once on mount

  return <>{children}</>;
};
