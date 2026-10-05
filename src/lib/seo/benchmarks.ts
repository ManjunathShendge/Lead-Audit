/**
 * SEO benchmarks (researched October 2026). Each value names where it came from so the report can
 * cite it next to the check.
 *
 * - ClickRank, "SEO Benchmarks" (clickrank.ai/seo-benchmarks): Core Web Vitals, TTFB and FCP zones,
 *   alt-text coverage, contextual internal links, word counts by intent, content refresh cadence,
 *   CTR by position, organic conversion, bounce and referring-domain figures.
 * - Semrush, "SEO Benchmarks" and "SEO KPIs" (semrush.com/blog/benchmark-seo, /seo-kpis): which KPIs
 *   to track. Semrush deliberately gives no numeric targets and recommends benchmarking against your
 *   own history and competitors, so its KPIs appear as the off-site reference list.
 * - Title and meta description lengths follow the length Google typically shows before truncating.
 */
export const CLICKRANK = 'ClickRank SEO Benchmarks';
export const SEMRUSH = 'Semrush SEO KPIs';
export const GOOGLE = 'Google Search guidance';

export const seoBenchmarks = {
  titleLength: { min: 30, max: 60, source: GOOGLE },
  descriptionLength: { min: 70, max: 160, source: GOOGLE },
  /** ClickRank: top-ranking pages have 94% of images optimised with alt text. */
  altTextPercent: { target: 94, source: CLICKRANK },
  /** ClickRank: 8–15 contextual internal links per page. */
  internalLinks: { min: 8, max: 15, source: CLICKRANK },
  /** ClickRank: navigational pages 300–600 words, transactional 800–1,200. A homepage is navigational. */
  wordCount: { min: 300, source: CLICKRANK },
  /** ClickRank: blog posts refreshed every 90–120 days. */
  refreshDays: { target: 120, source: CLICKRANK },
  /** ClickRank Core Web Vitals and loading zones: good / needs improvement / poor. */
  lcpSeconds: { good: 2.5, poor: 4, source: CLICKRANK },
  inpMs: { good: 200, poor: 500, source: CLICKRANK },
  cls: { good: 0.1, poor: 0.25, source: CLICKRANK },
  ttfbMs: { good: 800, poor: 1800, source: CLICKRANK },
  fcpSeconds: { good: 1.8, poor: 3, source: CLICKRANK },
  /** ClickRank CTR by organic position: #1 27.6%, #2 15.8%, #3 11.0%; sitelinks add 15–20% at #1. */
  ctrByPosition: { first: 27.6, second: 15.8, third: 11, source: CLICKRANK },
  /**
   * Indexed pages: no published benchmark exists, because the right number depends on site size.
   * Ten pages is the floor at which a homepage, service/product pages and a few posts are all findable.
   */
  indexedPages: { good: 10, source: 'Tier2 guidance' },
  /**
   * Brand-name search: the brand's own social profiles on page one crowd out third-party pages.
   * No published benchmark; two profiles is the floor at which the brand controls most of page one.
   */
  brandProfiles: { good: 2, source: 'Tier2 guidance' },
  /** Lighthouse SEO category: 90+ is Google's "good" band. */
  lighthouseSeo: { good: 90, poor: 50, source: GOOGLE },
};

/**
 * Off-site KPIs Semrush recommends tracking. They need Google Search Console, analytics or a
 * Semrush/Ahrefs subscription for the brand's own domain, so the audit lists them with a reference
 * figure rather than scoring them.
 */
export const offsiteKpis = [
  {
    kpi: 'Organic traffic share',
    reference: '53% of trackable traffic across industries; 35–45% for small local businesses',
    needs: 'Google Analytics',
  },
  {
    kpi: 'Organic click-through rate',
    reference: 'Position 1: 27.6% · position 3: 11.0% · position 10: about 3%',
    needs: 'Google Search Console',
  },
  { kpi: 'Keyword rankings and visibility', reference: 'Benchmark against your own history and competitors', needs: 'Semrush or Search Console' },
  {
    kpi: 'Referring domains',
    reference: 'Low-difficulty keywords: 8–25 · competitive keywords: 220–500',
    needs: 'Semrush or Ahrefs',
  },
  { kpi: 'Bounce rate', reference: 'Business services ~40% · e-commerce ~45% · B2B SaaS ~52%', needs: 'Google Analytics' },
  {
    kpi: 'Organic conversion rate',
    reference: '2.7–3.0% overall · local services 4–6% · B2B lead generation 2.5–5%',
    needs: 'Google Analytics',
  },
  { kpi: 'AI search visibility and citations', reference: 'Track mentions in AI Overviews and assistants', needs: 'Semrush AI toolkit' },
] as const;
