/**
 * Re-runs the normalizers over already-captured live responses. No API call, no cost.
 * Use after changing a *_FIELDS map to confirm the new candidate names actually resolve.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeLinkedIn } from '../src/lib/collectors/linkedin';
import { normalizeFacebook } from '../src/lib/collectors/facebook';
import { normalizeInstagram } from '../src/lib/collectors/instagram';

const read = (p: string) => {
  const full = path.join(process.cwd(), 'fixtures', p);
  return existsSync(full) ? JSON.parse(readFileSync(full, 'utf8')) : null;
};
const now = new Date().toISOString();

const ig = read('instagram/raw-live-mamaearth.in.json');
if (ig) {
  const r = normalizeInstagram(ig.handle, ig.raw.items, now, 0.0268, 30);
  report('INSTAGRAM', r);
}

const fb = read('facebook/raw-live-mamaearthindia.json');
if (fb) {
  const r = normalizeFacebook(fb.handle, fb.raw.pageItems, fb.raw.postItems, now, 0.121, 30);
  report('FACEBOOK', r);
}

const li = read('linkedin/raw-live-mama-earth-in.json');
if (li) {
  const r = normalizeLinkedIn(li.handle, li.raw.companyItems, li.raw.postItems, now, 0.00005, 30);
  report('LINKEDIN', r);
}

type Result = ReturnType<typeof normalizeInstagram>;
function report(label: string, r: Result) {
  const dated = r.posts.filter((p) => p.publishedAt).length;
  console.log(`\n=== ${label} ===`);
  console.table({
    status: r.status,
    followers: r.profile?.followers ?? null,
    posts: r.posts.length,
    withDate: dated,
    withLikes: r.posts.filter((p) => p.likes !== null).length,
    withComments: r.posts.filter((p) => p.comments !== null).length,
    lastPost: r.posts
      .map((p) => p.publishedAt)
      .filter(Boolean)
      .sort()
      .at(-1),
  });
  if (r.warnings.length) console.log('warnings:\n- ' + r.warnings.join('\n- '));
}
