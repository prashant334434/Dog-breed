import type { Range } from '../domain/breed';

const UNITS: [limit: number, ms: number, unit: string][] = [
  [3_600_000, 60_000, 'minute'],
  [86_400_000, 3_600_000, 'hour'],
];
const DAY: [number, number, string] = [Infinity, 86_400_000, 'day'];

/** "just now", "5 minutes ago", "2 hours ago". Hermes lacks Intl.RelativeTimeFormat. */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp);
  if (diff < 60_000) return 'just now';
  const [, ms, unit] = UNITS.find(([limit]) => diff < limit) ?? DAY;
  const n = Math.floor(diff / ms);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

export const formatRange = (r: Range | null, unit: string) =>
  !r ? 'Unknown' : r.min === r.max ? `${r.min} ${unit}` : `${r.min}–${r.max} ${unit}`;

export const titleCase = (s: string) =>
  s.replace(/(^|[\s_-])(\w)/g, (_, sep: string, c: string) => `${sep === '_' ? ' ' : sep}${c.toUpperCase()}`);
