'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { platformSchema, platformNames } from '@/lib/collectors/types';
import { PlatformIcon } from './report/report';
const progressSchema = z.object({
  id: z.string(),
  state: z.enum(['queued', 'running', 'complete']),
  createdAt: z.string(),
  runs: z.array(
    z.object({
      platform: platformSchema,
      state: z.enum(['queued', 'running', 'done', 'failed']),
      error: z.string().nullable(),
      attempts: z.number(),
      costUsd: z.number().nullable(),
    }),
  ),
});
export function Progress({ id, brand }: { id: string; brand: string }) {
  const router = useRouter();
  const [data, setData] = useState<z.infer<typeof progressSchema> | null>(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/audits/${id}`, { signal: controller.signal, cache: 'no-store' });
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok)
          throw new Error(
            res.status === 404 ? 'This audit was deleted.' : 'Connection interrupted. Retrying…',
          );
        const value = progressSchema.parse(await res.json());
        if (stopped) return;
        setData(value);
        setError('');
        setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(value.createdAt)) / 1000)));
        if (value.state === 'complete') {
          router.refresh();
          return;
        }
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Unable to read progress.');
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, router]);
  const done = data?.runs.filter((r) => r.state === 'done' || r.state === 'failed').length ?? 0;
  const total = data?.runs.length ?? 0;
  return (
    <div className="form-panel">
      <span className="eyebrow">BRINGING THE PICTURE TOGETHER</span>
      <h1>
        Auditing {brand}
        <span className="brand-dot">.</span>
      </h1>
      <p>Each platform runs independently. Missing data won’t stop your report.</p>
      <div className="panel" aria-live="polite">
        <div className="section-heading">
          <h2>
            <span className="loading-dot" />{' '}
            {data?.state === 'queued' ? 'Waiting for the worker' : 'Building your report'}
          </h2>
          <span className="tag">{elapsed}s elapsed</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        {data?.runs.map((run) => (
          <div className="progress-row" key={run.platform}>
            <div className="actions">
              <PlatformIcon platform={run.platform} />
              <strong>{platformNames[run.platform]}</strong>
            </div>
            <div>
              <span className={`tag ${run.state === 'done' ? 'good' : ''}`}>{run.state}</span>
              {run.attempts > 1 && <small> · attempt {run.attempts}</small>}
              {run.error && <p className="field-help">{run.error}</p>}
            </div>
          </div>
        ))}
        <p className="field-help">
          {done} of {total} platforms finished · Mock collection costs $0.00
        </p>
        {elapsed > 15 && done === 0 && (
          <div className="notice">
            The queue is waiting for a worker. In a second terminal, run <code>npm run worker</code>.
          </div>
        )}
        <p role="alert" className="error">
          {error}
        </p>
      </div>
    </div>
  );
}
