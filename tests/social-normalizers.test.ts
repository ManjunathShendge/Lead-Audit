import { describe, expect, it } from 'vitest';
import { normalizeFacebook } from '@/lib/collectors/facebook';
import { normalizeLinkedIn, parseEmployees } from '@/lib/collectors/linkedin';

const AT = '2026-09-28T00:00:00.000Z';

describe('normalizeFacebook', () => {
  const page = (extra: Record<string, unknown> = {}) => ({
    title: 'Earthkind Living',
    followers: 18400,
    likes: 17900,
    categories: ['Home goods store'],
    info: ['Sustainable homeware'],
    website: 'https://earthkindliving.com',
    profilePictureUrl: 'https://cdn.example.com/a.jpg',
    isVerified: true,
    pageUrl: 'https://www.facebook.com/earthkind',
    ...extra,
  });
  const post = (extra: Record<string, unknown> = {}) => ({
    postId: 'p1',
    url: 'https://www.facebook.com/earthkind/posts/1',
    time: '2026-09-20T09:00:00Z',
    likes: 120,
    comments: 9,
    shares: 4,
    text: 'New drop',
    type: 'Photo',
    ...extra,
  });

  it('merges page metadata with post engagement', () => {
    const result = normalizeFacebook('earthkind', [page()], [post(), post({ postId: 'p2' })], AT, 0.02, 30);
    expect(result.status).toBe('ok');
    expect(result.profile?.followers).toBe(18400);
    expect(result.profile?.category).toBe('Home goods store');
    expect(result.profile?.verified).toBe(true);
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].shares).toBe(4);
    expect(result.posts[0].type).toBe('image');
    // Facebook publishes no total post count, so a sample is never provably complete.
    expect(result.sampleComplete).toBe(false);
  });

  it('keeps page likes out of the follower field and says so', () => {
    const result = normalizeFacebook('earthkind', [page({ followers: undefined })], [post()], AT, null, 30);
    expect(result.profile?.followers).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/page likes are shown but not used/);
  });

  it('reports not_found when the page actor returns nothing', () => {
    expect(normalizeFacebook('nobody', [], [], AT, 0.01, 30).status).toBe('not_found');
  });

  it('degrades to partial when only the posts actor fails', () => {
    const result = normalizeFacebook('earthkind', [page()], [], AT, 0.01, 30);
    expect(result.status).toBe('partial');
    expect(result.warnings.join(' ')).toMatch(/posts scraper returned nothing/);
  });

  it('warns when no candidate name matches a scoring field', () => {
    const result = normalizeFacebook('earthkind', [page()], [{ postId: 'x' }], AT, null, 30);
    expect(result.posts[0].publishedAt).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/Facebook posts: no known field matched for .*date/);
  });

  it('honours the posts limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => post({ postId: `p${i}` }));
    expect(normalizeFacebook('earthkind', [page()], many, AT, null, 10).posts).toHaveLength(10);
  });
});

describe('normalizeLinkedIn', () => {
  const company = (extra: Record<string, unknown> = {}) => ({
    name: 'Northstar Works',
    followerCount: 5400,
    employeeCount: '11-50 employees',
    industry: 'Business Consulting',
    description: 'B2B consultancy',
    website: 'https://northstarworks.com',
    logo: 'https://cdn.example.com/l.png',
    linkedinUrl: 'https://www.linkedin.com/company/northstarworks',
    ...extra,
  });
  const post = (extra: Record<string, unknown> = {}) => ({
    id: 'urn:li:activity:1',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:1',
    postedAt: '2026-09-18T08:00:00Z',
    reactionsCount: 44,
    commentsCount: 6,
    repostsCount: 2,
    content: 'Hiring',
    type: 'text',
    ...extra,
  });

  it('normalizes firmographics and posts together', () => {
    const result = normalizeLinkedIn('northstarworks', [company()], [post()], AT, 0.005, 30);
    expect(result.status).toBe('ok');
    expect(result.profile?.followers).toBe(5400);
    expect(result.profile?.isBusiness).toBe(true);
    expect(result.profile?.category).toBe('Business Consulting');
    expect(result.posts[0].likes).toBe(44);
    expect(result.posts[0].shares).toBe(2);
    expect(result.posts[0].views).toBeNull();
  });

  it('reads nested socialCounts field names', () => {
    const result = normalizeLinkedIn(
      'northstarworks',
      [company()],
      [{ id: 'a', postedAt: '2026-09-18T08:00:00Z', socialCounts: { numLikes: 12, numComments: 3 } }],
      AT,
      null,
      30,
    );
    expect(result.posts[0].likes).toBe(12);
    expect(result.posts[0].comments).toBe(3);
  });

  it('degrades cleanly when the posts actor returns nothing', () => {
    const result = normalizeLinkedIn('northstarworks', [company()], [], AT, 0.003, 30);
    expect(result.status).toBe('partial');
    expect(result.posts).toEqual([]);
    expect(result.profile?.followers).toBe(5400);
    expect(result.warnings.join(' ')).toMatch(/not measured/);
  });

  it('reports not_found when the company actor returns nothing', () => {
    expect(normalizeLinkedIn('nobody', [], [], AT, null, 30).status).toBe('not_found');
  });
});

describe('parseEmployees', () => {
  it('takes the lower bound of a range and handles separators', () => {
    expect(parseEmployees('11-50 employees')).toBe(11);
    expect(parseEmployees('1,200')).toBe(1200);
    expect(parseEmployees('5001+')).toBe(5001);
    expect(parseEmployees('unknown')).toBeNull();
    expect(parseEmployees(null)).toBeNull();
  });
});
