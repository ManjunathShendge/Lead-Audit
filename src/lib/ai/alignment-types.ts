import { z } from 'zod';

/** Shared by server and browser; kept free of any AI SDK. */

/** Who the brand says it wants to reach. Every field is optional; all blank means "infer it". */
export const targetAudienceSchema = z.object({
  description: z.string().trim().max(600).default(''),
  personas: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
  locations: z.string().trim().max(160).default(''),
});
export type TargetAudience = z.infer<typeof targetAudienceSchema>;
export const emptyTargetAudience = (): TargetAudience => ({ description: '', personas: [], locations: '' });
export const audienceProvided = (t: TargetAudience | null | undefined): t is TargetAudience =>
  !!t && (!!t.description || t.personas.length > 0 || !!t.locations);

export const fits = ['on', 'partial', 'off'] as const;
export type Fit = (typeof fits)[number];

/** What the model returns. Percentages are never taken from the model; the app computes them. */
export const alignmentContentSchema = z.object({
  // Generous caps: they stop runaway output. The prompt asks for the actual length.
  headline: z.string().min(1).max(300),
  audience: z.object({
    summary: z.string().min(1).max(1000),
    personas: z
      .array(z.object({ name: z.string().min(1).max(100), description: z.string().max(500) }))
      .min(1)
      .max(6),
  }),
  themes: z.array(z.string().min(1).max(100)).max(8),
  websiteFit: z.object({
    fit: z.enum(['strong', 'partial', 'weak', 'unknown']),
    verdict: z.string().max(1000),
  }),
  posts: z.array(
    z.object({
      ref: z.string().max(10),
      fit: z.enum(fits),
      persona: z.number().int().nullable(),
      theme: z.number().int().nullable(),
      reason: z.string().max(400),
    }),
  ),
  working: z.array(z.object({ point: z.string().max(400), evidence: z.string().max(600) })).max(3),
  gaps: z
    .array(
      z.object({ point: z.string().max(400), evidence: z.string().max(600), service: z.string().max(120) }),
    )
    .max(3),
  recommendations: z
    .array(z.object({ action: z.string().max(500), why: z.string().max(700), service: z.string().max(120) }))
    .max(3),
});
export type AlignmentContent = z.infer<typeof alignmentContentSchema>;

const platformName = z.enum(['instagram', 'facebook', 'linkedin', 'youtube']);
export const classifiedPostSchema = z.object({
  ref: z.string(),
  platform: platformName,
  url: z.string().nullable(),
  publishedAt: z.string().nullable(),
  text: z.string(),
  interactions: z.number().nullable(),
  fit: z.enum(fits),
  persona: z.number().int().nullable(),
  theme: z.number().int().nullable(),
  reason: z.string(),
});
export type ClassifiedPost = z.infer<typeof classifiedPostSchema>;

/** Numbers computed by the app from the classified posts, never by the model. */
export const alignmentStatsSchema = z.object({
  posts: z.number(),
  on: z.number(),
  partial: z.number(),
  off: z.number(),
  /** 0–100: on-target posts count fully, partly relevant posts count half. */
  score: z.number().nullable(),
  platforms: z.array(
    z.object({
      platform: platformName,
      posts: z.number(),
      on: z.number(),
      partial: z.number(),
      off: z.number(),
      score: z.number().nullable(),
      /** Average likes + comments + shares per post. */
      avgRelevant: z.number().nullable(),
      avgOff: z.number().nullable(),
    }),
  ),
  personas: z.array(
    z.object({
      name: z.string(),
      posts: z.number(),
      sharePercent: z.number(),
      avgInteractions: z.number().nullable(),
    }),
  ),
  themes: z.array(z.object({ name: z.string(), posts: z.number(), relevantPercent: z.number().nullable() })),
});
export type AlignmentStats = z.infer<typeof alignmentStatsSchema>;

export const storedAlignmentSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    model: z.string(),
    generatedAt: z.string(),
    audienceSource: z.enum(['provided', 'inferred']),
    targetAudience: targetAudienceSchema.nullable(),
    content: alignmentContentSchema.omit({ posts: true }),
    posts: z.array(classifiedPostSchema),
    stats: alignmentStatsSchema,
    usage: z.object({ input: z.number().nullable(), output: z.number().nullable() }),
  }),
  z.object({
    status: z.literal('failed'),
    model: z.string().nullable(),
    generatedAt: z.string(),
    reason: z.string(),
  }),
]);
export type StoredAlignment = z.infer<typeof storedAlignmentSchema>;
