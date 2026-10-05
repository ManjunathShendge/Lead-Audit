# Tier2 Social Profile Audit â€” implementation plan

## Scope and review gate

Implement milestones 0â€“5 in order, then stop for report review as explicitly required by the brief. No paid APIs, live crawls, or unverified third-party normalizers before that review. Synthetic fixtures are labelled as such; they do not establish live collector accuracy. Milestones 6â€“11 remain pending, never marked complete prematurely.

## Structure

- `src/app`: authenticated App Router pages, login, JSON APIs, report print route.
- `src/components`: shared navigation, audit form, polling progress and report visuals.
- `src/lib/collectors`: Zod normalized contracts and fixture collectors.
- `src/lib/metrics`, `scoring`, `recommendations`: pure deterministic calculations, missing-value handling, extensible channel scoring.
- `src/lib/jobs`: durable Prisma queue with atomic claims, leases, timeout and retry; independent worker process.
- `src/lib/pdf`: trusted-local-origin Playwright print renderer.
- `fixtures/{instagram,facebook,linkedin,youtube}`: explicit synthetic strong/average/weak raw fixtures.
- `prisma`: SQLite local schema, migration and seed; PostgreSQL deployment migration documented separately.
- `tests`: Vitest edge-case suites and Playwright login â†’ audit â†’ PDF test.

## Data model

Audit stores brand, website, industry, confirmed handles, fixture tier, immutable scoring configuration snapshot, timestamps, aggregate report and state. CollectorRun stores platform, handle, queue state, attempt count, lease, normalized response, verbatim raw fixture, warnings and nullable USD cost. Audit deletion cascades runs. Config stores weights/thresholds/enabled platforms/industry relevance. Benchmark stores industry Ã— platform target frequency, engagement and follower/review bands, flagged as placeholders. ServiceMapping stores editable gap/service copy. Session stores hashed random tokens and expiry; no password sent to clients. Future AccuracyRun stores results separately. Missing values stay null; confirmed absent relevant accounts score zero, failures never do.

## Decisions within brief

- Keep existing Next.js 16 scaffold and strict TypeScript. Read bundled Next.js docs before route/auth work.
- SQLite + Prisma for local development as permitted. Pin Prisma 6 for a straightforward SQLite client; PostgreSQL requires a provider-specific migration.
- The worker runs as a separate `npm run worker` process for reliable work beyond an HTTP request lifecycle.
- Synthetic fixture dates are deterministic and anchored to each audit's timestamp; retain the exact generated raw fixture per run. No mock discovery masquerades as website crawling.
- Unknown dates, incomplete samples, hidden counts, all-pinned samples and zero followers receive explicit data notes. Activity counts are lower bounds when completeness is unknown. Configuration is snapshotted per audit.
- Settings foundation and all three channel scoring modules are built now; full editing UI and accuracy harness remain milestone 10/11.

## Milestones

- [x] 0: Plan, scaffold, schema/migration, env, secure password login; boot and login verification; commit.
- [x] 1: Normalized contracts and three fixture-backed mock brands; fixture tests; commit.
- [x] 2: Metrics, social/website/GBP scoring, recommendations and edge-case tests; commit.
- [x] 3: Complete report UI and three demo audits, responsive/print-aware charts; verify; commit.
- [x] 4: Handle confirmation, durable parallel jobs, retries, caching, progress/history/delete; E2E; commit.
- [x] 5: A4 Playwright PDF with branding and chart readiness; E2E download and visual verification; commit.
- [x] REVIEW GATE: Report reviewed; the user authorised live integrations on 28 September 2026.
- [x] 6: Instagram collector verified against a real `hpix/instagram-scraper` response on 28 September 2026
      (`fixtures/instagram/raw-live-mamaearth.in.json`, $0.0268). 30/30 posts returned date, likes and comments.
      Capture corrected two things: the actor splits a profile across `data`, `stats` and `metadata` siblings,
      and pinned posts are flagged `pinned_for_users`, not `is_pinned`.
- [x] 7: YouTube Data API v3 collector verified against a real channel (`raw-live-UC5qhqSIcahBKKMEdLPFqeVA`),
      3 quota units, no cost. One batched `videos.list` call per page of uploads as the brief requires.
