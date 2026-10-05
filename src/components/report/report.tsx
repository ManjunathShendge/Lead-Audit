'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Camera as Instagram,
  UsersRound as Facebook,
  BriefcaseBusiness as Linkedin,
  SquarePlay as Youtube,
  ArrowDownToLine,
  ArrowUpRight,
  ArrowLeft,
  Info,
  Check,
  ArrowRight,
  Globe,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  Clapperboard,
  Search,
  MonitorSmartphone,
  Megaphone,
  TrendingUp,
  PenLine,
  Briefcase,
  MapPin,
  Compass,
  Palette,
  Sparkles,
  Handshake,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { Report } from '@/lib/report';
import { platformNames, type Platform } from '@/lib/collectors/types';
import { band } from '@/lib/scoring';
import './report.css';
import { Ring } from './ring';
import { ScoreComposition, SocialScoreMatrix, WebsiteSection, GbpSection, ChannelIcon } from './channels';
import { channelNames } from '@/lib/collectors/channel-types';
import { SummaryCard } from './summary';
import { ChartInsight } from './insight';
import { SectionDownload } from './section-download';
import { SectionNav, type NavSection } from './section-nav';
import { Reveal, Stagger, StaggerItem } from './reveal';
import { SeoSection } from './seo';
import * as insight from '@/lib/insights';
import type { StoredSummary } from '@/lib/ai/summary-types';
import type { StoredAlignment, TargetAudience } from '@/lib/ai/alignment-types';
import { AlignmentSection } from './alignment';
import { PrintMethodology } from './methodology';
// Theme variables (globals.css) so charts follow the light and dark palettes.
const colors: Record<Platform, string> = {
  instagram: 'var(--c-instagram)',
  facebook: 'var(--c-facebook)',
  linkedin: 'var(--c-linkedin)',
  youtube: 'var(--c-youtube)',
};
const icons = { instagram: Instagram, facebook: Facebook, linkedin: Linkedin, youtube: Youtube };
const display = (n: number | null, digits = 0) =>
  n === null ? 'Not measured' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
