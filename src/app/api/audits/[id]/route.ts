import { after } from 'next/server';
import { db } from '@/lib/db';
import { apiGuard } from '@/lib/http';
import { idSchema } from '@/lib/validation';
import { kickJobs } from '@/lib/jobs/runner';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const audit = await db.audit.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      state: true,
      createdAt: true,
      runs: { select: { platform: true, state: true, error: true, attempts: true, costUsd: true } },
    },
  });
  if (!audit) return Response.json({ error: 'Audit not found.' }, { status: 404 });
  // Progress polls keep the job loop alive, so an audit resumes even after a restart.
  if (audit.state === 'queued' || audit.state === 'running') after(() => void kickJobs('audit.poll'));
  return Response.json(audit, { headers: { 'Cache-Control': 'no-store' } });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await apiGuard(request, true);
  if (guard) return guard;
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) return Response.json({ error: 'Invalid audit ID.' }, { status: 400 });
  const result = await db.audit.deleteMany({ where: { id: parsed.data } });
  return Response.json(result.count ? { ok: true } : { error: 'Audit not found.' }, {
    status: result.count ? 200 : 404,
  });
}
