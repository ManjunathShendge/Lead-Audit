import type { Report } from '@/lib/report';
import { platformNames } from '@/lib/collectors/types';
export function PrintMethodology({ report }: { report: Report }) {
  return (
    <section className="print-methodology">
      <span className="eyebrow">SCORE REFERENCE</span>
      <h2>How to read this report</h2>
      <p>
        {report.overall.label}: configured weights are Website {report.config.channels.website}%, Social{' '}
        {report.config.channels.social}% and Google Business Profile {report.config.channels.gbp}%; effective
        weights after leaving out unmeasured channels are{' '}
        {Object.entries(report.overall.weights)
          .map(([k, v]) => `${k} ${v.toFixed(1)}%`)
          .join(', ')}
        . Scores use unrounded calculations. Null values are excluded and remaining weights are re-normalized.
        Confirmed absent, industry-relevant platforms score zero.
      </p>
      <p>
        Activity is linear against the post benchmark, capped at 100, with a{' '}
        {report.config.thresholds.gapPenalty}-point penalty for an observed gap over{' '}
        {report.config.thresholds.gapDays} days. Engagement is linear against its benchmark. Audience uses a
        log band: 20 points at the low end, 100 at the high end. Profile completeness checks bio, link,
        business/category and avatar, with equal weights among measured checks.
      </p>
      {report.cards.map((c) => (
        <div key={c.platform}>
          <h3>
            {platformNames[c.platform]} · {c.score === null ? 'Not measured' : c.score.toFixed(1) + '/100'} ·
            effective platform weight {report.platformWeights[c.platform].toFixed(1)}%
          </h3>
          <table>
            <thead>
              <tr>
                <th>Component</th>
                <th>Raw value</th>
                <th>Score</th>
                <th>Configured weight</th>
                <th>Effective weight</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(c.components).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>
                    {key === 'activity'
                      ? `${c.metrics.count === null ? 'Not measured' : (c.metrics.lowerBound ? '≥ ' : '') + c.metrics.count} posts; gap ${c.metrics.longestGap?.toFixed(1) ?? 'not measured'} days`
                      : key === 'engagement'
                        ? c.metrics.engagement === null
                          ? 'Not measured'
                          : c.metrics.engagement.toFixed(2) + '%'
                        : key === 'audience'
                          ? c.subscriberHidden
                            ? 'Hidden'
                            : (c.profile?.followers ?? 'Not measured')
                          : c.metrics.completeness === null
                            ? 'Not measured'
                            : c.metrics.completeness.toFixed(1) + '%'}
                  </td>
                  <td>{value === null ? 'Not measured' : value.toFixed(1)}</td>
                  <td>{report.config.components[key as keyof typeof report.config.components]}%</td>
                  <td>{c.weights[key].toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Targets: {c.benchmark.postsTarget} posts/month; {c.benchmark.engagementTarget}% engagement;{' '}
            {c.benchmark.followerLow}–{c.benchmark.followerHigh} followers. Avg likes:{' '}
            {c.metrics.avgLikes?.toFixed(1) ?? 'Not measured'}; avg comments:{' '}
            {c.metrics.avgComments?.toFixed(1) ?? 'Not measured'}.
          </p>
        </div>
      ))}
      <ChannelTable
        title="Website"
        channel={report.website ?? null}
        configured={report.config.website}
        explain={{
          performance: `${report.config.websiteParts.performance.pagespeed}% median mobile PageSpeed performance + ${report.config.websiteParts.performance.cwv}% Core Web Vitals (LCP ≤ ${report.config.thresholds.lcp} s, INP ≤ ${report.config.thresholds.inp} ms, CLS ≤ ${report.config.thresholds.cls}, a third each)`,
          seo: `${report.config.websiteParts.seo.pagespeed}% PageSpeed SEO + ${report.config.websiteParts.seo.checklist}% checklist (title, meta description, one H1, alt text, schema, sitemap, robots.txt, HTTPS)`,
          tracking: 'GA4/GTM 40, Meta Pixel 30, Google Ads 15, LinkedIn Insight 15',
          conversion: 'Contact form 30, CTA above the fold 30, WhatsApp 20, click-to-call 20',
          freshness:
            'Blog post ≤ 30 days = 100, falling to 0 at a year; copyright year current = 100, last year = 50',
        }}
      />
      <ChannelTable
        title="Google Business Profile"
        channel={report.gbp ?? null}
        configured={report.config.gbp}
        explain={{
          rating: `${report.config.thresholds.ratingHigh}+ stars = 100, ${report.config.thresholds.ratingLow} or below = 0, linear between`,
          reviews: 'Log scale within the review-count band: bottom = 20, top or above = 100',
          replies: 'Share of the latest 10 reviews with an owner reply',
          completeness: 'Category, hours, phone, website, photos: 20 points each',
        }}
      />
      <p>
        Engagement = (average measured likes + average measured comments) ÷ followers × 100. Hidden values are
        excluded from averages; a wholly missing average or zero/missing followers makes the rate unavailable.
        Band thresholds: Strong ≥ {report.config.thresholds.strong}, Good ≥ {report.config.thresholds.good},
        Needs work ≥ {report.config.thresholds.needsWork}, otherwise Weak. Stored raw responses are available
        from the authenticated report in the workspace.
      </p>
    </section>
  );
}

function ChannelTable({
  title,
  channel,
  configured,
  explain,
}: {
  title: string;
  channel: {
    score: number | null;
    criteria: Record<string, number | null>;
    weights: Record<string, number>;
  } | null;
  configured: Record<string, number>;
  explain: Record<string, string>;
}) {
  if (!channel) return null;
  return (
    <div>
      <h3>
        {title} · {channel.score === null ? 'Not measured' : channel.score.toFixed(1) + '/100'}
      </h3>
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th>How it scores</th>
            <th>Score</th>
            <th>Configured weight</th>
            <th>Effective weight</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(channel.criteria).map(([key, value]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{explain[key]}</td>
              <td>{value === null ? 'Not measured' : value.toFixed(1)}</td>
              <td>{configured[key]}%</td>
              <td>{(channel.weights[key] ?? 0).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
