'use client';
import { Search, Check, X, Minus, Globe } from 'lucide-react';
import type { Report } from '@/lib/report';
import type { SeoAudit, SeoCheck } from '@/lib/seo';
import { offsiteKpis, CLICKRANK, SEMRUSH } from '@/lib/seo/benchmarks';
import { seoInsights } from '@/lib/insights';
import { band } from '@/lib/scoring';
import { Ring } from './ring';
import { CriteriaBars } from './channels';
import { ChartInsight } from './insight';
import { Stagger, StaggerItem } from './reveal';

export function CheckResult({ score }: { score: SeoCheck['score'] }) {
  if (score === null)
    return (
      <span className="verdict verdict-unknown">
        <Minus size={11} strokeWidth={3} aria-hidden /> Not measured
      </span>
    );
  if (score === 100)
    return (
      <span className="verdict verdict-pass">
        <Check size={11} strokeWidth={3} aria-hidden /> Good
      </span>
    );
  return (
    <span className={`verdict ${score === 50 ? 'verdict-partial' : 'verdict-fail'}`}>
      {score === 50 ? (
        <Minus size={11} strokeWidth={3} aria-hidden />
      ) : (
        <X size={11} strokeWidth={3} aria-hidden />
      )}{' '}
      {score === 50 ? 'Improve' : 'Fix'}
    </span>
  );
}

type Row = SeoAudit['groups']['good'][number];
function SeoGroup({
  title,
  tone,
  rows,
  empty,
}: {
  title: string;
  tone: 'needs' | 'good';
  rows: Row[];
  empty: string;
}) {
  return (
    <StaggerItem className={`panel seo-group seo-group-${tone}`} hover={false}>
      <h3 className="mini-title">
        {title} <small>{rows.length} checks</small>
      </h3>
      {rows.length ? (
        <table className="seo-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Found</th>
              <th>Benchmark</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k.key}>
                <td>
                  {k.label}
                  <small>{k.category}</small>
                </td>
                <td>{k.found}</td>
                <td>
                  {k.benchmark}
                  <small>{k.source}</small>
                </td>
                <td>
                  <CheckResult score={k.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </StaggerItem>
  );
}

export function SeoSection({ report, seo, print }: { report: Report; seo: SeoAudit; print: boolean }) {
  const g = seo.search;
  const host = report.website?.detail.url ? new URL(report.website.detail.url).hostname : 'Website';
  const bandName = band(seo.score, report.config);
  return (
    <section className="channel-section seo-section">
      <div className="channel-hero panel">
        <Ring score={seo.score} size={112} color="var(--ch-website)" print={print} />
        <div>
          <span className="eyebrow">
            <Search size={13} /> SEO AUDIT
          </span>
          <h2>{host}</h2>
          <div className={`score-band band-${bandName.toLowerCase().replace(' ', '-')}`}>
            <span /> {bandName}
          </div>
          <p className="muted">
            {seo.passed + seo.partial + seo.failed} homepage checks against {CLICKRANK} and Google guidance
            {g ? ', plus live Google results for the site and brand name' : ''}. Shown alongside the score;
            the website score already counts SEO basics.
          </p>
        </div>
        <CriteriaBars
          rows={seo.categories.map((c) => ({
            key: c.key,
            label: c.label,
            score: c.score,
            weight: c.effectiveWeight,
          }))}
          threshold={report.config.thresholds.gapScore}
          color="var(--ch-website)"
        />
      </div>
      <ChartInsight items={seoInsights(report)} />
      {g && (
        <Stagger className="channel-grid seo-visibility">
          <StaggerItem className="panel" hover={false}>
            <h3 className="mini-title">
              <Globe size={14} /> Google results for “{g.brandQuery}”
            </h3>
            <ol className="serp-list">
              {g.topResults.slice(0, 6).map((r) => (
                <li key={r.position} className={r.own ? 'own' : ''}>
                  <span>{r.position}</span>
                  <div>
                    <strong>{r.title || r.url}</strong>
                    <small>{r.url}</small>
                  </div>
                  {r.own && <em>Brand site</em>}
                </li>
              ))}
              {!g.topResults.length && <li className="muted">No organic results returned.</li>}
            </ol>
          </StaggerItem>
          <StaggerItem className="panel" hover={false}>
            <h3 className="mini-title">Index and questions</h3>
            <div className="seo-stat">
              <strong>
                {g.indexedPages === null ? '—' : `${g.indexedLowerBound ? '≥ ' : ''}${g.indexedPages}`}
              </strong>
              <span>pages Google returns for site:{host.replace(/^www\./, '')}</span>
            </div>
            {g.peopleAlsoAsk.length > 0 && (
              <>
                <h3 className="mini-title">People also ask</h3>
                <ul className="paa-list">
                  {g.peopleAlsoAsk.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="muted small-note">
                  Questions searchers ask about the brand: ready-made content topics.
                </p>
              </>
            )}
          </StaggerItem>
        </Stagger>
      )}
      <Stagger className="seo-groups">
        <SeoGroup
          title="Needs improvement"
          tone="needs"
          empty="Every measured check meets its benchmark."
          rows={[...seo.groups.fix, ...seo.groups.improve]}
        />
        <SeoGroup
          title="Working well"
          tone="good"
          empty="No check meets its benchmark yet."
          rows={seo.groups.good}
        />
      </Stagger>
      {seo.groups.info.length > 0 && (
        <div className="panel">
          <h3 className="mini-title">
            Good to know <small>Collected, no pass/fail benchmark</small>
          </h3>
          <table className="seo-table seo-info">
            <tbody>
              {seo.groups.info.map((i) => (
                <tr key={i.label}>
                  <td>{i.label}</td>
                  <td>{i.found}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {seo.groups.unmeasured.length > 0 && (
            <p className="muted small-note">
              Not measured: {seo.groups.unmeasured.map((k) => k.label).join(', ')}.
            </p>
          )}
        </div>
      )}
      <div className="panel">
        <h3 className="mini-title">
          Off-site KPIs to track next
          <small>
            {SEMRUSH} · reference figures from {CLICKRANK}
          </small>
        </h3>
        <table className="seo-table">
          <thead>
            <tr>
              <th>KPI</th>
              <th>Reference</th>
              <th>Needs</th>
            </tr>
          </thead>
          <tbody>
            {offsiteKpis.map((k) => (
              <tr key={k.kpi}>
                <td>{k.kpi}</td>
                <td>{k.reference}</td>
                <td>{k.needs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small-note">
          These need access to the brand’s own analytics or Search Console, so they are not scored here.
        </p>
      </div>
    </section>
  );
}
