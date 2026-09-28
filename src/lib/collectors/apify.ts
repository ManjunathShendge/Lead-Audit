import { ApifyClient } from 'apify-client';

export class ApifyConfigError extends Error {}

export type ActorResult = { items: Record<string, unknown>[]; costUsd: number | null };

/**
 * Runs one Apify actor and returns its dataset items plus the run's actual USD cost.
 * Failure messages start with "Collector" so the queue surfaces them to the report verbatim.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  { waitSecs = 165, signal }: { waitSecs?: number; signal?: AbortSignal } = {},
): Promise<ActorResult> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new ApifyConfigError('APIFY_TOKEN is not set.');
  if (!actorId) throw new ApifyConfigError('No actor ID is configured.');
  signal?.throwIfAborted();

  const client = new ApifyClient({ token });
  const run = await client.actor(actorId).call(input, { waitSecs });
  signal?.throwIfAborted();
  if (run.status !== 'SUCCEEDED')
    throw new Error(`Collector run for ${actorId} finished with status ${run.status}.`);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return {
    items: items as Record<string, unknown>[],
    costUsd: typeof run.usageTotalUsd === 'number' ? run.usageTotalUsd : null,
  };
}

/** Adds two possibly-unknown costs without turning an unmeasured run into a free one. */
export function addCost(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}
