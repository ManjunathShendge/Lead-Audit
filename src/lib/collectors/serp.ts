import { runActor } from './apify';
import { searchVisibilitySchema, type SearchVisibility } from './channel-types';

/**
 * Google search visibility via Apify `apify/google-search-scraper`: one `site:` query for indexed
 * pages and one brand-name query for where the brand's own site ranks. Two SERP pages per audit.
 * Field names follow the actor's documented output (searchQuery.term, resultsTotal, organicResults,
 * peopleAlsoAsk); capture a real response with scripts/capture-fixture.ts before trusting them.
 */
export const serpConfigured = () => !!process.env.APIFY_TOKEN && !!process.env.APIFY_ACTOR_SERP;

export const bareHost = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

export function serpQueries(website: string, brand: string) {
  return { site: `site:${bareHost(website)}`, brand: brand.trim() };
}

export function serpInput(website: string, brand: string) {
  const q = serpQueries(website, brand);
  const country = process.env.GBP_COUNTRY_CODE?.trim().toLowerCase();
  return {
    queries: [q.site, q.brand].filter(Boolean).join('\n'),
    resultsPerPage: 10,
    maxPagesPerQuery: 1,
    languageCode: 'en',
    ...(country ? { countryCode: country } : {}),
    mobileResults: false,
    includeUnfilteredResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const num = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

export function normalizeSerp(items: Record<string, unknown>[], website: string, brand: string): SearchVisibility | null {
  const host = bareHost(website);
  const q = serpQueries(website, brand);
  const term = (i: Record<string, unknown>) =>
    str((i.searchQuery as Record<string, unknown> | undefined)?.term).trim().toLowerCase();
  const site = items.find((i) => term(i) === q.site.toLowerCase());
  const brandPage = items.find((i) => term(i) === q.brand.toLowerCase());
  if (!site && !brandPage) return null;
  const own = (url: string) => {
    const h = bareHost(url);
    return !!host && (h === host || h.endsWith(`.${host}`));
  };
  const siteOrganic = list(site?.organicResults);
  const total = num(site?.resultsTotal);
  const organic = list(brandPage?.organicResults).map((r, i) => ({
    position: num(r.position) ?? i + 1,
    title: str(r.title).slice(0, 160),
    url: str(r.url),
    own: own(str(r.url)),
    sitelinks: list(r.siteLinks).length > 0,
  }));
  const first = organic.find((r) => r.own);
  return searchVisibilitySchema.parse({
    indexedPages: site ? (total ?? siteOrganic.length) : null,
    indexedLowerBound: !!site && total === null,
    brandQuery: q.brand,
    brandPosition: brandPage ? (first?.position ?? null) : null,
    brandSitelinks: brandPage ? (first ? first.sitelinks : false) : null,
    topResults: organic.slice(0, 10).map((r) => ({ position: r.position, title: r.title, url: r.url, own: r.own })),
    peopleAlsoAsk: list(brandPage?.peopleAlsoAsk)
      .map((p) => str(p.question).slice(0, 200))
      .filter(Boolean)
      .slice(0, 8),
  });
}

export async function collectSerp(website: string, brand: string, signal?: AbortSignal) {
  const { items, costUsd } = await runActor(process.env.APIFY_ACTOR_SERP!, serpInput(website, brand), {
    waitSecs: 150,
    signal,
  });
  return { search: normalizeSerp(items, website, brand), raw: items, costUsd };
}
