import { db } from '../db';
import { queueTick } from './queue';
import { accuracyTick } from './accuracy';

/**
 * Runs queued collector and accuracy work inside the web process, so no always-on worker is needed.
 * The loop starts when work is created, and is re-kicked by progress polls, server start and the cron
 * endpoint. It stops once nothing is pending, so an idle app does no polling.
 *
 * Retries and progress are unchanged: they live in the database leases and attempt counts used by
 * queueTick and accuracyTick. Those atomic claims also make it safe if a separate `npm run worker`
 * (Docker) or a second web process runs at the same time.
 */
const TICK_GAP_MS = 1000;
/** A loop hands over after this long; the next poll, cron call or restart picks up anything left. */
const MAX_LOOP_MS = 30 * 60_000;

let loop: Promise<void> | null = null;

/** Audits, collector runs and accuracy items that still need a tick to move forward. */
export async function pendingWork() {
  const active = { state: { in: ['queued', 'running'] } };
  const [audits, runs, items] = await Promise.all([
    db.audit.count({ where: active }),
    db.collectorRun.count({ where: active }),
    db.accuracyItem.count({ where: active }),
  ]);
  return { audits, runs, items, total: audits + runs + items };
}

export function jobsRunning() {
  return loop !== null;
}

/** Starts the job loop unless this process already runs one. Never throws. */
export function kickJobs(reason: string): Promise<void> {
  if (loop) return loop;
  loop = (async () => {
    const startedAt = Date.now();
    let ticks = 0;
    console.log(JSON.stringify({ event: 'jobs.loop_started', reason }));
    try {
      while (Date.now() - startedAt < MAX_LOOP_MS) {
        try {
          await queueTick();
          await accuracyTick();
        } catch (error) {
          console.error(
            JSON.stringify({
              event: 'jobs.tick_failed',
              message: error instanceof Error ? error.message.slice(0, 300) : String(error),
            }),
          );
        }
        ticks++;
        const pending = await pendingWork().catch((error: unknown) => {
          console.error(
            JSON.stringify({
              event: 'jobs.pending_check_failed',
              message: error instanceof Error ? error.message.slice(0, 300) : String(error),
            }),
          );
          return null;
        });
        // An unreachable database ends the loop; the next poll or cron call retries.
        if (!pending?.total) break;
        await new Promise((resolve) => setTimeout(resolve, TICK_GAP_MS));
      }
    } finally {
      console.log(JSON.stringify({ event: 'jobs.loop_stopped', reason, ticks, ms: Date.now() - startedAt }));
      loop = null;
    }
  })();
  return loop;
}
