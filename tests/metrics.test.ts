import { describe, it, expect } from 'vitest';
import {
  average,
  engagementRate,
  frequency,
  longestGap,
  contentMix,
  topPosts,
  profileCompleteness,
  dayKey,
  calendar,
  computeMetrics,
} from '../src/lib/metrics';
import type { NormalizedPost } from '../src/lib/collectors/types';
import { mockCollector } from '../src/lib/collectors/mock';
const now = new Date('2026-09-28T00:00:00Z');
const post = (days: number, overrides: Partial<NormalizedPost> = {}): NormalizedPost => ({
  id: String(days),
  url: null,
  publishedAt: new Date(+now - days * 86400000).toISOString(),
  type: 'image',
  likes: 10,
  comments: 2,
  shares: null,
  views: null,
  isPinned: false,
  captionPreview: null,
  ...overrides,
});
describe('metrics: unavailable is never zero', () => {
  it('averages only measured nonnegative values', () => {
    expect(average([null, 0, 10])).toBe(5);
    expect(average([null, -1, NaN])).toBeNull();
  });
  it('engagement handles missing, hidden, zero and hand calculation', () => {
    expect(engagementRate(18, 2, 1000)).toBe(2);
    for (const f of [0, null]) expect(engagementRate(10, 1, f)).toBeNull();
    expect(engagementRate(null, 1, 100)).toBeNull();
  });
  it('counts the inclusive window and excludes pinned/future/undated posts', () => {
    const m = frequency(
      [post(0), post(30), post(31), post(1, { isPinned: true }), post(-1), post(5, { publishedAt: null })],
      now,
      false,
    );
    expect(m.count).toBe(2);
    expect(m.lowerBound).toBe(true);
    expect(m.lastPost).toBe(now.toISOString());
  });
  it('marks entirely recent sample as a lower bound', () =>
    expect(frequency([post(1), post(3)], now, false)).toMatchObject({ count: 2, lowerBound: true }));
  it('distinguishes a complete empty account from missing samples/all pinned', () => {
    expect(frequency([], now, true).count).toBe(0);
    expect(frequency([], now, false).count).toBeNull();
    expect(frequency([post(2, { isPinned: true })], now, true).count).toBeNull();
  });
  it('computes longest observed gap including latest to today', () => {
    expect(longestGap([post(3), post(10), post(40), post(95)], now, false)).toBe(30);
    expect(longestGap([post(100)], now, true)).toBe(90);
    expect(longestGap([], now, false)).toBeNull();
    expect(longestGap([], now, true)).toBe(90);
    expect(longestGap([post(1, { isPinned: true })], now, true)).toBeNull();
  });
  it('mix and top posts preserve hidden counts', () => {
    expect(contentMix([])).toBeNull();
    expect(contentMix([post(1, { type: 'reel' }), post(2)])?.videoPercent).toBe(50);
    expect(topPosts([post(1, { likes: null }), post(2, { likes: 20 }), post(3)]).map((p) => p.id)).toEqual([
      '2',
      '3',
    ]);
  });
  it('calendar uses Kolkata date boundaries and excludes pinned posts', () => {
    expect(dayKey('2026-09-27T20:00:00Z')).toBe('2026-09-28');
    const days = calendar([post(0), post(0, { isPinned: true })], now);
    expect(days).toHaveLength(90);
    expect(days.at(-1)?.count).toBe(1);
  });
  it('private profiles cannot produce fabricated zeros', async () => {
    const result = await mockCollector('facebook', 'weak', now).collect('test', { postsLimit: 60 });
    const m = computeMetrics(result, now);
    expect(m.count).toBeNull();
    expect(m.engagement).toBeNull();
    expect(m.calendar).toBeNull();
    expect(profileCompleteness(null)).toBeNull();
  });
});
