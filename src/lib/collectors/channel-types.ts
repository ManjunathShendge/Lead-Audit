import { z } from 'zod';

/**
 * Website and Google Business Profile are channels, not social platforms: they have no posts or
 * followers, so they carry their own normalized contracts and feed the section 7.2 / 7.3 scoring.
 */
export const channels = ['website', 'gbp'] as const;
export const channelSchema = z.enum(channels);
export type Channel = z.infer<typeof channelSchema>;
export const channelNames: Record<Channel, string> = {
  website: 'Website',
  gbp: 'Google Business Profile',
};

const n = z.number().finite().nullable();
const flag = z.boolean().nullable();
const base = {
  status: z.enum(['ok', 'partial', 'not_found', 'failed']),
  raw: z.unknown(),
  costUsd: z.number().finite().nonnegative().nullable(),
  warnings: z.array(z.string()),
  fetchedAt: z.iso.datetime(),
};

export const searchVisibilitySchema = z.object({
  /** Pages Google reports for a site: query; a lower bound when Google gives no total. */
  indexedPages: n,
  indexedLowerBound: z.boolean(),
  brandQuery: z.string(),
  /** Organic position of the brand's own site when its name is searched; null = not on page one. */
  brandPosition: n,
  brandSitelinks: flag,
  topResults: z
    .array(z.object({ position: z.number(), title: z.string(), url: z.string(), own: z.boolean() }))
    .max(10),
  peopleAlsoAsk: z.array(z.string()).max(8),
});
export type SearchVisibility = z.infer<typeof searchVisibilitySchema>;

export const seoAuditSchema = z.object({
  /** HTTP status of the homepage as served. */
  statusCode: n,
  titleLength: n,
  descriptionLength: n,
  canonical: flag,
  viewport: flag,
  lang: flag,
  /** og:title and og:image both present. */
  openGraph: flag,
  twitterCard: flag,
  /** A robots meta tag that keeps the homepage out of search results. */
  noindex: flag,
  hreflang: flag,
  favicon: flag,
  h2Count: n,
  wordCount: n,
  internalLinks: n,
  externalLinks: n,
  schemaTypes: z.array(z.string()),
  /** Time to First Byte and First Contentful Paint: field data when Google has it, else lab. */
  ttfbMs: n,
  fcpMs: n,
  /** Lighthouse SEO category audits from the first successful PageSpeed run. */
  lighthouse: z.array(z.object({ id: z.string(), title: z.string(), passed: z.boolean() })),
  /** Live Google results via apify/google-search-scraper; null when not configured or it failed. */
  search: searchVisibilitySchema.nullable().optional(),
});
export type SeoAuditDetail = z.infer<typeof seoAuditSchema>;

export const websiteDetailSchema = z.object({
  url: z.string().nullable(),
  pagespeed: z.object({
    /** Mobile Lighthouse category scores, 0–100, one entry per run. */
    runs: z.array(z.object({ performance: n, seo: n })),
    lcpMs: n,
    inpMs: n,
    cls: n,
    /** url = field data for the page, origin = field data for the whole origin, lab = Lighthouse. */
    vitalsSource: z.enum(['url', 'origin', 'lab']).nullable(),
  }),
  seo: z.object({
    title: flag,
    metaDescription: flag,
    singleH1: flag,
    h1Count: n,
    imageAltRatio: n,
    imageCount: n,
    schema: flag,
    sitemap: flag,
    robots: flag,
    https: flag,
  }),
  tracking: z.object({ analytics: flag, meta: flag, ads: flag, linkedin: flag }),
  conversion: z.object({ form: flag, cta: flag, whatsapp: flag, phone: flag }),
  ctaText: z.string().nullable(),
  /** Homepage words, kept for audience-alignment analysis. Absent on older audits. */
  messaging: z
    .object({
      title: z.string().nullable(),
      description: z.string().nullable(),
      headings: z.array(z.string()),
      text: z.string().nullable(),
    })
    .nullable()
    .optional(),
  freshness: z.object({
    latestPost: z.iso.datetime().nullable(),
    blogUrl: z.string().nullable(),
    copyrightYear: n,
  }),
  /** Signals for the SEO audit beyond the basic checklist. Absent on audits run before it existed. */
  seoAudit: seoAuditSchema.nullable().optional(),
});
export const websiteResultSchema = z.object({
  kind: z.literal('website'),
  ...base,
  detail: websiteDetailSchema,
});

