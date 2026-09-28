# Milestone 5 review checkpoint

Verified locally on 28 September 2026, Node.js 22.18.0 / Windows.

| Check                    | Result                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Vitest                   | 47 tests passed in 6 suites                                                                                  |
| Playwright E2E           | 2 passed: authenticated audit/PDF/cache/delete; API boundaries/absent account                                |
| TypeScript strict check  | Passed                                                                                                       |
| ESLint                   | Passed                                                                                                       |
| Next.js production build | Passed; all 14 application routes generated                                                                  |
| Dependency audit         | 0 known vulnerabilities                                                                                      |
| Empty database setup     | Migration, client generation and seed passed against a separate test database                                |
| Browser visual smoke     | Strong, average and weak reports; no page errors; tablet has no page overflow                                |
| PDF export               | Valid PDFs for all three scenarios, real authenticated print route and rendered charts                       |
| PDF visual inspection    | Every page inspected; 7 pages average, 6 strong, 7 weak; A4 portrait; no clipped content or spill-only pages |

The development workspace remains in mock mode. No live API calls were made. All raw response fixtures are explicitly synthetic. These checks do **not** establish live scraper accuracy, real-world discovery coverage, or production deployment readiness.

PDF samples are generated under `output/pdf/`; screenshot previews and rendered PDF pages are under `artifacts/`. These are ignored build outputs. Use the scripts in README.md to reproduce them.

## Edge cases exercised

- No posts versus unknown collection; all posts pinned; inclusive date windows; future/undated posts.
- Hidden counts, private profiles, null and zero followers; independent averages and top-post eligibility.
- Kolkata date boundaries; partial sample lower bounds; observed versus proven posting gaps.
- Null component re-weighting, exact score-band boundaries, log bands, disabled and irrelevant platforms.
- Confirmed absent relevant platforms; all missing website/GBP criteria; configurable website subweights.
- Invalid handles, wrong platform hosts, share/post links, LinkedIn personal profiles and contradictory confirmation states.
- Worker timeout, one retry, failed-run data preservation, claim contention and live-mode refusal.
- Unauthenticated raw/PDF access, cross-origin mutations, invalid audit bodies, cascading deletion and cache reuse.

## Live phase verification (28 September 2026)

| Check                          | Result                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Vitest                         | 105 tests passed in 11 suites (was 47 in 6)                                                        |
| TypeScript strict check        | Passed                                                                                             |
| ESLint                         | Passed                                                                                             |
| Next.js production build       | Passed; 19 application routes generated (was 14)                                                   |
| Live discovery, 10 real sites  | 10/10 found at least one handle, against the milestone 8 bar of 8/10                               |
| Discovery per platform         | Instagram 10/10 · Facebook 10/10 · LinkedIn 5/10 · YouTube 4/10                                    |
| SSRF guard                     | Unit-tested against loopback, private, link-local, CGNAT, metadata, `file:` and credentialed URLs  |
| Live captures, all 4 platforms | YouTube, Instagram, Facebook and LinkedIn each run against a real account and saved to `fixtures/` |
| Total live spend               | **$0.148** across 6 Apify actor runs; YouTube used 3 free quota units                              |
| Live normalizer regressions    | `tests/live-fixtures.test.ts` re-runs the normalizers over the captured responses                  |
| Playwright E2E                 | **Not re-run.** Needs a restarted dev server and worker; the running ones predate these changes    |
| Prisma engine binary           | `prisma generate` wrote the client types but could not replace `query_engine-windows.dll.node`     |

New edge cases exercised: candidate-field fallback and total-miss warnings; hidden and negative counts read
as null; unix-seconds, unix-millis and ISO date parsing; private and not-found Instagram responses; posts
limit enforcement; ISO-8601 duration parsing; accuracy tolerance boundaries at exactly 2% and the minimum of
1; Kolkata day-boundary date grading; coverage versus accuracy when a value is missing or a truth is blank;
CSV quoting and formula-injection neutralisation; share, intent, post, personal-profile and platform-internal
link rejection during discovery; Facebook page-likes versus followers; LinkedIn employee-range parsing; and
both paired collectors degrading to `partial` when only their posts actor returns nothing.

## What the live captures corrected

Three defects that only a real response could have exposed:

1. **Instagram profile misses were silently dropped.** `p.warnings()` ran before `displayName`, `bio`,
   `bioLink` and `avatar` were read, so those fields could fail to match without any warning. Fixed by
   reading every profile field before computing warnings.
2. **Pinned posts were invisible.** The actor flags them `pinned_for_users`, not `is_pinned`. Undetected,
   pinned posts would have corrupted last-post date, 30-day counts and the calendar.
3. **The LinkedIn posts actor takes `targetUrls` with full URLs**, not a slug. The first capture returned
   nothing, which the collector reported as "the posts scraper returned nothing" and a `partial` status
   rather than inventing a zero.

**The 95% accuracy / 90% coverage targets remain unestablished.** Plausible numbers are not verified
numbers. They can only be measured by running `/accuracy` against real accounts with hand-entered truths.

## Review gate

Per BUILD_BRIEF.md: **“Stop after Milestone 5 and show me the report UI before starting the live integrations.”** That gate was reached, the report was reviewed, and the user authorised the live phase on 28 September 2026. Milestones 8, 10 and 11 are now complete; the settings page is editable; the accuracy harness exists; Facebook and LinkedIn actors were proposed and selected.

Both keys are now set, all four collectors have been captured and corrected, and `USE_MOCK_DATA=false`. The single remaining gate before a report is shown to a prospect is `/accuracy`: run a list of real accounts, enter the true values, and confirm each platform clears 95% accuracy and 90% coverage.
