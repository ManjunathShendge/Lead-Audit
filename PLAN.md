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
- [ ] 5: A4 Playwright PDF with branding and chart readiness; E2E download and visual verification; commit.
- [ ] REVIEW GATE: Show report to user before live integrations.
- [ ] 6: Verified Instagram collector and saved real response (requires key).
- [ ] 7: Verified YouTube collector (requires key).
- [ ] 8: Live discovery; 8/10 websites verified.
- [ ] 9: Propose two Facebook/LinkedIn actors each, user selection, then integrate.
- [ ] 10: Persisted accuracy harness and CSV.
- [ ] 11: Editable settings, final cost tracking and production readiness review.

## Verification
Each milestone gets appropriate tests and an app smoke check. Final checkpoint: TypeScript, ESLint, Vitest, production build, authenticated browser workflow and valid PDF download. Test no posts/all pinned, null/zero followers, hidden/negative counts, partial failures, date windows, weighted re-normalization, absent relevant platforms, disabled platforms, scoring bounds, auth, invalid input and cache reuse. Report any unavailable checks honestly.





