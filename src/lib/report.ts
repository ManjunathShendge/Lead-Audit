import { type Platform, type CollectorResult, platforms } from './collectors/types';
import { computeMetrics } from './metrics';
import { scoreOverall, scorePlatform, weighted, effectiveWeights } from './scoring';
import { defaults, placeholderBenchmark, type ScoreConfig, type Benchmark } from './scoring/config';
import { lowestGaps, serviceDefaults, type ServiceMap, type Gap } from './recommendations';
export type Presence = 'present' | 'absent' | 'unknown';
export type Handles = Record<Platform, { handle: string; presence: Presence }>;
export interface Snapshot {
  settings: ScoreConfig;
  benchmarks: Record<Platform, Benchmark>;
  services: ServiceMap;
}
export const defaultSnapshot: Snapshot = {
  settings: defaults,
  benchmarks: Object.fromEntries(platforms.map((p) => [p, placeholderBenchmark])) as Record<
    Platform,
    Benchmark
  >,
  services: serviceDefaults,
};
export function buildReport(
  results: Partial<Record<Platform, CollectorResult>>,
  handles: Handles,
  industry: keyof ScoreConfig['industries'],
  asOf: Date,
  snapshot: Snapshot = defaultSnapshot,
) {
  const { settings: config, benchmarks, services } = snapshot;
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
    const metrics = computeMetrics(effective, asOf);
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
              ? `${metrics.lowerBound ? '≥ ' : ''}${metrics.count} posts / 30 days; ${metrics.longestGap?.toFixed(1) ?? 'unknown'}-day observed gap`
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
  const overall = scoreOverall({ website: null, social, gbp: null }, config);
  const knownCosts = Object.values(results).map((r) => r.costUsd);
  const costUsd =
    knownCosts.length && knownCosts.every((c) => c !== null)
      ? knownCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0)
      : null;
  return {
    asOf: asOf.toISOString(),
    cards,
    social,
    overall,
    platformWeights: effectiveWeights(values, weights),
    gaps: lowestGaps(gaps),
    costUsd,
    config,
    industry,
  };
}
export type Report = ReturnType<typeof buildReport>;
