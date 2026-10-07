# Dynamic publishing lifetime

New Creatello offers use `expiresAt` equal to midnight at the beginning of `departureDate` in `Europe/Luxembourg` (DST-aware UTC timestamp). `checkedAt` remains the actual snapshot scan time. Daily selection continues using recent snapshots, excluding departures on the delivery day.

`POST /api/integrations/creatello/revalidate` retains its signed request and adds optional `observations` to its response. `stale` and `price_changed` are observations, not blockers; neither changes the original offer or its price. `valid` depends exclusively on `reasons`: `departure_passed`, `unavailable`, `not_found`, `route_changed`, `dates_changed`, or `currency_changed`.

Database errors throw and the endpoint returns a retryable 500; they must not be reported as missing offers. Availability is based on stored 352 Flights records, not a live airline lookup. The whole publication is rejected if any offer is blocked. Existing payloads and canonical hashes are not rewritten.

Deploy via the Vercel Git integration before Creatello's matching update. Do not reactivate cancelled posts or send real posts during validation.
