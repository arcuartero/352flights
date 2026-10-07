# 352flights

Luxembourg-first cheap flight newsletter MVP.

This repo starts the product in three layers:

- a polished landing page in Next.js
- a Supabase schema for subscribers, routes, snapshots, and deal candidates
- a Python scanner that uses [`fli`](https://github.com/punitarani/fli) to search flexible-date fares from `LUX`

## Project Structure

```text
.
├── app/                    # Next.js App Router pages and API routes
├── components/             # UI components
├── data/lux-routes.json    # Shared route seed file used by the site and scanner
├── lib/                    # Content, env helpers, Supabase admin client
├── scanner/                # Python scanner package
├── supabase/               # SQL schema + route seeds
└── .github/workflows/      # Manual scanner + scheduled digest workflows
```

## What Exists Today

### Web

- A launch-ready landing page for `352flights`
- A `POST /api/subscribe` route with welcome email + double opt-in
- Public confirmation and unsubscribe flows at `/confirm` and `/unsubscribe`
- A public preference flow at `/preferences` for trip style, stops, cadence, and budget
- A protected internal dashboard at `/ops`
- A route seed view so the product story matches the scanner configuration

### Data

- `newsletter_subscribers`
- `subscriber_preferences`
- `subscriber_route_preferences`
- `scanned_routes`
- `price_snapshots`
- `deal_candidates`

### Scanner

- Loads routes from `data/lux-routes.json`
- Searches multiple valid roundtrips for every active route, pattern, and month from `LUX`
- Stores snapshots locally or in Supabase
- Flags deal candidates once a route has enough price history
- Publishes fresh fares when they are the monthly pattern low, depart within 30 days at no more
  than 5% above the reference, or are at least 12% below the comparable median

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required for production capture:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

Customer emails use fixed, purpose-specific senders: transactional messages are sent
from `352 Flights <noreply@352flights.com>` and flight-deal campaigns are sent from
`352 Flights <alerts@352flights.com>`.

Optional scanner tuning:

- `SCANNER_CURRENCY`
- `SCANNER_REVIEW_RATIO`
- `SCANNER_FLASH_RATIO`
- `SCANNER_HISTORY_WINDOW`
- `RESEND_REPLY_TO_EMAIL`
- `CRON_SECRET`

## Web App

Install and run:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

### Ops Dashboard

The internal review board lives at:

```text
http://localhost:3000/ops
```

`OPS_BASIC_AUTH_USER` and `OPS_BASIC_AUTH_PASSWORD` are required for Operations, including local development. Missing or incomplete credentials deny access. Middleware, API handlers, server pages and actions share the same authorization rule.

The ops board now also includes:

- subscriber preference summaries
- a matched send queue for daily, weekly and flash campaigns
- a recent campaign history panel backed by Supabase logs
- a manual social-content selection flow that sends neutral, signed offer packages to Creatello

The Creatello sender lives at `/ops/tiktok-json`. Its private server endpoint is
`POST /api/ops/creatello-inbox`; setup and payload details are documented in
[`docs/creatello-content-inbox.md`](docs/creatello-content-inbox.md).

### Preference Flow

After a successful signup, the homepage sends a welcome email. The subscriber confirms via:

```text
http://localhost:3000/confirm?token=...
```

Then they manage their profile at:

```text
http://localhost:3000/preferences?token=...
```

That page stores:

- preferred trip styles
- max stops preference
- optional EUR budget ceiling
- delivery mode

## Supabase Setup

Run these SQL files in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

If you already ran an earlier version of the schema, run the updated `supabase/schema.sql` again so the new opt-in tokens, automation settings, and deal lifecycle fields are added.

The API route uses the service role key on the server, so RLS can stay enabled.

## Creatello social revalidation

Creatello revalidates a received package immediately before any scheduled social publication:

```text
POST /api/integrations/creatello/revalidate
X-352-Timestamp: <epoch milliseconds>
X-352-Signature: sha256=<HMAC-SHA256(timestamp + "." + exact raw body)>
```

Configure the same private `CREATELLO_352_REVALIDATION_HMAC_SECRET` (at least 32 characters) in
352 Flights and Creatello. The endpoint compares route, dates, currency and price against the latest
eligible snapshot from the previous 24 hours. It never returns provider secrets and never substitutes
an offer: any difference makes Creatello cancel that publication.

## Email Sending

`/ops` can now send:

- `digest` campaigns to subscribers whose saved profile matches reviewed digest deals
- `flash` campaigns to subscribers whose saved profile matches reviewed flash deals
- `weekly` best-of campaigns with up to six matching destinations from reviewed or sent offers from the last seven days, for subscribers who selected `weekly_best_of`

Matching logic currently checks:

- preferred route bucket
- routes implied by the selected trip styles
- max stops preference
- budget ceiling
- delivery mode

Emails are sent through Resend with:

- welcome emails and confirmation links
- preview + send-test support from `/ops`
- per-recipient rendering
- Supabase campaign logs in `email_campaigns`
- per-recipient delivery logs in `email_deliveries`
- idempotency keys to reduce accidental duplicate sends

## Scanner

Install and run:

```bash
cd scanner
uv sync
uv run luxflight-scan --json
```

Behavior:

- with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, snapshots and deal candidates are written to Supabase
- without them, the scanner falls back to `scanner/state.json`
- with `SCANNER_STORAGE_MODE=local`, the scanner always writes to `scanner/state.json`, even if Supabase credentials are present
- run `uv run luxflight-scan --sync-local-to-supabase --json` to upload pending local snapshots and deals to Supabase
- the public reference uses the median for the same route, exact weekday/duration pattern,
  stop category, and departure month; it falls back to the same pattern across months until
  the monthly cohort reaches 8 prices
- the public site only loads qualifying snapshots verified during the previous 24 hours and
  removes repeated copies of the same itinerary

For the cheap online setup, keep the web on Vercel and run the 11-hour scanner on a small VPS with local storage plus sync. See `docs/cheap-online-setup.md`.

## Tests

- `npm run typecheck`, `npm run lint` (fails on any warning) and `npm test` (unit and PGlite database tests).
- `npm run test:e2e` runs the Playwright subscription flow against `next dev` on port 3100 with
  Supabase and Resend replaced by `e2e/mock-backend.mjs`. It uses the installed Google Chrome,
  builds into `.next-e2e`, and can run while `npm run dev` is up.
- Scanner: `cd scanner && uv run python -m unittest discover -s tests`.

`.github/workflows/ci.yml` runs all of the above on every push to `main` and every pull request.

## GitHub Actions

`.github/workflows/scan-lux-deals.yml` can run the scanner manually.

`.github/workflows/scheduled-jobs.yml` is the single scheduler: every hour at minute 17 it calls the daily digest, weekly digest and ops-alert endpoints (each decides whether work is due), and at 07 and 19 UTC it also triggers the Creatello morning and evening deliveries. It works the same whether the app runs on Vercel or another host. A manual run can target one job and forces the digests. `/ops` controls each automation and their shared Luxembourg local send time.

The schedule is:

- daily: once per local calendar day at the time selected in `/ops` (default `09:05`)
- weekly: Monday at that same time, with catch-up attempts during the week
- both use `Europe/Luxembourg` calendar guards, including daylight saving time
- manual runs bypass the time/pause guard but never the daily/weekly duplicate guard

Add these repository secrets before enabling it:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCANNER_CURRENCY`
- `APP_BASE_URL`
- `CRON_SECRET`

### Activation Checklist

To make the digest cron actually run in GitHub:

1. Create a GitHub repository and push this project to the default branch.
2. Open `Settings` -> `Secrets and variables` -> `Actions`.
3. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SCANNER_CURRENCY`
   - `APP_BASE_URL`
   - `CRON_SECRET`
4. Open the `Actions` tab and enable workflows if GitHub asks.
5. Trigger `Scan Lux Flight Deals` manually only if you want to test GitHub Actions.
   The scanner authenticates to `/api/public-deals/revalidate` with
   `PUBLIC_CACHE_REVALIDATION_SECRET` or, if unset, `CRON_SECRET`. The Mac/VPS
   scanner `.env` needs one of them too; the Supabase service-role key is no
   longer accepted by that endpoint.
6. Trigger `Scheduled Jobs` manually once after deployment to verify the cron endpoints.
7. After that, the digest schedule will keep running automatically.

## Next Steps

1. Add click tracking and booking-link instrumentation per route.
2. Add deal deduping/expiry heuristics beyond the manual `expired` state.
3. Tighten sender reputation with a verified domain and domain-level monitoring.

## September 2026 improvements

See [implementation and activation notes](docs/improvements-2026-09-26.md) for the weekly database migration, dependency verification, subscription actions and the new module layout.
