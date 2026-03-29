# Lux Flight Deals

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
└── .github/workflows/      # Scheduled scanner workflow
```

## What Exists Today

### Web

- A launch-ready landing page for `Lux Flight Deals`
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
- Searches cheapest flexible-date roundtrips from `LUX`
- Stores snapshots locally or in Supabase
- Flags deal candidates once a route has enough price history

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required for production capture:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

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

If `OPS_BASIC_AUTH_USER` and `OPS_BASIC_AUTH_PASSWORD` are set, the route is protected with HTTP Basic Auth.

The ops board now also includes:

- subscriber preference summaries
- a matched send queue for digest and flash campaigns
- a recent campaign history panel backed by Supabase logs

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

## Email Sending

`/ops` can now send:

- `digest` campaigns to subscribers whose saved profile matches reviewed digest deals
- `flash` campaigns to subscribers whose saved profile matches reviewed flash deals

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

## GitHub Actions

`.github/workflows/scan-lux-deals.yml` runs the scanner daily.

`.github/workflows/send-daily-digest.yml` can trigger the scheduled digest endpoint every 5 minutes, while `/ops` decides the actual Luxembourg local send time.

The schedule is:

- every day at `08:00` Luxembourg time (`Europe/Luxembourg`)
- implemented via two UTC schedules plus a local-time guard so daylight saving time is handled correctly

Add these repository secrets before enabling it:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCANNER_CURRENCY`
- `APP_BASE_URL`
- `CRON_SECRET`

### Activation Checklist

To make the cron actually run in GitHub:

1. Create a GitHub repository and push this project to the default branch.
2. Open `Settings` -> `Secrets and variables` -> `Actions`.
3. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SCANNER_CURRENCY`
   - `APP_BASE_URL`
   - `CRON_SECRET`
4. Open the `Actions` tab and enable workflows if GitHub asks.
5. Trigger `Scan Lux Flight Deals` once with `Run workflow` to verify the first run.
6. Trigger `Send Daily Lux Digest` once after deployment to verify the cron endpoint.
7. After that, the daily schedules will keep running automatically.

## Next Steps

1. Add click tracking and booking-link instrumentation per route.
2. Add deal deduping/expiry heuristics beyond the manual `expired` state.
3. Tighten sender reputation with a verified domain and domain-level monitoring.
