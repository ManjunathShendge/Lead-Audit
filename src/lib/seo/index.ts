import type { WebsiteDetail } from '../collectors/channel-types';
import { median } from '../scoring';
import { seoBenchmarks as B } from './benchmarks';

/**
 * Homepage SEO audit built from the website crawl and PageSpeed. Each check scores 100 (meets the
 * benchmark), 50 (partly) or 0 (misses it); a check that could not be measured is null and left out.
 * A category is the average of its measured checks; the audit is the weighted average of categories.
 */
export type CheckScore = 100 | 50 | 0 | null;
export interface SeoCheck {
  key: string;
  label: string;
  found: string;
  benchmark: string;
  source: string;
  score: CheckScore;
}
export const seoCategories = {
  visibility: { label: 'Google visibility', weight: 20 },
  technical: { label: 'Crawl & index', weight: 25 },
  onpage: { label: 'On-page tags', weight: 25 },
  content: { label: 'Content & links', weight: 15 },
  experience: { label: 'Page experience', weight: 15 },
} as const;
export type SeoCategory = keyof typeof seoCategories;

const yes = (v: boolean | null): CheckScore => (v === null ? null : v ? 100 : 0);
const shown = (v: boolean | null, y = 'Yes', n = 'No') => (v === null ? 'Not measured' : v ? y : n);
const range = (v: number | null, min: number, max: number): CheckScore =>
  v === null ? null : v === 0 ? 0 : v >= min && v <= max ? 100 : 50;
/** Lower is better: good → 100, between good and poor → 50, beyond poor → 0. */
const zone = (v: number | null, good: number, poor: number): CheckScore =>
  v === null ? null : v <= good ? 100 : v <= poor ? 50 : 0;
const atLeast = (v: number | null, target: number, partial: number): CheckScore =>
  v === null ? null : v >= target ? 100 : v >= partial ? 50 : 0;
const n = (v: number) => new Intl.NumberFormat('en-IN').format(v);
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
const networks: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
];
const socialNetwork = (url: string) => networks.find(([re]) => re.test(hostOf(url)))?.[1] ?? null;

