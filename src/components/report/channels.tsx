'use client';
import {
  Check,
  X,
  Minus,
  Globe,
  MapPin,
  Star,
  Gauge,
  Search,
  Radar,
  MousePointerClick,
  Newspaper,
} from 'lucide-react';
import type { Report } from '@/lib/report';
import { platformNames } from '@/lib/collectors/types';
import { band } from '@/lib/scoring';
import { Ring } from './ring';
import { ChartInsight } from './insight';
import { Stagger, StaggerItem, GrowBar } from './reveal';
import { websiteInsights, vitalsInsights, gbpInsights } from '@/lib/insights';
import './channels.css';

type Website = NonNullable<Report['website']>;
type Gbp = NonNullable<Report['gbp']>;
const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? 'Not measured'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
const bandClass = (s: string) => `band-${s.toLowerCase().replace(' ', '-')}`;

export function ChannelIcon({ channel, size = 16 }: { channel: 'website' | 'gbp'; size?: number }) {
  const Icon = channel === 'website' ? Globe : MapPin;
  return (
    <span className={`platform-icon channel-${channel}`}>
      <Icon size={size} />
    </span>
  );
}

/** A status mark that never relies on colour alone: icon + word. */
export function Verdict({
  value,
  yes = 'Yes',
  no = 'No',
}: {
  value: boolean | null;
  yes?: string;
  no?: string;
}) {
  if (value === null)
    return (
      <span className="verdict verdict-unknown">
        <Minus size={11} strokeWidth={3} aria-hidden /> Not measured
      </span>
    );
  return value ? (
    <span className="verdict verdict-pass">
      <Check size={11} strokeWidth={3} aria-hidden /> {yes}
    </span>
  ) : (
    <span className="verdict verdict-fail">
      <X size={11} strokeWidth={3} aria-hidden /> {no}
    </span>
  );
}

/**
 * Horizontal 0–100 bars for a channel's criteria, with the gap threshold drawn on every track and
 * the effective weight beside each bar, so the reader sees both "how good" and "how much it counts".
 */
