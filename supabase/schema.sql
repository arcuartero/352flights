create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  origin_city text not null default 'Luxembourg',
  home_airport text not null default 'LUX',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'unsubscribed')),
  source text not null default 'landing_page',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.newsletter_subscribers
  add column if not exists preference_token uuid not null default gen_random_uuid(),
  add column if not exists confirmation_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid(),
  add column if not exists email_confirmed boolean not null default false,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists preferred_locale text not null default 'en',
  add column if not exists confirmed_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists newsletter_subscribers_preference_token_idx
  on public.newsletter_subscribers (preference_token);

create unique index if not exists newsletter_subscribers_confirmation_token_idx
  on public.newsletter_subscribers (confirmation_token);

create unique index if not exists newsletter_subscribers_unsubscribe_token_idx
  on public.newsletter_subscribers (unsubscribe_token);

update public.newsletter_subscribers
set
  email_confirmed = true,
  confirmed_at = coalesce(confirmed_at, created_at),
  updated_at = timezone('utc', now())
where status = 'active' and email_confirmed = false;

create table if not exists public.subscriber_preferences (
  subscriber_id uuid primary key references public.newsletter_subscribers(id) on delete cascade,
  preferred_buckets text[] not null default array['weekend_europe', 'long_haul'],
  max_stops_preference text not null default 'ONE_STOP_OR_FEWER'
    check (max_stops_preference in ('ANY', 'NON_STOP', 'ONE_STOP_OR_FEWER')),
  max_stops_preferences text[] not null default array['ONE_STOP_OR_FEWER']
    check (cardinality(max_stops_preferences) > 0)
    check (max_stops_preferences <@ array['ANY', 'NON_STOP', 'ONE_STOP_OR_FEWER']::text[]),
  departure_weekdays text[] not null default array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    check (cardinality(departure_weekdays) > 0)
    check (departure_weekdays <@ array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::text[]),
  min_trip_nights integer,
  max_trip_nights integer,
  budget_ceiling_eur integer,
  earliest_departure_hour integer,
  latest_arrival_hour integer,
  min_destination_stay_hours integer,
  delivery_mode text not null default 'daily_digest'
    check (delivery_mode in ('daily_digest', 'flash_only', 'weekly_best_of')),
  delivery_modes text[] not null default array['daily_digest']
    check (cardinality(delivery_modes) > 0)
    check (delivery_modes <@ array['daily_digest', 'flash_only', 'weekly_best_of']::text[]),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (min_trip_nights is null or min_trip_nights > 0),
  check (max_trip_nights is null or max_trip_nights > 0),
  check (
    min_trip_nights is null
    or max_trip_nights is null
    or min_trip_nights <= max_trip_nights
  ),
  check (budget_ceiling_eur is null or budget_ceiling_eur > 0),
  check (earliest_departure_hour is null or earliest_departure_hour between 0 and 23),
  check (latest_arrival_hour is null or latest_arrival_hour between 0 and 23),
  check (min_destination_stay_hours is null or min_destination_stay_hours > 0),
  check (min_destination_stay_hours is null or min_destination_stay_hours <= 336)
);

alter table public.subscriber_preferences
  add column if not exists max_stops_preferences text[] not null default array['ONE_STOP_OR_FEWER'],
  add column if not exists departure_weekdays text[] not null default array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  add column if not exists delivery_modes text[] not null default array['daily_digest'],
  add column if not exists earliest_departure_hour integer,
  add column if not exists latest_arrival_hour integer,
  add column if not exists min_destination_stay_hours integer;

alter table public.subscriber_preferences
  drop constraint if exists subscriber_preferences_max_stops_preferences_check,
  drop constraint if exists subscriber_preferences_departure_weekdays_check,
  drop constraint if exists subscriber_preferences_delivery_modes_check,
  drop constraint if exists subscriber_preferences_max_stops_preferences_values_check,
  drop constraint if exists subscriber_preferences_departure_weekdays_values_check,
  drop constraint if exists subscriber_preferences_delivery_modes_values_check,
  drop constraint if exists subscriber_preferences_earliest_departure_hour_check,
  drop constraint if exists subscriber_preferences_latest_arrival_hour_check,
  drop constraint if exists subscriber_preferences_min_destination_stay_hours_check;

