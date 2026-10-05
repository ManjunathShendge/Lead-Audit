import type { Metrics } from '../metrics';
import { checklist } from '../metrics';
import { defaults, type Benchmark, type ScoreConfig } from './config';
import type { GbpDetail, WebsiteDetail } from '../collectors/channel-types';
export const clamp = (v: number) => Math.max(0, Math.min(100, v));
export function weighted(values: Record<string, number | null>, weights: Record<string, number>) {
  let sum = 0,
    total = 0;
  for (const [key, value] of Object.entries(values)) {
    const w = weights[key] ?? 0;
    if (value !== null && Number.isFinite(value) && w > 0) {
      sum += clamp(value) * w;
      total += w;
    }
  }
  return total ? sum / total : null;
}
export function effectiveWeights(values: Record<string, number | null>, weights: Record<string, number>) {
  const total = Object.keys(values).reduce(
    (sum, k) => sum + (values[k] !== null && Number.isFinite(values[k]) ? (weights[k] ?? 0) : 0),
    0,
  );
  return Object.fromEntries(
    Object.keys(values).map((k) => [k, values[k] === null || !total ? 0 : ((weights[k] ?? 0) / total) * 100]),
  );
}
export function linear(value: number | null, target: number) {
  return value === null || !Number.isFinite(value) || target <= 0 ? null : clamp((value / target) * 100);
}
export function logBand(value: number | null, low: number, high: number) {
  if (value === null || !Number.isFinite(value) || low <= 0 || high <= low) return null;
  if (value <= 0) return 0;
  return clamp(20 + (80 * Math.log(value / low)) / Math.log(high / low));
}
export function band(score: number | null, config = defaults) {
  return score === null
    ? 'Not measured'
    : score >= config.thresholds.strong
      ? 'Strong'
      : score >= config.thresholds.good
        ? 'Good'
        : score >= config.thresholds.needsWork
          ? 'Needs work'
          : 'Weak';
}
export function scorePlatform(
  metrics: Metrics,
  followers: number | null,
  benchmark: Benchmark,
  config: ScoreConfig = defaults,
) {
  const frequency = linear(metrics.count, benchmark.postsTarget);
  const activity =
    frequency === null
      ? null
      : Math.max(
          0,
          frequency -
            (metrics.longestGap !== null && metrics.longestGap > config.thresholds.gapDays
              ? config.thresholds.gapPenalty
              : 0),
        );
  const components = {
    activity,
    engagement: linear(metrics.engagement, benchmark.engagementTarget),
    audience: logBand(followers, benchmark.followerLow, benchmark.followerHigh),
    completeness: metrics.completeness,
  };
  return {
    components,
    weights: effectiveWeights(components, config.components),
    score: weighted(components, config.components),
  };
}
export function scoreOverall(
  channels: { website: number | null; social: number | null; gbp: number | null },
  config = defaults,
) {
  return {
    score: weighted(channels, config.channels),
    label:
      channels.website === null && channels.gbp === null ? 'Social Presence Score' : 'Digital Presence Score',
    weights: effectiveWeights(channels, config.channels),
  };
}
type Maybe = number | null;
export interface WebsiteInput {
  performanceRuns: Maybe[];
  lcp: Maybe;
  inp: Maybe;
  cls: Maybe;
  seoScore: Maybe;
  seoChecklist: (boolean | null)[];
  tracking: {
    analytics: boolean | null;
    meta: boolean | null;
    ads: boolean | null;
    linkedin: boolean | null;
  };
  conversion: { form: boolean | null; cta: boolean | null; whatsapp: boolean | null; phone: boolean | null };
  freshness: Maybe;
}
export function median(values: Maybe[]) {
  const v = values.filter((n): n is number => n !== null && Number.isFinite(n)).sort((a, b) => a - b);
  return v.length ? (v[Math.floor(v.length / 2)] + v[Math.ceil(v.length / 2) - 1]) / 2 : null;
}
const booleans = (v: Record<string, boolean | null>) =>
  Object.fromEntries(Object.entries(v).map(([k, n]) => [k, n === null ? null : n ? 100 : 0]));
