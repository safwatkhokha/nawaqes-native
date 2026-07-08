// ─── Global Image Lightbox ──────────────────────────────────────────
// A reusable fullscreen image viewer with zoom + download + swipe.
// Usage:
//   <ImageLightbox
//     images={[url1, url2, url3]}
//     index={0}
//     onClose={() => setShowLightbox(null)}
//   />
//
// Or the simpler hook approach:
//   const [lightbox, setLightbox] = useState<{images: string[], index: number} | null>(null);
//   <img onClick={() => setLightbox({ images: [url], index: 0 })} />
//   <ImageLightbox
//     images={lightbox?.images || []}
//     index={lightbox?.index || 0}
//     onClose={() => setLightbox(null)}
//   />

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageLightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ images, index, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(index);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const hasNext = images.length > 1 && currentIndex < images.length - 1;
  const hasPrev = images.length > 1 && currentIndex > 0;

  const next = useCallback(() => {
    if (hasNext) { setCurrentIndex(currentIndex + 1); setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [hasNext, currentIndex]);

  const prev = useCallback(() => {
    if (hasPrev) { setCurrentIndex(currentIndex - 1); setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [hasPrev, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(z + 0.5, 4));
      else if (e.key === '-') setZoom(z => Math.max(z - 0.5, 1));
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, next, prev]);

  // 🔒 Block Android hardware back / swipe-back from exiting app while lightbox is open.
  // When lightbox opens, push a history state. When user presses back,
  // popstate fires → close lightbox instead of navigating/exiting.
  useEffect(() => {
    // Push a state so back button closes the lightbox (not exits app)
    window.history.pushState({ lightbox: true }, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      // Back button pressed while lightbox is open → close it
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  const handleDownload = async () => {
    const url = images[currentIndex];
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `nawaqes-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1 && e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && zoom > 1 && e.touches.length === 1) {
      setPan({ x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y });
    }
  };

  const handleTouchEnd = () => setIsDragging(false);

  if (!images || images.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent" onClick={e => e.stopPropagation()}>
          <span className="text-white text-sm font-bold">
            {currentIndex + 1} / {images.length}
          </span>
          <div className="flex items-center gap-2">
            {/* Zoom controls */}
            <button
              onClick={() => setZoom(z => Math.max(z - 0.5, 1))}
              disabled={zoom <= 1}
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 disabled:opacity-30 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-white text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(z + 0.5, 4))}
              disabled={zoom >= 4}
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 disabled:opacity-30 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {/* Download */}
            <button
              onClick={handleDownload}
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
              title="حفظ الصورة"
            >
              <Download className="w-4 h-4" />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-2 sm:left-4 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-2 sm:right-4 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative max-w-full max-h-full flex items-center justify-center"
          onClick={e => e.stopPropagation()}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <img
            src={images[currentIndex]}
            alt=""
            className="max-w-[95vw] max-h-[88vh] object-contain rounded-lg shadow-2xl select-none"
            style={{
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
          />
        </motion.div>

        {/* Hint text */}
        {zoom === 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-[10px] font-bold">
            اضغط على الصورة للتكبير · اسحب للتنقل · ESC للإغلاق
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Helper hook for easier usage ───────────────────────────────────
export function useImageLightbox() {
  const [state, setState] = useState<{ images: string[]; index: number } | null>(null);

  const open = useCallback((images: string | string[], index: number = 0) => {
    const arr = Array.isArray(images) ? images : [images];
    setState({ images: arr, index });
  }, []);

  const close = useCallback(() => setState(null), []);

  return {
    lightboxState: state,
    openLightbox: open,
    closeLightbox: close,
    LightboxComponent: state ? (
      <ImageLightbox images={state.images} index={state.index} onClose={close} />
    ) : null,
  };
}
