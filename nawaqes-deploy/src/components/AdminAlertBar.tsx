// ─── Admin Alert Bar V2 — Smart, with localStorage persistence ─────
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../services/api';

interface AdminAlert {
  id: string; title: string; content?: string; source?: string;
  priority?: string; action_label?: string; action_url?: string;
}

export const AdminAlertBar: React.FC = () => {
  const { darkMode } = useAppContext();
  const { isLoggedIn } = useAuth();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) return;
    const fetchAlerts = async () => {
      try {
        const result = await api.getActiveAdminAlerts();
        if (result?.alerts) setAlerts(result.alerts);
      } catch {}
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nawaqes_dismissed_alerts');
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        const valid = Object.entries(parsed)
          .filter(([_, ts]: [string, any]) => now - ts < 24 * 60 * 60 * 1000)
          .reduce((acc, [id]) => acc.add(id), new Set<string>());
        setDismissedIds(valid);
      }
    } catch {}
  }, []);

  const activeAlerts = alerts.filter(a => !dismissedIds.has(String(a.id)));

  useEffect(() => {
    if (activeAlerts.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % activeAlerts.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeAlerts.length]);

  useEffect(() => {
    if (currentIndex >= activeAlerts.length) setCurrentIndex(0);
  }, [activeAlerts.length, currentIndex]);

  useEffect(() => {
    setIsVisible(activeAlerts.length > 0);
  }, [activeAlerts.length]);

  const handleDismiss = (e: React.MouseEvent, alertId: string) => {
    e.preventDefault(); e.stopPropagation();
    setDismissedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(String(alertId));
      try {
        const obj: Record<string, number> = {};
        newSet.forEach(id => { obj[id] = Date.now(); });
        localStorage.setItem('nawaqes_dismissed_alerts', JSON.stringify(obj));
      } catch {}
      return newSet;
    });
  };

  if (!isLoggedIn || activeAlerts.length === 0 || !isVisible) return null;

  const currentAlert = activeAlerts[currentIndex] || activeAlerts[0];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className={`sticky top-14 z-40 overflow-hidden border-b ${
            darkMode ? 'bg-gradient-to-l from-red-950 via-red-900 to-red-950 border-red-800'
                    : 'bg-gradient-to-l from-red-600 via-red-700 to-red-600 border-red-700'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center min-h-[44px] max-w-[1600px] mx-auto px-3 py-1.5">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg flex-shrink-0 ${darkMode ? 'bg-black/30' : 'bg-black/20'}`}>
              <AlertCircle className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
              <span className="text-[11px] font-black text-white whitespace-nowrap">تنبيه</span>
            </div>
            <div className={`w-px h-5 mx-2 ${darkMode ? 'bg-white/20' : 'bg-white/30'}`} />
            <div className="flex-1 flex items-center min-w-0">
              <p key={currentAlert.id} className="text-[13px] font-bold text-white truncate flex-1">
                {currentAlert.title}
                {currentAlert.content && (
                  <span className="text-white/70 font-normal mr-1.5">
                    — {currentAlert.content.length > 80 ? currentAlert.content.substring(0, 80) + '...' : currentAlert.content}
                  </span>
                )}
              </p>
            </div>
            {activeAlerts.length > 1 && (
              <span className="text-[10px] font-bold text-white/80 mx-2">{currentIndex + 1}/{activeAlerts.length}</span>
            )}
            <button onClick={(e) => handleDismiss(e, currentAlert.id)} className="p-1 rounded-md hover:bg-white/20 flex-shrink-0" aria-label="إخفاء">
              <X className="w-3.5 h-3.5 text-white/80 hover:text-white" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
