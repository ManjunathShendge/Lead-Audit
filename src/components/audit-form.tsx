'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Search, Check, ArrowLeft } from 'lucide-react';
import { platforms, platformNames, type Platform } from '@/lib/collectors/types';
import { emptyHandles, normalizeHandle } from '@/lib/validation';
import type { Handles } from '@/lib/report';
import { PlatformIcon } from './report/report';
import { ChannelIcon } from './report/channels';
import { emptyChannelTargets, normalizeGbpQuery, type ChannelTargets } from '@/lib/collectors/channel-types';
import { audienceProvided, type TargetAudience } from '@/lib/ai/alignment-types';
import { AudienceFields, draftFrom, type AudienceDraft } from './audience-fields';
import { MonthRangePicker } from './month-range-picker';
import type { Period } from '@/lib/period';
import { Select } from './select';
export interface InitialAudit {
  brand: string;
  website: string | null;
  industry: string;
  tier: string;
  handles: Handles;
  channels?: ChannelTargets;
  targetAudience?: TargetAudience | null;
  period?: Period | null;
}
export function AuditForm({
  initial,
  mockCollection,
  aiEnabled = false,
}: {
  initial?: InitialAudit;
  mockCollection: boolean;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initial ? 2 : 1);
  const [source, setSource] = useState('');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? 'D2C');
  const [tier, setTier] = useState(initial?.tier ?? 'average');
  const [handles, setHandles] = useState<Handles>(initial?.handles ?? emptyHandles());
  const [channels, setChannels] = useState<ChannelTargets>(initial?.channels ?? emptyChannelTargets());
  const [audience, setAudience] = useState<AudienceDraft>(draftFrom(initial?.targetAudience));
  const [period, setPeriod] = useState<Period | null>(initial?.period ?? null);
  // Page words from discovery, sent only when the team asks for an audience suggestion.
  const [siteText, setSiteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
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
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setSiteText(typeof data.siteText === 'string' ? data.siteText : '');
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
      const gbpQuery = channels.gbp.presence === 'present' ? normalizeGbpQuery(channels.gbp.query) : '';
      const confirmedChannels: ChannelTargets = { ...channels, gbp: { ...channels.gbp, query: gbpQuery } };
      setChannels(confirmedChannels);
      const targetAudience: TargetAudience = {
        description: audience.description.trim(),
        personas: audience.personas
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 6),
        locations: audience.locations.trim(),
      };
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          website,
          industry,
          tier,
          handles: normalized,
          channels: confirmedChannels,
          targetAudience: audienceProvided(targetAudience) ? targetAudience : null,
          period,
          force,
        }),
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
            {warnings.length > 0 && (
              <ul className="discovery-warnings">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
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
                <Select
                  id="industry"
                  value={industry}
                  onChange={(v) => {
                    setIndustry(v);
                    setCached(null);
                  }}
                  options={[
                    { value: 'General', label: 'General' },
                    { value: 'D2C', label: 'D2C / consumer brand' },
                    { value: 'B2B', label: 'B2B / business services' },
                  ]}
                />
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
            <MonthRangePicker
              id="period"
              value={period}
              onChange={(next) => {
                setPeriod(next);
                setCached(null);
              }}
            />
            <p className="field-help">
              {period
                ? 'Social posting and engagement are measured for these months, using posts published in them. Website and Google are checked as of today.'
                : 'Social posting is measured over the last 30 days, and the calendar shows 90 days. Pick months to audit a specific period.'}
            </p>
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
                <Select
                  aria-label={`${platformNames[p]} account status`}
                  value={handles[p].presence}
                  onChange={(v) => {
                    setCached(null);
                    setHandles((prev) => ({
                      ...prev,
                      [p]: {
                        handle: v === 'present' ? prev[p].handle : '',
                        presence: v as Handles[Platform]['presence'],
                      },
                    }));
                  }}
                  options={[
                    { value: 'present', label: 'Account present' },
                    { value: 'unknown', label: 'Not confirmed' },
                    { value: 'absent', label: 'No account' },
                  ]}
                />
              </div>
            ))}
            <div className="handles-heading">
              <h3>Website and Google</h3>
              <span className="muted">Feeds the Digital Presence Score</span>
            </div>
            <div className="handle-row">
              <label htmlFor="channel-website">
                <ChannelIcon channel="website" size={14} />
                <span>Website audit</span>
              </label>
              <span className="field-help" style={{ margin: 0 }}>
                {website
                  ? 'PageSpeed, SEO checks, tracking tags and conversion basics'
                  : 'Add a website above to audit it'}
              </span>
              <Select
                id="channel-website"
                aria-label="Website audit"
                value={channels.website.audit && website ? 'yes' : 'no'}
                disabled={!website}
                onChange={(v) => {
                  setCached(null);
                  setChannels((c) => ({ ...c, website: { audit: v === 'yes' } }));
                }}
                options={[
                  { value: 'yes', label: 'Audit website' },
                  { value: 'no', label: 'Skip' },
                ]}
              />
            </div>
            <div className="handle-row">
              <label htmlFor="channel-gbp">
                <ChannelIcon channel="gbp" size={14} />
                <span>Google Business</span>
              </label>
              <input
                id="channel-gbp"
                aria-label="Google Business Profile search or Maps link"
                value={channels.gbp.query}
                disabled={channels.gbp.presence === 'absent'}
                placeholder={`${brand || 'Business name'}, City — or a Google Maps link`}
                maxLength={300}
                onChange={(e) => {
                  setCached(null);
                  const query = e.target.value;
                  setChannels((c) => ({ ...c, gbp: { query, presence: query ? 'present' : 'unknown' } }));
                }}
              />
              <Select
                aria-label="Google Business Profile status"
                value={channels.gbp.presence}
                onChange={(v) => {
                  setCached(null);
                  const presence = v as ChannelTargets['gbp']['presence'];
                  setChannels((c) => ({
                    ...c,
                    gbp: { query: presence === 'present' ? c.gbp.query : '', presence },
                  }));
                }}
                options={[
                  { value: 'present', label: 'Profile present' },
                  { value: 'unknown', label: 'Not confirmed' },
                  { value: 'absent', label: 'No profile' },
                ]}
              />
            </div>
            <p className="field-help">
              Google Business Profile is looked up on Google Maps (about $0.01 per audit in live mode). Check
              the matched business name in the report.
            </p>
            <div className="handles-heading">
              <h3>Target audience</h3>
              <span className="muted">Optional · used to check if content reaches the right people</span>
            </div>
            <AudienceFields
              idPrefix="audience"
              value={audience}
              industry={industry}
              aiEnabled={aiEnabled}
              onChange={(next) => {
                setCached(null);
                setAudience(next);
              }}
              requestSuggestion={async () => {
                const res = await fetch('/api/audience/suggest', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    brand,
                    industry,
                    website,
                    siteText: siteText.slice(0, 6000),
                    handles: Object.fromEntries(
                      platforms
                        .filter((p) => handles[p].handle)
                        .map((p) => [p, handles[p].handle.slice(0, 100)]),
                    ),
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? 'Unable to suggest an audience.');
                if (typeof data.siteText === 'string' && data.siteText) setSiteText(data.siteText);
                return data.suggestion;
              }}
            />
            <p className="field-help">
              Leave blank and the audit works out the likely audience from the website and profile bios. You
              can change it later on the report without re-collecting data.
            </p>
            {mockCollection && (
              <>
                <label htmlFor="tier">Synthetic data scenario</label>
                <Select
                  id="tier"
                  value={tier}
                  onChange={(v) => {
                    setTier(v);
                    setCached(null);
                  }}
                  options={[
                    { value: 'strong', label: 'Strong presence' },
                    { value: 'average', label: 'Developing presence' },
                    { value: 'weak', label: 'Weak presence + private / hidden data' },
                  ]}
                />
                <p className="field-help">This controls demo data, not the brand’s real performance.</p>
              </>
            )}
            {cached && (
              <div className="notice cache-prompt">
                <strong>A recent audit is ready.</strong>
                <p>
                  Created {new Date(cached.createdAt).toLocaleString()}. Reuse it or collect fresh{' '}
                  {mockCollection ? 'sample' : 'live'} data.
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
