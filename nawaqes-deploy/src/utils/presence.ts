/**
 * Presence / Online Status Tracking System
 * 
 * - Tracks the current user's last activity timestamp in localStorage
 * - Determines if a user is "online" (active within the last 1 minute)
 * - Calculates relative "last seen" time in Arabic
 * - Prevents flickering between online/offline states
 */

const PRESENCE_KEY = 'nawaqes_presence';
const ONLINE_THRESHOLD_MS = 60 * 1000; // 1 minute

interface PresenceMap {
  [userId: string]: number; // timestamp in ms
}

/** Get all presence data from localStorage */
function getPresenceMap(): PresenceMap {
  try {
    const data = localStorage.getItem(PRESENCE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/** Save presence data to localStorage */
function savePresenceMap(map: PresenceMap): void {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/** Update the current user's last activity timestamp (call on user interactions) */
export function updatePresence(userId: string): void {
  if (!userId) return;
  const map = getPresenceMap();
  map[userId] = Date.now();
  savePresenceMap(map);
}

/** Check if a user is online (active within the last 1 minute) */
export function isUserOnline(userId: string): boolean {
  if (!userId) return false;
  const map = getPresenceMap();
  const lastActivity = map[userId];
  if (!lastActivity) return false;
  return (Date.now() - lastActivity) < ONLINE_THRESHOLD_MS;
}

/** Get the last activity timestamp for a user */
export function getLastActivity(userId: string): number | null {
  if (!userId) return null;
  const map = getPresenceMap();
  return map[userId] || null;
}

/** Format a relative "last seen" time in Arabic */
export function formatLastSeen(timestamp: number | null): string {
  if (!timestamp) return 'آخر ظهور غير معروف';
  
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 5) return 'متصل الآن';
  if (diffSeconds < 60) return 'منذ لحظات';
  if (diffMinutes < 60) return `آخر ظهور منذ ${diffMinutes} دقيقة`;
  if (diffHours < 24) return `آخر ظهور منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `آخر ظهور منذ ${diffDays} يوم`;
  if (diffDays < 30) return `آخر ظهور منذ ${Math.floor(diffDays / 7)} أسبوع`;
  return `آخر ظهور منذ ${Math.floor(diffDays / 30)} شهر`;
}

/**
 * Initialize presence data for a user.
 * Only sets presence if no existing data is found.
 * Unlike the old mock version, this does NOT fabricate fake online status.
 * Users will show as offline unless they are actually active.
 */
export function initializeMockPresence(userId: string): void {
  if (!userId) return;
  const map = getPresenceMap();
  
  // Only initialize if no existing data — do NOT fabricate fake timestamps
  if (map[userId] !== undefined) return;
  
  // Leave the user's presence as undefined (offline) unless they're actually active
  // No fake "last seen" data will be generated
}

/**
 * Start a periodic presence updater for the current user.
 * Updates the user's presence every 30 seconds to keep them "online".
 * Returns a cleanup function.
 */
export function startPresenceHeartbeat(userId: string): () => void {
  if (!userId) return () => {};
  
  // Update immediately
  updatePresence(userId);
  
  // Update every 30 seconds
  const interval = setInterval(() => {
    updatePresence(userId);
  }, 30_000);
  
  return () => clearInterval(interval);
}
