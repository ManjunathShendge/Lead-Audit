import Link from 'next/link';
import {
  Plus,
  ListPlus,
  ArrowUpRight,
  ScanLine,
  ChartNoAxesCombined,
  Wallet,
  CheckCheck,
} from 'lucide-react';
import { db } from '@/lib/db';
import type { Report } from '@/lib/report';
import { band } from '@/lib/scoring';
import { HistoryTable } from '@/components/history-table';
import { currentMode } from '@/lib/collectors';
export default async function History() {
  const liveWorkspace = currentMode() === 'live';
  const audits = await db.audit.findMany({
    orderBy: { createdAt: 'desc' },
    include: { runs: { select: { costUsd: true } } },
  });
  const items = audits.map((a) => {
    const r = a.report as unknown as Report | null;
    return {
      id: a.id,
      brand: a.brand,
      website: a.website,
      industry: a.industry,
      state: a.state,
      mode: a.mode === 'live' ? ('live' as const) : ('mock' as const),
      createdAt: a.createdAt.toISOString(),
      score: r?.social ?? null,
      band: band(r?.social ?? null, r?.config),
      cost:
        a.runs.length && a.runs.every((run) => run.costUsd !== null)
          ? a.runs.reduce((s, run) => s + (run.costUsd ?? 0), 0)
          : null,
    };
  });
  const completed = items.filter((a) => a.state === 'complete');
  const scored = completed.filter((a) => a.score !== null);
  const average = scored.length ? Math.round(scored.reduce((s, a) => s + a.score!, 0) / scored.length) : null;
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const monthAudits = audits.filter(
    (a) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
      }).format(a.createdAt) === month,
  );
  const runs = monthAudits.flatMap((a) => a.runs);
  const monthCost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const unknown = runs.filter((r) => r.costUsd === null).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE BIGGER PICTURE</span>
          <h1>
            Your next opportunity starts here<span className="brand-dot">.</span>
          </h1>
          <p>Explore the presence. Uncover the gaps. Start a better conversation.</p>
        </div>
        <span className="actions">
          <Link className="button" href="/audits/bulk">
            <ListPlus size={16} />
            Bulk audit
          </Link>
          <Link className="button primary" href="/audits/new">
            <Plus size={16} />
            New audit
          </Link>
        </span>
      </div>
      <section className="library-banner">
        <div>
          <span className="eyebrow">CLARITY BEFORE STRATEGY</span>
          <h2>
            Every brand has a story.
            <br />
            See what its social presence is saying.
          </h2>
          <p>Four platforms. One thoughtful report. A clear way forward.</p>
          <Link href="/audits/demo-average">
            Explore a sample report <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span>↗</span>
          <div className="art-tag">PRESENCE → POTENTIAL</div>
        </div>
      </section>
      <div className="grid-4 library-stats">
        {[
          {
            Icon: ScanLine,
            title: 'Total audits',
            value: String(items.length),
            note: 'Your growing intelligence library',
          },
          {
            Icon: CheckCheck,
            title: 'Completed',
            value: String(completed.length),
            note: 'Ready for the next conversation',
          },
          {
            Icon: ChartNoAxesCombined,
            title: 'Average social score',
            value: average === null ? '—' : `${average}`,
            note: 'Across measured reports',
          },
          {
            Icon: Wallet,
            title: 'This month’s collection cost',
            value: unknown
              ? runs.every((r) => r.costUsd === null)
                ? 'Not measured'
                : `$${monthCost.toFixed(2)}+`
              : `$${monthCost.toFixed(2)}`,
            note: unknown
              ? `${unknown} collection costs not measured`
              : liveWorkspace
                ? 'Live collection spend'
                : 'Mock data. Zero API spend.',
          },
        ].map(({ Icon, title, value, note }) => (
          <div className="panel library-stat" key={title}>
            <div>
              <span>{title}</span>
              <Icon size={15} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <HistoryTable audits={items} />
      <p className="library-footnote">
        {liveWorkspace
          ? 'Live workspace · New audits collect real public data. Reports tagged Demo use sample data.'
          : 'Mock workspace · New audits use sample data, not real accounts.'}{' '}
        Costs cover retained audits; deleted records are excluded.
      </p>
    </>
  );
}
