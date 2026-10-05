import { describe, it, expect } from 'vitest';
import {
  addMonths,
  fetchBounds,
  monthOf,
  monthsBetween,
  periodAllowed,
  periodLabel,
  periodPostsLimit,
  periodSchema,
  resolveWindow,
  selectableMonths,
} from '../src/lib/period';
import { computeMetrics, dayKey } from '../src/lib/metrics';
import type { CollectorResult, NormalizedPost } from '../src/lib/collectors/types';

const asOf = new Date('2026-09-28T06:00:00Z');
const at = (iso: string, overrides: Partial<NormalizedPost> = {}): NormalizedPost => ({
  id: iso,
  url: null,
  publishedAt: new Date(iso).toISOString(),
  type: 'image',
  likes: 10,
  comments: 2,
  shares: null,
  views: null,
  isPinned: false,
  captionPreview: null,
  ...overrides,
});
const result = (posts: NormalizedPost[], sampleComplete = false): CollectorResult => ({
  status: 'ok',
  profile: {
    handle: 'brand',
    displayName: null,
    url: 'https://www.instagram.com/brand/',
    followers: 1000,
    following: null,
    totalPosts: null,
    verified: null,
    isBusiness: true,
    category: null,
    bio: 'bio',
    bioLink: null,
    avatarUrl: null,
  },
  posts,
  raw: null,
  costUsd: 0,
  warnings: [],
  fetchedAt: asOf.toISOString(),
  sampleComplete,
  subscriberHidden: false,
});

describe('period: month arithmetic and validation', () => {
  it('counts and shifts months across year ends', () => {
    expect(monthsBetween('2025-11', '2026-02')).toBe(4);
    expect(addMonths('2025-11', 3)).toBe('2026-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('labels like the picker', () => {
    expect(periodLabel({ from: '2026-04', to: '2026-09' })).toBe('Apr 2026–Sept 2026');
    expect(periodLabel({ from: '2026-04', to: '2026-04' })).toBe('Apr 2026');
    expect(periodLabel(null)).toBe('Last 30 days');
  });
  it('rejects reversed, malformed and over-long ranges', () => {
    expect(periodSchema.safeParse({ from: '2026-09', to: '2026-04' }).success).toBe(false);
    expect(periodSchema.safeParse({ from: '2026-13', to: '2026-12' }).success).toBe(false);
    expect(periodSchema.safeParse({ from: '2025-01', to: '2026-01' }).success).toBe(false);
    expect(periodSchema.safeParse({ from: '2025-02', to: '2026-01' }).success).toBe(true);
  });
  it('offers 24 months ending this month and refuses future months', () => {
    const months = selectableMonths(asOf);
    expect(months).toHaveLength(24);
    expect(months.at(-1)).toBe('2026-09');
    expect(periodAllowed({ from: '2026-08', to: '2026-10' }, asOf)).toBe(false);
    expect(periodAllowed({ from: '2024-09', to: '2024-10' }, asOf)).toBe(false);
    expect(periodAllowed({ from: '2024-10', to: '2026-09' }, asOf)).toBe(true);
  });
  it('uses Asia/Kolkata month boundaries', () => {
    // 20:00 UTC on 31 Aug is already 1 Sept in India.
    expect(monthOf(new Date('2026-08-31T20:00:00Z'))).toBe('2026-09');
  });
});

describe('period: resolved window', () => {
  it('spans whole past months', () => {
    const w = resolveWindow({ from: '2026-04', to: '2026-06' }, asOf);
    expect(dayKey(w.start)).toBe('2026-04-01');
    expect(dayKey(w.end)).toBe('2026-06-30');
    expect(Math.round(w.days)).toBe(91);
  });
  it('stops at the audit date when the last month is still running', () => {
    const w = resolveWindow({ from: '2026-09', to: '2026-09' }, asOf);
    expect(w.end.getTime()).toBe(asOf.getTime());
  });
  it('pads scraper date filters by a day each side', () => {
    const b = fetchBounds(resolveWindow({ from: '2026-04', to: '2026-06' }, asOf));
    expect(b.from <= '2026-03-31').toBe(true);
    expect(b.to >= '2026-07-01').toBe(true);
  });
  it('budgets posts from the first month to today, capped', () => {
    expect(periodPostsLimit(null, asOf)).toBe(60);
    expect(periodPostsLimit({ from: '2026-07', to: '2026-07' }, asOf)).toBe(120);
    expect(periodPostsLimit({ from: '2024-10', to: '2025-09' }, asOf)).toBe(500);
  });
});

describe('period: metrics use only posts inside the window', () => {
  const window = resolveWindow({ from: '2026-04', to: '2026-06' }, asOf);
  const posts = [
    at('2026-09-20T10:00:00Z', { likes: 1000 }), // after the period
    at('2026-06-15T10:00:00Z'),
    at('2026-05-10T10:00:00Z'),
    at('2026-04-02T10:00:00Z'),
    at('2026-03-01T10:00:00Z', { likes: 1000 }), // before: proves the period was covered
    at('2020-01-01T10:00:00Z', { isPinned: true, likes: 5000 }),
  ];
  const m = computeMetrics(result(posts), asOf, window);
  it('averages posts to a 30-day rate and keeps the raw count', () => {
    expect(m.postsInPeriod).toBe(3);
    expect(m.count).toBeCloseTo((3 * 30) / window.days, 1);
    expect(m.lowerBound).toBe(false);
  });
  it('ignores engagement from posts outside the period, including old pinned posts', () => {
    expect(m.avgLikes).toBe(10);
    expect(m.engagement).toBe(1.2);
  });
  it('draws the calendar over the period and measures gaps inside it', () => {
    expect(m.calendar).toHaveLength(Math.ceil(window.days));
    expect(m.calendar![0].date).toBe('2026-04-01');
    expect(m.calendar!.at(-1)!.date).toBe('2026-06-30');
    // 2 Apr → 10 May is the widest stretch without a post.
    expect(m.longestGap).toBeCloseTo(38, 0);
  });
  it('marks the count as a lower bound when the fetch never reached the period start', () => {
    const partial = computeMetrics(result(posts.slice(0, 3)), asOf, window);
    expect(partial.lowerBound).toBe(true);
  });
  it('reports zero, not unknown, for a covered period with no posts', () => {
    const empty = computeMetrics(result([at('2026-01-05T10:00:00Z')]), asOf, window);
    expect(empty.count).toBe(0);
    expect(empty.longestGap).toBeCloseTo(window.days, 0);
  });
});
