import type { Report } from './report';
import { platformNames, type Platform } from './collectors/types';
import { band } from './scoring';
import { seoBenchmarks } from './seo/benchmarks';

/**
 * "What this chart shows": two or three short findings read straight off the numbers behind each
 * report chart. Deterministic, so a finding can never quote a number the chart does not show.
 */
type Card = Report['cards'][number];
const r = (v: number) => Math.round(v);
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const fmt = (v: number) => new Intl.NumberFormat('en-IN').format(Math.round(v));
const name = (p: Platform) => platformNames[p];
const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const componentLabel: Record<string, string> = {
  activity: 'posting activity',
  engagement: 'engagement',
  audience: 'audience size',
  completeness: 'profile completeness',
};
const channelLabel = { website: 'Website', social: 'Social', gbp: 'Google Business Profile' } as const;
/** Lower-case a label's first letter for mid-sentence use, keeping acronyms ("XML sitemap") intact. */
const lower = (label: string) => (/^[A-Z][A-Z]/.test(label) ? label : label[0].toLowerCase() + label.slice(1));
const scored = (cards: Card[]) => cards.filter((c) => c.score !== null);

export function compositionInsights(report: Report): string[] {
  const scores = report.channelScores ?? { website: null, social: report.social, gbp: null };
  const weights = report.overall.weights as Record<string, number>;
  const parts = (['website', 'social', 'gbp'] as const)
    .filter((c) => scores[c] !== null)
    .map((c) => ({ c, score: scores[c] as number, pts: ((scores[c] as number) * (weights[c] ?? 0)) / 100 }));
  if (!parts.length || report.overall.score === null) return ['No channel could be measured, so there is no score to break down yet.'];
  const out: string[] = [];
  const top = [...parts].sort((a, b) => b.pts - a.pts)[0];
  out.push(
    `${channelLabel[top.c]} carries the most weight, adding ${f1(top.pts)} of the ${r(report.overall.score)} points.`,
  );
  const weak = [...parts].sort((a, b) => a.score - b.score)[0];
  if (parts.length > 1 && weak.c !== top.c && weak.score < 80)
    out.push(
      `${channelLabel[weak.c]} is the weakest channel at ${r(weak.score)}/100; lifting it to 80 would add about ${f1(Math.max(0, ((80 - weak.score) * (weights[weak.c] ?? 0)) / 100))} points overall.`,
    );
  const missing = (['website', 'social', 'gbp'] as const).filter((c) => scores[c] === null);
  if (missing.length)
    out.push(`${list(missing.map((c) => channelLabel[c]))} could not be measured, so the score is re-weighted across the rest.`);
  return out;
}

export function socialMatrixInsights(report: Report): string[] {
  const threshold = report.config.thresholds.gapScore;
  const cells = report.cards.flatMap((c) =>
    Object.entries(c.components)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => ({ p: c.platform, k, v: v as number })),
  );
  if (!cells.length) return ['No social component could be measured.'];
  const out: string[] = [];
  const best = scored(report.cards).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (best) out.push(`${name(best.platform)} leads the social score at ${r(best.score!)}/100 (${band(best.score, report.config)}).`);
  const below = cells.filter((c) => c.v < threshold).sort((a, b) => a.v - b.v);
  if (below.length)
    out.push(
      `${below.length} of ${cells.length} measured scores fall below ${threshold}; the lowest is ${name(below[0].p)} ${componentLabel[below[0].k]} at ${r(below[0].v)}.`,
    );
  else out.push(`Every measured component clears the ${threshold}-point opportunity line.`);
  const byComponent = Object.keys(componentLabel)
    .map((k) => {
      const v = cells.filter((c) => c.k === k).map((c) => c.v);
      return { k, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
    })
    .filter((x) => x.avg !== null)
    .sort((a, b) => a.avg! - b.avg!);
  if (byComponent.length > 1)
    out.push(
      `Across platforms, ${componentLabel[byComponent[0].k]} is the weakest dimension (average ${r(byComponent[0].avg!)}), ${componentLabel[byComponent[byComponent.length - 1].k]} the strongest (${r(byComponent[byComponent.length - 1].avg!)}).`,
    );
  return out;
}

