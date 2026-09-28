# Build Brief: Tier2 Social Profile Audit Tool

> **How to use this file:** Put it in the root of an empty project folder, open Claude Code there, and say:
> _"Read CLAUDE_BUILD_BRIEF.md and build the project milestone by milestone. Start with Milestone 0."_

---

## 0. Instructions for Claude Code (read first)

You are building a production-quality web app for **Tier2 Digital**, a digital marketing agency in Bengaluru, India (https://www.tier2.digital). Follow these working rules:

1. **Plan before coding.** Start by writing `PLAN.md`: your file structure, data model and milestone checklist. Then build.
2. **Work milestone by milestone** (Section 12). After each one, run the app, run the tests, fix what fails, commit with a clear message, and tick the milestone off in `PLAN.md`.
3. **Mock mode first.** The whole app must run with `USE_MOCK_DATA=true` and no API keys, using realistic fixture data. Live scrapers cost money (the Apify free plan is only $5 of credit a month), so never call a paid API in tests.
4. **Never guess third-party field names.** For every scraper or API, make one real call (only when the user provides a key), save the raw response to `fixtures/<platform>/raw-*.json`, and write the normalizer against that saved response. Where the output schema is unknown, the normalizer must try several candidate field names and log a warning when none matches.
5. **Missing data is never zero.** If a value cannot be collected, store `null` and show "Not measured" in the UI. A failed platform must not fail the whole audit.
6. **Keep secrets on the server.** API tokens must never reach the browser.
7. **Stop and ask me** when a decision changes cost, legal risk or the data model.
8. **Keep it extendable.** A website audit, AI proposal and lead scorer will be added later, so the code must be organised to take them (Section 13).

---

## 1. What we're building

A web app where a Tier2 team member enters a brand's **website URL** or its **social handles** and clicks **Run audit**. In 1–3 minutes they get a visual **Social Presence Report** covering Instagram, Facebook, LinkedIn and YouTube, with scores, charts, gaps and recommended Tier2 services. The report can be viewed in the app and downloaded as a PDF.

**Who uses it:** Tier2 sales and strategy staff, internally. It is not public-facing in v1.

**What "done" means for v1:**

- One click from input to report. The only manual step is confirming the discovered handles.
- Every number in the report traces back to a stored raw API response.
- Scrapers pass the accuracy test in Section 9: at least **95% accuracy** and at least **90% coverage** per platform.
- The report looks polished enough to show a prospect.

---

## 2. Tech stack

Use this stack unless you have a strong reason not to. If you want to change something, explain why in `PLAN.md` first.

| Layer         | Choice                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------- |
| Framework     | **Next.js (App Router) + TypeScript** (strict mode)                                           |
| Styling       | **Tailwind CSS** + CSS variables for the brand theme                                          |
| Charts        | **Recharts** (or ECharts if the calendar heatmap needs it)                                    |
| Animation     | **Framer Motion** (score rings counting up, cards fading in)                                  |
| Database      | **PostgreSQL + Prisma**. SQLite is fine for local development.                                |
| Jobs          | A simple DB-backed job queue; the UI polls the job status. No Redis in v1.                    |
| Scraping      | **Apify** via the `apify-client` npm package                                                  |
| YouTube       | **YouTube Data API v3** (official, free quota)                                                |
| Website crawl | **Playwright** (headless Chromium), used to find social links                                 |
| PDF           | **Playwright** `page.pdf()` rendering the report's print route, so the PDF matches the screen |
| Validation    | **Zod** for every external response and every API route input                                 |
| Tests         | **Vitest** for unit tests; **Playwright Test** for one end-to-end test in mock mode           |
| Auth          | Simple password login from an env var in v1 (internal tool). Keep it swappable.               |

---

## 3. Environment variables

Create `.env.example`:

```
DATABASE_URL="file:./dev.db"
USE_MOCK_DATA=true
APP_PASSWORD=change-me
APIFY_TOKEN=
YOUTUBE_API_KEY=
# Apify actor IDs, configurable so a broken scraper can be swapped without code changes
APIFY_ACTOR_INSTAGRAM=hpix/instagram-scraper
APIFY_ACTOR_FACEBOOK=
APIFY_ACTOR_LINKEDIN=
AUDIT_CACHE_DAYS=7
```

---

## 4. Data sources

Every platform is a **collector module** with the same interface (Section 5). Only public data may be collected: never log in, never use cookies or fake accounts.

### 4.1 Instagram: Apify actor `hpix/instagram-scraper`

This actor was already tested manually. Known facts from its documentation:

- **Input:** `profiles` (array of usernames or URLs), `scrape_profile_data` (bool), `scrape_posts` (bool), `scrape_reels` (bool), `posts_per_account` (int, default 12), `include_raw_data` (bool; keep it `true`), `fromDate` / `toDate` (strings).
  - Do **not** enable `scrape_detailed_data` or `scrape_restricted_posts`; they are paid add-ons.
- **Output:** each dataset item has a `kind` (`profile`, `post`, `reel`) and a `data` object with the raw Instagram fields.
- **Known limits:** private accounts can't be scraped; some posts hide their like counts; reels view counts are only available per post URL.
- **Call:** `client.actor(ACTOR).call(input)`, then `client.dataset(run.defaultDatasetId).listItems()`. Record the run's cost from the Apify run object for cost tracking.
- **Candidate field names for the normalizer** (confirm them against a real saved response):
  - followers: `follower_count` | `followers_count` | `edge_followed_by.count`
  - following: `following_count` | `edge_follow.count`
  - total posts: `media_count` | `edge_owner_to_timeline_media.count`
  - post date: `taken_at` (unix seconds) | `taken_at_timestamp` | `timestamp`
  - likes: `like_count` | `edge_liked_by.count` (negative or missing = hidden → `null`)
  - comments: `comment_count` | `edge_media_to_comment.count`
  - reel: `kind === 'reel'` or `product_type === 'clips'`
  - pinned: `is_pinned` or a non-empty `timeline_pinned_user_ids`
  - business account: `is_business` | `is_business_account` | `is_professional_account`; category: `category` | `category_name`

### 4.2 Facebook Page and LinkedIn company page: Apify actors (to be chosen)

1. Search the Apify Store for well-maintained actors: a recent update, high monthly users, pay-per-result pricing, **no cookies or login required**.
2. Propose 2 candidates per platform to me, with price and fields, **before** wiring one in.
3. The actor ID comes from an env var (Section 3), so it can be swapped.
4. Target fields:
   - **Facebook:** followers, likes, last post date, posts in the last 30 days, reactions and comments per post.
   - **LinkedIn company page:** followers, employee range, last post date, posts in the last 30 days, reactions and comments per post.
5. **LinkedIn is the platform most likely to break.** Design so that a LinkedIn failure degrades cleanly to "Not measured".

### 4.3 YouTube: official YouTube Data API v3

- Resolve the channel from a handle (`@name`), channel URL or channel ID.
- Collect subscribers (`hiddenSubscriberCount` → show "Hidden"), video count, total views, and the last 10 uploads with date, views, likes and comments.
- Keep quota use low: batch video IDs in a single `videos.list` call.

### 4.4 Profile discovery from a website

Given a website URL:

1. Load the homepage with Playwright and wait for it to finish loading.
2. Collect all links to instagram.com, facebook.com, linkedin.com/company, youtube.com and x.com / twitter.com.
3. Normalise them to handles. Ignore share links and intent links (such as `sharer.php` or `/intent/`).
4. If a platform isn't found on the homepage, also check the page footer and the `/contact` and `/about` pages.
5. Show the discovered handles in an editable confirmation step before the audit runs.

---

## 5. Architecture and code structure

```
/app                      Next.js routes (UI + API route handlers)
  /(app)/audits/new       input + handle confirmation
  /(app)/audits/[id]      live progress → report
  /(app)/audits/[id]/print   print-optimised report used for PDF
  /(app)/history          past audits
  /(app)/settings         weights, benchmarks, platform toggles
  /(app)/accuracy         accuracy test harness (Section 9)
  /api/...                route handlers
/lib
  /collectors             one file per platform, same interface
    types.ts              Collector interface + normalized schema
    instagram.ts  facebook.ts  linkedin.ts  youtube.ts
    mock/                 fixture-backed mock collectors
  /discovery              website → handles
  /metrics                pure functions: frequency, gaps, engagement…
  /scoring                pure functions: component + platform + overall scores
  /recommendations        gap → Tier2 service mapping
  /jobs                   DB-backed queue + worker loop
  /pdf                    Playwright PDF render
/components/report        all report visuals
/fixtures                 saved raw responses per platform
/prisma                   schema + seed (benchmarks, weights, demo audits)
/tests
```

### Collector interface

```ts
interface Collector {
  platform: 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'x';
  collect(handle: string, opts: { postsLimit: number }): Promise<CollectorResult>;
}

interface CollectorResult {
  status: 'ok' | 'partial' | 'not_found' | 'private' | 'failed';
  profile: NormalizedProfile | null;
  posts: NormalizedPost[];
  raw: unknown; // stored verbatim in the DB for traceability
  costUsd: number | null;
  warnings: string[];
  fetchedAt: string; // ISO
}

interface NormalizedProfile {
  handle: string;
  displayName: string | null;
  url: string;
  followers: number | null;
  following: number | null;
  totalPosts: number | null;
  verified: boolean | null;
  isBusiness: boolean | null;
  category: string | null;
  bio: string | null;
  bioLink: string | null;
  avatarUrl: string | null;
}

interface NormalizedPost {
  id: string;
  url: string | null;
  publishedAt: string | null;
  type: 'image' | 'video' | 'carousel' | 'reel' | 'text' | 'link';
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  isPinned: boolean;
  captionPreview: string | null;
}
```

**Job flow:** create an audit → discover handles → user confirms → enqueue one job per platform → run the collectors in parallel → compute metrics and scores → mark the audit complete. The progress screen polls the audit status and shows each platform's state (queued / running / done / failed).

**Caching:** if the same handle was audited within `AUDIT_CACHE_DAYS`, offer to reuse that audit or re-run it.

---

## 6. Metrics (pure functions, unit-tested)

Compute these per platform from the normalized data. Exclude pinned posts from anything about recency or frequency.

| Metric                   | Definition                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Posts last 30 days       | Non-pinned posts published in the last 30 days. If every fetched post falls inside the window, show "≥ N".          |
| Last post date           | Most recent non-pinned post.                                                                                        |
| Longest gap (90 days)    | Largest gap in days between consecutive posts in the last 90 days, including the gap from the latest post to today. |
| Avg likes / avg comments | Average over posts where the value is not `null`.                                                                   |
| Engagement rate          | (avg likes + avg comments) ÷ followers × 100. `null` if followers is `null`.                                        |
| Content mix              | Share of reels/videos vs static posts.                                                                              |
| Profile completeness     | Bio, link in bio, business/category set, avatar present: 25 points each.                                            |
| Top posts                | Top 3 by likes + comments.                                                                                          |

---

## 7. Scoring framework

All weights, thresholds and benchmarks are stored in the DB and editable on the Settings page. Seed them with the defaults below. Every scoring function is a pure, unit-tested function in `/lib/scoring`.

### 7.0 Overall Digital Presence Score

```
Overall = Website 40% + Social 40% + Google Business Profile 20%
```

- **v1 builds only the social collectors.** The website and Google Business Profile collectors come in a later phase (Section 13).
- **Build the scoring module, DB config and Settings page for all three channels now,** so those collectors plug in without refactoring.
- **A channel with no collector yet is left out and the other weights are re-normalised.** When only social is measured, label the hero score "Social Presence Score". Once all three channels are measured, label it "Digital Presence Score".

### 7.1 Social score (v1)

Each platform gets a score from 0 to 100, made up of four components:

| Component                | Weight | What it checks                                                     | How it scores                                                                                                        |
| ------------------------ | ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Activity**             | 35%    | Posts in the last 30 days, and the longest gap in the last 90 days | At or above the industry benchmark = 100, linear below; minus 20 points if the longest gap is over 21 days (floor 0) |
| **Engagement**           | 35%    | Engagement rate = (avg likes + avg comments) ÷ followers × 100     | At or above the industry benchmark = 100, linear below                                                               |
| **Audience**             | 15%    | Follower count                                                     | Placed within the industry follower band on a log scale (bottom of band = 20, top of band or above = 100)            |
| **Profile completeness** | 15%    | Bio, link in bio, business/category set, profile photo             | 25 points each                                                                                                       |

**Social score** = weighted average of the platform scores.

- Default platform weights: **Instagram 35, LinkedIn 25, Facebook 20, YouTube 20**.
- Store per-industry overrides. Seed two: B2B (LinkedIn 40, Instagram 20, Facebook 15, YouTube 25) and D2C (Instagram 45, Facebook 25, YouTube 20, LinkedIn 10).

### 7.2 Website score (scoring module now, collector later)

| Criterion              | Weight        | What it checks                                       | How it scores                                                                                                                                                                                |
| ---------------------- | ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**        | 30%           | Mobile PageSpeed performance score + Core Web Vitals | 60% = PageSpeed performance score (median of 3 runs); 40% = Core Web Vitals, each of LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 worth a third (field data if available, else lab)               |
| **SEO basics**         | 30%           | PageSpeed SEO score + on-page checklist              | 50% = PageSpeed SEO score; 50% = checklist with equal points each: title tag, meta description, exactly one H1, ≥ 90% of images with alt text, schema markup, sitemap.xml, robots.txt, HTTPS |
| **Tracking installed** | 20%           | Analytics and ad pixels                              | GA4 or Google Tag Manager 40, Meta Pixel 30, Google Ads tag 15, LinkedIn Insight Tag 15                                                                                                      |
| **Conversion basics**  | 20%           | Ways to convert a visitor                            | Contact form 30, clear call to action above the fold 30, WhatsApp button 20, click-to-call link 20                                                                                           |
| **Content freshness**  | 0% (optional) | Latest blog post date, footer copyright year         | Collected and shown in the report; weight 0 by default, editable in Settings                                                                                                                 |

### 7.3 Google Business Profile score (scoring module now, collector later)

| Criterion                | Weight | How it scores                                           |
| ------------------------ | ------ | ------------------------------------------------------- |
| **Star rating**          | 40%    | 4.5 or above = 100; 3.0 or below = 0; linear between    |
| **Review count**         | 30%    | Against the industry benchmark band, log scale          |
| **Owner replies**        | 15%    | Share of the latest 10 reviews with an owner reply      |
| **Profile completeness** | 15%    | Category, hours, phone, website, photos: 20 points each |

### 7.4 Rules (apply to every channel)

- **Missing data is left out, not scored as 0.** A component or criterion that is `null` (private account, hidden likes, collector failed) is excluded and the remaining weights are re-normalised. The report lists it under "Data notes".
- **A missing platform that matters does score 0.** A platform that matters for the lead's industry but has **no account** (e.g. no Instagram for a D2C brand, no LinkedIn for a B2B company) scores 0 and appears as a gap. Store "which platforms matter" per industry in the DB.
- **Low scores become gaps.** Any component or criterion scoring **below 50** becomes a gap in the Gaps section, mapped to a Tier2 service (Section 10). Show the 6 lowest.
- **Bands:** **80+ Strong · 60–79 Good · 40–59 Needs work · below 40 Weak.** Use the same bands for the overall score, channel scores and platform scores.
- **Benchmarks:** seed a `Benchmark` table with clearly marked placeholder values. It holds, per industry × platform: target posts per month, target engagement rate %, follower band (low–high), and review-count band for Google Business Profile. Show a banner on the Settings page: _"Placeholder benchmarks, replace them with Tier2 data."_
- **Explainability:** every score in the UI has a tooltip or expandable row showing its components, their raw values and the weights used.

---

## 8. Report UI: this is the showcase, make it look great

**Look:** modern, premium, dark theme by default with a light print theme. Brand colours live in CSS variables (`--brand-primary`, `--brand-accent`) so Tier2 can drop in its real palette. Use a placeholder "Tier2" wordmark until the logo is provided. Target the quality of a polished SaaS dashboard, not a template.

**Report sections, in order:**

1. **Header:** brand name, website, audit date, handles audited.
2. **Hero score:** a large animated ring with the Social Presence Score and its band, plus a one-sentence verdict (e.g. "Strong on Instagram, invisible on LinkedIn").
3. **Platform cards:** one per platform, each with a mini score ring, followers, posts in the last 30 days, engagement rate, last post, a status badge, and "Not measured" states where data is missing.
4. **Radar chart:** the four components compared across platforms.
5. **Posting activity calendar:** a GitHub-style heatmap of the last 90 days with a row per platform, so gaps are obvious at a glance.
6. **Engagement vs audience:** a bar or scatter chart per platform.
7. **Content mix:** a donut per platform (reels/video vs static).
8. **Top posts:** thumbnails or links, with likes and comments.
9. **Gaps and quick wins:** up to 6 gaps, each with the measured number, why it matters, and the Tier2 service that fixes it (Section 10).
10. **Data notes:** what couldn't be measured and why (private account, hidden likes, platform not found), plus the data timestamp.

**Other screens:**

- **New audit:** a single input that accepts a URL or handles, a discovery step with editable handle chips per platform, and a Run button.
- **Progress:** per-platform steps with live status and elapsed time.
- **History:** a table of past audits with score, date and a re-run button.
- **Settings:** weights, benchmarks, platform on/off switches, actor IDs (read-only, from env).

**Download:** a "Download PDF" button renders `/audits/[id]/print` via Playwright. The layout is A4 portrait, charts render correctly, page breaks fall between sections, and Tier2 branding appears on every page.

**Accessibility and responsiveness:** keyboard navigation works, colour is never the only signal, and the report is readable on a laptop and a tablet.

---

## 9. Accuracy test harness (`/accuracy`)

This is how we decide whether to pay for each scraper.

1. Upload or paste a list of test accounts (platform + handle), up to 50.
2. Run the collectors for all of them. Show progress and cost so far.
3. For each account, the tester types the true values from the live platform: followers, total posts, last post date.
4. Grade each field:
   - Counts are correct if they are within ±2% (minimum ±1).
   - Dates are correct if they match exactly, compared in the Asia/Kolkata timezone.
5. Show per platform:
   - **Accuracy** = correct ÷ values returned (target ≥ 95%).
   - **Coverage** = values returned ÷ values attempted (target ≥ 90%).
   - Each is shown green or red against its target.
6. Export the results to CSV and save each test run to the DB.

---

## 10. Gap → Tier2 service mapping (for the Gaps section)

| Gap detected                                        | Recommended Tier2 service                         |
| --------------------------------------------------- | ------------------------------------------------- |
| Low activity or long posting gaps                   | Branding & Social Media (content calendar)        |
| Low engagement rate                                 | Branding & Social Media (content strategy, reels) |
| Missing or weak LinkedIn for a B2B brand            | B2B Marketing                                     |
| Incomplete profiles, inconsistent bios or visuals   | Branding                                          |
| No reels/video in the content mix                   | Videos & Animation                                |
| Platform missing entirely                           | Digital strategy call                             |
| Slow site, failing Core Web Vitals                  | Web & UI                                          |
| Weak SEO basics (tags, schema, sitemap)             | SEO / AEO / GEO                                   |
| No analytics or ad pixels installed                 | Growth & Performance Marketing                    |
| Weak conversion basics (no form, CTA, WhatsApp)     | Web & UI + CRO                                    |
| Stale content (no recent blog posts)                | Copy & Content                                    |
| Low rating, few reviews, no owner replies on Google | Local SEO / reputation management                 |

Store this mapping in the DB. The copy stays editable.

---

## 11. Non-functional requirements

- **Errors:** retry each collector once, with backoff. After that, mark the platform `failed` with a reason and continue.
- **Timeouts:** 180 s per collector.
- **Cost tracking:** store `costUsd` per collector run; show the total per audit and per month on the History page.
- **Logging:** structured server logs per job, with no secrets in them.
- **Data retention:** keep raw responses; add a "delete audit" action.
- **Tests:**
  - unit tests for every metric and scoring function, including edge cases (no posts, all posts pinned, hidden likes, `null` followers);
  - normalizer tests against the saved fixtures;
  - one end-to-end test in mock mode that runs an audit and downloads the PDF.
- **Code quality:** no `any` without a comment, and ESLint + Prettier configured.

---

## 12. Milestones (build in this order)

| #   | Milestone                                                                                   | Done when                                              |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0   | `PLAN.md`, project scaffold, Prisma schema, env setup, password login                       | App boots; login works                                 |
| 1   | Normalized types, mock collectors with rich fixtures (3 demo brands: strong, average, weak) | `USE_MOCK_DATA=true` returns realistic data            |
| 2   | Metrics + scoring modules, with unit tests                                                  | All tests pass; scores match hand calculations         |
| 3   | Full report UI with all charts, running on mock data                                        | Report looks polished on all 3 demo brands             |
| 4   | New audit flow, job queue, progress screen, history                                         | End-to-end in mock mode                                |
| 5   | PDF export                                                                                  | The downloaded PDF matches the screen                  |
| 6   | Live Instagram collector (`hpix/instagram-scraper`) + saved fixtures                        | A real audit works for Instagram                       |
| 7   | Live YouTube collector                                                                      | A real audit works for YouTube                         |
| 8   | Website → handle discovery                                                                  | Handles are found for 8 of 10 test sites               |
| 9   | Propose, then wire in the Facebook and LinkedIn actors                                      | Real audits work, or degrade cleanly                   |
| 10  | Accuracy harness                                                                            | A CSV export of a test run is produced                 |
| 11  | Settings page, cost tracking, polish, README                                                | A teammate can set up and run it from the README alone |

**Stop after Milestone 5 and show me the report UI before starting the live integrations.**

---

## 13. Future phases (design for them, don't build them yet)

- **Website audit collector:** PageSpeed Insights API (free), a Playwright crawl for SEO tags, tracking pixels and conversion elements. It feeds the website scoring already defined in Section 7.2.
- **Google Business Profile collector:** via the Places API (rating, reviews, owner replies, profile fields). It feeds the scoring already defined in Section 7.3.
- **AI proposal:** the Claude API turns audit JSON into a branded Tier2 proposal, previewed and edited in the app, then downloaded. It may only use audited numbers.
- **Lead scorer integration:** an "Audit presence" button on each lead in Tier2's Referral Lead Scorer.
- **More platforms:** X, TikTok, Threads, each through the same `Collector` interface.

---

## 14. Out of scope for v1

- Logging in to any social platform, or using cookies.
- Follower lists or any personal data about followers.
- Scheduled or recurring monitoring.
- Multi-tenant or client-facing access.

---

## 15. Deliverables checklist

- [ ] Working app, runnable in mock mode with no keys
- [ ] `README.md`: setup, env vars, how to get the Apify and YouTube keys, how to run the tests, how to swap an actor
- [ ] `.env.example`
- [ ] Prisma schema, migrations and seed data (weights, benchmarks, 3 demo audits)
- [ ] Saved fixtures for every live collector
- [ ] Unit tests, normalizer tests and one end-to-end test, all passing
- [ ] `PLAN.md` with every milestone ticked
