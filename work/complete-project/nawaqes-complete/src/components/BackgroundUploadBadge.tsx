// ─── Background Upload Badge (floating) ──────────────────────────────
// Renders a small floating card at the top of the screen showing the
// progress of any in-progress background video uploads. Mounted ONCE at
// the app root (in App.tsx) so it persists across page navigation.
//
// States:
//   - uploading: shows progress %, animated bar, "جاري الرفع..."
//   - attaching: shows "جاري ربط التسجيل بالبث..."
//   - completed: shows "✓ تم رفع الفيديو" for 60s then auto-hides
//   - failed: shows "✗ فشل الرفع" with error message
//
// Multiple concurrent uploads stack vertically. The badge is dismissible
// (collapses to a tiny pill) to avoid blocking content.
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  subscribeToBackgroundUploads,
  getActiveUploads,
  formatBytes,
  formatDuration,
  type UploadTask,
} from '../lib/backgroundUpload';
import { useAppContext } from '../contexts/AppContext';

export const BackgroundUploadBadge: React.FC = () => {
  const { darkMode } = useAppContext();
  const [uploads, setUploads] = useState<UploadTask[]>(getActiveUploads());
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const prevCountRef = useRef(0);

  // Subscribe to upload state changes
  useEffect(() => {
    const unsub = subscribeToBackgroundUploads(() => {
      setUploads(getActiveUploads());
    });
    return unsub;
  }, []);

  // Filter out dismissed tasks
  const visibleUploads = uploads.filter(u => !dismissed.has(u.id));

  // Auto-collapse when there are uploads but the user has interacted
  // (we keep it expanded by default so they see progress)
  const inProgressCount = visibleUploads.filter(
    u => u.status === 'uploading' || u.status === 'attaching'
  ).length;
  const completedCount = visibleUploads.filter(u => u.status === 'completed').length;
  const failedCount = visibleUploads.filter(u => u.status === 'failed').length;

  // If no visible uploads, render nothing
  if (visibleUploads.length === 0) return null;

  // Summary line for the collapsed pill
  const summaryText = (() => {
    if (inProgressCount > 0) {
      const avgProgress = visibleUploads
        .filter(u => u.status === 'uploading')
        .reduce((s, u) => s + u.progress, 0) / Math.max(inProgressCount, 1);
      return `جاري رفع ${inProgressCount} فيديو · ${Math.round(avgProgress)}%`;
    }
    if (failedCount > 0) return `فشل رفع ${failedCount} فيديو`;
    if (completedCount > 0) return `تم رفع ${completedCount} فيديو ✓`;
    return '';
  })();

  const dismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  };

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[500] pointer-events-none"
      style={{ maxWidth: 'calc(100vw - 24px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`pointer-events-auto rounded-2xl shadow-2xl border overflow-hidden ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
        style={{ width: 'min(380px, calc(100vw - 24px))' }}
      >
        {/* Header bar — always visible */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors ${
            darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            failedCount > 0
              ? 'bg-red-500/15 text-red-500'
              : inProgressCount > 0
                ? 'bg-orange-500/15 text-orange-500'
                : 'bg-green-500/15 text-green-500'
          }`}>
            {inProgressCount > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : failedCount > 0 ? (
              <XCircle className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-start">
            <p className={`text-xs font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {summaryText}
            </p>
            <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              رفع في الخلفية — يمكنك المتابعة
            </p>
          </div>
          {collapsed ? (
            <ChevronDown className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          ) : (
            <ChevronUp className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          )}
        </button>

        {/* Expanded: show individual uploads */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden ${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}`}
            >
              <div className="max-h-64 overflow-y-auto">
                {visibleUploads.map(task => (
                  <UploadRow
                    key={task.id}
                    task={task}
                    darkMode={darkMode}
                    onDismiss={() => dismiss(task.id)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── Single upload row ──────────────────────────────────────────────
const UploadRow: React.FC<{
  task: UploadTask;
  darkMode: boolean;
  onDismiss: () => void;
}> = ({ task, darkMode, onDismiss }) => {
  const statusText = (() => {
    switch (task.status) {
      case 'uploading': return `جاري الرفع · ${task.progress}%`;
      case 'attaching': return 'جاري ربط التسجيل بالبث...';
      case 'completed': return 'تم الرفع ✓';
      case 'failed': return `فشل: ${task.error || ''}`;
    }
  })();

  const statusColor = (() => {
    switch (task.status) {
      case 'uploading':
      case 'attaching':
        return darkMode ? 'text-orange-400' : 'text-orange-600';
      case 'completed':
        return darkMode ? 'text-green-400' : 'text-green-600';
      case 'failed':
        return 'text-red-500';
    }
  })();

  return (
    <div className={`px-3 py-2.5 ${darkMode ? 'border-b border-gray-700/50 last:border-b-0' : 'border-b border-gray-100 last:border-b-0'}`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          task.status === 'failed'
            ? 'bg-red-500/15 text-red-500'
            : task.status === 'completed'
              ? 'bg-green-500/15 text-green-500'
              : 'bg-orange-500/15 text-orange-500'
        }`}>
          {task.status === 'uploading' || task.status === 'attaching' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : task.status === 'failed' ? (
            <XCircle className="w-3.5 h-3.5" />
          ) : (
            <CheckCircle className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {task.filename}
          </p>
          <p className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {formatBytes(task.sizeBytes)}
            {task.duration ? ` · ${formatDuration(task.duration)}` : ''}
          </p>
          {/* Progress bar (only while uploading) */}
          {task.status === 'uploading' && (
            <div className={`mt-1.5 h-1 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <motion.div
                className="h-full bg-gradient-to-l from-orange-500 to-amber-500"
                animate={{ width: `${task.progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
          <p className={`text-[10px] font-bold mt-0.5 ${statusColor}`}>
            {statusText}
          </p>
        </div>
        {/* Dismiss button (only for completed/failed) */}
        {(task.status === 'completed' || task.status === 'failed') && (
          <button
            onClick={onDismiss}
            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            aria-label="إخفاء"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default BackgroundUploadBadge;
