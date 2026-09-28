'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-story">
        <Link className="wordmark" href="/">
          tier2<span>®</span>
        </Link>
        <div>
          <span className="eyebrow">SOCIAL INTELLIGENCE / BY TIER2 DIGITAL</span>
          <h1>
            See the presence.
            <br />
            <em>Find the potential.</em>
          </h1>
          <p>Turn a brand’s social footprint into a clearer next move.</p>
        </div>
        <span className="muted">Built for better conversations. Bengaluru, India.</span>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const res = await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: new FormData(e.currentTarget).get('password') }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            router.push('/history');
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to sign in.');
            setBusy(false);
          }
        }}
      >
        <div className="icon-box">
          <LockKeyhole size={22} />
        </div>
        <span className="eyebrow">TEAM WORKSPACE</span>
        <h2>Welcome back.</h2>
        <p className="muted">Sign in to explore your next opportunity.</p>
        <label htmlFor="password">Workspace password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          placeholder="Enter your password"
        />
        <p role="alert" className="error">
          {error}
        </p>
        <button className="button primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Enter workspace'}
          <ArrowRight size={17} />
        </button>
        <small className="muted">Internal access · Tier2 Digital</small>
      </form>
    </main>
  );
}
