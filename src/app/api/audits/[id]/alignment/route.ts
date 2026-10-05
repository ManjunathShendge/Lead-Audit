import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import { summaryConfigured } from '@/lib/ai/summary';
import { aiKeyHelp } from '@/lib/ai/provider';
import {
  alignmentInputFromAudit,
  audienceProvided,
  generateAlignment,
  targetAudienceSchema,
} from '@/lib/ai/alignment';
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Current alignment analysis, polled by the report while the worker writes it. Free: no AI call. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    select: { alignment: true, targetAudience: true },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  return Response.json(
    { alignment: audit.alignment, targetAudience: audit.targetAudience },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Re-runs the analysis on the posts already collected, optionally with a new target audience.
 * No social data is re-collected; each call is one paid AI request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  let body: { targetAudience?: z.infer<typeof targetAudienceSchema> | null };
  try {
    // An empty body re-runs with the audience already stored on the audit.
    const text = await request.text();
    if (text.length > 16000) throw new Error('Request too large.');
    body = z
      .object({ targetAudience: targetAudienceSchema.nullable().optional() })
      .strict()
      .parse(text ? JSON.parse(text) : {});
  } catch {
    return Response.json({ error: 'Check the target audience fields.' }, { status: 400 });
  }
  if (!summaryConfigured())
    return Response.json({ error: `Audience analysis needs an AI key. ${aiKeyHelp}` }, { status: 409 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    include: { runs: { select: { platform: true, result: true } } },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  if (audit.state !== 'complete')
    return Response.json({ error: 'The audit has not finished yet.' }, { status: 409 });
  const targetAudience =
    body.targetAudience === undefined
      ? targetAudienceSchema.nullable().catch(null).parse(audit.targetAudience)
      : audienceProvided(body.targetAudience)
        ? body.targetAudience
        : null;
  const alignment = await generateAlignment(alignmentInputFromAudit({ ...audit, targetAudience }));
  await db.audit.updateMany({
    where: { id: audit.id },
    data: {
      alignment: json(alignment),
      targetAudience: targetAudience ? json(targetAudience) : Prisma.DbNull,
    },
  });
  console.log(
    JSON.stringify({ event: `alignment.${alignment.status}`, auditId: audit.id, source: 'manual' }),
  );
  return Response.json({ alignment, targetAudience });
}
