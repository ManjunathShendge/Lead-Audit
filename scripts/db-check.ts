/** Confirms the generated Prisma client can actually reach every table, including the newest ones. */
import { config } from 'dotenv';
import { db } from '../src/lib/db';

config();

async function main() {
  const [audits, runs, accuracyRuns, accuracyItems, configRow, benchmarks] = await Promise.all([
    db.audit.count(),
    db.collectorRun.count(),
    db.accuracyRun.count(),
    db.accuracyItem.count(),
    db.config.findUnique({ where: { id: 'default' } }),
    db.benchmark.count(),
  ]);
  console.table({ audits, runs, accuracyRuns, accuracyItems, benchmarks, configSeeded: !!configRow });
  console.log('\nPrisma client reached every table, including AccuracyItem. Generation is sufficient.');
  await db.$disconnect();
}

void main().catch(async (error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  await db.$disconnect();
  process.exitCode = 1;
});
