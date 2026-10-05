import { ApifyClient } from 'apify-client';

/** Apify actor that turns one web page into markdown. Override with APIFY_ACTOR_SITE_TEXT. */
const ACTOR = () => process.env.APIFY_ACTOR_SITE_TEXT || 'apify/rag-web-browser';
const SITE_TEXT_LIMIT = 6000;
/** Below this many characters the page is treated as unread (a bot wall, or content drawn by scripts). */
export const MIN_SITE_TEXT = 200;

export function siteTextAvailable() {
  return !!process.env.APIFY_TOKEN;
}

type PageItem = { markdown?: string; metadata?: { title?: string; description?: string; url?: string } };

/**
 * Reads a website's homepage through Apify for the audience suggestion.
 * Plain HTTP first (fast, cheap); a real browser only when that returns too little text.
 * Every run carries its own timeout, so a slow site can never leave a paid run going.
 * Returns '' when the page cannot be read; never throws.
 */
export async function fetchSiteText(website: string): Promise<{ text: string; costUsd: number | null }> {
  const token = process.env.APIFY_TOKEN;
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return { text: '', costUsd: null };
  }
  if (!token || !['http:', 'https:'].includes(url.protocol)) return { text: '', costUsd: null };

  const client = new ApifyClient({ token });
  let cost: number | null = null;
  for (const [scrapingTool, seconds] of [
    ['raw-http', 45],
    ['browser-playwright', 90],
  ] as const) {
    try {
      const run = await client.actor(ACTOR()).call(
        {
          query: url.href,
          maxResults: 1,
          outputFormats: ['markdown'],
          scrapingTool,
          requestTimeoutSecs: seconds - 10,
        },
        { timeout: seconds, waitSecs: seconds + 15, log: null },
      );
      if (typeof run.usageTotalUsd === 'number') cost = (cost ?? 0) + run.usageTotalUsd;
      if (run.status !== 'SUCCEEDED') continue;
      const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
      const text = pageText(url.href, items[0] as PageItem | undefined);
      if (text.length >= MIN_SITE_TEXT) return { text, costUsd: cost };
    } catch {
      /* try the next mode */
    }
  }
  return { text: '', costUsd: cost };
}

/** Markdown to the same "Page / Title / Description / Text" shape the discovery crawl produces. */
export function pageText(href: string, item: PageItem | undefined) {
  if (!item?.markdown) return '';
  const body = item.markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their words
    .replace(/[*_`]+/g, '') // emphasis markers
    .replace(/[#>|]+/g, ' ') // headings, quotes, table bars
    .replace(/\s+/g, ' ')
    .trim();
  return [
    `Page: ${item.metadata?.url ?? href}`,
    item.metadata?.title && `Title: ${item.metadata.title}`,
    item.metadata?.description && `Description: ${item.metadata.description}`,
    body && `Text: ${body}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, SITE_TEXT_LIMIT);
}
