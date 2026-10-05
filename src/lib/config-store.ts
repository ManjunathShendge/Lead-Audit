import { z } from 'zod';
import { db } from './db';
import { platforms } from './collectors/types';
import { configSchema, benchmarkSchema, placeholderBenchmark } from './scoring/config';
import type { Snapshot } from './report';
export async function loadSnapshot(industry: string): Promise<Snapshot> {
  const [config, benchmarks, mappings] = await Promise.all([
    db.config.findUnique({ where: { id: 'default' } }),
    db.benchmark.findMany({ where: { industry } }),
    db.serviceMapping.findMany(),
  ]);
  if (!config) throw new Error('Configuration is missing. Run npm run db:seed.');
  return {
    settings: configSchema.parse(config.value),
    benchmarks: Object.fromEntries(
      platforms.map((p) => {
        const value = benchmarks.find((b) => b.platform === p);
        return [p, benchmarkSchema.parse(value)];
      }),
    ) as Snapshot['benchmarks'],
    gbpBenchmark: benchmarkSchema.parse(benchmarks.find((b) => b.platform === 'gbp') ?? placeholderBenchmark),
    services: z
      .record(z.string(), z.object({ service: z.string(), explanation: z.string() }))
      .parse(
        Object.fromEntries(mappings.map((m) => [m.key, { service: m.service, explanation: m.explanation }])),
      ),
  };
}
