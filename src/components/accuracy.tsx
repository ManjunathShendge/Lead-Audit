'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Play, RefreshCw, Trash2 } from 'lucide-react';
import { platforms, platformNames, type Platform } from '@/lib/collectors/types';
import {
  gradeItem,
  TARGET_ACCURACY,
  TARGET_COVERAGE,
  type ItemInput,
  type PlatformSummary,
} from '@/lib/accuracy';

type RunSummary = {
  id: string;
  label: string;
  mode: string;
  createdAt: string;
  items: number;
  pending: number;
  costUsd: number;
};
type Item = ItemInput & { id: string; costUsd: number | null; error: string | null };
type RunDetail = {
  id: string;
  label: string;
  mode: string;
  createdAt: string;
  costUsd: number;
  unmeasuredCost: boolean;
  pending: number;
  items: Item[];
  summary: PlatformSummary[];
};

const PLACEHOLDER = `instagram: tier2digital
youtube: @tier2digital
linkedin: tier2digital`;

/** Accepts "platform: handle" or "platform,handle" per line, up to 50 accounts. */
export function parseAccounts(text: string): { platform: Platform; handle: string }[] {
  const out: { platform: Platform; handle: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([a-zA-Z]+)\s*[:,]\s*(.+)$/);
    if (!match) throw new Error(`Cannot read "${trimmed}". Use "platform: handle" per line.`);
    const platform = match[1].toLowerCase() as Platform;
    if (!platforms.includes(platform)) throw new Error(`"${match[1]}" is not a supported platform.`);
    out.push({ platform, handle: match[2].trim() });
  }
  if (!out.length) throw new Error('Add at least one account.');
  if (out.length > 50) throw new Error('Up to 50 accounts per run.');
  return out;
}

