import type { ReactNode } from 'react';
import type { Report } from '@/lib/report';
import type { StoredSummary } from '@/lib/ai/summary-types';
import type { StoredAlignment } from '@/lib/ai/alignment-types';
import { platformNames, type Platform } from '@/lib/collectors/types';
import { channelNames } from '@/lib/collectors/channel-types';
import { band } from '@/lib/scoring';
import * as insight from '@/lib/insights';
import { offsiteKpis, CLICKRANK, SEMRUSH } from '@/lib/seo/benchmarks';
import { PrintMethodology } from '@/components/report/methodology';
import { pdfSections, type PdfSection } from '@/lib/pdf/sections';
import { pdfColors as C, Dial, HBars, StackBar, Radar, Columns, Heatmap, Donut, ZoneMeter } from './charts';
import './pdf.css';

/**
 * The PDF is its own document, not the interactive report printed: a continuous A4 layout where
 * sections flow on from each other, and only figures and tables are kept from splitting across a
 * page. Every chart is followed by findings read straight off its numbers.
 */
const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? 'Not measured'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
const date = (s: string | null) =>
  s === null
    ? 'Not measured'
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(s));
const bandClass = (s: string) => `band band-${s.toLowerCase().replace(' ', '-')}`;
const componentNames = {
  activity: 'Activity',
  engagement: 'Engagement',
  audience: 'Audience',
  completeness: 'Profile',
} as const;
const gapTitles: Record<string, string> = {
  'website:performance': 'Make the site feel instant',
  'website:seo': 'Fix the foundations search engines read',
  'website:tracking': 'Measure what your marketing earns',
  'website:conversion': 'Give visitors a clear next step',
  'website:freshness': 'Keep the site current',
  'seo:visibility': 'Get found when people search for you',
  'seo:technical': 'Make the site easy for Google to crawl',
  'seo:onpage': 'Sharpen titles, headings and descriptions',
  'seo:content': 'Give search engines more to rank',
  'seo:experience': 'Speed up the page experience',
  'gbp:missing': 'Get found on Google Maps',
  'gbp:rating': 'Lift the star rating',
  'gbp:reviews': 'Earn more reviews',
  'gbp:replies': 'Answer your reviews',
  'gbp:completeness': 'Complete the Google listing',
};
function gapTitle(g: Report['gaps'][number]) {
  return (
    gapTitles[`${g.platform}:${g.component}`] ??
    {
      missing: `Build a presence on ${platformNames[g.platform as Platform]}`,
      video: 'Bring the story to life with video',
      activity: 'Close the gaps in the calendar',
      engagement: 'Give the audience a reason to respond',
      audience: 'Reach more of the right people',
    }[g.component] ??
    'Make the first impression complete'
  );
}
const sourceName = (s: string) =>
  s === 'seo'
    ? 'SEO'
    : s === 'website' || s === 'gbp'
      ? channelNames[s]
      : (platformNames[s as Platform] ?? s);

function Section({
  n,
  eyebrow,
  title,
  intro,
  children,
}: {
  n: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="pdf-section">
      <header className="pdf-section-head">
        <span className="pdf-eyebrow">
          {n} · {eyebrow}
        </span>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      {children}
    </section>
  );
}

