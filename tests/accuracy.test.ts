import { describe, expect, it } from 'vitest';
import { gradeCount, gradeDate, summarize, toCsv, type ItemInput } from '@/lib/accuracy';
import { parseAccounts } from '@/components/accuracy';

const item = (over: Partial<ItemInput> = {}): ItemInput => ({
  platform: 'instagram',
  handle: 'brand',
  state: 'done',
  followers: 1000,
  totalPosts: 100,
  lastPostAt: '2026-09-27T10:00:00.000Z',
  trueFollowers: 1000,
  trueTotalPosts: 100,
  trueLastPostAt: '2026-09-27',
  ...over,
});

describe('gradeCount', () => {
  it('accepts values inside the 2 percent band', () => {
    expect(gradeCount(1000, 1000)).toBe('correct');
    expect(gradeCount(1020, 1000)).toBe('correct');
    expect(gradeCount(980, 1000)).toBe('correct');
    expect(gradeCount(1021, 1000)).toBe('incorrect');
  });

  it('uses a minimum tolerance of one for small counts', () => {
    expect(gradeCount(11, 10)).toBe('correct');
    expect(gradeCount(9, 10)).toBe('correct');
    expect(gradeCount(12, 10)).toBe('incorrect');
    expect(gradeCount(0, 1)).toBe('correct');
  });

  it('separates a missing value from a missing truth', () => {
    expect(gradeCount(null, 1000)).toBe('not_returned');
    expect(gradeCount(1000, null)).toBe('no_truth');
    expect(gradeCount(null, null)).toBe('not_returned');
  });

  it('never treats zero as missing', () => {
    expect(gradeCount(0, 0)).toBe('correct');
    expect(gradeCount(0, 500)).toBe('incorrect');
  });
});

describe('gradeDate', () => {
  it('compares calendar days in Asia/Kolkata', () => {
    expect(gradeDate('2026-09-27T10:00:00.000Z', '2026-09-27')).toBe('correct');
    // 19:00 UTC is already the 28th in Kolkata (UTC+5:30).
    expect(gradeDate('2026-09-27T19:00:00.000Z', '2026-09-28')).toBe('correct');
    expect(gradeDate('2026-09-27T17:00:00.000Z', '2026-09-28')).toBe('incorrect');
  });

  it('handles missing values and unparseable input', () => {
    expect(gradeDate(null, '2026-09-27')).toBe('not_returned');
    expect(gradeDate('2026-09-27T10:00:00.000Z', null)).toBe('no_truth');
    expect(gradeDate('not a date', '2026-09-27')).toBe('incorrect');
  });
});

describe('summarize', () => {
  it('computes accuracy over graded values and coverage over attempted values', () => {
    const [ig] = summarize([item(), item({ handle: 'b', followers: 5000, trueFollowers: 1000 })]);
    expect(ig.attempted).toBe(6);
    expect(ig.returned).toBe(6);
    expect(ig.graded).toBe(6);
    expect(ig.correct).toBe(5);
    expect(ig.accuracy).toBeCloseTo((5 / 6) * 100);
    expect(ig.coverage).toBe(100);
    expect(ig.accuracyMet).toBe(false);
    expect(ig.coverageMet).toBe(true);
  });

  it('counts a not-returned value against coverage but not accuracy', () => {
    const [ig] = summarize([item({ followers: null })]);
    expect(ig.returned).toBe(2);
    expect(ig.attempted).toBe(3);
    expect(ig.coverage).toBeCloseTo((2 / 3) * 100);
    expect(ig.accuracy).toBe(100);
    expect(ig.graded).toBe(2);
  });

  it('excludes fields with no typed truth from accuracy but keeps them in coverage', () => {
    const [ig] = summarize([item({ trueFollowers: null })]);
    expect(ig.graded).toBe(2);
    expect(ig.returned).toBe(3);
    expect(ig.accuracy).toBe(100);
  });

  it('ignores items that are still collecting and reports them as pending', () => {
    const summary = summarize([item({ state: 'running' })]);
    expect(summary[0].attempted).toBe(0);
    expect(summary[0].pending).toBe(1);
    expect(summary[0].accuracy).toBeNull();
  });

  it('counts a failed item as attempted with nothing returned', () => {
    const [ig] = summarize([item({ state: 'failed', followers: null, totalPosts: null, lastPostAt: null })]);
    expect(ig.attempted).toBe(3);
    expect(ig.returned).toBe(0);
    expect(ig.coverage).toBe(0);
    expect(ig.failed).toBe(1);
  });

  it('reports each platform separately', () => {
    const summary = summarize([item(), item({ platform: 'youtube', handle: 'yt' })]);
    expect(summary.map((s) => s.platform)).toEqual(['instagram', 'youtube']);
  });
});

describe('toCsv', () => {
  it('emits a header, verdicts and quoted fields', () => {
    const csv = toCsv([item({ handle: 'a,b' })]);
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('followersVerdict');
    expect(row).toContain('"a,b"');
    expect(row).toContain('correct');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(toCsv([item({ handle: '=cmd|calc' })]).split('\r\n')[1]).toContain("'=cmd|calc");
  });
});

describe('parseAccounts', () => {
  it('reads platform and handle pairs and skips comments', () => {
    expect(parseAccounts('instagram: brand\n# note\nyoutube, @chan')).toEqual([
      { platform: 'instagram', handle: 'brand' },
      { platform: 'youtube', handle: '@chan' },
    ]);
  });

  it('rejects unknown platforms, bad lines, empty input and oversized lists', () => {
    expect(() => parseAccounts('tiktok: brand')).toThrow(/not a supported platform/);
    expect(() => parseAccounts('just-a-handle')).toThrow(/Cannot read/);
    expect(() => parseAccounts('   ')).toThrow(/at least one/);
    expect(() => parseAccounts(Array.from({ length: 51 }, (_, i) => `instagram: b${i}`).join('\n'))).toThrow(
      /Up to 50/,
    );
  });
});
