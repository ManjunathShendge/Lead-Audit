import { addCost, runActor } from './apify';
import { FieldPicker } from './fields';
import { profileUrl, resultSchema, type Collector, type CollectorResult, type NormalizedPost } from './types';

/**
 * Actors selected at milestone 9:
 *   company -> automation-lab/linkedin-company-scraper (firmographics, no posts)
 *   posts   -> harvestapi/linkedin-company-posts       (per-post date, reactions, comments)
 *
 * Brief section 4.2.5: LinkedIn is the platform most likely to break, so a failure here degrades to
 * "Not measured" rather than a zero. No real response has been captured yet.
 */
export const LI_COMPANY_FIELDS = {
  displayName: ['name', 'companyName', 'title', 'universalName'],
  followers: ['followerCount', 'followers', 'followersCount', 'follower_count'],
  employees: ['employeeCount', 'employees', 'staffCount', 'companySize', 'size'],
  category: ['industry', 'industries.0', 'industryName', 'companyIndustry'],
  bio: ['description', 'about', 'tagline', 'summary'],
  bioLink: ['website', 'websiteUrl', 'companyWebsite', 'url'],
  avatar: ['logo', 'logoUrl', 'logoResolutionResult', 'profilePictureUrl', 'image'],
  companyUrl: ['linkedinUrl', 'companyUrl', 'profileUrl', 'url'],
} as const;

/** Confirmed against a real harvestapi/linkedin-company-posts response on 28 September 2026. */
export const LI_POST_FIELDS = {
  id: ['id', 'postId', 'urn', 'activityUrn'],
  url: ['linkedinUrl', 'shareLinkedinUrl', 'url', 'postUrl', 'link', 'permalink'],
  date: [
    'postedAt.date',
    'postedAt.timestamp',
    'postedAt',
    'postedDate',
    'publishedAt',
    'date',
    'time',
    'createdAt',
  ],
  likes: [
    'engagement.likes',
    'engagement.reactionsCount',
    'reactionsCount',
    'likesCount',
    'numLikes',
    'socialCounts.numLikes',
  ],
  comments: ['engagement.comments', 'commentsCount', 'numComments', 'socialCounts.numComments'],
  shares: ['engagement.shares', 'repostsCount', 'sharesCount', 'numShares', 'socialCounts.numShares'],
  text: ['content', 'text', 'postText', 'commentary', 'description'],
  type: ['type', 'postType', 'mediaType', 'contentType'],
} as const;

function classify(picker: FieldPicker): NormalizedPost['type'] {
  const raw = (picker.text('type', [...LI_POST_FIELDS.type]) ?? '').toLowerCase();
  if (raw.includes('video')) return 'video';
  if (raw.includes('carousel') || raw.includes('document')) return 'carousel';
  if (raw.includes('article') || raw.includes('link')) return 'link';
  if (raw.includes('image') || raw.includes('photo')) return 'image';
  return 'text';
}

/** "11-50 employees" or "1,200" to a number; a range takes its lower bound. */
export function parseEmployees(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, '');
  const match = cleaned.match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeLinkedIn(
  handle: string,
  companyItems: Record<string, unknown>[],
  postItems: Record<string, unknown>[],
  fetchedAt: string,
  costUsd: number | null,
  postsLimit: number,
): CollectorResult {
  const warnings: string[] = [];
  const company = companyItems[0];
  if (!company)
    return resultSchema.parse({
      status: 'not_found',
      profile: null,
      posts: [],
      raw: { source: 'apify.linkedin', companyItems, postItems },
      costUsd,
      warnings: ['The company scraper returned no item for this handle.'],
      fetchedAt,
      sampleComplete: false,
      subscriberHidden: false,
    });

  const c = new FieldPicker(company);
  const category = c.text('category', [...LI_COMPANY_FIELDS.category]);
  const employees = parseEmployees(c.text('employees', [...LI_COMPANY_FIELDS.employees]));

  const misses = new Set<string>();
  const posts: NormalizedPost[] = postItems.slice(0, postsLimit).map((item, index) => {
    const f = new FieldPicker(item);
    const post: NormalizedPost = {
      id: f.text('id', [...LI_POST_FIELDS.id]) ?? `${handle}-${index}`,
      url: f.url('url', [...LI_POST_FIELDS.url]),
      publishedAt: f.date('date', [...LI_POST_FIELDS.date]),
      type: classify(f),
      likes: f.number('likes', [...LI_POST_FIELDS.likes]),
      comments: f.number('comments', [...LI_POST_FIELDS.comments]),
      shares: f.number('shares', [...LI_POST_FIELDS.shares]),
      views: null,
      isPinned: false,
      captionPreview: f.text('text', [...LI_POST_FIELDS.text])?.slice(0, 180) ?? null,
    };
    f.missing.forEach((m) => misses.add(m));
    return post;
  });

  warnings.push(...c.warnings('LinkedIn company'));
  const scoring = [...misses].filter((m) => ['date', 'likes', 'comments'].includes(m));
  if (scoring.length)
    warnings.push(`LinkedIn posts: no known field matched for ${scoring.join(', ')} on some posts.`);
  if (!postItems.length)
    warnings.push('The posts scraper returned nothing, so activity and engagement are not measured.');

  return resultSchema.parse({
    status: posts.length ? 'ok' : 'partial',
    profile: {
      handle,
      displayName: c.text('displayName', [...LI_COMPANY_FIELDS.displayName]),
      url: c.url('companyUrl', [...LI_COMPANY_FIELDS.companyUrl]) ?? profileUrl('linkedin', handle),
      followers: c.number('followers', [...LI_COMPANY_FIELDS.followers]),
      following: null,
      // LinkedIn company pages publish no total post count.
      totalPosts: null,
      verified: null,
      isBusiness: true,
      category,
      bio: c.text('bio', [...LI_COMPANY_FIELDS.bio]),
      bioLink: c.url('bioLink', [...LI_COMPANY_FIELDS.bioLink]),
      avatarUrl: c.url('avatar', [...LI_COMPANY_FIELDS.avatar]),
    },
    posts,
    sampleComplete: false,
    subscriberHidden: false,
    raw: {
      source: 'apify.linkedin',
      companyActor: process.env.APIFY_ACTOR_LINKEDIN ?? null,
      postsActor: process.env.APIFY_ACTOR_LINKEDIN_POSTS ?? null,
      matchedFields: c.matched,
      employeeCount: employees,
      companyItems,
      postItems,
    },
    costUsd,
    warnings,
    fetchedAt,
  });
}

export function linkedinCollector(asOf = new Date()): Collector {
  return {
    platform: 'linkedin',
    async collect(handle, { postsLimit, signal }) {
      signal?.throwIfAborted();
      const url = profileUrl('linkedin', handle);
      const company = await runActor(
        process.env.APIFY_ACTOR_LINKEDIN ?? '',
        { companyUrls: [url], startUrls: [{ url }] },
        { signal },
      );
      // harvestapi/linkedin-company-posts takes full URLs under `targetUrls`; a slug returns nothing.
      // Confirmed against the actor's input schema on 28 September 2026.
      const posts = await runActor(
        process.env.APIFY_ACTOR_LINKEDIN_POSTS ?? '',
        { targetUrls: [url], maxPosts: postsLimit, includeReposts: false, includeQuotePosts: true },
        { signal },
      );
      return normalizeLinkedIn(
        handle,
        company.items,
        posts.items,
        asOf.toISOString(),
        addCost(company.costUsd, posts.costUsd),
        postsLimit,
      );
    },
  };
}