export function CriteriaBars({
  rows,
  threshold,
  color,
}: {
  rows: { key: string; label: string; score: number | null; weight: number; note?: string }[];
  threshold: number;
  color: string;
}) {
  return (
    <div className="criteria-bars" role="table" aria-label="Criteria scores">
      {rows.map((r) => (
        <div className="criteria-row" role="row" key={r.key}>
          <span className="criteria-label" role="cell">
            {r.label}
            <small>{r.weight > 0 ? `${fmt(r.weight, 0)}% of score` : 'Shown only · 0% weight'}</small>
          </span>
          <span
            className="criteria-track"
            role="cell"
            title={`${r.label}: ${r.score === null ? 'Not measured' : `${r.score.toFixed(1)} / 100`}${r.note ? ` · ${r.note}` : ''}`}
          >
            {r.score !== null && (
              <GrowBar
                className="criteria-fill"
                width={Math.max(r.score, 1.5)}
                style={{ background: color }}
              />
            )}
            <b className="criteria-threshold" style={{ left: `${threshold}%` }} aria-hidden />
          </span>
          <strong role="cell" className={r.score === null ? 'muted' : r.score < threshold ? 'below' : ''}>
            {r.score === null ? '—' : Math.round(r.score)}
          </strong>
        </div>
      ))}
      <p className="criteria-key">
        <b aria-hidden /> Line at {threshold}: anything below it is listed as an opportunity.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Overall composition
// ---------------------------------------------------------------------------------------------

const channelOrder = ['website', 'social', 'gbp'] as const;
const channelLabel = { website: 'Website', social: 'Social', gbp: 'Google Business' };

/**
 * How the headline score is built: each channel's score times its effective weight is its
 * contribution, and the contributions stack to the overall score.
 */
export function ScoreComposition({ report, print }: { report: Report; print: boolean }) {
  const scores = report.channelScores ?? { website: null, social: report.social, gbp: null };
  const weights = report.overall.weights as Record<string, number>;
  const parts = channelOrder.map((c) => ({
    key: c,
    score: scores[c],
    weight: weights[c] ?? 0,
    configured: report.config.channels[c],
    contribution: scores[c] === null ? 0 : ((scores[c] as number) * (weights[c] ?? 0)) / 100,
  }));
  const total = report.overall.score;
  return (
    <section className="panel composition-panel" aria-label="How the overall score is built">
      <div className="composition-head">
        <div>
          <h2>How the {report.overall.label.toLowerCase()} is built</h2>
          <p>Each channel’s score × its weight. Unmeasured channels are left out and the rest re-weighted.</p>
        </div>
        <strong>{total === null ? '—' : total.toFixed(0)}</strong>
      </div>
      <div
        className="composition-bar"
        role="img"
        aria-label={parts
          .map((p) => `${channelLabel[p.key]} contributes ${p.contribution.toFixed(1)}`)
          .join(', ')}
      >
        {parts
          .filter((p) => p.contribution > 0)
          .map((p) => (
            <span
              key={p.key}
              className={`composition-seg ch-${p.key}`}
              style={{ width: `${p.contribution}%` }}
              title={`${channelLabel[p.key]}: ${p.score?.toFixed(1)} × ${p.weight.toFixed(0)}% = ${p.contribution.toFixed(1)} points`}
            >
              {p.contribution >= 7 && <em>{p.contribution.toFixed(0)}</em>}
            </span>
          ))}
        {total !== null && total < 99.5 && (
          <span
            className="composition-rest"
            style={{ width: `${100 - total}%` }}
            title={`${(100 - total).toFixed(1)} points of headroom`}
          />
        )}
      </div>
      <div className="composition-scale" aria-hidden>
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <Stagger className="composition-grid">
        {parts.map((p) => (
          <StaggerItem
            key={p.key}
            className={p.score === null ? 'composition-card unmeasured' : 'composition-card'}
          >
            <i className={`legend-swatch ch-${p.key}`} aria-hidden />
            <Ring score={p.score} size={64} color={`var(--ch-${p.key})`} print={print} />
            <div>
              <strong>{channelLabel[p.key]}</strong>
              <span>{p.score === null ? 'Not measured' : band(p.score, report.config)}</span>
              <small>
                {p.score === null
                  ? `Configured ${p.configured}% · excluded`
                  : `${p.weight.toFixed(0)}% weight → ${p.contribution.toFixed(1)} pts`}
              </small>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Social score build: platforms × components
// ---------------------------------------------------------------------------------------------

const componentLabels = {
  activity: 'Activity',
  engagement: 'Engagement',
  audience: 'Audience',
  completeness: 'Profile',
};

export function SocialScoreMatrix({ report, colors }: { report: Report; colors: Record<string, string> }) {
  const keys = Object.keys(componentLabels) as (keyof typeof componentLabels)[];
  return (
    <div className="score-matrix" role="table" aria-label="Social component scores by platform">
      <div className="matrix-row matrix-head" role="row">
        <span role="columnheader">Platform</span>
        {keys.map((k) => (
          <span role="columnheader" key={k}>
            {componentLabels[k]}
            <small>{report.config.components[k]}% weight</small>
          </span>
        ))}
        <span role="columnheader">Score</span>
      </div>
      {report.cards.map((c) => (
        <div className="matrix-row" role="row" key={c.platform}>
          <span role="rowheader" className="matrix-platform">
            <i style={{ background: colors[c.platform] }} aria-hidden />
            {platformNames[c.platform]}
          </span>
          {keys.map((k) => {
            const v = c.components[k];
            return (
              <span
                role="cell"
                key={k}
                className="matrix-cell"
                title={`${platformNames[c.platform]} · ${componentLabels[k]}: ${v === null ? 'Not measured' : v.toFixed(1)} · effective weight ${fmt(c.weights[k], 1)}%`}
              >
                <span className="matrix-track">
                  {v !== null && (
                    <GrowBar width={Math.max(v, 2)} style={{ background: colors[c.platform] }} />
                  )}
                </span>
                <em className={v === null ? 'muted' : v < report.config.thresholds.gapScore ? 'below' : ''}>
                  {v === null ? '—' : Math.round(v)}
                </em>
              </span>
            );
          })}
          <strong role="cell" className="matrix-score">
            {c.score === null ? '—' : Math.round(c.score)}
            <small>
              {c.score === null
                ? c.status === 'absent'
                  ? 'no account'
                  : 'n/a'
                : `${fmt(report.platformWeights[c.platform], 0)}% of social`}
            </small>
          </strong>
        </div>
      ))}
      <p className="criteria-key">
        Bars run 0–100. Numbers in <span className="below">this colour</span> fall below{' '}
        {report.config.thresholds.gapScore} and become opportunities. — means not measured and excluded.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------------------------

/** Google's published Core Web Vitals zones: good / needs improvement / poor. */
const VITALS = [
  { key: 'lcp', label: 'Largest Contentful Paint', unit: 's', good: 2.5, poor: 4, max: 8, digits: 1 },
  { key: 'inp', label: 'Interaction to Next Paint', unit: 'ms', good: 200, poor: 500, max: 1000, digits: 0 },
  { key: 'cls', label: 'Cumulative Layout Shift', unit: '', good: 0.1, poor: 0.25, max: 0.5, digits: 2 },
] as const;

function VitalMeter({
  label,
  value,
  unit,
  good,
  poor,
  max,
  digits,
}: {
  label: string;
  value: number | null;
  unit: string;
  good: number;
  poor: number;
  max: number;
  digits: number;
}) {
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const status = value === null ? null : value <= good ? 'good' : value <= poor ? 'needs' : 'poor';
  return (
    <div className="vital">
      <div className="vital-head">
        <span>{label}</span>
        <strong>
          {value === null ? 'Not measured' : `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`}
        </strong>
      </div>
      <div className="vital-track" title={`Good ≤ ${good}${unit}, poor > ${poor}${unit}`}>
        <span className="zone zone-good" style={{ width: pos(good) }} />
        <span
          className="zone zone-needs"
          style={{ left: pos(good), width: `calc(${pos(poor)} - ${pos(good)})` }}
        />
        <span className="zone zone-poor" style={{ left: pos(poor), right: 0 }} />
        {value !== null && <i className="vital-marker" style={{ left: pos(value) }} aria-hidden />}
      </div>
      <div className="vital-foot">
        {status === null ? (
          <Verdict value={null} />
        ) : status === 'good' ? (
          <Verdict value yes="Good" />
        ) : (
          <Verdict value={false} no={status === 'needs' ? 'Needs improvement' : 'Poor'} />
        )}
        <small>
          Passes at ≤ {good}
          {unit}
        </small>
      </div>
    </div>
  );
}

function Checklist({ items }: { items: { label: string; value: boolean | null; points?: number }[] }) {
  return (
    <ul className="checklist">
      {items.map((i) => (
        <li key={i.label}>
          <Verdict value={i.value} yes="" no="" />
          <span>{i.label}</span>
          {i.points !== undefined && <small>{i.points} pts</small>}
        </li>
      ))}
    </ul>
  );
}

export function WebsiteSection({
  report,
  website,
  print,
}: {
  report: Report;
  website: Website;
  print: boolean;
}) {
  const d = website.detail;
  const t = report.config.thresholds;
  const runs = d.pagespeed.runs;
  const parts = report.config.websiteParts;
  const vitals = {
    lcp: d.pagespeed.lcpMs === null ? null : d.pagespeed.lcpMs / 1000,
    inp: d.pagespeed.inpMs,
    cls: d.pagespeed.cls,
  };
  const criteriaRows = [
    { key: 'performance', label: 'Performance', note: 'PageSpeed + Core Web Vitals' },
    { key: 'seo', label: 'SEO basics', note: 'PageSpeed SEO + on-page checklist' },
    { key: 'tracking', label: 'Tracking installed', note: 'Analytics and ad pixels' },
    { key: 'conversion', label: 'Conversion basics', note: 'Form, CTA, WhatsApp, call' },
    { key: 'freshness', label: 'Content freshness', note: 'Blog recency, copyright year' },
  ].map((r) => ({
    ...r,
    score: website.criteria[r.key as keyof typeof website.criteria],
    weight: (website.weights as Record<string, number>)[r.key] ?? 0,
  }));
  const host = d.url ? new URL(d.url).hostname : 'Website';
  return (
    <section className="channel-section">
      <div className="channel-hero panel">
        <Ring score={website.score} size={112} color="var(--ch-website)" print={print} />
        <div>
          <span className="eyebrow">
            <ChannelIcon channel="website" size={13} /> WEBSITE
          </span>
          <h2>{host}</h2>
          <div className={`score-band ${bandClass(band(website.score, report.config))}`}>
            <span /> {band(website.score, report.config)}
          </div>
          <p className="muted">
            Mobile PageSpeed (
            {runs.length ? `median of ${runs.length} run${runs.length > 1 ? 's' : ''}` : 'not measured'}) and
            a crawl of the homepage, contact page, blog, robots.txt and sitemap.
          </p>
        </div>
        <CriteriaBars rows={criteriaRows} threshold={t.gapScore} color="var(--ch-website)" />
      </div>
      <ChartInsight items={websiteInsights(report)} />

      <Stagger className="channel-grid">
        <StaggerItem className="panel" hover={false}>
          <h3 className="mini-title">
            <Gauge size={14} /> Performance
            <small>
              {parts.performance.pagespeed}% PageSpeed · {parts.performance.cwv}% Core Web Vitals
            </small>
          </h3>
          <div className="psi-rings">
            <div>
              <Ring
                score={website.parts.performance.pagespeed}
                size={76}
                color="var(--ch-website)"
                print={print}
              />
              <span>PageSpeed performance</span>
              <small>
                {runs.length
                  ? `Runs: ${runs.map((r) => fmt(r.performance)).join(' · ')}`
                  : 'No successful run'}
              </small>
            </div>
            <div>
              <Ring score={website.parts.performance.cwv} size={76} color="var(--ch-website)" print={print} />
              <span>Core Web Vitals passed</span>
              <small>
                {d.pagespeed.vitalsSource === 'url'
                  ? 'Real-user data for this page'
                  : d.pagespeed.vitalsSource === 'origin'
                    ? 'Real-user data for the whole site'
                    : d.pagespeed.vitalsSource === 'lab'
                      ? 'Lab test (no real-user data)'
                      : 'Not measured'}
              </small>
            </div>
          </div>
          {VITALS.map(({ key, ...v }) => (
            <VitalMeter
              key={key}
              {...v}
              good={key === 'lcp' ? t.lcp : key === 'inp' ? t.inp : t.cls}
              value={vitals[key]}
            />
          ))}
          <ChartInsight items={vitalsInsights(report)} />
        </StaggerItem>
        <StaggerItem className="panel" hover={false}>
          <h3 className="mini-title">
            <Search size={14} /> SEO basics
            <small>
              {parts.seo.pagespeed}% PageSpeed SEO · {parts.seo.checklist}% checklist
            </small>
          </h3>
          <div className="psi-rings">
            <div>
              <Ring score={website.parts.seo.pagespeed} size={76} color="var(--ch-website)" print={print} />
              <span>PageSpeed SEO</span>
            </div>
            <div>
              <Ring score={website.parts.seo.checklist} size={76} color="var(--ch-website)" print={print} />
              <span>On-page checklist</span>
            </div>
          </div>
          <Checklist
            items={[
              { label: 'Title tag', value: d.seo.title },
              { label: 'Meta description', value: d.seo.metaDescription },
              {
                label: `Exactly one H1${d.seo.h1Count !== null && d.seo.h1Count !== 1 ? ` (found ${d.seo.h1Count})` : ''}`,
                value: d.seo.singleH1,
              },
              {
                label: `≥ ${Math.round(t.altRatio * 100)}% images with alt text${d.seo.imageAltRatio !== null ? ` (${Math.round(d.seo.imageAltRatio * 100)}% of ${d.seo.imageCount})` : ''}`,
                value: d.seo.imageAltRatio === null ? null : d.seo.imageAltRatio >= t.altRatio,
              },
              { label: 'Schema markup', value: d.seo.schema },
              { label: 'sitemap.xml', value: d.seo.sitemap },
              { label: 'robots.txt', value: d.seo.robots },
              { label: 'HTTPS', value: d.seo.https },
            ]}
          />
        </StaggerItem>
        <StaggerItem className="panel" hover={false}>
          <h3 className="mini-title">
            <Radar size={14} /> Tracking installed
          </h3>
          <Checklist
            items={[
              {
                label: 'GA4 or Google Tag Manager',
                value: d.tracking.analytics,
                points: parts.tracking.analytics,
              },
              { label: 'Meta Pixel', value: d.tracking.meta, points: parts.tracking.meta },
              { label: 'Google Ads tag', value: d.tracking.ads, points: parts.tracking.ads },
              { label: 'LinkedIn Insight Tag', value: d.tracking.linkedin, points: parts.tracking.linkedin },
            ]}
          />
          <h3 className="mini-title">
            <MousePointerClick size={14} /> Conversion basics
          </h3>
          <Checklist
            items={[
              { label: 'Contact form', value: d.conversion.form, points: parts.conversion.form },
              {
                label: `Call to action above the fold${d.ctaText ? ` (“${d.ctaText}”)` : ''}`,
                value: d.conversion.cta,
                points: parts.conversion.cta,
              },
              { label: 'WhatsApp button', value: d.conversion.whatsapp, points: parts.conversion.whatsapp },
              { label: 'Click-to-call link', value: d.conversion.phone, points: parts.conversion.phone },
            ]}
          />
          <h3 className="mini-title">
            <Newspaper size={14} /> Content freshness
          </h3>
          <dl className="fresh-list">
            <div>
              <dt>Latest blog post</dt>
              <dd>
                {d.freshness.latestPost
                  ? `${Math.round((Date.parse(report.asOf) - Date.parse(d.freshness.latestPost)) / 86400000)} days ago`
                  : d.freshness.blogUrl
                    ? 'No dated posts found'
                    : 'No blog linked'}
              </dd>
            </div>
            <div>
              <dt>Footer copyright</dt>
              <dd>{d.freshness.copyrightYear ?? 'Not found'}</dd>
            </div>
          </dl>
        </StaggerItem>
      </Stagger>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Google Business Profile
// ---------------------------------------------------------------------------------------------

function Stars({ rating }: { rating: number | null }) {
  const pct = rating === null ? 0 : (rating / 5) * 100;
  return (
    <span
      className="stars"
      aria-label={rating === null ? 'Rating not measured' : `${rating.toFixed(1)} out of 5 stars`}
    >
      <span className="stars-empty">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={18} />
        ))}
      </span>
      <span className="stars-full" style={{ width: `${pct}%` }}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={18} fill="currentColor" />
        ))}
      </span>
    </span>
  );
}

export function GbpSection({ report, gbp, print }: { report: Report; gbp: Gbp; print: boolean }) {
  const d = gbp.detail;
  const t = report.config.thresholds;
  const b = gbp.benchmark;
  const criteriaRows = [
    { key: 'rating', label: 'Star rating', note: `${t.ratingHigh}+ = 100, ${t.ratingLow} or below = 0` },
    { key: 'reviews', label: 'Review count', note: `Log scale across ${b.reviewLow}–${b.reviewHigh}` },
    { key: 'replies', label: 'Owner replies', note: 'Share of the latest 10 reviews answered' },
    { key: 'completeness', label: 'Profile completeness', note: 'Category, hours, phone, website, photos' },
  ].map((r) => ({
    ...r,
    score: gbp.criteria[r.key as keyof typeof gbp.criteria],
    weight: (gbp.weights as Record<string, number>)[r.key] ?? 0,
  }));
  const dist = d?.distribution;
  const distRows = dist
    ? ([
        [5, dist.five],
        [4, dist.four],
        [3, dist.three],
        [2, dist.two],
        [1, dist.one],
      ] as const)
    : null;
  const distMax = distRows ? Math.max(1, ...distRows.map((r) => r[1])) : 1;
  // Review count on the same log band the score uses: bottom of band = 20, top = 100.
  const logPos = (v: number) =>
    v <= 0
      ? 0
      : Math.max(
          0,
          Math.min(100, 20 + (80 * Math.log(v / b.reviewLow)) / Math.log(b.reviewHigh / b.reviewLow)),
        );
  const replies = d?.latestReviews ?? [];
  const answered = replies.filter((r) => r.ownerReplied).length;
  return (
    <section className="channel-section">
      <div className="channel-hero panel">
        <Ring score={gbp.score} size={112} color="var(--ch-gbp)" print={print} />
        <div>
          <span className="eyebrow">
            <ChannelIcon channel="gbp" size={13} /> GOOGLE BUSINESS PROFILE
          </span>
          <h2>{gbp.status === 'absent' ? 'No profile' : (d?.name ?? 'Profile')}</h2>
          <div className={`score-band ${bandClass(band(gbp.score, report.config))}`}>
            <span /> {band(gbp.score, report.config)}
          </div>
          <p className="muted">
            {d?.address ??
              d?.category ??
              (gbp.status === 'absent' ? 'Confirmed by the team: no listing on Google.' : '')}
          </p>
        </div>
        <CriteriaBars rows={criteriaRows} threshold={t.gapScore} color="var(--ch-gbp)" />
      </div>
      <ChartInsight items={gbpInsights(report)} />
      {d && (
        <Stagger className="channel-grid">
          <StaggerItem className="panel" hover={false}>
            <h3 className="mini-title">
              <Star size={14} /> Rating
            </h3>
            <div className="rating-hero">
              <strong>{d.rating === null ? '—' : d.rating.toFixed(1)}</strong>
              <div>
                <Stars rating={d.rating} />
                <span>{fmt(d.reviewCount)} reviews</span>
              </div>
            </div>
            {distRows ? (
              <div className="dist" role="table" aria-label="Reviews by star rating">
                {distRows.map(([stars, count]) => (
                  <div className="dist-row" role="row" key={stars}>
                    <span role="rowheader">{stars} ★</span>
                    <span className="dist-track" role="cell" title={`${count} reviews with ${stars} stars`}>
                      <i style={{ width: `${(count / distMax) * 100}%` }} />
                    </span>
                    <em role="cell">{fmt(count)}</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Rating distribution not measured.</p>
            )}
          </StaggerItem>
          <StaggerItem className="panel" hover={false}>
            <h3 className="mini-title">Review volume vs benchmark</h3>
            <div
              className="band-track"
              title={`Placeholder band ${b.reviewLow}–${b.reviewHigh} reviews, log scale`}
            >
              <span className="band-zone" style={{ left: '20%', right: 0 }} />
              {d.reviewCount !== null && (
                <i className="band-marker" style={{ left: `${logPos(d.reviewCount)}%` }} aria-hidden />
              )}
            </div>
            <div className="band-scale">
              <span>0</span>
              <span style={{ left: '20%' }}>{fmt(b.reviewLow)}</span>
              <span style={{ left: '100%' }}>{fmt(b.reviewHigh)}+</span>
            </div>
            <p className="muted small-note">
              {fmt(d.reviewCount)} reviews → {fmt(gbp.criteria.reviews, 0)} / 100. Log scale: the first
              reviews count the most.
            </p>
            <h3 className="mini-title">Owner replies · latest {replies.length}</h3>
            {replies.length ? (
              <>
                <div
                  className="waffle"
                  role="img"
                  aria-label={`${answered} of ${replies.length} latest reviews have an owner reply`}
                >
                  {replies.map((r, i) => (
                    <span
                      key={i}
                      className={r.ownerReplied ? 'waffle-cell on' : 'waffle-cell'}
                      title={`${r.stars ?? '?'}★ review${r.publishedAt ? ` · ${r.publishedAt.slice(0, 10)}` : ''} · ${r.ownerReplied ? 'owner replied' : 'no reply'}`}
                    >
                      {r.ownerReplied ? <Check size={11} /> : null}
                    </span>
                  ))}
                </div>
                <p className="muted small-note">
                  {answered} of {replies.length} answered
                </p>
              </>
            ) : (
              <p className="muted">No reviews to reply to.</p>
            )}
          </StaggerItem>
          <StaggerItem className="panel" hover={false}>
            <h3 className="mini-title">Profile completeness</h3>
            <Checklist
              items={[
                {
                  label: `Category${d.category ? ` (${d.category})` : ''}`,
                  value: d.category === null ? null : !!d.category,
                },
                { label: 'Opening hours', value: d.hasHours },
                { label: 'Phone number', value: d.hasPhone },
                { label: 'Website link', value: d.hasWebsite },
                {
                  label: `Photos${d.photoCount !== null ? ` (${d.photoCount})` : ''}`,
                  value: d.photoCount === null ? null : d.photoCount > 0,
                },
              ]}
            />
            <p className="muted small-note">20 points each among the checks that could be measured.</p>
          </StaggerItem>
        </Stagger>
      )}
    </section>
  );
}
