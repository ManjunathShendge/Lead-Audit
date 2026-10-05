'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight,
  CirclePlus,
  History,
  SlidersHorizontal,
  Layers3,
  Target,
  ListPlus,
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { SidebarToggle } from './sidebar-toggle';
import { ProfileMenu } from './profile-menu';
export function Shell({ children, mode }: { children: React.ReactNode; mode: 'mock' | 'live' }) {
  const path = usePathname();
  if (path.endsWith('/print')) return <>{children}</>;
  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" id="app-sidebar">
        <Link className="wordmark" href="/history">
          tier2<span>®</span>
        </Link>
        <span className="workspace-label">SOCIAL INTELLIGENCE</span>
        <nav aria-label="Main navigation">
          {[
            { Icon: CirclePlus, label: 'New audit', href: '/audits/new' },
            { Icon: ListPlus, label: 'Bulk audit', href: '/audits/bulk' },
            { Icon: History, label: 'Audit library', href: '/history' },
            { Icon: Target, label: 'Accuracy', href: '/accuracy' },
            { Icon: SlidersHorizontal, label: 'Configuration', href: '/settings' },
          ].map(({ Icon, label, href }) => (
            <Link
              key={href}
              className={path === href ? 'nav-link active' : 'nav-link'}
              href={href}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <Layers3 size={17} />
            <strong>
              A little clarity.
              <br />A lot of possibility.
            </strong>
            <a href="https://www.tier2.digital" target="_blank" rel="noreferrer" title="Meet Tier2">
              <span className="note-label">Meet Tier2</span> <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="topbar-crumbs">
            <SidebarToggle />
            Workspace <span className="breadcrumb">/</span>{' '}
            <strong>
              {path.endsWith('/audits/bulk')
                ? 'Bulk audit'
                : path.includes('/audits/') && !path.endsWith('/new')
                  ? 'Social presence report'
                  : path.includes('settings')
                    ? 'Configuration'
                    : path.includes('accuracy')
                      ? 'Accuracy harness'
                      : path.includes('new')
                        ? 'New audit'
                        : 'Audit library'}
            </strong>
          </span>
          <div className="topbar-actions">
            <span className={mode === 'live' ? 'mode-badge live' : 'mode-badge'}>
              <i />
              {mode === 'live' ? 'Live workspace' : 'Mock workspace'}
            </span>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          TIER2 DIGITAL <span>Clarity before strategy.</span>
        </footer>
      </div>
    </div>
  );
}
