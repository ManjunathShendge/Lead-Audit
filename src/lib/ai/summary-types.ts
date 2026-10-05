import { z } from 'zod';

/** Shared by server and browser; kept free of any AI SDK. */
export const summaryContentSchema = z.object({
  // Generous caps: they stop runaway output. The prompt asks for the actual length.
  headline: z.string().min(1).max(300),
  verdict: z.string().min(1).max(1500),
  strengths: z.array(z.object({ point: z.string().max(400), evidence: z.string().max(500) })).max(3),
  problems: z
    .array(
      z.object({ point: z.string().max(400), evidence: z.string().max(500), service: z.string().max(120) }),
    )
    .max(3),
  firstFix: z.object({ action: z.string().max(500), why: z.string().max(700), service: z.string().max(120) }),
  sections: z.object({
    score: z.string().max(1000),
    social: z.string().max(1000),
    website: z.string().max(1000).nullable(),
    gbp: z.string().max(1000).nullable(),
  }),
});
export type SummaryContent = z.infer<typeof summaryContentSchema>;

export const storedSummarySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    model: z.string(),
    generatedAt: z.string(),
    content: summaryContentSchema,
    usage: z.object({ input: z.number().nullable(), output: z.number().nullable() }),
  }),
  z.object({
    status: z.literal('failed'),
    model: z.string().nullable(),
    generatedAt: z.string(),
    reason: z.string(),
  }),
]);
export type StoredSummary = z.infer<typeof storedSummarySchema>;
