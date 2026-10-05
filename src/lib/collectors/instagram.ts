import { fetchBounds } from '../period';
import { runActor } from './apify';
import { FieldPicker } from './fields';
import { profileUrl, resultSchema, type Collector, type CollectorResult, type NormalizedPost } from './types';

/**
 * Candidate field names from brief section 4.1, to be confirmed against a saved real response.
 * Order matters: the first match wins.
 */
export const IG_FIELDS = {
  followers: [
    'follower_count',
    'followers_count',
    'followersCount',
    'stats.followers',
    'edge_followed_by.count',
  ],
  following: ['following_count', 'followingCount', 'stats.following', 'edge_follow.count'],
  totalPosts: ['media_count', 'postsCount', 'stats.posts', 'edge_owner_to_timeline_media.count'],
  displayName: ['full_name', 'fullName', 'metadata.full_name', 'name'],
  bio: ['biography', 'metadata.biography', 'bio'],
  bioLink: ['external_url', 'externalUrl', 'metadata.external_url', 'bio_links.0.url'],
  avatar: ['profile_pic_url_hd', 'profile_pic_url', 'profilePicUrl', 'profilePicUrlHD'],
  profileUrl: ['metadata.profile_url', 'profile_url'],
  verified: ['is_verified', 'verified', 'metadata.is_verified'],
  isBusiness: ['is_business', 'is_business_account', 'is_professional_account', 'isBusinessAccount'],
  category: ['category', 'category_name', 'categoryName', 'business_category_name'],
  private: ['is_private', 'private', 'isPrivate'],
  postId: ['id', 'pk', 'shortcode', 'code'],
  shortcode: ['shortcode', 'code'],
  takenAt: ['taken_at', 'taken_at_timestamp', 'timestamp', 'takenAt'],
  likes: ['like_count', 'likesCount', 'edge_liked_by.count', 'edge_media_preview_like.count'],
  comments: ['comment_count', 'commentsCount', 'edge_media_to_comment.count'],
  views: ['play_count', 'video_view_count', 'view_count', 'videoViewCount', 'videoPlayCount'],
  // pinned_for_users is what hpix/instagram-scraper actually returns; confirmed 28 Sep 2026.
  pinned: ['is_pinned', 'pinned_for_users', 'timeline_pinned_user_ids', 'isPinned'],
  productType: ['product_type', 'productType'],
  mediaType: ['media_type', 'mediaType', '__typename', 'type'],
  caption: ['caption.text', 'caption', 'edge_media_to_caption.edges.0.node.text'],
} as const;

export function classifyPost(picker: FieldPicker, kind: string): NormalizedPost['type'] {
  const product = (picker.text('productType', [...IG_FIELDS.productType]) ?? '').toLowerCase();
  if (kind === 'reel' || product === 'clips') return 'reel';
  const media = (picker.text('mediaType', [...IG_FIELDS.mediaType]) ?? '').toLowerCase();
  if (media.includes('sidecar') || media.includes('carousel') || media === '8') return 'carousel';
  if (media.includes('video') || media === '2') return 'video';
  return 'image';
}

type DatasetItem = { kind?: string; data?: unknown; [key: string]: unknown };

/**
 * The actor splits a profile across `data`, `stats` and `metadata` siblings, so candidates must be able
 * to reach all three. `data` wins on key collisions because it holds the platform's own field names.
 */
function body(item: DatasetItem): unknown {
  return item.data && typeof item.data === 'object'
    ? { ...item, ...(item.data as Record<string, unknown>) }
    : item;
}

