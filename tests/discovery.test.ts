import { describe, expect, it } from 'vitest';
import { extractHandles, handleFromUrl, missingPlatforms } from '@/lib/discovery/extract';
import { cleanBrand } from '@/lib/discovery';
import { isPrivateAddress, assertPublicUrl, UnsafeUrlError } from '@/lib/discovery/net';

const at = (href: string) => handleFromUrl(new URL(href));

describe('handleFromUrl', () => {
  it('reads a profile link per platform', () => {
    expect(at('https://www.instagram.com/earthkind/')).toMatchObject({
      platform: 'instagram',
      found: { handle: 'earthkind' },
    });
    expect(at('https://facebook.com/EarthKind')).toMatchObject({
      platform: 'facebook',
      found: { handle: 'earthkind' },
    });
    expect(at('https://in.linkedin.com/company/earthkind-living/')).toMatchObject({
      platform: 'linkedin',
      found: { handle: 'earthkind-living' },
    });
    expect(at('https://www.youtube.com/@EarthKind')).toMatchObject({
      platform: 'youtube',
      found: { handle: 'earthkind' },
    });
    expect(at('https://www.youtube.com/channel/UCabc123')).toMatchObject({
      platform: 'youtube',
      found: { handle: 'UCabc123' },
    });
  });

  it('rejects share, intent and post links', () => {
    expect(at('https://www.facebook.com/sharer/sharer.php?u=https://x.example')).toBeNull();
    expect(at('https://www.facebook.com/sharer.php?u=https://x.example')).toBeNull();
    expect(at('https://twitter.com/intent/tweet?text=hi')).toBeNull();
    expect(at('https://www.linkedin.com/shareArticle?mini=true&url=https://x.example')).toBeNull();
    expect(at('https://www.instagram.com/p/Cabc123/')).toBeNull();
    expect(at('https://www.instagram.com/reel/Cabc123/')).toBeNull();
    expect(at('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(at('https://www.youtube.com/shorts/abc')).toBeNull();
  });

  it('rejects personal profiles and platform-internal pages', () => {
    expect(at('https://www.linkedin.com/in/some-person/')).toBeNull();
    expect(at('https://www.linkedin.com/feed/')).toBeNull();
    expect(at('https://www.facebook.com/groups/12345')).toBeNull();
    expect(at('https://www.instagram.com/explore/tags/design/')).toBeNull();
    expect(at('https://www.instagram.com/accounts/login/')).toBeNull();
  });

  it('handles Facebook numeric page forms', () => {
    expect(at('https://www.facebook.com/profile.php?id=100064')).toMatchObject({
      found: { handle: '100064' },
    });
    expect(at('https://www.facebook.com/pages/Earth-Kind/100064')).toMatchObject({
      found: { handle: '100064' },
    });
  });

  it('flags legacy YouTube custom URLs instead of trusting them', () => {
    const legacy = at('https://www.youtube.com/c/EarthKind');
    expect(legacy?.found.handle).toBe('earthkind');
    expect(legacy?.found.note).toMatch(/Confirm/);
  });

  it('separates x.com from the audited platforms', () => {
    expect(at('https://x.com/earthkind')).toMatchObject({ platform: 'x' });
    expect(at('https://twitter.com/earthkind')).toMatchObject({ platform: 'x' });
  });

  it('ignores non-http schemes', () => {
    expect(at('mailto:hi@example.com')).toBeNull();
    expect(at('javascript:void(0)')).toBeNull();
  });
});

describe('extractHandles', () => {
  it('keeps the first usable link per platform and ignores noise', () => {
    const result = extractHandles([
      'https://example.com/about',
      'https://www.facebook.com/sharer/sharer.php?u=https://example.com',
      'https://www.instagram.com/brandone/',
      'https://www.instagram.com/brandtwo/',
      'https://x.com/brandone',
      'not a url',
    ]);
    expect(result.handles.instagram?.handle).toBe('brandone');
    expect(result.other).toHaveLength(1);
    expect(missingPlatforms(result)).toEqual(['facebook', 'linkedin', 'youtube']);
  });

  it('merges a later page without overwriting earlier finds', () => {
    const first = extractHandles(['https://www.instagram.com/brandone/']);
    const merged = extractHandles(
      ['https://www.instagram.com/other/', 'https://www.linkedin.com/company/brandone/'],
      first,
    );
    expect(merged.handles.instagram?.handle).toBe('brandone');
    expect(merged.handles.linkedin?.handle).toBe('brandone');
  });
});

describe('cleanBrand', () => {
  it('strips taglines from a page title', () => {
    expect(cleanBrand('Earthkind Living | Sustainable homeware')).toBe('Earthkind Living');
    expect(cleanBrand('Morrow Studio - Design')).toBe('Morrow Studio');
    expect(cleanBrand('Northstar Works')).toBe('Northstar Works');
    expect(cleanBrand(null)).toBeNull();
  });
});

describe('network guard', () => {
  it('classifies private and public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.5',
      '172.16.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('rejects unsafe URLs before any network call', async () => {
    for (const url of [
      'http://localhost/',
      'http://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      'http://user:pass@example.com/',
      'http://example.com:8080/',
      'http://intranet/',
    ])
      await expect(assertPublicUrl(url), url).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
