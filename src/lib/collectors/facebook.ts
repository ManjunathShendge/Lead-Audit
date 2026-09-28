import { addCost, runActor } from './apify';
import { FieldPicker } from './fields';
import { profileUrl, resultSchema, type Collector, type CollectorResult, type NormalizedPost } from './types';

/**
 * Actors selected at milestone 9:
 *   page  -> apify/facebook-pages-scraper  (page metadata, no posts)
 *   posts -> apify/facebook-posts-scraper  (per-post date, reactions, comments, shares)
 *
 * No real response has been captured yet, so every field is read through candidate names and a miss
 * becomes "Not measured" plus a warning rather than a guessed number. Confirm with:
 *   npx tsx scripts/capture-fixture.ts facebook <handle> --confirm-cost
 */
export const FB_PAGE_FIELDS = {
  displayName: ['title', 'name', 'pageName', 'pageTitle'],
  followers: ['followers', 'followersCount', 'followerCount', 'follows'],
  likes: ['likes', 'likesCount', 'likeCount', 'pageLikes'],
  category: ['categories.0', 'category', 'categoryName', 'pageCategory'],
  bio: ['info.0', 'intro', 'about', 'description', 'pageDescription', 'bio'],
  bioLink: ['website', 'websites.0', 'externalUrl', 'link'],
  avatar: ['profilePictureUrl', 'profilePhoto', 'profilePicUrl', 'imageUrl', 'avatar'],
  verified: ['isVerified', 'verified', 'is_verified'],
  pageUrl: ['pageUrl', 'url', 'facebookUrl'],
} as const;

export const FB_POST_FIELDS = {
  id: ['postId', 'id', 'post_id', 'legacyId'],
  url: ['url', 'postUrl', 'topLevelUrl', 'link', 'permalink'],
  date: ['time', 'timestamp', 'date', 'publishedAt', 'postDate', 'createdAt'],
  likes: ['likes', 'likesCount', 'reactionsCount', 'reactions.likes', 'reactionCount'],
  comments: ['comments', 'commentsCount', 'commentCount'],
  shares: ['shares', 'sharesCount', 'shareCount'],
  views: ['viewsCount', 'videoViewCount', 'views'],
  text: ['text', 'message', 'postText', 'caption', 'content'],
  pinned: ['isPinned', 'pinned'],
  type: ['type', 'postType', 'mediaType', '__typename'],
} as const;

function classify(picker: FieldPicker): NormalizedPost['type'] {
  const raw = (picker.text('type', [...FB_POST_FIELDS.type]) ?? '').toLowerCase();
  if (raw.includes('reel')) return 'reel';
  if (raw.includes('video')) return 'video';
  if (raw.includes('album') || raw.includes('carousel')) return 'carousel';
  if (raw.includes('link')) return 'link';
  if (raw.includes('photo') || raw.includes('image')) return 'image';
  return raw ? 'text' : 'image';
}

