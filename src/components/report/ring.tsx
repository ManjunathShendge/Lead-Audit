'use client';
import { motion, useReducedMotion } from 'framer-motion';
export function Ring({
  score,
  size = 132,
  color = 'var(--brand-primary)',
  print = false,
}: {
  score: number | null;
  size?: number;
  color?: string;
  print?: boolean;
}) {
  const reduced = useReducedMotion();
  const radius = 44,
    circ = 2 * Math.PI * radius;
  return (
    <div
      className="score-ring"
      style={{ width: size, height: size }}
      aria-label={`Score: ${score === null ? 'Not measured' : Math.round(score) + ' out of 100'}`}
    >
      <svg viewBox="0 0 100 100">
        <circle className="ring-track" cx="50" cy="50" r={radius} />
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={print || reduced ? false : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - (score ?? 0) / 100) }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="ring-label">
        {/* Small rings scale their number with the ring so two digits never crowd the track. */}
        <strong style={size < 120 ? { fontSize: Math.round(size * 0.34), letterSpacing: -1 } : undefined}>
          {score === null ? '—' : Math.round(score)}
        </strong>
        {size > 90 && <span>of 100</span>}
      </div>
    </div>
  );
}
