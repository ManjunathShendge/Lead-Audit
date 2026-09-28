/** Answers "is what I'm looking at real or synthetic?" from the stored records themselves. */
import { config } from 'dotenv';
import { db } from '../src/lib/db';

config();

async function main() {
  const audits = await db.audit.findMany({
    orderBy: { createdAt: 'desc' },
    include: { runs: true },
  });

  console.log(`\nConfigured collection mode in .env: ${process.env.USE_MOCK_DATA === 'true' ? 'MOCK' : 'LIVE'}`);
  console.log(`Audits stored: ${audits.length}\n`);

  for (const audit of audits) {
    // A mock run records its fixture path in raw.source.synthetic; a live run never does.
    const synthetic = audit.runs.filter((r) => {
      const raw = r.raw as { source?: { synthetic?: boolean } } | null;
      return raw?.source?.synthetic === true;
    }).length;
    const real = audit.runs.length - synthetic;
    console.log(
      `${audit.brand.padEnd(20)} mode=${audit.mode.padEnd(5)} runs=${audit.runs.length} ` +
        `synthetic=${synthetic} real=${real}  ${audit.createdAt.toISOString().slice(0, 16)}`,
    );
  }

  const anyReal = audits.some((a) => a.mode === 'live');
  console.log(
    `\n${anyReal ? 'At least one audit used live collection.' : 'NO audit has used live collection yet. Every report you can open is synthetic demo data.'}`,
  );
  await db.$disconnect();
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await db.$disconnect();
  process.exitCode = 1;
});
