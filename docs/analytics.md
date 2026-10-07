# Ops analytics

The `/ops/analytics` dashboard separates two sources:

- Google Analytics 4 reports for visitors who explicitly enabled the Analytics cookie category. The Google tag is never loaded before consent. Revoking consent disables transmission and removes readable `_ga`, `_gid` and `_gat` cookies. The tag uses Consent Mode v2 with advertising consent denied, Google signals disabled, and manual page views with query strings removed. Private Ops, preferences, confirmation and unsubscribe pages are excluded.
- First-party daily aggregates for banner decisions and broad page groups viewed after a reject or close. The database contains counts only, with no event rows, visitor/session IDs, IP, user agent or URL. These counts are not users or sessions and are never sent to Google.

## Setup

1. Apply `supabase/migrations/20260921120000_cookie_banner_settings.sql` (if not already applied) and `supabase/migrations/20260921130000_analytics_aggregates.sql` to the intended database.
2. Create a GA4 web stream. Set `NEXT_PUBLIC_GA4_MEASUREMENT_ID` to its public `G-...` measurement ID. No Google tag loads if this value is missing or invalid.
3. Enable the Google Analytics Data API in a Google Cloud project. Create a service account, give its email Viewer access to the GA4 property and set `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_EMAIL`, and `GA4_SERVICE_ACCOUNT_PRIVATE_KEY` in the server environment. The private key is server-only and must never use a `NEXT_PUBLIC_` prefix. Newlines may be literal or encoded as `\n`.
4. Configure the GA4 stream's enhanced measurement page-view/history options so they do not duplicate the manually sent SPA page views. Verify a consenting test visit in GA4 Realtime and confirm a rejecting test visit makes no Google requests.

The Ops page refreshes once a minute. GA4 Realtime shows activity in its last 30-minute window; daily reports can lag behind collection. The anonymous endpoint is intentionally limited to coarse categories. Repeated decisions or page loads can increase its counts, so do not interpret them as unique visitors. Browser and hosting infrastructure may still create ordinary operational access logs outside these application aggregates.
