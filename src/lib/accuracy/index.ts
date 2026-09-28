import { dayKey } from '../metrics';
import { platforms, type Platform } from '../collectors/types';

export const FIELDS = ['followers', 'totalPosts', 'lastPostAt'] as const;
export type Field = (typeof FIELDS)[number];
export const TARGET_ACCURACY = 95;
export const TARGET_COVERAGE = 90;

export type Verdict = 'correct' | 'incorrect' | 'not_returned' | 'no_truth';

export type ItemInput = {
  platform: string;
  handle: string;
  state: string;
  followers: number | null;
  totalPosts: number | null;
  lastPostAt: string | null;
  trueFollowers: number | null;
  trueTotalPosts: number | null;
  trueLastPostAt: string | null;
};

/** Brief section 9.4: counts are correct within +/-2%, with a minimum tolerance of +/-1. */
export function gradeCount(observed: number | null, truth: number | null): Verdict {
  if (truth === null) return observed === null ? 'not_returned' : 'no_truth';
  if (observed === null) return 'not_returned';
  const tolerance = Math.max(1, Math.abs(truth) * 0.02);
  return Math.abs(observed - truth) <= tolerance ? 'correct' : 'incorrect';
}

/** Dates must match exactly on the calendar day, compared in Asia/Kolkata. */
export function gradeDate(observed: string | null, truth: string | null): Verdict {
  if (!truth) return observed === null ? 'not_returned' : 'no_truth';
  if (!observed) return 'not_returned';
  const a = safeDayKey(observed);
  const b = safeDayKey(truth);
  if (!a || !b) return 'incorrect';
  return a === b ? 'correct' : 'incorrect';
}

function safeDayKey(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? dayKey(new Date(parsed)) : null;
}

export function gradeItem(item: ItemInput): Record<Field, Verdict> {
  return {
    followers: gradeCount(item.followers, item.trueFollowers),
    totalPosts: gradeCount(item.totalPosts, item.trueTotalPosts),
    lastPostAt: gradeDate(item.lastPostAt, item.trueLastPostAt),
  };
}

export type PlatformSummary = {
  platform: Platform;
  attempted: number;
  returned: number;
  graded: number;
  correct: number;
  /** correct / values returned, where a truth was supplied. Null when nothing was gradeable. */
  accuracy: number | null;
  /** values returned / values attempted. */
  coverage: number | null;
  accuracyMet: boolean;
  coverageMet: boolean;
  pending: number;
  failed: number;
};

/**
 * Accuracy  = correct / values returned (only values the tester supplied a truth for).
 * Coverage  = values returned / values attempted (every field of every finished item).
 * A field with no truth typed still counts toward coverage but never toward accuracy.
 */
export function summarize(items: ItemInput[]): PlatformSummary[] {
  return platforms
    .map((platform) => {
      const mine = items.filter((i) => i.platform === platform);
      let attempted = 0;
      let returned = 0;
      let graded = 0;
      let correct = 0;
      for (const item of mine) {
        if (item.state !== 'done' && item.state !== 'failed') continue;
        const verdicts = gradeItem(item);
        for (const field of FIELDS) {
          attempted++;
          const verdict = verdicts[field];
          if (verdict !== 'not_returned') returned++;
          if (verdict === 'correct' || verdict === 'incorrect') {
            graded++;
            if (verdict === 'correct') correct++;
          }
        }
      }
      const accuracy = graded ? (correct / graded) * 100 : null;
      const coverage = attempted ? (returned / attempted) * 100 : null;
      return {
        platform,
        attempted,
        returned,
        graded,
        correct,
        accuracy,
        coverage,
        accuracyMet: accuracy !== null && accuracy >= TARGET_ACCURACY,
        coverageMet: coverage !== null && coverage >= TARGET_COVERAGE,
        pending: mine.filter((i) => i.state === 'queued' || i.state === 'running').length,
        failed: mine.filter((i) => i.state === 'failed').length,
      };
    })
    .filter((s) => s.attempted > 0 || s.pending > 0);
}

const CSV_FIELDS = [
  'platform',
  'handle',
  'state',
  'followers',
  'trueFollowers',
  'followersVerdict',
  'totalPosts',
  'trueTotalPosts',
  'totalPostsVerdict',
  'lastPostAt',
  'trueLastPostAt',
  'lastPostAtVerdict',
  'costUsd',
  'error',
] as const;

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Neutralise spreadsheet formula injection from scraped text.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(items: (ItemInput & { costUsd?: number | null; error?: string | null })[]): string {
  const rows = items.map((item) => {
    const verdicts = gradeItem(item);
    const record: Record<string, unknown> = {
      ...item,
      followersVerdict: verdicts.followers,
      totalPostsVerdict: verdicts.totalPosts,
      lastPostAtVerdict: verdicts.lastPostAt,
    };
    return CSV_FIELDS.map((field) => cell(record[field])).join(',');
  });
  return [CSV_FIELDS.join(','), ...rows].join('\r\n');
}
