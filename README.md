# Tier2 Social Profile Audit

An internal Next.js workspace that turns a website or confirmed social handles into an explainable social presence report. All eleven milestones are implemented, and every collector has been run against a real account. Collection is live. The one thing still unproven is collector **accuracy** — see **Live phase status** below.

## What works

- Password login with expiring, hashed session tokens, HTTP-only cookies, origin checks and login throttling.
- Website/handle input, editable account confirmation, three synthetic scenarios, and explicit present / unknown / no-account states.
- Durable SQLite/Prisma job queue with parallel platform jobs, atomic claims, crash recovery leases, one retry and a 180-second attempt timeout.
- Snapshot-based metrics and scores, missing-value re-normalization, industry relevance and service recommendations.
- Dark responsive reports, all requested charts, raw source inspection and light A4 PDF exports with branding on every page and a score-reference appendix.
- Audit history, cache reuse, fresh re-runs, collection costs and permanent deletion of audits plus their raw records.
- Seeded weights, placeholder benchmarks, service mappings and three demo reports, all editable on the configuration page.
- Website and Google Business Profile scoring functions are ready for future collectors.
- Real website crawling that discovers social handles, with guards against reaching private or internal addresses.
- An accuracy harness that grades a collector against hand-entered truth and exports CSV.

## Live phase status

The milestone 5 review gate has been passed and live integration work has started. What is true right now:

| Capability                 | State                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Website → handle discovery | **Live.** Real Playwright crawl, verified on 10/10 test sites. No key, no cost.                |
| YouTube collector          | **Live, verified** against a real channel. 3 quota units per audit, no cost.                   |
| Instagram collector        | **Live, verified** against a real profile. ~$0.027 per audit at 30 posts.                      |
| Facebook collector         | **Live, verified.** Page actor plus posts actor. ~$0.121 per audit at 30 posts.                |
| LinkedIn collector         | **Live, verified.** Company actor plus posts actor. Degrades to Not measured on posts failure. |
| Accuracy harness           | **Live** at `/accuracy`, with grading and CSV export.                                          |
| Editable settings          | **Live** at `/settings`.                                                                       |

Every collector has been run against a real account and its raw response saved under
`fixtures/<platform>/raw-live-*.json`. `tests/live-fixtures.test.ts` re-runs the normalizers over those
saved responses, so a field rename in a third-party actor fails a test rather than a client report.

**The 95% accuracy / 90% coverage targets are still not established.** A collector returning plausible
numbers is not the same as a collector returning correct ones. Run `/accuracy` against real accounts and
enter the true values before showing a report to a prospect.

### What the selected actors do not return

These stay null and appear under Data notes. They are never scored as zero.

- **Instagram:** total post count, category, business flag, bio link. Profile completeness therefore scores
  on bio and avatar only, re-normalised, and activity counts are always lower bounds.
- **Facebook, LinkedIn:** no total post count, so their samples are never provably complete either.
- **Facebook:** the posts actor omits `comments` entirely on posts that have none, while still emitting
  `shares: 0`. An absent count cannot be told apart from a genuine zero, so it stays null; the report states
  how many posts were affected and warns that engagement may read higher than it is.

### Selected Apify actors (milestone 9)

No single actor returns both page metadata and posts, so Facebook and LinkedIn each run a pair. All four are
no-login, no-cookie, pay-per-result actors.

| Platform | Actor                                     | Env var                      | Headline price | Covers                                        |
| -------- | ----------------------------------------- | ---------------------------- | -------------- | --------------------------------------------- |
| Facebook | `apify/facebook-pages-scraper`            | `APIFY_ACTOR_FACEBOOK`       | $5.40 / 1k     | followers, likes, category, website, avatar   |
| Facebook | `apify/facebook-posts-scraper`            | `APIFY_ACTOR_FACEBOOK_POSTS` | $2.00 / 1k     | post date, likes, comments, shares, reactions |
| LinkedIn | `automation-lab/linkedin-company-scraper` | `APIFY_ACTOR_LINKEDIN`       | ~$3.00 / 1k    | followers, employee count, industry, website  |
| LinkedIn | `harvestapi/linkedin-company-posts`       | `APIFY_ACTOR_LINKEDIN_POSTS` | $1.50 / 1k     | post date, reactions, comments, reposts       |

