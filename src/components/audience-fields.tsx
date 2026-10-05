'use client';
import { useState } from 'react';
import { Sparkles, Plus, Check, X, Lightbulb } from 'lucide-react';
import {
  audienceTips,
  descriptionExamples,
  listHas,
  locationPresets,
  personaPresets,
  toggleListItem,
  type IndustryProfile,
} from '@/lib/ai/audience-presets';
import type { AudienceSuggestion } from '@/lib/ai/audience-suggest';

export interface AudienceDraft {
  description: string;
  /** Comma separated, as typed. */
  personas: string;
  locations: string;
}
export const draftFrom = (
  t: { description: string; personas: string[]; locations: string } | null | undefined,
) => ({
  description: t?.description ?? '',
  personas: t?.personas.join(', ') ?? '',
  locations: t?.locations ?? '',
});

function Chip({
  label,
  on,
  title,
  onClick,
}: {
  label: string;
  on: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={on ? 'chip on' : 'chip'}
      title={title}
      aria-pressed={on}
      onClick={onClick}
    >
      {on ? <Check size={11} /> : <Plus size={11} />}
      {label}
    </button>
  );
}

/**
 * Target-audience inputs with three kinds of help: an AI suggestion read from the brand's own
 * website and profiles, one-click common personas and markets, and an example for the industry.
 */
export function AudienceFields({
  value,
  onChange,
  industry,
  aiEnabled,
  requestSuggestion,
  idPrefix,
}: {
  value: AudienceDraft;
  onChange: (next: AudienceDraft) => void;
  industry: string;
  aiEnabled: boolean;
  /** Returns the AI suggestion; the caller decides what context to send. */
  requestSuggestion?: () => Promise<AudienceSuggestion>;
  idPrefix: string;
}) {
  const profile: IndustryProfile = industry === 'B2B' || industry === 'D2C' ? industry : 'General';
  const [suggestion, setSuggestion] = useState<AudienceSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<AudienceDraft>) => onChange({ ...value, ...patch });
  const personaCount = value.personas.split(',').filter((s) => s.trim()).length;

  async function suggest() {
    if (!requestSuggestion) return;
    setBusy(true);
    setError('');
    try {
      setSuggestion(await requestSuggestion());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to suggest an audience.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="audience-fields">
      {aiEnabled && requestSuggestion && (
        <div className="audience-suggest">
          <button type="button" className="button" onClick={() => void suggest()} disabled={busy}>
            <Sparkles size={14} className={busy ? 'pulse' : ''} />
            {busy
              ? 'Reading the website and profiles…'
              : suggestion
                ? 'Suggest again'
                : 'Suggest from website & profiles'}
          </button>
          <span className="muted">
            AI proposes an audience from what the brand says about itself. You choose what to keep.
          </span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {suggestion && (
        <div className="suggestion-card" aria-live="polite">
          <div className="suggestion-head">
            <strong>
              <Sparkles size={13} /> Suggested audience
            </strong>
            <span className={`confidence ${suggestion.confidence}`}>{suggestion.confidence} confidence</span>
            <button
              type="button"
              className="button primary small"
              onClick={() =>
                onChange({
                  description: suggestion.description.slice(0, 600),
                  personas: suggestion.personas.map((p) => p.name.slice(0, 80)).join(', '),
                  locations: suggestion.locations.slice(0, 160) || value.locations,
                })
              }
            >
              Use all
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss suggestion"
              onClick={() => setSuggestion(null)}
            >
              <X size={14} />
            </button>
          </div>
          <p>
            {suggestion.description}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => set({ description: suggestion.description.slice(0, 600) })}
            >
              Use this description
            </button>
          </p>
          <div className="chip-row">
            {suggestion.personas.map((p) => (
              <Chip
                key={p.name}
                label={p.name}
                title={p.why}
                on={listHas(value.personas, p.name)}
                onClick={() => set({ personas: toggleListItem(value.personas, p.name.slice(0, 80)) })}
              />
            ))}
          </div>
          {suggestion.locations && (
            <p>
              Markets: {suggestion.locations}{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => set({ locations: suggestion.locations.slice(0, 160) })}
              >
                Use
              </button>
            </p>
          )}
          <p className="muted tiny">Based on: {suggestion.basis}</p>
        </div>
      )}

      <label htmlFor={`${idPrefix}-description`}>Who is this brand trying to reach?</label>
      <textarea
        id={`${idPrefix}-description`}
        rows={3}
        maxLength={600}
        value={value.description}
        onChange={(e) => set({ description: e.target.value })}
        placeholder={`e.g. ${descriptionExamples[profile]}`}
      />
      <details className="audience-tips">
        <summary>
          <Lightbulb size={12} /> How to describe an audience well
        </summary>
        <ul>
          {audienceTips.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>
            Example: <em>{descriptionExamples[profile]}</em>{' '}
            {!value.description && (
              <button
                type="button"
                className="link-button"
                onClick={() => set({ description: descriptionExamples[profile] })}
              >
                Start from this
              </button>
            )}
          </li>
        </ul>
      </details>

      <label htmlFor={`${idPrefix}-personas`}>Key personas / ICPs (comma separated, up to 6)</label>
      <input
        id={`${idPrefix}-personas`}
        maxLength={500}
        value={value.personas}
        onChange={(e) => set({ personas: e.target.value })}
        placeholder={personaPresets[profile].slice(0, 3).join(', ')}
      />
      <div className="chip-row">
        <span className="chip-label">Common for {profile === 'General' ? 'local & general' : profile}:</span>
        {personaPresets[profile].map((p) => (
          <Chip
            key={p}
            label={p}
            on={listHas(value.personas, p)}
            onClick={() => set({ personas: toggleListItem(value.personas, p) })}
          />
        ))}
      </div>
      {personaCount >= 6 && (
        <p className="field-help warn">Six personas is the maximum. Remove one to add another.</p>
      )}

      <label htmlFor={`${idPrefix}-locations`}>Markets / locations</label>
      <input
        id={`${idPrefix}-locations`}
        maxLength={160}
        value={value.locations}
        onChange={(e) => set({ locations: e.target.value })}
        placeholder="Pan-India, Bengaluru, Pune"
      />
      <div className="chip-row">
        {locationPresets.map((l) => (
          <Chip
            key={l}
            label={l}
            on={listHas(value.locations, l)}
            onClick={() => set({ locations: toggleListItem(value.locations, l, 8) })}
          />
        ))}
      </div>
    </div>
  );
}
