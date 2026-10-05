'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut } from 'lucide-react';

/** Avatar button in the top bar; its dropdown holds sign-out. */
export function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    const res = await fetch('/api/auth', { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      router.push('/login');
      router.refresh();
    } else setBusy(false);
  }

  return (
    <div className={open ? 'profile-menu open' : 'profile-menu'} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tier2 workspace menu"
        title="Tier2 workspace"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="topbar-avatar">T2</span>
        <ChevronDown size={15} className="profile-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="profile-dropdown" role="menu" aria-label="Tier2 workspace menu">
          <button ref={item} role="menuitem" type="button" onClick={signOut} disabled={busy}>
            <LogOut size={17} /> {busy ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