export function radarInsights(report: Report): string[] {
  const full = report.cards.filter((c) => Object.values(c.components).every((v) => v !== null));
  if (!full.length) return ['No platform has all four dimensions measured, so the radar has nothing to compare.'];
  const out: string[] = [];
  for (const k of ['engagement', 'activity'] as const) {
    const sorted = [...full].sort((a, b) => (b.components[k] ?? 0) - (a.components[k] ?? 0));
    if (sorted.length > 1)
      out.push(
        `${name(sorted[0].platform)} has the widest reach on ${componentLabel[k]} (${r(sorted[0].components[k]!)}); ${name(sorted[sorted.length - 1].platform)} the narrowest (${r(sorted[sorted.length - 1].components[k]!)}).`,
      );
    else out.push(`${name(sorted[0].platform)} scores ${r(sorted[0].components[k]!)} on ${componentLabel[k]}.`);
  }
  const lopsided = full
    .map((c) => {
      const v = Object.values(c.components) as number[];
      return { c, spread: Math.max(...v) - Math.min(...v) };
    })
    .sort((a, b) => b.spread - a.spread)[0];
  if (lopsided.spread >= 40)
    out.push(
      `${name(lopsided.c.platform)} is the most lopsided shape: a ${r(lopsided.spread)}-point spread between its best and worst dimension.`,
    );
  return out;
}

export function calendarInsights(report: Report): string[] {
  const rows = report.cards
    .filter((c) => c.metrics.calendar)
    .map((c) => ({
      c,
      posts: c.metrics.calendar!.reduce((a, d) => a + d.count, 0),
      days: c.metrics.calendar!.filter((d) => d.count > 0).length,
      total: c.metrics.calendar!.length,
    }));
  if (!rows.length) return ['No posting history could be read for any platform.'];
  const out: string[] = [];
  const most = [...rows].sort((a, b) => b.posts - a.posts)[0];
  out.push(
    `${name(most.c.platform)} is the most active: ${most.posts} posts on ${most.days} of ${most.total} days observed.`,
  );
  const silent = rows.filter((x) => x.posts === 0);
  if (silent.length) out.push(`${list(silent.map((x) => name(x.c.platform)))} showed no posts in this window.`);
  const gaps = report.cards
    .filter((c) => c.metrics.longestGap !== null)
    .sort((a, b) => b.metrics.longestGap! - a.metrics.longestGap!);
  if (gaps[0] && gaps[0].metrics.longestGap! > report.config.thresholds.gapDays)
    out.push(
      `The longest silence is ${r(gaps[0].metrics.longestGap!)} days on ${name(gaps[0].platform)}, beyond the ${report.config.thresholds.gapDays}-day limit that costs activity points.`,
    );
  else if (gaps[0]) out.push(`No platform went quiet for more than ${report.config.thresholds.gapDays} days.`);
  return out;
}

export function engagementInsights(report: Report): string[] {
  const rows = report.cards.filter((c) => c.metrics.engagement !== null);
  if (!rows.length) return ['Engagement could not be measured on any platform.'];
  const out: string[] = [];
  const vsTarget = rows
    .map((c) => ({ c, ratio: c.metrics.engagement! / c.benchmark.engagementTarget }))
    .sort((a, b) => b.ratio - a.ratio);
  const top = vsTarget[0];
  out.push(
    `${name(top.c.platform)} engages best against its benchmark: ${f1(top.c.metrics.engagement!)}% vs a ${top.c.benchmark.engagementTarget}% target (${f1(top.ratio)}×).`,
  );
  const behind = vsTarget.filter((x) => x.ratio < 1);
  if (behind.length)
    out.push(
      `${list(behind.map((x) => `${name(x.c.platform)} (${f1(x.c.metrics.engagement!)}%)`))} ${behind.length > 1 ? 'are' : 'is'} below target.`,
    );
  const largest = report.cards
    .filter((c) => c.profile?.followers)
    .sort((a, b) => (b.profile!.followers ?? 0) - (a.profile!.followers ?? 0))[0];
  if (largest && largest.platform !== top.c.platform)
    out.push(
      `The biggest audience (${name(largest.platform)}, ${fmt(largest.profile!.followers!)}) is not the most engaged one; size alone is not attention.`,
    );
  return out;
}

export function mixInsights(report: Report): string[] {
  const rows = report.cards.filter((c) => c.metrics.mix);
  if (!rows.length) return ['Content formats could not be read for any platform.'];
  const out: string[] = [];
  const sorted = [...rows].sort((a, b) => b.metrics.mix!.videoPercent - a.metrics.mix!.videoPercent);
  out.push(`${name(sorted[0].platform)} uses video most: ${r(sorted[0].metrics.mix!.videoPercent)}% of fetched posts.`);
  const none = rows.filter((c) => c.metrics.mix!.video === 0);
  if (none.length)
    out.push(`${list(none.map((c) => name(c.platform)))} posted no video at all, the format that platforms push hardest.`);
  else if (sorted.length > 1)
    out.push(`${name(sorted[sorted.length - 1].platform)} leans most on static posts (${r(100 - sorted[sorted.length - 1].metrics.mix!.videoPercent)}% static).`);
  return out;
}

