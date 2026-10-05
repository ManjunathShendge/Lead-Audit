import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';
import { defaults, researchedBenchmarks, configSchema } from '../src/lib/scoring/config';
import { serviceDefaults } from '../src/lib/recommendations';
import { platforms, type CollectorResult } from '../src/lib/collectors/types';
import { mockCollector } from '../src/lib/collectors/mock';
import { buildReport, defaultSnapshot, type Handles } from '../src/lib/report';
import { mockChannel } from '../src/lib/collectors/channels';
import type { ChannelTargets, GbpResult, WebsiteResult } from '../src/lib/collectors/channel-types';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function seed() {
  const existing = await db.config.findUnique({ where: { id: 'default' } });
  await db.config.upsert({
    where: { id: 'default' },
    create: { id: 'default', value: json(defaults) },
    update: { value: json(configSchema.parse(existing?.value ?? defaults)) },
  });
  // Researched values replace placeholder rows; rows already saved from the settings page are left alone.
  for (const industry of ['General', 'B2B', 'D2C'] as const)
    for (const platform of [...platforms, 'gbp'] as const) {
      const value = researchedBenchmarks[industry][platform];
      const where = { industry_platform: { industry, platform } };
      const row = await db.benchmark.findUnique({ where });
      if (!row) await db.benchmark.create({ data: { industry, platform, ...value, placeholder: false } });
      else if (row.placeholder) await db.benchmark.update({ where, data: { ...value, placeholder: false } });
    }
  for (const [key, value] of Object.entries(serviceDefaults))
    await db.serviceMapping.upsert({ where: { key }, create: { key, ...value }, update: {} });
  for (const [tier, brand, industry, handle] of [
    ['strong', 'Morrow Studio', 'D2C', 'morrowstudio'],
    ['average', 'Earthkind Living', 'D2C', 'earthkindliving'],
    ['weak', 'Northstar Works', 'B2B', 'northstarworks'],
  ] as const) {
    const id = `demo-${tier}`;
    const existing = await db.audit.findUnique({ where: { id } });
    // Demo audits seeded before website, GBP and SEO scoring are rebuilt so they show every section.
    if (existing && (existing.report as { allGaps?: unknown } | null)?.allGaps) continue;
    if (existing) await db.audit.delete({ where: { id } });
    const asOf = new Date();
    const handles = Object.fromEntries(
      platforms.map((p) => [
        p,
        {
          handle: tier === 'weak' && p === 'linkedin' ? '' : handle,
          presence: tier === 'weak' && p === 'linkedin' ? 'absent' : 'present',
        },
      ]),
    ) as Handles;
    const results: Partial<Record<(typeof platforms)[number], CollectorResult>> = {};
    for (const platform of platforms)
      if (handles[platform].presence === 'present')
        results[platform] = await mockCollector(platform, tier, asOf).collect(handle, { postsLimit: 60 });
    const website = `https://${handle}.example`;
    const channels: ChannelTargets = {
      website: { audit: true },
      gbp: { query: `${brand}, Bengaluru`, presence: 'present' },
    };
    const websiteResult = (await mockChannel('website', website, tier, asOf, brand)) as WebsiteResult;
    const gbpResult = (await mockChannel('gbp', channels.gbp.query, tier, asOf)) as GbpResult;
    const { gbp: gbpBenchmark, ...socialBenchmarks } = researchedBenchmarks[industry];
    const snapshot = { ...defaultSnapshot, benchmarks: socialBenchmarks, gbpBenchmark };
    const report = buildReport(results, handles, industry, asOf, snapshot, {
      website: websiteResult,
      gbp: gbpResult,
      gbpPresence: 'present',
    });
    await db.audit.create({
      data: {
        id,
        brand,
        website,
        channels: json(channels),
        industry,
        handles: json(handles),
        tier,
        config: json(snapshot),
        cacheKey: `demo:${tier}`,
        state: 'complete',
        createdAt: asOf,
        completedAt: asOf,
        report: json(report),
        runs: {
          create: [
            ...Object.entries(results).map(([platform, result]) => ({
              platform,
              handle,
              state: 'done',
              attempts: 1,
              result: json(result),
              raw: json(result.raw),
              costUsd: result.costUsd,
            })),
            ...(
              [
                ['website', website, websiteResult],
                ['gbp', channels.gbp.query, gbpResult],
              ] as const
            ).map(([platform, target, result]) => ({
              platform,
              handle: target,
              state: 'done',
              attempts: 1,
              result: json(result),
              raw: json(result.raw),
              costUsd: result.costUsd,
            })),
          ],
        },
      },
    });
  }
}
seed()
  .then(() => console.log('Seeded configuration, researched benchmarks and three synthetic demo audits.'))
  .finally(() => db.$disconnect());
