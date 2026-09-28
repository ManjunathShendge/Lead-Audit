# Tier2 Social Profile Audit

An internal Next.js workspace that turns confirmed social handles into an explainable social presence report. Built through **milestone 5**, the explicit review checkpoint in the supplied brief.

## What works

- Password login with expiring, hashed session tokens, HTTP-only cookies, origin checks and login throttling.
- Website/handle input, editable account confirmation, three synthetic scenarios, and explicit present / unknown / no-account states.
- Durable SQLite/Prisma job queue with parallel platform jobs, atomic claims, crash recovery leases, one retry and a 180-second attempt timeout.
- Snapshot-based metrics and scores, missing-value re-normalization, industry relevance and service recommendations.
- Dark responsive reports, all requested charts, raw source inspection and light A4 PDF exports with branding on every page and a score-reference appendix.
- Audit history, cache reuse, fresh re-runs, collection costs and permanent deletion of audits plus their raw records.
- Seeded weights, placeholder benchmarks, service mappings and three demo reports. A read-only configuration page exposes the current foundation.
- Website and Google Business Profile scoring functions are ready for future collectors.

## Review boundary

**No live scrapers, live website crawling or paid APIs are wired in.** Website inputs produce explicitly labelled synthetic suggestions. Mock handles do not verify the existence of an account. Fixtures are fictional, not saved third-party API responses, and do not establish the requested 95% accuracy / 90% coverage.

Milestones 6-11 remain pending: Instagram, YouTube, live discovery, approval of Facebook/LinkedIn actors, the accuracy harness, editable settings and final live-operation polish. Do not turn off mock mode expecting live collection; the app refuses those runs. See PLAN.md.

## Local setup (Windows PowerShell)

Requires Node.js **22.18 or later**, npm, and Chromium's OS dependencies. Run from `lead-audit`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Set APP_PASSWORD in .env to your own workspace password.
npm.cmd run db:setup
$env:PLAYWRIGHT_BROWSERS_PATH='./.browsers'
npx.cmd playwright install chromium
npm.cmd run dev:all
```

Open http://localhost:3000 and enter the `APP_PASSWORD` from `.env`. The sample `.env.example` uses `change-me` for local development; production rejects this placeholder. `npm.cmd` avoids PowerShell execution-policy restrictions on npm.ps1.

On macOS/Linux, use `npm` / `npx`, `cp .env.example .env`, and `PLAYWRIGHT_BROWSERS_PATH=./.browsers npx playwright install --with-deps chromium`.

You can also run `npm run dev` and `npm run worker` in separate terminals. The worker must stay running; jobs do not rely on an HTTP request continuing after a response. Restarting a worker recovers expired claims. Collection is synthetic and normally finishes within a few seconds.

The seed is idempotent: it preserves configured values and existing audits. If a demo is deleted, running `npm run db:seed` recreates it.

## Environment

| Variable                        | Purpose                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| DATABASE_URL                    | `file:./dev.db`, resolved relative to the Prisma schema directory.                                                                         |
| USE_MOCK_DATA                   | Must be `true` at this checkpoint. No keys needed.                                                                                         |
| APP_PASSWORD                    | Shared internal password. Never sent in report payloads.                                                                                   |
| APP_ORIGIN                      | Exact app origin, default `http://localhost:3000`. Used for origin checks and trusted PDF navigation. Open the app using this same origin. |
| PLAYWRIGHT_BROWSERS_PATH        | `./.browsers`; install and run Chromium with the same path.                                                                                |
| AUDIT_CACHE_DAYS                | Cache offer window, default 7. Cache keys include confirmed handles, brand context, industry, fixture scenario and scoring configuration.  |
| APIFY_TOKEN / YOUTUBE_API_KEY   | Reserved server-only values. Not used in this build.                                                                                       |
| APIFY_ACTOR_INSTAGRAM           | Reserved `hpix/instagram-scraper`.                                                                                                         |
| APIFY_ACTOR_FACEBOOK / LINKEDIN | Intentionally blank until actors are proposed and approved.                                                                                |

