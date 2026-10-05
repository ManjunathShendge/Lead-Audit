import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CollectorUnavailableError, currentMode, type Mode } from './index';
import {
  channelResultSchema,
  gbpDetailSchema,
  seoAuditSchema,
  websiteDetailSchema,
  type Channel,
  type ChannelResult,
} from './channel-types';
import { collectWebsite } from './website';
import { collectGbp } from './gbp';

/** Website needs no paid key (PageSpeed degrades to "Not measured" without one); GBP needs Apify. */
export function channelAvailability(): Record<Channel, { ready: boolean; reason: string | null }> {
  const gbp = !!process.env.APIFY_TOKEN && !!process.env.APIFY_ACTOR_GBP;
  return {
    website: { ready: true, reason: null },
    gbp: {
      ready: gbp,
      reason: gbp ? null : 'Google Business Profile needs APIFY_TOKEN and APIFY_ACTOR_GBP.',
    },
  };
}

const DAY = 86400000;
const mockWebsite = z.object({
  synthetic: z.literal(true),
  fixtureVersion: z.literal(1),
  status: z.enum(['ok', 'partial']),
  pagespeed: websiteDetailSchema.shape.pagespeed,
  seo: websiteDetailSchema.shape.seo,
  tracking: websiteDetailSchema.shape.tracking,
  conversion: websiteDetailSchema.shape.conversion,
  ctaText: z.string().nullable(),
  seoAudit: seoAuditSchema.optional(),
  freshness: z.object({
    latestPostDaysAgo: z.number().nullable(),
    blogPath: z.string().nullable(),
    copyrightYearsAgo: z.number().nullable(),
  }),
  warnings: z.array(z.string()),
});
const mockGbp = z.object({
  synthetic: z.literal(true),
  fixtureVersion: z.literal(1),
  status: z.enum(['ok', 'partial']),
  place: gbpDetailSchema.omit({ name: true, url: true, address: true, latestReviews: true }),
  reviews: z.array(z.object({ stars: z.number(), daysAgo: z.number(), ownerReplied: z.boolean() })),
});

export async function mockChannel(
  kind: Channel,
  target: string,
  tier: 'strong' | 'average' | 'weak',
  asOf: Date,
  /** Shown as the searched brand name in the synthetic Google results. */
  brand?: string,
): Promise<ChannelResult> {
  const file = `fixtures/${kind}/raw-mock-${tier}.json`;
  const json: unknown = JSON.parse(await readFile(path.join(process.cwd(), file), 'utf8'));
  const source = { synthetic: true, fixture: file, fixtureVersion: 1 };
  const common = { raw: { source, fixture: json }, costUsd: 0, fetchedAt: asOf.toISOString() };
  const synthetic = 'Synthetic fixture data — not collected from a live website or listing.';
  if (kind === 'website') {
    const f = mockWebsite.parse(json);
    const origin = new URL(target).origin;
    return channelResultSchema.parse({
      kind,
      status: f.status,
      detail: {
        url: `${origin}/`,
        pagespeed: f.pagespeed,
        seo: f.seo,
        tracking: f.tracking,
        conversion: f.conversion,
        ctaText: f.ctaText,
        freshness: {
          latestPost:
            f.freshness.latestPostDaysAgo === null
              ? null
              : new Date(asOf.getTime() - f.freshness.latestPostDaysAgo * DAY).toISOString(),
          blogUrl: f.freshness.blogPath && `${origin}${f.freshness.blogPath}`,
          copyrightYear:
            f.freshness.copyrightYearsAgo === null
              ? null
              : asOf.getUTCFullYear() - f.freshness.copyrightYearsAgo,
        },
        seoAudit: f.seoAudit
          ? { ...f.seoAudit, search: f.seoAudit.search && { ...f.seoAudit.search, brandQuery: brand || f.seoAudit.search.brandQuery } }
          : null,
      },
      warnings: [synthetic, ...f.warnings],
      ...common,
    });
  }
  const f = mockGbp.parse(json);
  return channelResultSchema.parse({
    kind,
    status: f.status,
    detail: {
      ...f.place,
      name: target.split(',')[0].trim() || 'Sample business',
      url: null,
      address: null,
      latestReviews: f.reviews.map((r) => ({
        stars: r.stars,
        publishedAt: new Date(asOf.getTime() - r.daysAgo * DAY).toISOString(),
        ownerReplied: r.ownerReplied,
      })),
    },
    warnings: [synthetic],
    ...common,
  });
}

export async function collectChannel(
  kind: Channel,
  target: string,
  mode: Mode,
  tier: 'strong' | 'average' | 'weak',
  asOf: Date,
  signal?: AbortSignal,
  /** The brand name, searched on Google for the SEO audit's visibility checks. */
  brand = '',
): Promise<ChannelResult> {
  if (mode !== currentMode())
    throw new CollectorUnavailableError(
      `Collector refused: this audit is a ${mode} audit but the server is in ${currentMode()} mode.`,
    );
  if (mode === 'mock') return mockChannel(kind, target, tier, asOf, brand);
  const availability = channelAvailability()[kind];
  if (!availability.ready)
    throw new CollectorUnavailableError(`Collector for ${kind} is not configured. ${availability.reason}`);
  return kind === 'website' ? collectWebsite(target, asOf, signal, brand) : collectGbp(target, asOf, signal);
}
