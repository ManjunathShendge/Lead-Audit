import { db } from '@/lib/db';
import { AccuracyHarness } from '@/components/accuracy';
import { currentMode, liveAvailability } from '@/lib/collectors';
import { platforms } from '@/lib/collectors/types';
import { TARGET_ACCURACY, TARGET_COVERAGE } from '@/lib/accuracy';

export default async function AccuracyPage() {
  const runs = await db.accuracyRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: { items: { select: { id: true, state: true, costUsd: true } } },
  });
  const mode = currentMode();
  const availability = liveAvailability();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVIDENCE BEFORE SPEND</span>
          <h1>Accuracy harness</h1>
          <p>
            Decide whether a scraper is worth paying for. Targets: {TARGET_ACCURACY}% accuracy,{' '}
            {TARGET_COVERAGE}% coverage.
          </p>
        </div>
        <span className="tag">{mode === 'mock' ? 'Mock mode' : 'Live mode'}</span>
      </div>
      {mode === 'mock' ? (
        <div className="notice">
          The server is in mock mode, so runs grade synthetic fixtures and prove only that the harness works.
          Set USE_MOCK_DATA=false to measure real collectors.
        </div>
      ) : (
        <div className="notice">
          Live mode. Each account costs money on paid platforms. Configured now:{' '}
          {platforms.filter((p) => availability[p].ready).join(', ') || 'none'}.
        </div>
      )}
      <AccuracyHarness
        mode={mode}
        ready={platforms.filter((p) => availability[p].ready)}
        initialRuns={runs.map((run) => ({
          id: run.id,
          label: run.label,
          mode: run.mode,
          createdAt: run.createdAt.toISOString(),
          items: run.items.length,
          pending: run.items.filter((i) => i.state === 'queued' || i.state === 'running').length,
          costUsd: run.items.reduce((sum, i) => sum + (i.costUsd ?? 0), 0),
        }))}
      />
    </>
  );
}
