'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';

/** "What this shows" findings under a chart; slides in once, renders nothing when there is nothing to say. */
export function ChartInsight({ items }: { items: string[] }) {
  const reduced = useReducedMotion();
  if (!items.length) return null;
  return (
    <motion.div
      className="chart-insight"
      initial={reduced ? false : { opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="chart-insight-label">
        <Lightbulb size={12} aria-hidden /> What this shows
      </span>
      <ul>
        {items.map((t, i) => (
          <motion.li
            key={i}
            initial={reduced ? false : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
          >
            {t}
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