Do not prefix secrets with `NEXT_PUBLIC_`. For a future live phase, obtain the Apify token from the account's API settings and a YouTube Data API v3 key from a Google Cloud project with that API enabled. Supply credentials only after reviewing the mock report. Save one actual response per approved collector before implementing its normalizer. Changing an actor ID alone is insufficient if its output schema changes: capture and test the new response. Never enable Instagram detailed/restricted paid add-ons.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

E2E requires `.env` with `USE_MOCK_DATA=true`, seeded DB and installed Chromium. It starts a web server if necessary and a worker, runs an authenticated audit, verifies raw sources, downloads a real PDF, reuses the cache and deletes its audit. A second test checks API auth, cross-origin rejection, validation and confirmed-absent accounts. Tests never call a paid API. Do not run the E2E suite against a live production database.

Additional review helpers (with the dev app running):

```powershell
node scripts/ui-smoke.mjs
node scripts/pdf-smoke.mjs
```

These save screenshots in `artifacts/` and sample PDFs in `output/pdf/` (ignored by Git). PDF visual QA can be reproduced with:

```powershell
python -m pip install pymupdf --target .qa-python
python scripts/render-pdf-qa.py
```

The visual checker renders every page and checks page branding and nonempty text. The resulting PNGs still need visual inspection.

## Data and scoring behavior

- Every collector run saves the exact hydrated synthetic response and normalized result. The report's authenticated source link exposes those records plus the scoring configuration snapshot.
- Null values display as **Not measured**. Hidden YouTube subscribers display as **Hidden**. Zero followers do not produce an infinite engagement rate.
- Engagement requires both a measured likes average and a measured comments average. Individual hidden counts are excluded from their respective averages; posts missing either count are excluded from top-post rankings.
- Pinned posts do not contribute to recency, frequency, observed gaps or calendar cells. Undated/future posts do not contribute to time-based metrics.
- A complete empty sample can establish zero posts. An unknown empty sample or an all-pinned sample cannot. Counts are lower bounds when all fetched eligible posts fall inside 30 days or missing dates prevent certainty.
- Calendars show observed posts, not a claim of complete coverage. Partial history can underestimate gaps. All dates displayed in reports use Asia/Kolkata.
- Unknown profile checks are excluded; known absent checks fail. Every measured profile check is equally weighted.
- Private/failed/unknown platforms are excluded. A team-confirmed missing platform scores zero only if it matters for the selected industry and is enabled. No-account confirmations are user assertions, not scraper observations.
- Settings and service copy live in the DB; each audit snapshots them. The full editing UI is deliberately deferred to milestone 11. Placeholder benchmarks are not market claims.
- Future website freshness is accepted as a nullable normalized score because the brief specifies no freshness threshold and gives it weight zero. Define that policy before enabling a nonzero weight.
- Costs are known USD totals, with unmeasured runs called out. Monthly history includes retained audits only; deleting an audit also removes its cost records.

## Architecture and deployment

`src/lib/collectors` contains the common Zod contract and mock adapter. `metrics`, `scoring` and `recommendations` are pure modules. `jobs/worker.ts` runs independently of Next.js. `src/components/report` is shared between screen and print. `src/lib/pdf` uses an authenticated Chromium context limited to APP_ORIGIN; it never accepts a caller-supplied rendering URL. Chromium instances are closed in finally blocks; at most two exports render concurrently per server process.

For a local production smoke run, set a non-placeholder APP_PASSWORD, then `npm run build` and `npm run start`, with a worker in a second terminal. Keep the configured APP_ORIGIN reachable by Chromium. HTTPS origins use secure session cookies. This version needs a persistent Node process, writable database storage and Chromium; a stateless serverless deployment will need a separately hosted worker and database.

SQLite is the allowed local-development choice. PostgreSQL deployment requires changing the Prisma provider and generating a PostgreSQL migration from the same logical model; do not apply the SQLite SQL migration to PostgreSQL. Plan data transfer before moving existing audits. No live production deployment is claimed at this checkpoint.

Prisma 6 is pinned for its SQLite workflow. A `deepmerge-ts` override addresses its transitive advisory; migration/generation/build checks cover that override. Vitest and Node types were updated together. Commit the lockfile and use `npm ci` for reproducibility.
