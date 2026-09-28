import { z } from 'zod';
import { db } from '@/lib/db';
import { apiGuard, jsonInput } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import { summarize } from '@/lib/accuracy';

const truthSchema = z
  .object({
    truths: z
      .array(
        z.object({
          id: idSchema,
          trueFollowers: z.number().int().min(0).nullable(),
          trueTotalPosts: z.number().int().min(0).nullable(),
          trueLastPostAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD in Asia/Kolkata.')
            .nullable(),
        }),
      )
      .max(50),
  })
  .strict();

export async function GET(request: Request, ctx: RouteContext<'/api/accuracy/[id]'>) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return Response.json({ error: 'Not found.' }, { status: 404 });
  const run = await db.accuracyRun.findUnique({
    where: { id },
    include: { items: { orderBy: [{ platform: 'asc' }, { handle: 'asc' }] } },
  });
  if (!run) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({
    id: run.id,
    label: run.label,
    mode: run.mode,
    createdAt: run.createdAt,
    costUsd: run.items.reduce((sum, i) => sum + (i.costUsd ?? 0), 0),
    unmeasuredCost: run.items.some((i) => i.state === 'done' && i.costUsd === null),
    pending: run.items.filter((i) => i.state === 'queued' || i.state === 'running').length,
    items: run.items,
    summary: summarize(run.items),
  });
}

/** Stores the tester's observed-from-the-live-platform truth values. */
export async function PATCH(request: Request, ctx: RouteContext<'/api/accuracy/[id]'>) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return Response.json({ error: 'Not found.' }, { status: 404 });
  let input: z.infer<typeof truthSchema>;
  try {
    input = truthSchema.parse(await jsonInput(request));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? (error.issues[0]?.message ?? 'Check the entered values.')
            : 'Check the entered values.',
      },
      { status: 400 },
    );
  }
  const run = await db.accuracyRun.findUnique({ where: { id }, select: { id: true } });
  if (!run) return Response.json({ error: 'Not found.' }, { status: 404 });
  for (const truth of input.truths)
    await db.accuracyItem.updateMany({
      where: { id: truth.id, runId: id },
      data: {
        trueFollowers: truth.trueFollowers,
        trueTotalPosts: truth.trueTotalPosts,
        trueLastPostAt: truth.trueLastPostAt,
      },
    });
  const items = await db.accuracyItem.findMany({ where: { runId: id } });
  const summary = summarize(items);
  await db.accuracyRun.update({
    where: { id },
    data: {
      results: JSON.parse(JSON.stringify({ summary, gradedAt: new Date().toISOString() })),
      costUsd: items.reduce((sum, i) => sum + (i.costUsd ?? 0), 0),
    },
  });
  return Response.json({ summary });
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/accuracy/[id]'>) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return Response.json({ error: 'Not found.' }, { status: 404 });
  const deleted = await db.accuracyRun.deleteMany({ where: { id } });
  if (!deleted.count) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({ deleted: true });
}
