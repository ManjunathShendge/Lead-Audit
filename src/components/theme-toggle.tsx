'use client';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

import { THEME_KEY } from '@/lib/ui-prefs';

export type Theme = 'dark' | 'light';

// The <html> data-theme attribute is the single source of truth; every toggle on the page follows it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const current = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function apply(next: Theme) {
  const root = document.documentElement;
  // Fade colours across the whole page while the theme changes, then drop the rule so it never slows hovers.
  root.classList.add('theme-fading');
  window.setTimeout(() => root.classList.remove('theme-fading'), 450);
  if (next === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
}

/** Sliding light/dark switch. Its knob position comes from CSS on <html data-theme>, so it never jumps on load. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const light = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="Light mode"
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`theme-switch ${className}`.trim()}
      onClick={() => apply(light ? 'dark' : 'light')}
    >
      <span className="theme-switch-icons" aria-hidden="true">
        <Moon size={13} />
        <Sun size={13} />
      </span>
      <span className="theme-switch-knob" aria-hidden="true">
        <Moon className="knob-moon" size={13} />
        <Sun className="knob-sun" size={13} />
      </span>
    </button>
  );
}