function Figure({
  title,
  note,
  insights,
  breakable = false,
  children,
}: {
  title: string;
  note?: string;
  insights?: string[];
  /** Long tables may continue on the next page between rows instead of leaving a gap. */
  breakable?: boolean;
  children: ReactNode;
}) {
  return (
    <figure className={breakable ? 'pdf-figure breakable' : 'pdf-figure'}>
      <figcaption>
        <strong>{title}</strong>
        {note && <span>{note}</span>}
      </figcaption>
      <div className="pdf-figure-body">{children}</div>
      {insights && insights.length > 0 && (
        <div className="pdf-insight">
          <b>What this shows</b>
          <ul>
            {insights.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}

export function PdfReport({
  id,
  brand,
  website,
  report,
  summary,
  alignment,
  mode,
  section = null,
}: {
  id: string;
  brand: string;
  website: string | null;
  report: Report;
  summary: StoredSummary | null;
  alignment: StoredAlignment | null;
  mode: 'live' | 'mock';
  /** One area on its own; null = the full report. */
  section?: PdfSection | null;
}) {
  const show = (k: PdfSection) => !section || section === k;
  const t = report.config.thresholds;
  const headline = report.overall.score;
  const measured = report.cards.filter((c) => c.score !== null);
  const scores = report.channelScores ?? { website: null, social: report.social, gbp: null };
  const weights = report.overall.weights as Record<string, number>;
  const channels = (['website', 'social', 'gbp'] as const).map((c) => ({
    key: c,
    label: c === 'gbp' ? 'Google Business Profile' : c === 'website' ? 'Website' : 'Social',
    score: scores[c],
    weight: weights[c] ?? 0,
    pts: scores[c] === null ? 0 : ((scores[c] as number) * (weights[c] ?? 0)) / 100,
    color: C[c],
  }));
  const verdict =
    headline === null
      ? 'There is not enough measured data to assess this brand yet.'
      : headline >= t.strong
        ? 'A strong foundation. Keep turning attention into connection.'
        : headline >= t.good
          ? 'A promising presence, with room to make a bigger impression.'
          : 'The next chapter starts with showing up consistently.';
  const s = summary?.status === 'ok' ? summary.content : null;
  const a = alignment?.status === 'ok' ? alignment : null;
  const site = report.website ?? null;
  // Reports from before the status groups existed have no SEO section to show.
  const seo = report.seo?.groups ? report.seo : null;
  const gbp = report.gbp ?? null;
  const calendarCards = report.cards.filter((c) => c.metrics.calendar);
  const calDays = calendarCards[0]?.metrics.calendar?.length ?? 0;
  const calTicks = calendarCards[0]?.metrics.calendar
    ? [0, Math.round((calDays - 1) / 3), Math.round(((calDays - 1) * 2) / 3), calDays - 1].map((i) => ({
        index: i,
        label: date(calendarCards[0].metrics.calendar![i].date + 'T12:00:00Z')
          .split(' ')
          .slice(0, 2)
          .join(' '),
      }))
    : [];
  let n = 0;
  const num = () => String(++n).padStart(2, '0');
  const socialPlatforms = report.cards.map((c) => c.platform);

  // Data notes for whatever this document covers.
  const notes = (
    [
      ['website', 'Website', site?.warnings ?? null, site?.fetchedAt],
      ['gbp', 'Google Business Profile', gbp?.warnings ?? null, gbp?.fetchedAt],
      ...report.cards.map(
        (c) =>
          [
            c.platform,
            platformNames[c.platform],
            [
              ...c.metrics.notes.filter((note, i) => i !== 0 || !note.startsWith('Synthetic')),
              ...Object.entries(c.components)
                .filter(([, v]) => v === null)
                .map(
                  ([k]) =>
                    `${componentNames[k as keyof typeof componentNames]} not measured; excluded from score.`,
                ),
            ],
            c.fetchedAt,
          ] as const,
      ),
    ] as const
  )
    .filter(([key]) =>
      !section || section === 'opportunities'
        ? true
        : section === 'social'
          ? (socialPlatforms as string[]).includes(key)
          : section === 'website' || section === 'seo'
            ? key === 'website'
            : section === 'gbp'
              ? key === 'gbp'
              : false,
    )
    .filter(([, , list]) => list && list.length)
    .map(([, label, list, at]) => [label, list, at] as const);

  /** In a single-area document, that area's opportunities follow its charts. */
  function areaGaps(keep: (g: Report['gaps'][number]) => boolean) {
    // Reports from before allGaps existed only kept the top six.
    const gaps =
      section && section !== 'overview' && section !== 'opportunities'
        ? (report.allGaps ?? report.gaps).filter(keep)
        : [];
    if (!gaps.length) return null;
    return (
      <Figure
        breakable
        title="Opportunities in this area"
        note="Below the opportunity line, most urgent first"
      >
        <table className="pdf-table pdf-gaps">
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Score</th>
              <th>Measured</th>
              <th>Tier2 service</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={`${g.platform}-${g.component}`}>
                <td>
                  <strong>{gapTitle(g)}</strong>
                  <small>
                    {sourceName(g.platform)} · {g.explanation}
                  </small>
                </td>
                <td className="bad">{Math.round(g.score)}</td>
                <td>{g.measured}</td>
                <td>{g.service}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Figure>
    );
  }

  /** Short cover for a single-area document: brand, area, and that area's score. */
  function sectionCover() {
    const area = section as PdfSection;
    const score =
      area === 'audience'
        ? (a?.stats.score ?? null)
        : area === 'social'
          ? report.social
          : area === 'website'
            ? (site?.score ?? null)
            : area === 'seo'
              ? (seo?.score ?? null)
              : area === 'gbp'
                ? (gbp?.score ?? null)
                : null;
    return (
      <header className="pdf-cover">
        <span className="pdf-eyebrow">{pdfSections[area].toUpperCase()} REPORT</span>
        <h1>{brand}</h1>
        <p className="pdf-meta">
          {website ? new URL(website).hostname : 'No website provided'} · {date(report.asOf)} ·{' '}
          {report.industry} · #{id.slice(-8).toUpperCase()}
        </p>
        <p className={`pdf-provenance ${mode}`}>
          {mode === 'live'
            ? `Live data collected from public sources on ${date(report.asOf)}.`
            : 'Demo report built from synthetic sample data, not a real brand.'}
        </p>
        <div className="pdf-hero">
          {area === 'opportunities' ? (
            <div className="pdf-hero-count">{report.gaps.length}</div>
          ) : (
            <Dial score={score} size={104} color={C.good} />
          )}
          <div>
            {area !== 'opportunities' && (
              <span className={bandClass(band(score, report.config))}>{band(score, report.config)}</span>
            )}
            <h2>
              {area === 'opportunities'
                ? `${report.gaps.length} priority opportunit${report.gaps.length === 1 ? 'y' : 'ies'} across the audit`
                : `${pdfSections[area]}: ${score === null ? 'not scored' : `${Math.round(score)} out of 100`}`}
            </h2>
            <p className="pdf-small">
              Part of the {report.overall.label.toLowerCase()} audit ({fmt(headline)} / 100 overall). Each
              chart is followed by what it shows.
            </p>
          </div>
        </div>
      </header>
    );
  }

  return (
    <article className="pdf-doc" data-report-ready="true">
      {/* ---------- Cover block ---------- */}
      {section && section !== 'overview' ? (
        sectionCover()
      ) : (
        <header className="pdf-cover">
          <span className="pdf-eyebrow">
            {report.overall.label.replace(' Score', '').toUpperCase()} REPORT
          </span>
          <h1>{brand}</h1>
          <p className="pdf-meta">
            {website ? new URL(website).hostname : 'No website provided'} · {date(report.asOf)}
            {report.period ? ` · Social period ${report.period.label}` : ''} · {report.industry} · #
            {id.slice(-8).toUpperCase()}
          </p>
          <p className={`pdf-provenance ${mode}`}>
            {mode === 'live'
              ? `Live data collected from public sources on ${date(report.asOf)}.`
              : 'Demo report built from synthetic sample data, not a real brand.'}
          </p>
          <div className="pdf-hero">
            <Dial score={headline} size={118} color={C.good} />
            <div>
              <span className={bandClass(band(headline, report.config))}>
                {band(headline, report.config)} presence
              </span>
              <h2>{verdict}</h2>
              <div className="pdf-facts">
                <span>
                  <strong>{measured.length}/4</strong> platforms scored
                </span>
                <span>
                  <strong>{channels.filter((c) => c.score !== null).length}/3</strong> channels measured
                </span>
                <span>
                  <strong>{report.gaps.length}</strong> priority opportunities
                </span>
                {seo && (
                  <span>
                    <strong>{fmt(seo.score)}</strong> SEO audit
                  </span>
                )}
              </div>
            </div>
          </div>
          <table className="pdf-table pdf-glance">
            <thead>
              <tr>
                <th>Area</th>
                <th>Score</th>
                <th>Band</th>
                <th>Key figure</th>
              </tr>
            </thead>
            <tbody>
              {channels
                .filter((c) => c.key !== 'social')
                .map((c) => (
                  <tr key={c.key}>
                    <td>
                      <i className="dot" style={{ background: c.color }} />
                      {c.label}
                    </td>
                    <td>{fmt(c.score)}</td>
                    <td>{band(c.score, report.config)}</td>
                    <td>
                      {c.key === 'website'
                        ? site
                          ? `PageSpeed ${fmt(site.parts.performance.pagespeed)} · LCP ${site.detail.pagespeed.lcpMs === null ? 'n/a' : (site.detail.pagespeed.lcpMs / 1000).toFixed(1) + ' s'}`
                          : 'Not audited'
                        : gbp?.detail
                          ? `${gbp.detail.rating?.toFixed(1) ?? 'n/a'}★ · ${fmt(gbp.detail.reviewCount)} reviews`
                          : 'No listing measured'}
                    </td>
                  </tr>
                ))}
              {report.cards.map((c) => (
                <tr key={c.platform}>
                  <td>
                    <i className="dot" style={{ background: C[c.platform] }} />
                    {platformNames[c.platform]}
                    {c.handle ? <small> @{c.handle}</small> : null}
                  </td>
                  <td>{fmt(c.score)}</td>
                  <td>{c.status === 'absent' ? 'No account' : band(c.score, report.config)}</td>
                  <td>
                    {c.subscriberHidden ? 'Hidden' : fmt(c.profile?.followers ?? null)}{' '}
                    {c.platform === 'youtube' ? 'subscribers' : 'followers'} ·{' '}
                    {c.metrics.engagement === null
                      ? 'engagement n/a'
                      : `${fmt(c.metrics.engagement, 2)}% engagement`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </header>
      )}

      {/* ---------- Executive summary (AI, only when one was written) ---------- */}
      {s && show('overview') && (
        <Section n={num()} eyebrow="EXECUTIVE SUMMARY" title={s.headline}>
          <p className="pdf-lede">{s.verdict}</p>
          <div className="pdf-two">
            {s.strengths.length > 0 && (
              <div>
                <h3>Working well</h3>
                <ul className="pdf-points">
                  {s.strengths.map((x, i) => (
                    <li key={i}>
                      <strong>{x.point}</strong> {x.evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.problems.length > 0 && (
              <div>
                <h3>Holding it back</h3>
                <ul className="pdf-points">
                  {s.problems.map((x, i) => (
                    <li key={i}>
                      <strong>{x.point}</strong> {x.evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="pdf-callout">
            <b>Start here:</b> {s.firstFix.action} {s.firstFix.why}
          </div>
        </Section>
      )}

      {/* ---------- Score ---------- */}
      {show('overview') && (
        <Section
          n={num()}
          eyebrow="THE SCORE, UNPACKED"
          title="Where every point comes from"
          intro="Each channel’s score times its weight; unmeasured channels are left out and the rest re-weighted."
        >
          <Figure
            title={`How the ${report.overall.label.toLowerCase()} is built`}
            note={`${fmt(headline)} / 100`}
            insights={insight.compositionInsights(report)}
          >
            <StackBar
              parts={channels.map((c) => ({ label: c.label, value: c.pts, color: c.color }))}
              total={headline}
            />
          </Figure>
          <Figure
            breakable
            title="Inside the social score"
            note="Four components per platform, 0–100"
            insights={insight.socialMatrixInsights(report)}
          >
            <table className="pdf-table pdf-matrix">
              <thead>
                <tr>
                  <th>Platform</th>
                  {Object.entries(componentNames).map(([k, l]) => (
                    <th key={k}>
                      {l} <small>{report.config.components[k as keyof typeof componentNames]}%</small>
                    </th>
                  ))}
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {report.cards.map((c) => (
                  <tr key={c.platform}>
                    <td>
                      <i className="dot" style={{ background: C[c.platform] }} />
                      {platformNames[c.platform]}
                    </td>
                    {(Object.keys(componentNames) as (keyof typeof componentNames)[]).map((k) => {
                      const v = c.components[k];
                      return (
                        <td key={k} className={v !== null && v < t.gapScore ? 'below' : ''}>
                          <span className="pdf-cellbar">
                            <i style={{ width: `${v ?? 0}%`, background: C[c.platform] }} />
                          </span>
                          {v === null ? '—' : Math.round(v)}
                        </td>
                      );
                    })}
                    <td>
                      <strong>{c.score === null ? '—' : Math.round(c.score)}</strong>
                      <small>
                        {' '}
                        {c.score === null ? '' : `${fmt(report.platformWeights[c.platform])}% of social`}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pdf-key">Red numbers fall below {t.gapScore} and become opportunities.</p>
          </Figure>
        </Section>
      )}

      {/* ---------- Social ---------- */}
      {show('social') && (
        <Section
          n={num()}
          eyebrow="SOCIAL MEDIA"
          title="How the brand shows up on social"
          intro={`Posting and engagement cover ${report.period?.label ?? 'the last 30 days (calendar: 90 days)'}.`}
        >
          <table className="pdf-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Audience</th>
                <th>{report.period ? 'Avg posts / 30 days' : 'Posts / 30 days'}</th>
                <th>Engagement</th>
                <th>Target</th>
                <th>Last post</th>
              </tr>
            </thead>
            <tbody>
              {report.cards.map((c) => (
                <tr key={c.platform}>
                  <td>
                    <i className="dot" style={{ background: C[c.platform] }} />
                    {platformNames[c.platform]}
                  </td>
                  <td>{c.subscriberHidden ? 'Hidden' : fmt(c.profile?.followers ?? null)}</td>
                  <td>
                    {c.metrics.lowerBound ? '≥ ' : ''}
                    {fmt(c.metrics.count, 1)} <small>/ {c.benchmark.postsTarget}</small>
                  </td>
                  <td>
                    {c.metrics.engagement === null ? 'Not measured' : `${fmt(c.metrics.engagement, 2)}%`}
                  </td>
                  <td>{c.benchmark.engagementTarget}%</td>
                  <td>{date(c.metrics.lastPost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdf-row">
            <Figure
              title="Beyond the follower count"
              note="Platforms with all four dimensions measured"
              insights={insight.radarInsights(report)}
            >
              <div className="pdf-radar">
                <Radar
                  axes={Object.values(componentNames)}
                  series={report.cards
                    .filter((c) => Object.values(c.components).every((v) => v !== null))
                    .map((c) => ({
                      name: platformNames[c.platform],
                      color: C[c.platform],
                      values: (Object.keys(componentNames) as (keyof typeof componentNames)[]).map(
                        (k) => c.components[k] as number,
                      ),
                    }))}
                />
                <div className="pdf-legend vertical">
                  {report.cards.map((c) => (
                    <span key={c.platform}>
                      <i style={{ background: C[c.platform] }} />
                      {platformNames[c.platform]}
                    </span>
                  ))}
                </div>
              </div>
            </Figure>
            <Figure
              title="Attention meets interaction"
              note="Engagement rate; dashed line = benchmark"
              insights={insight.engagementInsights(report)}
            >
              <Columns
                height={230}
                width={340}
                rows={report.cards.map((c) => ({
                  label: platformNames[c.platform],
                  value: c.metrics.engagement,
                  target: c.benchmark.engagementTarget,
                  color: C[c.platform],
                }))}
              />
            </Figure>
          </div>
          <Figure
            title="Consistency leaves a pattern"
            note={`Observed posts per day · ${report.period?.label ?? 'last 90 days'} · IST · pinned excluded`}
            insights={insight.calendarInsights(report)}
          >
            <Heatmap
              rows={report.cards.map((c) => ({
                label: platformNames[c.platform],
                cells: c.metrics.calendar?.map((d) => d.count) ?? null,
              }))}
              ticks={calTicks}
            />
            <p className="pdf-key">
              Empty cells mean no post was observed, not confirmed inactivity. Darker = more posts.
            </p>
          </Figure>
          <Figure
            title="A balanced content diet"
            note="Video and reels vs static posts in the fetched sample"
            insights={insight.mixInsights(report)}
          >
            <div className="pdf-donuts">
              {report.cards.map((c) => (
                <div key={c.platform}>
                  <Donut pct={c.metrics.mix ? c.metrics.mix.videoPercent : null} color={C[c.platform]} />
                  <strong>{platformNames[c.platform]}</strong>
                  <small>
                    {c.metrics.mix
                      ? `${c.metrics.mix.video} video · ${c.metrics.mix.static} static`
                      : 'Not measured'}
                  </small>
                </div>
              ))}
            </div>
          </Figure>
          <Figure
            breakable
            title="Content that connected"
            note="Top posts by measured likes + comments"
            insights={insight.topPostInsights(report)}
          >
            <table className="pdf-table pdf-posts">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Post</th>
                  <th>Format · date</th>
                  <th>Likes</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {report.cards.flatMap((c) =>
                  c.metrics.top.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i === 0 ? platformNames[c.platform] : ''}</td>
                      <td className="pdf-caption">{p.captionPreview ?? 'Caption not measured'}</td>
                      <td>
                        {p.type} · {date(p.publishedAt)}
                      </td>
                      <td>{fmt(p.likes)}</td>
                      <td>{fmt(p.comments)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Figure>
          {areaGaps((g) => (socialPlatforms as string[]).includes(g.platform))}
        </Section>
      )}

      {/* ---------- Website ---------- */}
      {site && show('website') && (
        <Section
          n={num()}
          eyebrow="WEBSITE"
          title={site.detail.url ? new URL(site.detail.url).hostname : 'Website'}
          intro="Mobile PageSpeed plus a crawl of the homepage, contact page, blog, robots.txt and sitemap."
        >
          <Figure
            title="Website score by criterion"
            note={`${fmt(site.score)} / 100 · ${band(site.score, report.config)}`}
            insights={insight.websiteInsights(report)}
          >
            <HBars
              threshold={t.gapScore}
              rows={(
                [
                  ['performance', 'Performance'],
                  ['seo', 'SEO basics'],
                  ['tracking', 'Tracking installed'],
                  ['conversion', 'Conversion basics'],
                  ['freshness', 'Content freshness'],
                ] as const
              ).map(([k, label]) => ({
                label,
                sub: `${fmt((site.weights as Record<string, number>)[k])}% of score`,
                value: site.criteria[k],
                color: C.website,
              }))}
            />
          </Figure>
          <div className="pdf-row">
            <Figure
              title="Speed and stability"
              note={site.detail.pagespeed.vitalsSource === 'lab' ? 'Lab test' : 'Real-visitor data'}
              insights={insight.vitalsInsights(report)}
            >
              <ZoneMeter
                label="Largest Contentful Paint"
                value={site.detail.pagespeed.lcpMs === null ? null : site.detail.pagespeed.lcpMs / 1000}
                good={t.lcp}
                poor={4}
                max={8}
                unit=" s"
                digits={1}
              />
              <ZoneMeter
                label="Interaction to Next Paint"
                value={site.detail.pagespeed.inpMs}
                good={t.inp}
                poor={500}
                max={1000}
                unit=" ms"
                digits={0}
              />
              <ZoneMeter
                label="Cumulative Layout Shift"
                value={site.detail.pagespeed.cls}
                good={t.cls}
                poor={0.25}
                max={0.5}
                unit=""
                digits={2}
              />
            </Figure>
            <Figure title="Tracking and conversion">
              <table className="pdf-table pdf-checks">
                <tbody>
                  {(
                    [
                      ['GA4 or Google Tag Manager', site.detail.tracking.analytics],
                      ['Meta Pixel', site.detail.tracking.meta],
                      ['Google Ads tag', site.detail.tracking.ads],
                      ['LinkedIn Insight Tag', site.detail.tracking.linkedin],
                      ['Contact form', site.detail.conversion.form],
                      [
                        `Call to action above the fold${site.detail.ctaText ? ` (“${site.detail.ctaText}”)` : ''}`,
                        site.detail.conversion.cta,
                      ],
                      ['WhatsApp button', site.detail.conversion.whatsapp],
                      ['Click-to-call link', site.detail.conversion.phone],
                    ] as const
                  ).map(([label, v]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className={v === null ? 'muted' : v ? 'good' : 'bad'}>
                        {v === null ? 'Not measured' : v ? '✓ Yes' : '✕ No'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Figure>
          </div>
          {areaGaps((g) => g.platform === 'website')}
        </Section>
      )}

      {/* ---------- SEO ---------- */}
      {seo && show('seo') && (
        <Section
          n={num()}
          eyebrow="SEO AUDIT"
          title="How findable the brand is on Google"
          intro={`Homepage checks against ${CLICKRANK} and Google guidance${seo.search ? ', plus live Google results' : ''}. Shown beside the headline score; the website score already counts SEO basics.`}
        >
          <Figure
            title="SEO score by category"
            note={`${fmt(seo.score)} / 100 · ${band(seo.score, report.config)}`}
            insights={insight.seoInsights(report)}
          >
            <HBars
              threshold={t.gapScore}
              rows={seo.categories.map((c) => ({
                label: c.label,
                sub: c.score === null ? 'Not measured' : `${fmt(c.effectiveWeight)}% of SEO score`,
                value: c.score,
                color: C.website,
              }))}
            />
          </Figure>
          {seo.search && (
            <Figure
              title={`Google results for “${seo.search.brandQuery}”`}
              note={`${seo.search.indexedLowerBound ? 'At least ' : ''}${fmt(seo.search.indexedPages)} pages indexed`}
            >
              <table className="pdf-table pdf-serp">
                <tbody>
                  {seo.search.topResults.slice(0, 5).map((r) => (
                    <tr key={r.position} className={r.own ? 'own' : ''}>
                      <td>{r.position}</td>
                      <td>
                        <strong>{r.title || r.url}</strong> <small>{r.url.replace(/^https?:\/\//, '')}</small>
                      </td>
                      <td>{r.own ? 'Brand site' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {seo.search.peopleAlsoAsk.length > 0 && (
                <p className="pdf-key">People also ask: {seo.search.peopleAlsoAsk.slice(0, 4).join(' · ')}</p>
              )}
            </Figure>
          )}
          {(
            [
              [
                'Needs improvement',
                [...seo.groups.fix, ...seo.groups.improve],
                'Every measured check meets its benchmark.',
              ],
              ['Working well', seo.groups.good, 'No check meets its benchmark yet.'],
            ] as const
          ).map(([title, rows, empty]) => (
            <Figure breakable key={title} title={title} note={`${rows.length} checks`}>
              {rows.length ? (
                <table className="pdf-table pdf-seo">
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
                          <small> · {k.category}</small>
                        </td>
                        <td>{k.found}</td>
                        <td>
                          {k.benchmark}
                          <small> · {k.source}</small>
                        </td>
                        <td className={k.score === 100 ? 'good' : k.score === 50 ? 'warn' : 'bad'}>
                          {k.score === 100 ? '✓ Good' : k.score === 50 ? '~ Improve' : '✕ Fix'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="pdf-key">{empty}</p>
              )}
            </Figure>
          ))}
          {seo.groups.info.length > 0 && (
            <Figure breakable title="Good to know" note="Collected, no pass/fail benchmark">
              <table className="pdf-table">
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
                <p className="pdf-key">
                  Not measured: {seo.groups.unmeasured.map((k) => k.label).join(', ')}.
                </p>
              )}
            </Figure>
          )}
          <Figure
            breakable
            title="Off-site KPIs to track next"
            note={`${SEMRUSH} · reference figures from ${CLICKRANK}`}
          >
            <table className="pdf-table">
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
            <p className="pdf-key">
              These need the brand’s own analytics or Search Console, so they are not scored here.
            </p>
          </Figure>
          {areaGaps((g) => g.platform === 'seo')}
        </Section>
      )}

      {/* ---------- Google Business Profile ---------- */}
      {gbp && show('gbp') && (
        <Section
          n={num()}
          eyebrow="GOOGLE BUSINESS PROFILE"
          title={gbp.status === 'absent' ? 'No Google listing' : (gbp.detail?.name ?? 'Google listing')}
          intro={gbp.detail?.address ?? gbp.detail?.category ?? undefined}
        >
          <Figure
            title="Listing score by criterion"
            note={`${fmt(gbp.score)} / 100 · ${band(gbp.score, report.config)}`}
            insights={insight.gbpInsights(report)}
          >
            <HBars
              threshold={t.gapScore}
              rows={(
                [
                  ['rating', 'Star rating'],
                  ['reviews', 'Review count'],
                  ['replies', 'Owner replies'],
                  ['completeness', 'Profile completeness'],
                ] as const
              ).map(([k, label]) => ({
                label,
                sub: `${fmt((gbp.weights as Record<string, number>)[k])}% of score`,
                value: gbp.criteria[k],
                color: C.gbp,
              }))}
            />
          </Figure>
          {gbp.detail?.distribution && (
            <Figure
              title="Reviews by star rating"
              note={`${gbp.detail.rating?.toFixed(1) ?? 'n/a'}★ average · ${fmt(gbp.detail.reviewCount)} reviews`}
            >
              <HBars
                rows={(
                  [
                    ['5 ★', gbp.detail.distribution.five],
                    ['4 ★', gbp.detail.distribution.four],
                    ['3 ★', gbp.detail.distribution.three],
                    ['2 ★', gbp.detail.distribution.two],
                    ['1 ★', gbp.detail.distribution.one],
                  ] as const
                ).map(([label, count]) => ({
                  label,
                  sub: `${fmt(count)} reviews`,
                  value: (count / Math.max(1, gbp.detail!.reviewCount ?? 1)) * 100,
                  color: C.gbp,
                }))}
              />
              <p className="pdf-key">Bars show each star level’s share of all reviews.</p>
            </Figure>
          )}
          {areaGaps((g) => g.platform === 'gbp')}
        </Section>
      )}

      {/* ---------- Audience alignment ---------- */}
      {a && show('audience') && (
        <Section
          n={num()}
          eyebrow="AUDIENCE ALIGNMENT"
          title={a.content.headline}
          intro={a.content.audience.summary}
        >
          {section === 'audience' && (
            <div className="pdf-two">
              <div>
                <h3>Who the brand is talking to</h3>
                <ul className="pdf-points">
                  {a.content.audience.personas.map((p) => (
                    <li key={p.name}>
                      <strong>{p.name}.</strong> {p.description}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Content themes found</h3>
                <p>{a.content.themes.join(' · ') || 'None identified'}</p>
                {a.targetAudience?.locations && (
                  <p className="pdf-small">Target locations: {a.targetAudience.locations}</p>
                )}
              </div>
            </div>
          )}
          <Figure
            title="Overall audience fit"
            note={`${fmt(a.stats.score)} / 100`}
            insights={insight.alignmentInsights(a)}
          >
            <StackBar
              parts={[
                {
                  label: 'On target',
                  value: a.stats.posts ? (a.stats.on / a.stats.posts) * 100 : 0,
                  color: C.good,
                },
                {
                  label: 'Partly',
                  value: a.stats.posts ? (a.stats.partial / a.stats.posts) * 100 : 0,
                  color: '#c9a24a',
                },
                {
                  label: 'Off target',
                  value: a.stats.posts ? (a.stats.off / a.stats.posts) * 100 : 0,
                  color: C.bad,
                },
              ]}
              total={null}
            />
          </Figure>
          <Figure
            title="Posts on target, by platform"
            note={`${a.stats.posts} posts classified · ${a.audienceSource === 'provided' ? 'audience given by the team' : 'audience inferred by AI'}`}
          >
            <HBars
              rows={a.stats.platforms.map((p) => ({
                label: platformNames[p.platform],
                sub: `${p.on} on · ${p.partial} partly · ${p.off} off target`,
                value: p.score,
                color: C[p.platform],
              }))}
            />
          </Figure>
          {a.stats.personas.length > 0 && (
            <Figure
              title="Share of posts by persona"
              note="Relevant posts only"
              insights={insight.personaInsights(a)}
            >
              <HBars
                rows={a.stats.personas.map((p) => ({
                  label: p.name,
                  sub: `${p.posts} posts${p.avgInteractions === null ? '' : ` · ${fmt(p.avgInteractions)} avg interactions`}`,
                  value: p.sharePercent,
                  color: C.website,
                }))}
              />
            </Figure>
          )}
          {a.stats.themes.length > 0 && (
            <Figure
              title="How each theme lands with the audience"
              note="Share of the theme’s posts that are relevant"
              insights={insight.themeInsights(a)}
            >
              <HBars
                rows={a.stats.themes.map((x) => ({
                  label: x.name,
                  sub: `${x.posts} posts`,
                  value: x.relevantPercent,
                  color: C.social,
                }))}
              />
            </Figure>
          )}
          <div className="pdf-two">
            <div>
              <h3>Working</h3>
              <ul className="pdf-points">
                {a.content.working.map((x, i) => (
                  <li key={i}>
                    <strong>{x.point}</strong> {x.evidence}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Gaps</h3>
              <ul className="pdf-points">
                {a.content.gaps.map((x, i) => (
                  <li key={i}>
                    <strong>{x.point}</strong> {x.evidence}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {a.content.recommendations.length > 0 && (
            <Figure breakable title="Recommended next steps">
              <table className="pdf-table">
                <tbody>
                  {a.content.recommendations.map((x, i) => (
                    <tr key={i}>
                      <td>{String(i + 1).padStart(2, '0')}</td>
                      <td>
                        <strong>{x.action}</strong>
                        <small>{x.why}</small>
                      </td>
                      <td>{x.service}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Figure>
          )}
        </Section>
      )}

      {/* ---------- Opportunities ---------- */}
      {show('opportunities') && (
        <Section
          n={num()}
          eyebrow="FROM INSIGHT TO ACTION"
          title="Priority opportunities"
          intro="The lowest-scoring measured areas, most urgent first."
        >
          {report.gaps.length ? (
            <table className="pdf-table pdf-gaps">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Opportunity</th>
                  <th>Where</th>
                  <th>Score</th>
                  <th>Measured</th>
                  <th>Tier2 service</th>
                </tr>
              </thead>
              <tbody>
                {report.gaps.map((g, i) => (
                  <tr key={`${g.platform}-${g.component}`}>
                    <td>{String(i + 1).padStart(2, '0')}</td>
                    <td>
                      <strong>{gapTitle(g)}</strong>
                      <small>{g.explanation}</small>
                    </td>
                    <td>{sourceName(g.platform)}</td>
                    <td className="bad">{Math.round(g.score)}</td>
                    <td>{g.measured}</td>
                    <td>{g.service}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="pdf-lede">
              No measured component falls below the {t.gapScore}-point opportunity line.
            </p>
          )}
        </Section>
      )}

      {/* ---------- Data notes ---------- */}
      {notes.length > 0 && (
        <Section n={num()} eyebrow="DATA NOTES" title="The context behind the numbers">
          <p className="pdf-small">
            Benchmarks are Tier2 targets set near top-quartile performance from published 2025–26 research,
            not industry averages.{' '}
            {mode === 'live'
              ? `Figures reflect what public sources returned on ${date(report.asOf)}; accounts can change after that date.`
              : 'This demo report is built from stored sample data.'}
          </p>
          <div className="pdf-notes">
            {notes.map(([label, notes, at]) => (
              <div key={label}>
                <strong>{label}</strong>
                <ul>
                  {notes!.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                {at && (
                  <small>
                    Collected {new Date(at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                  </small>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {show('overview') && (
        <div className="pdf-appendix">
          <PrintMethodology report={report} />
        </div>
      )}
    </article>
  );
}
