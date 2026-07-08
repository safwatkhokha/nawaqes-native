// ─── Scheduled Streams Component ───────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Clock, Plus, X, Bell, Trash2, Radio, Users,
  ChevronDown, Loader2, Video, AlertCircle, Sparkles
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { useNavigate } from 'react-router-dom';

// ─── Stream category options ──────────────────────────────────────
const STREAM_CATEGORIES = [
  { id: '', labelKey: 'scheduledStream.catOther' },
  { id: 'tech', labelKey: 'scheduledStream.catTech' },
  { id: 'market', labelKey: 'scheduledStream.catMarket' },
  { id: 'education', labelKey: 'scheduledStream.catEducation' },
  { id: 'entertainment', labelKey: 'scheduledStream.catEntertainment' },
  { id: 'sports', labelKey: 'scheduledStream.catSports' },
  { id: 'news', labelKey: 'scheduledStream.catNews' },
];

// ─── Duration options ─────────────────────────────────────────────
const DURATION_OPTIONS = [
  { value: 15, label: '15 دقيقة' },
  { value: 30, label: '30 دقيقة' },
  { value: 60, label: 'ساعة' },
  { value: 90, label: 'ساعة ونصف' },
  { value: 120, label: 'ساعتين' },
  { value: 180, label: '3 ساعات' },
];

interface ScheduledStream {
  id: string;
  user_id: string;
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
  category: string;
  is_active: number;
  reminder_count: number;
  user_name: string;
  user_avatar: string;
}