export function topPostInsights(report: Report): string[] {
  const posts = report.cards.flatMap((c) =>
    c.metrics.top.map((p) => ({ p, platform: c.platform, total: (p.likes ?? 0) + (p.comments ?? 0) })),
  );
  if (!posts.length) return ['No posts had both likes and comments measured.'];
  const out: string[] = [];
  const best = [...posts].sort((a, b) => b.total - a.total)[0];
  const article = /^[aeiou]/i.test(name(best.platform)) ? 'an' : 'a';
  out.push(`The single best post is ${article} ${name(best.platform)} ${best.p.type.toLowerCase()} with ${fmt(best.total)} interactions.`);
  const types = new Map<string, number>();
  for (const x of posts) types.set(x.p.type.toLowerCase(), (types.get(x.p.type.toLowerCase()) ?? 0) + 1);
  const [type, count] = [...types].sort((a, b) => b[1] - a[1])[0];
  if (posts.length > 1) out.push(`${count} of the ${posts.length} top posts are ${type}s, the format that connects best here.`);
  const comments = posts.filter((x) => x.p.comments !== null && x.p.likes);
  if (comments.length) {
    const ratio = comments.reduce((a, x) => a + x.p.comments!, 0) / comments.reduce((a, x) => a + x.p.likes!, 0);
    out.push(
      ratio < 0.02
        ? 'Top posts earn likes but few comments: people watch rather than talk back.'
        : `Top posts draw about one comment per ${r(1 / ratio)} likes, a sign of real conversation.`,
    );
  }
  return out;
}

export function websiteInsights(report: Report): string[] {
  const w = report.website;
  if (!w) return [];
  const labels: Record<string, string> = {
    performance: 'performance',
    seo: 'SEO basics',
    tracking: 'tracking',
    conversion: 'conversion basics',
    freshness: 'content freshness',
  };
  const rows = Object.entries(w.criteria)
    .filter(([k, v]) => v !== null && ((w.weights as Record<string, number>)[k] ?? 0) > 0)
    .map(([k, v]) => ({ k, v: v as number }))
    .sort((a, b) => b.v - a.v);
  if (!rows.length) return ['The website could not be measured.'];
  const out = [`The site is strongest on ${labels[rows[0].k]} (${r(rows[0].v)}) and weakest on ${labels[rows[rows.length - 1].k]} (${r(rows[rows.length - 1].v)}).`];
  const d = w.detail;
  const missing = [
    d.tracking.analytics === false && 'analytics',
    d.tracking.meta === false && 'the Meta Pixel',
    d.conversion.form === false && 'a contact form',
    d.conversion.cta === false && 'a call to action above the fold',
  ].filter(Boolean) as string[];
  if (missing.length) out.push(`Missing: ${list(missing)}, so visits are hard to measure or convert.`);
  return out;
}

export function vitalsInsights(report: Report): string[] {
  const w = report.website;
  if (!w) return [];
  const t = report.config.thresholds;
  const d = w.detail.pagespeed;
  const out: string[] = [];
  const lcp = d.lcpMs === null ? null : d.lcpMs / 1000;
  if (lcp !== null)
    out.push(
      lcp <= t.lcp
        ? `The main content appears in ${f1(lcp)} s, inside Google's ${t.lcp} s target.`
        : `The main content takes ${f1(lcp)} s to appear, ${f1(lcp - t.lcp)} s slower than Google's ${t.lcp} s target; visitors on mobile feel this.`,
    );
  if (d.cls !== null && d.cls > t.cls) out.push(`The layout shifts as it loads (CLS ${d.cls.toFixed(2)} vs ${t.cls}), which causes mis-taps.`);
  const runs = w.parts.performance.pagespeed;
  if (runs !== null) out.push(`Mobile PageSpeed scores ${r(runs)}/100${runs < 50 ? ', in Google’s poor range' : runs < 90 ? '; 90+ is good' : ', in Google’s good range'}.`);
  if (d.vitalsSource === 'lab') out.push('Google has no real-visitor data for this site yet, so these are lab readings.');
  return out.length ? out : ['Core Web Vitals could not be measured.'];
}

export function seoInsights(report: Report): string[] {
  const s = report.seo;
  if (!s || s.score === null) return [];
  const cats = s.categories.filter((c) => c.score !== null).sort((a, b) => b.score! - a.score!);
  const out = [
    `${s.passed} checks pass, ${s.partial} partly meet the benchmark and ${s.failed} fail. ${cats[0].label} is strongest (${r(cats[0].score!)}), ${lower(cats[cats.length - 1].label)} weakest (${r(cats[cats.length - 1].score!)}).`,
  ];
  const g = s.search;
  if (g)
    out.push(
      g.brandPosition === 1
        ? `Searching “${g.brandQuery}” puts the brand’s own site first, where ${seoBenchmarks.ctrByPosition.first}% of clicks go.`
        : g.brandPosition === null
          ? `Searching “${g.brandQuery}” does not show the brand’s site on page one: people looking for it by name land elsewhere.`
          : `Searching “${g.brandQuery}” shows the brand’s site at position ${g.brandPosition}, not first; position 1 takes ${seoBenchmarks.ctrByPosition.first}% of clicks.`,
    );
  const fails = s.categories.flatMap((c) => c.checks).filter((c) => c.score === 0);
  if (fails.length) out.push(`Fix first: ${list(fails.slice(0, 3).map((c) => lower(c.label)))}.`);
  return out;
}

