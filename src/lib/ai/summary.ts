import { summaryContentSchema, type StoredSummary, type SummaryContent } from './summary-types';
export {
  summaryContentSchema,
  storedSummarySchema,
  type StoredSummary,
  type SummaryContent,
} from './summary-types';
import type { Report } from '../report';
import { platformNames } from '../collectors/types';
import { band } from '../scoring';
import { aiConfigured, aiFailureReason, aiGenerate, aiModel, type Generate } from './provider';

/**
 * Plain-language summary of a finished audit, written by the AI from the audited numbers only.
 * Every number in the output is checked against the facts that were sent; a summary quoting a
 * number that is not in the audit is rejected rather than shown.
 */

/** Gemini structured-output schema (JSON Schema subset) mirroring summaryContentSchema. Claude uses the Zod schema. */
const str = (description: string) => ({ type: 'string', description });
export const summaryJsonSchema = {
  type: 'object',
  properties: {
    headline: str('One short sentence a business owner understands at a glance. No jargon.'),
    verdict: str('Two or three plain sentences: where the brand stands overall and why.'),
    strengths: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: { point: str('What is going well.'), evidence: str('The audited number that shows it.') },
        required: ['point', 'evidence'],
      },
    },
    problems: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          point: str('What is holding the brand back.'),
          evidence: str('The audited number that shows it.'),
          service: str('The Tier2 service from the facts that addresses it.'),
        },
        required: ['point', 'evidence', 'service'],
      },
    },
    firstFix: {
      type: 'object',
      properties: {
        action: str('The single most valuable next step.'),
        why: str('Why it matters, in one or two sentences.'),
        service: str('The Tier2 service from the facts.'),
      },
      required: ['action', 'why', 'service'],
    },
    sections: {
      type: 'object',
      properties: {
        score: str('One or two sentences explaining how the overall score is built for this brand.'),
        social: str('One or two sentences explaining the social platform results.'),
        website: {
          type: ['string', 'null'],
          description: 'One or two sentences on the website, or null if not measured.',
        },
        gbp: {
          type: ['string', 'null'],
          description: 'One or two sentences on Google Business Profile, or null if not measured.',
        },
      },
      required: ['score', 'social', 'website', 'gbp'],
    },
  },
  required: ['headline', 'verdict', 'strengths', 'problems', 'firstFix', 'sections'],
};

const r1 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const r0 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n));

/** The only information the model sees: rounded, labelled, with "not measured" made explicit. */
export function buildFacts(report: Report, brand: string) {
  const w = report.website ?? null;
  const g = report.gbp ?? null;
  return {
    brand,
    industry: report.industry,
    // Social posting and engagement cover this period; website and Google results are as of the audit date.
    socialPeriod: report.period?.label ?? 'the last 30 days',
    scoreName: report.overall.label,
    overallScore: r0(report.overall.score),
    overallBand: band(report.overall.score, report.config),
    bands: `Strong ${report.config.thresholds.strong}+, Good ${report.config.thresholds.good}+, Needs work ${report.config.thresholds.needsWork}+, otherwise Weak`,
    channels: (['website', 'social', 'gbp'] as const).map((c) => ({
      channel: c === 'gbp' ? 'Google Business Profile' : c,
      score: r0((report.channelScores ?? { website: null, social: report.social, gbp: null })[c]),
      effectiveWeightPercent: r0((report.overall.weights as Record<string, number>)[c]),
    })),
    platforms: report.cards.map((c) => ({
      platform: platformNames[c.platform],
      status: c.status,
      score: r0(c.score),
      followers: c.subscriberHidden ? 'hidden' : (c.profile?.followers ?? 'not measured'),
      postsPer30Days:
        c.metrics.count === null
          ? 'not measured'
          : `${c.metrics.lowerBound ? 'at least ' : ''}${c.metrics.count}${report.period ? ` (average across ${report.period.label})` : ''}`,
      engagementRatePercent: r1(c.metrics.engagement) ?? 'not measured',
      longestGapDays: r0(c.metrics.longestGap) ?? 'not measured',
      videoSharePercent: c.metrics.mix ? r0(c.metrics.mix.videoPercent) : 'not measured',
      components: Object.fromEntries(
        Object.entries(c.components).map(([k, v]) => [k, r0(v) ?? 'not measured']),
      ),
      targets: {
        postsPerMonth: c.benchmark.postsTarget,
        engagementRatePercent: c.benchmark.engagementTarget,
      },
    })),
    website: w && {
      score: r0(w.score),
      criteria: Object.fromEntries(Object.entries(w.criteria).map(([k, v]) => [k, r0(v) ?? 'not measured'])),
      pagespeedPerformance: r0(w.parts.performance.pagespeed) ?? 'not measured',
      pagespeedSeo: r0(w.parts.seo.pagespeed) ?? 'not measured',
      largestContentfulPaintSeconds:
        w.detail.pagespeed.lcpMs === null ? 'not measured' : r1(w.detail.pagespeed.lcpMs / 1000),
      interactionToNextPaintMs: r0(w.detail.pagespeed.inpMs) ?? 'not measured',
      cumulativeLayoutShift:
        w.detail.pagespeed.cls === null ? 'not measured' : Math.round(w.detail.pagespeed.cls * 100) / 100,
      goodThresholds: {
        lcpSeconds: report.config.thresholds.lcp,
        inpMs: report.config.thresholds.inp,
        cls: report.config.thresholds.cls,
      },
      seo: {
        ...w.detail.seo,
        imageAltRatio: undefined,
        imagesWithAltTextPercent:
          w.detail.seo.imageAltRatio === null ? 'not measured' : r0(w.detail.seo.imageAltRatio * 100),
        altTextTargetPercent: r0(report.config.thresholds.altRatio * 100),
      },
      tracking: w.detail.tracking,
      conversion: w.detail.conversion,
      footerCopyrightYear: w.detail.freshness.copyrightYear ?? 'not found',
      blogLinked: !!w.detail.freshness.blogUrl,
    },
    googleBusinessProfile: g && {
      score: r0(g.score),
      status: g.status,
      criteria: Object.fromEntries(Object.entries(g.criteria).map(([k, v]) => [k, r0(v) ?? 'not measured'])),
      rating: g.detail?.rating ?? 'not measured',
      reviewCount: g.detail?.reviewCount ?? 'not measured',
      latestReviewsWithOwnerReply: g.detail
        ? g.detail.latestReviews.filter((x) => x.ownerReplied).length
        : 'not measured',
      latestReviewsChecked: g.detail?.latestReviews.length ?? 0,
      reviewCountTargetBand: `${g.benchmark.reviewLow}-${g.benchmark.reviewHigh}`,
    },
    opportunities: report.gaps.map((gap) => ({
      where: gap.platform,
      area: gap.component,
      score: r0(gap.score),
      measured: gap.measured,
      tier2Service: gap.service,
    })),
    windows: { postsCountedOverDays: 30, gapsCheckedOverDays: 90, reviewsChecked: 10 },
    configuredChannelWeightsPercent: report.config.channels,
    opportunityThresholdScore: report.config.thresholds.gapScore,
    benchmarksAreTargetsNotAverages: true,
  };
}
export type Facts = ReturnType<typeof buildFacts>;

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const numbersIn = (text: string) => [...text.matchAll(NUMBER)].map((m) => Number(m[0].replace(/,/g, '')));

