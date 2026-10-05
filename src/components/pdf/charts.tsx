/**
 * Static, print-only charts for the PDF document. Plain SVG and HTML drawn on the server: no
 * animation, no client JavaScript, so Chromium prints them as crisp vectors with selectable text.
 */
export const pdfColors = {
  instagram: '#5f9a2e',
  facebook: '#2f66b3',
  linkedin: '#6a52a8',
  youtube: '#b5582b',
  website: '#3987e5',
  social: '#d95926',
  gbp: '#199e70',
  grid: '#dce2d7',
  track: '#e9ede5',
  text: '#20291d',
  muted: '#5f6958',
  good: '#36601e',
  warn: '#8a6420',
  bad: '#a33a33',
};
const C = pdfColors;
const r0 = (v: number) => Math.round(v);

export function Dial({ score, size = 96, color = C.good }: { score: number | null; size?: number; color?: string }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  return (
    <svg className="pdf-dial" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Score ${score === null ? 'not measured' : r0(score)}`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke={C.track} strokeWidth="8" />
      {score !== null && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(circ * Math.max(0, Math.min(100, score))) / 100} ${circ}`}
          transform="rotate(-90 50 50)"
        />
      )}
      <text x="50" y={size >= 80 ? 52 : 57} textAnchor="middle" dominantBaseline="middle" fontSize={size >= 80 ? 30 : 32} fontWeight="600" fill={C.text}>
        {score === null ? '—' : r0(score)}
      </text>
      {size >= 80 && (
        <text x="50" y="72" textAnchor="middle" fontSize="10" fill={C.muted}>
          of 100
        </text>
      )}
    </svg>
  );
}

/** Horizontal 0–100 bars with the opportunity line drawn on every track. */
export function HBars({
  rows,
  threshold,
}: {
  rows: { label: string; sub?: string; value: number | null; color: string }[];
  threshold?: number;
}) {
  return (
    <div className="pdf-hbars">
      {rows.map((row) => (
        <div className="pdf-hbar" key={row.label}>
          <span className="pdf-hbar-label">
            {row.label}
            {row.sub && <small>{row.sub}</small>}
          </span>
          <span className="pdf-hbar-track">
            {row.value !== null && (
              <i style={{ width: `${Math.max(1.5, Math.min(100, row.value))}%`, background: row.color }} />
            )}
            {threshold !== undefined && <b style={{ left: `${threshold}%` }} />}
          </span>
          <strong className={row.value !== null && threshold !== undefined && row.value < threshold ? 'below' : ''}>
            {row.value === null ? '—' : r0(row.value)}
          </strong>
        </div>
      ))}
      {threshold !== undefined && (
        <p className="pdf-key">
          <b /> Opportunity line at {threshold}. Bars run 0–100; — means not measured.
        </p>
      )}
    </div>
  );
}

/** Contributions stacked to the headline score, with the remaining headroom left empty. */
export function StackBar({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number | null }) {
  return (
    <div className="pdf-stack">
      <div className="pdf-stack-bar">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.label} style={{ width: `${p.value}%`, background: p.color }}>
              {p.value >= 7 ? r0(p.value) : ''}
            </span>
          ))}
      </div>
      <div className="pdf-stack-scale">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
      <div className="pdf-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} {p.value > 0 ? `+${p.value.toFixed(1)}` : '· not measured'}
          </span>
        ))}
        {total !== null && <span className="muted">Headroom {(100 - total).toFixed(1)}</span>}
      </div>
    </div>
  );
}