export function gbpInsights(report: Report): string[] {
  const g = report.gbp;
  if (!g) return [];
  if (!g.detail) return [g.status === 'absent' ? 'There is no Google Business Profile, so the brand is missing from Maps and local results.' : 'The Google listing could not be read.'];
  const d = g.detail;
  const out: string[] = [];
  if (d.rating !== null && d.reviewCount)
    out.push(
      `${d.rating.toFixed(1)}★ from ${fmt(d.reviewCount)} reviews${d.distribution ? `; ${r((d.distribution.five / Math.max(1, d.reviewCount)) * 100)}% are five-star` : ''}.`,
    );
  if (d.reviewCount !== null)
    out.push(
      d.reviewCount < g.benchmark.reviewLow
        ? `Review volume sits below the ${g.benchmark.reviewLow}-review floor, where most customers stop trusting a listing.`
        : `Review volume is inside the ${g.benchmark.reviewLow}–${g.benchmark.reviewHigh} benchmark band.`,
    );
  const reviews = d.latestReviews;
  if (reviews.length) {
    const answered = reviews.filter((x) => x.ownerReplied).length;
    out.push(
      answered === reviews.length
        ? `Every one of the latest ${reviews.length} reviews has an owner reply.`
        : `${answered} of the latest ${reviews.length} reviews have an owner reply; unanswered reviews read as an absent owner.`,
    );
  }
  return out;
}

type Alignment = Extract<import('./ai/alignment-types').StoredAlignment, { status: 'ok' }>;

export function alignmentInsights(a: Alignment): string[] {
  const s = a.stats;
  if (!s.posts) return ['No posts could be classified against the target audience.'];
  const out = [
    `${s.on} of ${s.posts} posts speak directly to the target audience and ${s.partial} partly; ${s.off} miss it.`,
  ];
  const platforms = s.platforms.filter((p) => p.score !== null).sort((x, y) => y.score! - x.score!);
  if (platforms.length > 1)
    out.push(
      `${name(platforms[0].platform)} is the most on-target (${r(platforms[0].score!)}/100), ${name(platforms[platforms.length - 1].platform)} the least (${r(platforms[platforms.length - 1].score!)}).`,
    );
  const lift = s.platforms.filter((p) => p.avgRelevant !== null && p.avgOff !== null && p.avgOff > 0);
  const better = lift.filter((p) => p.avgRelevant! > p.avgOff!);
  if (lift.length)
    out.push(
      better.length
        ? `On-target posts earn more interactions than off-target ones on ${list(better.map((p) => name(p.platform)))}: relevance pays.`
        : 'Off-target posts currently earn as much or more interaction than on-target ones.',
    );
  return out;
}

export function personaInsights(a: Alignment): string[] {
  const p = [...a.stats.personas].sort((x, y) => y.sharePercent - x.sharePercent);
  if (!p.length) return [];
  const out = [`${p[0].name} gets the most attention: ${r(p[0].sharePercent)}% of relevant posts.`];
  const ignored = p.filter((x) => x.posts === 0);
  if (ignored.length) out.push(`${list(ignored.map((x) => x.name))} ${ignored.length > 1 ? 'are' : 'is'} not addressed by any post.`);
  const engaged = p.filter((x) => x.avgInteractions !== null).sort((x, y) => y.avgInteractions! - x.avgInteractions!)[0];
  if (engaged && engaged.name !== p[0].name)
    out.push(`Posts for ${engaged.name} earn the most interaction (${fmt(engaged.avgInteractions!)} on average), yet get less airtime.`);
  return out;
}

export function themeInsights(a: Alignment): string[] {
  const t = a.stats.themes.filter((x) => x.posts > 0).sort((x, y) => y.posts - x.posts);
  if (!t.length) return [];
  const out = [`The most frequent theme is “${t[0].name}” (${t[0].posts} posts).`];
  const relevant = t.filter((x) => x.relevantPercent !== null).sort((x, y) => y.relevantPercent! - x.relevantPercent!);
  if (relevant.length > 1)
    out.push(
      `“${relevant[0].name}” lands best with the audience (${r(relevant[0].relevantPercent!)}% relevant); “${relevant[relevant.length - 1].name}” least (${r(relevant[relevant.length - 1].relevantPercent!)}%).`,
    );
  return out;
}
