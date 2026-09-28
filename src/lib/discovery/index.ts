import { chromium, type Browser } from 'playwright';
import { extractHandles, missingPlatforms, type ExtractResult } from './extract';
import { assertPublicUrl, isPrivateAddress } from './net';

export { UnsafeUrlError } from './net';
export type { Discovered, ExtractResult } from './extract';

/** Homepage first; the rest are only visited while a platform is still missing. */
const FOLLOW_UP_PATHS = ['/contact', '/contact-us', '/about', '/about-us'];
const MAX_PAGES = 4;
const PAGE_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 75_000;
const MAX_CONCURRENT = 2;

let active = 0;
export class DiscoveryBusyError extends Error {}

export type DiscoveryResult = ExtractResult & {
  website: string;
  brand: string | null;
  pagesVisited: string[];
  warnings: string[];
};

type PageHarvest = { links: string[]; siteName: string | null; title: string | null };

export async function discoverFromWebsite(input: string): Promise<DiscoveryResult> {
  const start = new URL((await assertPublicUrl(normalizeInput(input))).href);
  if (active >= MAX_CONCURRENT) throw new DiscoveryBusyError('Discovery is busy. Please try again shortly.');
  active++;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const warnings: string[] = [];
  const pagesVisited: string[] = [];
  let result: ExtractResult = { handles: {}, other: [] };
  let brand: string | null = null;
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      reducedMotion: 'reduce',
      javaScriptEnabled: true,
    });
    context.setDefaultTimeout(PAGE_TIMEOUT_MS);

    const hostAllowed = new Map<string, boolean>();
    await context.route('**/*', async (route) => {
      const request = route.request();
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

    const page = await context.newPage();
    const targets = [start.href, ...FOLLOW_UP_PATHS.map((p) => new URL(p, start).href)];

    for (const target of targets) {
      if (pagesVisited.length >= MAX_PAGES) break;
      if (pagesVisited.length && !missingPlatforms(result).length) break;
      if (Date.now() > deadline) {
        warnings.push('Discovery stopped at its time budget; some pages were not checked.');
        break;
      }
      const harvest = await visit(page, target);
      if (!harvest) {
        if (target === start.href) throw new Error('The website could not be loaded.');
        continue;
      }
      pagesVisited.push(page.url());
      result = extractHandles(harvest.links, result);
      if (!brand) brand = cleanBrand(harvest.siteName ?? harvest.title);
    }

    for (const [platform, found] of Object.entries(result.handles))
      if (found?.note) warnings.push(`${platform}: ${found.note}`);
    if (result.other.length)
      warnings.push(
        `Found ${result.other.map((o) => `x.com/${o.handle}`).join(', ')}, which this version does not audit.`,
      );
    const missing = missingPlatforms(result);
    if (missing.length)
      warnings.push(
        `No link found for ${missing.join(', ')} on ${pagesVisited.length} page(s). Absence of a link is not proof the account does not exist.`,
      );

    return { ...result, website: start.origin, brand, pagesVisited, warnings };
  } finally {
    try {
      await browser?.close();
    } finally {
      active--;
    }
  }
}

async function visit(page: import('playwright').Page, target: string): Promise<PageHarvest | null> {
  try {
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    if (!response || response.status() >= 400) return null;
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    return await page.evaluate(() => ({
      links: Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href),
      siteName:
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || null,
      title: document.title?.trim() || null,
    }));
  } catch {
    return null;
  }
}

function normalizeInput(input: string) {
  const text = input.trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
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

/** "Acme Co. | Best widgets in Bengaluru" -> "Acme Co." */
export function cleanBrand(value: string | null): string | null {
  if (!value) return null;
  const head = value.split(/\s[|–—·:]\s|\s-\s/)[0].trim();
  const brand = (head.length >= 2 ? head : value.trim()).slice(0, 100);
  return brand || null;
}
