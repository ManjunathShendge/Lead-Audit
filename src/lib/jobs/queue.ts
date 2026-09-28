import { Prisma } from '@prisma/client';
import { db } from '../db';
import { getCollector } from '../collectors';
import { resultSchema, type CollectorResult, type Platform } from '../collectors/types';
import { buildReport, type Snapshot } from '../report';
import { handlesSchema } from '../validation';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms = 180_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Collector timed out after 180 seconds.'));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function failed(reason: string, asOf: Date): CollectorResult {
  return {
    status: 'failed',
    profile: null,
    posts: [],
    raw: null,
    costUsd: null,
    warnings: [reason],
    fetchedAt: asOf.toISOString(),
    sampleComplete: false,
    subscriberHidden: false,
  };
}
export async function finalizeAudits() {
  const audits = await db.audit.findMany({
    where: { state: { in: ['queued', 'running'] } },
    include: { runs: true },
    take: 50,
  });
  for (const audit of audits) {
    if (audit.runs.some((r) => r.state === 'queued' || r.state === 'running')) continue;
    const results = Object.fromEntries(
      audit.runs.map((r) => [
        r.platform,
        r.result
          ? resultSchema.parse(r.result)
          : failed(r.error ?? 'Collector returned no data.', audit.createdAt),
      ]),
    );
    const report = buildReport(
      results,
      handlesSchema.parse(audit.handles),
      audit.industry as keyof Snapshot['settings']['industries'],
      audit.createdAt,
      audit.config as unknown as Snapshot,
    );
    await db.audit.updateMany({
      where: { id: audit.id, state: { in: ['queued', 'running'] } },
      data: { state: 'complete', completedAt: new Date(), report: json(report) },
    });
    console.log(JSON.stringify({ event: 'audit.completed', auditId: audit.id }));
  }
}
export async function queueTick() {
  const now = new Date();
  const candidates = await db.collectorRun.findMany({
    where: {
      OR: [
        { state: 'queued', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
        { state: 'running', leaseUntil: { lte: now } },
      ],
    },
    include: { audit: true },
    take: 4,
    orderBy: { id: 'asc' },
  });
  await Promise.all(
    candidates.map(async (run) => {
      const claim = await db.collectorRun.updateMany({
        where: { id: run.id, state: run.state, attempts: run.attempts, leaseUntil: run.leaseUntil },
        data: { state: 'running', attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 185_000) },
      });
      if (!claim.count) return;
      await db.audit.updateMany({ where: { id: run.auditId, state: 'queued' }, data: { state: 'running' } });
      console.log(
        JSON.stringify({
          event: 'collector.started',
          jobId: run.id,
          platform: run.platform,
          attempt: run.attempts + 1,
        }),
      );
      try {
        if (run.attempts >= 2) throw new Error('Collector lease expired after two attempts.');
        const collector = getCollector(
          run.platform as Platform,
          run.audit.mode === 'live' ? 'live' : 'mock',
          run.audit.tier as 'strong' | 'average' | 'weak',
          run.audit.createdAt,
        );
        const result = await withTimeout((signal) =>
          collector.collect(run.handle, { postsLimit: 60, signal }),
        );
        const valid = resultSchema.parse(result);
        if (valid.status === 'failed') throw new Error('Collector returned a failed result.');
        await db.collectorRun.updateMany({
          where: { id: run.id, state: 'running', attempts: run.attempts + 1 },
          data: {
            state: 'done',
            leaseUntil: null,
            result: json(valid),
            raw: json(valid.raw),
            costUsd: valid.costUsd,
            error: null,
          },
        });
        console.log(JSON.stringify({ event: 'collector.done', jobId: run.id, platform: run.platform }));
      } catch (error) {
        const reason =
          error instanceof Error && error.message.startsWith('Collector')
            ? error.message
            : 'Collection unavailable; retry limit or configuration prevented collection.';
        const retry = run.attempts < 1;
        await db.collectorRun.updateMany({
          where: { id: run.id, state: 'running', attempts: run.attempts + 1 },
          data: {
            state: retry ? 'queued' : 'failed',
            leaseUntil: retry ? new Date(Date.now() + 1000) : null,
            error: reason,
            ...(!retry ? { result: json(failed(reason, run.audit.createdAt)) } : {}),
          },
        });
        console.log(
          JSON.stringify({
            event: retry ? 'collector.retry' : 'collector.failed',
            jobId: run.id,
            platform: run.platform,
          }),
        );
      }
    }),
  );
  await finalizeAudits();
}
