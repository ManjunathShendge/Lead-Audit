import {
  alignmentContentSchema,
  audienceProvided,
  type AlignmentContent,
  type AlignmentStats,
  type ClassifiedPost,
  type StoredAlignment,
  type TargetAudience,
} from './alignment-types';
import { unverifiedNumbers } from './summary';
import { aiFailureReason, aiGenerate, aiModel, aiName, isOverloaded, type Generate } from './provider';
import {
  platforms,
  platformNames,
  resultSchema,
  type CollectorResult,
  type Platform,
} from '../collectors/types';
import { websiteResultSchema, type WebsiteResult } from '../collectors/channel-types';
import type { Snapshot } from '../report';
export * from './alignment-types';

/**
 * Audience alignment: does what the brand publishes speak to the people it wants to reach?
 * The model only labels each post (on target / partly / off target, which persona, which theme)
 * and writes the narrative. Every percentage and average shown is computed here from those labels
 * and the collected post numbers, so a figure in the report can always be traced to real posts.
 */

const POSTS_PER_PLATFORM = 30;
/** Waits before retrying an overloaded AI provider. Exported so tests can shorten it. */
export const retryDelaysMs = [5_000, 15_000];
const refPrefix: Record<Platform, string> = {
  instagram: 'ig',
  facebook: 'fb',
  linkedin: 'li',
  youtube: 'yt',
};

export interface AlignmentInput {
  brand: string;
  industry: string;
  website: string | null;
  targetAudience: TargetAudience | null;
  social: Partial<Record<Platform, CollectorResult>>;
  site: WebsiteResult | null;
  services: string[];
}

/** Builds the input from a stored audit and its collector runs. */
export function alignmentInputFromAudit(audit: {
  brand: string;
  industry: string;
  website: string | null;
  targetAudience: TargetAudience | null;
  config: unknown;
  runs: { platform: string; result: unknown }[];
}): AlignmentInput {
  const social: AlignmentInput['social'] = {};
  let site: WebsiteResult | null = null;
  for (const run of audit.runs) {
    if (!run.result) continue;
    if (run.platform === 'website') {
      const parsed = websiteResultSchema.safeParse(run.result);
      if (parsed.success) site = parsed.data;
    } else if ((platforms as readonly string[]).includes(run.platform)) {
      const parsed = resultSchema.safeParse(run.result);
      if (parsed.success) social[run.platform as Platform] = parsed.data;
    }
  }
  const services = (audit.config as Partial<Snapshot> | null)?.services ?? {};
  return {
    brand: audit.brand,
    industry: audit.industry,
    website: audit.website,
    targetAudience: audit.targetAudience,
    social,
    site,
    services: [...new Set(Object.values(services).map((s) => s.service))],
  };
}

const interactions = (p: CollectorResult['posts'][number]) =>
  p.likes === null && p.comments === null ? null : (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);

/** The posts the model will read: newest first, text required, capped per platform. */
export function selectPosts(input: AlignmentInput) {
  return platforms.flatMap((platform) => {
    const result = input.social[platform];
    if (!result) return [];
    return [...result.posts]
      .filter((p) => (p.caption ?? p.captionPreview)?.trim())
      .sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '') || 0)
      .slice(0, POSTS_PER_PLATFORM)
      .map((p, i) => ({
        ref: `${refPrefix[platform]}${i + 1}`,
        platform,
        type: p.type,
        date: p.publishedAt?.slice(0, 10) ?? null,
        text: (p.caption ?? p.captionPreview ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
        likes: p.likes,
        comments: p.comments,
        interactions: interactions(p),
        url: p.url,
        publishedAt: p.publishedAt,
      }));
  });
}

export function buildAlignmentFacts(input: AlignmentInput) {
  const posts = selectPosts(input);
  const m = input.site?.detail.messaging ?? null;
  return {
    facts: {
      brand: input.brand,
      industryProfile: input.industry,
      website: input.website,
      targetAudience: audienceProvided(input.targetAudience)
        ? { providedByTheBrandTeam: true, ...input.targetAudience }
        : 'Not provided. Infer it from the website and profile bios.',
      websiteHomepage: m && {
        title: m.title,
        metaDescription: m.description,
        headings: m.headings,
        text: m.text?.slice(0, 2000) ?? null,
      },
      profiles: platforms
        .filter((p) => input.social[p]?.profile)
        .map((p) => {
          const profile = input.social[p]!.profile!;
          return {
            platform: platformNames[p],
            name: profile.displayName,
            bio: profile.bio,
            category: profile.category,
            followers: profile.followers,
          };
        }),
      posts: posts.map(({ ref, platform, type, date, text, likes, comments }) => ({
        ref,
        platform: platformNames[platform],
        type,
        date,
        text,
        likes,
        comments,
      })),
      tier2Services: input.services,
    },
    posts,
  };
}

