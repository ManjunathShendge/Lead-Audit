# Synthetic collector fixtures

All `raw-mock-*.json` files are generated locally by `node scripts/generate-fixtures.mjs`. They are deliberately **not** Apify or YouTube responses and must never be used to claim live accuracy. Three fictional brands exercise strong, average and weak activity. Dates are anchored to the audit timestamp; the exact hydrated raw result is saved verbatim on each CollectorRun. Profile/post numbers come directly from that stored result. Post links are null because synthetic posts have no live destination.

Real responses belong in separate `raw-live-*.json` files only after the milestone 5 review and provision of API credentials. Review for secrets before committing those files.
