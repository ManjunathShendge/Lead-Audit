'use client';
import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * Scroll-in animations for the report. Every one plays once, when the element first enters the
 * viewport, and is skipped entirely for people who ask for reduced motion.
 */
const ease = [0.22, 1, 0.36, 1] as const;
const viewport = { once: true, margin: '0px 0px -80px 0px' } as const;

/** A whole report section: fades and rises into place. */
export function Reveal({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      id={id}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ duration: 0.6, ease }}
    >
      {children}
    </motion.div>
  );
}

const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};
const pop: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

/** A grid whose cards appear one after another. Pair with StaggerItem children. */
export function Stagger({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  const reduced = useReducedMotion();
  const Tag = as === 'section' ? motion.section : motion.div;
  return (
    <Tag
      className={className}
      variants={group}
      initial={reduced ? false : 'hidden'}
      whileInView="shown"
      viewport={viewport}
    >
      {children}
    </Tag>
  );
}

/** One card in a Stagger grid. "pop" springs in for action cards; "rise" suits data panels. Lifts on hover. */
export function StaggerItem({
  children,
  className,
  kind = 'rise',
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  kind?: 'rise' | 'pop';
  hover?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={kind === 'pop' ? pop : rise}
      whileHover={hover && !reduced ? { y: -3, transition: { duration: 0.2 } } : undefined}
    >
      {children}
    </motion.div>
  );
}

/** A 0–100 bar fill that grows from zero when it scrolls into view. */
export function GrowBar({
  width,
  className,
  style,
}: {
  width: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <i className={className} style={{ ...style, width: `${width}%` }} />;
  return (
    <motion.i
      className={className}
      style={style}
      initial={{ width: 0 }}
      whileInView={{ width: `${width}%` }}
      viewport={{ once: true }}
      transition={{ duration: 0.9, ease }}
    />
  );
}
