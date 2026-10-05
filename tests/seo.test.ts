import { describe, expect, it } from 'vitest';
import { buildSeoAudit } from '@/lib/seo';
import { normalizeSerp, serpInput } from '@/lib/collectors/serp';
import { psiSeoExtras } from '@/lib/collectors/website';
import { emptyWebsite, type WebsiteDetail } from '@/lib/collectors/channel-types';
import { mockChannel } from '@/lib/collectors/channels';
import { buildReport, type Handles } from '@/lib/report';
import * as insight from '@/lib/insights';

const asOf = new Date('2026-10-01T00:00:00Z');
const handles: Handles = {
  instagram: { handle: 'x', presence: 'present' },
  facebook: { handle: 'x', presence: 'present' },
  linkedin: { handle: 'x', presence: 'present' },
  youtube: { handle: 'x', presence: 'present' },
};

describe('SEO audit scoring', () => {
  it('leaves every category unmeasured when nothing was collected', () => {
    const audit = buildSeoAudit(emptyWebsite('https://x.example/'), asOf);
    expect(audit.score).toBeNull();
    expect(audit.categories.every((c) => c.score === null)).toBe(true);
  });

  it('scores checks 100 / 50 / 0 against the benchmarks and re-weights unmeasured categories', () => {
    const d: WebsiteDetail = {
      ...emptyWebsite('https://x.example/'),
      seo: { ...emptyWebsite(null).seo, title: true, metaDescription: true, h1Count: 2, https: true },
      seoAudit: {
        statusCode: 200,
        titleLength: 45,
        descriptionLength: 200,
        canonical: false,
        viewport: true,
        lang: true,
        openGraph: null,
        twitterCard: null,
        noindex: false,
        hreflang: null,
        favicon: null,
        h2Count: null,
        wordCount: null,
        internalLinks: null,
        externalLinks: null,
        schemaTypes: [],
        ttfbMs: null,
        fcpMs: null,
        lighthouse: [],
        search: null,
      },
    };
    const audit = buildSeoAudit(d, asOf);
    const onpage = audit.categories.find((c) => c.key === 'onpage')!;
    const byKey = Object.fromEntries(onpage.checks.map((c) => [c.key, c.score]));
    // Title in range, description too long, two H1s.
    expect(byKey).toMatchObject({ title: 100, description: 50, h1: 50 });
    const technical = audit.categories.find((c) => c.key === 'technical')!;
    // https, status 200, indexable, viewport, lang pass; canonical fails → 5 of 6 measured.
    expect(technical.score).toBeCloseTo((5 * 100) / 6, 6);
    expect(audit.categories.find((c) => c.key === 'visibility')!.score).toBeNull();
    expect(audit.categories.find((c) => c.key === 'visibility')!.effectiveWeight).toBe(0);
  });

  it('rewards ranking first for the brand name and penalises missing page one', () => {
    const base = { ...emptyWebsite('https://x.example/') };
    const make = (brandPosition: number | null) =>
      buildSeoAudit(
        {
          ...base,
          seoAudit: {
            ...buildSeoAuditDefaults(),
            search: {
              indexedPages: 40,
              indexedLowerBound: false,
              brandQuery: 'X',
              brandPosition,
              brandSitelinks: brandPosition === 1,
              topResults: [
                { position: 2, title: 'Brand', url: 'https://in.linkedin.com/company/x', own: false },
                { position: 3, title: 'Brand', url: 'https://www.instagram.com/x/', own: false },
              ],
              peopleAlsoAsk: [],
            },
          },
        },
        asOf,
      ).categories.find((c) => c.key === 'visibility')!.score;
    // Indexed, rank, sitelinks, two social profiles on page one (LinkedIn + Instagram) = 100.
    expect(make(1)).toBe(100);
    // Indexed 100, rank 50, no sitelinks 0, profiles 100.
    expect(make(3)).toBe(62.5);
    expect(make(null)).toBe(50);
  });
});

