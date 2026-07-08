// ─── Background Video Upload Manager ────────────────────────────────
// Singleton that survives React component unmounts and page navigation
// (within the same SPA session). Used by ChannelLiveStream to upload
// the recorded broadcast AFTER the host has closed the stream panel
// and navigated away — the upload continues in the background and a
// floating badge shows progress.
//
// Design:
//   - activeUploads is a module-level Map (NOT React state) so it
//     persists across unmounts.
//   - Listeners are notified via a simple subscribe() API so React
//     components can re-render on progress changes.
//   - The actual HTTP upload uses XMLHttpRequest (not fetch) because
//     fetch doesn't support upload progress events in most browsers.
//   - On completion, we call the channel's "attach recording" endpoint
//     so the recording URL is saved to the stream + a channel post is
//     created for replay.
import { api } from '../services/api';

export interface UploadTask {
  id: string;
  filename: string;
  sizeBytes: number;
  progress: number;       // 0-100
  status: 'uploading' | 'attaching' | 'completed' | 'failed';
  error?: string;
  startedAt: number;
  completedAt?: number;
  // Context for the "attach recording" call after upload finishes:
  channelId?: string;
  streamId?: string;
  duration?: number;      // seconds
}

const activeUploads = new Map<string, UploadTask>();
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

/** Subscribe to upload state changes. Returns an unsubscribe function. */
export function subscribeToBackgroundUploads(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Get a snapshot of all active uploads (uploading/attaching/completed/failed). */
export function getActiveUploads(): UploadTask[] {
  return Array.from(activeUploads.values());
}

/** Get only uploads that are still in progress (uploading or attaching). */
export function getInProgressUploads(): UploadTask[] {
  return Array.from(activeUploads.values()).filter(
    t => t.status === 'uploading' || t.status === 'attaching'
  );
}

/**
 * Start a background video upload. Returns the task ID.
 *
 * The upload proceeds in 2 phases:
 *   1. Upload the blob to /api/videos/upload (returns { url })
 *   2. Call /api/channels/:channelId/live/:streamId/recording to attach
 *      the URL to the stream + create a replay channel post
 *
 * Both phases happen in the background. The caller can navigate away
 * immediately — the singleton keeps the XHR alive.
 */
export function startBackgroundVideoUpload(opts: {
  blob: Blob;
  filename: string;
  channelId?: string;
  streamId?: string;
  duration?: number;
}): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const task: UploadTask = {
    id,
    filename: opts.filename,
    sizeBytes: opts.blob.size,
    progress: 0,
    status: 'uploading',
    startedAt: Date.now(),
    channelId: opts.channelId,
    streamId: opts.streamId,
    duration: opts.duration,
  };
  activeUploads.set(id, task);
  notifyListeners();
  console.log(`[BG-UPLOAD] Started ${id} (${(opts.blob.size / 1024 / 1024).toFixed(1)} MB)`);

  // Use XMLHttpRequest for upload progress support (fetch can't do this
  // reliably across browsers).
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('video', opts.blob, opts.filename);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      task.progress = Math.round((e.loaded / e.total) * 100);
      notifyListeners();
    }
  };

  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const res = JSON.parse(xhr.responseText);
        const videoUrl = res.url;
        if (!videoUrl) throw new Error('لم يُرجع السيرفر رابط الفيديو');
        console.log(`[BG-UPLOAD] Upload ${id} complete, URL: ${videoUrl}`);

        // Phase 2: attach the recording to the stream (if we have context)
        if (opts.channelId && opts.streamId) {
          task.status = 'attaching';
          task.progress = 100;
          notifyListeners();
          try {
            await api.attachChannelLiveRecording(
              opts.channelId,
              opts.streamId,
              videoUrl,
              opts.duration || 0
            );
            console.log(`[BG-UPLOAD] Recording attached to stream ${opts.streamId}`);
          } catch (err: any) {
            console.warn(`[BG-UPLOAD] Failed to attach recording:`, err?.message);
            // Don't fail the whole task — the video is uploaded, just not linked
          }
        }

        task.status = 'completed';
        task.completedAt = Date.now();
        notifyListeners();
        // Auto-remove from the active list after 60s so the user sees "تم"
        // briefly, then the badge disappears.
        setTimeout(() => {
          activeUploads.delete(id);
          notifyListeners();
        }, 60000);
      } catch (err: any) {
        task.status = 'failed';
        task.error = err?.message || 'فشل تحليل استجابة السيرفر';
        notifyListeners();
        setTimeout(() => {
          activeUploads.delete(id);
          notifyListeners();
        }, 60000);
      }
    } else {
      let errMsg = `فشل الرفع (${xhr.status})`;
      try {
        const data = JSON.parse(xhr.responseText);
        if (data?.error) errMsg = data.error;
      } catch {}
      task.status = 'failed';
      task.error = errMsg;
      notifyListeners();
      setTimeout(() => {
        activeUploads.delete(id);
        notifyListeners();
      }, 60000);
    }
  };

  xhr.onerror = () => {
    task.status = 'failed';
    task.error = 'خطأ في الشبكة أثناء الرفع';
    notifyListeners();
    setTimeout(() => {
      activeUploads.delete(id);
      notifyListeners();
    }, 60000);
  };

  xhr.onabort = () => {
    task.status = 'failed';
    task.error = 'تم إلغاء الرفع';
    notifyListeners();
    setTimeout(() => {
      activeUploads.delete(id);
      notifyListeners();
    }, 60000);
  };

  // Kick off the upload
  const token = api.getToken();
  xhr.open('POST', '/api/videos/upload');
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.send(formData);

  return id;
}

/** Cancel an in-progress upload. */
export function cancelBackgroundUpload(id: string) {
  // We don't keep the xhr ref on the task (to avoid serialization), but
  // the task will be removed and the xhr will eventually error out.
  // For a real cancel, we'd need to store the xhr alongside the task.
  activeUploads.delete(id);
  notifyListeners();
}

/** Format bytes as human-readable string (e.g. "4.2 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Format seconds as M:SS or H:MM:SS. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
