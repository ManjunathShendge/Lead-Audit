'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface NavSection {
  id: string;
  label: string;
}

/** Height of the sticky bar plus breathing room: a section counts as current once it reaches here. */
const OFFSET = 112;
/** Layout position on the page. Unlike getBoundingClientRect it ignores a reveal still mid-animation. */
const pageTop = (el: HTMLElement) => {
  let top = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop;
  return top;
};

/**
 * Sticky report navigator: one link per section, a pill that slides to the section on screen.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      let current = 0;
      sections.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && pageTop(el) - window.scrollY <= OFFSET + 1) current = i;
      });
      // At the very bottom the last section is current even if it is too short to reach the offset.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
        current = sections.length - 1;
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [sections]);

  // Keep the current link visible when the bar scrolls sideways on narrow screens.
  useEffect(() => {
    // Scroll only the link row: scrollIntoView would also scroll the clipped bar itself.
    const list = listRef.current;
    const link = list?.querySelectorAll('a')[active];
    if (!list || !link) return;
    const left = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
  }, [active, reduced]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    window.scrollTo({
      top: pageTop(el) - OFFSET,
      behavior: reduced ? 'auto' : 'smooth',
    });
    history.replaceState(null, '', `#${id}`);
  };

  if (sections.length < 2) return null;
  return (
    <motion.nav
      className="section-nav"
      aria-label="Report sections"
      initial={reduced ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="section-nav-links" ref={listRef}>
        {sections.map((s, i) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => go(e, s.id)}
            className={i === active ? 'active' : ''}
            aria-current={i === active ? 'location' : undefined}
          >
            {i === active && (
              <motion.span
                className="section-nav-pill"
                layoutId="section-nav-pill"
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="section-nav-label">{s.label}</span>
          </a>
        ))}
      </div>
    </motion.nav>
  );
}