- [x] 8: Live Playwright discovery with SSRF guards. Verified 10/10 real sites against the 8/10 bar.
- [x] 9: Two candidates proposed per platform; the user selected on 28 September 2026. Wired and verified:
      Facebook = `apify/facebook-pages-scraper` + `apify/facebook-posts-scraper` ($0.121 for a page plus 30
      posts), LinkedIn = `automation-lab/linkedin-company-scraper` + `harvestapi/linkedin-company-posts`.
      No single actor returns both page metadata and posts, so each platform runs a pair and
      `APIFY_ACTOR_*_POSTS` was added. The LinkedIn posts actor takes `targetUrls` with full URLs; the first
      capture returned nothing because a slug was sent, which the collector reported as a clean degradation
      rather than a wrong number.
- [x] 10: Persisted accuracy harness at `/accuracy` with durable items, grading and CSV export.
- [x] 11: Editable settings, cost tracking and README refresh.

## Verification

Each milestone gets appropriate tests and an app smoke check. Final checkpoint: TypeScript, ESLint, Vitest, production build, authenticated browser workflow and valid PDF download. Test no posts/all pinned, null/zero followers, hidden/negative counts, partial failures, date windows, weighted re-normalization, absent relevant platforms, disabled platforms, scoring bounds, auth, invalid input and cache reuse. Report any unavailable checks honestly.

## Checkpoint result

Milestones 0-5 are complete. See VERIFICATION.md for checks and BUILD_BRIEF.md for the review gate that has
now been passed. README setup also passed against a separate empty database. PDF pages inspected for all
three scenarios.

## Live phase status (28 September 2026)

All eleven milestones are implemented. Every collector has been run against a real account and its response
saved under `fixtures/<platform>/raw-live-*.json`. `USE_MOCK_DATA=false`; collection is live.

Fields the selected actors genuinely do not return, which stay null and are reported as data notes rather
than scored as zero:

- Instagram: total post count, category, business flag and the bio link. Profile completeness therefore
  scores on bio and avatar only, re-normalised. `sampleComplete` can never be true, so activity counts are
  always lower bounds.
- Facebook and LinkedIn: no total post count, for the same reason.
- Facebook: the posts actor omits `comments` entirely on posts that have none while still emitting
  `shares: 0`. An absent count cannot be distinguished from a real zero, so it stays null and the report
  states how many posts were affected and that engagement may read high as a result.

What remains before showing a report to a prospect: run `/accuracy` against a list of real accounts, enter
the true values, and confirm each platform clears 95% accuracy and 90% coverage. Nothing so far establishes
those targets.

Live collection is gated per platform by `liveAvailability()` in `src/lib/collectors/index.ts`. An audit run
in live mode against an unconfigured platform produces a failed collector run with a stated reason rather
than a wrong number, and the rest of the audit still completes. Discovery is now always a real crawl; it
costs nothing and is independent of `USE_MOCK_DATA`, which governs collectors only.

## Website and Google Business Profile channels (29 September 2026)

The section 7.2 / 7.3 scoring now has collectors, and the report scores and charts all three channels.

- Google Business Profile: `compass/crawler-google-places` (chosen by the user over the official Places API,
  which does not return owner replies). Verified against a real response for Tier2 Digital
  (`fixtures/gbp/raw-live-tier2-digital.json`, $0.0092).
- Website: PageSpeed Insights v5 plus a Playwright crawl reusing discovery's SSRF guard (`discovery/browser.ts`).
  The crawl was verified live on tier2.digital, mamaearth.in and freshworks.com (`fixtures/website/raw-live-*`).
  **PageSpeed is not yet verified live**: the keyless quota returned 429 and the existing Google key does not have
  the PageSpeed API enabled. The normalizer follows the documented v5 response and is unit-tested against that
  shape; capture a real response once `PAGESPEED_API_KEY` is set.
- New `Audit.channels` column (migration `1_audit_channels`) stores the website switch and GBP search.
- Report: a "score, unpacked" page (channel contributions to the headline score and a platform × component
  matrix), a Website page (criteria bars against the gap line, PageSpeed rings, Core Web Vitals meters,
  checklists) and a GBP page (rating and distribution, review volume on the log band, owner-reply waffle,
  completeness). Channel colours are the validated first three categorical slots. Print keeps each on one A4 page.
- Not yet run end to end through the worker against the database: the local Postgres role in `.env` was denied
  access during this change, so verification was unit tests, typecheck, lint, production build, and screenshots
  of a fixture-built report.
