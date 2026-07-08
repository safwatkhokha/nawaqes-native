// ─── News Ticker - Professional Breaking News Bar ────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { NewsItem } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useTranslation } from 'react-i18next';
import { Megaphone, AlertTriangle, Zap, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NewsTickerProps {
  news: NewsItem[];
}

export const NewsTicker: React.FC<NewsTickerProps> = ({ news }) => {
  const { darkMode, adminAlerts } = useAppContext();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Combine admin alerts (urgent) with regular news, deduplicating by ID
  const seenIds = new Set<string>();
  const allNews: NewsItem[] = [];
  // Add urgent alerts first so they appear at the beginning
  for (const a of adminAlerts.filter(a => a.isAlert)) {
    if (!seenIds.has(String(a.id))) {
      seenIds.add(String(a.id));
      allNews.push(a);
    }
  }
  // Then add remaining news items that aren't already included
  for (const n of news) {
    if (!seenIds.has(String(n.id))) {
      seenIds.add(String(n.id));
      allNews.push(n);
    }
  }

  // Auto-rotate the single visible item
  useEffect(() => {
    if (isPaused || allNews.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % allNews.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isPaused, allNews.length]);

  const handleNewsClick = useCallback((item: NewsItem) => {
    // Navigate to notifications page with the alert highlighted
    if (item.isAlert) {
      navigate(`/notifications?filter=alert&newsId=${item.id}`);
      return;
    }
    // For category-specific news, navigate to filtered view
    if (item.category === 'egypt') {
      navigate('/?category=egypt-news');
      return;
    }
    if (item.category === 'world') {
      navigate('/?category=world-news');
      return;
    }
    // Default: search on Google News
    const query = encodeURIComponent(item.title);
    window.open(`https://news.google.com/search?q=${query}`, '_blank', 'noopener,noreferrer');
  }, [navigate]);

  if (!allNews || allNews.length === 0 || dismissed) return null;

  const currentItem = allNews[currentIndex];
  const hasUrgentAlert = allNews.some(n => n.isAlert);
  const isCurrentAlert = currentItem?.isAlert;

  return (
    <div
      className={`sticky top-14 z-40 overflow-hidden transition-colors ${
        hasUrgentAlert
          ? darkMode
            ? 'bg-red-950/80 border-b border-red-900/50'
            : 'bg-gradient-to-l from-red-600 to-red-700 border-b border-red-700'
          : darkMode
            ? 'bg-gray-800/95 border-b border-gray-700'
            : 'bg-gradient-to-l from-orange-500 to-amber-600 border-b border-orange-600'
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center h-9 max-w-[1600px] mx-auto px-2">
        {/* ─── Label Badge ─── */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md flex-shrink-0 ${
          hasUrgentAlert
            ? darkMode ? 'bg-red-900/60' : 'bg-red-800/40'
            : darkMode ? 'bg-gray-700/60' : 'bg-black/15'
        }`}>
          {hasUrgentAlert ? (
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-yellow-200" />
          )}
          <span className="text-[11px] font-black text-white whitespace-nowrap">
            {t('common.urgent')}
          </span>
        </div>

        {/* ─── Separator ─── */}
        <div className={`w-px h-5 mx-2 ${darkMode ? 'bg-gray-600' : 'bg-white/30'}`} />

        {/* ─── Current News Item ─── */}
        <div
          className="flex-1 flex items-center min-w-0 cursor-pointer group"
          onClick={() => currentItem && handleNewsClick(currentItem)}
        >
          <div className="flex items-center gap-2 min-w-0 w-full">
            {/* Category indicator */}
            {isCurrentAlert ? (
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
            ) : currentItem?.category === 'egypt' ? (
              <span className="text-xs flex-shrink-0">🇪🇬</span>
            ) : currentItem?.category === 'world' ? (
              <span className="text-xs flex-shrink-0">🌍</span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 flex-shrink-0" />
            )}

            {/* Title with fade transition */}
            <p
              key={currentItem?.id}
              className="text-[13px] font-bold text-white truncate animate-[fadeIn_0.3s_ease] group-hover:underline decoration-white/50"
            >
              {currentItem?.title}
            </p>

            {/* Source */}
            <span className="text-[10px] font-medium text-white/60 flex-shrink-0">
              [{currentItem?.source}]
            </span>
          </div>
        </div>

        {/* ─── News Counter / Navigation Dots ─── */}
        {allNews.length > 1 && (
          <div className="flex items-center gap-1 mx-2 flex-shrink-0">
            {allNews.length <= 5 ? (
              allNews.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`rounded-full transition-all ${
                    idx === currentIndex
                      ? 'w-4 h-1.5 bg-white'
                      : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))
            ) : (
              <span className="text-[10px] font-bold text-white/70 whitespace-nowrap">
                {currentIndex + 1}/{allNews.length}
              </span>
            )}
          </div>
        )}

        {/* ─── Dismiss Button ─── */}
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className={`p-1 rounded-md flex-shrink-0 transition-colors ${
            darkMode ? 'hover:bg-gray-700' : 'hover:bg-black/15'
          }`}
        >
          <X className="w-3.5 h-3.5 text-white/60 hover:text-white" />
        </button>
      </div>
    </div>
  );
};
