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
- A `POST /api/subscribe` route that stores emails in Supabase when env vars are present
- A public preference flow at `/preferences` for routes, trip shapes, stops, and budget
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

After a successful signup, the homepage redirects the subscriber to:

```text
http://localhost:3000/preferences?token=...
```

That page stores:

- preferred route buckets
- chosen destinations
- max stops preference
- trip-night range
- optional EUR budget ceiling
- delivery mode

## Supabase Setup

Run these SQL files in order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

If you already ran an earlier version of the schema, run the updated `supabase/schema.sql` again so the new email campaign tables and deal review timestamps are added.

The API route uses the service role key on the server, so RLS can stay enabled.

## Email Sending

`/ops` can now send:

- `digest` campaigns to subscribers whose saved profile matches approved digest deals
- `flash` campaigns to subscribers whose saved profile matches approved flash deals

Matching logic currently checks:

- preferred route bucket
- selected destination routes
- max stops preference
- trip-night range
- budget ceiling
- delivery mode

Emails are sent through Resend with:

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

The schedule is:

- every day at `08:00` Luxembourg time (`Europe/Luxembourg`)
- implemented via two UTC schedules plus a local-time guard so daylight saving time is handled correctly

Add these repository secrets before enabling it:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SCANNER_CURRENCY`

### Activation Checklist

To make the cron actually run in GitHub:

1. Create a GitHub repository and push this project to the default branch.
2. Open `Settings` -> `Secrets and variables` -> `Actions`.
3. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SCANNER_CURRENCY`
4. Open the `Actions` tab and enable workflows if GitHub asks.
5. Trigger `Scan Lux Flight Deals` once with `Run workflow` to verify the first run.
6. After that, the daily schedule will keep running automatically.

## Next Steps

1. Move campaign sending into a background job once the audience grows past manual-ops size.
2. Add click tracking and booking-link instrumentation per route.
3. Add unsubscribe and one-click pause flows in outbound emails.
