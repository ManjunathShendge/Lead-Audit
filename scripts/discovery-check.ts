/**
 * Milestone 8 acceptance check: handles must be found for at least 8 of 10 real websites.
 * Crawls public homepages only. No paid API is involved. Run with: npx tsx scripts/discovery-check.ts
 */
import { discoverFromWebsite } from '../src/lib/discovery/index';

const SITES = [
  'https://www.tier2.digital',
  'https://www.mamaearth.in',
  'https://www.boat-lifestyle.com',
  'https://www.sugarcosmetics.com',
  'https://www.wakefit.co',
  'https://www.bewakoof.com',
  'https://www.chumbak.com',
  'https://www.lenskart.com',
  'https://www.thesouledstore.com',
  'https://www.beardo.in',
];

const PASS_BAR = 8;

async function main() {
  const rows: { site: string; found: string[]; brand: string | null; pages: number; error?: string }[] = [];
  for (const site of SITES) {
    const started = Date.now();
    try {
      const result = await discoverFromWebsite(site);
      const found = Object.entries(result.handles).map(([p, v]) => `${p}:${v!.handle}`);
      rows.push({ site, found, brand: result.brand, pages: result.pagesVisited.length });
      console.log(
        `${found.length ? 'OK  ' : 'MISS'} ${site} (${Date.now() - started}ms, ${result.pagesVisited.length}p) -> ${found.join(', ') || 'nothing'}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ site, found: [], brand: null, pages: 0, error: message });
      console.log(`FAIL ${site} (${Date.now() - started}ms) -> ${message}`);
    }
  }

  const passed = rows.filter((r) => r.found.length > 0).length;
  const perPlatform = ['instagram', 'facebook', 'linkedin', 'youtube'].map(
    (p) => `${p} ${rows.filter((r) => r.found.some((f) => f.startsWith(`${p}:`))).length}/${SITES.length}`,
  );
  console.log(`\nSites with at least one handle: ${passed}/${SITES.length} (bar: ${PASS_BAR})`);
  console.log(`Per platform: ${perPlatform.join(' · ')}`);
  console.log(passed >= PASS_BAR ? 'MILESTONE 8 BAR MET' : 'MILESTONE 8 BAR NOT MET');
  process.exitCode = passed >= PASS_BAR ? 0 : 1;
}

void main();
