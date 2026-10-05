# Deploying to Railway + Supabase

Two Railway services built from this repo's `Dockerfile`, sharing one Supabase Postgres database.

```
Browser ──► Railway "web"  ──►  Supabase Postgres  ◄── Railway "worker"
            login, discovery,     job queue,             runs collectors,
            reports, PDF export   audits, config         scores audits
```

| Service  | Config file           | Start command    | Public domain |
| -------- | --------------------- | ---------------- | ------------- |
| `web`    | `railway.web.json`    | `npm run start`  | Yes           |
| `worker` | `railway.worker.json` | `npm run worker` | No            |

The web service runs `prisma migrate deploy` and the seed before each deploy. The seed only fills in
missing configuration and demo reports, so it is safe to run every time. The worker does not
migrate. If it starts before the first migration has finished, it logs `worker.tick_failed` and keeps retrying every second until the tables exist.

## 1. Supabase database

1. Create a project at supabase.com. Save the database password; it is shown once.
2. Open **Connect** at the top of the project dashboard and copy two connection strings:
   - **Transaction pooler** (port `6543`) → becomes `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=5`.
   - **Session pooler** (port `5432`, host `…pooler.supabase.com`) → becomes `DIRECT_URL`. Use this for migrations.
3. Replace `[YOUR-PASSWORD]` in both with the database password. If the password contains
   `@ : / ? # %`, URL-encode it or reset it to letters and digits.

Use the **session pooler** for `DIRECT_URL`, not the "Direct connection" (`db.<ref>.supabase.co`).
The direct host is IPv6-only on the free plan, and Railway connects to outside services over IPv4.

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

## 2. Railway project

Railway deploys from GitHub, so push the branch first. Only committed files are deployed.

1. railway.com → **New Project** → **Deploy from GitHub repo** → `Lead-Audit`. This creates the first service.
2. Rename it `web`. Under **Settings → Config-as-code**, set the file path to `/railway.web.json`.
3. In the project, **+ Create → GitHub Repo** → the same repo again. Rename it `worker` and set its
   config file path to `/railway.worker.json`.
4. On `web` only: **Settings → Networking → Generate Domain**. Copy the `https://….up.railway.app` URL.

If the repo root is not this folder, set **Root Directory** to the folder that contains the
`Dockerfile` on both services.

## 3. Variables

Add these under **Project Settings → Shared Variables**, then share them with both services.
Take the values from your local `.env`, except the rows marked below.

| Variable                                                                | Value                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                          | Supabase transaction pooler (step 1)                                                         |
| `DIRECT_URL`                                                            | Supabase session pooler (step 1)                                                             |
| `APP_ORIGIN`                                                            | **The Railway web domain**, e.g. `https://lead-audit.up.railway.app`, with no trailing slash |
| `APP_PASSWORD`                                                          | A strong password. `change-me` is rejected in production.                                    |
| `USE_MOCK_DATA`                                                         | `true` to start safely, `false` for live collection (spends money)                           |
| `AUDIT_CACHE_DAYS`                                                      | `7`                                                                                          |
| `APIFY_TOKEN`, `YOUTUBE_API_KEY`, `PAGESPEED_API_KEY`, `GEMINI_API_KEY` | From `.env`                                                                                  |
| `APIFY_ACTOR_*`, `GBP_COUNTRY_CODE`, `GEMINI_MODEL`                     | From `.env`                                                                                  |

**Do not set** `PLAYWRIGHT_BROWSERS_PATH`, `POSTGRES_*`, `WEB_PORT` or `PORT`.

- The Docker image provides Chromium at `/ms-playwright`. Copying the local `./.browsers` value breaks discovery, website audits and PDF export.
- Railway sets `PORT` itself.
- The `POSTGRES_*` and `WEB_PORT` variables are only for docker compose.

`APP_ORIGIN` must exactly match the address users open. It decides three things:

- which form submissions are accepted (the origin check);
- whether the login cookie is marked secure;
- which URL the PDF renderer loads.

If you add a custom domain later, update `APP_ORIGIN` to it and redeploy `web`.

## 4. Deploy and check

1. Deploy `web` first and watch the deploy logs. The pre-deploy step should end with the seed finishing.
2. Deploy `worker`. Its log should show `{"event":"worker.started",…}`.
3. Open the web domain, sign in, and open a demo report from the Audit library.
4. Run a new audit. It should move from queued to complete within a minute in mock mode. If it
   stays queued, the worker is not running or cannot reach the database. Check the worker logs.
5. Export a PDF. If it fails, `APP_ORIGIN` does not match the web domain.

## Scaling later

- **More audits at once:** raise the worker's replica count. Jobs are claimed atomically, so
  replicas never run the same job twice.
- **Memory:** the web service and each worker launch Chromium. Allow about 1 GB per service. Give more if
  PDF exports or bulk runs fail with out-of-memory restarts.
- **Database:** upgrade the Supabase plan in place. The Railway side does not change.
