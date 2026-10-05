'use client';
import { useState } from 'react';
import { Sparkles, RefreshCw, ArrowRight, TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react';
import { storedSummarySchema, type StoredSummary } from '@/lib/ai/summary-types';
import './summary.css';

/** "In plain words" line under a report section; renders nothing without a summary. */
export function PlainWords({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p className="plain-words">
      <Sparkles size={12} aria-hidden />
      <span>
        <b>In plain words · </b>
        {text}
      </span>
    </p>
  );
}

export function SummaryCard({
  auditId,
  summary,
  onChange,
  aiEnabled,
  print,
}: {
  auditId: string;
  summary: StoredSummary | null;
  onChange: (s: StoredSummary) => void;
  aiEnabled: boolean;
  print: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Written only on request: nothing here calls the AI until someone clicks the button.
  async function regenerate() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/summary`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to write the summary.');
      onChange(storedSummarySchema.parse(data.summary));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to write the summary.');
    } finally {
      setBusy(false);
    }
  }

  const ok = summary?.status === 'ok' ? summary : null;
  if (print && !ok) return null;
  if (!ok && !aiEnabled) return null;

  const button = !print && aiEnabled && (
    <button className="button summary-button" onClick={regenerate} disabled={busy}>
      <RefreshCw size={13} className={busy ? 'spin' : ''} />
      {busy ? 'Writing…' : ok ? 'Regenerate' : 'Write summary'}
    </button>
  );

  if (!ok)
    return (
      <section className="panel summary-card summary-empty" aria-live="polite">
        <div className="summary-top">
          <span className="eyebrow">
            <Sparkles size={12} /> IN PLAIN WORDS
          </span>
          {button}
        </div>
        <p className="muted">
          {summary?.status === 'failed'
            ? `No summary: ${summary.reason}`
            : 'A short, plain-language summary for people who will not read the whole report.'}
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    );

  const c = ok.content;
  return (
    <section className="panel summary-card" aria-label="Plain-language summary">
      <div className="summary-top">
        <span className="eyebrow">
          <Sparkles size={12} /> IN PLAIN WORDS
        </span>
        {button}
      </div>
      <h2>{c.headline}</h2>
      <p className="summary-verdict">{c.verdict}</p>
      <div className="summary-columns">
        {c.strengths.length > 0 && (
          <div>
            <h3>
              <TrendingUp size={14} /> Working well
            </h3>
            <ul>
              {c.strengths.map((s, i) => (
                <li key={i}>
                  <strong>{s.point}</strong>
                  <span>{s.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.problems.length > 0 && (
          <div>
            <h3>
              <TrendingDown size={14} /> Holding it back
            </h3>
            <ul>
              {c.problems.map((s, i) => (
                <li key={i}>
                  <strong>{s.point}</strong>
                  <span>
                    {s.evidence} <em>→ {s.service}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="summary-fix">
        <span>Start here</span>
        <strong>{c.firstFix.action}</strong>
        <p>{c.firstFix.why}</p>
        <em>
          {c.firstFix.service} <ArrowRight size={12} />
        </em>
      </div>
      <p className="summary-provenance">
        <ShieldCheck size={12} aria-hidden />
        Written by AI ({ok.model}) from this report’s numbers only. Every figure was checked against the audit
        before display.
      </p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
