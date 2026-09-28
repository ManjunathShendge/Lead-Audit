'use client';
import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { platforms, platformNames, type Platform } from '@/lib/collectors/types';
import type { ScoreConfig } from '@/lib/scoring/config';

export type BenchmarkRow = {
  industry: 'General' | 'B2B' | 'D2C';
  platform: Platform;
  postsTarget: number;
  engagementTarget: number;
  followerLow: number;
  followerHigh: number;
  reviewLow: number;
  reviewHigh: number;
  placeholder: boolean;
};

const INDUSTRIES = ['General', 'B2B', 'D2C'] as const;
const BENCHMARK_FIELDS = [
  ['postsTarget', 'Posts / month'],
  ['engagementTarget', 'Engagement %'],
  ['followerLow', 'Follower low'],
  ['followerHigh', 'Follower high'],
  ['reviewLow', 'Review low'],
  ['reviewHigh', 'Review high'],
] as const;

export function SettingsForm({
  initialConfig,
  initialBenchmarks,
}: {
  initialConfig: ScoreConfig;
  initialBenchmarks: BenchmarkRow[];
}) {
  const [config, setConfig] = useState(initialConfig);
  const [benchmarks, setBenchmarks] = useState(initialBenchmarks);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const num = (value: string) => (value.trim() === '' ? 0 : Number(value));

  async function save() {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, benchmarks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved(data.note);
      setBenchmarks((rows) => rows.map((r) => ({ ...r, placeholder: false })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm('Restore the seeded default weights? Benchmarks are left unchanged.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/settings', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reset.');
      setBusy(false);
    }
  }

  const weightGroup = <K extends keyof ScoreConfig>(key: K, title: string, hint?: string) => {
    const values = config[key] as Record<string, number>;
    const total = Object.values(values).reduce((a, b) => a + b, 0);
    return (
      <section className="panel">
        <h2>{title}</h2>
        {hint && <p className="field-help">{hint}</p>}
        <table>
          <tbody>
            {Object.entries(values).map(([field, value]) => (
              <tr key={field}>
                <td style={{ textTransform: 'capitalize' }}>
                  <label htmlFor={`${String(key)}-${field}`}>{field}</label>
                </td>
                <td style={{ width: 110 }}>
                  <input
                    id={`${String(key)}-${field}`}
                    inputMode="decimal"
                    value={value}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, [key]: { ...values, [field]: num(e.target.value) } }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={total === 100 ? 'field-help' : 'field-help warn'}>
          Total {total}
          {total !== 100 && ' — weights are re-normalised, so this need not be 100.'}
        </p>
      </section>
    );
  };

  return (
    <>
      <div className="grid-2">
        {weightGroup(
          'channels',
          'Channel weights',
          'A channel with no collector is excluded and the rest are re-normalised.',
        )}
        {weightGroup('components', 'Social component weights')}
        {weightGroup('website', 'Website criteria · collector later')}
        {weightGroup('gbp', 'Google Business Profile · collector later')}
      </div>

      <section className="panel settings-panel">
        <h2>Platform weights and relevance by industry</h2>
        <p className="field-help">
          A relevant platform confirmed as having no account scores zero. An irrelevant one is excluded.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Industry</th>
                {platforms.map((p) => (
                  <th key={p}>{platformNames[p]}</th>
                ))}
                <th>Relevant platforms</th>
              </tr>
            </thead>
            <tbody>
              {INDUSTRIES.map((industry) => (
                <tr key={industry}>
                  <td>{industry}</td>
                  {platforms.map((p) => (
                    <td key={p} style={{ width: 92 }}>
                      <input
                        aria-label={`${industry} ${p} weight`}
                        inputMode="decimal"
                        value={config.industries[industry].weights[p]}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            industries: {
                              ...c.industries,
                              [industry]: {
                                ...c.industries[industry],
                                weights: {
                                  ...c.industries[industry].weights,
                                  [p]: num(e.target.value),
                                },
                              },
                            },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <div className="check-row">
                      {platforms.map((p) => (
                        <label key={p} className="check">
                          <input
                            type="checkbox"
                            checked={config.industries[industry].relevant.includes(p)}
                            onChange={(e) =>
                              setConfig((c) => ({
                                ...c,
                                industries: {
                                  ...c.industries,
                                  [industry]: {
                                    ...c.industries[industry],
                                    relevant: e.target.checked
                                      ? [...c.industries[industry].relevant, p]
                                      : c.industries[industry].relevant.filter((x) => x !== p),
                                  },
                                },
                              }))
                            }
                          />
                          {platformNames[p]}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel settings-panel">
        <h2>Platforms included in audits</h2>
        <div className="check-row">
          {platforms.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={config.enabled.includes(p)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    enabled: e.target.checked ? [...c.enabled, p] : c.enabled.filter((x) => x !== p),
                  }))
                }
              />
              {platformNames[p]}
            </label>
          ))}
        </div>
      </section>

      <section className="panel settings-panel">
        <h2>Thresholds and score bands</h2>
        <div className="threshold-grid">
          {Object.entries(config.thresholds).map(([field, value]) => (
            <div key={field}>
              <label htmlFor={`th-${field}`} style={{ textTransform: 'capitalize' }}>
                {field.replace(/([A-Z])/g, ' $1')}
              </label>
              <input
                id={`th-${field}`}
                inputMode="decimal"
                value={value}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    thresholds: { ...c.thresholds, [field]: num(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="panel settings-panel">
        <h2>Benchmarks</h2>
        <p className="field-help">
          {benchmarks.some((b) => b.placeholder)
            ? 'Placeholder benchmarks, replace them with Tier2 data. Saving marks a row as reviewed.'
            : 'These values have been reviewed and are no longer marked as placeholders.'}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Industry</th>
                <th>Platform</th>
                {BENCHMARK_FIELDS.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((row, index) => (
                <tr key={`${row.industry}-${row.platform}`}>
                  <td>{row.industry}</td>
                  <td>{platformNames[row.platform]}</td>
                  {BENCHMARK_FIELDS.map(([field, label]) => (
                    <td key={field} style={{ width: 104 }}>
                      <input
                        aria-label={`${row.industry} ${row.platform} ${label}`}
                        inputMode="decimal"
                        value={row[field]}
                        onChange={(e) =>
                          setBenchmarks((rows) =>
                            rows.map((r, i) => (i === index ? { ...r, [field]: num(e.target.value) } : r)),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <span className={row.placeholder ? 'pill queued' : 'pill done'}>
                      {row.placeholder ? 'Placeholder' : 'Reviewed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}
      {saved && <p className="notice">{saved}</p>}
      <div className="form-footer sticky-actions">
        <span className="muted">Changes apply to new audits only. Past audits keep their snapshot.</span>
        <div className="row-actions">
          <button className="button ghost" disabled={busy} onClick={() => void reset()}>
            <RotateCcw size={14} /> Restore defaults
          </button>
          <button className="button primary" disabled={busy} onClick={() => void save()}>
            <Save size={15} /> {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </>
  );
}
