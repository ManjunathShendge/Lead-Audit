import { describe, it, expect } from 'vitest';
import {
  buildFacts,
  generateSummary,
  unverifiedNumbers,
  type Generate,
  type SummaryContent,
} from '../src/lib/ai/summary';
import { mockCollector } from '../src/lib/collectors/mock';
import { mockChannel } from '../src/lib/collectors/channels';
import { platforms, type CollectorResult, type Platform } from '../src/lib/collectors/types';
import type { GbpResult, WebsiteResult } from '../src/lib/collectors/channel-types';
import { buildReport, type Handles } from '../src/lib/report';

const asOf = new Date('2026-09-28T12:00:00Z');
async function averageReport() {
  const handles = Object.fromEntries(
    platforms.map((p) => [p, { handle: 'demo', presence: 'present' }]),
  ) as Handles;
  const results: Partial<Record<Platform, CollectorResult>> = {};
  for (const p of platforms)
    results[p] = await mockCollector(p, 'average', asOf).collect('demo', { postsLimit: 60 });
  return buildReport(results, handles, 'D2C', asOf, undefined, {
    website: (await mockChannel('website', 'https://demo.example', 'average', asOf)) as WebsiteResult,
    gbp: (await mockChannel('gbp', 'Demo, Bengaluru', 'average', asOf)) as GbpResult,
    gbpPresence: 'present',
  });
}

function content(report: Awaited<ReturnType<typeof averageReport>>, extra = ''): SummaryContent {
  const overall = Math.round(report.overall.score!);
  return {
    headline: `Demo scores ${overall} out of 100.${extra}`,
    verdict: `A promising start. The page takes 3.4 seconds to show its main content; our target is 2.5.`,
    strengths: [{ point: 'Google rating', evidence: '4.1 stars from 64 reviews' }],
    problems: [
      { point: 'Few review replies', evidence: '4 of 10 latest reviews answered', service: 'Local SEO' },
    ],
    firstFix: { action: 'Answer reviews', why: 'Replies build trust.', service: 'Local SEO' },
    sections: {
      score: `Website counts for 40%.`,
      social: 'Instagram leads.',
      website: 'Loads slowly.',
      gbp: null,
    },
  };
}

describe('AI summary facts and number checking', () => {
  it('exposes only rounded audited values and marks gaps explicitly', async () => {
    const report = await averageReport();
    const facts = buildFacts(report, 'Demo');
    expect(facts.overallScore).toBe(Math.round(report.overall.score!));
    expect(facts.website?.largestContentfulPaintSeconds).toBe(3.4);
    expect(facts.website?.interactionToNextPaintMs).toBe(180);
    expect(facts.website?.seo.imagesWithAltTextPercent).toBe(72);
    expect(facts.googleBusinessProfile?.reviewCount).toBe(64);
    expect(facts.benchmarksAreTargetsNotAverages).toBe(true);
  });

  it('accepts numbers from the facts and small counts, rejects invented ones', async () => {
    const report = await averageReport();
    const facts = buildFacts(report, 'Demo');
    expect(unverifiedNumbers(content(report), facts)).toEqual([]);
    expect(unverifiedNumbers(content(report, ' Brands like yours average 3,250 followers.'), facts)).toEqual([
      3250,
    ]);
    expect(unverifiedNumbers(content(report, ' Engagement is 47.3%.'), facts)).toContain(47.3);
  });
});

describe('generateSummary', () => {
  const fake = (...answers: (string | Error)[]): Generate & { calls: string[] } => {
    const calls: string[] = [];
    const fn = (async ({ prompt }) => {
      calls.push(prompt);
      const next = answers[Math.min(calls.length - 1, answers.length - 1)];
      if (next instanceof Error) throw next;
      return { text: next, input: 1000, output: 200 };
    }) as Generate & { calls: string[] };
    fn.calls = calls;
    return fn;
  };

  it('returns a verified summary', async () => {
    const report = await averageReport();
    const gen = fake(JSON.stringify(content(report)));
    const s = await generateSummary(report, 'Demo', gen);
    expect(s.status).toBe('ok');
    if (s.status === 'ok') expect(s.usage).toEqual({ input: 1000, output: 200 });
    expect(gen.calls[0]).toContain('"overallScore"');
  });

  it('retries once when a number is invented, telling the model which', async () => {
    const report = await averageReport();
    const gen = fake(JSON.stringify(content(report, ' Growth of 812%.')), JSON.stringify(content(report)));
    const s = await generateSummary(report, 'Demo', gen);
    expect(s.status).toBe('ok');
    expect(gen.calls).toHaveLength(2);
    expect(gen.calls[1]).toContain('812');
  });

  it('withholds the summary if the model keeps inventing numbers', async () => {
    const report = await averageReport();
    const s = await generateSummary(report, 'Demo', fake(JSON.stringify(content(report, ' 812% growth.'))));
    expect(s.status).toBe('failed');
    if (s.status === 'failed') expect(s.reason).toMatch(/812/);
  });

  it('rejects malformed output and reports API failures plainly', async () => {
    const report = await averageReport();
    const bad = await generateSummary(report, 'Demo', fake('not json'));
    expect(bad.status === 'failed' && bad.reason).toMatch(/unexpected format/);
    const notFound = Object.assign(new Error('nope'), { status: 404 });
    const missing = await generateSummary(report, 'Demo', fake(notFound));
    expect(missing.status === 'failed' && missing.reason).toMatch(/set (ANTHROPIC|GEMINI)_MODEL/);
    const quota = Object.assign(new Error('slow down'), { status: 429 });
    const limited = await generateSummary(report, 'Demo', fake(quota));
    expect(limited.status === 'failed' && limited.reason).toMatch(/quota/);
  });
});
