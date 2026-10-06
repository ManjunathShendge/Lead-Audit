import type { Browser, BrowserContext } from 'playwright-core';
import { openBrowser } from '../browser';
import { assertPublicUrl, isPrivateAddress } from './net';

/** Longest a crawl may hold a remote browser: the 180 second collector timeout plus margin. */
const SESSION_MS = 200_000;

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * A headless context whose every request is checked: documents must resolve to public addresses,
 * subresources may not target literal private hosts, and heavy media is never downloaded.
 * `onRequest` sees every URL the page asked for, including blocked ones (used for tag detection).
 */
export async function launchGuarded(
  timeoutMs: number,
  onRequest?: (url: string) => void,
): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await openBrowser(SESSION_MS);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: USER_AGENT,
      reducedMotion: 'reduce',
      javaScriptEnabled: true,
    });
    context.setDefaultTimeout(timeoutMs);
    const hostAllowed = new Map<string, boolean>();
    await context.route('**/*', async (route) => {
      const request = route.request();
      onRequest?.(request.url());
      const url = new URL(request.url());
      if (['image', 'media', 'font'].includes(request.resourceType())) return route.abort();
      if (!['http:', 'https:'].includes(url.protocol)) return route.abort();
      const host = url.hostname.toLowerCase();
      let allowed = hostAllowed.get(host);
      if (allowed === undefined) {
        allowed = request.resourceType() === 'document' ? await isPublicHost(host) : !isLiteralPrivate(host);
        hostAllowed.set(host, allowed);
      }
      return allowed ? route.continue() : route.abort();
    });
    return { browser, context };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

function isLiteralPrivate(host: string) {
  return host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host);
}

async function isPublicHost(host: string) {
  try {
    await assertPublicUrl(`https://${host}/`);
    return true;
  } catch {
    return false;
  }
}
