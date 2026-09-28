import { describe, it, expect } from 'vitest';
import { parseSource, normalizeHandle, auditInputSchema, emptyHandles } from '../src/lib/validation';
describe('input validation and normalization', () => {
  it('parses website and explicit social handles', () => {
    expect(parseSource('example.com').website).toBe('https://example.com');
    expect(parseSource('instagram: @Brand, linkedin: company').handles.instagram.handle).toBe('brand');
  });
  it('normalizes exact platform domains and company routes', () => {
    expect(normalizeHandle('instagram', 'https://www.instagram.com/Brand/?utm_source=x')).toBe('brand');
    expect(normalizeHandle('linkedin', 'linkedin.com/company/acme/')).toBe('acme');
    expect(normalizeHandle('youtube', 'https://youtube.com/@Brand')).toBe('brand');
  });
  it('rejects share links, individual LinkedIn profiles and hostile suffixes', () => {
    for (const value of [
      'https://instagram.com.evil.example/name',
      'https://instagram.com/p/123',
      'https://instagram.com/intent/share',
    ])
      expect(() => normalizeHandle('instagram', value)).toThrow();
    expect(() => normalizeHandle('linkedin', 'https://linkedin.com/in/name')).toThrow();
    expect(() => normalizeHandle('facebook', 'facebook.com/sharer.php?u=test')).toThrow();
  });
  it('rejects malformed and contradictory audit input', () => {
    const base = {
      brand: 'Test',
      website: 'https://example.com',
      industry: 'D2C',
      tier: 'average',
      handles: emptyHandles(),
    };
    expect(auditInputSchema.safeParse(base).success).toBe(true);
    expect(auditInputSchema.safeParse({ ...base, website: 'javascript:alert(1)' }).success).toBe(false);
    expect(
      auditInputSchema.safeParse({
        ...base,
        handles: { ...base.handles, instagram: { presence: 'present', handle: '' } },
      }).success,
    ).toBe(false);
    expect(
      auditInputSchema.safeParse({
        ...base,
        handles: { ...base.handles, instagram: { presence: 'absent', handle: 'brand' } },
      }).success,
    ).toBe(false);
  });
  it('does not silently accept credentials or multiple websites', () => {
    expect(() => parseSource('https://user:pass@example.com')).toThrow();
    expect(() => parseSource('a.com, b.com')).toThrow();
  });
});
