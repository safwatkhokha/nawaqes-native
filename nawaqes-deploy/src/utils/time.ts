import i18n from '../i18n';

/**
 * Shared Time Utilities
 *
 * SQLite's `datetime('now')` returns UTC timestamps in the format
 * `YYYY-MM-DD HH:MM:SS`. JavaScript's `new Date()` may interpret
 * such strings as LOCAL time instead of UTC (behavior varies by browser),
 * causing a timezone offset (e.g., +3 hours in Cairo).
 *
 * This module provides functions that correctly parse SQLite datetime
 * strings as UTC and format them as relative Arabic time.
 */

/**
 * Parse a SQLite datetime string (or any ISO-ish date string) as a UTC Date.
 *
 * SQLite format:  "2026-06-01 20:10:17"   → treated as UTC
 * ISO format:     "2026-06-01T20:10:17Z"   → already UTC
 * Already valid:  any string `new Date()` can parse correctly
 *
 * The key fix: replace the space with 'T' and append 'Z' so that
 * JavaScript always interprets the timestamp as UTC.
 */
export function parseDBTimestamp(dateStr: string): Date {
  if (!dateStr) return new Date(0); // epoch fallback

  // If it's already a proper ISO string with timezone info, parse directly
  if (dateStr.includes('T') && (dateStr.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr))) {
    return new Date(dateStr);
  }

  // SQLite datetime format: "YYYY-MM-DD HH:MM:SS" → convert to ISO 8601 UTC
  const isoStr = dateStr.replace(' ', 'T') + 'Z';
  const parsed = new Date(isoStr);

  // Fallback: if the result is invalid, try parsing as-is
  if (isNaN(parsed.getTime())) {
    return new Date(dateStr);
  }

  return parsed;
}

/**
 * Format a database timestamp as relative Arabic time.
 *
 * Examples:
 *   "الآن"           — just now
 *   "منذ 5 دقيقة"    — 5 minutes ago
 *   "منذ 3 ساعة"     — 3 hours ago
 *   "منذ 2 يوم"      — 2 days ago
 *   "2026/06/01"     — date fallback
 */
export function formatRelativeTimeAr(dateStr: string): string {
  if (!dateStr) return '';

  try {
    const date = parseDBTimestamp(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Guard against negative diffs (clock skew / future dates)
    if (diffMs < 0) return 'الآن';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString('ar-EG');
  } catch {
    return dateStr;
  }
}

/**
 * Format a database timestamp as relative time with i18n support.
 * Uses the `t` function from react-i18next for localized strings.
 */
export function formatRelativeTimeI18n(
  dateStr: string,
  t: (key: string, options?: Record<string, any>) => string
): string {
  if (!dateStr) return '';

  try {
    const date = parseDBTimestamp(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 0) return t('common.now');

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('common.now');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString(i18n?.language?.startsWith('en') ? 'en-US' : 'ar-EG');
  } catch {
    return dateStr;
  }
}

/**
 * Get the remaining time for a promotion as a human-readable string.
 * Properly handles UTC timestamps from the database.
 */
export function getTimeRemaining(expiresAtStr: string): string | null {
  if (!expiresAtStr) return null;

  try {
    const expiresAt = parseDBTimestamp(expiresAtStr);
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) return 'منتهي';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days} أيام و ${hours} ساعة`;
    if (hours > 0) return `${hours} ساعة`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins} دقيقة`;
  } catch {
    return null;
  }
}
