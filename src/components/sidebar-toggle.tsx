'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { SIDEBAR_KEY } from '@/lib/ui-prefs';

// The <html> data-sidebar attribute drives the layout in CSS; the button only flips it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sidebar'] });
  return () => observer.disconnect();
}
const isCollapsed = () => document.documentElement.dataset.sidebar === 'collapsed';

function toggle() {
  const root = document.documentElement;
  const next = !isCollapsed();
  if (next) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
  } catch {}
}

/** Collapses the sidebar to an icon rail. Ctrl+B / Cmd+B does the same. */
export function SidebarToggle() {
  // Null on the server, which cannot know the saved state.
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <button
      type="button"
      className="sidebar-toggle"
      aria-controls="app-sidebar"
      aria-expanded={collapsed === null ? undefined : !collapsed}
      aria-label={label}
      title={`${label} (Ctrl+B)`}
      onClick={toggle}
    >
      {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
    </button>
  );
}