function buildSeoAuditDefaults() {
  return {
    statusCode: null,
    titleLength: null,
    descriptionLength: null,
    canonical: null,
    viewport: null,
    lang: null,
    openGraph: null,
    twitterCard: null,
    noindex: null,
    hreflang: null,
    favicon: null,
    h2Count: null,
    wordCount: null,
    internalLinks: null,
    externalLinks: null,
    schemaTypes: [],
    ttfbMs: null,
    fcpMs: null,
    lighthouse: [],
  };
}

describe('Google search scraper normalizer', () => {
  const items = [
    { searchQuery: { term: 'site:brand.example' }, resultsTotal: 132, organicResults: [] },
    {
      searchQuery: { term: 'Brand' },
      organicResults: [
        { position: 1, title: 'Brand on Instagram', url: 'https://instagram.com/brand' },
        { position: 2, title: 'Brand', url: 'https://www.brand.example/', siteLinks: [{ title: 'About' }] },
      ],
      peopleAlsoAsk: [{ question: 'Is Brand good?' }],
    },
  ];

  it('reads indexed pages, the own-site position, sitelinks and questions', () => {
    const s = normalizeSerp(items, 'https://www.brand.example/', 'Brand')!;
    expect(s).toMatchObject({ indexedPages: 132, indexedLowerBound: false, brandPosition: 2, brandSitelinks: true });
    expect(s.topResults.map((r) => r.own)).toEqual([false, true]);
    expect(s.peopleAlsoAsk).toEqual(['Is Brand good?']);
  });

  it('falls back to a lower bound when Google gives no total, and null when nothing came back', () => {
    const s = normalizeSerp(
      [{ searchQuery: { term: 'site:brand.example' }, organicResults: [{}, {}, {}] }],
      'https://brand.example',
      'Brand',
    )!;
    expect(s).toMatchObject({ indexedPages: 3, indexedLowerBound: true, brandPosition: null, brandSitelinks: null });
    expect(normalizeSerp([], 'https://brand.example', 'Brand')).toBeNull();
  });

  it('sends one site: query and one brand query', () => {
    expect(serpInput('https://www.brand.example/x', 'Brand').queries).toBe('site:brand.example\nBrand');
  });
});

describe('PageSpeed SEO extras', () => {
  it('prefers field TTFB/FCP and keeps only scored Lighthouse SEO audits', () => {
    const body = {
      loadingExperience: { metrics: { FIRST_CONTENTFUL_PAINT_MS: { percentile: 1500 } } },
      lighthouseResult: {
        categories: { seo: { auditRefs: [{ id: 'document-title' }, { id: 'structured-data' }] } },
        audits: {
          'server-response-time': { numericValue: 2 },
          metrics: { details: { items: [{ timeToFirstByte: 640 }] } },
          'first-contentful-paint': { numericValue: 2100 },
          'document-title': { title: 'Has a title', score: 1 },
          'structured-data': { title: 'Structured data is valid', score: null },
        },
      },
    };
    expect(psiSeoExtras([body])).toEqual({
      ttfbMs: 640,
      fcpMs: 1500,
      lighthouse: [{ id: 'document-title', title: 'Has a title', passed: true }],
    });
  });
});

describe('report integration and insights', () => {
  it('builds an SEO audit and chart insights from the mock fixtures', async () => {
    for (const tier of ['strong', 'average', 'weak'] as const) {
      const website = (await mockChannel('website', 'https://brand.example', tier, asOf)) as never;
      const report = buildReport({}, handles, 'General', asOf, undefined, { website, gbp: null, gbpPresence: 'unknown' });
      expect(report.seo?.score).not.toBeNull();
      expect(insight.seoInsights(report).length).toBeGreaterThan(0);
      expect(insight.compositionInsights(report).length).toBeGreaterThan(0);
      if (tier === 'weak') expect(report.gaps.some((g) => g.platform === 'seo')).toBe(true);
      // The SEO category gaps replace the website's single SEO gap rather than repeating it.
      if (report.gaps.some((g) => g.platform === 'seo'))
        expect(report.gaps.some((g) => g.platform === 'website' && g.component === 'seo')).toBe(false);
    }
  });
});
