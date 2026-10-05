import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeGbp, gbpInput as actorInput } from '../src/lib/collectors/gbp';
import {
  normalizeWebsite,
  psiScores,
  psiVitals,
  detectTags,
  copyrightYear,
  latestDate,
} from '../src/lib/collectors/website';
import { mockChannel } from '../src/lib/collectors/channels';
import {
  normalizeGbpQuery,
  websiteResultSchema,
  type GbpResult,
  type WebsiteResult,
} from '../src/lib/collectors/channel-types';
import { freshnessScore, gbpInput, scoreGbp, scoreWebsite, websiteInput } from '../src/lib/scoring';
import { defaults, placeholderBenchmark } from '../src/lib/scoring/config';
import { buildReport, type Handles } from '../src/lib/report';

const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const asOf = new Date('2026-09-28T21:13:00Z');

describe('Google Business Profile normalizer (live fixture)', () => {
  const fixture = load('fixtures/gbp/raw-live-tier2-digital.json');
  const r = normalizeGbp(fixture.items, { costUsd: fixture.costUsd, fetchedAt: asOf.toISOString() });

  it('reads the verified actor fields', () => {
    expect(r.status).toBe('ok');
    expect(r.costUsd).toBeCloseTo(0.0092, 4);
    expect(r.detail).toMatchObject({
      name: 'TIER2 DIGITAL',
      category: 'Marketing agency',
      rating: 5,
      reviewCount: 6,
      hasHours: true,
      // The actor returns "" for a missing phone: a real absence, not an unknown.
      hasPhone: false,
      hasWebsite: true,
      photoCount: 12,
      closed: false,
    });
    expect(r.detail?.distribution).toEqual({ one: 0, two: 0, three: 0, four: 0, five: 6 });
    expect(r.detail?.latestReviews).toHaveLength(6);
    expect(r.detail?.latestReviews.every((x) => !x.ownerReplied)).toBe(true);
    expect(r.warnings.some((w) => w.includes('Confirm it is the right business'))).toBe(true);
  });

  it('scores to the hand calculation', () => {
    const scored = scoreGbp(gbpInput(r.detail!), placeholderBenchmark);
    // rating 5 → 100; 6 reviews on a 10–500 log band → 20 + 80·ln(0.6)/ln(50) = 9.55;
    // 0 of 6 replies → 0; completeness 4 of 5 (no phone) → 80.
    expect(scored.criteria.rating).toBe(100);
    expect(scored.criteria.reviews).toBeCloseTo(9.553, 2);
    expect(scored.criteria.replies).toBe(0);
    expect(scored.criteria.completeness).toBe(80);
    expect(scored.score).toBeCloseTo((100 * 40 + 9.553 * 30 + 0 * 15 + 80 * 15) / 100, 2);
  });

  it('treats no match as not found and a zero-review place as unrated', () => {
    expect(normalizeGbp([], { costUsd: 0.004, fetchedAt: asOf.toISOString() }).status).toBe('not_found');
    const place = { ...fixture.items[0], reviewsCount: 0, totalScore: 0, reviews: [] };
    const zero = normalizeGbp([place], { costUsd: null, fetchedAt: asOf.toISOString() });
    expect(zero.detail?.rating).toBeNull();
    const scored = scoreGbp(gbpInput(zero.detail!), placeholderBenchmark);
    expect(scored.criteria.rating).toBeNull();
    expect(scored.criteria.reviews).toBe(0);
    expect(scored.criteria.replies).toBeNull();
  });

  it('builds the actor input without reviewer personal data', () => {
    expect(actorInput('Tier2 Digital, Bengaluru')).toMatchObject({
      searchStringsArray: ['Tier2 Digital, Bengaluru'],
      maxCrawledPlacesPerSearch: 1,
      maxReviews: 10,
      scrapeReviewsPersonalData: false,
    });
    expect(actorInput('https://maps.app.goo.gl/abc')).toMatchObject({
      startUrls: [{ url: 'https://maps.app.goo.gl/abc' }],
    });
  });

  it('accepts Maps links or plain searches only', () => {
    expect(normalizeGbpQuery('  Tier2  Digital, Bengaluru ')).toBe('Tier2 Digital, Bengaluru');
    expect(normalizeGbpQuery('https://www.google.com/maps/place/Tier2')).toContain('google.com/maps');
    expect(normalizeGbpQuery('https://maps.app.goo.gl/xyz')).toContain('maps.app.goo.gl');
    expect(() => normalizeGbpQuery('https://evil.example/maps')).toThrow();
    expect(() => normalizeGbpQuery('http://www.google.com/maps/place/x')).toThrow();
    expect(() => normalizeGbpQuery('<script>')).toThrow();
  });
});

