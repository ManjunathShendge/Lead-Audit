import { runActor } from './apify';
import { FieldPicker } from './fields';
import { gbpResultSchema, type GbpDetail, type GbpResult } from './channel-types';

/**
 * Google Business Profile via Apify `compass/crawler-google-places`.
 * Field names verified against fixtures/gbp/raw-live-tier2-digital.json (28 September 2026, $0.0092).
 * Reviewer personal data is switched off; only stars, date and whether the owner replied are kept.
 */
export const GBP_REVIEWS = 10;

export function gbpInput(query: string) {
  const isUrl = /^https?:\/\//i.test(query);
  return {
    ...(isUrl ? { startUrls: [{ url: query }] } : { searchStringsArray: [query] }),
    maxCrawledPlacesPerSearch: 1,
    language: 'en',
    ...(process.env.GBP_COUNTRY_CODE ? { countryCode: process.env.GBP_COUNTRY_CODE } : {}),
    maxReviews: GBP_REVIEWS,
    reviewsSort: 'newest',
    scrapeReviewsPersonalData: false,
    maxImages: 0,
    scrapePlaceDetailPage: false,
  };
}

export function normalizeGbp(
  items: Record<string, unknown>[],
  meta: { costUsd: number | null; fetchedAt: string },
): GbpResult {
  const place = items.find((i) => i && typeof i === 'object' && ('title' in i || 'placeId' in i));
  if (!place)
    return gbpResultSchema.parse({
      kind: 'gbp',
      status: 'not_found',
      detail: null,
      raw: items,
      costUsd: meta.costUsd,
      warnings: ['No Google Business Profile matched the search.'],
      fetchedAt: meta.fetchedAt,
    });
  const f = new FieldPicker(place);
  const reviewCount = f.number('review count', ['reviewsCount', 'reviews_count', 'userRatingCount']);
  // A place with no reviews has no rating; a 0 would otherwise score as a terrible one.
  const rating = reviewCount === 0 ? null : f.number('rating', ['totalScore', 'rating', 'stars']);
  const dist = f.raw('rating distribution', ['reviewsDistribution']);
  const distribution =
    dist && typeof dist === 'object'
      ? (() => {
          const d = dist as Record<string, unknown>;
          const keys = ['oneStar', 'twoStar', 'threeStar', 'fourStar', 'fiveStar'] as const;
          const values = keys.map((k) => (typeof d[k] === 'number' ? (d[k] as number) : null));
          return values.every((v) => v !== null)
            ? { one: values[0]!, two: values[1]!, three: values[2]!, four: values[3]!, five: values[4]! }
            : null;
        })()
      : null;
  const hours = f.raw('opening hours', ['openingHours']);
  const phone = f.text('phone', ['phone', 'phoneUnformatted']);
  const website = f.text('website', ['website']);
  const photos = f.number('photo count', ['imagesCount', 'photosCount']);
  const reviewsRaw = f.raw('reviews', ['reviews']);
  const reviews = Array.isArray(reviewsRaw) ? (reviewsRaw as Record<string, unknown>[]) : null;
  const latestReviews = (reviews ?? [])
    .map((r) => {
      const rf = new FieldPicker(r);
      return {
        stars: rf.number('stars', ['stars', 'rating']),
        publishedAt: rf.date('date', ['publishedAtDate', 'publishedAt']),
        ownerReplied: !!(rf.text('reply', ['responseFromOwnerText']) ?? '').trim(),
      };
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? '0') - Date.parse(a.publishedAt ?? '0'))
    .slice(0, GBP_REVIEWS);
  const closed = f.bool('permanently closed', ['permanentlyClosed']);
  const detail: GbpDetail = {
    name: f.text('name', ['title', 'name']),
    url: f.url('url', ['url']),
    address: f.text('address', ['address']),
    category: f.text('category', ['categoryName', 'categories.0']),
    rating,
    reviewCount,
    distribution,
    // The actor emits an empty array or string when a field is unset, which is a real "missing".
    hasHours: hours === undefined ? null : Array.isArray(hours) ? hours.length > 0 : false,
    hasPhone: phone === null ? null : !!phone.trim(),
    hasWebsite: website === null ? null : !!website.trim(),
    photoCount: photos,
    closed,
    latestReviews,
  };
  const warnings = f.warnings('Google Business Profile');
  if (reviews === null && (reviewCount ?? 0) > 0)
    warnings.push('Reviews were not returned; owner replies are not measured.');
  if (closed) warnings.push('Google lists this business as permanently closed.');
  const searched = typeof place.searchString === 'string' ? place.searchString : null;
  if (searched)
    warnings.push(
      `Matched "${detail.name ?? 'unknown'}" for the search "${searched}". Confirm it is the right business.`,
    );
  return gbpResultSchema.parse({
    kind: 'gbp',
    status: f.missing.length ? 'partial' : 'ok',
    detail,
    raw: items,
    costUsd: meta.costUsd,
    warnings,
    fetchedAt: meta.fetchedAt,
  });
}

export async function collectGbp(query: string, asOf: Date, signal?: AbortSignal): Promise<GbpResult> {
  const actor = process.env.APIFY_ACTOR_GBP ?? '';
  const { items, costUsd } = await runActor(actor, gbpInput(query), { signal }).catch((e: unknown) => {
    throw new Error(
      `Collector for Google Business Profile failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown error'}`,
    );
  });
  return normalizeGbp(items, { costUsd, fetchedAt: asOf.toISOString() });
}
