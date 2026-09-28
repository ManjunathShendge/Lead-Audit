import { mockCollector } from './mock';
import { instagramCollector } from './instagram';
import { youtubeCollector } from './youtube';
import { facebookCollector } from './facebook';
import { linkedinCollector } from './linkedin';
import { platforms, type Collector, type Platform } from './types';

export type Mode = 'mock' | 'live';

/** Collector failure messages must start with "Collector" so the queue surfaces them verbatim. */
export class CollectorUnavailableError extends Error {}

export function currentMode(): Mode {
  return process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'live';
}

/**
 * Which live collectors are wired and configured right now.
 * Facebook and LinkedIn stay unavailable until their actors are proposed and approved (milestone 9).
 */
export function liveAvailability(): Record<Platform, { ready: boolean; reason: string | null }> {
  const state = (ready: boolean, reason: string) => ({ ready, reason: ready ? null : reason });
  return {
    instagram: state(
      !!process.env.APIFY_TOKEN && !!process.env.APIFY_ACTOR_INSTAGRAM,
      'APIFY_TOKEN or APIFY_ACTOR_INSTAGRAM is not set.',
    ),
    youtube: state(!!process.env.YOUTUBE_API_KEY, 'YOUTUBE_API_KEY is not set.'),
    facebook: state(
      !!process.env.APIFY_TOKEN &&
        !!process.env.APIFY_ACTOR_FACEBOOK &&
        !!process.env.APIFY_ACTOR_FACEBOOK_POSTS,
      'Facebook needs APIFY_TOKEN, APIFY_ACTOR_FACEBOOK (page) and APIFY_ACTOR_FACEBOOK_POSTS.',
    ),
    linkedin: state(
      !!process.env.APIFY_TOKEN &&
        !!process.env.APIFY_ACTOR_LINKEDIN &&
        !!process.env.APIFY_ACTOR_LINKEDIN_POSTS,
      'LinkedIn needs APIFY_TOKEN, APIFY_ACTOR_LINKEDIN (company) and APIFY_ACTOR_LINKEDIN_POSTS.',
    ),
  };
}

export function liveReadyPlatforms(): Platform[] {
  const availability = liveAvailability();
  return platforms.filter((p) => availability[p].ready);
}

export function getCollector(
  platform: Platform,
  mode: Mode,
  tier: 'strong' | 'average' | 'weak',
  asOf: Date,
): Collector {
  if (mode === 'mock') {
    if (currentMode() !== 'mock')
      throw new CollectorUnavailableError(
        'Collector refused: this audit is a mock audit but the server is in live mode.',
      );
    return mockCollector(platform, tier, asOf);
  }
  if (currentMode() !== 'live')
    throw new CollectorUnavailableError(
      'Collector refused: this audit is a live audit but the server is in mock mode.',
    );
  const availability = liveAvailability()[platform];
  if (!availability.ready)
    throw new CollectorUnavailableError(
      `Collector for ${platform} is not configured. ${availability.reason}`,
    );
  switch (platform) {
    case 'instagram':
      return instagramCollector(asOf);
    case 'youtube':
      return youtubeCollector(asOf);
    case 'facebook':
      return facebookCollector(asOf);
    case 'linkedin':
      return linkedinCollector(asOf);
  }
}