export function normalizeInstagram(
  handle: string,
  items: DatasetItem[],
  fetchedAt: string,
  costUsd: number | null,
  postsLimit: number,
): CollectorResult {
  const warnings: string[] = [];
  const profileItem = items.find((i) => i.kind === 'profile') ?? items.find((i) => !i.kind);
  if (!profileItem)
    return resultSchema.parse({
      status: 'not_found',
      profile: null,
      posts: [],
      raw: { source: 'apify.instagram', items },
      costUsd,
      warnings: ['The scraper returned no profile item for this handle.'],
      fetchedAt,
      sampleComplete: false,
      subscriberHidden: false,
    });

  // Every profile field is read up front so that p.warnings() below sees the complete set of misses.
  const p = new FieldPicker(body(profileItem));
  const isPrivate = p.bool('private', [...IG_FIELDS.private]);
  const followers = p.number('followers', [...IG_FIELDS.followers]);
  const totalPosts = p.number('totalPosts', [...IG_FIELDS.totalPosts]);
  const category = p.text('category', [...IG_FIELDS.category]);
  const business = p.bool('isBusiness', [...IG_FIELDS.isBusiness]);
  const displayName = p.text('displayName', [...IG_FIELDS.displayName]);
  const following = p.number('following', [...IG_FIELDS.following]);
  const verified = p.bool('verified', [...IG_FIELDS.verified]);
  const bio = p.text('bio', [...IG_FIELDS.bio]);
  const bioLink = p.url('bioLink', [...IG_FIELDS.bioLink]);
  const avatarUrl = p.url('avatar', [...IG_FIELDS.avatar]);
  const url = p.url('profileUrl', [...IG_FIELDS.profileUrl]) ?? profileUrl('instagram', handle);

  const postItems = items.filter((i) => i.kind === 'post' || i.kind === 'reel').slice(0, postsLimit);
  const postMisses = new Set<string>();
  const posts: NormalizedPost[] = postItems.map((item, index) => {
    const f = new FieldPicker(body(item));
    const shortcode = f.text('shortcode', [...IG_FIELDS.shortcode]);
    const post: NormalizedPost = {
      id: f.text('postId', [...IG_FIELDS.postId]) ?? `${handle}-${index}`,
      url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : null,
      publishedAt: f.date('takenAt', [...IG_FIELDS.takenAt]),
      type: classifyPost(f, item.kind ?? ''),
      likes: f.number('likes', [...IG_FIELDS.likes]),
      comments: f.number('comments', [...IG_FIELDS.comments]),
      shares: null,
      views: f.number('views', [...IG_FIELDS.views]),
      isPinned: f.bool('pinned', [...IG_FIELDS.pinned]) === true,
      captionPreview: f.text('caption', [...IG_FIELDS.caption])?.slice(0, 180) ?? null,
      caption: f.text('caption', [...IG_FIELDS.caption])?.slice(0, 1000) ?? null,
    };
    f.missing.forEach((miss) => postMisses.add(miss));
    return post;
  });

  warnings.push(...p.warnings('Instagram profile'));
  // Views and pins are legitimately absent on many posts; only warn about metrics that drive scores.
  const scoring = [...postMisses].filter((m) => ['takenAt', 'likes', 'comments'].includes(m));
  if (scoring.length)
    warnings.push(`Instagram posts: no known field matched for ${scoring.join(', ')} on some posts.`);
  if (posts.some((x) => x.likes === null))
    warnings.push('Some posts hide their like count; those are excluded from averages and top posts.');

  if (isPrivate)
    return resultSchema.parse({
      status: 'private',
      profile: null,
      posts: [],
      raw: { source: 'apify.instagram', items },
      costUsd,
      warnings: [...warnings, 'Private account: public metrics are unavailable.'],
      fetchedAt,
      sampleComplete: false,
      subscriberHidden: false,
    });

  const sampleComplete = totalPosts !== null && posts.length >= totalPosts;
  if (!sampleComplete && posts.length)
    warnings.push(
      `Fetched the ${posts.length} most recent posts of ${totalPosts ?? 'an unknown number of'} total.`,
    );

  return resultSchema.parse({
    status: posts.length || totalPosts === 0 ? 'ok' : 'partial',
    profile: {
      handle,
      displayName,
      url,
      followers,
      following,
      totalPosts,
      verified,
      isBusiness: business === null && category ? true : business,
      category,
      bio,
      bioLink,
      avatarUrl,
    },
    posts,
    raw: { source: 'apify.instagram', matchedFields: p.matched, items },
    costUsd,
    warnings,
    fetchedAt,
    sampleComplete,
    subscriberHidden: false,
  });
}

export function instagramCollector(asOf = new Date()): Collector {
  return {
    platform: 'instagram',
    async collect(handle, { postsLimit, signal, window }) {
      signal?.throwIfAborted();
      const { items, costUsd } = await runActor(
        process.env.APIFY_ACTOR_INSTAGRAM ?? '',
        {
          profiles: [handle],
          scrape_profile_data: true,
          scrape_posts: true,
          scrape_reels: true,
          posts_per_account: postsLimit,
          ...(window && { fromDate: fetchBounds(window).from, toDate: fetchBounds(window).to }),
          include_raw_data: true,
          // scrape_detailed_data and scrape_restricted_posts are paid add-ons and stay off.
        },
        { signal },
      );
      return normalizeInstagram(handle, items as DatasetItem[], asOf.toISOString(), costUsd, postsLimit);
    },
  };
}
