import { describe, it, expect } from 'vitest';
import {
  weighted,
  effectiveWeights,
  linear,
  logBand,
  band,
  scorePlatform,
  scoreOverall,
  scoreWebsite,
  scoreGbp,
  median,
} from '../src/lib/scoring';
import { placeholderBenchmark, defaults } from '../src/lib/scoring/config';
import { computeMetrics } from '../src/lib/metrics';
import { mockCollector } from '../src/lib/collectors/mock';
import { buildReport, defaultSnapshot, type Handles } from '../src/lib/report';
import { lowestGaps } from '../src/lib/recommendations';
const handles: Handles = {
  instagram: { handle: 'demo', presence: 'present' },
  facebook: { handle: '', presence: 'unknown' },
  linkedin: { handle: '', presence: 'unknown' },
  youtube: { handle: '', presence: 'unknown' },
};
describe('scores and explainability', () => {
  it('re-normalizes missing values and handles zero weights', () => {
    expect(weighted({ a: 80, b: null }, { a: 40, b: 60 })).toBe(80);
    expect(weighted({ a: null }, { a: 100 })).toBeNull();
    expect(weighted({ a: 40 }, { a: 0 })).toBeNull();
    expect(effectiveWeights({ a: 80, b: null }, { a: 40, b: 60 })).toEqual({ a: 100, b: 0 });
  });
  it('bounds linear and log bands with hand-calculated values', () => {
    expect(linear(6, 12)).toBe(50);
    expect(linear(24, 12)).toBe(100);
    expect(linear(null, 12)).toBeNull();
    expect(logBand(1000, 1000, 100000)).toBe(20);
    expect(logBand(10000, 1000, 100000)).toBeCloseTo(60);
    expect(logBand(0, 1000, 50000)).toBe(0);
    expect(logBand(null, 1, 10)).toBeNull();
  });
  it('uses exact band boundaries', () =>
    expect([null, 0, 39.9, 40, 60, 80, 100].map((s) => band(s))).toEqual([
      'Not measured',
      'Weak',
      'Weak',
      'Needs work',
      'Good',
      'Strong',
      'Strong',
    ]));
  it('applies activity penalty with a floor, missing engagement excluded', async () => {
    const result = await mockCollector('instagram', 'average').collect('demo', { postsLimit: 60 });
    const metrics = {
      ...computeMetrics(result, new Date()),
      count: 6,
      longestGap: 22,
      engagement: null,
      completeness: 100,
    };
    const score = scorePlatform(metrics, 1000, placeholderBenchmark);
    expect(score.components.activity).toBe(30);
    expect(score.score).toBeCloseTo((30 * 35 + 20 * 15 + 100 * 15) / 65);
    expect(score.weights.engagement).toBe(0);
  });
  it('social-only overall label and weights are honest', () => {
    expect(scoreOverall({ website: null, social: 72, gbp: null })).toMatchObject({
      score: 72,
      label: 'Social Presence Score',
      weights: { social: 100, website: 0, gbp: 0 },
    });
    expect(scoreOverall({ website: 100, social: 50, gbp: 0 }).score).toBe(60);
  });
  it('scores website criteria against known arithmetic', () => {
    const report = scoreWebsite({
      performanceRuns: [60, 80, 100],
      lcp: 2,
      inp: 250,
      cls: 0.05,
      seoScore: 80,
      seoChecklist: [true, false, true, false, true, false, true, false],
      tracking: { analytics: true, meta: false, ads: false, linkedin: false },
      conversion: { form: true, cta: true, whatsapp: false, phone: false },
      freshness: null,
    });
    expect(report.criteria.performance).toBeCloseTo(74.6666667);
    expect(report.criteria.seo).toBe(65);
    expect(report.criteria.tracking).toBe(40);
    expect(report.criteria.conversion).toBe(60);
    expect(report.score).toBeCloseTo(61.9);
    expect(median([null])).toBeNull();
    expect(median([1, 3])).toBe(2);
  });
  it('scores GBP and excludes missing rating', () => {
    const r = scoreGbp(
      {
        rating: 3.75,
        reviews: 10,
        ownerReplies: [true, false],
        completeness: [true, true, true, true, true],
      },
      placeholderBenchmark,
    );
    expect(r.criteria).toEqual({ rating: 50, reviews: 20, replies: 50, completeness: 100 });
    expect(r.score).toBe(48.5);
    expect(
      scoreGbp({ rating: null, reviews: null, ownerReplies: [], completeness: [] }, placeholderBenchmark)
        .score,
    ).toBeNull();
  });
  it('excludes an entirely unmeasured website and honors configurable subweights', () => {
    const missing = {
      performanceRuns: [null, null, null],
      lcp: null,
      inp: null,
      cls: null,
      seoScore: null,
      seoChecklist: [],
      tracking: { analytics: null, meta: null, ads: null, linkedin: null },
      conversion: { form: null, cta: null, whatsapp: null, phone: null },
      freshness: null,
    };
    expect(scoreWebsite(missing).score).toBeNull();
    expect(
      scoreWebsite(
        { ...missing, tracking: { analytics: true, meta: false, ads: false, linkedin: false } },
        {
          ...defaults,
          websiteParts: {
            ...defaults.websiteParts,
            tracking: { analytics: 70, meta: 10, ads: 10, linkedin: 10 },
          },
        },
      ).score,
    ).toBe(70);
  });
  it('failed data stays null; confirmed absent relevant account scores zero', () => {
    const absent = { ...handles, linkedin: { handle: '', presence: 'absent' as const } };
    const r = buildReport({}, absent, 'B2B', new Date());
    expect(r.cards.find((c) => c.platform === 'linkedin')?.score).toBe(0);
    expect(r.cards.find((c) => c.platform === 'instagram')?.score).toBeNull();
    expect(r.gaps[0].service).toBe('B2B Marketing');
  });
  it('irrelevant absent and disabled platforms are excluded', () => {
    const h = { ...handles, linkedin: { handle: '', presence: 'absent' as const } };
    expect(buildReport({}, h, 'D2C', new Date()).social).toBeNull();
    expect(
      buildReport({}, h, 'B2B', new Date(), {
        ...defaultSnapshot,
        settings: { ...defaults, enabled: ['instagram'] },
      }).social,
    ).toBeNull();
  });
  it('keeps only six lowest gaps without mutating input', () => {
    const gaps = Array.from({ length: 8 }, (_, i) => ({
      platform: 'instagram',
      component: 'activity',
      score: 7 - i,
      measured: 'test',
      service: 'test',
      explanation: 'test',
    }));
    expect(lowestGaps(gaps).map((g) => g.score)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(gaps[0].score).toBe(7);
  });
});