export function scoreWebsite(input: WebsiteInput, config = defaults) {
  const t = config.thresholds;
  const cwv = checklist([
    input.lcp === null ? null : input.lcp <= t.lcp,
    input.inp === null ? null : input.inp <= t.inp,
    input.cls === null ? null : input.cls <= t.cls,
  ]);
  const parts = {
    performance: { pagespeed: median(input.performanceRuns.slice(0, 3)), cwv },
    seo: { pagespeed: input.seoScore, checklist: checklist(input.seoChecklist) },
  };
  const criteria = {
    performance: weighted(parts.performance, config.websiteParts.performance),
    seo: weighted(parts.seo, config.websiteParts.seo),
    tracking: weighted(booleans(input.tracking), config.websiteParts.tracking),
    conversion: weighted(booleans(input.conversion), config.websiteParts.conversion),
    freshness: input.freshness,
  };
  return {
    criteria,
    parts,
    weights: effectiveWeights(criteria, config.website),
    score: weighted(criteria, config.website),
  };
}
/**
 * Freshness (weight 0 by default): blog recency is 100 up to 30 days, falling linearly to 0 at a year;
 * the footer copyright year is 100 when current, 50 when last year, else 0. Known parts are averaged.
 */
export function freshnessScore(latestPost: string | null, copyrightYear: number | null, asOf: Date) {
  const days = latestPost === null ? null : (asOf.getTime() - Date.parse(latestPost)) / 86400000;
  const blog =
    days === null || !Number.isFinite(days) ? null : clamp(100 - ((Math.max(0, days) - 30) / 335) * 100);
  const year = asOf.getUTCFullYear();
  const copyright =
    copyrightYear === null ? null : copyrightYear >= year ? 100 : copyrightYear === year - 1 ? 50 : 0;
  const known = [blog, copyright].filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}
export function websiteInput(d: WebsiteDetail, asOf: Date, config = defaults): WebsiteInput {
  return {
    performanceRuns: d.pagespeed.runs.map((r) => r.performance),
    lcp: d.pagespeed.lcpMs === null ? null : d.pagespeed.lcpMs / 1000,
    inp: d.pagespeed.inpMs,
    cls: d.pagespeed.cls,
    seoScore: median(d.pagespeed.runs.map((r) => r.seo)),
    seoChecklist: [
      d.seo.title,
      d.seo.metaDescription,
      d.seo.singleH1,
      d.seo.imageAltRatio === null ? null : d.seo.imageAltRatio >= config.thresholds.altRatio,
      d.seo.schema,
      d.seo.sitemap,
      d.seo.robots,
      d.seo.https,
    ],
    tracking: d.tracking,
    conversion: d.conversion,
    freshness: freshnessScore(d.freshness.latestPost, d.freshness.copyrightYear, asOf),
  };
}
export function gbpInput(d: GbpDetail) {
  return {
    rating: d.rating,
    reviews: d.reviewCount,
    // With no reviews there is nothing to reply to, which is not the same as ignoring reviews.
    ownerReplies: d.reviewCount === 0 ? [] : d.latestReviews.map((r) => r.ownerReplied),
    completeness: [
      d.category === null ? null : !!d.category.trim(),
      d.hasHours,
      d.hasPhone,
      d.hasWebsite,
      d.photoCount === null ? null : d.photoCount > 0,
    ],
  };
}
export function scoreGbp(
  input: {
    rating: Maybe;
    reviews: Maybe;
    ownerReplies: (boolean | null)[];
    completeness: (boolean | null)[];
  },
  benchmark: Benchmark,
  config = defaults,
) {
  const criteria = {
    rating:
      input.rating === null
        ? null
        : clamp(
            ((input.rating - config.thresholds.ratingLow) /
              (config.thresholds.ratingHigh - config.thresholds.ratingLow)) *
              100,
          ),
    reviews: logBand(input.reviews, benchmark.reviewLow, benchmark.reviewHigh),
    replies: checklist(input.ownerReplies.slice(0, 10)),
    completeness: checklist(input.completeness),
  };
  return { criteria, weights: effectiveWeights(criteria, config.gbp), score: weighted(criteria, config.gbp) };
}
