// ─── Pinch-to-Zoom Image Lightbox ─────────────────────────────────
// Touch + mouse gesture support:
//   - Pinch to zoom (2 fingers)
//   - Double-tap to zoom in/out
//   - Drag to pan (when zoomed in)
//   - Swipe down to close
//   - Mouse wheel to zoom (desktop)

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface PinchZoomLightboxProps {
  src: string;
  onClose: () => void;
}

export const PinchZoomLightbox: React.FC<PinchZoomLightboxProps> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(true);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Touch state
  const touchStateRef = useRef({
    mode: 'none' as 'none' | 'pan' | 'pinch' | 'swipe-close',
    startScale: 1,
    startDistance: 0,
    startTranslate: { x: 0, y: 0 },
    lastTouch: { x: 0, y: 0 },
    pinchCenter: { x: 0, y: 0 },
    swipeStartY: 0,
  });

  // Mouse state (for desktop drag)
  const mouseStateRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    startTranslateX: 0,
    startTranslateY: 0,
  });

  // ─── Distance between 2 touch points ────────────────────────────
  const getDistance = (t1: React.Touch, t2: React.Touch): number => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ─── Midpoint between 2 touches ─────────────────────────────────
  const getMidpoint = (t1: React.Touch, t2: React.Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  // ─── Touch start ────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touches = e.touches;
    const ts = touchStateRef.current;

    if (touches.length === 2) {
      // Pinch start
      ts.mode = 'pinch';
      ts.startScale = scale;
      ts.startDistance = getDistance(touches[0], touches[1]);
      ts.pinchCenter = getMidpoint(touches[0], touches[1]);
    } else if (touches.length === 1 && scale > 1) {
      // Pan start (only when zoomed in)
      ts.mode = 'pan';
      ts.startTranslate = { ...translate };
      ts.lastTouch = { x: touches[0].clientX, y: touches[0].clientY };
    } else if (touches.length === 1 && scale === 1) {
      // Swipe-to-close start
      ts.mode = 'swipe-close';
      ts.swipeStartY = touches[0].clientY;
    }
  }, [scale, translate]);

  // ─── Touch move ─────────────────────────────────────────────────
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touches = e.touches;
    const ts = touchStateRef.current;

    if (ts.mode === 'pinch' && touches.length === 2) {
      const dist = getDistance(touches[0], touches[1]);
      const newScale = Math.max(1, Math.min(5, ts.startScale * (dist / ts.startDistance)));
      setScale(newScale);
    } else if (ts.mode === 'pan' && touches.length === 1) {
      const dx = touches[0].clientX - ts.lastTouch.x;
      const dy = touches[0].clientY - ts.lastTouch.y;
      setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      ts.lastTouch = { x: touches[0].clientX, y: touches[0].clientY };
    } else if (ts.mode === 'swipe-close' && touches.length === 1) {
      const dy = touches[0].clientY - ts.swipeStartY;
      if (dy > 80) {
        onClose();
      }
    }
  }, [onClose]);

  // ─── Touch end ──────────────────────────────────────────────────
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const ts = touchStateRef.current;
    if (e.touches.length === 0) {
      ts.mode = 'none';
      // Snap back if scale < 1
      if (scale < 1) setScale(1);
    } else if (e.touches.length === 1 && ts.mode === 'pinch') {
      // Switch from pinch to pan
      ts.mode = 'pan';
      ts.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  // ─── Double tap to toggle zoom ──────────────────────────────────
  const lastTapRef = useRef(0);
  const onDoubleClick = useCallback(() => {
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  }, [scale]);

  // Single tap (with delay to distinguish from double tap)
  const onTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onClick = useCallback(() => {
    if (onTapRef.current) {
      clearTimeout(onTapRef.current);
      onTapRef.current = null;
      onDoubleClick();
    } else {
      onTapRef.current = setTimeout(() => {
        onTapRef.current = null;
        setShowControls(prev => !prev);
      }, 250);
    }
  }, [onDoubleClick]);

  // ─── Mouse wheel zoom (desktop) ─────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale(prev => Math.max(1, Math.min(5, prev + delta)));
  }, []);

  // ─── Mouse drag (desktop) ───────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    mouseStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startTranslateX: translate.x,
      startTranslateY: translate.y,
    };
  }, [scale, translate]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const ms = mouseStateRef.current;
    if (!ms.dragging) return;
    const dx = e.clientX - ms.startX;
    const dy = e.clientY - ms.startY;
    setTranslate({ x: ms.startTranslateX + dx, y: ms.startTranslateY + dy });
  }, []);

  const onMouseUp = useCallback(() => {
    mouseStateRef.current.dragging = false;
  }, []);

  // ─── Zoom buttons ───────────────────────────────────────────────
  const zoomIn = () => setScale(prev => Math.min(5, prev + 0.5));
  const zoomOut = () => {
    setScale(prev => {
      const next = Math.max(1, prev - 0.5);
      if (next === 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  };

  // ─── Reset on close ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.98)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300, overflow: 'hidden',
        touchAction: 'none', // Prevent browser gestures
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: touchStateRef.current.mode === 'none' ? 'transform 0.2s ease-out' : 'none',
          borderRadius: scale === 1 ? 12 : 0,
          cursor: scale > 1 ? (mouseStateRef.current.dragging ? 'grabbing' : 'grab') : 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          pointerEvents: 'auto',
        }}
        draggable={false}
      />

      {/* Top controls (auto-hide) */}
      {showControls && (
        <div style={{
          position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8,
          transition: 'opacity 0.3s',
        }}>
          {scale < 5 && (
            <button onClick={(e) => { e.stopPropagation(); zoomIn(); }} style={btnStyle}>
              <ZoomIn style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
          )}
          {scale > 1 && (
            <button onClick={(e) => { e.stopPropagation(); zoomOut(); }} style={btnStyle}>
              <ZoomOut style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
          )}
          <a href={src} download onClick={(e) => e.stopPropagation()} style={btnStyle}>
            <Download style={{ width: 20, height: 20, color: '#fff' }} />
          </a>
          <button onClick={onClose} style={btnStyle}>
            <X style={{ width: 20, height: 20, color: '#fff' }} />
          </button>
        </div>
      )}

      {/* Bottom hint (only when not zoomed) */}
      {showControls && scale === 1 && (
        <div style={{
          position: 'absolute', bottom: 30, left: 0, right: 0,
          textAlign: 'center', color: 'rgba(255,255,255,0.5)',
          fontSize: '0.8rem', pointerEvents: 'none',
        }}>
          قرّب بإصبعين للتكبير • اسحب للأسفل للإغلاق
        </div>
      )}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.6)',
  border: 'none',
  borderRadius: '50%',
  width: 44, height: 44,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  backdropFilter: 'blur(10px)',
};