describe('Website normalizer and scoring (live crawl fixture)', () => {
  const live = websiteResultSchema.parse(load('fixtures/website/raw-live-tier2-digital.json'));

  it('captured the crawl for tier2.digital', () => {
    expect(live.detail.seo).toMatchObject({
      title: true,
      singleH1: false,
      h1Count: 51,
      schema: false,
      https: true,
    });
    expect(live.detail.tracking).toEqual({ analytics: true, meta: true, ads: false, linkedin: false });
    expect(live.detail.conversion).toMatchObject({ form: true, cta: true });
    expect(live.detail.freshness.copyrightYear).toBe(2021);
    // PageSpeed hit the shared quota during capture, so performance is excluded, not zero.
    expect(live.detail.pagespeed.runs).toEqual([]);
    expect(live.status).toBe('partial');
  });

  it('scores to the hand calculation with performance excluded', () => {
    const scored = scoreWebsite(websiteInput(live.detail, asOf));
    // SEO checklist 6 of 8 → 75 (PageSpeed SEO missing, so the checklist carries it);
    // tracking GA4 40 + Meta 30 → 70; conversion form 30 + CTA 30 → 60.
    expect(scored.criteria.performance).toBeNull();
    expect(scored.criteria.seo).toBe(75);
    expect(scored.criteria.tracking).toBe(70);
    expect(scored.criteria.conversion).toBe(60);
    expect(scored.score).toBeCloseTo((75 * 30 + 70 * 20 + 60 * 20) / 70, 6);
    expect(scored.weights.performance).toBe(0);
  });

  it('reports failure when neither the crawl nor PageSpeed worked', () => {
    const r = normalizeWebsite({
      website: 'https://example.com/',
      crawl: null,
      psi: [{ performance: null, seo: null, raw: null, error: 'PageSpeed run timed out.' }],
      asOf,
    });
    expect(r.status).toBe('failed');
    expect(r.warnings.join(' ')).toMatch(/timed out/);
  });
});

describe('PageSpeed parsing', () => {
  const body = (extra: object = {}) => ({
    lighthouseResult: {
      categories: { performance: { score: 0.57 }, seo: { score: 0.92 } },
      audits: {
        'largest-contentful-paint': { numericValue: 3100 },
        'cumulative-layout-shift': { numericValue: 0.12 },
      },
    },
    ...extra,
  });

  it('converts category scores to 0–100', () => {
    expect(psiScores(body())).toEqual({ performance: 57, seo: 92 });
    expect(psiScores({})).toEqual({ performance: null, seo: null });
  });

  it('prefers field data, flags origin fallback, and divides CrUX CLS by 100', () => {
    const field = body({
      loadingExperience: {
        origin_fallback: true,
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2300 },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 },
        },
      },
    });
    expect(psiVitals([field])).toEqual({ lcpMs: 2300, inpMs: 180, cls: 0.05, vitalsSource: 'origin' });
  });

  it('falls back to lab values with INP unmeasured', () => {
    expect(psiVitals([body(), body()])).toEqual({ lcpMs: 3100, inpMs: null, cls: 0.12, vitalsSource: 'lab' });
    expect(psiVitals([])).toEqual({ lcpMs: null, inpMs: null, cls: null, vitalsSource: null });
  });
});

describe('crawl helpers', () => {
  it('detects tags from request URLs and inline scripts', () => {
    expect(
      detectTags(
        [
          'https://www.googletagmanager.com/gtag/js?id=G-ABC123',
          'https://connect.facebook.net/en_US/fbevents.js',
          "gtag('config', 'AW-123456789')",
          'window._linkedin_partner_id = "1";',
        ].join('\n'),
      ),
    ).toEqual({ analytics: true, meta: true, ads: true, linkedin: true });
    expect(detectTags('https://example.com/app.js')).toEqual({
      analytics: false,
      meta: false,
      ads: false,
      linkedin: false,
    });
  });

  it('reads the latest copyright year and ignores far-future years', () => {
    expect(copyrightYear('Copyright © 2019–2025 Acme', asOf)).toBe(2025);
    expect(copyrightYear('© 2021, Tier2 Digital', asOf)).toBe(2021);
    expect(copyrightYear('founded in 2010', asOf)).toBeNull();
    expect(copyrightYear('© 2099', asOf)).toBeNull();
  });

  it('keeps only plausible past dates', () => {
    expect(latestDate(['2026-09-01', 'Aug 24 2026', 'nonsense', '2030-01-01'], asOf)).toBe(
      new Date('2026-09-01').toISOString(),
    );
    expect(latestDate([], asOf)).toBeNull();
  });

  it('scores freshness from blog recency and copyright year', () => {
    expect(freshnessScore(new Date(asOf.getTime() - 10 * 86400000).toISOString(), 2026, asOf)).toBe(100);
    expect(freshnessScore(null, 2025, asOf)).toBe(50);
    expect(freshnessScore(null, 2021, asOf)).toBe(0);
    expect(freshnessScore(new Date(asOf.getTime() - 400 * 86400000).toISOString(), null, asOf)).toBe(0);
    expect(freshnessScore(null, null, asOf)).toBeNull();
  });
});