Roughly $0.065 per Facebook audit and $0.048 per LinkedIn audit at 30 posts each, so the $5 monthly free
Apify credit covers on the order of 30–45 full audits. Prices are headline rates and vary by Apify plan tier.
Swap any actor by changing its env var, but capture and test a real response afterwards: a new actor with a
different output schema will read as "Not measured" plus a warning, not as a wrong number.

Collection mode is controlled by `USE_MOCK_DATA`. Discovery ignores it and always crawls for real. In live
mode, a platform with no configured collector produces a failed run with a stated reason; it never produces
a zero or a guessed number, and the rest of the audit still completes.

### Capturing a real response before trusting a collector

Brief section 0.4 requires one real call per collector, saved verbatim, before the normalizer is trusted.

```powershell
npx.cmd tsx scripts/capture-fixture.ts youtube @tier2digital
npx.cmd tsx scripts/capture-fixture.ts instagram tier2digital --confirm-cost
npx.cmd tsx scripts/capture-fixture.ts facebook tier2digital --confirm-cost
npx.cmd tsx scripts/capture-fixture.ts linkedin tier2digital --confirm-cost
```

The response is saved to `fixtures/<platform>/raw-live-<handle>.json` and the normalized summary is printed.
Compare followers, total posts and last post date against the live profile before trusting the output.
Every paid platform refuses to run without `--confirm-cost`, because each call spends Apify credit. YouTube
needs no flag; it uses the free quota.

If a capture returns `Not measured` for a field, the actor's output schema differs from the candidate names
in that collector. Read the saved raw JSON, add the real field name to the relevant `*_FIELDS` map in
`src/lib/collectors/`, and re-run. If a capture returns nothing at all, the actor's **input** schema differs:
check the actor's input documentation and adjust the object passed to `runActor`.

After changing a `*_FIELDS` map, re-check against the responses you already captured instead of paying for
another run:

```powershell
npx.cmd tsx scripts/recheck-live.ts
```

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
| USE_MOCK_DATA                   | `true` uses synthetic fixtures and needs no keys. `false` switches collection to live. Discovery crawls for real either way.               |
| APP_PASSWORD                    | Shared internal password. Never sent in report payloads.                                                                                   |
| APP_ORIGIN                      | Exact app origin, default `http://localhost:3000`. Used for origin checks and trusted PDF navigation. Open the app using this same origin. |
| PLAYWRIGHT_BROWSERS_PATH        | `./.browsers`; install and run Chromium with the same path.                                                                                |
| AUDIT_CACHE_DAYS                | Cache offer window, default 7. Cache keys include confirmed handles, brand context, industry, fixture scenario and scoring configuration.  |
| APIFY_TOKEN                     | Server-only. Enables the Instagram collector. Real runs spend Apify credit.                                                                |
| YOUTUBE_API_KEY                 | Server-only. Enables the YouTube collector. Free quota; no money is spent.                                                                 |
| APIFY_ACTOR_INSTAGRAM           | `hpix/instagram-scraper`. Swapping the ID alone is not enough if the output schema changes; capture and test the new response.             |
| APIFY_ACTOR_FACEBOOK / LINKEDIN | Intentionally blank until actors are proposed and approved. Blank means those platforms fail cleanly rather than guessing.                 |

`USE_MOCK_DATA=false` switches collection to live. Discovery crawls real websites in either mode.

Do not prefix secrets with `NEXT_PUBLIC_`. Obtain the Apify token from the account's API settings and a YouTube Data API v3 key from a Google Cloud project with that API enabled. Save one actual response per collector before trusting its normalizer. Changing an actor ID alone is insufficient if its output schema changes: capture and test the new response. The Instagram collector never enables `scrape_detailed_data` or `scrape_restricted_posts`, which are paid add-ons.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

**The E2E suite requires `USE_MOCK_DATA=true`.** That is deliberate: brief section 0.3 says tests must never
call a paid API. Now that collection is live, set `USE_MOCK_DATA=true` before running `npm run test:e2e`,
restart the worker, run it, then set it back to `false`. Running the suite in live mode would spend Apify
credit on every audit it creates, so the audit API refuses to reuse a mock cache entry across modes.

E2E requires `.env` with `USE_MOCK_DATA=true`, seeded DB and installed Chromium. It starts a web server if necessary and a worker, runs an authenticated audit, verifies raw sources, downloads a real PDF, reuses the cache and deletes its audit. A second test checks API auth, cross-origin rejection, validation and confirmed-absent accounts. Tests never call a paid API. Do not run the E2E suite against a live production database.

