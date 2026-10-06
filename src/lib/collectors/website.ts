import type { Page } from 'playwright-core';
import { launchGuarded } from '../discovery/browser';
import { assertPublicUrl } from '../discovery/net';
import {
  emptyWebsite,
  websiteResultSchema,
  type SearchVisibility,
  type WebsiteDetail,
  type WebsiteResult,
} from './channel-types';
import { collectSerp, serpConfigured } from './serp';

/**
 * Website audit (brief 7.2): mobile PageSpeed Insights (median of 3 runs) plus a guarded Playwright
 * crawl of the homepage, contact page, blog, robots.txt and sitemap. Costs nothing; PageSpeed needs
 * PAGESPEED_API_KEY in practice because the keyless quota is shared and usually exhausted.
 */
const PAGE_TIMEOUT_MS = 25_000;
const PSI_TIMEOUT_MS = 110_000;
const PSI_RUNS = 3;

// ---------- PageSpeed Insights ----------

type Psi = { performance: number | null; seo: number | null; raw: unknown; error: string | null };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const at = (v: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as never)[k] : undefined), v);

export async function runPagespeed(url: string, signal?: AbortSignal): Promise<Psi> {
  const params = new URLSearchParams({ url, strategy: 'mobile' });
  params.append('category', 'performance');
  params.append('category', 'seo');
  if (process.env.PAGESPEED_API_KEY) params.set('key', process.env.PAGESPEED_API_KEY);
  const timeout = AbortSignal.timeout(PSI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const reason =
        res.status === 429
          ? 'PageSpeed quota exhausted; set PAGESPEED_API_KEY.'
          : res.status === 403
            ? 'PageSpeed API rejected the key; enable "PageSpeed Insights API" for it.'
            : `PageSpeed returned HTTP ${res.status}.`;
      return { performance: null, seo: null, raw: stripPsi(body), error: reason };
    }
    return { ...psiScores(body), raw: stripPsi(body), error: null };
  } catch (e) {
    signal?.throwIfAborted();
    return {
      performance: null,
      seo: null,
      raw: null,
      error:
        e instanceof Error && e.name === 'TimeoutError'
          ? 'PageSpeed run timed out.'
          : 'PageSpeed run failed.',
    };
  }
}

/** Lighthouse category scores are 0–1; the report uses 0–100. */
export function psiScores(body: unknown) {
  const score = (path: string) => {
    const v = num(at(body, path));
    return v === null ? null : Math.round(v * 1000) / 10;
  };
  return {
    performance: score('lighthouseResult.categories.performance.score'),
    seo: score('lighthouseResult.categories.seo.score'),
  };
}

/**
 * Core Web Vitals: CrUX field data when Google has it (URL, else origin), otherwise Lighthouse lab.
 * The lab run cannot measure INP (it needs real interactions), so lab INP stays null.
 */
export function psiVitals(
  bodies: unknown[],
): Pick<WebsiteDetail['pagespeed'], 'lcpMs' | 'inpMs' | 'cls' | 'vitalsSource'> {
  for (const body of bodies) {
    const le = at(body, 'loadingExperience.metrics') ? at(body, 'loadingExperience') : null;
    if (!le) continue;
    const metric = (k: string) => num(at(le, `metrics.${k}.percentile`));
    const lcpMs = metric('LARGEST_CONTENTFUL_PAINT_MS');
    const inpMs = metric('INTERACTION_TO_NEXT_PAINT');
    const clsRaw = metric('CUMULATIVE_LAYOUT_SHIFT_SCORE');
    if (lcpMs === null && inpMs === null && clsRaw === null) continue;
    return {
      lcpMs,
      inpMs,
      // CrUX reports CLS multiplied by 100.
      cls: clsRaw === null ? null : clsRaw / 100,
      vitalsSource: at(le, 'origin_fallback') === true ? 'origin' : 'url',
    };
  }
  const labs = bodies
    .map((b) => ({
      lcp: num(at(b, 'lighthouseResult.audits.largest-contentful-paint.numericValue')),
      cls: num(at(b, 'lighthouseResult.audits.cumulative-layout-shift.numericValue')),
    }))
    .filter((l) => l.lcp !== null || l.cls !== null);
  if (!labs.length) return { lcpMs: null, inpMs: null, cls: null, vitalsSource: null };
  const mid = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null).sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
  };
  return {
    lcpMs: mid(labs.map((l) => l.lcp)),
    inpMs: null,
    cls: mid(labs.map((l) => l.cls)),
    vitalsSource: 'lab',
  };
}