describe('report with website and GBP channels', () => {
  const handles: Handles = {
    instagram: { handle: 'demo', presence: 'present' },
    facebook: { handle: '', presence: 'unknown' },
    linkedin: { handle: '', presence: 'unknown' },
    youtube: { handle: '', presence: 'unknown' },
  };

  it('mock fixtures parse for every tier', async () => {
    for (const tier of ['strong', 'average', 'weak'] as const) {
      const w = await mockChannel('website', 'https://demo.example', tier, asOf);
      const g = await mockChannel('gbp', 'Demo, Bengaluru', tier, asOf);
      expect(w.kind).toBe('website');
      expect(g.kind).toBe('gbp');
      expect(w.warnings[0]).toMatch(/Synthetic/);
    }
  });

  it('blends all three channels and labels it Digital Presence', async () => {
    const website = (await mockChannel('website', 'https://demo.example', 'weak', asOf)) as WebsiteResult;
    const gbp = (await mockChannel('gbp', 'Demo', 'strong', asOf)) as GbpResult;
    const r = buildReport({}, handles, 'D2C', asOf, undefined, { website, gbp, gbpPresence: 'present' });
    expect(r.overall.label).toBe('Digital Presence Score');
    expect(r.website?.score).not.toBeNull();
    expect(r.gbp?.score).not.toBeNull();
    // Social is not measured (no results), so website and GBP re-normalise to 40:20.
    expect(r.overall.weights).toEqual({ website: (40 / 60) * 100, social: 0, gbp: (20 / 60) * 100 });
    expect(r.overall.score).toBeCloseTo((r.website!.score! * 40 + r.gbp!.score! * 20) / 60, 6);
    // Weak website: no tracking at all → a tracking gap mapped to the growth service.
    const tracking = r.gaps.find((g) => g.platform === 'website' && g.component === 'tracking');
    expect(tracking?.service).toBe('Growth & Performance Marketing');
    expect(r.gaps.some((g) => g.component === 'freshness')).toBe(false); // weight 0: shown, never a gap
  });

  it('scores a confirmed missing GBP as 0 only where it matters', () => {
    const d2c = buildReport({}, handles, 'D2C', asOf, undefined, {
      website: null,
      gbp: null,
      gbpPresence: 'absent',
    });
    expect(d2c.gbp?.score).toBe(0);
    expect(d2c.gaps.some((g) => g.platform === 'gbp' && g.component === 'missing')).toBe(true);
    const b2b = buildReport({}, handles, 'B2B', asOf, undefined, {
      website: null,
      gbp: null,
      gbpPresence: 'absent',
    });
    expect(b2b.gbp?.score).toBeNull();
    expect(b2b.gaps.some((g) => g.platform === 'gbp')).toBe(false);
  });

  it('skips a channel whose weight is 0 and keeps the social label when only social is measured', async () => {
    const website = (await mockChannel('website', 'https://demo.example', 'strong', asOf)) as WebsiteResult;
    const snapshot = {
      settings: { ...defaults, channels: { website: 0, social: 40, gbp: 20 } },
      benchmarks: {
        instagram: placeholderBenchmark,
        facebook: placeholderBenchmark,
        linkedin: placeholderBenchmark,
        youtube: placeholderBenchmark,
      },
      services: {},
    };
    const r = buildReport({}, handles, 'D2C', asOf, snapshot, { website, gbp: null, gbpPresence: 'unknown' });
    expect(r.website).toBeNull();
    expect(r.overall.label).toBe('Social Presence Score');
  });

  it('a failed website run is excluded, not zero', () => {
    const failed = normalizeWebsite({ website: 'https://x.example/', crawl: null, psi: [], asOf });
    const r = buildReport({}, handles, 'D2C', asOf, undefined, {
      website: failed,
      gbp: null,
      gbpPresence: 'unknown',
    });
    expect(r.website?.score).toBeNull();
    expect(r.channelScores.website).toBeNull();
  });
});