/** "How Tier2 can help" section and its jump button. Hidden for now; set to true to bring both back. */
const SHOW_TIER2_SERVICES = false;
const date = (s: string | null) =>
  s === null
    ? 'Not measured'
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(s));
const componentNames: Record<string, string> = {
  activity: 'Activity',
  engagement: 'Engagement',
  audience: 'Audience',
  completeness: 'Profile',
};
export function PlatformIcon({ platform, size = 17 }: { platform: Platform; size?: number }) {
  const Icon = icons[platform];
  return (
    <span className={`platform-icon ${platform}`}>
      <Icon size={size} />
    </span>
  );
}
/** Calendar geometry: 90 days by default, or every day of the audit's chosen period. */
function calendarLayout(report: Report) {
  const end = Date.parse(report.period?.end ?? report.asOf);
  const days = report.period ? Math.ceil((end - Date.parse(report.period.start)) / 86400000) : 90;
  const long = days > 120;
  return {
    end,
    days,
    ticks: [0, Math.round((days - 1) / 3), Math.round(((days - 1) * 2) / 3), days - 1],
    // Long periods keep cells legible by widening the scroll area instead of shrinking cells to nothing.
    width: long ? { minWidth: days * 4 + 110 } : undefined,
    grid: { gridTemplateColumns: `repeat(${days}, minmax(3px, 1fr))`, gap: long ? 1 : 3 },
  };
}
export interface ReportProps {
  id: string;
  brand: string;
  website: string | null;
  report: Report;
  print?: boolean;
  /** AI plain-language summary, if one has been written. */
  summary?: StoredSummary | null;
  aiEnabled?: boolean;
  completedAt?: string | null;
  /** How the data was collected. Only mock audits may be labelled as synthetic. */
  mode: 'live' | 'mock';
  alignment?: StoredAlignment | null;
  targetAudience?: TargetAudience | null;
}
export function SocialReport({
  id,
  brand,
  website,
  report,
  print = false,
  summary: initialSummary = null,
  aiEnabled = false,
  completedAt = null,
  mode,
  alignment = null,
  targetAudience = null,
}: ReportProps) {
  const live = mode === 'live';
  const calendar = calendarLayout(report);
  const [summary, setSummary] = useState<StoredSummary | null>(initialSummary);
  const onSummary = useCallback((s: StoredSummary) => setSummary(s), []);
  const [ready, setReady] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(id);
  }, []);
  const measured = report.cards.filter((c) => c.score !== null);
  const best = [...measured].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  // Reports stored before website and GBP scoring existed have no channel sections.
  const siteChannel = report.website ?? null;
  const gbpChannel = report.gbp ?? null;
  const headline = report.overall.score;
  const measuredChannels = [siteChannel?.score, report.social, gbpChannel?.score].filter(
    (v) => v !== null && v !== undefined,
  ).length;
  const verdict =
    headline === null
      ? 'There is not enough measured data to assess this brand yet.'
      : headline >= 80
        ? 'A strong foundation. Keep turning attention into connection.'
        : headline >= 60
          ? 'A promising presence, with room to make a bigger impression.'
          : 'The next chapter starts with showing up consistently.';
  const radarData = Object.keys(componentNames).map((key) => ({
    component: componentNames[key],
    ...Object.fromEntries(
      report.cards.map((c) => [c.platform, c.components[key as keyof typeof c.components]]),
    ),
  }));
  const download = async () => {
    setPdfBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/audits/${id}/pdf`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'PDF export failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-social-audit.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export PDF.');
    } finally {
      setPdfBusy(false);
    }
  };
  const navSections: NavSection[] = [
    { id: 'sec-overview', label: 'Overview' },
    ...(alignment?.status === 'ok' || aiEnabled ? [{ id: 'sec-audience', label: 'Target audience' }] : []),
    { id: 'sec-score', label: 'Score' },
    { id: 'sec-social', label: 'Social media' },
    ...(siteChannel ? [{ id: 'sec-website', label: 'Website' }] : []),
    ...(report.seo?.groups ? [{ id: 'sec-seo', label: 'SEO audit' }] : []),
    ...(gbpChannel ? [{ id: 'sec-gbp', label: 'Google Business' }] : []),
    { id: 'sec-actions', label: 'Opportunities' },
  ];
  return (
    <article
      className={`social-report ${print ? 'print-report' : ''} ${report.gaps.length ? '' : 'no-gaps'}`}
      data-report-ready={ready ? 'true' : 'false'}
    >
      {!print && <SectionNav sections={navSections} />}
      <Reveal className="report-page report-page-one" id="sec-overview">
        {!print && (
          <Link className="back-link" href="/history">
            <ArrowLeft size={13} />
            Back to audit library
          </Link>
        )}
        <div className="page-heading">
          <div>
            <span className="eyebrow">{report.overall.label.replace(' Score', '').toUpperCase()} REPORT</span>
            <h1>
              {brand}
              <span className="brand-dot">.</span>
            </h1>
            <div className="report-meta">
              <span>
                <Globe size={12} />
                {website ? new URL(website).hostname : 'No website provided'}
              </span>
              <span>
                <CalendarDays size={12} />
                {date(report.asOf)}
              </span>
              {report.period && (
                <span title="Social posting and engagement cover this period">
                  <CalendarRange size={12} />
                  {report.period.label}
                </span>
              )}
              <span>#{id.slice(-8).toUpperCase()}</span>
            </div>
          </div>
          {!print && (
            <div className="actions">
              <Link className="button" href={`/audits/new?from=${id}`}>
                Re-run audit
                <ArrowUpRight size={15} />
              </Link>
              <button className="button primary" onClick={download} disabled={pdfBusy}>
                <ArrowDownToLine size={16} />
                {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
              </button>
            </div>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className={`report-disclaimer ${live ? 'live' : 'demo'}`}>
          <span>
            <Info size={13} />
            {live
              ? `Live data · collected from public sources on ${date(report.asOf)}`
              : 'Demo report · synthetic sample data, not a real brand'}
          </span>
          <span>4 platforms · researched benchmarks · {report.industry}</span>
        </div>
        {!print && (
          <SummaryCard
            auditId={id}
            summary={summary}
            onChange={onSummary}
            aiEnabled={aiEnabled}
            print={false}
          />
        )}
        <section className="hero-panel">
          <div className="hero-score">
            <Ring score={report.overall.score} size={170} print={print} />
            <div className="score-caption">{report.overall.label}</div>
          </div>
          <div className="hero-copy">
            <div
              className={`score-band band-${band(headline, report.config).toLowerCase().replace(' ', '-')}`}
            >
              <span /> {band(headline, report.config)} presence
            </div>
            <h2>{verdict}</h2>
            <p>
              {best
                ? `${platformNames[best.platform]} leads the way. ${report.gaps.length ? `${report.gaps.length} opportunities below point to where your next effort could count most.` : 'Keep the momentum with a consistent, thoughtful content strategy.'}`
                : 'Confirm accounts and collect public data to reveal opportunities.'}
            </p>
            {SHOW_TIER2_SERVICES && !print && report.gaps.length > 0 && (
              <a className="button primary hero-help-link" href="#tier2-services">
                <Handshake size={15} />
                See how Tier2 can help
              </a>
            )}
            <div className="hero-facts">
              <div>
                <strong>
                  {measured.length}
                  <small> / 4</small>
                </strong>
                <span>Platforms scored</span>
              </div>
              <div>
                <strong>{report.gaps.length}</strong>
                <span>Priority opportunities</span>
              </div>
              <div>
                <strong>{report.costUsd === null ? 'Unknown' : `$${report.costUsd.toFixed(2)}`}</strong>
                <span>Collection cost</span>
              </div>
            </div>
          </div>
          <span className="hero-decoration" aria-hidden="true">
            ↗
          </span>
        </section>
        <details className="score-explainer">
          <summary>
            <Info size={13} />
            How this score is calculated
            <ChevronDown size={13} />
          </summary>
          <p>
            Overall = Website {report.config.channels.website}% + Social {report.config.channels.social}% +
            Google Business Profile {report.config.channels.gbp}% (configured). {measuredChannels} of 3
            channels were measured; unmeasured channels are left out and the rest re-weighted to{' '}
            {(['website', 'social', 'gbp'] as const)
              .map(
                (c) =>
                  `${c === 'gbp' ? 'GBP' : c[0].toUpperCase() + c.slice(1)} ${display((report.overall.weights as Record<string, number>)[c], 1)}%`,
              )
              .join(', ')}
            . Unavailable components and platforms are excluded; confirmed absent relevant accounts score 0.
            Scores use unrounded values.
          </p>
          <div className="explain-grid">
            {report.cards.map((c) => (
              <div key={c.platform}>
                <strong>
                  {platformNames[c.platform]}: {display(c.score, 1)}
                </strong>
                <span>
                  Effective weight {display(report.platformWeights[c.platform], 1)}% · configured{' '}
                  {report.config.industries[report.industry].weights[c.platform]}%
                </span>
              </div>
            ))}
          </div>
        </details>
        <div className="section-heading platform-section-title">
          <h2>The platform picture</h2>
          <span className="muted">A snapshot of where the brand stands</span>
        </div>
        <section className="platform-grid">
          {report.cards.map((card, i) => (
            <motion.div
              key={card.platform}
              className="panel platform-card"
              initial={print || reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={print || reduced ? undefined : { y: -4, transition: { duration: 0.2 } }}
            >
              <div className="platform-card-title">
                <PlatformIcon platform={card.platform} />
                <strong>{platformNames[card.platform]}</strong>
                <span className={`status-pill status-${card.status}`}>
                  {card.status === 'ok'
                    ? 'Measured'
                    : card.status === 'absent'
                      ? 'No account'
                      : card.status.replace('_', ' ')}
                </span>
              </div>
              <div className="platform-score">
                <Ring score={card.score} size={74} color={colors[card.platform]} print={print} />
                <div>
                  <strong>{band(card.score, report.config)}</strong>
                  <span>{card.handle ? `@${card.handle}` : 'No confirmed handle'}</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>{card.platform === 'youtube' ? 'Subscribers' : 'Followers'}</dt>
                  <dd>{card.subscriberHidden ? 'Hidden' : display(card.profile?.followers ?? null)}</dd>
                </div>
                <div>
                  <dt>{report.period ? 'Avg posts / 30 days' : 'Posts / 30 days'}</dt>
                  <dd>
                    {card.metrics.lowerBound ? '≥ ' : ''}
                    {display(card.metrics.count)}
                    {report.period && card.metrics.postsInPeriod != null && (
                      <small className="period-total"> · {card.metrics.postsInPeriod} in period</small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Engagement rate</dt>
                  <dd>
                    {card.metrics.engagement === null
                      ? 'Not measured'
                      : `${display(card.metrics.engagement, 2)}%`}
                  </dd>
                </div>
                <div>
                  <dt>Last post</dt>
                  <dd>{date(card.metrics.lastPost)}</dd>
                </div>
              </dl>
              <details className="platform-details">
                <summary>
                  Score breakdown <ChevronDown size={12} />
                </summary>
                {Object.entries(card.components).map(([key, value]) => (
                  <div className="component-row" key={key}>
                    <span>{componentNames[key]}</span>
                    <strong>{display(value, 1)}</strong>
                    <small>{display(card.weights[key], 1)}% weight</small>
                  </div>
                ))}
                <p>
                  Targets: {card.benchmark.postsTarget} posts/month · {card.benchmark.engagementTarget}%
                  engagement · {display(card.benchmark.followerLow)}–{display(card.benchmark.followerHigh)}{' '}
                  followers.
                </p>
                <p>
                  Observed longest gap: {display(card.metrics.longestGap, 1)} days. Avg likes:{' '}
                  {display(card.metrics.avgLikes, 1)}; avg comments: {display(card.metrics.avgComments, 1)}.
                  Profile checks: {display(card.metrics.completeness, 1)}%.
                </p>
              </details>
            </motion.div>
          ))}
        </section>
      </Reveal>
      {/* In the PDF the summary gets its own page so the cover page keeps its one-page layout. */}
      {print && summary?.status === 'ok' && (
        <div className="report-page report-page-summary">
          <SummaryCard auditId={id} summary={summary} onChange={onSummary} aiEnabled={aiEnabled} print />
        </div>
      )}
      {(!print || alignment?.status === 'ok') && (
        <Reveal className="report-page report-page-alignment" id="sec-audience">
          {alignment?.status === 'ok' && !print && (
            <SectionDownload auditId={id} brand={brand} section="audience" />
          )}
          <AlignmentSection
            auditId={id}
            initial={alignment}
            targetAudience={targetAudience}
            aiEnabled={aiEnabled}
            completedAt={completedAt}
            print={print}
            industry={report.industry}
          />
        </Reveal>
      )}
      {SHOW_TIER2_SERVICES && report.gaps.length > 0 && (
        <div className="report-page report-page-services">
          <Tier2Services gaps={report.gaps} brand={brand} print={print} />
        </div>
      )}
      <Reveal className="report-page report-page-scoring" id="sec-score">
        {!print && <SectionDownload auditId={id} brand={brand} section="overview" />}
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE SCORE, UNPACKED</span>
            <h2>Where every point comes from</h2>
            <p>
              {print
                ? 'Every score is 0–100; weights sit beside each label.'
                : 'Hover any bar for its exact value and weight.'}
            </p>
          </div>
        </div>
        <ScoreComposition report={report} print={print} />
        <ChartInsight items={insight.compositionInsights(report)} />
        <section className="panel matrix-panel">
          <SectionTitle
            title="Inside the social score"
            subtitle="Each platform’s four components, 0–100, and the share of the social score it carries"
            number=""
          />
          <SocialScoreMatrix report={report} colors={colors} />
          <ChartInsight items={insight.socialMatrixInsights(report)} />
        </section>
      </Reveal>
      <Reveal className="report-page report-page-two" id="sec-social">
        {!print && <SectionDownload auditId={id} brand={brand} section="social" />}
        <section className="chart-grid radar-section">
          <div className="panel">
            <SectionTitle
              title="Beyond the follower count"
              subtitle="Four dimensions of a healthy social presence"
              number="01"
            />
            <div
              className="chart-frame radar-frame"
              role="img"
              aria-label="Radar chart comparing activity, engagement, audience and profile scores"
            >
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="var(--line)" />
                  <PolarAngleAxis dataKey="component" tick={{ fill: 'var(--muted)', fontSize: 16 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  {report.cards
                    .filter((c) => Object.values(c.components).every((v) => v !== null))
                    .map((c) => (
                      <Radar
                        key={c.platform}
                        dataKey={c.platform}
                        stroke={colors[c.platform]}
                        fill={colors[c.platform]}
                        fillOpacity={0.08}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    ))}
                  <Tooltip
                    contentStyle={{
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-legend">
              {report.cards.map((c) => (
                <span key={c.platform}>
                  <i style={{ background: colors[c.platform] }} />
                  {platformNames[c.platform]}
                </span>
              ))}
            </div>
            <p className="chart-note">
              Incomplete component sets are omitted from the radar; values remain available in each score
              breakdown.
            </p>
            <ChartInsight items={insight.radarInsights(report)} />
          </div>
        </section>
        <section className="panel calendar-panel">
          <SectionTitle
            title="Consistency leaves a pattern"
            subtitle={`Observed posting activity · ${report.period?.label ?? 'last 90 days'} · Asia/Kolkata · pinned posts excluded`}
            number="02"
          />
          <div className="calendar-scroll">
            <div className="calendar-months" style={calendar.width}>
              <span />
              {calendar.ticks.map((i) => (
                <span key={i}>
                  {date(new Date(calendar.end - (calendar.days - 1 - i) * 86400000).toISOString())
                    .split(' ')
                    .slice(0, 2)
                    .join(' ')}
                </span>
              ))}
            </div>
            {report.cards.map((card) => (
              <div className="calendar-row" key={card.platform} style={calendar.width}>
                <span>
                  <PlatformIcon platform={card.platform} size={13} />
                  {platformNames[card.platform]}
                </span>
                {card.metrics.calendar ? (
                  <div className="calendar-cells" style={calendar.grid}>
                    {card.metrics.calendar.map((day) => (
                      <div
                        key={day.date}
                        className={`calendar-cell level-${Math.min(day.count, 3)}`}
                        title={`${day.date}: ${day.count} observed posts`}
                        aria-label={`${day.date}: ${day.count} observed posts`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="calendar-missing">Not measured — {card.status}</div>
                )}
              </div>
            ))}
          </div>
          <div className="calendar-key">
            <span>Empty cells mean no posts observed, not confirmed inactivity.</span>
            <span>
              Less <i className="level-0" />
              <i className="level-1" />
              <i className="level-2" />
              <i className="level-3" /> More
            </span>
          </div>
          <ChartInsight items={insight.calendarInsights(report)} />
        </section>
      </Reveal>
      <Reveal className="report-page report-page-three">
        <section className="engagement-section">
          <div className="panel">
            <SectionTitle
              title="Attention meets interaction"
              subtitle="Engagement rate alongside audience size"
              number="03"
            />
            <div className="chart-frame" role="img" aria-label="Bar chart of engagement rates by platform">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={report.cards.map((c) => ({
                    name: platformNames[c.platform],
                    engagement: c.metrics.engagement,
                    platform: c.platform,
                  }))}
                  margin={{ left: -8, right: 8, top: 22, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--muted)', fontSize: 16 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted)', fontSize: 16 }}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--line)' }}
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                    formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Engagement']}
                  />
                  <Bar dataKey="engagement" radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                    {report.cards.map((c) => (
                      <Cell key={c.platform} fill={colors[c.platform]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="audience-strip">
              {report.cards.map((c) => (
                <div key={c.platform}>
                  <strong>{c.subscriberHidden ? 'Hidden' : display(c.profile?.followers ?? null)}</strong>
                  <span>{platformNames[c.platform]} audience</span>
                  <small>
                    {c.metrics.engagement === null
                      ? 'Rate not measured'
                      : `${display(c.metrics.engagement, 2)}% engagement`}
                  </small>
                </div>
              ))}
            </div>
            <ChartInsight items={insight.engagementInsights(report)} />
          </div>
        </section>
        <section className="panel content-panel">
          <SectionTitle
            title="A balanced content diet"
            subtitle="Video and reels versus static formats in the fetched sample"
            number="04"
          />
          <div className="mix-grid">
            {report.cards.map((c) => (
              <div className="mix-item" key={c.platform}>
                <div
                  className="mix-chart"
                  role="img"
                  aria-label={`${platformNames[c.platform]}: ${c.metrics.mix ? Math.round(c.metrics.mix.videoPercent) + '% video' : 'Not measured'}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={
                          c.metrics.mix
                            ? [
                                { name: 'Video / reels', value: c.metrics.mix.video },
                                { name: 'Static', value: c.metrics.mix.static },
                              ]
                            : [{ name: 'Not measured', value: 1 }]
                        }
                        dataKey="value"
                        innerRadius={38}
                        outerRadius={48}
                        paddingAngle={c.metrics.mix ? 3 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        <Cell fill={c.metrics.mix ? colors[c.platform] : 'var(--line)'} />
                        <Cell fill="var(--line)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <span>
                    {c.metrics.mix ? `${Math.round(c.metrics.mix.videoPercent)}%` : '—'}
                    <small>{c.metrics.mix ? 'video' : 'not measured'}</small>
                  </span>
                </div>
                <strong>{platformNames[c.platform]}</strong>
                <p>
                  {c.metrics.mix
                    ? `${c.metrics.mix.video} video · ${c.metrics.mix.static} static`
                    : 'Not measured'}
                </p>
              </div>
            ))}
          </div>
          <ChartInsight items={insight.mixInsights(report)} />
        </section>
      </Reveal>
      <Reveal className="report-page report-page-posts">
        <section className="panel top-posts-panel">
          <SectionTitle
            title="Content that connected"
            subtitle="Top posts per platform by measured likes + comments"
            number="05"
          />
          <div className="top-post-grid">
            {report.cards.map((c) => (
              <div key={c.platform}>
                <h3>
                  <PlatformIcon platform={c.platform} size={14} />
                  {platformNames[c.platform]}
                </h3>
                {c.metrics.top.length ? (
                  c.metrics.top.map((p, i) => (
                    <div className="post-item" key={p.id}>
                      <span className="post-rank">0{i + 1}</span>
                      <div>
                        <span className="post-format">
                          {p.type} · {date(p.publishedAt)}
                        </span>
                        <p>{p.captionPreview ?? 'Caption not measured'}</p>
                        <small>
                          {display(p.likes)} likes <span>·</span> {display(p.comments)} comments
                        </small>
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer">
                            View post <ArrowUpRight size={11} />
                          </a>
                        ) : (
                          <span className="mock-post-note">
                            {live ? 'Post link not available' : 'Sample post · no live link'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted">No posts with measured likes and comments.</p>
                )}
              </div>
            ))}
          </div>
          <ChartInsight items={insight.topPostInsights(report)} />
        </section>
      </Reveal>
      {siteChannel && (
        <Reveal className="report-page report-page-website" id="sec-website">
          {!print && <SectionDownload auditId={id} brand={brand} section="website" />}
          <WebsiteSection report={report} website={siteChannel} print={print} />
        </Reveal>
      )}
      {/* Reports from before the status groups existed have no SEO section to show. */}
      {report.seo?.groups && (
        <Reveal className="report-page report-page-seo" id="sec-seo">
          {!print && <SectionDownload auditId={id} brand={brand} section="seo" />}
          <SeoSection report={report} seo={report.seo} print={print} />
        </Reveal>
      )}
      {gbpChannel && (
        <Reveal className="report-page report-page-gbp" id="sec-gbp">
          {!print && <SectionDownload auditId={id} brand={brand} section="gbp" />}
          <GbpSection report={report} gbp={gbpChannel} print={print} />
        </Reveal>
      )}
      <Reveal className="report-page report-page-four" id="sec-actions">
        {!print && <SectionDownload auditId={id} brand={brand} section="opportunities" />}
        <section className="opportunities">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FROM INSIGHT TO ACTION</span>
              <h2>Small shifts. Meaningful impact.</h2>
              <p>Your highest-priority opportunities, paired with a way forward.</p>
            </div>
            <span className="tag">{report.gaps.length} quick wins</span>
          </div>
          <Stagger className="gap-grid">
            {report.gaps.length ? (
              report.gaps.map((gap, i) => (
                <StaggerItem kind="pop" className="panel gap-card" key={`${gap.platform}-${gap.component}`}>
                  <div className="gap-header">
                    <span className="gap-index">0{i + 1}</span>
                    <span className="tag">
                      {gapSource(gap.platform)} · {gap.score.toFixed(0)}/100
                    </span>
                  </div>
                  <h3>{gapTitle(gap)}</h3>
                  <div className="gap-measure">{gap.measured}</div>
                  <p>{gap.explanation}</p>
                  <div className="service-link">
                    <span>
                      <small>Tier2 service</small>
                      {gap.service}
                    </span>
                    <ArrowRight size={14} />
                  </div>
                </StaggerItem>
              ))
            ) : (
              <div className="panel">
                <Check size={20} />
                <h3>{headline === null ? 'No measured opportunities yet' : 'A strong starting point'}</h3>
                <p>
                  {headline === null
                    ? 'Collect usable data before drawing conclusions.'
                    : 'No measured component falls below the configured threshold.'}
                </p>
              </div>
            )}
          </Stagger>
        </section>
        <section className="panel data-notes">
          <SectionTitle
            title="The context behind the numbers"
            subtitle="Data notes, limitations and provenance"
            number="06"
          />
          <div className="data-note-intro">
            <Info size={16} />
            <p>
              Benchmarks are Tier2 targets set near top-quartile performance from published 2025–26 industry
              research, not industry averages.{' '}
              {siteChannel || gbpChannel
                ? 'Website and Google Business Profile results are included where shown.'
                : 'Website and Google Business Profile were not measured.'}{' '}
              {live
                ? `Figures reflect what public sources returned on ${date(report.asOf)}; accounts can change after that date.`
                : 'This is a demo report built from stored sample data, not collected from a live source.'}
            </p>
          </div>
          <div className="notes-grid">
            {(
              [
                ['website', siteChannel],
                ['gbp', gbpChannel],
              ] as const
            ).map(([key, ch]) =>
              ch ? (
                <div key={key}>
                  <strong>
                    <ChannelIcon channel={key} size={13} /> {channelNames[key]}
                  </strong>
                  <ul>
                    {ch.warnings.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                    {Object.entries(ch.criteria)
                      .filter(([, v]) => v === null)
                      .map(([k]) => (
                        <li key={k}>{k[0].toUpperCase() + k.slice(1)} not measured; excluded from score.</li>
                      ))}
                  </ul>
                  <small>
                    Data timestamp:{' '}
                    {new Date(ch.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                  </small>
                </div>
              ) : null,
            )}
            {report.cards.map((c) => (
              <div key={c.platform}>
                <strong>{platformNames[c.platform]}</strong>
                <ul>
                  {c.metrics.notes
                    .filter((n, i) => i !== 0 || !n.startsWith('Synthetic'))
                    .map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  {Object.entries(c.components)
                    .filter(([, v]) => v === null)
                    .map(([k]) => (
                      <li key={k}>{componentNames[k]} not measured; excluded from score.</li>
                    ))}
                </ul>
                <small>
                  Data timestamp:{' '}
                  {new Date(c.fetchedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </small>
              </div>
            ))}
          </div>
          {!print && (
            <a className="raw-link" href={`/api/audits/${id}/raw`} target="_blank" rel="noreferrer">
              Inspect stored source responses <ArrowUpRight size={13} />
            </a>
          )}
        </section>
        <div className="report-closing">
          <span className="wordmark">
            tier2<span>®</span>
          </span>
          <div>
            Built for the next chapter.<span>Strategy · Creativity · Growth</span>
          </div>
          <span>tier2.digital</span>
        </div>
      </Reveal>
      {print && <PrintMethodology report={report} />}
    </article>
  );
}
function gapSource(source: string) {
  if (source === 'seo') return 'SEO';
  return source === 'website' || source === 'gbp'
    ? channelNames[source]
    : (platformNames[source as Platform] ?? source);
}
const channelGapTitles: Record<string, Record<string, string>> = {
  website: {
    performance: 'Make the site feel instant',
    seo: 'Fix the foundations search engines read',
    tracking: 'Measure what your marketing earns',
    conversion: 'Give visitors a clear next step',
    freshness: 'Keep the site current',
  },
  seo: {
    visibility: 'Get found when people search for you',
    technical: 'Make the site easy for Google to crawl',
    onpage: 'Sharpen titles, headings and descriptions',
    content: 'Give search engines more to rank',
    experience: 'Speed up the page experience',
  },
  gbp: {
    missing: 'Get found on Google Maps',
    rating: 'Lift the star rating',
    reviews: 'Earn more reviews',
    replies: 'Answer your reviews',
    completeness: 'Complete the Google listing',
  },
};
function channelGapTitle(source: string, component: string): string | null {
  return channelGapTitles[source]?.[component] ?? null;
}
function gapTitle(gap: Report['gaps'][number]) {
  return (
    channelGapTitle(gap.platform, gap.component) ??
    (gap.component === 'missing'
      ? `Build a presence on ${platformNames[gap.platform as Platform]}`
      : gap.component === 'video'
        ? 'Bring the story to life with video'
        : gap.component === 'activity'
          ? 'Close the gaps in your calendar'
          : gap.component === 'engagement'
            ? 'Give your audience a reason to respond'
            : gap.component === 'audience'
              ? 'Reach more of the right people'
              : 'Make the first impression complete')
  );
}
const serviceIcons: [RegExp, typeof Sparkles][] = [
  [/video|animation/i, Clapperboard],
  [/local|reputation/i, MapPin],
  [/seo|aeo|geo/i, Search],
  [/web|ui|cro/i, MonitorSmartphone],
  [/growth|performance/i, TrendingUp],
  [/copy|content/i, PenLine],
  [/b2b/i, Briefcase],
  [/social/i, Megaphone],
  [/brand/i, Palette],
  [/strategy/i, Compass],
];
const serviceIcon = (service: string) => serviceIcons.find(([re]) => re.test(service))?.[1] ?? Sparkles;
const priority = (score: number) =>
  score < 35
    ? { label: 'High priority', tone: 'high' }
    : score < 60
      ? { label: 'Medium priority', tone: 'medium' }
      : { label: 'Worth doing', tone: 'low' };
function Tier2Services({ gaps, brand, print }: { gaps: Report['gaps']; brand: string; print: boolean }) {
  // One card per Tier2 service, ordered by the weakest score it would fix.
  const byService = new Map<string, Report['gaps']>();
  for (const g of gaps) byService.set(g.service, [...(byService.get(g.service) ?? []), g]);
  const services = [...byService]
    .map(([service, items]) => ({
      service,
      items,
      worst: Math.min(...items.map((g) => g.score)),
      explanation: items[0].explanation,
    }))
    .sort((a, b) => a.worst - b.worst);
  return (
    <section className="tier2-services" id="tier2-services">
      <div className="tier2-services-head">
        <div>
          <span className="eyebrow">HOW TIER2 CAN HELP</span>
          <h2>
            A clear plan to grow {brand}
            {/s$/i.test(brand) ? '’' : '’s'} presence<span className="brand-dot">.</span>
          </h2>
          <p>
            Every gap in this report maps to a Tier2 service. Start with the highest priority and build from
            there.
          </p>
        </div>
        <div className="tier2-services-count">
          <strong>{services.length}</strong>
          <span>
            Tier2 service{services.length === 1 ? '' : 's'}
            <br />
            recommended
          </span>
        </div>
      </div>
      <div className="tier2-service-grid">
        {services.map(({ service, items, worst, explanation }, i) => {
          const Icon = serviceIcon(service);
          const p = priority(worst);
          return (
            <div className={`tier2-service-card ${i === 0 ? 'featured' : ''}`} key={service}>
              <div className="tier2-service-top">
                <span className="tier2-service-icon">
                  <Icon size={18} />
                </span>
                <span className={`priority-tag ${p.tone}`}>{p.label}</span>
              </div>
              <h3>{service}</h3>
              <p>{explanation}</p>
              <span className="tier2-fixes-label">What this fixes</span>
              <ul>
                {items.map((g) => (
                  <li key={`${g.platform}-${g.component}`}>
                    <Check size={12} />
                    <span>
                      {gapTitle(g)} <small>· {gapSource(g.platform)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="tier2-cta">
        <div>
          <strong>Ready to turn these gaps into growth?</strong>
          <span>Book a free strategy call and we&rsquo;ll walk through this plan together.</span>
        </div>
        {print ? (
          <span className="tier2-cta-url">tier2.digital</span>
        ) : (
          <a className="button primary" href="https://www.tier2.digital" target="_blank" rel="noreferrer">
            Talk to Tier2
            <ArrowUpRight size={15} />
          </a>
        )}
      </div>
    </section>
  );
}
function SectionTitle({ title, subtitle, number }: { title: string; subtitle: string; number: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <span className="section-number">{number}</span>
    </div>
  );
}
