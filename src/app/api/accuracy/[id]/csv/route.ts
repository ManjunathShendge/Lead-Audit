import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import { toCsv } from '@/lib/accuracy';

export async function GET(request: Request, ctx: RouteContext<'/api/accuracy/[id]/csv'>) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return new Response('Not found.', { status: 404 });
  const run = await db.accuracyRun.findUnique({
    where: { id },
    include: { items: { orderBy: [{ platform: 'asc' }, { handle: 'asc' }] } },
  });
  if (!run) return new Response('Not found.', { status: 404 });
  return new Response(toCsv(run.items), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="accuracy-${run.id}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
