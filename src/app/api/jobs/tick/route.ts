import { createHash, timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import { jobsRunning, kickJobs, pendingWork } from '@/lib/jobs/runner';
export const runtime = 'nodejs';
const hash = (value: string) => createHash('sha256').update(value).digest();
/**
 * Safety net for on-demand jobs, called by a Hostinger cron job (for example every 5 minutes):
 *   curl -fsS -H "Authorization: Bearer $JOBS_CRON_SECRET" https://your-domain/api/jobs/tick
 * It resumes work left behind by a restart or an idle shutdown and returns immediately.
 * `?key=` is accepted too, for cron panels that cannot set headers.
 */
function authorized(request: Request) {
  const secret = process.env.JOBS_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const given = header || new URL(request.url).searchParams.get('key') || '';
  return timingSafeEqual(hash(given), hash(secret));
}
async function tick(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Not found.' }, { status: 404 });
  try {
    const pending = await pendingWork();
    const running = jobsRunning();
    if (pending.total && !running) after(() => void kickJobs('cron'));
    console.log(JSON.stringify({ event: 'jobs.cron_tick', pending: pending.total, alreadyRunning: running }));
    return Response.json(
      { pending, started: pending.total > 0 && !running, running },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'jobs.cron_failed',
        message: error instanceof Error ? error.message.slice(0, 300) : String(error),
      }),
    );
    return Response.json({ error: 'Job check failed. Check database availability.' }, { status: 503 });
  }
}
export const GET = tick;
export const POST = tick;
