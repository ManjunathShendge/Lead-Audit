/**
 * Brief section 0.4: make one real call per collector, save the raw response, and only then trust
 * the normalizer. Saves to fixtures/<platform>/raw-live-<handle>.json and prints what was normalized.
 *
 *   npx tsx scripts/capture-fixture.ts youtube @tier2digital
 *   npx tsx scripts/capture-fixture.ts instagram tier2digital --confirm-cost
 *
 * Instagram runs a paid Apify actor, so it refuses to run without --confirm-cost.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import { youtubeCollector } from '../src/lib/collectors/youtube';
import { instagramCollector } from '../src/lib/collectors/instagram';
import { facebookCollector } from '../src/lib/collectors/facebook';
import { linkedinCollector } from '../src/lib/collectors/linkedin';
import type { Collector } from '../src/lib/collectors/types';

config();

const PAID = new Set(['instagram', 'facebook', 'linkedin']);

async function main() {
  const [platform, handle, ...flags] = process.argv.slice(2);
  if (!platform || !handle) {
    console.error('Usage: tsx scripts/capture-fixture.ts <platform> <handle> [--confirm-cost]');
    process.exitCode = 1;
    return;
  }
  if (PAID.has(platform) && !flags.includes('--confirm-cost')) {
    console.error(
      `${platform} uses a paid Apify actor. Re-run with --confirm-cost to authorize one real call.`,
    );
    process.exitCode = 1;
    return;
  }

  const collectors: Record<string, () => Collector> = {
    youtube: () => youtubeCollector(new Date()),
    instagram: () => instagramCollector(new Date()),
    facebook: () => facebookCollector(new Date()),
    linkedin: () => linkedinCollector(new Date()),
  };
  const make = collectors[platform];
  if (!make) {
    console.error(`No live collector for "${platform}". Available: ${Object.keys(collectors).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Calling the live ${platform} collector for ${handle}…`);
  const started = Date.now();
  const result = await make().collect(handle.replace(/^@/, ''), { postsLimit: 30 });
  const elapsed = Date.now() - started;

  const safe = handle.replace(/^@/, '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const dir = path.join(process.cwd(), 'fixtures', platform);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `raw-live-${safe}.json`);
  await writeFile(
    file,
    JSON.stringify(
      { capturedAt: new Date().toISOString(), platform, handle, synthetic: false, raw: result.raw },
      null,
      2,
    ),
  );

  console.log(`\nSaved raw response -> ${path.relative(process.cwd(), file)} (${elapsed}ms)`);
  console.log('\nNormalized summary:');
  console.table({
    status: result.status,
    displayName: result.profile?.displayName ?? null,
    followers: result.profile?.followers ?? null,
    totalPosts: result.profile?.totalPosts ?? null,
    postsFetched: result.posts.length,
    lastPost:
      result.posts
        .map((p) => p.publishedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    avgLikesKnown: result.posts.filter((p) => p.likes !== null).length,
    sampleComplete: result.sampleComplete,
    costUsd: result.costUsd,
  });
  if (result.warnings.length) console.log('\nWarnings:\n- ' + result.warnings.join('\n- '));
  console.log(
    '\nCompare followers / total posts / last post date against the live profile before trusting the normalizer.',
  );
}

void main().catch((error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
