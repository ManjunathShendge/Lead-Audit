import { db } from '../db';
import { getCollector } from '../collectors';
import { datedPosts } from '../metrics';
import type { Platform } from '../collectors/types';
import { withTimeout } from './queue';

/**
 * Accuracy items use the same atomic claim, lease and single-retry rules as collector runs,
 * so a crashed worker cannot strand a paid test run.
 */
export async function accuracyTick() {
  const now = new Date();
  const candidates = await db.accuracyItem.findMany({
    where: {
      OR: [
        { state: 'queued', OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
        { state: 'running', leaseUntil: { lte: now } },
      ],
    },
    include: { run: true },
    take: 2,
    orderBy: { id: 'asc' },
  });

  for (const item of candidates) {
    const claim = await db.accuracyItem.updateMany({
      where: { id: item.id, state: item.state, attempts: item.attempts, leaseUntil: item.leaseUntil },
      data: {
        state: 'running',
        attempts: { increment: 1 },
        leaseUntil: new Date(Date.now() + 185_000),
      },
    });
    if (!claim.count) continue;
    console.log(
      JSON.stringify({
        event: 'accuracy.started',
        itemId: item.id,
        platform: item.platform,
        attempt: item.attempts + 1,
      }),
    );
    try {
      if (item.attempts >= 2) throw new Error('Collector lease expired after two attempts.');
      const collector = getCollector(
        item.platform as Platform,
        item.run.mode === 'mock' ? 'mock' : 'live',
        'average',
        new Date(),
      );
      const result = await withTimeout((signal) =>
        collector.collect(item.handle, { postsLimit: 30, signal }),
      );
      const latest = datedPosts(result.posts, new Date())[0]?.publishedAt ?? null;
      await db.accuracyItem.updateMany({
        where: { id: item.id, state: 'running', attempts: item.attempts + 1 },
        data: {
          state: 'done',
          leaseUntil: null,
          followers: result.profile?.followers ?? null,
          totalPosts: result.profile?.totalPosts ?? null,
          lastPostAt: latest,
          costUsd: result.costUsd,
          error: null,
        },
      });
      console.log(JSON.stringify({ event: 'accuracy.done', itemId: item.id, platform: item.platform }));
    } catch (error) {
      const reason =
        error instanceof Error && error.message.startsWith('Collector')
          ? error.message
          : 'Collection unavailable for this account.';
      const retry = item.attempts < 1;
      await db.accuracyItem.updateMany({
        where: { id: item.id, state: 'running', attempts: item.attempts + 1 },
        data: {
          state: retry ? 'queued' : 'failed',
          leaseUntil: retry ? new Date(Date.now() + 1000) : null,
          error: reason,
        },
      });
      console.log(
        JSON.stringify({
          event: retry ? 'accuracy.retry' : 'accuracy.failed',
          itemId: item.id,
          platform: item.platform,
        }),
      );
    }
  }
}