export function buildSeoAudit(d: WebsiteDetail, asOf: Date, altRatio = B.altTextPercent.target / 100) {
  const s = d.seo;
  const x = d.seoAudit ?? null;
  const lighthouseSeo = median(d.pagespeed.runs.map((r) => r.seo));
  const lcp = d.pagespeed.lcpMs === null ? null : d.pagespeed.lcpMs / 1000;
  const blogDays =
    d.freshness.latestPost === null ? null : Math.round((asOf.getTime() - Date.parse(d.freshness.latestPost)) / 86400000);
  const altPct = s.imageAltRatio === null ? null : Math.round(s.imageAltRatio * 100);
  const failedLighthouse = x?.lighthouse.filter((a) => !a.passed) ?? [];

  const g = x?.search ?? null;
  const socialHits = [
    ...new Set(
      (g?.topResults ?? [])
        .map((r) => socialNetwork(r.url))
        .filter((v): v is string => v !== null),
    ),
  ];
  const checks: Record<SeoCategory, SeoCheck[]> = {
    visibility: [
      {
        key: 'indexed',
        label: 'Pages indexed by Google',
        found:
          g?.indexedPages == null ? 'Not measured' : `${g.indexedLowerBound ? 'At least ' : ''}${n(g.indexedPages)}`,
        benchmark: `${B.indexedPages.good}+ pages`,
        source: B.indexedPages.source,
        score:
          g?.indexedPages == null
            ? null
            : g.indexedPages >= B.indexedPages.good
              ? 100
              : g.indexedPages > 0
                ? 50
                : 0,
      },
      {
        key: 'brandRank',
        label: `Ranks for its own name${g?.brandQuery ? ` (“${g.brandQuery}”)` : ''}`,
        found: !g ? 'Not measured' : g.brandPosition === null ? 'Not on page one' : `Position ${g.brandPosition}`,
        benchmark: 'Position 1 (27.6% of clicks)',
        source: B.ctrByPosition.source,
        score: !g ? null : g.brandPosition === 1 ? 100 : g.brandPosition !== null && g.brandPosition <= 3 ? 50 : 0,
      },
      {
        key: 'sitelinks',
        label: 'Sitelinks under the brand result',
        found: g?.brandSitelinks == null ? 'Not measured' : g.brandSitelinks ? 'Shown' : 'Not shown',
        benchmark: 'Shown (+15–20% CTR)',
        source: B.ctrByPosition.source,
        score: yes(g?.brandSitelinks ?? null),
      },
      {
        key: 'profiles',
        label: 'Social profiles on page one for the brand name',
        found: !g ? 'Not measured' : socialHits.length ? socialHits.join(', ') : 'None',
        benchmark: `${B.brandProfiles.good}+ profiles`,
        source: B.brandProfiles.source,
        score: !g ? null : socialHits.length >= B.brandProfiles.good ? 100 : socialHits.length ? 50 : 0,
      },
    ],
    technical: [
      { key: 'https', label: 'Served over HTTPS', found: shown(s.https), benchmark: 'Required', source: B.lighthouseSeo.source, score: yes(s.https) },
      {
        key: 'status',
        label: 'Homepage returns 200 OK',
        found: x?.statusCode == null ? 'Not measured' : `HTTP ${x.statusCode}`,
        benchmark: 'HTTP 200',
        source: B.lighthouseSeo.source,
        score: x?.statusCode == null ? null : x.statusCode === 200 ? 100 : 0,
      },
      {
        key: 'indexable',
        label: 'Open to search engines (no noindex)',
        found: x?.noindex == null ? 'Not measured' : x.noindex ? 'Blocked by noindex' : 'Indexable',
        benchmark: 'Indexable',
        source: B.lighthouseSeo.source,
        score: x?.noindex == null ? null : x.noindex ? 0 : 100,
      },
      { key: 'robots', label: 'robots.txt', found: shown(s.robots, 'Valid', 'Missing'), benchmark: 'Present and valid', source: B.lighthouseSeo.source, score: yes(s.robots) },
      { key: 'sitemap', label: 'XML sitemap', found: shown(s.sitemap, 'Found', 'Not found'), benchmark: 'Present', source: B.lighthouseSeo.source, score: yes(s.sitemap) },
      { key: 'canonical', label: 'Canonical tag', found: shown(x?.canonical ?? null, 'Set', 'Missing'), benchmark: 'Set', source: B.lighthouseSeo.source, score: yes(x?.canonical ?? null) },
      { key: 'viewport', label: 'Mobile viewport tag', found: shown(x?.viewport ?? null, 'Set', 'Missing'), benchmark: 'Set', source: B.lighthouseSeo.source, score: yes(x?.viewport ?? null) },
      { key: 'lang', label: 'Page language declared', found: shown(x?.lang ?? null, 'Set', 'Missing'), benchmark: 'Set', source: B.lighthouseSeo.source, score: yes(x?.lang ?? null) },
      {
        key: 'lighthouse',
        label: 'Google Lighthouse SEO score',
        found: lighthouseSeo === null ? 'Not measured' : `${Math.round(lighthouseSeo)} / 100${failedLighthouse.length ? ` · ${failedLighthouse.length} audit${failedLighthouse.length > 1 ? 's' : ''} failed` : ''}`,
        benchmark: `${B.lighthouseSeo.good}+`,
        source: B.lighthouseSeo.source,
        score: lighthouseSeo === null ? null : lighthouseSeo >= B.lighthouseSeo.good ? 100 : lighthouseSeo >= B.lighthouseSeo.poor ? 50 : 0,
      },
    ],
    onpage: [
      {
        key: 'title',
        label: 'Title tag length',
        found: x?.titleLength != null ? (x.titleLength ? `${x.titleLength} characters` : 'Missing') : shown(s.title, 'Present', 'Missing'),
        benchmark: `${B.titleLength.min}–${B.titleLength.max} characters`,
        source: B.titleLength.source,
        score: x?.titleLength != null ? range(x.titleLength, B.titleLength.min, B.titleLength.max) : s.title === false ? 0 : null,
      },
      {
        key: 'description',
        label: 'Meta description length',
        found:
          x?.descriptionLength != null
            ? x.descriptionLength
              ? `${x.descriptionLength} characters`
              : 'Missing'
            : shown(s.metaDescription, 'Present', 'Missing'),
        benchmark: `${B.descriptionLength.min}–${B.descriptionLength.max} characters`,
        source: B.descriptionLength.source,
        score:
          x?.descriptionLength != null
            ? range(x.descriptionLength, B.descriptionLength.min, B.descriptionLength.max)
            : s.metaDescription === false
              ? 0
              : null,
      },
      {
        key: 'h1',
        label: 'One H1 heading',
        found: s.h1Count === null ? 'Not measured' : `${s.h1Count} found`,
        benchmark: 'Exactly 1',
        source: B.lighthouseSeo.source,
        score: s.h1Count === null ? null : s.h1Count === 1 ? 100 : s.h1Count > 1 ? 50 : 0,
      },
      {
        key: 'h2',
        label: 'Subheadings (H2) structure the page',
        found: x?.h2Count == null ? 'Not measured' : `${x.h2Count} found`,
        benchmark: '2 or more',
        source: B.lighthouseSeo.source,
        score: atLeast(x?.h2Count ?? null, 2, 1),
      },
      {
        key: 'alt',
        label: 'Images with alt text',
        found: altPct === null ? 'No images' : `${altPct}% of ${s.imageCount ?? 0}`,
        benchmark: `${Math.round(altRatio * 100)}%+`,
        source: B.altTextPercent.source,
        score: altPct === null ? null : altPct >= altRatio * 100 ? 100 : altPct >= 60 ? 50 : 0,
      },
      {
        key: 'schema',
        label: 'Structured data (schema.org)',
        found: x?.schemaTypes.length ? x.schemaTypes.slice(0, 4).join(', ') : shown(s.schema, 'Present', 'None'),
        benchmark: 'Organization or FAQ markup',
        source: B.altTextPercent.source,
        score: yes(s.schema),
      },
      {
        key: 'social',
        label: 'Open Graph tags for link previews',
        found: shown(x?.openGraph ?? null, 'og:title + og:image', 'Missing og:title or og:image'),
        benchmark: 'og:title and og:image',
        source: B.lighthouseSeo.source,
        score: yes(x?.openGraph ?? null),
      },
      {
        key: 'xcard',
        label: 'X (Twitter) card tag',
        found: shown(x?.twitterCard ?? null, 'Set', 'Missing'),
        benchmark: 'Set',
        source: B.lighthouseSeo.source,
        score: yes(x?.twitterCard ?? null),
      },
      {
        key: 'favicon',
        label: 'Favicon (shown beside Google results)',
        found: shown(x?.favicon ?? null, 'Set', 'Missing'),
        benchmark: 'Set',
        source: B.lighthouseSeo.source,
        score: yes(x?.favicon ?? null),
      },
    ],
    content: [
      {
        key: 'words',
        label: 'Words on the homepage',
        found: x?.wordCount == null ? 'Not measured' : n(x.wordCount),
        benchmark: `${n(B.wordCount.min)}+ (navigational page)`,
        source: B.wordCount.source,
        score: atLeast(x?.wordCount ?? null, B.wordCount.min, B.wordCount.min / 2),
      },
      {
        key: 'internal',
        label: 'Internal links',
        found: x?.internalLinks == null ? 'Not measured' : n(x.internalLinks),
        benchmark: `${B.internalLinks.min}–${B.internalLinks.max}`,
        source: B.internalLinks.source,
        score: atLeast(x?.internalLinks ?? null, B.internalLinks.min, 3),
      },
      {
        key: 'fresh',
        label: 'Latest blog post',
        found:
          blogDays !== null ? `${blogDays} days ago` : d.freshness.blogUrl ? 'No dated posts' : s.title === null ? 'Not measured' : 'No blog',
        benchmark: `Within ${B.refreshDays.target} days`,
        source: B.refreshDays.source,
        score:
          blogDays !== null
            ? blogDays <= B.refreshDays.target
              ? 100
              : blogDays <= 365
                ? 50
                : 0
            : s.title === null
              ? null
              : 0,
      },
    ],
    experience: [
      {
        key: 'lcp',
        label: 'Largest Contentful Paint',
        found: lcp === null ? 'Not measured' : `${lcp.toFixed(1)} s`,
        benchmark: `≤ ${B.lcpSeconds.good} s`,
        source: B.lcpSeconds.source,
        score: zone(lcp, B.lcpSeconds.good, B.lcpSeconds.poor),
      },
      {
        key: 'inp',
        label: 'Interaction to Next Paint',
        found: d.pagespeed.inpMs === null ? 'Not measured' : `${Math.round(d.pagespeed.inpMs)} ms`,
        benchmark: `≤ ${B.inpMs.good} ms`,
        source: B.inpMs.source,
        score: zone(d.pagespeed.inpMs, B.inpMs.good, B.inpMs.poor),
      },
      {
        key: 'cls',
        label: 'Cumulative Layout Shift',
        found: d.pagespeed.cls === null ? 'Not measured' : d.pagespeed.cls.toFixed(2),
        benchmark: `≤ ${B.cls.good}`,
        source: B.cls.source,
        score: zone(d.pagespeed.cls, B.cls.good, B.cls.poor),
      },
      {
        key: 'ttfb',
        label: 'Time to First Byte',
        found: x?.ttfbMs == null ? 'Not measured' : `${Math.round(x.ttfbMs)} ms`,
        benchmark: `≤ ${n(B.ttfbMs.good)} ms`,
        source: B.ttfbMs.source,
        score: zone(x?.ttfbMs ?? null, B.ttfbMs.good, B.ttfbMs.poor),
      },
      {
        key: 'fcp',
        label: 'First Contentful Paint',
        found: x?.fcpMs == null ? 'Not measured' : `${(x.fcpMs / 1000).toFixed(1)} s`,
        benchmark: `≤ ${B.fcpSeconds.good} s`,
        source: B.fcpSeconds.source,
        score: zone(x?.fcpMs == null ? null : x.fcpMs / 1000, B.fcpSeconds.good, B.fcpSeconds.poor),
      },
    ],
  };

  const average = (list: SeoCheck[]) => {
    const known = list.map((c) => c.score).filter((v): v is 100 | 50 | 0 => v !== null);
    return known.length ? known.reduce<number>((a, b) => a + b, 0) / known.length : null;
  };
  const categories = (Object.keys(seoCategories) as SeoCategory[]).map((key) => ({
    key,
    label: seoCategories[key].label,
    weight: seoCategories[key].weight,
    score: average(checks[key]),
    checks: checks[key],
  }));
  const measured = categories.filter((c) => c.score !== null);
  const total = measured.reduce((a, c) => a + c.weight, 0);
  const score = total ? measured.reduce((a, c) => a + (c.score as number) * c.weight, 0) / total : null;
  const all = categories.flatMap((c) => c.checks);
  // Everything collected that has no pass/fail benchmark is still reported, as context.
  const info: { label: string; found: string }[] = [
    ...(x?.lighthouse.length
      ? [
          {
            label: 'Google Lighthouse SEO audits',
            found: `${x.lighthouse.length - failedLighthouse.length} of ${x.lighthouse.length} pass${failedLighthouse.length ? `; failing: ${failedLighthouse.map((a) => a.title).join('; ')}` : ''}`,
          },
        ]
      : []),
    ...(x?.externalLinks != null ? [{ label: 'Links to other websites', found: n(x.externalLinks) }] : []),
    ...(x?.hreflang != null
      ? [{ label: 'Language alternates (hreflang)', found: x.hreflang ? 'Set' : 'None (only needed for multi-language sites)' }]
      : []),
    ...(x?.schemaTypes.length ? [{ label: 'Schema types found', found: x.schemaTypes.join(', ') }] : []),
    ...(g?.peopleAlsoAsk.length ? [{ label: 'People also ask (brand search)', found: g.peopleAlsoAsk.join(' · ') }] : []),
    ...(g?.topResults.length
      ? [
          {
            label: 'Other sites ranking for the brand name',
            found:
              [...new Set(g.topResults.filter((r) => !r.own && !socialNetwork(r.url)).map((r) => hostOf(r.url)))]
                .slice(0, 5)
                .join(', ') || 'None',
          },
        ]
      : []),
  ];
  const rows = categories.flatMap((c) => c.checks.map((k) => ({ ...k, category: c.label, weight: c.weight })));
  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight;
  return {
    /** Every check sorted by status: what needs fixing first, then what is working. */
    groups: {
      fix: rows.filter((k) => k.score === 0).sort(byWeight),
      improve: rows.filter((k) => k.score === 50).sort(byWeight),
      good: rows.filter((k) => k.score === 100).sort(byWeight),
      unmeasured: rows.filter((k) => k.score === null),
      info,
    },
    score,
    categories: categories.map((c) => ({ ...c, effectiveWeight: c.score === null || !total ? 0 : (c.weight / total) * 100 })),
    passed: all.filter((c) => c.score === 100).length,
    partial: all.filter((c) => c.score === 50).length,
    failed: all.filter((c) => c.score === 0).length,
    unmeasured: all.filter((c) => c.score === null).length,
    failedLighthouse: failedLighthouse.map((a) => a.title),
    search: g,
  };
}
export type SeoAudit = ReturnType<typeof buildSeoAudit>;
