import { z } from 'zod';
import { after } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard, jsonInput } from '@/lib/http';
import { platformSchema } from '@/lib/collectors/types';
import { normalizeHandle } from '@/lib/validation';
import { currentMode, liveAvailability } from '@/lib/collectors';
import { summarize } from '@/lib/accuracy';
import { kickJobs } from '@/lib/jobs/runner';

const MAX_ACCOUNTS = 50;

const inputSchema = z
  .object({
    label: z.string().trim().max(120).default(''),
    accounts: z
      .array(z.object({ platform: platformSchema, handle: z.string().trim().min(1).max(100) }))
      .min(1)
      .max(MAX_ACCOUNTS),
  })
  .strict();

export async function GET(request: Request) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const runs = await db.accuracyRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: { items: true },
  });
  return Response.json({
    runs: runs.map((run) => ({
      id: run.id,
      label: run.label,
      mode: run.mode,
      createdAt: run.createdAt,
      items: run.items.length,
      pending: run.items.filter((i) => i.state === 'queued' || i.state === 'running').length,
      costUsd: run.items.reduce((sum, i) => sum + (i.costUsd ?? 0), 0),
      summary: summarize(run.items),
    })),
  });
}

export async function POST(request: Request) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await jsonInput(request));
  } catch {
    return Response.json(
      { error: `Provide between 1 and ${MAX_ACCOUNTS} accounts as platform and handle pairs.` },
      { status: 400 },
    );
  }

  const mode = currentMode();
  const availability = liveAvailability();
  const accounts: { platform: string; handle: string }[] = [];
  for (const account of input.accounts) {
    let handle: string;
    try {
      handle = normalizeHandle(account.platform, account.handle);
    } catch (error) {
      return Response.json(
        { error: `${account.platform} "${account.handle}": ${(error as Error).message}` },
        { status: 400 },
      );
    }
    if (mode === 'live' && !availability[account.platform].ready)
      return Response.json(
        { error: `${account.platform}: ${availability[account.platform].reason}` },
        { status: 409 },
      );
    if (!accounts.some((a) => a.platform === account.platform && a.handle === handle))
      accounts.push({ platform: account.platform, handle });
  }

  const run = await db.accuracyRun.create({
    data: {
      label: input.label,
      mode,
      results: {} as Prisma.InputJsonValue,
      items: { create: accounts },
    },
  });
  console.log(JSON.stringify({ event: 'accuracy.created', runId: run.id, items: accounts.length, mode }));
  after(() => void kickJobs('accuracy.created'));
  return Response.json({ id: run.id, items: accounts.length, mode }, { status: 201 });
}
