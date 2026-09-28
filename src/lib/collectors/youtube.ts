import { z } from 'zod';
import { profileUrl, resultSchema, type Collector, type CollectorResult, type NormalizedPost } from './types';

const API = 'https://www.googleapis.com/youtube/v3';
/** playlistItems and videos cost 1 quota unit per call; channels.list costs 1. search.list (100) is never used. */
const PAGE = 50;

const thumbnails = z
  .object({
    high: z.object({ url: z.string() }).partial().optional(),
    medium: z.object({ url: z.string() }).partial().optional(),
    default: z.object({ url: z.string() }).partial().optional(),
  })
  .partial()
  .optional();

const channelSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            customUrl: z.string().optional(),
            thumbnails,
          })
          .optional(),
        statistics: z
          .object({
            viewCount: z.string().optional(),
            subscriberCount: z.string().optional(),
            hiddenSubscriberCount: z.boolean().optional(),
            videoCount: z.string().optional(),
          })
          .optional(),
        contentDetails: z
          .object({ relatedPlaylists: z.object({ uploads: z.string().optional() }).optional() })
          .optional(),
      }),
    )
    .optional()
    .default([]),
});

const playlistItemsSchema = z.object({
  items: z
    .array(
      z.object({
        contentDetails: z
          .object({ videoId: z.string().optional(), videoPublishedAt: z.string().optional() })
          .optional(),
      }),
    )
    .optional()
    .default([]),
  nextPageToken: z.string().optional(),
});

const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string().optional(), publishedAt: z.string().optional() }).optional(),
        statistics: z
          .object({
            viewCount: z.string().optional(),
            likeCount: z.string().optional(),
            commentCount: z.string().optional(),
          })
          .optional(),
        contentDetails: z.object({ duration: z.string().optional() }).optional(),
      }),
    )
    .optional()
    .default([]),
});

export class YouTubeConfigError extends Error {}

/** YouTube returns counts as strings; absent means the channel hides them, which is not zero. */
function count(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** ISO-8601 duration (PT1M5S) to seconds. */
export function durationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

async function call<T extends z.ZodTypeAny>(
  path: string,
  params: Record<string, string>,
  schema: T,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new YouTubeConfigError('YOUTUBE_API_KEY is not set.');
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', key);
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    // Never surface the key; the URL contains it, so only the status and API message are reported.
    if (response.status === 403 && /quota/i.test(body))
      throw new Error('Collector hit the YouTube API quota.');
    if (response.status === 400 || response.status === 403)
      throw new Error(`Collector was rejected by the YouTube API (${response.status}).`);
    throw new Error(`Collector received HTTP ${response.status} from the YouTube API.`);
  }
  return schema.parse(await response.json());
}

/** Accepts a bare @handle, a legacy username or a UC… channel ID. */
async function resolveChannel(handle: string, signal?: AbortSignal) {
  const clean = handle.trim().replace(/^@/, '');
  if (/^UC[\w-]{20,}$/.test(clean)) {
    const byId = await call(
      'channels',
      { part: 'snippet,statistics,contentDetails', id: clean },
      channelSchema,
      signal,
    );
    return { response: byId, via: 'id' as const, quota: 1 };
  }
  const byHandle = await call(
    'channels',
    { part: 'snippet,statistics,contentDetails', forHandle: `@${clean}` },
    channelSchema,
    signal,
  );
  if (byHandle.items.length) return { response: byHandle, via: 'handle' as const, quota: 1 };
  const byUsername = await call(
    'channels',
    { part: 'snippet,statistics,contentDetails', forUsername: clean },
    channelSchema,
    signal,
  );
  return { response: byUsername, via: 'username' as const, quota: 2 };
}