/**
 * Time to First Byte and First Contentful Paint (field data first, as for the vitals) plus the
 * pass/fail list of Lighthouse SEO audits from the first run that has one.
 */
export function psiSeoExtras(bodies: unknown[]) {
  let ttfbMs: number | null = null;
  let fcpMs: number | null = null;
  for (const body of bodies) {
    const metric = (k: string) => num(at(body, `loadingExperience.metrics.${k}.percentile`));
    ttfbMs ??= metric('EXPERIMENTAL_TIME_TO_FIRST_BYTE');
    fcpMs ??= metric('FIRST_CONTENTFUL_PAINT_MS');
  }
  const lab = (audit: string) => {
    const v = bodies
      .map((b) => num(at(b, `lighthouseResult.audits.${audit}.numericValue`)))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : null;
  };
  // Lighthouse's own TTFB lives in the metrics audit. 'server-response-time' is backend time only
  // (2 ms on tier2.digital against a 602 ms TTFB), so it is not used.
  if (ttfbMs === null) {
    const v = bodies
      .map((b) => num(at(b, 'lighthouseResult.audits.metrics.details.items.0.timeToFirstByte')))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    ttfbMs = v.length ? v[Math.floor((v.length - 1) / 2)] : null;
  }
  fcpMs ??= lab('first-contentful-paint');
  const lighthouse: { id: string; title: string; passed: boolean }[] = [];
  for (const body of bodies) {
    const refs = at(body, 'lighthouseResult.categories.seo.auditRefs');
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      const id = typeof ref?.id === 'string' ? ref.id : null;
      const audit = id ? at(body, `lighthouseResult.audits.${id}`) : null;
      const score = num(at(audit, 'score'));
      const title = at(audit, 'title');
      // Manual and not-applicable audits have no score; they say nothing about this site.
      if (id && score !== null && typeof title === 'string') lighthouse.push({ id, title, passed: score >= 0.9 });
    }
    if (lighthouse.length) break;
  }
  return { ttfbMs, fcpMs, lighthouse };
}

/** Keep what scoring reads plus run metadata; drop the multi-megabyte screenshots and traces. */
function stripPsi(body: unknown) {
  if (!body || typeof body !== 'object') return body;
  const b = body as Record<string, unknown>;
  const lr = (b.lighthouseResult ?? {}) as Record<string, unknown>;
  const audits = (lr.audits ?? {}) as Record<string, unknown>;
  const seoRefs = at(lr, 'categories.seo.auditRefs');
  const seoIds = Array.isArray(seoRefs)
    ? seoRefs.map((r) => (typeof r?.id === 'string' ? r.id : null)).filter((id): id is string => !!id)
    : [];
  const keep = (a: unknown) => {
    if (!a || typeof a !== 'object') return a;
    const { id, title, score, scoreDisplayMode, numericValue } = a as Record<string, unknown>;
    return { id, title, score, scoreDisplayMode, numericValue };
  };
  return {
    id: b.id,
    analysisUTCTimestamp: b.analysisUTCTimestamp,
    loadingExperience: b.loadingExperience,
    originLoadingExperience: b.originLoadingExperience,
    error: b.error,
    lighthouseResult: {
      finalDisplayedUrl: lr.finalDisplayedUrl,
      lighthouseVersion: lr.lighthouseVersion,
      runtimeError: lr.runtimeError,
      categories: lr.categories,
      audits: {
        ...Object.fromEntries(
          ['largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time'].map((k) => [
            k,
            audits[k],
          ]),
        ),
        ...Object.fromEntries(
          ['first-contentful-paint', ...seoIds].map((k) => [k, keep(audits[k])]),
        ),
        metrics: { details: { items: [{ timeToFirstByte: at(audits, 'metrics.details.items.0.timeToFirstByte') }] } },
      },
    },
  };
}

