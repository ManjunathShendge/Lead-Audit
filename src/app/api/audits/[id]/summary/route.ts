import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import type { Report } from '@/lib/report';
import { generateSummary, summaryConfigured } from '@/lib/ai/summary';
import { aiKeyHelp } from '@/lib/ai/provider';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Current stored summary, if one was written on request. Free: no AI call. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const audit = await db.audit.findUnique({ where: { id: parsed.data }, select: { summary: true } });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  return Response.json({ summary: audit.summary }, { headers: { 'Cache-Control': 'no-store' } });
}

/** (Re)generate the AI summary for a finished audit. Each call is one paid AI request. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  if (!summaryConfigured())
    return Response.json({ error: `AI summaries need an AI key. ${aiKeyHelp}` }, { status: 409 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    select: { id: true, brand: true, report: true },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  if (!audit.report) return Response.json({ error: 'The audit has not finished yet.' }, { status: 409 });
  const summary = await generateSummary(audit.report as unknown as Report, audit.brand);
  await db.audit.updateMany({ where: { id: audit.id }, data: { summary: json(summary) } });
  console.log(JSON.stringify({ event: `summary.${summary.status}`, auditId: audit.id, source: 'manual' }));
  return Response.json({ summary });
}
