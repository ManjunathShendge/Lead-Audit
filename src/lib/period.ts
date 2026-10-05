import { z } from 'zod';

/** A calendar-month range chosen on the audit form, e.g. { from: '2026-04', to: '2026-09' }. */
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const MAX_PERIOD_MONTHS = 12;
/** How far back the picker offers months. Older posts get costly to page through. */
export const PERIOD_LOOKBACK_MONTHS = 24;
export const periodSchema = z
  .object({ from: monthKey, to: monthKey })
  .strict()
  .refine((p) => p.from <= p.to, 'The period must start before it ends.')
  .refine(
    (p) => monthsBetween(p.from, p.to) <= MAX_PERIOD_MONTHS,
    `Choose at most ${MAX_PERIOD_MONTHS} months.`,
  );
export type Period = z.infer<typeof periodSchema>;
/** The resolved window an audit measures, in absolute time. */
export interface Window {
  start: Date;
  end: Date;
  days: number;
  label: string;
}

const DAY = 86400000;
// Report days are Asia/Kolkata (see dayKey), so months start at IST midnight.
const IST_OFFSET = 5.5 * 3600000;
export const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

const parts = (key: string) => key.split('-').map(Number) as [number, number];
export function monthsBetween(from: string, to: string) {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  return (ty - fy) * 12 + (tm - fm) + 1;
}
export function addMonths(key: string, n: number) {
  const [y, m] = parts(key);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
export function monthOf(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthStart(key: string) {
  const [y, m] = parts(key);
  return new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET);
}
export function monthLabel(key: string) {
  const [y, m] = parts(key);
  return `${monthNames[m - 1]} ${y}`;
}
export function periodLabel(period: Period | null) {
  if (!period) return 'Last 30 days';
  return period.from === period.to
    ? monthLabel(period.from)
    : `${monthLabel(period.from)}–${monthLabel(period.to)}`;
}
/** Months the picker offers, oldest first, ending with the month of `now`. */
export function selectableMonths(now: Date) {
  const last = monthOf(now);
  return Array.from({ length: PERIOD_LOOKBACK_MONTHS }, (_, i) =>
    addMonths(last, i - PERIOD_LOOKBACK_MONTHS + 1),
  );
}
/** Server-side check that the period is neither in the future nor older than the picker allows. */
export function periodAllowed(period: Period, now: Date) {
  const months = selectableMonths(now);
  return period.from >= months[0] && period.to <= months[months.length - 1];
}
/** Scraper date filters take UTC calendar days; pad a day each side and let the metrics trim exactly. */
export function fetchBounds(window: Window) {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: day(window.start.getTime() - DAY), to: day(window.end.getTime() + DAY) };
}
/** Posts to request for a period: scrapers page back from today, so budget from `from` to now. */
export function periodPostsLimit(period: Period | null, asOf: Date) {
  return period ? Math.min(40 * monthsBetween(period.from, monthOf(asOf)), 500) : 60;
}
/** The absolute window for a period, cut off at `asOf` when the last month is still running. */
export function resolveWindow(period: Period, asOf: Date): Window {
  const start = monthStart(period.from);
  const end = new Date(Math.min(monthStart(addMonths(period.to, 1)).getTime() - 1, asOf.getTime()));
  return { start, end, days: Math.max(1, (end.getTime() - start.getTime()) / DAY), label: periodLabel(period) };
}