/**
 * Every number the model wrote must match a number in the facts (allowing for its own rounding),
 * or be a small count 1–10 ("3 platforms", "two of 10"). Returns the ones that do not.
 */
export function unverifiedNumbers(content: unknown, facts: unknown): number[] {
  const allowed = numbersIn(JSON.stringify(facts));
  const text = JSON.stringify(content);
  return [
    ...new Set(
      numbersIn(text).filter(
        (x) =>
          !(Number.isInteger(x) && x >= 0 && x <= 10) &&
          !allowed.some(
            (a) => Math.abs(a - x) < 0.051 || Math.round(a) === x || Math.round(a * 10) / 10 === x,
          ),
      ),
    ),
  ];
}

const SYSTEM = `You explain a digital-presence audit to a busy business owner who will not read the full report.
Rules:
- Use ONLY the facts provided. Never invent, estimate or extrapolate a number, and never add industry statistics.
- Quote numbers exactly as they appear in the facts. If a value is "not measured", say it was not measured; do not guess.
- Plain, warm, direct English. No jargon: say "how fast the page loads" rather than "LCP" unless you explain it.
- Name Tier2 services only from the facts' tier2Service values.
- Benchmarks are Tier2 targets set near top-quartile performance, so describe them as "our target", never as an industry average.
- Set sections.website or sections.gbp to null when that channel is null in the facts.
- Keep it short: headline under 20 words, verdict 2-3 sentences, each point and each section 1-2 sentences.`;

export { claudeGenerate, geminiGenerate, aiGenerate, type Generate } from './provider';

/** Kept for callers that predate the provider switch. */
export const summaryModel = aiModel;
export const summaryConfigured = aiConfigured;

export async function generateSummary(
  report: Report,
  brand: string,
  generate: Generate = aiGenerate,
): Promise<StoredSummary> {
  const model = summaryModel();
  const generatedAt = new Date().toISOString();
  const facts = buildFacts(report, brand);
  let prompt = `Audit facts (JSON):\n${JSON.stringify(facts)}\n\nWrite the summary.`;
  let lastReason = 'The summary could not be generated.';
  // One retry: if a number fails verification, tell the model which ones and ask again.
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: Awaited<ReturnType<Generate>>;
    try {
      result = await generate({
        model,
        system: SYSTEM,
        prompt,
        signal: AbortSignal.timeout(180_000),
        zod: summaryContentSchema,
        schema: summaryJsonSchema,
      });
    } catch (e) {
      return { status: 'failed', model, generatedAt, reason: aiFailureReason(e, model, 180) };
    }
    let parsed: SummaryContent;
    try {
      parsed = summaryContentSchema.parse(JSON.parse(result.text ?? ''));
    } catch {
      lastReason = 'The AI returned a summary in an unexpected format.';
      continue;
    }
    const bad = unverifiedNumbers(parsed, facts);
    if (!bad.length)
      return {
        status: 'ok',
        model,
        generatedAt,
        content: parsed,
        usage: { input: result.input, output: result.output },
      };
    lastReason = `The summary quoted numbers not in the audit (${bad.slice(0, 5).join(', ')}), so it was withheld.`;
    prompt += `\n\nYour previous answer used these numbers that are not in the facts: ${bad.join(', ')}. Use only numbers from the facts.`;
  }
  return { status: 'failed', model, generatedAt, reason: lastReason };
}
