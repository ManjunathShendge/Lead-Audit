import { resolveWindow, type Period } from './period';
import { type Platform, type CollectorResult, platforms } from './collectors/types';
import { computeMetrics } from './metrics';
import {
  scoreOverall,
  scorePlatform,
  weighted,
  effectiveWeights,
  scoreWebsite,
  scoreGbp,
  websiteInput,
  gbpInput,
} from './scoring';
import type { ChannelPresence, GbpResult, WebsiteResult } from './collectors/channel-types';
import { defaults, placeholderBenchmark, type ScoreConfig, type Benchmark } from './scoring/config';
import { lowestGaps, sortGaps, serviceDefaults, type ServiceMap, type Gap } from './recommendations';
import { buildSeoAudit } from './seo';
export type Presence = 'present' | 'absent' | 'unknown';
export type Handles = Record<Platform, { handle: string; presence: Presence }>;
export interface Snapshot {
  settings: ScoreConfig;
  benchmarks: Record<Platform, Benchmark>;
  /** Review-count band for Google Business Profile; older snapshots predate it. */
  gbpBenchmark?: Benchmark;
  services: ServiceMap;
}
export interface ChannelInputs {
  /** null when no website was given or the channel is switched off (weight 0). */
  website: WebsiteResult | null;
  gbp: GbpResult | null;
  gbpPresence: ChannelPresence;
}
export const noChannels: ChannelInputs = { website: null, gbp: null, gbpPresence: 'unknown' };
const usable = (status: string) => status === 'ok' || status === 'partial';
const yesNo = (v: boolean | null) => (v === null ? '?' : v ? 'yes' : 'no');
export const defaultSnapshot: Snapshot = {
  settings: defaults,
  benchmarks: Object.fromEntries(platforms.map((p) => [p, placeholderBenchmark])) as Record<
    Platform,
    Benchmark
  >,
  gbpBenchmark: placeholderBenchmark,
  services: serviceDefaults,
};
export function buildReport(
  results: Partial<Record<Platform, CollectorResult>>,
  handles: Handles,
  industry: keyof ScoreConfig['industries'],
  asOf: Date,
  snapshot: Snapshot = defaultSnapshot,
  channelInputs: ChannelInputs = noChannels,
  period: Period | null = null,
) {
  const window = period ? resolveWindow(period, asOf) : undefined;
  const { settings: config, benchmarks, services } = snapshot;
  const gbpBenchmark = snapshot.gbpBenchmark ?? placeholderBenchmark;
  const gaps: Gap[] = [];
  const cards = platforms.map((platform) => {
    const result = results[platform];
    const enabled = config.enabled.includes(platform);
    const relevant = config.industries[industry].relevant.includes(platform);
    const absent = enabled && handles[platform].presence === 'absent' && relevant;
    const fallback: CollectorResult = {
      status: 'failed',
      profile: null,
      posts: [],
      raw: null,
      costUsd: null,
      warnings: [
        !enabled
          ? 'Platform disabled in this audit configuration.'
          : handles[platform].presence === 'absent'
            ? 'Team confirmed no account.'
            : 'Account not confirmed; not measured.',
      ],
      fetchedAt: asOf.toISOString(),
      sampleComplete: false,
      subscriberHidden: false,
    };
    const effective = enabled && result ? result : fallback;
    const metrics = computeMetrics(effective, asOf, window);
    const scored = scorePlatform(metrics, effective.profile?.followers ?? null, benchmarks[platform], config);
    const addGap = (component: string, score: number, measured: string) => {
      const key = platform === 'linkedin' && industry === 'B2B' ? 'linkedin' : component;
      const mapping = services[key] ?? serviceDefaults.missing;
      gaps.push({ platform, component, score, measured, ...mapping });
    };
    if (absent) addGap('missing', 0, 'No account — confirmed by team');
    if (enabled && !absent)
      for (const [key, value] of Object.entries(scored.components))
        if (value !== null && value < config.thresholds.gapScore) {
          const measured =
            key === 'activity'
              ? `${metrics.lowerBound ? '≥ ' : ''}${metrics.count} posts / 30 days${window ? ` (average over ${window.label})` : ''}; ${metrics.longestGap?.toFixed(1) ?? 'unknown'}-day observed gap`
              : key === 'engagement'
                ? `${metrics.engagement?.toFixed(2)}% engagement`
                : key === 'audience'
                  ? `${effective.profile?.followers} followers`
                  : `${metrics.completeness?.toFixed(0)}% of measured profile checks`;
          addGap(key, value, measured);
        }
    if (enabled && metrics.mix?.video === 0) addGap('video', 0, '0 video posts in the fetched sample');
    return {
      platform,
      handle: handles[platform].handle,
      status: !enabled
        ? 'disabled'
        : handles[platform].presence === 'absent'
          ? 'absent'
          : (result?.status ?? 'unknown'),
      profile: effective.profile,
      subscriberHidden: effective.subscriberHidden,
      metrics,
      ...scored,
      score: absent ? 0 : scored.score,
      benchmark: benchmarks[platform],
      fetchedAt: effective.fetchedAt,
      costUsd: result?.costUsd ?? null,
    };
  });
  const values = Object.fromEntries(cards.map((c) => [c.platform, c.score]));
  const weights = config.industries[industry].weights;
  const social = weighted(values, weights);

  const website =
    channelInputs.website && config.channels.website > 0 ? buildWebsite(channelInputs.website) : null;
  function buildWebsite(r: WebsiteResult) {
    const input = websiteInput(r.detail, asOf, config);
    const scored = usable(r.status) ? scoreWebsite(input, config) : null;
    const criteria = scored?.criteria ?? {
      performance: null,
      seo: null,
      tracking: null,
      conversion: null,
      freshness: null,
    };
    const d = r.detail;
    const measured: Record<string, string> = {
      performance: `PageSpeed ${scored?.parts.performance.pagespeed?.toFixed(0) ?? 'n/a'}; LCP ${d.pagespeed.lcpMs === null ? 'n/a' : (d.pagespeed.lcpMs / 1000).toFixed(1) + ' s'}, CLS ${d.pagespeed.cls?.toFixed(2) ?? 'n/a'}`,
      seo: `${input.seoChecklist.filter(Boolean).length} of ${input.seoChecklist.filter((v) => v !== null).length} on-page checks pass`,
      tracking: `GA4/GTM ${yesNo(d.tracking.analytics)} · Meta ${yesNo(d.tracking.meta)} · Ads ${yesNo(d.tracking.ads)} · LinkedIn ${yesNo(d.tracking.linkedin)}`,
      conversion: `Form ${yesNo(d.conversion.form)} · CTA ${yesNo(d.conversion.cta)} · WhatsApp ${yesNo(d.conversion.whatsapp)} · Call ${yesNo(d.conversion.phone)}`,
      freshness: d.freshness.latestPost
        ? `Latest post ${Math.round((asOf.getTime() - Date.parse(d.freshness.latestPost)) / 86400000)} days ago`
        : `© ${d.freshness.copyrightYear ?? 'not found'}; no dated blog posts`,
    };
    for (const [key, value] of Object.entries(criteria))
      if (
        value !== null &&
        value < config.thresholds.gapScore &&
        (config.website[key as keyof typeof config.website] ?? 0) > 0
      )
        gaps.push({
          platform: 'website',
          component: key,
          score: value,
          measured: measured[key],
          ...(services[key] ?? serviceDefaults.missing),
        });
    return {
      status: r.status,
      detail: d,
      criteria,
      parts: scored?.parts ?? {
        performance: { pagespeed: null, cwv: null },
        seo: { pagespeed: null, checklist: null },
      },
      weights: scored?.weights ?? effectiveWeights(criteria, config.website),
      score: scored?.score ?? null,
      seoChecklist: input.seoChecklist,
      warnings: r.warnings,
      fetchedAt: r.fetchedAt,
      costUsd: r.costUsd,
    };
  }

  // The SEO audit reads the same crawl, so it exists whenever the website was crawled or tested.
  const seo = website && website.status !== 'failed' ? buildSeoAudit(website.detail, asOf, config.thresholds.altRatio) : null;
  if (seo) {
    const seoGaps = seo.categories.filter((c) => c.score !== null && c.score < config.thresholds.gapScore);
    if (seoGaps.length) {
      // The category gaps say the same thing in more detail than the website's single SEO line.
      const i = gaps.findIndex((g) => g.platform === 'website' && g.component === 'seo');
      if (i >= 0) gaps.splice(i, 1);
    }
    for (const c of seoGaps) {
      const misses = c.checks
        .filter((k) => k.score === 0)
        .map((k) => (/^[A-Z][A-Z]/.test(k.label) ? k.label : k.label[0].toLowerCase() + k.label.slice(1)));
      gaps.push({
        platform: 'seo',
        component: c.key,
        score: c.score as number,
        measured: misses.length ? `Misses: ${misses.slice(0, 3).join(', ')}` : `${c.label} partly meets the benchmarks`,
        ...(services.seo ?? serviceDefaults.seo),
      });
    }
  }

  const gbpAbsent = channelInputs.gbpPresence === 'absent' && config.channels.gbp > 0;
  const gbpMatters = config.gbpRelevant.includes(industry);
  const gbp =
    config.channels.gbp <= 0
      ? null
      : channelInputs.gbp
        ? buildGbp(channelInputs.gbp)
        : gbpAbsent
          ? {
              status: 'absent' as const,
              detail: null,
              criteria: { rating: null, reviews: null, replies: null, completeness: null },
              weights: { rating: 0, reviews: 0, replies: 0, completeness: 0 },
              score: gbpMatters ? 0 : null,
              benchmark: gbpBenchmark,
              warnings: [
                gbpMatters
                  ? 'Team confirmed no Google Business Profile; scored 0 for this industry.'
                  : 'Team confirmed no Google Business Profile; not relevant for this industry, so excluded.',
              ],
              fetchedAt: asOf.toISOString(),
              costUsd: null,
            }
          : null;
  if (gbpAbsent && gbpMatters && !channelInputs.gbp)
    gaps.push({
      platform: 'gbp',
      component: 'missing',
      score: 0,
      measured: 'No Google Business Profile — confirmed by team',
      ...(services.gbp ?? serviceDefaults.gbp),
    });
  function buildGbp(r: GbpResult) {
    const scored = usable(r.status) && r.detail ? scoreGbp(gbpInput(r.detail), gbpBenchmark, config) : null;
    const criteria = scored?.criteria ?? { rating: null, reviews: null, replies: null, completeness: null };
    const d = r.detail;
    const replies = d?.latestReviews.filter((x) => x.ownerReplied).length ?? 0;
    const measured: Record<string, string> = {
      rating: `${d?.rating?.toFixed(1) ?? 'n/a'} ★ average rating`,
      reviews: `${d?.reviewCount ?? 'n/a'} reviews (target band ${gbpBenchmark.reviewLow}–${gbpBenchmark.reviewHigh})`,
      replies: `${replies} of ${d?.latestReviews.length ?? 0} latest reviews answered`,
      completeness: 'Profile is missing basics (category, hours, phone, website or photos)',
    };
    for (const [key, value] of Object.entries(criteria))
      if (value !== null && value < config.thresholds.gapScore)
        gaps.push({
          platform: 'gbp',
          component: key,
          score: value,
          measured: measured[key],
          ...(services.gbp ?? serviceDefaults.gbp),
        });
    return {
      status: r.status,
      detail: d,
      criteria,
      weights: scored?.weights ?? effectiveWeights(criteria, config.gbp),
      score: scored?.score ?? null,
      benchmark: gbpBenchmark,
      warnings: r.warnings,
      fetchedAt: r.fetchedAt,
      costUsd: r.costUsd,
    };
  }

  const channelScores = { website: website?.score ?? null, social, gbp: gbp?.score ?? null };
  const overall = scoreOverall(channelScores, config);
  const knownCosts = [
    ...Object.values(results).map((r) => r.costUsd),
    ...(channelInputs.website ? [channelInputs.website.costUsd] : []),
    ...(channelInputs.gbp ? [channelInputs.gbp.costUsd] : []),
  ];
  const costUsd =
    knownCosts.length && knownCosts.every((c) => c !== null)
      ? knownCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0)
      : null;
  return {
    asOf: asOf.toISOString(),
    /** Absent on audits run before periods existed; null = the default recent window. */
    period: window
      ? { ...period!, label: window.label, start: window.start.toISOString(), end: window.end.toISOString() }
      : null,
    cards,
    social,
    overall,
    channelScores,
    website,
    /** Homepage SEO audit; absent on reports built before it existed. Not part of the headline score. */
    seo,
    gbp,
    platformWeights: effectiveWeights(values, weights),
    gaps: lowestGaps(gaps),
    /** Every gap, not just the top six: single-area exports list all of theirs. */
    allGaps: sortGaps(gaps),
    costUsd,
    config,
    industry,
  };
}
export type Report = ReturnType<typeof buildReport>;