export const gbpDetailSchema = z.object({
  name: z.string().nullable(),
  url: z.string().nullable(),
  address: z.string().nullable(),
  category: z.string().nullable(),
  rating: n,
  reviewCount: n,
  distribution: z
    .object({ one: z.number(), two: z.number(), three: z.number(), four: z.number(), five: z.number() })
    .nullable(),
  hasHours: flag,
  hasPhone: flag,
  hasWebsite: flag,
  photoCount: n,
  closed: flag,
  /** Newest first. Reviewer identity is never collected. */
  latestReviews: z.array(
    z.object({ stars: n, publishedAt: z.iso.datetime().nullable(), ownerReplied: z.boolean() }),
  ),
});
export const gbpResultSchema = z.object({
  kind: z.literal('gbp'),
  ...base,
  detail: gbpDetailSchema.nullable(),
});

export type WebsiteDetail = z.infer<typeof websiteDetailSchema>;
export type WebsiteResult = z.infer<typeof websiteResultSchema>;
export type GbpDetail = z.infer<typeof gbpDetailSchema>;
export type GbpResult = z.infer<typeof gbpResultSchema>;
export type ChannelResult = WebsiteResult | GbpResult;
export const channelResultSchema = z.discriminatedUnion('kind', [websiteResultSchema, gbpResultSchema]);

export type ChannelPresence = 'present' | 'absent' | 'unknown';
/** What the team confirmed for each channel. The website URL itself lives on Audit.website. */
export const channelTargetsSchema = z.object({
  website: z.object({ audit: z.boolean() }),
  gbp: z.object({ query: z.string().max(300), presence: z.enum(['present', 'absent', 'unknown']) }),
});
export type ChannelTargets = z.infer<typeof channelTargetsSchema>;
export const emptyChannelTargets = (): ChannelTargets => ({
  website: { audit: true },
  gbp: { query: '', presence: 'unknown' },
});

export function failedChannel(kind: Channel, reason: string, asOf: Date): ChannelResult {
  const common = {
    status: 'failed' as const,
    raw: null,
    costUsd: null,
    warnings: [reason],
    fetchedAt: asOf.toISOString(),
  };
  return kind === 'gbp' ? { kind, ...common, detail: null } : { kind, ...common, detail: emptyWebsite(null) };
}

export function emptyWebsite(url: string | null): WebsiteDetail {
  return {
    url,
    pagespeed: { runs: [], lcpMs: null, inpMs: null, cls: null, vitalsSource: null },
    seo: {
      title: null,
      metaDescription: null,
      singleH1: null,
      h1Count: null,
      imageAltRatio: null,
      imageCount: null,
      schema: null,
      sitemap: null,
      robots: null,
      https: null,
    },
    tracking: { analytics: null, meta: null, ads: null, linkedin: null },
    conversion: { form: null, cta: null, whatsapp: null, phone: null },
    ctaText: null,
    freshness: { latestPost: null, blogUrl: null, copyrightYear: null },
  };
}

/** Accepts a Google Maps place URL or a free-text search such as "Brand name, City". */
export function normalizeGbpQuery(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return '';
  if (value.length > 300) throw new Error('Keep the Google Business Profile search under 300 characters.');
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const maps =
      ((/^google\.[a-z.]+$/.test(host) || /^maps\.google\.[a-z.]+$/.test(host)) &&
        (url.pathname.startsWith('/maps') || host.startsWith('maps.'))) ||
      host === 'maps.app.goo.gl' ||
      (host === 'goo.gl' && url.pathname.startsWith('/maps')) ||
      host === 'g.page';
    if (!maps || url.username || url.password || url.protocol !== 'https:')
      throw new Error('Use a Google Maps link or a search such as "Brand name, City".');
    return url.href;
  }
  if (/[\u0000-\u001f<>]/.test(value)) throw new Error('Remove special characters from the search.');
  return value;
}
