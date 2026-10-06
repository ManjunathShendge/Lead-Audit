# Deploying to Hostinger (Node.js web app, no VPS)

One Hostinger Node.js web app, a Supabase Postgres database and a Browserless remote browser.
There is no separate worker process.

```
Browser ──► Hostinger Node.js app ──► Supabase Postgres (audits, job queue, config)
            web UI + on-demand jobs ──► Browserless (website crawl, discovery, PDF printing)
                     ▲
            Hostinger cron ─ /api/jobs/tick (safety net)
```

## How audits run without a worker

- Creating an audit starts the job loop inside the web app immediately.
- While the progress page is open, each poll also keeps the loop running.
- When the app restarts, it resumes any queued or running audits about 5 seconds after start.
- The cron job calls `/api/jobs/tick` to resume anything left behind (for example after Hostinger idles the app).
- Retries, leases and progress tracking are unchanged and stored in the database. A collector gets two
  attempts. A run interrupted by a restart is retried once its 185 second lease expires.

## 1. Supabase

1. Create a project at supabase.com and save the database password.
2. Open **Connect** and copy:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`, with `?pgbouncer=true&connection_limit=5` appended.
   - **Session pooler** (port `5432`, host `…pooler.supabase.com`) → `DIRECT_URL`.
   Do not use the direct host `db.<ref>.supabase.co`: it is IPv6-only on the free plan.
3. From your own machine, create the tables and seed the configuration once (and again after any
   schema change):

   ```sh
   DATABASE_URL="<transaction pooler URL>" DIRECT_URL="<session pooler URL>" npx prisma migrate deploy
   DATABASE_URL="<transaction pooler URL>" DIRECT_URL="<session pooler URL>" npm run db:seed
   ```

## 2. Browserless

1. Sign up at browserless.io and copy the API token.
2. Pick the region closest to the Hostinger server: `production-sfo`, `production-lon` or `production-ams`.
3. Check the plan's **maximum session time**. A website crawl can hold a browser for up to about
   200 seconds and a PDF for up to 90 seconds. If the plan's limit is shorter, crawls will be cut off.

## 3. Hostinger app

1. In hPanel, add a Node.js web app from this repository (Git or upload), with the app root set to `lead-audit`.
2. Node version: 22. Build command: `npm run build`. Start command: `npm start`.
3. Environment variables (see `.env.example` for all of them):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL`, `DIRECT_URL` | From step 1 |
   | `APP_ORIGIN` | The public HTTPS address, e.g. `https://audit.example.com` (Browserless opens it to print PDFs) |
   | `APP_PASSWORD` | A strong password (`change-me` is refused in production) |
   | `BROWSERLESS_TOKEN`, `BROWSERLESS_URL` | From step 2 |
   | `JOBS_CRON_SECRET` | A long random value |
   | `USE_MOCK_DATA` | `false` for live data |
   | Collector and AI keys | `APIFY_TOKEN`, `APIFY_ACTOR_*`, `YOUTUBE_API_KEY`, `PAGESPEED_API_KEY`, `ANTHROPIC_KEY`, … |

   Do not set `PLAYWRIGHT_BROWSERS_PATH`. No browser is installed on Hostinger.

## 4. Cron safety net

In hPanel → **Cron Jobs**, add a custom command every 5 minutes:

```sh
curl -fsS -H "Authorization: Bearer <JOBS_CRON_SECRET>" https://audit.example.com/api/jobs/tick
```

If the cron panel cannot send headers, use `https://audit.example.com/api/jobs/tick?key=<JOBS_CRON_SECRET>`.
The endpoint returns 404 without the right secret, and otherwise returns straight away with the pending counts.
An external pinger such as cron-job.org works the same way.

## 5. Check it works

1. Sign in, run a small audit, and keep the progress page open until it completes.
2. Export the PDF from the report.
3. Look in the app logs for `jobs.loop_started`, `collector.done` and `audit.completed`. Failures appear as
   `jobs.tick_failed`, `browser.connect_failed` or `pdf.failed`, with a message.

## Docker and local development

Nothing changes there. With `BROWSERLESS_TOKEN` blank, the app launches the local Chromium.
`npm run worker` still works and can run beside the web app: database claims stop the two from
running the same job twice.
