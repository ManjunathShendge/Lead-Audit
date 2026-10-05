import { Prisma } from '@prisma/client';
import { db } from '../db';
import { getCollector } from '../collectors';
import { resultSchema, type CollectorResult, type Platform } from '../collectors/types';
import { buildReport, type Snapshot } from '../report';
import { summaryConfigured } from '../ai/summary';
import { alignmentInputFromAudit, generateAlignment, targetAudienceSchema } from '../ai/alignment';
import { collectChannel } from '../collectors/channels';
import {
  channelResultSchema,
  channelSchema,
  channelTargetsSchema,
  emptyChannelTargets,
  failedChannel,
  type Channel,
  type GbpResult,
  type WebsiteResult,
} from '../collectors/channel-types';
import { handlesSchema } from '../validation';
import { periodPostsLimit, periodSchema, resolveWindow } from '../period';
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
/** Summaries and audience analyses still being written in the background. */
const aiWork = new Set<Promise<void>>();
/** Resolves once every background AI write has finished; used by tests. */
export const aiWorkIdle = () => Promise.all([...aiWork]).then(() => undefined);
export async function finalizeAudits() {
  const audits = await db.audit.findMany({
    where: { state: { in: ['queued', 'running'] } },
    include: { runs: true },
    take: 50,
  });
  for (const audit of audits) {
    if (audit.runs.some((r) => r.state === 'queued' || r.state === 'running')) continue;
    const channelRuns = audit.runs.filter((r) => channelSchema.safeParse(r.platform).success);
    const channelResult = (kind: Channel) => {
      const run = channelRuns.find((r) => r.platform === kind);
      if (!run) return null;
      return run.result
        ? channelResultSchema.parse(run.result)
        : failedChannel(kind, run.error ?? 'Collector returned no data.', audit.createdAt);
    };
    const targets = channelTargetsSchema.safeParse(audit.channels);
    const results = Object.fromEntries(
      audit.runs
        .filter((r) => !channelSchema.safeParse(r.platform).success)
        .map((r) => [
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
      {
        website: channelResult('website') as WebsiteResult | null,
        gbp: channelResult('gbp') as GbpResult | null,
        gbpPresence: (targets.success ? targets.data : emptyChannelTargets()).gbp.presence,
      },
      periodSchema.nullable().catch(null).parse(audit.period),
    );
    const completed = await db.audit.updateMany({
      where: { id: audit.id, state: { in: ['queued', 'running'] } },
      data: { state: 'complete', completedAt: new Date(), report: json(report) },
    });
    console.log(JSON.stringify({ event: 'audit.completed', auditId: audit.id }));
    // The AI summary is never written here: it costs an AI call, so it is written only when someone
    // clicks "Write summary" on the report. The audience analysis is an extra: the audit is already
    // complete and a failure never undoes that. Only the worker that completed the audit writes it, so
    // a race never pays twice. It runs in the background because an analysis can take minutes, and the
    // worker loop must keep collecting other audits meanwhile.
    if (completed.count && summaryConfigured()) {
      const targetAudience = targetAudienceSchema.nullable().catch(null).parse(audit.targetAudience);
      const work = (async () => {
        const alignment = await generateAlignment(
          alignmentInputFromAudit({ ...audit, targetAudience }),
        ).catch(() => null);
        if (alignment) {
          await db.audit.updateMany({ where: { id: audit.id }, data: { alignment: json(alignment) } });
          console.log(JSON.stringify({ event: 'alignment.' + alignment.status, auditId: audit.id }));
        }
      })().catch(() => {
        console.error(JSON.stringify({ event: 'ai.write_failed', auditId: audit.id }));
      });
      aiWork.add(work);
      void work.finally(() => aiWork.delete(work));
    }
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
        const channel = channelSchema.safeParse(run.platform);
        if (channel.success) {
          const result = channelResultSchema.parse(
            await withTimeout((signal) =>
              collectChannel(
                channel.data,
                run.handle,
                run.audit.mode === 'live' ? 'live' : 'mock',
                run.audit.tier as 'strong' | 'average' | 'weak',
                run.audit.createdAt,
                signal,
                run.audit.brand,
              ),
            ),
          );
          if (result.status === 'failed')
            throw new Error(`Collector returned no usable data. ${result.warnings.join(' ')}`.slice(0, 500));
          await db.collectorRun.updateMany({
            where: { id: run.id, state: 'running', attempts: run.attempts + 1 },
            data: {
              state: 'done',
              leaseUntil: null,
              result: json(result),
              raw: json(result.raw),
              costUsd: result.costUsd,
              error: null,
            },
          });
          console.log(JSON.stringify({ event: 'collector.done', jobId: run.id, platform: run.platform }));
          return;
        }
        const collector = getCollector(
          run.platform as Platform,
          run.audit.mode === 'live' ? 'live' : 'mock',
          run.audit.tier as 'strong' | 'average' | 'weak',
          run.audit.createdAt,
        );
        const period = periodSchema.nullable().catch(null).parse(run.audit.period);
        const window = period ? resolveWindow(period, run.audit.createdAt) : undefined;
        const postsLimit = periodPostsLimit(period, run.audit.createdAt);
        const result = await withTimeout((signal) =>
          collector.collect(run.handle, { postsLimit, signal, window }),
        );
        const valid = resultSchema.parse(result);
        // A date-filtered fetch that came back under its limit ran out of posts in range, so it is complete.
        if (window && valid.status === 'ok' && valid.posts.filter((p) => !p.isPinned).length < postsLimit)
          valid.sampleComplete = true;
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
            ...(!retry
              ? {
                  result: json(
                    channelSchema.safeParse(run.platform).success
                      ? failedChannel(run.platform as Channel, reason, run.audit.createdAt)
                      : failed(reason, run.audit.createdAt),
                  ),
                }
              : {}),
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