export function youtubeCollector(asOf = new Date()): Collector {
  return {
    platform: 'youtube',
    async collect(handle, { postsLimit, signal }) {
      signal?.throwIfAborted();
      const warnings: string[] = [];
      const fetchedAt = asOf.toISOString();
      const base = {
        posts: [] as NormalizedPost[],
        costUsd: 0,
        fetchedAt,
        sampleComplete: false,
        subscriberHidden: false,
      };

      const { response: channelResponse, via, quota } = await resolveChannel(handle, signal);
      const channel = channelResponse.items[0];
      if (!channel)
        return resultSchema.parse({
          ...base,
          status: 'not_found',
          profile: null,
          raw: { source: 'youtube.v3', via, channel: channelResponse },
          warnings: ['No YouTube channel matched this handle. It may not exist or may have been renamed.'],
        });
      if (via === 'username')
        warnings.push('Resolved through a legacy YouTube username; confirm this is the intended channel.');

      const stats = channel.statistics;
      const hidden = stats?.hiddenSubscriberCount === true;
      if (hidden) warnings.push('Subscriber count is hidden on this channel.');

      const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
      const want = Math.min(Math.max(postsLimit, 1), PAGE);
      let playlistResponse: z.infer<typeof playlistItemsSchema> = { items: [] };
      let videosResponse: z.infer<typeof videosSchema> = { items: [] };
      let calls = quota;

      if (!uploads) {
        warnings.push('This channel exposes no uploads playlist; video activity is not measured.');
      } else {
        playlistResponse = await call(
          'playlistItems',
          { part: 'contentDetails', playlistId: uploads, maxResults: String(want) },
          playlistItemsSchema,
          signal,
        );
        calls++;
        const ids = playlistResponse.items
          .map((i) => i.contentDetails?.videoId)
          .filter((id): id is string => !!id);
        if (ids.length) {
          // One batched videos.list call for every fetched upload, as the brief requires.
          videosResponse = await call(
            'videos',
            { part: 'snippet,statistics,contentDetails', id: ids.join(',') },
            videosSchema,
            signal,
          );
          calls++;
        }
      }

      const published = new Map(
        playlistResponse.items
          .filter((i) => i.contentDetails?.videoId)
          .map((i) => [i.contentDetails!.videoId!, i.contentDetails!.videoPublishedAt ?? null]),
      );
      let shorts = 0;
      const posts: NormalizedPost[] = videosResponse.items.map((video) => {
        const seconds = durationSeconds(video.contentDetails?.duration);
        const isShort = seconds !== null && seconds <= 60;
        if (isShort) shorts++;
        const at = video.snippet?.publishedAt ?? published.get(video.id) ?? null;
        return {
          id: video.id,
          url: `https://www.youtube.com/watch?v=${video.id}`,
          publishedAt: at && Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : null,
          type: isShort ? 'reel' : 'video',
          likes: count(video.statistics?.likeCount),
          comments: count(video.statistics?.commentCount),
          shares: null,
          views: count(video.statistics?.viewCount),
          isPinned: false,
          captionPreview: video.snippet?.title?.slice(0, 180) ?? null,
        };
      });

      const totalVideos = count(stats?.videoCount);
      // The sample is complete only when every upload the channel reports was actually fetched.
      const sampleComplete =
        totalVideos !== null && posts.length >= totalVideos && !playlistResponse.nextPageToken;
      if (!sampleComplete && posts.length)
        warnings.push(
          `Fetched the ${posts.length} most recent uploads of ${totalVideos ?? 'an unknown number of'} total.`,
        );
      if (shorts)
        warnings.push(
          'Short-form classification uses video duration (60 seconds or less), not the platform Shorts flag.',
        );
      if (posts.some((p) => p.likes === null))
        warnings.push('Some videos hide their like count; those are excluded from averages.');

      const thumbs = channel.snippet?.thumbnails;
      const avatar = thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null;
      const status: CollectorResult['status'] = uploads && posts.length ? 'ok' : 'partial';

      return resultSchema.parse({
        ...base,
        status,
        subscriberHidden: hidden,
        sampleComplete,
        posts,
        warnings,
        profile: {
          handle,
          displayName: channel.snippet?.title ?? null,
          url: channel.snippet?.customUrl
            ? `https://www.youtube.com/${channel.snippet.customUrl}`
            : profileUrl('youtube', channel.id),
          followers: hidden ? null : count(stats?.subscriberCount),
          following: null,
          totalPosts: totalVideos,
          verified: null,
          isBusiness: null,
          category: null,
          bio: channel.snippet?.description ?? null,
          bioLink: null,
          avatarUrl: avatar,
        },
        raw: {
          source: 'youtube.v3',
          via,
          quotaUnits: calls,
          channelId: channel.id,
          channel: channelResponse,
          playlistItems: playlistResponse,
          videos: videosResponse,
        },
      });
    },
  };
}