const str = (description: string) => ({ type: 'string', description });
export const alignmentJsonSchema = {
  type: 'object',
  properties: {
    headline: str('One plain sentence: is the content reaching the intended audience?'),
    audience: {
      type: 'object',
      properties: {
        summary: str('Who the brand is trying to reach, in one or two sentences.'),
        personas: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              name: str('Short persona name.'),
              description: str('Who they are and what they need.'),
            },
            required: ['name', 'description'],
          },
        },
      },
      required: ['summary', 'personas'],
    },
    themes: {
      type: 'array',
      maxItems: 8,
      items: str('A short content theme label, e.g. "Product demos" or "Festival greetings".'),
    },
    websiteFit: {
      type: 'object',
      properties: {
        fit: { type: 'string', enum: ['strong', 'partial', 'weak', 'unknown'] },
        verdict: str('Does the homepage speak to these personas? "unknown" if no homepage text.'),
      },
      required: ['fit', 'verdict'],
    },
    posts: {
      type: 'array',
      description: 'One entry for every post in the facts, using its ref.',
      items: {
        type: 'object',
        properties: {
          ref: str('The post ref from the facts.'),
          fit: { type: 'string', enum: ['on', 'partial', 'off'] },
          persona: {
            type: ['integer', 'null'],
            description: 'Index into audience.personas of the persona it speaks to, or null.',
          },
          theme: { type: ['integer', 'null'], description: 'Index into themes, or null.' },
          reason: str('Up to 15 words on why.'),
        },
        required: ['ref', 'fit', 'persona', 'theme', 'reason'],
      },
    },
    working: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          point: str('What is reaching the audience well.'),
          evidence: str('Which posts or content show it.'),
        },
        required: ['point', 'evidence'],
      },
    },
    gaps: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          point: str('Where the content misses the audience.'),
          evidence: str('Which posts or missing content show it.'),
          service: str('A Tier2 service from tier2Services.'),
        },
        required: ['point', 'evidence', 'service'],
      },
    },
    recommendations: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          action: str('A concrete content change.'),
          why: str('Why it would reach the audience better.'),
          service: str('A Tier2 service from tier2Services.'),
        },
        required: ['action', 'why', 'service'],
      },
    },
  },
  required: ['headline', 'audience', 'themes', 'websiteFit', 'posts', 'working', 'gaps', 'recommendations'],
};

const SYSTEM = `You are a brand strategist checking whether a brand's published content speaks to its target audience.
Rules:
- If the facts include a targetAudience provided by the brand team, use it as the audience. Keep their persona names; write a short description for each. If they gave only a description, derive 2-4 personas from it.
- If no target audience is provided, infer 2-4 personas from the website homepage and profile bios. Base this on what the brand sells and to whom, not on who happens to engage.
- Classify EVERY post by its ref:
  "on" = clearly addressed to a persona: their problems, goals, use cases, language or buying decisions.
  "partial" = loosely relevant brand content a persona might value, but not aimed at them.
  "off" = aimed at someone else or at no one in particular (generic greetings, unrelated trends, recruitment when the audience is customers).
- persona = the index of the persona the post speaks to, or null when fit is "off". theme = index into your themes list.
- Judge only from the text given. Never claim to know who follows or engages with the brand; public data does not show that.
- Do not write percentages or averages; the app calculates them. Any number you write must appear in the facts.
- Name services only from tier2Services. Plain, direct English for a business owner.
- Keep it short: headline under 20 words; each finding, verdict and recommendation 1-2 sentences.`;

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? round1(known.reduce((s, v) => s + v, 0) / known.length) : null;
};
const scoreOf = (on: number, partial: number, total: number) =>
  total ? Math.round(((on + partial * 0.5) / total) * 100) : null;

export function alignmentStats(
  posts: ClassifiedPost[],
  personas: string[],
  themes: string[],
): AlignmentStats {
  const count = (list: ClassifiedPost[], fit: ClassifiedPost['fit']) =>
    list.filter((p) => p.fit === fit).length;
  const on = count(posts, 'on');
  const partial = count(posts, 'partial');
  const relevant = posts.filter((p) => p.fit !== 'off');
  return {
    posts: posts.length,
    on,
    partial,
    off: posts.length - on - partial,
    score: scoreOf(on, partial, posts.length),
    platforms: platforms
      .map((platform) => {
        const list = posts.filter((p) => p.platform === platform);
        const o = count(list, 'on');
        const pa = count(list, 'partial');
        return {
          platform,
          posts: list.length,
          on: o,
          partial: pa,
          off: list.length - o - pa,
          score: scoreOf(o, pa, list.length),
          avgRelevant: avg(list.filter((p) => p.fit !== 'off').map((p) => p.interactions)),
          avgOff: avg(list.filter((p) => p.fit === 'off').map((p) => p.interactions)),
        };
      })
      .filter((p) => p.posts > 0),
    personas: personas.map((name, i) => {
      const list = relevant.filter((p) => p.persona === i);
      return {
        name,
        posts: list.length,
        sharePercent: posts.length ? Math.round((list.length / posts.length) * 100) : 0,
        avgInteractions: avg(list.map((p) => p.interactions)),
      };
    }),
    themes: themes
      .map((name, i) => {
        const list = posts.filter((p) => p.theme === i);
        return {
          name,
          posts: list.length,
          relevantPercent: list.length
            ? Math.round((list.filter((p) => p.fit !== 'off').length / list.length) * 100)
            : null,
        };
      })
      .filter((t) => t.posts > 0)
      .sort((a, b) => b.posts - a.posts),
  };
}