alter table public.subscriber_preferences
  add constraint subscriber_preferences_max_stops_preferences_check
    check (cardinality(max_stops_preferences) > 0),
  add constraint subscriber_preferences_max_stops_preferences_values_check
    check (max_stops_preferences <@ array['ANY', 'NON_STOP', 'ONE_STOP_OR_FEWER']::text[]),
  add constraint subscriber_preferences_departure_weekdays_check
    check (cardinality(departure_weekdays) > 0),
  add constraint subscriber_preferences_departure_weekdays_values_check
    check (departure_weekdays <@ array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::text[]),
  add constraint subscriber_preferences_delivery_modes_check
    check (cardinality(delivery_modes) > 0),
  add constraint subscriber_preferences_delivery_modes_values_check
    check (delivery_modes <@ array['daily_digest', 'flash_only', 'weekly_best_of']::text[]),
  add constraint subscriber_preferences_earliest_departure_hour_check
    check (earliest_departure_hour is null or earliest_departure_hour between 0 and 23),
  add constraint subscriber_preferences_latest_arrival_hour_check
    check (latest_arrival_hour is null or latest_arrival_hour between 0 and 23),
  add constraint subscriber_preferences_min_destination_stay_hours_check
    check (
      min_destination_stay_hours is null
      or (min_destination_stay_hours > 0 and min_destination_stay_hours <= 336)
    );

update public.subscriber_preferences
set
  max_stops_preferences = case
    when max_stops_preferences is null
      or cardinality(max_stops_preferences) = 0
      or (
        max_stops_preferences = array['ONE_STOP_OR_FEWER']::text[]
        and max_stops_preference <> 'ONE_STOP_OR_FEWER'
      )
    then array[max_stops_preference]
    else max_stops_preferences
  end,
  departure_weekdays = case
    when departure_weekdays is null or cardinality(departure_weekdays) = 0
    then array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::text[]
    else departure_weekdays
  end,
  delivery_modes = case
    when delivery_modes is null
      or cardinality(delivery_modes) = 0
      or (
        delivery_modes = array['daily_digest']::text[]
        and delivery_mode <> 'daily_digest'
      )
    then array[delivery_mode]
    else delivery_modes
  end,
  updated_at = timezone('utc', now());

create table if not exists public.subscriber_custom_alerts (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  name text not null,
  destination_city text,
  bucket text
    check (bucket is null or bucket in ('weekend_europe', 'sun_breaks', 'long_haul')),
  max_stops_preferences text[] not null default array['ONE_STOP_OR_FEWER']
    check (cardinality(max_stops_preferences) > 0)
    check (max_stops_preferences <@ array['ANY', 'NON_STOP', 'ONE_STOP_OR_FEWER']::text[]),
  budget_ceiling_eur integer
    check (budget_ceiling_eur is null or budget_ceiling_eur > 0),
  departure_weekdays text[] not null default array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    check (cardinality(departure_weekdays) > 0)
    check (departure_weekdays <@ array['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']::text[]),
  min_trip_nights integer
    check (min_trip_nights is null or min_trip_nights > 0),
  max_trip_nights integer
    check (max_trip_nights is null or max_trip_nights > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    min_trip_nights is null
    or max_trip_nights is null
    or min_trip_nights <= max_trip_nights
  )
);

create table if not exists public.subscriber_route_preferences (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  destination_airport text not null,
  destination_city text not null,
  bucket text not null
    check (bucket in ('weekend_europe', 'sun_breaks', 'long_haul')),
  buckets text[] not null default array['weekend_europe']::text[]
    check (
      cardinality(buckets) > 0
      and buckets <@ array['weekend_europe', 'sun_breaks', 'long_haul']::text[]
    ),
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (subscriber_id, destination_airport, bucket)
);

create table if not exists public.scanned_routes (
  id uuid primary key default gen_random_uuid(),
  origin_airport text not null,
  destination_airport text not null,
  destination_city text not null,
  bucket text not null
    check (bucket in ('weekend_europe', 'sun_breaks', 'long_haul')),
  teaser text not null,
  trip_nights integer not null check (trip_nights > 0),
  min_trip_nights integer,
  max_trip_nights integer,
  lookahead_start_days integer not null check (lookahead_start_days > 0),
  lookahead_end_days integer not null check (lookahead_end_days >= lookahead_start_days),
  max_stops text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (origin_airport, destination_airport, max_stops)
);

alter table public.scanned_routes
  add column if not exists min_trip_nights integer,
  add column if not exists max_trip_nights integer,
  add column if not exists buckets text[] not null default array['weekend_europe']::text[];