// ---------- Crawl ----------

export const TAG_PATTERNS = {
  analytics: [
    /googletagmanager\.com\/gtag\/js\?id=G-/i,
    /googletagmanager\.com\/gtm\.js/i,
    /google-analytics\.com\/(g\/collect|analytics\.js|collect)/i,
    /gtag\(\s*['"]config['"]\s*,\s*['"]G-/i,
    /['"]GTM-[A-Z0-9]{4,}['"]/,
  ],
  meta: [/connect\.facebook\.net\/[^/]+\/fbevents\.js/i, /facebook\.com\/tr[/?]/i, /fbq\(\s*['"]init['"]/i],
  ads: [
    /googletagmanager\.com\/gtag\/js\?id=AW-/i,
    /googleadservices\.com\/pagead\/conversion/i,
    /googleads\.g\.doubleclick\.net\/pagead/i,
    /['"]AW-\d{6,}/,
  ],
  linkedin: [/snap\.licdn\.com\/li\.lms-analytics/i, /px\.ads\.linkedin\.com/i, /_linkedin_partner_id/],
} as const;

export function detectTags(haystack: string) {
  return Object.fromEntries(
    Object.entries(TAG_PATTERNS).map(([k, patterns]) => [k, patterns.some((p) => p.test(haystack))]),
  ) as Record<keyof typeof TAG_PATTERNS, boolean>;
}

const CTA_TEXT =
  /\b(contact|get (started|in touch|a quote|quote)|book|call|enquire|enquiry|inquire|quote|buy|shop|order|sign ?up|register|subscribe|demo|talk to|schedule|start|try|download|apply|join|hire|let'?s talk|request|consult)/i;
/** "Aug 24 2026", "August 24, 2026", "24 Aug 2026", "2026-08-24": blog listings often show only text. */
const DATE_TEXT =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? (?:19|20)\d{2}|\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,? (?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2})\b/;
const BLOG_PATH = /\/(blog|blogs|news|articles|insights|resources|journal|stories|updates)\/?$/i;

type Harvest = Awaited<ReturnType<typeof harvest>>;

/** Everything read from a rendered page, evaluated in the browser. */
async function harvest(page: Page) {
  // tsx/esbuild wrap named inner functions in a __name() helper that does not exist in the page.
  await page.evaluate('window.__name = window.__name || ((f) => f)');
  return page.evaluate(
    ([ctaSource, dateSource]) => {
      const cta = new RegExp(ctaSource, 'i');
      const dateText = new RegExp(dateSource, 'gi');
      const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0
        );
      };
      const imgs = Array.from(document.images).filter(
        (i) => !(i.getAttribute('width') === '1' && i.getAttribute('height') === '1'),
      );
      const forms = Array.from(document.querySelectorAll('form')).filter((f) => {
        if (f.getAttribute('role') === 'search' || /search/i.test(f.getAttribute('action') ?? ''))
          return false;
        if (f.querySelector('input[type=search]')) return false;
        const fields = f.querySelectorAll(
          'input[type=email], input[type=tel], textarea, input[type=text], input:not([type])',
        );
        return !!f.querySelector('input[type=email], input[type=tel], textarea') || fields.length >= 2;
      });
      const formFrames = Array.from(document.querySelectorAll('iframe')).some((f) =>
        /hsforms|hubspot|typeform|docs\.google\.com\/forms|jotform|zoho|forms\.office|tally\.so|calendly/i.test(
          f.src,
        ),
      );
      const fold = window.innerHeight;
      const ctaEl = Array.from(
        document.querySelectorAll('a[href], button, [role=button], input[type=submit]'),
      ).find((el) => {
        const r = el.getBoundingClientRect();
        if (r.top >= fold || r.bottom <= 0 || !visible(el)) return false;
        const label = text(el) || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '';
        if (!label || label.length > 40 || !cta.test(label)) return false;
        const s = getComputedStyle(el);
        const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
        return (
          el.tagName === 'BUTTON' ||
          el.getAttribute('role') === 'button' ||
          el.tagName === 'INPUT' ||
          /btn|button|cta/i.test(el.className?.toString() ?? '') ||
          filled
        );
      });
      const hrefs = Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href);
      const ldDates: string[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object')
          for (const [k, val] of Object.entries(v)) {
            if ((k === 'datePublished' || k === 'dateModified') && typeof val === 'string') ldDates.push(val);
            else walk(val);
          }
      };
      const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      ld.forEach((s) => {
        try {
          walk(JSON.parse(s.textContent ?? ''));
        } catch {
          /* malformed JSON-LD is ignored */
        }
      });
      const footer = document.querySelector('footer');
      const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
      const schemaTypes = new Set<string>();
      const types = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(types);
        else if (v && typeof v === 'object')
          for (const [k, val] of Object.entries(v)) {
            if (k === '@type') [val].flat().forEach((t) => typeof t === 'string' && schemaTypes.add(t));
            else types(val);
          }
      };
      ld.forEach((s) => {
        try {
          types(JSON.parse(s.textContent ?? ''));
        } catch {
          /* malformed JSON-LD is ignored */
        }
      });
      const host = location.hostname.replace(/^www\./, '');
      const linkHosts = Array.from(
        new Set(
          Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href.split('#')[0]),
        ),
      )
        .filter((h) => /^https?:/i.test(h))
        .map((h) => new URL(h).hostname.replace(/^www\./, ''));
      // Whole page, not <main>: site builders often wrap only the hero in <main> (tier2.digital: 14 of
      // ~1,270 words), which would read a full page as nearly empty.
      const pageText = document.body?.innerText ?? '';
      return {
        url: location.href,
        title: document.title.trim(),
        seoExtra: {
          canonical: !!document.querySelector('link[rel="canonical" i][href]'),
          viewport: !!document.querySelector('meta[name="viewport" i]'),
          lang: !!document.documentElement.getAttribute('lang')?.trim(),
          openGraph: !!meta('meta[property="og:title"]') && !!meta('meta[property="og:image"]'),
          twitterCard: !!meta('meta[name="twitter:card" i]'),
          noindex: /noindex/i.test(
            meta('meta[name="robots" i]') + ' ' + meta('meta[name="googlebot" i]'),
          ),
          hreflang: !!document.querySelector('link[rel="alternate" i][hreflang]'),
          favicon: !!document.querySelector('link[rel~="icon" i]'),
          h2Count: document.querySelectorAll('h2').length,
          wordCount: (pageText.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length,
          internalLinks: linkHosts.filter((h) => h === host).length,
          externalLinks: linkHosts.filter((h) => h !== host).length,
          schemaTypes: [...schemaTypes].slice(0, 20),
        },
        description:
          document.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() ?? '',
        h1Count: document.querySelectorAll('h1').length,
        headings: Array.from(document.querySelectorAll('h1, h2'))
          .filter(visible)
          .map(text)
          .filter((h) => h.length > 1 && h.length < 160)
          .slice(0, 12),
        bodyText:
          ((document.querySelector('main') ?? document.body) as HTMLElement | null)?.innerText
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2500) ?? '',
        images: imgs.length,
        imagesWithAlt: imgs.filter((i) => i.hasAttribute('alt')).length,
        schema: ld.length > 0 || !!document.querySelector('[itemscope], [typeof]'),
        form: forms.length > 0 || formFrames,
        ctaText: ctaEl ? (text(ctaEl) || (ctaEl as HTMLInputElement).value || '').slice(0, 40) : null,
        whatsapp:
          hrefs.some((h) => /wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|^whatsapp:/i.test(h)) ||
          !!document.querySelector('[class*="whatsapp" i], [id*="whatsapp" i]'),
        phone: !!document.querySelector('a[href^="tel:" i]'),
        hrefs,
        scripts: Array.from(document.scripts, (s) => s.src || (s.textContent ?? '').slice(0, 5000)).join(
          '\n',
        ),
        footerText: (footer ?? document.body)?.innerText.slice(-4000) ?? '',
        dates: [
          ...Array.from(document.querySelectorAll('time[datetime]'), (t) => t.getAttribute('datetime') ?? ''),
          ...Array.from(
            document.querySelectorAll(
              'meta[property="article:published_time"], meta[property="article:modified_time"]',
            ),
            (m) => m.getAttribute('content') ?? '',
          ),
          ...ldDates,
        ],
        textDates: (document.body?.textContent?.replace(/\s+/g, ' ').match(dateText) ?? []).slice(0, 60),
      };
    },
    [CTA_TEXT.source, DATE_TEXT.source] as const,
  );
}

export function copyrightYear(text: string, asOf: Date): number | null {
  const years = [
    ...text.matchAll(/(?:©|\(c\)|copyright)[^0-9]{0,30}((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi),
  ]
    .flatMap((m) => [m[1], m[2]])
    .filter(Boolean)
    .map(Number)
    .filter((y) => y <= asOf.getUTCFullYear() + 1);
  return years.length ? Math.max(...years) : null;
}

export function latestDate(values: string[], asOf: Date): string | null {
  const times = values
    .map((v) => Date.parse(v))
    .filter((t) => Number.isFinite(t) && t <= asOf.getTime() + 86400000 && t > Date.UTC(1995, 0, 1));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function open(page: Page, url: string) {
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    if (!res) return null;
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    return res;
  } catch {
    return null;
  }
}

async function fetchText(page: Page, url: string) {
  const res = await open(page, url);
  if (!res || res.status() >= 400) return null;
  return (await res.text().catch(() => '')).slice(0, 200_000);
}

export async function crawlWebsite(start: URL, asOf: Date, signal?: AbortSignal) {
  const requests: string[] = [];
  const { browser, context } = await launchGuarded(PAGE_TIMEOUT_MS, (u) => {
    if (requests.length < 2000) requests.push(u);
  });
  const pages: string[] = [];
  const warnings: string[] = [];
  try {
    const page = await context.newPage();
    const home = await open(page, start.href);
    if (!home || home.status() >= 400) return null;
    const homeData = await harvest(page);
    pages.push(homeData.url);
    signal?.throwIfAborted();

    const origin = new URL(homeData.url).origin;
    const sameSite = (h: string) => {
      try {
        return new URL(h).hostname.replace(/^www\./, '') === new URL(origin).hostname.replace(/^www\./, '');
      } catch {
        return false;
      }
    };
    let contact: Harvest | null = null;
    if (!homeData.form) {
      const link =
        homeData.hrefs.find((h) => sameSite(h) && /\/contact(-us)?\/?$/i.test(new URL(h).pathname)) ??
        `${origin}/contact`;
      const res = await open(page, link);
      if (res && res.status() < 400) {
        contact = await harvest(page);
        pages.push(contact.url);
      }
    }
    signal?.throwIfAborted();

    const blogUrl = homeData.hrefs.find((h) => sameSite(h) && BLOG_PATH.test(new URL(h).pathname)) ?? null;
    let blogDates: string[] = [];
    if (blogUrl) {
      const res = await open(page, blogUrl);
      if (res && res.status() < 400) {
        const blog = await harvest(page);
        pages.push(blog.url);
        blogDates = blog.dates;
        if (!latestDate(blogDates, asOf)) {
          blogDates = blog.textDates;
          if (latestDate(blogDates, asOf))
            warnings.push(
              'Blog post dates were read from visible text; the page has no machine-readable dates.',
            );
          else warnings.push('No post dates were found on the blog page; freshness uses the copyright year.');
        }
      }
    }
    signal?.throwIfAborted();

    const robots = await fetchText(page, `${origin}/robots.txt`);
    const robotsOk =
      robots !== null && !/<html/i.test(robots) && /(user-agent|disallow|allow|sitemap)\s*:/i.test(robots);
    const declared = robotsOk ? [...robots!.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]) : [];
    let sitemap = false;
    for (const candidate of [
      ...declared.slice(0, 1),
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
    ]) {
      try {
        await assertPublicUrl(candidate);
      } catch {
        continue;
      }
      const body = await fetchText(page, candidate);
      if (body && /<(urlset|sitemapindex)\b/i.test(body)) {
        sitemap = true;
        break;
      }
    }

    const tags = detectTags([...requests, homeData.scripts, contact?.scripts ?? ''].join('\n'));
    return {
      home: homeData,
      statusCode: home.status(),
      contact,
      blogUrl,
      blogDates,
      robots: robotsOk,
      sitemap,
      tags,
      pages,
      warnings,
      requestCount: requests.length,
    };
  } finally {
    await browser.close();
  }
}

// ---------- Collector ----------

type Serp = { search: SearchVisibility | null; raw: unknown; costUsd: number | null; error: string | null };

export async function collectWebsite(
  website: string,
  asOf: Date,
  signal?: AbortSignal,
  brand = '',
): Promise<WebsiteResult> {
  let start: URL;
  try {
    start = await assertPublicUrl(website);
  } catch (e) {
    throw new Error(`Collector refused the website: ${e instanceof Error ? e.message : 'invalid URL'}`);
  }
  // Google search visibility is a paid Apify call; without it the SEO audit simply leaves it out.
  const serpRun: Promise<Serp | null> = serpConfigured()
    ? collectSerp(start.href, brand, signal)
        .then((r) => ({ ...r, error: null }))
        .catch((e) => {
          signal?.throwIfAborted();
          console.error(JSON.stringify({ event: 'website.serp_failed', message: String(e).slice(0, 200) }));
          return { search: null, raw: null, costUsd: null, error: 'Google search lookup failed.' };
        })
    : Promise.resolve(null);
  const [crawl, serp, ...psi] = await Promise.all([
    crawlWebsite(start, asOf, signal).catch((e) => {
      signal?.throwIfAborted();
      console.error(JSON.stringify({ event: 'website.crawl_failed', message: String(e).slice(0, 200) }));
      return null;
    }),
    serpRun,
    ...Array.from({ length: PSI_RUNS }, () => runPagespeed(start.href, signal)),
  ]);
  return normalizeWebsite({ website: start.href, crawl, psi, asOf, serp });
}

export function normalizeWebsite({
  website,
  crawl,
  psi,
  asOf,
  serp = null,
}: {
  website: string;
  crawl: Awaited<ReturnType<typeof crawlWebsite>>;
  psi: Psi[];
  asOf: Date;
  /** null = the Google search lookup is not configured. */
  serp?: Serp | null;
}): WebsiteResult {
  const detail = emptyWebsite(crawl?.home.url ?? website);
  const warnings: string[] = [];
  const okRuns = psi.filter((r) => r.error === null);
  detail.pagespeed = {
    runs: okRuns.map(({ performance, seo }) => ({ performance, seo })),
    ...psiVitals(okRuns.map((r) => r.raw)),
  };
  const errors = [...new Set(psi.map((r) => r.error).filter(Boolean))];
  if (errors.length)
    warnings.push(
      `${psi.length - okRuns.length} of ${psi.length} PageSpeed runs failed: ${errors.join(' ')}`,
    );
  if (okRuns.length && okRuns.length < 3)
    warnings.push(`Performance uses the median of ${okRuns.length} run(s), not 3.`);
  if (detail.pagespeed.vitalsSource === 'lab')
    warnings.push(
      'No Chrome field data for this site; Core Web Vitals use lab values and INP is not measured.',
    );
  if (detail.pagespeed.vitalsSource === 'origin')
    warnings.push('Core Web Vitals use field data for the whole origin, not just the homepage.');

  const extras = psiSeoExtras(okRuns.map((r) => r.raw));
  detail.seoAudit = {
    statusCode: null,
    titleLength: null,
    descriptionLength: null,
    canonical: null,
    viewport: null,
    lang: null,
    openGraph: null,
    twitterCard: null,
    noindex: null,
    hreflang: null,
    favicon: null,
    h2Count: null,
    wordCount: null,
    internalLinks: null,
    externalLinks: null,
    schemaTypes: [],
    ...extras,
    search: serp?.search ?? null,
  };
  if (!serp)
    warnings.push('Google search visibility not measured: set APIFY_ACTOR_SERP to apify/google-search-scraper.');
  else if (serp.error) warnings.push(serp.error);
  else if (!serp.search) warnings.push('Google returned no results for the site or brand searches.');
  if (crawl) {
    const h = crawl.home;
    const pick = (a: boolean, b: boolean | undefined) => a || !!b;
    // Older fixtures captured before the SEO audit have no seoExtra; those fields stay unmeasured.
    if (h.seoExtra)
      detail.seoAudit = {
        ...detail.seoAudit,
        ...h.seoExtra,
        statusCode: crawl.statusCode ?? null,
        titleLength: h.title.length,
        descriptionLength: h.description.length,
      };
    detail.seo = {
      title: !!h.title,
      metaDescription: !!h.description,
      singleH1: h.h1Count === 1,
      h1Count: h.h1Count,
      imageAltRatio: h.images ? h.imagesWithAlt / h.images : null,
      imageCount: h.images,
      schema: h.schema,
      sitemap: crawl.sitemap,
      robots: crawl.robots,
      https: new URL(h.url).protocol === 'https:',
    };
    detail.tracking = crawl.tags;
    detail.conversion = {
      form: pick(h.form, crawl.contact?.form),
      cta: h.ctaText !== null,
      whatsapp: pick(h.whatsapp, crawl.contact?.whatsapp),
      phone: pick(h.phone, crawl.contact?.phone),
    };
    detail.ctaText = h.ctaText;
    detail.messaging = {
      title: h.title || null,
      description: h.description || null,
      headings: h.headings ?? [],
      text: h.bodyText || null,
    };
    detail.freshness = {
      latestPost: crawl.blogUrl ? latestDate(crawl.blogDates, asOf) : null,
      blogUrl: crawl.blogUrl,
      copyrightYear: copyrightYear(h.footerText, asOf),
    };
    warnings.push(...crawl.warnings);
    warnings.push(
      'Tags were detected before any cookie-consent interaction; tags that load only after consent may be missed.',
    );
    if (!crawl.blogUrl) warnings.push('No blog or news section was linked from the homepage.');
  } else
    warnings.push(
      'The website could not be crawled; SEO checklist, tracking and conversion are not measured.',
    );

  const status = crawl && okRuns.length ? 'ok' : crawl || okRuns.length ? 'partial' : 'failed';
  return websiteResultSchema.parse({
    kind: 'website',
    status,
    detail,
    raw: {
      pagespeed: psi.map((r) => ({ error: r.error, response: r.raw })),
      serp: serp && { error: serp.error, items: serp.raw },
      crawl: crawl && {
        pages: crawl.pages,
        requestCount: crawl.requestCount,
        statusCode: crawl.statusCode,
        home: { ...crawl.home, hrefs: crawl.home.hrefs.slice(0, 300), scripts: undefined },
        contact: crawl.contact && { ...crawl.contact, hrefs: undefined, scripts: undefined },
        blogUrl: crawl.blogUrl,
        blogDates: crawl.blogDates,
        robots: crawl.robots,
        sitemap: crawl.sitemap,
        tags: crawl.tags,
      },
    },
    costUsd: serp ? serp.costUsd : 0,
    warnings,
    fetchedAt: asOf.toISOString(),
  });
}
