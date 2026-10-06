import type { Browser } from 'playwright-core';
import { launchGuarded } from './browser';
import { extractHandles, missingPlatforms, type ExtractResult } from './extract';
import { assertPublicUrl } from './net';

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
  /** Words from the visited pages, used to suggest a target audience. Never shown as-is. */
  siteText: string;
};

type PageHarvest = {
  links: string[];
  siteName: string | null;
  title: string | null;
  description: string | null;
  headings: string[];
  body: string;
};
const SITE_TEXT_LIMIT = 6000;

export async function discoverFromWebsite(input: string): Promise<DiscoveryResult> {
  const start = new URL((await assertPublicUrl(normalizeInput(input))).href);
  if (active >= MAX_CONCURRENT) throw new DiscoveryBusyError('Discovery is busy. Please try again shortly.');
  active++;
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const warnings: string[] = [];
  const pagesVisited: string[] = [];
  let result: ExtractResult = { handles: {}, other: [] };
  let brand: string | null = null;
  let siteText = '';
  let browser: Browser | undefined;

  try {
    let context;
    ({ browser, context } = await launchGuarded(PAGE_TIMEOUT_MS));

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
      siteText = [
        siteText,
        `Page: ${page.url()}`,
        harvest.title && `Title: ${harvest.title}`,
        harvest.description && `Description: ${harvest.description}`,
        harvest.headings.length ? `Headings: ${harvest.headings.join(' | ')}` : null,
        harvest.body && `Text: ${harvest.body}`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, SITE_TEXT_LIMIT);
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

    return { ...result, website: start.origin, brand, pagesVisited, warnings, siteText: siteText.trim() };
  } finally {
    try {
      await browser?.close();
    } finally {
      active--;
    }
  }
}

async function visit(page: import('playwright-core').Page, target: string): Promise<PageHarvest | null> {
  try {
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    if (!response || response.status() >= 400) return null;
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    return await page.evaluate(() => ({
      links: Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href),
      siteName:
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || null,
      title: document.title?.trim() || null,
      description:
        document.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() || null,
      headings: Array.from(document.querySelectorAll('h1, h2'), (h) =>
        (h.textContent ?? '').replace(/\s+/g, ' ').trim(),
      )
        .filter((h) => h.length > 1 && h.length < 160)
        .slice(0, 12),
      body:
        ((document.querySelector('main') ?? document.body) as HTMLElement | null)?.innerText
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 2000) ?? '',
    }));
  } catch {
    return null;
  }
}

function normalizeInput(input: string) {
  const text = input.trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/** "Acme Co. | Best widgets in Bengaluru" -> "Acme Co." */
export function cleanBrand(value: string | null): string | null {
  if (!value) return null;
  const head = value.split(/\s[|–—·:]\s|\s-\s/)[0].trim();
  const brand = (head.length >= 2 ? head : value.trim()).slice(0, 100);
  return brand || null;
}