Additional review helpers (with the dev app running):

```powershell
node scripts/ui-smoke.mjs
node scripts/pdf-smoke.mjs
npx.cmd tsx scripts/discovery-check.ts   # crawls 10 real sites; milestone 8 bar is 8/10
```

`discovery-check.ts` makes real outbound requests to public websites. It uses no API key and costs nothing.

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

## Accuracy harness (`/accuracy`)

This is how you decide whether a scraper is worth paying for, and it is the only thing that can establish the
brief's 95% accuracy / 90% coverage targets.

1. Paste up to 50 accounts, one per line, as `platform: handle`.
2. The worker collects each one through the same durable queue rules as an audit: atomic claims, a 185-second
   lease, one retry and a 180-second timeout. Cost accrues per item and is shown per run.
3. Type the true followers, total posts and last post date, read from the live platform.
4. Counts are graded correct within 2% (minimum 1). Dates must match the exact calendar day in Asia/Kolkata.
5. **Accuracy** = correct ÷ values returned, over fields where you supplied a truth. **Coverage** = values
   returned ÷ values attempted. Each is green or red against its target.
6. Export CSV per run. Deleting a run removes its items.

A field you leave blank counts toward coverage but is excluded from accuracy, so a partially graded run
never inflates its own accuracy. In mock mode the harness grades synthetic fixtures and proves only that the
harness itself works.

## Editable settings (`/settings`)

Channel, component, website and Google Business Profile weights, per-industry platform weights and relevance,
enabled platforms, thresholds and benchmarks are all editable and validated server-side with the same Zod
schema used for scoring. Weights do not need to total 100 because missing components are re-normalised.
Saving a benchmark row clears its placeholder flag. **Changes apply to new audits only**; every past audit
keeps the configuration snapshot it was run with. "Restore defaults" resets weights without touching
benchmarks. Actor IDs and keys are read from the server environment and never sent to the browser; the page
shows only whether each value is set.

## Architecture and deployment

`src/lib/collectors` contains the common Zod contract, the mock adapter and the live `instagram.ts` and
`youtube.ts` collectors. `index.ts` is the registry: `liveAvailability()` decides, per platform, whether a
live collector is configured, and `getCollector()` refuses to mix a mock audit with a live server or the
reverse. `fields.ts` is the tolerant reader used where a third-party schema is not contractually fixed; it
tries several candidate names and reports the ones that matched in the stored raw record, so a silent field
rename shows up as "Not measured" plus a warning rather than a wrong number.

`src/lib/discovery` crawls a website for profile links. `net.ts` rejects non-public targets before any
request: non-http(s) schemes, credentials in the URL, non-standard ports, `localhost`, and any hostname that
resolves to a loopback, private, link-local, carrier-grade-NAT or cloud-metadata address. Requests made by
the page are checked against the same rules, images and fonts are blocked, and the crawl is capped at four
pages, a 25-second page timeout, a 75-second total budget and two concurrent crawls per process.

`src/lib/accuracy` holds the pure grading functions and the CSV writer, which prefixes leading `=`, `+`, `-`
and `@` to neutralise spreadsheet formula injection from scraped text. `metrics`, `scoring` and `recommendations` are pure modules. `jobs/worker.ts` runs independently of Next.js. `src/components/report` is shared between screen and print. `src/lib/pdf` uses an authenticated Chromium context limited to APP_ORIGIN; it never accepts a caller-supplied rendering URL. Chromium instances are closed in finally blocks; at most two exports render concurrently per server process.

For a local production smoke run, set a non-placeholder APP_PASSWORD, then `npm run build` and `npm run start`, with a worker in a second terminal. Keep the configured APP_ORIGIN reachable by Chromium. HTTPS origins use secure session cookies. This version needs a persistent Node process, writable database storage and Chromium; a stateless serverless deployment will need a separately hosted worker and database.

SQLite is the allowed local-development choice. PostgreSQL deployment requires changing the Prisma provider and generating a PostgreSQL migration from the same logical model; do not apply the SQLite SQL migration to PostgreSQL. Plan data transfer before moving existing audits. No live production deployment is claimed at this checkpoint.

Prisma 6 is pinned for its SQLite workflow. A `deepmerge-ts` override addresses its transitive advisory; migration/generation/build checks cover that override. Vitest and Node types were updated together. Commit the lockfile and use `npm ci` for reproducibility.
