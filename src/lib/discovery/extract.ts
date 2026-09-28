import { platforms, type Platform } from '../collectors/types';

export type Discovered = { handle: string; url: string; note?: string };
export type ExtractResult = {
  handles: Partial<Record<Platform, Discovered>>;
  other: Discovered[];
};

const HOSTS: Record<Platform, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com)$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
  youtube: /(^|\.)(youtube\.com|youtu\.be)$/i,
};
const X_HOST = /(^|\.)(x\.com|twitter\.com)$/i;

// Path segments that indicate a share, intent, post or platform-internal page rather than a profile.
const SHARE = new Set([
  'share',
  'sharer',
  'sharer.php',
  'share.php',
  'intent',
  'dialog',
  'plugins',
  'sharearticle',
  'sharing',
  'shareopengraph',
]);
const RESERVED: Record<Platform, Set<string>> = {
  instagram: new Set([
    'p',
    'reel',
    'reels',
    'stories',
    'explore',
    'tv',
    'accounts',
    'direct',
    'about',
    'legal',
    'developer',
    'privacy',
    'help',
    'emails',
    'challenge',
    'session',
  ]),
  facebook: new Set([
    'story.php',
    'permalink.php',
    'photo.php',
    'photo',
    'watch',
    'groups',
    'events',
    'marketplace',
    'login',
    'help',
    'policies',
    'business',
    'hashtag',
    'notes',
    'media',
    'video.php',
    'people',
    'public',
    'bookmarks',
    'pg',
  ]),
  linkedin: new Set([
    'in',
    'feed',
    'posts',
    'pulse',
    'jobs',
    'learning',
    'showcase',
    'school',
    'groups',
    'events',
    'newsletters',
  ]),
  youtube: new Set([
    'watch',
    'shorts',
    'playlist',
    'embed',
    'results',
    'feed',
    'hashtag',
    'account',
    'redirect',
    'oembed',
    'post',
    'live',
    'source',
  ]),
};

const HANDLE_OK = /^[a-zA-Z0-9_.-]{1,100}$/;

function cleanSegment(value: string) {
  return decodeURIComponent(value).trim().replace(/^@/, '');
}

/** Map one absolute URL to a platform handle, or null when it is not a usable public profile link. */
export function handleFromUrl(url: URL): { platform: Platform | 'x'; found: Discovered } | null {
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean).map(cleanSegment);
  const lower = parts.map((p) => p.toLowerCase());
  if (lower.some((p) => SHARE.has(p))) return null;
  if (url.searchParams.has('u') || url.searchParams.has('text')) return null;

  const platform = platforms.find((p) => HOSTS[p].test(host));
  if (!platform) {
    if (!X_HOST.test(host)) return null;
    const handle = parts[0];
    if (!handle || RESERVED.instagram.has(lower[0]) || !HANDLE_OK.test(handle)) return null;
    return { platform: 'x', found: { handle: handle.toLowerCase(), url: url.href } };
  }
  if (lower.some((p) => RESERVED[platform].has(p)) && platform !== 'linkedin') return null;

  if (platform === 'linkedin') {
    if (lower[0] !== 'company' || !parts[1]) return null;
    const handle = parts[1];
    return HANDLE_OK.test(handle)
      ? { platform, found: { handle: handle.toLowerCase(), url: url.href } }
      : null;
  }

  if (platform === 'youtube') {
    if (host === 'youtu.be') return null;
    if (lower[0] === 'channel' && parts[1]?.startsWith('UC'))
      return HANDLE_OK.test(parts[1]) ? { platform, found: { handle: parts[1], url: url.href } } : null;
    if (parts.length === 1 && url.pathname.startsWith('/@')) {
      const handle = parts[0];
      return HANDLE_OK.test(handle)
        ? { platform, found: { handle: handle.toLowerCase(), url: url.href } }
        : null;
    }
    // Legacy custom URLs are not @handles; keep them but flag that they need confirmation.
    if ((lower[0] === 'c' || lower[0] === 'user') && parts[1] && HANDLE_OK.test(parts[1]))
      return {
        platform,
        found: {
          handle: parts[1].toLowerCase(),
          url: url.href,
          note: 'Legacy YouTube custom URL. Confirm the @handle or channel ID before running.',
        },
      };
    return null;
  }

  if (platform === 'facebook') {
    if (lower[0] === 'profile.php') {
      const id = url.searchParams.get('id');
      return id && HANDLE_OK.test(id) ? { platform, found: { handle: id, url: url.href } } : null;
    }
    // facebook.com/pages/<name>/<numeric id> — the id is the stable identifier.
    if (lower[0] === 'pages') {
      const id = parts.at(-1);
      return id && /^\d+$/.test(id) ? { platform, found: { handle: id, url: url.href } } : null;
    }
  }

  if (parts.length !== 1) return null;
  const handle = parts[0];
  if (!HANDLE_OK.test(handle)) return null;
  return { platform, found: { handle: handle.toLowerCase(), url: url.href } };
}

/**
 * Reduce a page's links to at most one profile per platform.
 * The first usable link wins, which favours header/nav links over footer duplicates.
 */
export function extractHandles(links: string[], seed?: ExtractResult): ExtractResult {
  const result: ExtractResult = { handles: { ...seed?.handles }, other: [...(seed?.other ?? [])] };
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    const match = handleFromUrl(url);
    if (!match) continue;
    if (match.platform === 'x') {
      if (!result.other.some((o) => o.handle === match.found.handle)) result.other.push(match.found);
      continue;
    }
    if (!result.handles[match.platform]) result.handles[match.platform] = match.found;
  }
  return result;
}

export function missingPlatforms(result: ExtractResult): Platform[] {
  return platforms.filter((p) => !result.handles[p]);
}
