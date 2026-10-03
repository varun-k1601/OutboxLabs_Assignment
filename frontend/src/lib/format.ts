import { differenceInCalendarDays, format, formatDistanceToNowStrict, isThisYear, isToday, isTomorrow, isYesterday } from 'date-fns';

const toDate = (value: string | Date) => (typeof value === 'string' ? new Date(value) : value);

// short time for the list, like "Today 3:00 PM" or "Oct 21, 9:00 AM"
export function formatChipTime(value: string | Date): string {
  const date = toDate(value);
  if (isToday(date)) return `Today ${format(date, 'h:mm:ss a')}`;
  if (isTomorrow(date)) return `Tomorrow ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`;
  if (Math.abs(differenceInCalendarDays(date, new Date())) < 7) return format(date, 'EEE h:mm:ss a');
  return format(date, isThisYear(date) ? 'MMM d, h:mm a' : 'MMM d yyyy, h:mm a');
}

// "Tue, Oct 2, 2026 at 9:01:29 AM"
export const formatFullDate = (value: string | Date) => format(toDate(value), "EEE, MMM d, yyyy 'at' h:mm:ss a");

// "in 5 minutes", "3 hours ago"
export function formatRelative(value: string | Date): string {
  const date = toDate(value);
  const distance = formatDistanceToNowStrict(date);
  return date.getTime() >= Date.now() ? `in ${distance}` : `${distance} ago`;
}

export function formatDuration(ms: number): string {
  if (ms === 0) return '0s';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

// "hour" normally, "minute" when the window is shortened for a demo
export function describeWindow(seconds: number): string {
  if (seconds === 3600) return 'hour';
  if (seconds % 60 === 0) return seconds === 60 ? 'minute' : `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count.toLocaleString()} ${count === 1 ? singular : plural}`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}
