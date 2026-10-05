import { describe, it, expect } from 'vitest';
import { listHas, personaPresets, toggleListItem } from '../src/lib/ai/audience-presets';
import { suggestAudience, suggestionFacts, type AudienceSuggestion } from '../src/lib/ai/audience-suggest';
import type { Generate } from '../src/lib/ai/provider';

describe('audience chips', () => {
  it('adds and removes a persona, case-insensitively, and keeps the list tidy', () => {
    const one = toggleListItem('', 'Founders & CEOs');
    expect(one).toBe('Founders & CEOs');
    const two = toggleListItem(one + ',  ', 'Marketing heads');
    expect(two).toBe('Founders & CEOs, Marketing heads');
    expect(listHas(two, 'marketing HEADS')).toBe(true);
    expect(toggleListItem(two, 'founders & ceos')).toBe('Marketing heads');
  });
  it('stops at the maximum instead of dropping existing personas', () => {
    const full = personaPresets.B2B.slice(0, 6).join(', ');
    expect(toggleListItem(full, 'Someone new')).toBe(full);
  });
});

const suggestion: AudienceSuggestion = {
  description: 'Founders of early-stage Indian startups who want press coverage and investor attention.',
  personas: [
    { name: 'Early-stage founders', why: 'Homepage offers startup features.' },
    { name: 'Angel investors', why: 'Events connect founders with VCs.' },
  ],
  locations: 'Pan-India',
  confidence: 'high',
  basis: 'Homepage headline and the "feature your startup" call to action.',
};
const ok: Generate = async () => ({ text: JSON.stringify(suggestion), input: 10, output: 10 });

describe('audience suggestion', () => {
  it('prefers the words discovered on the website', () => {
    const facts = suggestionFacts({
      brand: 'Startup Pedia',
      industry: 'General',
      website: 'https://startuppedia.in',
      siteText: 'Title: Startup Pedia | Stories of Indian founders',
      handles: { instagram: 'startup.pedia' },
    });
    expect(facts.websiteText).toContain('Stories of Indian founders');
    expect(facts.handles).toEqual({ instagram: 'startup.pedia' });
  });
  it('says when there is no website text rather than leaving it blank', () => {
    expect(suggestionFacts({ brand: 'X', industry: 'B2B', website: null }).websiteText).toBe('Not available');
  });
  it('returns a validated suggestion and asks for low effort', async () => {
    let effort: string | undefined;
    const result = await suggestAudience(
      { brand: 'Startup Pedia', industry: 'General', website: null },
      async (a) => {
        effort = a.effort;
        return ok(a);
      },
    );
    expect(result).toEqual({ ok: true, suggestion });
    expect(effort).toBe('low');
  });
  it('explains malformed output and provider errors instead of throwing', async () => {
    const bad = await suggestAudience({ brand: 'X', industry: 'B2B', website: null }, async () => ({
      text: '{"description":',
      input: null,
      output: null,
    }));
    expect(bad).toMatchObject({ ok: false, reason: expect.stringMatching(/unexpected format/) });
    const denied = await suggestAudience({ brand: 'X', industry: 'B2B', website: null }, async () => {
      throw Object.assign(new Error('no'), { status: 401 });
    });
    expect(denied).toMatchObject({ ok: false, reason: expect.stringMatching(/rejected the API key/) });
  });
});
