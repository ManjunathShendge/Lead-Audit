/**
 * One real website + SEO collection (crawl, PageSpeed, apify/google-search-scraper), saved verbatim
 * so the SERP normalizer can be checked against a real response before it is trusted.
 *
 *   npx tsx scripts/capture-seo.ts https://www.tier2.digital "Tier2 Digital" --confirm-cost
 *   npx tsx scripts/capture-seo.ts https://www.tier2.digital "Tier2 Digital" --reuse-search
 *
 * The Google search is a paid Apify run (two SERP pages), so it refuses to run without --confirm-cost.
 * --reuse-search re-runs only the free crawl and PageSpeed and keeps the Google results already saved.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { collectWebsite } from '../src/lib/collectors/website';
import type { WebsiteResult } from '../src/lib/collectors/channel-types';
import { buildSeoAudit } from '../src/lib/seo';

config();

async function main() {
  const [site, brand, ...flags] = process.argv.slice(2);
  if (!site || !brand) {
    console.error('Usage: tsx scripts/capture-seo.ts <website> <brand> (--confirm-cost | --reuse-search)');
    process.exitCode = 1;
    return;
  }
  const reuse = flags.includes('--reuse-search');
  if (!reuse && !flags.includes('--confirm-cost')) {
    console.error('The Google search uses a paid Apify actor. Re-run with --confirm-cost to authorize one call.');
    process.exitCode = 1;
    return;
  }
  const host = new URL(site).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '-');
  const file = path.join(process.cwd(), 'fixtures', 'website', `raw-live-seo-${host}.json`);
  const saved: WebsiteResult | null = reuse ? JSON.parse(await readFile(file, 'utf8')).result : null;
  // An empty actor ID switches the paid search off for this run.
  if (reuse) process.env.APIFY_ACTOR_SERP = '';

  const asOf = new Date();
  const started = Date.now();
  const result = await collectWebsite(site, asOf, undefined, brand);
  if (saved && result.detail.seoAudit) {
    result.detail.seoAudit.search = saved.detail.seoAudit?.search ?? null;
    result.raw = { ...(result.raw as object), serp: (saved.raw as { serp?: unknown }).serp };
    result.costUsd = saved.costUsd;
    result.warnings = result.warnings.filter((w) => !w.startsWith('Google search visibility not measured'));
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ capturedAt: asOf.toISOString(), site, brand, synthetic: false, result }, null, 2),
  );
  console.log(`Saved -> ${path.relative(process.cwd(), file)} (${Date.now() - started}ms, search cost $${result.costUsd ?? 'unknown'})`);
  console.log('Status:', result.status);
  console.log('Warnings:', result.warnings);

  const audit = buildSeoAudit(result.detail, asOf);
  console.log(`\nSEO score: ${audit.score?.toFixed(1) ?? 'n/a'}`);
  for (const c of audit.categories) console.log(`  ${c.label}: ${c.score?.toFixed(0) ?? 'not measured'}`);
  const show = (title: string, rows: { label: string; found: string; benchmark?: string }[]) => {
    console.log(`\n${title} (${rows.length})`);
    for (const k of rows) console.log(`  - ${k.label}: ${k.found}${k.benchmark ? `  [benchmark ${k.benchmark}]` : ''}`);
  };
  show('FIX', audit.groups.fix);
  show('IMPROVE', audit.groups.improve);
  show('WORKING WELL', audit.groups.good);
  show('GOOD TO KNOW', audit.groups.info);
  show('NOT MEASURED', audit.groups.unmeasured);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