// ─── Helper: format time remaining ────────────────────────────────
function formatTimeRemaining(targetDate: string, t: any): string {
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return t('livestream.readyToStream');

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${t('scheduledStream.days')}`);
  if (hours > 0) parts.push(`${hours} ${t('scheduledStream.hours')}`);
  if (minutes > 0) parts.push(`${minutes} ${t('scheduledStream.minutes')}`);

  return parts.join(' ');
}

export const ScheduledStreams: React.FC = () => {
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { dir } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [streams, setStreams] = useState<ScheduledStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [formCategory, setFormCategory] = useState('');

  // Theme colors
  const bgCard = darkMode ? 'bg-gray-800' : 'bg-white';
  const bgCardHover = darkMode ? 'hover:bg-gray-750' : 'hover:bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const bgInput = darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-200';

  // Fetch scheduled streams
  const fetchStreams = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getScheduledStreams();
      setStreams(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[ScheduledStreams] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStreams(); }, [fetchStreams]);

  // Update countdowns every minute
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(prev => prev + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle schedule form submit
  const handleSchedule = async () => {
    if (!formTitle.trim()) {
      toast.error(t('scheduledStream.streamTitle'));
      return;
    }
    if (!formScheduledAt) {
      toast.error(t('scheduledStream.scheduledAt'));
      return;
    }
    const scheduledDate = new Date(formScheduledAt);
    if (scheduledDate <= new Date()) {
      toast.error(t('scheduledStream.scheduledAt'));
      return;
    }

    setSubmitting(true);
    try {
      await api.scheduleStream({
        title: formTitle.trim(),
        description: formDescription.trim(),
        scheduledAt: formScheduledAt,
        durationMinutes: formDuration,
        category: formCategory,
      });
      toast.success(t('scheduledStream.scheduledSuccess'));
      // Reset form
      setFormTitle('');
      setFormDescription('');
      setFormScheduledAt('');
      setFormDuration(60);
      setFormCategory('');
      setShowScheduleForm(false);
      fetchStreams();
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule stream');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle set reminder
  const handleRemind = async (streamId: string) => {
    try {
      await api.setStreamReminder(streamId);
      toast.success(t('scheduledStream.remindSuccess'));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle cancel stream
  const handleCancel = async (streamId: string) => {
    try {
      await api.cancelScheduledStream(streamId);
      toast.success(t('scheduledStream.cancelSuccess'));
      fetchStreams();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Handle go live — 🔧 REDIRECT to Channels (standalone /live-stream is deprecated)
  const handleGoLive = () => {
    navigate('/channels');
  };

  // Get minimum datetime for the date input
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  // ─── My streams vs others' streams ──────────────────────────────
  const myStreams = streams.filter(s => s.user_id === currentUser?.id);
  const otherStreams = streams.filter(s => s.user_id !== currentUser?.id);

  return (
    <div className={`min-h-screen p-4 pb-20`} dir={dir}>
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${darkMode ? 'bg-purple-900/30' : 'bg-purple-100'}`}>
              <Calendar className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${textPrimary}`}>{t('scheduledStream.title')}</h1>
              <p className={`text-xs ${textMuted}`}>{streams.length} {t('scheduledStream.upcoming')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleGoLive}
              className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Radio className="w-3.5 h-3.5" /> {t('scheduledStream.goLive')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowScheduleForm(true)}
              className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors"
            >
              <Plus className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className={`w-8 h-8 animate-spin ${textMuted}`} />
          </div>
        )}

        {/* No streams */}
        {!loading && streams.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-center py-16 rounded-2xl ${bgCard}`}
          >
            <Calendar className={`w-16 h-16 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`font-bold ${textPrimary}`}>{t('scheduledStream.noUpcoming')}</p>
            <p className={`text-sm mt-1 ${textMuted}`}>{t('scheduledStream.upcoming')}</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowScheduleForm(true)}
              className="mt-4 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> {t('scheduledStream.schedule')}
            </motion.button>
          </motion.div>
        )}

        {/* My Scheduled Streams */}
        {!loading && myStreams.length > 0 && (
          <div className="mb-6">
            <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${textMuted}`}>
              <Video className="w-4 h-4" /> {t('scheduledStream.upcoming')}
            </h3>
            <div className="space-y-3">
              {myStreams.map(stream => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  isOwn={true}
                  darkMode={darkMode}
                  onRemind={handleRemind}
                  onCancel={handleCancel}
                  onGoLive={handleGoLive}
                  t={t}
                  tick={tick}
                />
              ))}
            </div>
          </div>
        )}

        {/* Other Users' Streams */}
        {!loading && otherStreams.length > 0 && (
          <div>
            <h3 className={`text-sm font-black mb-3 flex items-center gap-2 ${textMuted}`}>
              <Users className="w-4 h-4" /> {t('scheduledStream.upcoming')}
            </h3>
            <div className="space-y-3">
              {otherStreams.map(stream => (
                <StreamCard
                  key={stream.id}
                  stream={stream}
                  isOwn={false}
                  darkMode={darkMode}
                  onRemind={handleRemind}
                  onCancel={handleCancel}
                  onGoLive={handleGoLive}
                  t={t}
                  tick={tick}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Form Modal */}
      <AnimatePresence>
        {showScheduleForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowScheduleForm(false)}
          >
            <motion.div
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              className={`w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-xl ${bgCard}`}
              onClick={e => e.stopPropagation()}
              dir={dir}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className={`text-lg font-black ${textPrimary}`}>{t('scheduledStream.title')}</h3>
                <button onClick={() => setShowScheduleForm(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-400' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className={`text-xs font-bold mb-1 block ${textMuted}`}>{t('scheduledStream.streamTitle')} *</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder={t('scheduledStream.streamTitle')}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${bgInput}`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={`text-xs font-bold mb-1 block ${textMuted}`}>{t('scheduledStream.description')}</label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder={t('scheduledStream.description')}
                    rows={2}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none ${bgInput}`}
                  />
                </div>

                {/* Scheduled At */}
                <div>
                  <label className={`text-xs font-bold mb-1 block ${textMuted}`}>{t('scheduledStream.scheduledAt')} *</label>
                  <input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={e => setFormScheduledAt(e.target.value)}
                    min={getMinDateTime()}
                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${bgInput}`}
                  />
                </div>

                {/* Duration & Category Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-bold mb-1 block ${textMuted}`}>{t('scheduledStream.duration')}</label>
                    <select
                      value={formDuration}
                      onChange={e => setFormDuration(Number(e.target.value))}
                      className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${bgInput}`}
                    >
                      {DURATION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs font-bold mb-1 block ${textMuted}`}>{t('scheduledStream.category')}</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${bgInput}`}
                    >
                      {STREAM_CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{t(cat.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleSchedule}
                  disabled={submitting || !formTitle.trim() || !formScheduledAt}
                  className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>
                  ) : (
                    <><Calendar className="w-4 h-4" /> {t('scheduledStream.schedule')}</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Stream Card Component ────────────────────────────────────────
const StreamCard: React.FC<{
  stream: ScheduledStream;
  isOwn: boolean;
  darkMode: boolean;
  onRemind: (id: string) => void;
  onCancel: (id: string) => void;
  onGoLive: () => void;
  t: any;
  tick: number;
}> = ({ stream, isOwn, darkMode, onRemind, onCancel, onGoLive, t, tick }) => {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const bgCard = darkMode ? 'bg-gray-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const borderColor = darkMode ? 'border-gray-700' : 'border-gray-100';

  const scheduledDate = new Date(stream.scheduled_at);
  const isStartingSoon = scheduledDate.getTime() - Date.now() < 15 * 60 * 1000 && scheduledDate.getTime() > Date.now();
  const isPast = scheduledDate.getTime() <= Date.now();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border ${borderColor} ${bgCard} p-4 shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <img
          src={stream.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${stream.user_name}`}
          alt={stream.user_name}
          className="w-10 h-10 rounded-full shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className={`text-sm font-black truncate ${textPrimary}`}>{stream.title}</p>
            {isStartingSoon && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold animate-pulse">
                <Radio className="w-3 h-3" /> LIVE
              </span>
            )}
          </div>
          <p className={`text-xs ${textMuted}`}>
            {stream.user_name}
            {stream.category && (
              <span className={`inline-flex items-center gap-0.5 ml-2 px-1.5 py-0.5 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Sparkles className="w-2.5 h-2.5" /> {stream.category}
              </span>
            )}
          </p>

          {/* Time info */}
          <div className={`flex items-center gap-3 mt-2 text-xs ${textMuted}`}>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {scheduledDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {scheduledDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" />
              {stream.reminder_count} {t('scheduledStream.reminders')}
            </span>
          </div>

          {/* Countdown */}
          {!isPast && (
            <div className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'bg-purple-900/20 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
              {t('scheduledStream.startsIn')}: {formatTimeRemaining(stream.scheduled_at, t)}
            </div>
          )}

          {/* Description */}
          {stream.description && (
            <p className={`text-xs mt-2 line-clamp-2 ${textMuted}`}>{stream.description}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            {isOwn ? (
              <>
                {isPast && (
                  <button
                    onClick={onGoLive}
                    className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Radio className="w-3 h-3" /> {t('scheduledStream.goLive')}
                  </button>
                )}
                {!confirmCancel ? (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                  >
                    <Trash2 className="w-3 h-3" /> {t('scheduledStream.cancelStream')}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onCancel(stream.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold"
                    >
                      {t('livestream.yesEndStream')}
                    </button>
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {t('livestream.cancel')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => onRemind(stream.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${darkMode ? 'bg-orange-900/20 hover:bg-orange-900/30 text-orange-400' : 'bg-orange-50 hover:bg-orange-100 text-orange-600'}`}
                >
                  <Bell className="w-3 h-3" /> {t('scheduledStream.remindMe')}
                </button>
                <button
                  onClick={() => {}}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${darkMode ? 'bg-blue-900/20 hover:bg-blue-900/30 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-600'}`}
                >
                  <Users className="w-3 h-3" /> {t('livestream.viewers')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ScheduledStreams;
