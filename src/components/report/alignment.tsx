'use client';
import { useEffect, useState } from 'react';
import {
  Crosshair,
  RefreshCw,
  Pencil,
  UsersRound,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { platformNames } from '@/lib/collectors/types';
import {
  storedAlignmentSchema,
  targetAudienceSchema,
  type ClassifiedPost,
  type StoredAlignment,
  type TargetAudience,
} from '@/lib/ai/alignment-types';
import { AudienceFields, draftFrom, type AudienceDraft } from '../audience-fields';
import './alignment.css';

type Ok = Extract<StoredAlignment, { status: 'ok' }>;

const verdict = (score: number | null) =>
  score === null
    ? { label: 'Not measured', tone: 'none' }
    : score >= 70
      ? { label: 'Well targeted', tone: 'on' }
      : score >= 40
        ? { label: 'Partly targeted', tone: 'partial' }
        : { label: 'Mostly off target', tone: 'off' };
const fitLabel = { on: 'On target', partial: 'Partly relevant', off: 'Off target' } as const;
const websiteFitLabel = {
  strong: 'Speaks to the audience',
  partial: 'Partly speaks to the audience',
  weak: 'Does not speak to the audience',
  unknown: 'Homepage text not available',
} as const;
const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const fmt = (n: number | null) =>
  n === null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-IN') : `${n}`;

function FitBar({ on, partial, off }: { on: number; partial: number; off: number }) {
  const total = on + partial + off;
  return (
    <div
      className="fit-bar"
      role="img"
      aria-label={`${on} on target, ${partial} partly relevant, ${off} off target`}
    >
      {on > 0 && <span className="on" style={{ width: `${pct(on, total)}%` }} />}
      {partial > 0 && <span className="partial" style={{ width: `${pct(partial, total)}%` }} />}
      {off > 0 && <span className="off" style={{ width: `${pct(off, total)}%` }} />}
    </div>
  );
}

function PostExample({ post, personas }: { post: ClassifiedPost; personas: string[] }) {
  return (
    <li className={`align-post ${post.fit}`}>
      <div className="align-post-meta">
        <span>{platformNames[post.platform]}</span>
        {post.publishedAt && (
          <span>
            {new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </span>
        )}
        <span>
          {post.interactions === null
            ? 'interactions not measured'
            : `${fmt(post.interactions)} interactions`}
        </span>
      </div>
      <p>“{post.text.length > 200 ? `${post.text.slice(0, 200)}…` : post.text}”</p>
      <div className="align-post-why">
        <strong>{fitLabel[post.fit]}</strong>
        {post.persona !== null && personas[post.persona] ? ` · ${personas[post.persona]}` : ''} —{' '}
        {post.reason}
        {post.url && (
          <a href={post.url} target="_blank" rel="noreferrer">
            View <ArrowUpRight size={11} />
          </a>
        )}
      </div>
    </li>
  );
}

function AudienceEditor({
  auditId,
  industry,
  initial,
  inferred,
  busy,
  onSubmit,
  onCancel,
}: {
  auditId: string;
  industry: string;
  initial: TargetAudience | null;
  /** The audience the last analysis inferred, offered as a starting point. */
  inferred: TargetAudience | null;
  busy: boolean;
  onSubmit: (t: TargetAudience | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AudienceDraft>(draftFrom(initial ?? inferred));
  return (
    <form
      className="align-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const t = targetAudienceSchema.parse({
          description: draft.description,
          personas: draft.personas
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 6),
          locations: draft.locations,
        });
        onSubmit(t.description || t.personas.length || t.locations ? t : null);
      }}
    >
      {!initial && inferred && (
        <p className="field-help">
          Pre-filled with the audience the AI inferred. Edit it to match who the brand really sells to, then
          re-analyse.
        </p>
      )}
      <AudienceFields
        idPrefix="align"
        value={draft}
        onChange={setDraft}
        industry={industry}
        aiEnabled
        requestSuggestion={async () => {
          const res = await fetch('/api/audience/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auditId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? 'Unable to suggest an audience.');
          return data.suggestion;
        }}
      />
      <p className="field-help">
        Uses the posts already collected, so nothing is re-scraped. Leave everything blank to let the analysis
        infer the audience. One AI request.
      </p>
      <div className="actions">
        <button className="button primary" disabled={busy}>
          <RefreshCw size={14} className={busy ? 'spin' : ''} />
          {busy ? 'Analysing… this can take a few minutes' : 'Re-analyse alignment'}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AlignmentSection({
  auditId,
  initial,
  targetAudience: initialAudience,
  aiEnabled,
  completedAt,
  print,
  industry,
}: {
  auditId: string;
  initial: StoredAlignment | null;
  targetAudience: TargetAudience | null;
  aiEnabled: boolean;
  completedAt: string | null;
  print: boolean;
  industry: string;
}) {
  const [alignment, setAlignment] = useState(initial);
  const [audience, setAudience] = useState(initialAudience);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The worker writes the analysis after the summary; wait for it for a few minutes.
  const [waiting, setWaiting] = useState(
    () => !initial && aiEnabled && !print && !!completedAt && Date.now() - Date.parse(completedAt) < 480_000,
  );

  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const res = await fetch(`/api/audits/${auditId}/alignment`, { cache: 'no-store' });
        const data = await res.json();
        const parsed = storedAlignmentSchema.safeParse(data.alignment);
        if (!stopped && parsed.success) {
          setAlignment(parsed.data);
          setWaiting(false);
          return;
        }
      } catch {
        /* keep polling until the time limit */
      }
      if (stopped) return;
      if (Date.now() - started > 480_000) setWaiting(false);
      else timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting, auditId]);

  async function analyse(targetAudience?: TargetAudience | null) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/alignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: targetAudience === undefined ? '' : JSON.stringify({ targetAudience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to analyse alignment.');
      setAlignment(storedAlignmentSchema.parse(data.alignment));
      setAudience(targetAudienceSchema.nullable().catch(null).parse(data.targetAudience));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to analyse alignment.');
    } finally {
      setBusy(false);
    }
  }

  const ok: Ok | null = alignment?.status === 'ok' ? alignment : null;
  if (print && !ok) return null;

  const heading = (
    <div className="align-top">
      <span className="eyebrow">
        <Crosshair size={12} /> AUDIENCE ALIGNMENT
      </span>
      {!print && aiEnabled && !editing && (
        <span className="actions">
          <button
            className="button summary-button"
            onClick={() => setEditing(true)}
            disabled={busy || waiting}
          >
            <Pencil size={13} />
            {audience ? 'Edit target audience' : 'Set target audience'}
          </button>
          {ok && (
            <button
              className="button summary-button"
              onClick={() => void analyse()}
              disabled={busy || waiting}
            >
              <RefreshCw size={13} className={busy ? 'spin' : ''} />
              Re-analyse
            </button>
          )}
        </span>
      )}
    </div>
  );
  const inferred: TargetAudience | null =
    alignment?.status === 'ok' && alignment.audienceSource === 'inferred'
      ? {
          description: alignment.content.audience.summary.slice(0, 600),
          personas: alignment.content.audience.personas.map((p) => p.name.slice(0, 80)).slice(0, 6),
          locations: '',
        }
      : null;
  const editor = editing && (
    <AudienceEditor
      auditId={auditId}
      industry={industry}
      initial={audience}
      inferred={inferred}
      busy={busy}
      onSubmit={(t) => void analyse(t)}
      onCancel={() => setEditing(false)}
    />
  );

  if (!ok)
    return (
      <section className="panel align-section align-empty" id="audience-alignment" aria-live="polite">
        {heading}
        <h2>Is the content reaching the right people?</h2>
        <p className="muted">
          {!aiEnabled
            ? 'Audience alignment needs ANTHROPIC_KEY on the server.'
            : waiting
              ? 'Reading every collected post and comparing it with the target audience. This can take a few minutes…'
              : alignment?.status === 'failed'
                ? `No analysis: ${alignment.reason}`
                : 'Compare every collected post with who the brand wants to reach.'}
        </p>
        {!waiting && aiEnabled && !editing && (
          <button className="button primary" onClick={() => void analyse()} disabled={busy}>
            <RefreshCw size={14} className={busy ? 'spin' : ''} />
            {busy ? 'Analysing…' : 'Analyse alignment'}
          </button>
        )}
        {editor}
        {error && <p className="error">{error}</p>}
      </section>
    );

  const c = ok.content;
  const s = ok.stats;
  const personas = c.audience.personas.map((p) => p.name);
  const v = verdict(s.score);
  const topOn = ok.posts
    .filter((p) => p.fit === 'on')
    .sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1))
    .slice(0, 3);
  const offs = ok.posts
    .filter((p) => p.fit === 'off')
    .sort((a, b) => (b.interactions ?? -1) - (a.interactions ?? -1))
    .slice(0, 3);
  const measuredPlatforms = s.platforms.map((p) => platformNames[p.platform]).join(', ');

  return (
    <section className="panel align-section" id="audience-alignment" aria-label="Audience alignment">
      {heading}
      {editor}
      <div className="align-hero">
        <div>
          <h2>{c.headline}</h2>
          <p className="muted">
            Based on the {s.posts} most recent public posts across {measuredPlatforms}.
          </p>
        </div>
        <div className={`align-score ${v.tone}`}>
          <strong>
            {s.score ?? '—'}
            <small>/100</small>
          </strong>
          <span>{v.label}</span>
        </div>
      </div>

      <div className="align-grid">
        <div className="align-card">
          <div className="align-card-head">
            <h3>
              <UsersRound size={14} /> Target audience
            </h3>
            <span className={`align-source ${ok.audienceSource}`}>
              {ok.audienceSource === 'provided' ? 'Set by your team' : 'Inferred by AI · confirm it'}
            </span>
          </div>
          <p>{c.audience.summary}</p>
          {ok.targetAudience?.locations && <p className="muted">Markets: {ok.targetAudience.locations}</p>}
          <ul className="persona-list">
            {c.audience.personas.map((p, i) => {
              const stat = s.personas[i];
              return (
                <li key={p.name}>
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </div>
                  <div className="persona-stat">
                    <b>{stat?.posts ?? 0}</b>
                    <span>posts · {stat?.sharePercent ?? 0}%</span>
                    <div className="share-bar">
                      <span style={{ width: `${Math.max(stat?.sharePercent ?? 0, 0)}%` }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {s.personas.some((p) => p.posts === 0) && (
            <p className="align-warn">
              No posts address{' '}
              {s.personas
                .filter((p) => p.posts === 0)
                .map((p) => p.name)
                .join(', ')}
              .
            </p>
          )}
        </div>

        <div className="align-card">
          <h3>Where the posts land</h3>
          <div className="align-split">
            <div className="on">
              <b>{s.on}</b>
              <span>On target</span>
            </div>
            <div className="partial">
              <b>{s.partial}</b>
              <span>Partly relevant</span>
            </div>
            <div className="off">
              <b>{s.off}</b>
              <span>Off target</span>
            </div>
          </div>
          <FitBar on={s.on} partial={s.partial} off={s.off} />
          <table className="align-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Posts</th>
                <th>Fit</th>
                <th>Score</th>
                <th title="Average likes + comments + shares per post">Avg interactions: relevant / off</th>
              </tr>
            </thead>
            <tbody>
              {s.platforms.map((p) => (
                <tr key={p.platform}>
                  <td>{platformNames[p.platform]}</td>
                  <td>{p.posts}</td>
                  <td className="fit-cell">
                    <FitBar on={p.on} partial={p.partial} off={p.off} />
                  </td>
                  <td>{p.score ?? '—'}</td>
                  <td>
                    {fmt(p.avgRelevant)} / {fmt(p.avgOff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted tiny">
            Relevant = on target or partly relevant. Comparing interactions shows whether the audience
            responds more to content made for them.
          </p>
        </div>
      </div>

      <div className="align-grid">
        {s.themes.length > 0 && (
          <div className="align-card">
            <h3>Content themes</h3>
            <ul className="theme-list">
              {s.themes.map((t) => (
                <li key={t.name}>
                  <span>{t.name}</span>
                  <span className="muted">{t.posts} posts</span>
                  <span
                    className={`theme-fit ${(t.relevantPercent ?? 0) >= 60 ? 'on' : (t.relevantPercent ?? 0) >= 30 ? 'partial' : 'off'}`}
                  >
                    {t.relevantPercent ?? '—'}% relevant
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="align-card">
          <h3>
            <Globe size={14} /> Website message
          </h3>
          <span className={`website-fit ${c.websiteFit.fit}`}>{websiteFitLabel[c.websiteFit.fit]}</span>
          <p>{c.websiteFit.verdict}</p>
        </div>
      </div>

      <div className="summary-columns align-findings">
        {c.working.length > 0 && (
          <div>
            <h3>
              <TrendingUp size={14} /> Reaching the audience
            </h3>
            <ul>
              {c.working.map((w, i) => (
                <li key={i}>
                  <strong>{w.point}</strong>
                  <span>{w.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.gaps.length > 0 && (
          <div>
            <h3>
              <TrendingDown size={14} /> Missing the audience
            </h3>
            <ul>
              {c.gaps.map((g, i) => (
                <li key={i}>
                  <strong>{g.point}</strong>
                  <span>
                    {g.evidence} <em>→ {g.service}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {c.recommendations.length > 0 && (
        <div className="align-recs">
          <h3>How to realign the content</h3>
          <ol>
            {c.recommendations.map((r, i) => (
              <li key={i}>
                <strong>{r.action}</strong>
                <p>{r.why}</p>
                <em>
                  {r.service} <ArrowRight size={12} />
                </em>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(topOn.length > 0 || offs.length > 0) && (
        <div className="align-grid align-examples">
          {topOn.length > 0 && (
            <div>
              <h3>Best on-target posts</h3>
              <ul>
                {topOn.map((p) => (
                  <PostExample key={p.ref} post={p} personas={personas} />
                ))}
              </ul>
            </div>
          )}
          {offs.length > 0 && (
            <div>
              <h3>Off-target posts</h3>
              <ul>
                {offs.map((p) => (
                  <PostExample key={p.ref} post={p} personas={personas} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="summary-provenance">
        <ShieldCheck size={12} aria-hidden />
        Posts labelled by AI ({ok.model}); every count and percentage is calculated from those labels and the
        collected post numbers. This shows whether the content speaks to the audience. It cannot show who
        actually follows or sees it. That needs the brand&rsquo;s own Instagram Insights or LinkedIn
        analytics.
      </p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
