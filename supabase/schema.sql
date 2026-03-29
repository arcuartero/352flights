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
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists newsletter_subscribers_preference_token_idx
  on public.newsletter_subscribers (preference_token);

create table if not exists public.subscriber_preferences (
  subscriber_id uuid primary key references public.newsletter_subscribers(id) on delete cascade,
  preferred_buckets text[] not null default array['weekend_europe', 'sun_breaks', 'long_haul'],
  max_stops_preference text not null default 'ONE_STOP_OR_FEWER'
    check (max_stops_preference in ('ANY', 'NON_STOP', 'ONE_STOP_OR_FEWER')),
  min_trip_nights integer,
  max_trip_nights integer,
  budget_ceiling_eur integer,
  delivery_mode text not null default 'daily_digest'
    check (delivery_mode in ('daily_digest', 'flash_only', 'weekly_best_of')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (min_trip_nights is null or min_trip_nights > 0),
  check (max_trip_nights is null or max_trip_nights > 0),
  check (
    min_trip_nights is null
    or max_trip_nights is null
    or min_trip_nights <= max_trip_nights
  ),
  check (budget_ceiling_eur is null or budget_ceiling_eur > 0)
);

create table if not exists public.subscriber_route_preferences (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  destination_airport text not null,
  destination_city text not null,
  bucket text not null
    check (bucket in ('weekend_europe', 'sun_breaks', 'long_haul')),
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
  unique (origin_airport, destination_airport, bucket)
);

alter table public.scanned_routes
  add column if not exists min_trip_nights integer,
  add column if not exists max_trip_nights integer;

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
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'sent', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.deal_candidates
  add column if not exists reviewed_at timestamptz,
  add column if not exists sent_at timestamptz;

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

create index if not exists price_snapshots_route_scanned_at_idx
  on public.price_snapshots (route_id, scanned_at desc);

create index if not exists deal_candidates_status_created_at_idx
  on public.deal_candidates (status, created_at desc);

create index if not exists subscriber_route_preferences_subscriber_idx
  on public.subscriber_route_preferences (subscriber_id);

create index if not exists email_campaigns_created_at_idx
  on public.email_campaigns (created_at desc);

create index if not exists email_deliveries_campaign_idx
  on public.email_deliveries (campaign_id, created_at desc);

create index if not exists email_deliveries_subscriber_idx
  on public.email_deliveries (subscriber_id, created_at desc);

alter table public.newsletter_subscribers enable row level security;
alter table public.subscriber_preferences enable row level security;
alter table public.subscriber_route_preferences enable row level security;
alter table public.scanned_routes enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.deal_candidates enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_deliveries enable row level security;
