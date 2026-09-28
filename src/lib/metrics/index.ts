import type { CollectorResult, NormalizedPost, NormalizedProfile } from '../collectors/types';
const DAY = 86400000;
export function average(values: (number | null)[]): number | null {
  const known = values.filter((n): n is number => n !== null && Number.isFinite(n) && n >= 0);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}
export function engagementRate(likes: number | null, comments: number | null, followers: number | null) {
  return likes === null || comments === null || followers === null || followers <= 0
    ? null
    : ((likes + comments) / followers) * 100;
}
export function checklist(values: (boolean | null)[]) {
  const known = values.filter((v): v is boolean => v !== null);
  return known.length ? (known.filter(Boolean).length / known.length) * 100 : null;
}
export function profileCompleteness(profile: NormalizedProfile | null) {
  if (!profile) return null;
  const present = (v: string | null) => (v === null ? null : !!v.trim());
  return checklist([
    present(profile.bio),
    present(profile.bioLink),
    profile.isBusiness === true || !!profile.category ? true : profile.isBusiness === false ? false : null,
    present(profile.avatarUrl),
  ]);
}
export function datedPosts(posts: NormalizedPost[], asOf: Date) {
  return posts
    .filter(
      (p) =>
        !p.isPinned &&
        p.publishedAt !== null &&
        Number.isFinite(Date.parse(p.publishedAt)) &&
        Date.parse(p.publishedAt) <= asOf.getTime(),
    )
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
}
export function frequency(posts: NormalizedPost[], asOf: Date, sampleComplete: boolean) {
  const dated = datedPosts(posts, asOf);
  const recent = dated.filter((p) => Date.parse(p.publishedAt!) >= asOf.getTime() - 30 * DAY);
  const unknownDates = posts.some(
    (p) =>
      !p.isPinned &&
      (!p.publishedAt ||
        !Number.isFinite(Date.parse(p.publishedAt)) ||
        Date.parse(p.publishedAt) > asOf.getTime()),
  );
  const count = dated.length ? recent.length : posts.length === 0 && sampleComplete ? 0 : null;
  return {
    count,
    lowerBound:
      count !== null &&
      (unknownDates ||
        (dated.length > 0 && recent.length === dated.length) ||
        (!sampleComplete && !dated.some((p) => Date.parse(p.publishedAt!) < asOf.getTime() - 30 * DAY))),
    lastPost: dated[0]?.publishedAt ?? null,
  };
}
export function longestGap(posts: NormalizedPost[], asOf: Date, sampleComplete: boolean): number | null {
  const dated = datedPosts(posts, asOf);
  if (!dated.length) return posts.length === 0 && sampleComplete ? 90 : null;
  const days = dated.map((p) => (asOf.getTime() - Date.parse(p.publishedAt!)) / DAY).filter((n) => n <= 90);
  if (!days.length) return 90;
  return Math.max(days[0], ...days.slice(1).map((n, i) => n - days[i]));
}
export function contentMix(posts: NormalizedPost[]) {
  if (!posts.length) return null;
  const video = posts.filter((p) => p.type === 'reel' || p.type === 'video').length;
  return { video, static: posts.length - video, videoPercent: (video / posts.length) * 100 };
}
export function topPosts(posts: NormalizedPost[]) {
  return posts
    .filter((p) => p.likes !== null && p.comments !== null)
    .sort((a, b) => b.likes! + b.comments! - (a.likes! + a.comments!))
    .slice(0, 3);
}
export function dayKey(date: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}
export function calendar(posts: NormalizedPost[], asOf: Date) {
  const counts = new Map<string, number>();
  datedPosts(posts, asOf).forEach((p) => {
    const key = dayKey(p.publishedAt!);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from({ length: 90 }, (_, i) => {
    const date = dayKey(new Date(asOf.getTime() - (89 - i) * DAY));
    return { date, count: counts.get(date) ?? 0 };
  });
}
export function computeMetrics(result: CollectorResult, asOf: Date) {
  const usable = ['ok', 'partial'].includes(result.status) && result.profile !== null;
  const posts = usable ? result.posts : [];
  const recency = usable
    ? frequency(posts, asOf, result.sampleComplete)
    : { count: null, lowerBound: false, lastPost: null };
  const avgLikes = average(posts.map((p) => p.likes)),
    avgComments = average(posts.map((p) => p.comments));
  const notes = [...result.warnings];
  if (recency.lowerBound)
    notes.push(
      'Posting frequency is a lower bound; the fetched sample does not establish the full 30-day count.',
    );
  if (!result.sampleComplete && usable)
    notes.push(
      'The 90-day calendar and longest gap describe observed posts only; unsampled days are not confirmed inactivity.',
    );
  if (posts.some((p) => p.isPinned))
    notes.push('Pinned posts excluded from recency, frequency and calendar.');
  if (posts.some((p) => p.likes === null))
    notes.push('Hidden or unavailable likes excluded from averages and top-post rankings.');
  if (posts.some((p) => p.publishedAt === null))
    notes.push('Undated posts excluded from date-based metrics.');
  if (usable && posts.length && datedPosts(posts, asOf).length === 0)
    notes.push('No usable non-pinned dates; activity is not measured.');
  if (result.profile?.followers === 0) notes.push('Zero followers: engagement rate is undefined.');
  if (usable && profileCompleteness(result.profile) === null)
    notes.push('Profile completeness is not measured.');
  return {
    ...recency,
    longestGap: usable ? longestGap(posts, asOf, result.sampleComplete) : null,
    avgLikes,
    avgComments,
    engagement: engagementRate(avgLikes, avgComments, result.profile?.followers ?? null),
    completeness: usable ? profileCompleteness(result.profile) : null,
    mix: contentMix(posts),
    top: topPosts(posts),
    calendar: usable ? calendar(posts, asOf) : null,
    notes,
  };
}
export type Metrics = ReturnType<typeof computeMetrics>;
