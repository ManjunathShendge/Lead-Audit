'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Search, Check, ArrowLeft, FlaskConical } from 'lucide-react';
import { platforms, platformNames, type Platform } from '@/lib/collectors/types';
import { emptyHandles, normalizeHandle } from '@/lib/validation';
import type { Handles } from '@/lib/report';
import { PlatformIcon } from './report/report';
export interface InitialAudit {
  brand: string;
  website: string | null;
  industry: string;
  tier: string;
  handles: Handles;
}
export function AuditForm({ initial }: { initial?: InitialAudit }) {
  const router = useRouter();
  const [step, setStep] = useState(initial ? 2 : 1);
  const [source, setSource] = useState('');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? 'D2C');
  const [tier, setTier] = useState(initial?.tier ?? 'average');
  const [handles, setHandles] = useState<Handles>(initial?.handles ?? emptyHandles());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initial ? 'Review these handles before starting a new audit.' : '');
  const [cached, setCached] = useState<{ id: string; createdAt: string } | null>(null);
  const edit = (platform: Platform, value: string) => {
    setCached(null);
    setHandles((previous) => ({
      ...previous,
      [platform]: { handle: value, presence: value ? 'present' : 'unknown' },
    }));
  };
  async function discover() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHandles(data.handles);
      setBrand(data.brand);
      setWebsite(data.website ?? '');
      setNotice(data.notice);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read this input.');
    } finally {
      setBusy(false);
    }
  }
  async function run(force = false) {
    setBusy(true);
    setError('');
    try {
      const normalized = Object.fromEntries(
        platforms.map((p) => [
          p,
          {
            ...handles[p],
            handle: handles[p].presence === 'present' ? normalizeHandle(p, handles[p].handle) : '',
          },
        ]),
      ) as Handles;
      setHandles(normalized);
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, website, industry, tier, handles: normalized, force }),
      });
      const data = await res.json();
      if (data.cached) {
        setCached(data.cached);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      router.push(`/audits/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start audit.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-panel">
      <div className="steps">
        <span className={step === 1 ? 'current' : ''}>01 / Brand details</span>
        <ArrowRight size={13} />
        <span className={step === 2 ? 'current' : ''}>02 / Confirm accounts</span>
      </div>
      <div className="panel">
        <span className="eyebrow">A CLEARER PICTURE STARTS HERE</span>
        <h2>{step === 1 ? 'Meet your next opportunity.' : 'Make sure we have the right accounts.'}</h2>
        <p>
          {step === 1
            ? 'Start with a website or public social handles.'
            : 'Review each handle. Unknown accounts are excluded; confirmed missing accounts may score zero.'}
        </p>
        <div className="notice">
          <FlaskConical size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />
          Mock mode · No live scraping or paid API calls.
        </div>
        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void discover();
            }}
          >
            <label htmlFor="source">Website URL or social handles</label>
            <div className="source-input">
              <Search size={17} />
              <input
                id="source"
                required
                maxLength={2048}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="earthkindliving.com or instagram: @earthkindliving"
              />
            </div>
            <p className="field-help">For multiple handles: instagram: name, linkedin: company-name</p>
            <label>Or explore a sample brand</label>
            <div className="choice-row">
              {[
                ['Morrow Studio', 'morrowstudio.com', 'strong'],
                ['Earthkind Living', 'earthkindliving.com', 'average'],
                ['Northstar Works', 'northstarworks.com', 'weak'],
              ].map(([name, url, t]) => (
                <button
                  type="button"
                  className={tier === t && source === url ? 'choice selected' : 'choice'}
                  key={t}
                  onClick={() => {
                    setSource(url);
                    setTier(t);
                    setIndustry(t === 'weak' ? 'B2B' : 'D2C');
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="form-footer">
              <span className="muted">Public profiles only</span>
              <button className="button primary" disabled={busy}>
                {busy ? 'Reading input…' : 'Find accounts'}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <p className="notice">{notice}</p>
            <div className="grid-2">
              <div>
                <label htmlFor="brand">Brand name</label>
                <input
                  id="brand"
                  required
                  maxLength={100}
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setCached(null);
                  }}
                />
              </div>
              <div>
                <label htmlFor="industry">Industry profile</label>
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => {
                    setIndustry(e.target.value);
                    setCached(null);
                  }}
                >
                  <option value="General">General</option>
                  <option value="D2C">D2C / consumer brand</option>
                  <option value="B2B">B2B / business services</option>
                </select>
              </div>
            </div>
            <label htmlFor="website">Website (optional)</label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                setCached(null);
              }}
              placeholder="https://example.com"
            />
            <div className="handles-heading">
              <h3>Public accounts</h3>
              <span className="muted">Confirm, edit or mark as missing</span>
            </div>
            {platforms.map((p) => (
              <div className="handle-row" key={p}>
                <label htmlFor={`handle-${p}`}>
                  <PlatformIcon platform={p} size={14} />
                  <span>{platformNames[p]}</span>
                </label>
                <input
                  id={`handle-${p}`}
                  aria-label={`${platformNames[p]} handle`}
                  value={handles[p].handle}
                  disabled={handles[p].presence === 'absent'}
                  placeholder="@handle or profile URL"
                  onChange={(e) => edit(p, e.target.value)}
                  maxLength={256}
                />
                <select
                  aria-label={`${platformNames[p]} account status`}
                  value={handles[p].presence}
                  onChange={(e) => {
                    setCached(null);
                    setHandles((prev) => ({
                      ...prev,
                      [p]: {
                        handle: e.target.value === 'present' ? prev[p].handle : '',
                        presence: e.target.value as Handles[Platform]['presence'],
                      },
                    }));
                  }}
                >
                  <option value="present">Account present</option>
                  <option value="unknown">Not confirmed</option>
                  <option value="absent">No account</option>
                </select>
              </div>
            ))}
            <label htmlFor="tier">Synthetic data scenario</label>
            <select
              id="tier"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                setCached(null);
              }}
            >
              <option value="strong">Strong presence</option>
              <option value="average">Developing presence</option>
              <option value="weak">Weak presence + private / hidden data</option>
            </select>
            <p className="field-help">This controls demo data, not the brand’s real performance.</p>
            {cached && (
              <div className="notice cache-prompt">
                <strong>A recent audit is ready.</strong>
                <p>
                  Created {new Date(cached.createdAt).toLocaleString()}. Reuse it or collect a fresh mock
                  sample.
                </p>
                <Link className="button primary" href={`/audits/${cached.id}`}>
                  View cached audit
                </Link>
                <button type="button" className="button" onClick={() => void run(true)} disabled={busy}>
                  Run fresh audit
                </button>
              </div>
            )}
            <div className="form-footer">
              <button type="button" className="button" onClick={() => setStep(1)}>
                <ArrowLeft size={14} />
                Back
              </button>
              <button className="button primary" disabled={busy}>
                <Check size={16} />
                {busy ? 'Creating audit…' : 'Confirm & run audit'}
              </button>
            </div>
          </form>
        )}
        <p className="error" role="alert">
          {error}
        </p>
      </div>
      <p className="form-caption">Good strategy starts with a clear view. Let’s find yours.</p>
    </div>
  );
}
