import { z } from 'zod';
import type { Window } from '../period';
export const platforms = ['instagram', 'facebook', 'linkedin', 'youtube'] as const;
export const platformSchema = z.enum(platforms);
export type Platform = z.infer<typeof platformSchema>;
export const countSchema = z.number().finite().nonnegative().nullable();
const nullableText = z.string().nullable();
export const profileSchema = z.object({
  handle: z.string(),
  displayName: nullableText,
  url: z.url(),
  followers: countSchema,
  following: countSchema,
  totalPosts: countSchema,
  verified: z.boolean().nullable(),
  isBusiness: z.boolean().nullable(),
  category: nullableText,
  bio: nullableText,
  bioLink: z.url().nullable(),
  avatarUrl: z.url().nullable(),
});
export const postSchema = z.object({
  id: z.string(),
  url: z.url().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  type: z.enum(['image', 'video', 'carousel', 'reel', 'text', 'link']),
  likes: countSchema,
  comments: countSchema,
  shares: countSchema,
  views: countSchema,
  isPinned: z.boolean(),
  captionPreview: nullableText,
  /** Fuller post text (up to 1,000 characters) for audience-alignment analysis. Absent on older audits. */
  caption: nullableText.optional(),
});
export const resultSchema = z.object({
  status: z.enum(['ok', 'partial', 'not_found', 'private', 'failed']),
  profile: profileSchema.nullable(),
  posts: z.array(postSchema),
  raw: z.unknown(),
  costUsd: countSchema,
  warnings: z.array(z.string()),
  fetchedAt: z.iso.datetime(),
  sampleComplete: z.boolean(),
  subscriberHidden: z.boolean().default(false),
});
export type NormalizedProfile = z.infer<typeof profileSchema>;
export type NormalizedPost = z.infer<typeof postSchema>;
export type CollectorResult = z.infer<typeof resultSchema>;
export interface Collector {
  platform: Platform | 'x';
  /** `window` asks for posts published in a chosen period instead of the most recent ones. */
  collect(
    handle: string,
    opts: { postsLimit: number; signal?: AbortSignal; window?: Window },
  ): Promise<CollectorResult>;
}
export const platformNames: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};
export function profileUrl(platform: Platform, handle: string) {
  return {
    instagram: `https://www.instagram.com/${handle}/`,
    facebook: `https://www.facebook.com/${handle}`,
    linkedin: `https://www.linkedin.com/company/${handle}/`,
    youtube: handle.startsWith('UC')
      ? `https://www.youtube.com/channel/${handle}`
      : `https://www.youtube.com/@${handle}`,
  }[platform];
}