alter table public.scanned_routes
  drop constraint if exists scanned_routes_min_trip_nights_check,
  drop constraint if exists scanned_routes_max_trip_nights_check,
  drop constraint if exists scanned_routes_trip_night_range_check;

alter table public.scanned_routes
  add constraint scanned_routes_min_trip_nights_check
    check (min_trip_nights is null or min_trip_nights > 0),
  add constraint scanned_routes_max_trip_nights_check
    check (max_trip_nights is null or max_trip_nights > 0),
  add constraint scanned_routes_trip_night_range_check
    check (
      min_trip_nights is null
      or max_trip_nights is null
      or min_trip_nights <= max_trip_nights
    );

create table if not exists public.price_snapshots (
  id bigint generated always as identity primary key,
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  scanned_at timestamptz not null default timezone('utc', now()),
  departure_date date not null,
  return_date date,
  trip_nights integer not null check (trip_nights > 0),
  cabin_class text not null default 'ECONOMY',
  max_stops text not null,
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'EUR',
  provider text not null default 'google_flights_via_fli',
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.route_pattern_overrides (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  pattern_key text not null,
  pattern_label text not null,
  departure_weekday text not null
    check (departure_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  return_weekday text not null
    check (return_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  trip_nights integer not null check (trip_nights > 0),
  sort_order integer not null default 0,
  source text not null default 'auto_monthly_discovery',
  is_active boolean not null default true,
  last_checked_at timestamptz not null default timezone('utc', now()),
  valid_until date,
  discovery_window_start_days integer,
  discovery_window_end_days integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (route_id, pattern_key)
);

create table if not exists public.route_service_months (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  month_start date not null,
  routing text not null
    check (routing in ('NON_STOP', 'ONE_STOP_OR_FEWER', 'ANY')),
  departure_dates date[] not null default '{}'::date[],
  departure_weekdays text[] not null default '{}'::text[],
  observed_patterns jsonb not null default '[]'::jsonb,
  sample_size integer not null default 0 check (sample_size >= 0),
  detection_source text not null default 'auto_monthly_discovery',
  last_checked_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (route_id, month_start, routing)
);

create table if not exists public.route_search_rules (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  month_start date not null,
  pattern_key text not null,
  pattern_label text not null,
  departure_weekday text not null
    check (departure_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  return_weekday text not null
    check (return_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  trip_nights integer not null check (trip_nights > 0),
  max_stops text not null,
  sort_order integer not null default 0,
  source text not null default 'manual',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (route_id, month_start, pattern_key, max_stops)
);

create table if not exists public.route_service_change_events (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  month_start date not null,
  routing text not null
    check (routing in ('NON_STOP', 'ONE_STOP_OR_FEWER', 'ANY')),
  previous_departure_dates date[] not null default '{}'::date[],
  next_departure_dates date[] not null default '{}'::date[],
  previous_departure_weekdays text[] not null default '{}'::text[],
  next_departure_weekdays text[] not null default '{}'::text[],
  previous_pattern_keys text[] not null default '{}'::text[],
  next_pattern_keys text[] not null default '{}'::text[],
  summary text not null,
  detected_at timestamptz not null default timezone('utc', now()),
  is_acknowledged boolean not null default false
);

create table if not exists public.deal_candidates (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  snapshot_id bigint not null unique references public.price_snapshots(id) on delete cascade,
  title text not null,
  summary text not null,
  deal_price numeric(10, 2) not null check (deal_price >= 0),
  baseline_price numeric(10, 2),
  drop_ratio numeric(6, 4),
  score numeric(6, 2) not null,
  send_type text not null default 'digest'
    check (send_type in ('digest', 'flash')),
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'sent', 'expired')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.deal_candidates
  add column if not exists reviewed_at timestamptz,
  add column if not exists sent_at timestamptz;

update public.deal_candidates
set status = 'new'
where status = 'pending_review';

update public.deal_candidates
set status = 'reviewed'
where status = 'approved';

update public.deal_candidates
set status = 'expired'
where status = 'rejected';

alter table public.deal_candidates
  drop constraint if exists deal_candidates_status_check;

alter table public.deal_candidates
  add constraint deal_candidates_status_check
    check (status in ('new', 'reviewed', 'sent', 'expired'));

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  send_type text not null
    check (send_type in ('digest', 'flash')),
  subject text not null,
  preview_text text not null,
  from_email text not null,
  reply_to_email text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  status text not null default 'sending'
    check (status in ('sending', 'sent', 'partial', 'failed')),
  provider text not null default 'resend',
  deal_candidate_ids uuid[] not null default '{}'::uuid[],
  route_labels text[] not null default '{}'::text[],
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create table if not exists public.email_deliveries (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  email citext not null,
  subject text not null,
  deal_candidate_ids uuid[] not null default '{}'::uuid[],
  status text not null
    check (status in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create table if not exists public.ops_automation_settings (
  id text primary key default 'default'
    check (id = 'default'),
  daily_digest_enabled boolean not null default false,
  daily_digest_hour integer not null default 9
    check (daily_digest_hour between 0 and 23),
  daily_digest_minute integer not null default 5
    check (daily_digest_minute between 0 and 59),
  test_email citext,
  last_digest_sent_on date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.price_scan_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  scanner_source text not null default 'unknown',
  status text not null
    check (status in ('running', 'completed', 'completed_with_errors', 'partial', 'failed', 'stopped')),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms bigint
    check (duration_ms is null or duration_ms >= 0),
  search_window_start date,
  search_window_end date,
  scanned_cities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(scanned_cities) = 'array'),
  routes_planned integer not null default 0 check (routes_planned >= 0),
  routes_started integer not null default 0 check (routes_started >= 0),
  routes_completed integer not null default 0 check (routes_completed >= 0),
  destinations_planned integer not null default 0 check (destinations_planned >= 0),
  destinations_scanned integer not null default 0 check (destinations_scanned >= 0),
  patterns_planned integer not null default 0 check (patterns_planned >= 0),
  patterns_scanned integer not null default 0 check (patterns_scanned >= 0),
  rules_scanned integer not null default 0 check (rules_scanned >= 0),
  found_prices integer not null default 0 check (found_prices >= 0),
  deal_candidates integer not null default 0 check (deal_candidates >= 0),
  no_results integer not null default 0 check (no_results >= 0),
  timed_out integer not null default 0 check (timed_out >= 0),
  network_outages integer not null default 0 check (network_outages >= 0),
  hard_errors integer not null default 0 check (hard_errors >= 0),
  retries integer not null default 0 check (retries >= 0),
  currency text,
  min_price numeric(10, 2),
  max_price numeric(10, 2),
  average_price numeric(10, 2),
  median_price numeric(10, 2),
  stopped_reason text,
  stopped_reason_code text,
  destinations jsonb not null default '[]'::jsonb,
  routes jsonb not null default '[]'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  no_result_breakdown jsonb not null default '{}'::jsonb,
  error_breakdown jsonb not null default '{}'::jsonb,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'completed', 'partial', 'failed', 'skipped')),
  sync_summary jsonb not null default '{}'::jsonb,
  heartbeat_at timestamptz,
  last_progress_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.price_snapshots
  add column if not exists scan_run_id uuid;

alter table public.price_snapshots
  drop constraint if exists price_snapshots_scan_run_id_fkey;

alter table public.price_snapshots
  add constraint price_snapshots_scan_run_id_fkey
  foreign key (scan_run_id)
  references public.price_scan_runs(id)
  on delete set null;

create or replace view public.ops_latest_price_snapshots
with (security_invoker = true)
as
select distinct on (snapshot.route_id)
  snapshot.id,
  snapshot.route_id,
  snapshot.scan_run_id,
  snapshot.price,
  snapshot.currency,
  snapshot.departure_date,
  snapshot.return_date,
  snapshot.trip_nights,
  snapshot.max_stops,
  snapshot.metadata,
  snapshot.scanned_at
from public.price_snapshots as snapshot
where snapshot.price > 0
  and case
    when (snapshot.metadata ->> 'destination_stay_hours') ~ '^[0-9]+([.][0-9]+)?$'
      then (snapshot.metadata ->> 'destination_stay_hours')::numeric >= 24
    else true
  end
order by snapshot.route_id, snapshot.scanned_at desc, snapshot.id desc;

revoke all on public.ops_latest_price_snapshots from anon, authenticated;
grant select on public.ops_latest_price_snapshots to service_role;

create table if not exists public.date_scan_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  scanner_source text not null default 'unknown',
  status text not null
    check (status in ('running', 'completed', 'completed_with_errors', 'partial', 'failed', 'stopped')),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  routes_planned integer not null default 0 check (routes_planned >= 0),
  routes_started integer not null default 0 check (routes_started >= 0),
  routes_completed integer not null default 0 check (routes_completed >= 0),
  destinations_scanned integer not null default 0 check (destinations_scanned >= 0),
  service_months_scanned integer not null default 0 check (service_months_scanned >= 0),
  departures_detected integer not null default 0 check (departures_detected >= 0),
  cadence_changes integer not null default 0 check (cadence_changes >= 0),
  no_dates_found integer not null default 0 check (no_dates_found >= 0),
  skipped_complete integer not null default 0 check (skipped_complete >= 0),
  hard_errors integer not null default 0 check (hard_errors >= 0),
  routes jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists date_scan_runs_started_at_idx
  on public.date_scan_runs (started_at desc);

create index if not exists date_scan_runs_status_started_at_idx
  on public.date_scan_runs (status, started_at desc);

insert into public.ops_automation_settings (id)
values ('default')
on conflict (id) do nothing;

create index if not exists price_snapshots_route_scanned_at_idx
  on public.price_snapshots (route_id, scanned_at desc);

create index if not exists price_snapshots_scan_run_route_idx
  on public.price_snapshots (scan_run_id, route_id);

create index if not exists route_pattern_overrides_route_idx
  on public.route_pattern_overrides (route_id, sort_order);

create index if not exists route_service_months_route_month_idx
  on public.route_service_months (route_id, month_start, routing);

create index if not exists route_search_rules_route_month_idx
  on public.route_search_rules (route_id, month_start, sort_order);

create index if not exists route_service_change_events_route_detected_idx
  on public.route_service_change_events (route_id, detected_at desc);

create index if not exists deal_candidates_status_created_at_idx
  on public.deal_candidates (status, created_at desc);

create index if not exists subscriber_route_preferences_subscriber_idx
  on public.subscriber_route_preferences (subscriber_id);

create index if not exists subscriber_custom_alerts_subscriber_idx
  on public.subscriber_custom_alerts (subscriber_id, sort_order);

create index if not exists email_campaigns_created_at_idx
  on public.email_campaigns (created_at desc);

create index if not exists email_deliveries_campaign_idx
  on public.email_deliveries (campaign_id, created_at desc);

create index if not exists email_deliveries_subscriber_idx
  on public.email_deliveries (subscriber_id, created_at desc);

create index if not exists price_scan_runs_started_at_idx
  on public.price_scan_runs (started_at desc);

create index if not exists price_scan_runs_status_started_at_idx
  on public.price_scan_runs (status, started_at desc);

create index if not exists price_scan_runs_running_liveness_idx
  on public.price_scan_runs (
    greatest(
      coalesce(heartbeat_at, started_at),
      coalesce(last_progress_at, started_at)
    )
  )
  where status = 'running';

create or replace function public.guard_price_scan_run_liveness()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.last_progress_at := coalesce(new.last_progress_at, new.heartbeat_at, new.started_at);
    return new;
  end if;

  -- A fresh heartbeat from the exact same process can repair a run that the
  -- liveness reconciler closed while Supabase was timing out. Saved or delayed
  -- local state keeps its old heartbeat and therefore cannot reopen a run.
  if old.status <> 'running' and new.status = 'running' then
    if
      old.stopped_reason_code = 'heartbeat_expired'
      and new.run_key = old.run_key
      and new.started_at = old.started_at
      and new.heartbeat_at is not null
      and new.heartbeat_at > greatest(
        coalesce(old.heartbeat_at, old.started_at),
        coalesce(old.last_progress_at, old.started_at)
      )
      and new.heartbeat_at >= timezone('utc', now()) - interval '15 minutes'
    then
      new.completed_at := null;
      new.duration_ms := null;
      new.stopped_reason := null;
      new.stopped_reason_code := null;
      new.sync_status := 'pending';
      new.sync_summary := coalesce(old.sync_summary, '{}'::jsonb) || jsonb_build_object(
        'reopened_from_live_heartbeat', true,
        'reopened_at', timezone('utc', now())
      );
    else
      return old;
    end if;
  end if;

  if
    new.routes_started is distinct from old.routes_started
    or new.routes_completed is distinct from old.routes_completed
    or new.destinations_scanned is distinct from old.destinations_scanned
    or new.patterns_scanned is distinct from old.patterns_scanned
    or new.rules_scanned is distinct from old.rules_scanned
    or new.found_prices is distinct from old.found_prices
    or new.deal_candidates is distinct from old.deal_candidates
    or new.no_results is distinct from old.no_results
    or new.timed_out is distinct from old.timed_out
    or new.network_outages is distinct from old.network_outages
    or new.hard_errors is distinct from old.hard_errors
    or new.retries is distinct from old.retries
  then
    new.last_progress_at := greatest(
      coalesce(old.last_progress_at, old.started_at),
      coalesce(new.heartbeat_at, timezone('utc', now()))
    );
  else
    new.last_progress_at := coalesce(old.last_progress_at, new.last_progress_at, old.started_at);
  end if;

  return new;
end;
$$;

drop trigger if exists price_scan_runs_guard_liveness on public.price_scan_runs;
create trigger price_scan_runs_guard_liveness
before insert or update on public.price_scan_runs
for each row execute function public.guard_price_scan_run_liveness();

create or replace function public.close_superseded_price_scan_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.price_scan_runs
  set
    status = 'stopped',
    completed_at = coalesce(heartbeat_at, last_progress_at, timezone('utc', now())),
    duration_ms = greatest(round(extract(epoch from (coalesce(heartbeat_at, last_progress_at, timezone('utc', now())) - started_at)) * 1000), 0),
    stopped_reason = 'Scanner stopped before completion because a newer scanner execution started.',
    stopped_reason_code = 'superseded_by_new_run',
    sync_status = case when sync_status = 'completed' then sync_status else 'partial' end,
    sync_summary = coalesce(sync_summary, '{}'::jsonb) || jsonb_build_object(
      'automatically_closed', true,
      'superseded_by_run_key', new.run_key,
      'closed_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
  where status = 'running'
    and run_key <> new.run_key
    and started_at < new.started_at;
  return new;
end;
$$;

drop trigger if exists price_scan_runs_close_superseded on public.price_scan_runs;
create trigger price_scan_runs_close_superseded
after insert or update of status, started_at on public.price_scan_runs
for each row when (new.status = 'running')
execute function public.close_superseded_price_scan_runs();

create or replace function public.reconcile_stale_price_scan_runs(stale_after_seconds integer default 1800)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
begin
  update public.price_scan_runs
  set
    status = 'stopped',
    completed_at = case
      when heartbeat_at is not null or last_progress_at is not null
        then greatest(coalesce(heartbeat_at, started_at), coalesce(last_progress_at, started_at))
      else timezone('utc', now())
    end,
    duration_ms = case
      when heartbeat_at is null and last_progress_at is null then null
      else greatest(
        round(extract(epoch from (
          greatest(coalesce(heartbeat_at, started_at), coalesce(last_progress_at, started_at)) - started_at
        )) * 1000),
        0
      )
    end,
    stopped_reason = 'No real scanner activity was recorded before the liveness deadline. The saved partial results were preserved.',
    stopped_reason_code = 'heartbeat_expired',
    sync_status = case when sync_status = 'completed' then sync_status else 'partial' end,
    sync_summary = coalesce(sync_summary, '{}'::jsonb) || jsonb_build_object(
      'automatically_closed', true,
      'liveness_timeout_seconds', greatest(stale_after_seconds, 60),
      'last_heartbeat_at', heartbeat_at,
      'last_progress_at', last_progress_at,
      'closed_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
  where status = 'running'
    and greatest(
      coalesce(heartbeat_at, started_at),
      coalesce(last_progress_at, started_at)
    ) < timezone('utc', now()) - make_interval(secs => greatest(stale_after_seconds, 60));

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke all on function public.reconcile_stale_price_scan_runs(integer) from public;
grant execute on function public.reconcile_stale_price_scan_runs(integer) to service_role;

alter table public.newsletter_subscribers enable row level security;
alter table public.subscriber_preferences enable row level security;
alter table public.subscriber_custom_alerts enable row level security;
alter table public.subscriber_route_preferences enable row level security;
alter table public.scanned_routes enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.route_pattern_overrides enable row level security;
alter table public.route_service_months enable row level security;
alter table public.route_search_rules enable row level security;
alter table public.route_service_change_events enable row level security;
alter table public.deal_candidates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.ops_automation_settings enable row level security;
alter table public.price_scan_runs enable row level security;
alter table public.date_scan_runs enable row level security;
