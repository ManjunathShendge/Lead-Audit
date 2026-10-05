import { z } from 'zod';
import { platformSchema } from '../collectors/types';
const weight = z.number().finite().min(0).max(100);
const platformWeights = z.object({ instagram: weight, facebook: weight, linkedin: weight, youtube: weight });
const websitePartsDefaults = {
  performance: { pagespeed: 60, cwv: 40 },
  seo: { pagespeed: 50, checklist: 50 },
  tracking: { analytics: 40, meta: 30, ads: 15, linkedin: 15 },
  conversion: { form: 30, cta: 30, whatsapp: 20, phone: 20 },
};
export const configSchema = z.object({
  channels: z.object({ website: weight, social: weight, gbp: weight }),
  components: z.object({ activity: weight, engagement: weight, audience: weight, completeness: weight }),
  website: z.object({
    performance: weight,
    seo: weight,
    tracking: weight,
    conversion: weight,
    freshness: weight,
  }),
  websiteParts: z
    .object({
      performance: z.object({ pagespeed: weight, cwv: weight }),
      seo: z.object({ pagespeed: weight, checklist: weight }),
      tracking: z.object({ analytics: weight, meta: weight, ads: weight, linkedin: weight }),
      conversion: z.object({ form: weight, cta: weight, whatsapp: weight, phone: weight }),
    })
    .default(websitePartsDefaults),
  gbp: z.object({ rating: weight, reviews: weight, replies: weight, completeness: weight }),
  industries: z.object({
    General: z.object({ weights: platformWeights, relevant: z.array(platformSchema) }),
    B2B: z.object({ weights: platformWeights, relevant: z.array(platformSchema) }),
    D2C: z.object({ weights: platformWeights, relevant: z.array(platformSchema) }),
  }),
  enabled: z.array(platformSchema),
  /** Industries where a confirmed missing Google Business Profile scores 0 instead of being excluded. */
  gbpRelevant: z.array(z.enum(['General', 'B2B', 'D2C'])).default(['General', 'D2C']),
  thresholds: z.object({
    gapDays: z.number().positive(),
    gapPenalty: weight,
    gapScore: weight,
    ratingLow: z.number(),
    ratingHigh: z.number(),
    lcp: z.number().positive(),
    inp: z.number().positive(),
    cls: z.number().positive(),
    altRatio: z.number().min(0).max(1),
    strong: weight,
    good: weight,
    needsWork: weight,
  }),
});
export type ScoreConfig = z.infer<typeof configSchema>;
export const defaults: ScoreConfig = {
  websiteParts: websitePartsDefaults,
  channels: { website: 40, social: 40, gbp: 20 },
  components: { activity: 35, engagement: 35, audience: 15, completeness: 15 },
  website: { performance: 30, seo: 30, tracking: 20, conversion: 20, freshness: 0 },
  gbp: { rating: 40, reviews: 30, replies: 15, completeness: 15 },
  industries: {
    General: {
      weights: { instagram: 35, linkedin: 25, facebook: 20, youtube: 20 },
      relevant: ['instagram', 'facebook', 'linkedin', 'youtube'],
    },
    B2B: {
      weights: { instagram: 20, linkedin: 40, facebook: 15, youtube: 25 },
      relevant: ['linkedin', 'youtube'],
    },
    D2C: {
      weights: { instagram: 45, facebook: 25, youtube: 20, linkedin: 10 },
      relevant: ['instagram', 'facebook', 'youtube'],
    },
  },
  enabled: ['instagram', 'facebook', 'linkedin', 'youtube'],
  gbpRelevant: ['General', 'D2C'],
  thresholds: {
    gapDays: 21,
    gapPenalty: 20,
    gapScore: 50,
    ratingLow: 3,
    ratingHigh: 4.5,
    lcp: 2.5,
    inp: 200,
    cls: 0.1,
    altRatio: 0.9,
    strong: 80,
    good: 60,
    needsWork: 40,
  },
};
export const benchmarkSchema = z
  .object({
    postsTarget: z.number().positive(),
    engagementTarget: z.number().positive(),
    followerLow: z.number().positive(),
    followerHigh: z.number().positive(),
    reviewLow: z.number().positive(),
    reviewHigh: z.number().positive(),
  })
  .refine(
    (b) => b.followerHigh > b.followerLow && b.reviewHigh > b.reviewLow,
    'Band high must exceed band low',
  );
export type Benchmark = z.infer<typeof benchmarkSchema>;
export const placeholderBenchmark: Benchmark = {
  postsTarget: 12,
  engagementTarget: 3,
  followerLow: 1000,
  followerHigh: 50000,
  reviewLow: 10,
  reviewHigh: 500,
};
type Industry = keyof ScoreConfig['industries'];
type BenchmarkPlatform = z.infer<typeof platformSchema> | 'gbp';
/** Review band for Google Business Profile: 47% of consumers avoid businesses under 20 reviews (BrightLocal 2026). */
const reviews = { reviewLow: 5, reviewHigh: 200 };
const social = (postsTarget: number, engagementTarget: number, followerLow: number, followerHigh: number) => ({
  postsTarget,
  engagementTarget,
  followerLow,
  followerHigh,
  ...reviews,
});
/**
 * Researched benchmarks (Sep 2026), set near top-quartile performance for an SMB account, not the median.
 * Engagement is (likes + comments) / followers per post; sources that divide by reach or views were excluded.
 * Sources: Quid (Rival IQ) 2026 industry report, Socialinsider 2026, Social Status monthly benchmarks,
 * Metricool LinkedIn 2026 (derived), BrightLocal Local Consumer Review Survey 2026.
 * GBP rows only use the review band; social rows only use the post, engagement and follower fields.
 */
export const researchedBenchmarks: Record<Industry, Record<BenchmarkPlatform, Benchmark>> = {
  General: {
    instagram: social(18, 1.0, 1000, 25000),
    facebook: social(15, 0.2, 1000, 25000),
    linkedin: social(9, 0.5, 300, 5000),
    youtube: social(4, 0.5, 250, 10000),
    gbp: { ...placeholderBenchmark, ...reviews },
  },
  B2B: {
    instagram: social(13, 0.8, 500, 10000),
    facebook: social(12, 0.15, 500, 10000),
    linkedin: social(13, 0.6, 500, 10000),
    youtube: social(4, 0.2, 100, 5000),
    gbp: { ...placeholderBenchmark, ...reviews },
  },
  D2C: {
    instagram: social(22, 0.7, 2000, 50000),
    facebook: social(17, 0.15, 1000, 50000),
    linkedin: social(6, 0.4, 200, 3000),
    youtube: social(6, 0.6, 250, 20000),
    gbp: { ...placeholderBenchmark, ...reviews },
  },
};