function failure(reason: string, model: string | null, generatedAt: string): StoredAlignment {
  return { status: 'failed', model, generatedAt, reason };
}

export async function generateAlignment(
  input: AlignmentInput,
  generate: Generate = aiGenerate,
): Promise<StoredAlignment> {
  const model = aiModel();
  const generatedAt = new Date().toISOString();
  const { facts, posts } = buildAlignmentFacts(input);
  if (!posts.length) return failure(noPostsReason(input), null, generatedAt);
  let prompt = `Brand facts (JSON):\n${JSON.stringify(facts)}\n\nAnalyse audience alignment.`;
  let lastReason = 'The alignment analysis could not be generated.';
  for (let attempt = 0; attempt < 2; attempt++) {
    let result: Awaited<ReturnType<Generate>> | undefined;
    // Overloaded providers (503 Gemini, 529 Claude) usually recover within seconds.
    for (let busy = 0; !result; busy++) {
      try {
        result = await generate({
          model,
          system: SYSTEM,
          prompt,
          schema: alignmentJsonSchema,
          zod: alignmentContentSchema,
          signal: AbortSignal.timeout(600_000),
        });
      } catch (e) {
        if (isOverloaded(e) && busy < retryDelaysMs.length) {
          await new Promise((r) => setTimeout(r, retryDelaysMs[busy]));
          continue;
        }
        return failure(aiFailureReason(e, model, 600), model, generatedAt);
      }
    }
    let content: AlignmentContent;
    try {
      content = alignmentContentSchema.parse(JSON.parse(result.text ?? ''));
    } catch {
      lastReason = `${aiName()} returned the analysis in an unexpected format.`;
      continue;
    }
    const narrative = { ...content, posts: content.posts.map((p) => p.reason) };
    const bad = unverifiedNumbers(narrative, facts);
    if (bad.length) {
      lastReason = `The analysis quoted numbers not in the audit (${bad.slice(0, 5).join(', ')}), so it was withheld.`;
      prompt += `\n\nYour previous answer used these numbers that are not in the facts: ${bad.join(', ')}. Use only numbers from the facts.`;
      continue;
    }
    const labels = new Map(content.posts.map((p) => [p.ref, p]));
    const personaCount = content.audience.personas.length;
    const classified: ClassifiedPost[] = posts.flatMap((p) => {
      const label = labels.get(p.ref);
      if (!label) return [];
      const persona =
        label.fit !== 'off' && label.persona !== null && label.persona >= 0 && label.persona < personaCount
          ? label.persona
          : null;
      const theme =
        label.theme !== null && label.theme >= 0 && label.theme < content.themes.length ? label.theme : null;
      return [
        {
          ref: p.ref,
          platform: p.platform,
          url: p.url,
          publishedAt: p.publishedAt,
          text: p.text.slice(0, 280),
          interactions: p.interactions,
          fit: label.fit,
          persona,
          theme,
          reason: label.reason,
        },
      ];
    });
    // A model that skipped most posts would make the percentages meaningless.
    if (classified.length < Math.ceil(posts.length * 0.8)) {
      lastReason = `${aiName()} classified only ${classified.length} of ${posts.length} posts, so the analysis was withheld.`;
      prompt += `\n\nYou must return one entry in posts for every ref in the facts (${posts.length} posts).`;
      continue;
    }
    const { posts: _labels, ...rest } = content;
    void _labels;
    return {
      status: 'ok',
      model,
      generatedAt,
      audienceSource: audienceProvided(input.targetAudience) ? 'provided' : 'inferred',
      targetAudience: audienceProvided(input.targetAudience) ? input.targetAudience : null,
      content: rest,
      posts: classified,
      stats: alignmentStats(
        classified,
        content.audience.personas.map((p) => p.name),
        content.themes,
      ),
      usage: { input: result.input, output: result.output },
    };
  }
  return failure(lastReason, model, generatedAt);
}

/** Says per platform why no post text is available, so the team knows what to fix. */
export function noPostsReason(input: AlignmentInput): string {
  const notes = platforms.flatMap((p) => {
    const r = input.social[p];
    if (!r) return [];
    const name = platformNames[p];
    if (r.status === 'failed') return [`${name} could not be collected`];
    if (r.status === 'private') return [`${name} is private`];
    if (r.status === 'not_found') return [`${name} was not found`];
    if (!r.posts.length) return [`${name} returned the profile but no posts`];
    return [`${name} posts have no text`];
  });
  return notes.length
    ? `No post text to analyse: ${notes.join('; ')}. Re-run the audit (a fresh collection often fixes this) or check the handles.`
    : 'No social accounts were confirmed, so there are no posts to analyse. Add at least one handle and re-run the audit.';
}
