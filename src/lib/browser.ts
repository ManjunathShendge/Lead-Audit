import { chromium, type Browser } from 'playwright-core';

const DEFAULT_BROWSERLESS_URL = 'wss://production-sfo.browserless.io';

/** True when crawling and PDF printing run on Browserless instead of a local Chromium. */
export function remoteBrowserConfigured() {
  return !!process.env.BROWSERLESS_TOKEN?.trim();
}

/**
 * Opens a Chromium for one crawl or one PDF. With BROWSERLESS_TOKEN set it connects to Browserless over
 * CDP (tolerant of Playwright version differences), so the host needs no browser installed; without it,
 * it launches the local Chromium that Docker and local development provide.
 * `sessionMs` caps the remote session so a stuck page cannot keep a paid browser open.
 */
export async function openBrowser(sessionMs: number): Promise<Browser> {
  const token = process.env.BROWSERLESS_TOKEN?.trim();
  if (!token) return chromium.launch({ headless: true });
  const endpoint = new URL(process.env.BROWSERLESS_URL?.trim() || DEFAULT_BROWSERLESS_URL);
  endpoint.searchParams.set('token', token);
  endpoint.searchParams.set('timeout', String(Math.round(sessionMs)));
  try {
    return await chromium.connectOverCDP(endpoint.href, { timeout: 30_000 });
  } catch (error) {
    // Never log the endpoint itself: it carries the token.
    console.error(
      JSON.stringify({
        event: 'browser.connect_failed',
        host: endpoint.host,
        message: error instanceof Error ? error.message.replace(token, '***').slice(0, 300) : String(error),
      }),
    );
    throw new Error('Remote browser is unavailable. Check BROWSERLESS_TOKEN and BROWSERLESS_URL.');
  }
}
