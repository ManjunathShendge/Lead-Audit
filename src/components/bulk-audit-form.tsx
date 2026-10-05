'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Check, FlaskConical, Search, ArrowUpRight } from 'lucide-react';
import { platforms, platformNames, type Platform } from '@/lib/collectors/types';
import { emptyHandles, normalizeHandle } from '@/lib/validation';
import type { Handles } from '@/lib/report';
import { emptyChannelTargets } from '@/lib/collectors/channel-types';
import { PlatformIcon } from './report/report';
import { Select } from './select';

export const MAX_BULK = 25;

type RowState = 'waiting' | 'discovering' | 'ready' | 'error' | 'starting' | 'queued' | 'cached' | 'failed';
interface Row {
  key: number;
  source: string;
  state: RowState;
  include: boolean;
  brand: string;
  website: string;
  handles: Handles;
  message: string;
  auditId?: string;
}

const pill: Record<RowState, string> = {
  waiting: 'queued',
  discovering: 'running',
  ready: 'done',
  error: 'failed',
  starting: 'running',
  queued: 'done',
  cached: 'done',
  failed: 'failed',
};
const label: Record<RowState, string> = {
  waiting: 'Waiting',
  discovering: 'Crawling',
  ready: 'Ready',
  error: 'Not found',
  starting: 'Starting',
  queued: 'Audit queued',
  cached: 'Recent audit',
  failed: 'Failed',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fallbackBrand(website: string, handles: Handles) {
  if (website)
    try {
      return new URL(website).hostname.replace(/^www\./, '').split('.')[0];
    } catch {}
  return platforms.map((p) => handles[p].handle).find(Boolean) ?? '';
}

export function BulkAuditForm({ mockCollection }: { mockCollection: boolean }) {
  const [step, setStep] = useState(1);
  const [list, setList] = useState('');
  const [industry, setIndustry] = useState('D2C');
  const [tier, setTier] = useState('average');
  const [force, setForce] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lines = list
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const patch = (key: number, update: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...update } : r)));

  async function discoverAll() {
    setError('');
    if (!lines.length) return setError('Add at least one website or handle list.');
    if (lines.length > MAX_BULK) return setError(`Bulk audits are limited to ${MAX_BULK} brands at a time.`);
    const initial: Row[] = [...new Set(lines)].map((source, key) => ({
      key,
      source,
      state: 'waiting',
      include: true,
      brand: '',
      website: '',
      handles: emptyHandles(),
      message: '',
    }));
    setRows(initial);
    setStep(2);
    setBusy(true);
    // Discovery allows only two crawls at once server-wide, so run one at a time and back off when busy.
    for (const row of initial) {
      patch(row.key, { state: 'discovering' });
      let attempt = 0;
      for (;;) {
        try {
          const res = await fetch('/api/discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: row.source }),
          });
          const data = await res.json();
          if (res.status === 503 && attempt++ < 4) {
            await sleep(3000);
            continue;
          }
          if (!res.ok) throw new Error(data.error);
          const website = data.website ?? '';
          const found = platforms.filter((p) => data.handles[p].presence === 'present').length;
          patch(row.key, {
            state: 'ready',
            brand: data.brand || fallbackBrand(website, data.handles),
            website,
            handles: data.handles,
            message: `${found} account${found === 1 ? '' : 's'} found${
              data.warnings?.length ? ` · ${data.warnings.length} warning(s)` : ''
            }`,
          });
        } catch (e) {
          patch(row.key, {
            state: 'error',
            include: false,
            message: e instanceof Error ? e.message : 'Unable to read this input.',
          });
        }
        break;
      }
    }
    setBusy(false);
  }

  async function runAll() {
    setError('');
    const selected = rows.filter((r) => r.include && ['ready', 'failed', 'cached'].includes(r.state));
    if (!selected.length) return setError('Select at least one brand to audit.');
    setBusy(true);
    for (const row of selected) {
      if (row.state === 'cached' && !force) continue;
      patch(row.key, { state: 'starting', message: '' });
      try {
        if (!row.brand.trim()) throw new Error('Add a brand name.');
        const handles = Object.fromEntries(
          platforms.map((p) => {
            let handle = '';
            try {
              handle = row.handles[p].handle ? normalizeHandle(p, row.handles[p].handle) : '';
            } catch (e) {
              throw new Error(`${platformNames[p]}: ${e instanceof Error ? e.message : 'invalid handle'}`);
            }
            return [p, { handle, presence: handle ? 'present' : 'unknown' }];
          }),
        ) as Handles;
        const channels = emptyChannelTargets();
        channels.website.audit = Boolean(row.website);
        const res = await fetch('/api/audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand: row.brand.trim(),
            website: row.website,
            industry,
            tier,
            handles,
            channels,
            force,
          }),
        });
        const data = await res.json();
        if (data.cached) {
          patch(row.key, {
            state: 'cached',
            handles,
            auditId: data.cached.id,
            message: `Reused audit from ${new Date(data.cached.createdAt).toLocaleDateString()}`,
          });
          continue;
        }
        if (!res.ok) throw new Error(data.error);
        patch(row.key, { state: 'queued', handles, auditId: data.id, message: '' });
      } catch (e) {
        patch(row.key, {
          state: 'failed',
          message: e instanceof Error ? e.message : 'Unable to start audit.',
        });
      }
    }
    setBusy(false);
  }

  const editHandle = (key: number, platform: Platform, value: string) =>
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              handles: {
                ...r.handles,
                [platform]: { handle: value, presence: value ? 'present' : 'unknown' },
              },
            }
          : r,
      ),
    );
  const editable = (r: Row) => !busy && ['ready', 'failed', 'cached'].includes(r.state);
  const selectable = rows.filter(
    (r) => r.include && (['ready', 'failed'].includes(r.state) || (r.state === 'cached' && force)),
  ).length;
  const started = rows.filter((r) => r.state === 'queued' || r.state === 'cached').length;

  return (
    <div className="form-panel bulk-panel">
      <div className="steps">
        <span className={step === 1 ? 'current' : ''}>01 / Brand list</span>
        <ArrowRight size={13} />
        <span className={step === 2 ? 'current' : ''}>02 / Review & run</span>
      </div>
      <div className="panel">
        <span className="eyebrow">MANY BRANDS, ONE PASS</span>
        <h2>{step === 1 ? 'Audit a whole list at once.' : 'Check the accounts, then run them all.'}</h2>
        <p>
          {step === 1
            ? 'One brand per line. Each website is crawled for social links before anything is collected.'
            : 'Blank handles are treated as not confirmed and excluded from scoring, never scored as zero.'}
        </p>
        <div className="notice">
          <FlaskConical size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />
          {mockCollection
            ? 'Discovery crawls the real websites. Collection is in mock mode · no paid API calls.'
            : `Live mode · every audit calls real services and may cost money. ${MAX_BULK} brands max per batch.`}
        </div>
        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void discoverAll();
            }}
          >
            <label htmlFor="bulk-list">Websites or handles, one brand per line</label>
            <textarea
              id="bulk-list"
              rows={9}
              value={list}
              onChange={(e) => setList(e.target.value)}
              placeholder={
                'earthkindliving.com\nmorrowstudio.com\ninstagram: northstarworks, linkedin: northstar-works'
              }
            />
            <p className="field-help">
              {lines.length} brand{lines.length === 1 ? '' : 's'} · to give one brand several handles,
              separate them with commas on the same line.
            </p>
            <div className="grid-2">
              <div>
                <label htmlFor="bulk-industry">Industry profile (all brands)</label>
                <Select
                  id="bulk-industry"
                  value={industry}
                  onChange={setIndustry}
                  options={[
                    { value: 'General', label: 'General' },
                    { value: 'D2C', label: 'D2C / consumer brand' },
                    { value: 'B2B', label: 'B2B / business services' },
                  ]}
                />
              </div>
              {mockCollection && (
                <div>
                  <label htmlFor="bulk-tier">Synthetic data scenario</label>
                  <Select
                    id="bulk-tier"
                    value={tier}
                    onChange={setTier}
                    options={[
                      { value: 'strong', label: 'Strong presence' },
                      { value: 'average', label: 'Developing presence' },
                      { value: 'weak', label: 'Weak presence + private / hidden data' },
                    ]}
                  />
                </div>
              )}
            </div>
            <div className="form-footer">
              <Link className="button" href="/audits/new">
                <ArrowLeft size={14} />
                Single audit
              </Link>
              <button className="button primary" disabled={busy || !lines.length}>
                <Search size={16} />
                Find accounts for {lines.length || ''} brand{lines.length === 1 ? '' : 's'}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAll();
            }}
          >
            <div className="table-wrap">
              <table className="accuracy-table bulk-table">
                <thead>
                  <tr>
                    <th aria-label="Include" />
                    <th>Brand</th>
                    {platforms.map((p) => (
                      <th key={p} title={platformNames[p]}>
                        <PlatformIcon platform={p} size={13} />
                      </th>
                    ))}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${r.brand || r.source}`}
                          checked={r.include}
                          disabled={!editable(r)}
                          onChange={(e) => patch(r.key, { include: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Brand name for ${r.source}`}
                          value={r.brand}
                          maxLength={100}
                          disabled={!editable(r)}
                          placeholder="Brand name"
                          onChange={(e) => patch(r.key, { brand: e.target.value })}
                        />
                        <small className="muted bulk-source">{r.website || r.source}</small>
                      </td>
                      {platforms.map((p) => (
                        <td key={p}>
                          <input
                            aria-label={`${platformNames[p]} handle for ${r.brand || r.source}`}
                            value={r.handles[p].handle}
                            maxLength={256}
                            disabled={!editable(r)}
                            placeholder="—"
                            onChange={(e) => editHandle(r.key, p, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        {r.auditId ? (
                          <Link href={`/audits/${r.auditId}`} className={`pill ${pill[r.state]}`}>
                            {label[r.state]} <ArrowUpRight size={10} />
                          </Link>
                        ) : (
                          <span className={`pill ${pill[r.state]}`}>{label[r.state]}</span>
                        )}
                        {r.message && <small className="muted bulk-source">{r.message}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="check" style={{ marginTop: 18 }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              Run fresh audits even when a recent matching audit exists
            </label>
            <div className="form-footer">
              <button type="button" className="button" disabled={busy} onClick={() => setStep(1)}>
                <ArrowLeft size={14} />
                Back
              </button>
              <span className="actions">
                {started > 0 && !busy && (
                  <Link className="button" href="/history">
                    View audit library
                  </Link>
                )}
                <button className="button primary" disabled={busy || !selectable}>
                  <Check size={16} />
                  {busy ? 'Working…' : `Run ${selectable} audit${selectable === 1 ? '' : 's'}`}
                </button>
              </span>
            </div>
          </form>
        )}
        <p className="error" role="alert">
          {error}
        </p>
      </div>
    </div>
  );
}
