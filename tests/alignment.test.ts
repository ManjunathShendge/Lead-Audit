import { describe, it, expect } from 'vitest';
import {
  alignmentStats,
  buildAlignmentFacts,
  generateAlignment,
  retryDelaysMs,
  storedAlignmentSchema,
  type AlignmentContent,
  type AlignmentInput,
  type ClassifiedPost,
} from '../src/lib/ai/alignment';
import type { Generate } from '../src/lib/ai/summary';
import { mockCollector } from '../src/lib/collectors/mock';
import type { CollectorResult } from '../src/lib/collectors/types';
import { auditInputSchema, emptyHandles } from '../src/lib/validation';

const validateAuditInput = (extra: object) =>
  auditInputSchema.parse({
    brand: 'RedRoad',
    website: '',
    industry: 'B2B',
    tier: 'average',
    handles: emptyHandles(),
    ...extra,
  });

const asOf = new Date('2026-09-28T12:00:00Z');

function post(id: string, text: string | null, likes: number | null, comments: number | null, day: number) {
  return {
    id,
    url: `https://www.linkedin.com/feed/update/${id}`,
    publishedAt: new Date(asOf.getTime() - day * 86400000).toISOString(),
    type: 'text' as const,
    likes,
    comments,
    shares: null,
    views: null,
    isPinned: false,
    captionPreview: text?.slice(0, 180) ?? null,
    caption: text,
  };
}
function linkedin(posts: ReturnType<typeof post>[]): CollectorResult {
  return {
    status: 'ok',
    profile: null,
    posts,
    raw: null,
    costUsd: 0,
    warnings: [],
    fetchedAt: asOf.toISOString(),
    sampleComplete: true,
    subscriberHidden: false,
  };
}
const input = (overrides: Partial<AlignmentInput> = {}): AlignmentInput => ({
  brand: 'RedRoad',
  industry: 'B2B',
  website: 'https://redroad.example',
  targetAudience: {
    description: 'HR leaders at mid-size IT firms',
    personas: ['CHROs', 'Founders'],
    locations: 'India',
  },
  social: {
    linkedin: linkedin([
      post('a', 'How CHROs cut time-to-hire by 30 days', 120, 30, 1),
      post('b', 'Happy Diwali from all of us!', 40, 0, 2),
      post('c', 'Founders: scaling your first HR team', 60, 10, 3),
      post('d', null, 5, 1, 4),
    ]),
  },
  site: null,
  services: ['B2B Marketing', 'Copy & Content'],
  ...overrides,
});

function answer(overrides: Partial<AlignmentContent> = {}): AlignmentContent {
  return {
    headline: 'Most LinkedIn posts speak to HR leaders, but festival posts dilute the feed.',
    audience: {
      summary: 'HR leaders and founders at mid-size IT firms in India.',
      personas: [
        { name: 'CHROs', description: 'Own hiring speed and cost.' },
        { name: 'Founders', description: 'Build the first HR team.' },
      ],
    },
    themes: ['Hiring outcomes', 'Festival greetings'],
    websiteFit: { fit: 'unknown', verdict: 'No homepage text was collected.' },
    posts: [
      { ref: 'li1', fit: 'on', persona: 0, theme: 0, reason: 'Speaks to time-to-hire, a CHRO goal.' },
      { ref: 'li2', fit: 'off', persona: 0, theme: 1, reason: 'Generic greeting.' },
      { ref: 'li3', fit: 'partial', persona: 1, theme: 0, reason: 'Relevant to founders, but broad.' },
    ],
    working: [{ point: 'Outcome-led hiring posts', evidence: 'The time-to-hire post drew 30 comments.' }],
    gaps: [
      {
        point: 'Festival posts',
        evidence: 'The Diwali post speaks to no persona.',
        service: 'Copy & Content',
      },
    ],
    recommendations: [
      {
        action: 'Replace greetings with CHRO case studies',
        why: 'Keeps the feed on target.',
        service: 'B2B Marketing',
      },
    ],
    ...overrides,
  };
}
const fake =
  (...answers: AlignmentContent[]): Generate =>
  async () => ({ text: JSON.stringify(answers.shift()), input: 100, output: 50 });

describe('audience alignment facts', () => {
  it('sends only posts with text, newest first, with refs and the provided audience', () => {
    const { facts, posts } = buildAlignmentFacts(input());
    expect(posts.map((p) => p.ref)).toEqual(['li1', 'li2', 'li3']);
    expect(facts.posts[0]).toMatchObject({ ref: 'li1', platform: 'LinkedIn', likes: 120, comments: 30 });
    expect(facts.targetAudience).toMatchObject({
      providedByTheBrandTeam: true,
      personas: ['CHROs', 'Founders'],
    });
  });
  it('asks the model to infer the audience when none is provided', () => {
    const { facts } = buildAlignmentFacts(input({ targetAudience: null }));
    expect(facts.targetAudience).toMatch(/Not provided/);
  });
  it('reads mock collector captions', async () => {
    const ig = await mockCollector('instagram', 'average', asOf).collect('demo', { postsLimit: 60 });
    const { posts } = buildAlignmentFacts(input({ social: { instagram: ig } }));
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(30);
  });
});

