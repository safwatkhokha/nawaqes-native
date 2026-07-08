// ─── PullToRefresh Hook ─────────────────────────────────────────────
// Detects pull-down gesture at the top of a scroll container and triggers
// a refresh callback. Also detects swipe-left/right for page navigation.
import { useState, useRef, useCallback, useEffect } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // px to trigger refresh (default 70)
}

export function usePullToRefresh({
  onRefresh,
  onSwipeLeft,
  onSwipeRight,
  threshold = 70,
}: PullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const startX = useRef(0);
  const isPulling = useRef(false);
  const isSwiping = useRef(false);
  const scrollEl = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = scrollEl.current;
    if (!el) return;
    // Only start pull if at top of scroll
    if (el.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      isPulling.current = true;
      isSwiping.current = false;
    } else {
      // Track for horizontal swipe even when not at top
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isSwiping.current = true;
      isPulling.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPulling.current && !isRefreshing) {
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0) {
        // Damped pull — resistance increases as you pull more
        const damped = Math.min(diff * 0.5, threshold * 1.5);
        setPullDistance(damped);
      }
    }
    if (isSwiping.current) {
      const xDiff = e.touches[0].clientX - startX.current;
      const yDiff = Math.abs(e.touches[0].clientY - startY.current);
      // Only count as horizontal swipe if x movement > y movement
      if (Math.abs(xDiff) > 50 && Math.abs(xDiff) > yDiff * 1.5) {
        isSwiping.current = false; // consume the swipe
        if (xDiff > 0 && onSwipeRight) onSwipeRight();
        else if (xDiff < 0 && onSwipeLeft) onSwipeLeft();
      }
    }
  }, [isRefreshing, threshold, onSwipeLeft, onSwipeRight]);

  const handleTouchEnd = useCallback(async () => {
    if (isPulling.current && pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    isPulling.current = false;
    isSwiping.current = false;
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  // Bind to a scroll element
  const setScrollRef = useCallback((el: HTMLElement | null) => {
    scrollEl.current = el;
  }, []);

  return {
    pullDistance,
    isRefreshing,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    setScrollRef,
  };
}