export function Radar({
  axes,
  series,
  size = 260,
}: {
  axes: string[];
  series: { name: string; color: string; values: number[] }[];
  size?: number;
}) {
  // Extra width either side so long axis labels ("Engagement") are never clipped.
  const pad = 34;
  const cx = size / 2 + pad;
  const cy = size / 2;
  const R = size / 2 - 40;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
  };
  return (
    <svg width={size + pad * 2} height={size} viewBox={`0 0 ${size + pad * 2} ${size}`} role="img" aria-label="Radar chart of social dimensions">
      {[25, 50, 75, 100].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
          fill="none"
          stroke={C.grid}
          strokeWidth="1"
        />
      ))}
      {axes.map((label, i) => {
        const [x, y] = point(i, 100);
        const [lx, ly] = point(i, 118);
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={C.grid} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill={C.muted}>
              {label}
            </text>
          </g>
        );
      })}
      {series.map((s) => (
        <polygon
          key={s.name}
          points={s.values.map((v, i) => point(i, v).join(',')).join(' ')}
          fill={s.color}
          fillOpacity="0.08"
          stroke={s.color}
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

/** Vertical bars with each bar's own benchmark drawn as a dashed tick. */
export function Columns({
  rows,
  unit = '%',
  height = 170,
  width = 640,
}: {
  rows: { label: string; value: number | null; target?: number; color: string }[];
  unit?: string;
  height?: number;
  /** Drawing width; match the column it sits in so the text keeps its size. */
  width?: number;
}) {
  const top = 18;
  const bottom = 26;
  const left = 34;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.target ?? 0])) * 1.15;
  const step = (width - left) / rows.length;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max].map((v) => Math.round(v * 10) / 10);
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Column chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={C.grid} strokeDasharray="3 4" />
          <text x={left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill={C.muted}>
            {t}
            {unit}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const x = left + step * i + step * 0.3;
        const w = step * 0.4;
        return (
          <g key={r.label}>
            {r.value !== null ? (
              <>
                <rect x={x} y={y(r.value)} width={w} height={top + plotH - y(r.value)} rx="3" fill={r.color} />
                <text x={x + w / 2} y={y(r.value) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={C.text}>
                  {r.value.toFixed(2)}
                  {unit}
                </text>
              </>
            ) : (
              <text x={x + w / 2} y={top + plotH - 6} textAnchor="middle" fontSize="10" fill={C.muted}>
                n/a
              </text>
            )}
            {r.target !== undefined && (
              <line x1={x - 8} x2={x + w + 8} y1={y(r.target)} y2={y(r.target)} stroke={C.text} strokeWidth="1.5" strokeDasharray="4 3" />
            )}
            <text x={x + w / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={C.text}>
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** One row of day cells per platform; darker = more posts that day. */
export function Heatmap({
  rows,
  ticks,
}: {
  rows: { label: string; cells: number[] | null }[];
  ticks: { index: number; label: string }[];
}) {
  const width = 680;
  const labelW = 78;
  const days = Math.max(1, ...rows.map((r) => r.cells?.length ?? 0));
  const cell = (width - labelW) / days;
  const rowH = 16;
  const height = 18 + rows.length * (rowH + 6);
  const shade = ['#e6ebe1', '#c5d9b0', '#8fb36a', '#466d27'];
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Posting calendar">
      {ticks.map((t) => (
        <text key={t.index} x={labelW + t.index * cell} y="10" fontSize="10" fill={C.muted} textAnchor={t.index === days - 1 ? 'end' : 'start'}>
          {t.label}
        </text>
      ))}
      {rows.map((r, ri) => {
        const y = 18 + ri * (rowH + 6);
        return (
          <g key={r.label}>
            <text x="0" y={y + rowH / 2} dominantBaseline="middle" fontSize="11" fill={C.text}>
              {r.label}
            </text>
            {r.cells ? (
              r.cells.map((c, i) => (
                <rect key={i} x={labelW + i * cell + 0.4} y={y} width={Math.max(0.8, cell - 0.8)} height={rowH} rx="1" fill={shade[Math.min(3, c)]} />
              ))
            ) : (
              <text x={labelW} y={y + rowH / 2} dominantBaseline="middle" fontSize="10" fill={C.muted}>
                Not measured
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ pct, color, size = 64 }: { pct: number | null; color: string; size?: number }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={pct === null ? 'Not measured' : `${r0(pct)}% video`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke={C.track} strokeWidth="14" />
      {pct !== null && pct > 0 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeDasharray={`${(circ * pct) / 100} ${circ}`}
          transform="rotate(-90 50 50)"
        />
      )}
      <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="600" fill={C.text}>
        {pct === null ? '—' : `${r0(pct)}%`}
      </text>
    </svg>
  );
}

/** Good / needs improvement / poor zones with a marker at the measured value. */
export function ZoneMeter({
  label,
  value,
  good,
  poor,
  max,
  unit,
  digits,
}: {
  label: string;
  value: number | null;
  good: number;
  poor: number;
  max: number;
  unit: string;
  digits: number;
}) {
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const status = value === null ? null : value <= good ? 'Good' : value <= poor ? 'Needs improvement' : 'Poor';
  return (
    <div className="pdf-zone">
      <div className="pdf-zone-head">
        <span>{label}</span>
        <strong className={status === 'Good' ? 'good' : status ? 'bad' : 'muted'}>
          {value === null ? 'Not measured' : `${value.toFixed(digits)}${unit} · ${status}`}
        </strong>
      </div>
      <div className="pdf-zone-track">
        <span style={{ left: 0, width: pos(good), background: '#cfe3bd' }} />
        <span style={{ left: pos(good), width: `calc(${pos(poor)} - ${pos(good)})`, background: '#f1e1b8' }} />
        <span style={{ left: pos(poor), right: 0, background: '#f2c9c4' }} />
        {value !== null && <i style={{ left: pos(value) }} />}
      </div>
      <small>
        Good ≤ {good}
        {unit} · poor above {poor}
        {unit}
      </small>
    </div>
  );
}
