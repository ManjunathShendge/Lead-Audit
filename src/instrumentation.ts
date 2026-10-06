/** Resumes audits left queued or running by a restart, since there is no separate worker process. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { kickJobs } = await import('./lib/jobs/runner');
  // register() must finish before the server accepts requests, so the loop starts on its own.
  setTimeout(() => void kickJobs('server.start'), 5000).unref?.();
}