describe('audience alignment numbers are computed, not taken from the model', () => {
  it('scores on-target posts fully and partly relevant posts at half', () => {
    const posts: ClassifiedPost[] = [
      {
        ref: 'a',
        platform: 'linkedin',
        url: null,
        publishedAt: null,
        text: '',
        interactions: 150,
        fit: 'on',
        persona: 0,
        theme: 0,
        reason: '',
      },
      {
        ref: 'b',
        platform: 'linkedin',
        url: null,
        publishedAt: null,
        text: '',
        interactions: 40,
        fit: 'off',
        persona: null,
        theme: 1,
        reason: '',
      },
      {
        ref: 'c',
        platform: 'linkedin',
        url: null,
        publishedAt: null,
        text: '',
        interactions: 70,
        fit: 'partial',
        persona: 1,
        theme: 0,
        reason: '',
      },
      {
        ref: 'd',
        platform: 'instagram',
        url: null,
        publishedAt: null,
        text: '',
        interactions: null,
        fit: 'on',
        persona: 0,
        theme: null,
        reason: '',
      },
    ];
    const s = alignmentStats(posts, ['CHROs', 'Founders', 'Recruiters'], ['Hiring', 'Festivals']);
    expect(s).toMatchObject({ posts: 4, on: 2, partial: 1, off: 1, score: 63 });
    const li = s.platforms.find((p) => p.platform === 'linkedin')!;
    expect(li).toMatchObject({ posts: 3, score: 50, avgRelevant: 110, avgOff: 40 });
    expect(s.personas).toEqual([
      { name: 'CHROs', posts: 2, sharePercent: 50, avgInteractions: 150 },
      { name: 'Founders', posts: 1, sharePercent: 25, avgInteractions: 70 },
      { name: 'Recruiters', posts: 0, sharePercent: 0, avgInteractions: null },
    ]);
    expect(s.themes[0]).toEqual({ name: 'Hiring', posts: 2, relevantPercent: 100 });
  });
});

describe('generateAlignment', () => {
  it('stores labels, drops persona on off-target posts and computes stats', async () => {
    const result = await generateAlignment(input(), fake(answer()));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(storedAlignmentSchema.safeParse(result).success).toBe(true);
    expect(result.audienceSource).toBe('provided');
    expect(result.posts.find((p) => p.ref === 'li2')?.persona).toBeNull();
    expect(result.stats).toMatchObject({ posts: 3, on: 1, partial: 1, off: 1, score: 50 });
  });
  it('marks the audience as inferred when none was provided', async () => {
    const result = await generateAlignment(input({ targetAudience: null }), fake(answer()));
    expect(result.status === 'ok' && result.audienceSource).toBe('inferred');
  });
  it('retries once, then withholds an analysis that quotes invented numbers', async () => {
    const bad = answer({ headline: 'Engagement is 87% lower on greetings.' });
    const retried = await generateAlignment(input(), fake(bad, answer()));
    expect(retried.status).toBe('ok');
    const failed = await generateAlignment(input(), fake(bad, bad));
    expect(failed.status === 'failed' && failed.reason).toMatch(/87/);
  });
  it('withholds an analysis that skips most posts', async () => {
    const partial = answer({ posts: answer().posts.slice(0, 1) });
    const result = await generateAlignment(input(), fake(partial, partial));
    expect(result.status === 'failed' && result.reason).toMatch(/classified only 1 of 3/);
  });
  it('fails clearly without calling the model when no post text was collected', async () => {
    let called = false;
    const result = await generateAlignment(input({ social: {} }), async () => {
      called = true;
      return { text: '', input: null, output: null };
    });
    expect(called).toBe(false);
    expect(result.status === 'failed' && result.reason).toMatch(/No social accounts were confirmed/);
  });
  it('waits and retries when the AI provider is overloaded, then explains if it stays busy', async () => {
    retryDelaysMs.splice(0, retryDelaysMs.length, 0, 0);
    let calls = 0;
    const flaky: Generate = async (args) => {
      if (++calls < 3) throw Object.assign(new Error('busy'), { status: 503 });
      return fake(answer())(args);
    };
    expect((await generateAlignment(input(), flaky)).status).toBe('ok');
    expect(calls).toBe(3);
    const down = await generateAlignment(input(), async () => {
      throw Object.assign(new Error('Overloaded'), { status: 529 });
    });
    expect(down.status === 'failed' && down.reason).toMatch(/overloaded/);
    const auth = await generateAlignment(input(), async () => {
      throw Object.assign(new Error('503 credential validation failed'), { status: 503 });
    });
    expect(auth.status === 'failed' && auth.reason).toMatch(
      /temporarily unavailable \(credential validation failed\)/,
    );
  });
  it('reports a rejected key without retrying', async () => {
    const result = await generateAlignment(input(), async () => {
      throw Object.assign(new Error('denied'), { status: 403 });
    });
    expect(result.status === 'failed' && result.reason).toMatch(/rejected the API key/);
  });
});

describe('audit input', () => {
  it('accepts an optional target audience and defaults it to null', () => {
    expect(validateAuditInput({}).targetAudience).toBeNull();
    expect(
      validateAuditInput({ targetAudience: { description: 'CHROs', personas: ['CHROs'], locations: '' } })
        .targetAudience?.personas,
    ).toEqual(['CHROs']);
  });
});

describe('no posts to analyse', () => {
  it('names what went wrong on each platform', async () => {
    const empty = (status: CollectorResult['status']): CollectorResult => ({ ...linkedin([]), status });
    const result = await generateAlignment(
      input({ social: { instagram: { ...linkedin([]), status: 'partial' }, linkedin: empty('failed') } }),
      fake(answer()),
    );
    expect(result.status === 'failed' && result.reason).toMatch(
      /Instagram returned the profile but no posts; LinkedIn could not be collected/,
    );
    const none = await generateAlignment(input({ social: {} }), fake(answer()));
    expect(none.status === 'failed' && none.reason).toMatch(/No social accounts were confirmed/);
  });
});
