import { describe, expect, it } from 'vitest';
import { FieldPicker } from '@/lib/collectors/fields';
import { normalizeInstagram, classifyPost } from '@/lib/collectors/instagram';
import { durationSeconds } from '@/lib/collectors/youtube';

const AT = '2026-09-28T00:00:00.000Z';

describe('FieldPicker', () => {
  it('takes the first matching candidate and records misses', () => {
    const p = new FieldPicker({ followers_count: 1200, edge_follow: { count: 34 } });
    expect(p.number('followers', ['follower_count', 'followers_count'])).toBe(1200);
    expect(p.number('following', ['following_count', 'edge_follow.count'])).toBe(34);
    expect(p.number('posts', ['media_count', 'edge_owner_to_timeline_media.count'])).toBeNull();
    expect(p.missing).toEqual(['posts']);
    expect(p.warnings('Instagram profile')[0]).toMatch(/no known field matched for posts/);
  });

  it('treats hidden counts as null, never zero', () => {
    const p = new FieldPicker({ like_count: -1, comment_count: 'nope', view_count: '4200' });
    expect(p.number('likes', ['like_count'])).toBeNull();
    expect(p.number('comments', ['comment_count'])).toBeNull();
    expect(p.number('views', ['view_count'])).toBe(4200);
  });

  it('reads unix seconds, unix millis and ISO dates', () => {
    const p = new FieldPicker({ a: 1759017600, b: 1759017600000, c: '2026-09-28T00:00:00Z', d: 'nope' });
    expect(p.date('a', ['a'])).toBe(p.date('b', ['b']));
    expect(p.date('c', ['c'])).toBe('2026-09-28T00:00:00.000Z');
    expect(p.date('d', ['d'])).toBeNull();
  });

  it('rejects non-http bio links', () => {
    const p = new FieldPicker({ good: 'https://example.com/x', bad: 'javascript:alert(1)' });
    expect(p.url('good', ['good'])).toBe('https://example.com/x');
    expect(p.url('bad', ['bad'])).toBeNull();
  });
});

describe('normalizeInstagram', () => {
  const profile = (extra: Record<string, unknown> = {}) => ({
    kind: 'profile',
    data: {
      full_name: 'Earthkind Living',
      biography: 'Sustainable homeware',
      external_url: 'https://earthkindliving.com',
      profile_pic_url: 'https://cdn.example.com/a.jpg',
      follower_count: 24000,
      following_count: 310,
      media_count: 2,
      is_verified: false,
      is_business: true,
      category: 'Home goods',
      ...extra,
    },
  });
  const post = (extra: Record<string, unknown> = {}) => ({
    kind: 'post',
    data: {
      id: 'p1',
      shortcode: 'Cabc',
      taken_at: 1759017600,
      like_count: 420,
      comment_count: 18,
      caption: { text: 'Hello' },
      ...extra,
    },
  });

  it('normalizes a complete profile and its posts', () => {
    const result = normalizeInstagram('earthkind', [profile(), post(), post({ id: 'p2' })], AT, 0.012, 30);
    expect(result.status).toBe('ok');
    expect(result.profile?.followers).toBe(24000);
    expect(result.profile?.bioLink).toBe('https://earthkindliving.com/');
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].url).toBe('https://www.instagram.com/p/Cabc/');
    expect(result.costUsd).toBe(0.012);
    expect(result.sampleComplete).toBe(true);
  });

  it('falls back through alternative field names', () => {
    const result = normalizeInstagram(
      'earthkind',
      [
        {
          kind: 'profile',
          data: {
            edge_followed_by: { count: 900 },
            edge_owner_to_timeline_media: { count: 5 },
            fullName: 'Alt Naming',
          },
        },
        { kind: 'post', data: { pk: 'x', taken_at_timestamp: 1759017600, edge_liked_by: { count: 7 } } },
      ],
      AT,
      null,
      30,
    );
    expect(result.profile?.followers).toBe(900);
    expect(result.profile?.displayName).toBe('Alt Naming');
    expect(result.posts[0].likes).toBe(7);
  });

  it('warns when no candidate matches a scoring field', () => {
    const result = normalizeInstagram(
      'earthkind',
      [
        { kind: 'profile', data: { full_name: 'X' } },
        { kind: 'post', data: { id: 'q' } },
      ],
      AT,
      null,
      30,
    );
    expect(result.profile?.followers).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/Instagram profile: no known field matched for .*followers/);
    expect(result.warnings.join(' ')).toMatch(/Instagram posts: no known field matched for .*takenAt/);
  });

  it('reports a private account without inventing zeros', () => {
    const result = normalizeInstagram('earthkind', [profile({ is_private: true }), post()], AT, 0.01, 30);
    expect(result.status).toBe('private');
    expect(result.profile).toBeNull();
    expect(result.posts).toEqual([]);
  });

  it('reports not_found when no profile item comes back', () => {
    expect(normalizeInstagram('nobody', [], AT, 0.001, 30).status).toBe('not_found');
  });

  it('marks hidden likes null and flags an incomplete sample', () => {
    const result = normalizeInstagram(
      'earthkind',
      [profile({ media_count: 900 }), post({ like_count: -1 })],
      AT,
      null,
      30,
    );
    expect(result.posts[0].likes).toBeNull();
    expect(result.sampleComplete).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/most recent posts of 900/);
  });

  it('respects the posts limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => post({ id: `p${i}` }));
    expect(normalizeInstagram('earthkind', [profile(), ...many], AT, null, 12).posts).toHaveLength(12);
  });

  it('classifies reels, carousels and videos', () => {
    expect(classifyPost(new FieldPicker({ product_type: 'clips' }), 'post')).toBe('reel');
    expect(classifyPost(new FieldPicker({}), 'reel')).toBe('reel');
    expect(classifyPost(new FieldPicker({ media_type: 8 }), 'post')).toBe('carousel');
    expect(classifyPost(new FieldPicker({ __typename: 'GraphVideo' }), 'post')).toBe('video');
    expect(classifyPost(new FieldPicker({}), 'post')).toBe('image');
  });
});

describe('youtube duration', () => {
  it('parses ISO-8601 durations used for short-form classification', () => {
    expect(durationSeconds('PT45S')).toBe(45);
    expect(durationSeconds('PT1M5S')).toBe(65);
    expect(durationSeconds('PT1H2M3S')).toBe(3723);
    expect(durationSeconds('P1DT0S')).toBe(86400);
    expect(durationSeconds(undefined)).toBeNull();
    expect(durationSeconds('nonsense')).toBeNull();
  });
});