export function normalizeFacebook(
  handle: string,
  pageItems: Record<string, unknown>[],
  postItems: Record<string, unknown>[],
  fetchedAt: string,
  costUsd: number | null,
  postsLimit: number,
): CollectorResult {
  const warnings: string[] = [];
  const page = pageItems[0];
  if (!page)
    return resultSchema.parse({
      status: 'not_found',
      profile: null,
      posts: [],
      raw: { source: 'apify.facebook', pageItems, postItems },
      costUsd,
      warnings: ['The page scraper returned no item for this handle. The page may not exist or be public.'],
      fetchedAt,
      sampleComplete: false,
      subscriberHidden: false,
    });

  const p = new FieldPicker(page);
  const followers = p.number('followers', [...FB_PAGE_FIELDS.followers]);
  const likes = p.number('likes', [...FB_PAGE_FIELDS.likes]);
  const category = p.text('category', [...FB_PAGE_FIELDS.category]);

  const misses = new Set<string>();
  const posts: NormalizedPost[] = postItems.slice(0, postsLimit).map((item, index) => {
    const f = new FieldPicker(item);
    const post: NormalizedPost = {
      id: f.text('id', [...FB_POST_FIELDS.id]) ?? `${handle}-${index}`,
      url: f.url('url', [...FB_POST_FIELDS.url]),
      publishedAt: f.date('date', [...FB_POST_FIELDS.date]),
      type: classify(f),
      likes: f.number('likes', [...FB_POST_FIELDS.likes]),
      comments: f.number('comments', [...FB_POST_FIELDS.comments]),
      shares: f.number('shares', [...FB_POST_FIELDS.shares]),
      views: f.number('views', [...FB_POST_FIELDS.views]),
      isPinned: f.bool('pinned', [...FB_POST_FIELDS.pinned]) === true,
      captionPreview: f.text('text', [...FB_POST_FIELDS.text])?.slice(0, 180) ?? null,
    };
    f.missing.forEach((m) => misses.add(m));
    return post;
  });

  warnings.push(...p.warnings('Facebook page'));
  const scoring = [...misses].filter((m) => ['date', 'likes'].includes(m));
  if (scoring.length)
    warnings.push(`Facebook posts: no known field matched for ${scoring.join(', ')} on some posts.`);
  /**
   * Confirmed 28 Sep 2026: this actor omits `comments` entirely on posts that have none, while still
   * emitting `shares: 0`. An absent count cannot be told apart from a genuine zero, so per brief section
   * 0.5 it stays null. That excludes the post from the comment average, which can overstate engagement.
   */
  const noComments = posts.filter((x) => x.comments === null).length;
  if (noComments)
    warnings.push(
      `${noComments} of ${posts.length} Facebook posts returned no comment count. They are excluded from the comment average and from top posts, so engagement may read higher than it is.`,
    );
  // Page "likes" and "followers" are different Facebook metrics; followers drives engagement rate.
  if (followers === null && likes !== null)
    warnings.push('Follower count was not returned; page likes are shown but not used for engagement rate.');
  if (!postItems.length)
    warnings.push('The posts scraper returned nothing, so activity and engagement are not measured.');

  return resultSchema.parse({
    status: posts.length ? 'ok' : 'partial',
    profile: {
      handle,
      displayName: p.text('displayName', [...FB_PAGE_FIELDS.displayName]),
      url: p.url('pageUrl', [...FB_PAGE_FIELDS.pageUrl]) ?? profileUrl('facebook', handle),
      followers,
      following: null,
      totalPosts: null,
      verified: p.bool('verified', [...FB_PAGE_FIELDS.verified]),
      isBusiness: category ? true : null,
      category,
      bio: p.text('bio', [...FB_PAGE_FIELDS.bio]),
      bioLink: p.url('bioLink', [...FB_PAGE_FIELDS.bioLink]),
      avatarUrl: p.url('avatar', [...FB_PAGE_FIELDS.avatar]),
    },
    posts,
    // Facebook exposes no total post count, so a fetched page is never a complete sample.
    sampleComplete: false,
    subscriberHidden: false,
    raw: {
      source: 'apify.facebook',
      pageActor: process.env.APIFY_ACTOR_FACEBOOK ?? null,
      postsActor: process.env.APIFY_ACTOR_FACEBOOK_POSTS ?? null,
      matchedFields: p.matched,
      pageLikes: likes,
      pageItems,
      postItems,
    },
    costUsd,
    warnings,
    fetchedAt,
  });
}

export function facebookCollector(asOf = new Date()): Collector {
  return {
    platform: 'facebook',
    async collect(handle, { postsLimit, signal }) {
      signal?.throwIfAborted();
      const url = profileUrl('facebook', handle);
      const page = await runActor(
        process.env.APIFY_ACTOR_FACEBOOK ?? '',
        { startUrls: [{ url }] },
        { signal },
      );
      const posts = await runActor(
        process.env.APIFY_ACTOR_FACEBOOK_POSTS ?? '',
        { startUrls: [{ url }], resultsLimit: postsLimit },
        { signal },
      );
      return normalizeFacebook(
        handle,
        page.items,
        posts.items,
        asOf.toISOString(),
        addCost(page.costUsd, posts.costUsd),
        postsLimit,
      );
    },
  };
}
