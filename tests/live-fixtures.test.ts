import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeInstagram } from '@/lib/collectors/instagram';
import { normalizeFacebook } from '@/lib/collectors/facebook';
import { normalizeLinkedIn } from '@/lib/collectors/linkedin';

/**
 * Brief section 11: normalizer tests against the saved fixtures. These run the normalizers over real
 * captured responses, so a field rename in a third-party actor fails here rather than in a client report.
 * They skip when the capture has not been made, so a fresh clone with no keys still passes.
 */
const file = (platform: string, name: string) =>
  path.join(process.cwd(), 'fixtures', platform, `raw-live-${name}.json`);

function load(platform: string, name: string) {
  const target = file(platform, name);
  if (!existsSync(target)) return null;
  return JSON.parse(readFileSync(target, 'utf8')) as {
    handle: string;
    raw: { items: Record<string, unknown>[] };
  };
}

/** Facebook and LinkedIn each store two actor responses in one capture. */
function loadPaired(platform: string, name: string, aKey: string, bKey: string) {
  const target = file(platform, name);
  if (!existsSync(target)) return null;
  const parsed = JSON.parse(readFileSync(target, 'utf8')) as {
    handle: string;
    raw: Record<string, Record<string, unknown>[]>;
  };
  return { handle: parsed.handle, a: parsed.raw[aKey] ?? [], b: parsed.raw[bKey] ?? [] };
}

describe('Instagram normalizer against the captured live response', () => {
  const captured = load('instagram', 'mamaearth.in');
  const test = captured ? it : it.skip;

  test('reads the fields this actor really returns', () => {
    const result = normalizeInstagram(
      captured!.handle,
      captured!.raw.items,
      '2026-09-28T12:00:00.000Z',
      0.0268,
      30,
    );
    expect(result.status).toBe('ok');
    expect(result.profile?.displayName).toBe('Mamaearth');
    expect(result.profile?.followers).toBeGreaterThan(1_000_000);
    expect(result.profile?.following).toBeGreaterThanOrEqual(0);
    expect(result.profile?.verified).toBe(true);
    expect(result.profile?.bio).toMatch(/GoodnessInside/);
    expect(result.profile?.avatarUrl).toMatch(/^https:\/\//);
    expect(result.posts).toHaveLength(30);
  });

  test('parses every post date, like and comment count', () => {
    const result = normalizeInstagram(
      captured!.handle,
      captured!.raw.items,
      '2026-09-28T12:00:00.000Z',
      null,
      30,
    );
    expect(result.posts.every((p) => p.publishedAt !== null)).toBe(true);
    expect(result.posts.every((p) => p.likes !== null)).toBe(true);
    expect(result.posts.every((p) => p.comments !== null)).toBe(true);
    expect(result.posts.every((p) => p.url?.startsWith('https://www.instagram.com/p/'))).toBe(true);
    // pinned_for_users must resolve, otherwise pinned posts corrupt recency and frequency.
    expect(result.warnings.join(' ')).not.toMatch(/matched for .*pinned/);
  });

  test('states plainly which fields this actor does not provide', () => {
    const result = normalizeInstagram(
      captured!.handle,
      captured!.raw.items,
      '2026-09-28T12:00:00.000Z',
      null,
      30,
    );
    // The actor returns no post total, category, business flag or external URL on a free run.
    expect(result.profile?.totalPosts).toBeNull();
    expect(result.profile?.bioLink).toBeNull();
    expect(result.sampleComplete).toBe(false);
    const warning = result.warnings.join(' ');
    for (const field of ['totalPosts', 'category', 'isBusiness', 'bioLink'])
      expect(warning, `${field} should be reported as unmatched`).toMatch(
        new RegExp(`Instagram profile:.*${field}`),
      );
  });
});

describe('Facebook normalizer against the captured live response', () => {
  const captured = loadPaired('facebook', 'mamaearthindia', 'pageItems', 'postItems');
  const test = captured ? it : it.skip;

  test('reads page followers and per-post engagement', () => {
    const result = normalizeFacebook(
      captured!.handle,
      captured!.a,
      captured!.b,
      '2026-09-28T12:00:00.000Z',
      0.121,
      30,
    );
    expect(result.status).toBe('ok');
    expect(result.profile?.displayName).toBe('Mamaearth');
    expect(result.profile?.followers).toBeGreaterThan(100_000);
    expect(result.posts).toHaveLength(30);
    expect(result.posts.every((p) => p.publishedAt !== null)).toBe(true);
    expect(result.posts.every((p) => p.likes !== null)).toBe(true);
  });

  test('keeps an omitted comment count null rather than calling it zero', () => {
    const result = normalizeFacebook(
      captured!.handle,
      captured!.a,
      captured!.b,
      '2026-09-28T12:00:00.000Z',
      null,
      30,
    );
    const missing = result.posts.filter((p) => p.comments === null).length;
    expect(missing).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toMatch(
      new RegExp(`${missing} of ${result.posts.length} Facebook posts returned no comment count`),
    );
    // The bias this creates must be stated, not silently absorbed into the engagement rate.
    expect(result.warnings.join(' ')).toMatch(/engagement may read higher than it is/);
  });
});

describe('LinkedIn normalizer against the captured live response', () => {
  const captured = loadPaired('linkedin', 'mama-earth-in', 'companyItems', 'postItems');
  const test = captured ? it : it.skip;

  test('reads firmographics and the nested engagement object', () => {
    const result = normalizeLinkedIn(
      captured!.handle,
      captured!.a,
      captured!.b,
      '2026-09-28T12:00:00.000Z',
      0.00005,
      30,
    );
    expect(result.status).toBe('ok');
    expect(result.profile?.displayName).toBe('Mamaearth');
    expect(result.profile?.followers).toBeGreaterThan(100_000);
    expect(result.posts.length).toBeGreaterThan(0);
    // engagement.likes / engagement.comments and postedAt.date are nested, not top level.
    expect(result.posts.every((p) => p.publishedAt !== null)).toBe(true);
    expect(result.posts.every((p) => p.likes !== null)).toBe(true);
    expect(result.posts.every((p) => p.comments !== null)).toBe(true);
    expect(result.warnings.join(' ')).not.toMatch(/no known field matched/);
  });
});