export function AccuracyHarness({
  mode,
  ready,
  initialRuns,
}: {
  mode: string;
  ready: Platform[];
  initialRuns: RunSummary[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Record<string, string>>>>({});
  const [saved, setSaved] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/accuracy/${id}`);
    if (!res.ok) return;
    setDetail((await res.json()) as RunDetail);
  }, []);

  const refreshRuns = useCallback(async () => {
    const res = await fetch('/api/accuracy');
    if (res.ok) setRuns(((await res.json()) as { runs: RunSummary[] }).runs);
  }, []);

  // Poll only while something is still collecting.
  useEffect(() => {
    if (!openId) return;
    if (detail && detail.pending === 0) return;
    timer.current = setTimeout(() => {
      void loadDetail(openId);
      void refreshRuns();
    }, 2000);
    return () => clearTimeout(timer.current);
  }, [openId, detail, loadDetail, refreshRuns]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const accounts = parseAccounts(text);
      const res = await fetch('/api/accuracy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, accounts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText('');
      setLabel('');
      await refreshRuns();
      setOpenId(data.id);
      setDetail(null);
      void loadDetail(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start the run.');
    } finally {
      setBusy(false);
    }
  }

  async function saveTruths() {
    if (!detail) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const truths = detail.items.map((item) => {
        const d = draft[item.id] ?? {};
        const num = (key: 'trueFollowers' | 'trueTotalPosts') => {
          const raw = d[key] ?? (item[key] === null ? '' : String(item[key]));
          if (raw.trim() === '') return null;
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 0) throw new Error(`${item.handle}: enter a whole number.`);
          return n;
        };
        const date = (d.trueLastPostAt ?? item.trueLastPostAt ?? '').trim();
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw new Error(`${item.handle}: use YYYY-MM-DD for the last post date.`);
        return {
          id: item.id,
          trueFollowers: num('trueFollowers'),
          trueTotalPosts: num('trueTotalPosts'),
          trueLastPostAt: date || null,
        };
      });
      const res = await fetch(`/api/accuracy/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft({});
      setSaved('Graded and saved.');
      await loadDetail(detail.id);
      await refreshRuns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this accuracy run and its results permanently?')) return;
    const res = await fetch(`/api/accuracy/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (openId === id) {
        setOpenId(null);
        setDetail(null);
      }
      await refreshRuns();
    }
  }

  const field = (item: Item, key: 'trueFollowers' | 'trueTotalPosts' | 'trueLastPostAt') =>
    draft[item.id]?.[key] ?? (item[key] === null ? '' : String(item[key]));

  return (
    <>
      <section className="panel settings-panel">
        <h2>New test run</h2>
        <p className="field-help">
          One account per line as <code>platform: handle</code>. Up to 50. Configured live collectors:{' '}
          {ready.length ? ready.join(', ') : 'none'}.
        </p>
        <label htmlFor="acc-label">Label (optional)</label>
        <input
          id="acc-label"
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Instagram actor evaluation"
        />
        <label htmlFor="acc-accounts">Test accounts</label>
        <textarea
          id="acc-accounts"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="form-footer">
          <span className="muted">
            {mode === 'mock' ? 'Mock mode: no spend' : 'Live mode: each account may cost money'}
          </span>
          <button className="button primary" disabled={busy || !text.trim()} onClick={() => void start()}>
            <Play size={15} /> {busy ? 'Starting…' : 'Run test'}
          </button>
        </div>
      </section>

      <section className="panel settings-panel">
        <h2>Test runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No accuracy runs yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Mode</th>
                  <th>Accounts</th>
                  <th>Pending</th>
                  <th>Cost</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <button
                        className="linklike"
                        onClick={() => {
                          setOpenId(run.id);
                          setDetail(null);
                          setSaved('');
                          void loadDetail(run.id);
                        }}
                      >
                        {run.label || new Date(run.createdAt).toLocaleString('en-IN')}
                      </button>
                    </td>
                    <td>{run.mode}</td>
                    <td>{run.items}</td>
                    <td>{run.pending || '—'}</td>
                    <td>${run.costUsd.toFixed(4)}</td>
                    <td>
                      <button
                        className="button ghost"
                        onClick={() => void remove(run.id)}
                        aria-label="Delete run"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId && (
        <section className="panel settings-panel">
          <div className="handles-heading">
            <h2>{detail?.label || 'Run detail'}</h2>
            <div className="row-actions">
              <button className="button ghost" onClick={() => void loadDetail(openId)}>
                <RefreshCw size={14} /> Refresh
              </button>
              <a className="button ghost" href={`/api/accuracy/${openId}/csv`}>
                <Download size={14} /> CSV
              </a>
            </div>
          </div>
          {!detail ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <p className="field-help">
                Collected cost ${detail.costUsd.toFixed(4)}
                {detail.unmeasuredCost && ' · some runs reported no cost'} ·{' '}
                {detail.pending ? `${detail.pending} still collecting` : 'collection finished'}
              </p>
              <SummaryTable summary={detail.summary} />
              <h3 style={{ marginTop: 22 }}>Enter the true values from the live platform</h3>
              <p className="field-help">
                Counts are correct within 2% (minimum 1). Dates must match exactly, as YYYY-MM-DD in
                Asia/Kolkata. Leave a field blank to exclude it from accuracy.
              </p>
              <div className="table-wrap">
                <table className="accuracy-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>State</th>
                      <th>Followers</th>
                      <th>True</th>
                      <th>Posts</th>
                      <th>True</th>
                      <th>Last post</th>
                      <th>True (YYYY-MM-DD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => {
                      const verdicts = gradeItem(item);
                      return (
                        <tr key={item.id}>
                          <td>
                            <strong>{platformNames[item.platform as Platform] ?? item.platform}</strong>
                            <br />
                            <span className="muted">{item.handle}</span>
                          </td>
                          <td>
                            <span className={`pill ${item.state}`}>{item.state}</span>
                            {item.error && <div className="muted tiny">{item.error}</div>}
                          </td>
                          <Observed value={item.followers} verdict={verdicts.followers} />
                          <td>
                            <input
                              inputMode="numeric"
                              value={field(item, 'trueFollowers')}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  [item.id]: { ...d[item.id], trueFollowers: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <Observed value={item.totalPosts} verdict={verdicts.totalPosts} />
                          <td>
                            <input
                              inputMode="numeric"
                              value={field(item, 'trueTotalPosts')}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  [item.id]: { ...d[item.id], trueTotalPosts: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <Observed
                            value={item.lastPostAt ? item.lastPostAt.slice(0, 10) : null}
                            verdict={verdicts.lastPostAt}
                          />
                          <td>
                            <input
                              placeholder="2026-09-28"
                              value={field(item, 'trueLastPostAt')}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  [item.id]: { ...d[item.id], trueLastPostAt: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {error && <p className="form-error">{error}</p>}
              {saved && <p className="notice">{saved}</p>}
              <div className="form-footer">
                <span className="muted">Accuracy counts only fields where you supplied a truth.</span>
                <button className="button primary" disabled={busy} onClick={() => void saveTruths()}>
                  {busy ? 'Saving…' : 'Grade run'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Observed({ value, verdict }: { value: number | string | null; verdict: string }) {
  return (
    <td className={`observed ${verdict}`}>
      {value === null ? <span className="muted">Not measured</span> : value}
    </td>
  );
}

function SummaryTable({ summary }: { summary: PlatformSummary[] }) {
  if (!summary.length) return <p className="muted">Nothing collected yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Accuracy (target {TARGET_ACCURACY}%)</th>
            <th>Coverage (target {TARGET_COVERAGE}%)</th>
            <th>Graded</th>
            <th>Returned</th>
            <th>Failed</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.platform}>
              <td>{platformNames[s.platform]}</td>
              <td className={s.accuracy === null ? '' : s.accuracyMet ? 'target-met' : 'target-missed'}>
                {s.accuracy === null ? 'Not graded' : `${s.accuracy.toFixed(1)}%`}
              </td>
              <td className={s.coverage === null ? '' : s.coverageMet ? 'target-met' : 'target-missed'}>
                {s.coverage === null ? '—' : `${s.coverage.toFixed(1)}%`}
              </td>
              <td>
                {s.correct}/{s.graded}
              </td>
              <td>
                {s.returned}/{s.attempted}
              </td>
              <td>{s.failed || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
