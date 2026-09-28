import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';
import { defaults, placeholderBenchmark, configSchema } from '../src/lib/scoring/config';
import { serviceDefaults } from '../src/lib/recommendations';
import { platforms, type CollectorResult } from '../src/lib/collectors/types';
import { mockCollector } from '../src/lib/collectors/mock';
import { buildReport, defaultSnapshot, type Handles } from '../src/lib/report';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function seed() {
  const existing = await db.config.findUnique({ where: { id: 'default' } });
  await db.config.upsert({
    where: { id: 'default' },
    create: { id: 'default', value: json(defaults) },
    update: { value: json(configSchema.parse(existing?.value ?? defaults)) },
  });
  for (const industry of ['General', 'B2B', 'D2C'])
    for (const platform of [...platforms, 'gbp'])
      await db.benchmark.upsert({
        where: { industry_platform: { industry, platform } },
        create: { industry, platform, ...placeholderBenchmark },
        update: {},
      });
  for (const [key, value] of Object.entries(serviceDefaults))
    await db.serviceMapping.upsert({ where: { key }, create: { key, ...value }, update: {} });
  for (const [tier, brand, industry, handle] of [
    ['strong', 'Morrow Studio', 'D2C', 'morrowstudio'],
    ['average', 'Earthkind Living', 'D2C', 'earthkindliving'],
    ['weak', 'Northstar Works', 'B2B', 'northstarworks'],
  ] as const) {
    const id = `demo-${tier}`;
    if (await db.audit.findUnique({ where: { id } })) continue;
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
    const report = buildReport(results, handles, industry, asOf);
    await db.audit.create({
      data: {
        id,
        brand,
        website: `https://${handle}.example`,
        industry,
        handles: json(handles),
        tier,
        config: json(defaultSnapshot),
        cacheKey: `demo:${tier}`,
        state: 'complete',
        createdAt: asOf,
        completedAt: asOf,
        report: json(report),
        runs: {
          create: Object.entries(results).map(([platform, result]) => ({
            platform,
            handle,
            state: 'done',
            attempts: 1,
            result: json(result),
            raw: json(result.raw),
            costUsd: result.costUsd,
          })),
        },
      },
    });
  }
}
seed()
  .then(() => console.log('Seeded configuration, placeholder benchmarks and three synthetic demo audits.'))
  .finally(() => db.$disconnect());
