alter table public.price_scan_runs
  add column if not exists indicative_prices integer not null default 0
    check (indicative_prices >= 0),
  add column if not exists calendar_queries integer not null default 0
    check (calendar_queries >= 0),
  add column if not exists exact_queries integer not null default 0
    check (exact_queries >= 0);

create table if not exists public.indicative_price_observations (
  id bigint generated always as identity primary key,
  route_id uuid not null references public.scanned_routes(id) on delete cascade,
  scan_run_id uuid not null references public.price_scan_runs(id) on delete cascade,
  origin_airport text not null,
  destination_airport text not null,
  rule_key text not null,
  rule_label text not null,
  departure_weekday text not null
    check (departure_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  return_weekday text not null
    check (return_weekday in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')),
  departure_date date not null,
  return_date date not null,
  departure_month date not null check (extract(day from departure_month) = 1),
  trip_nights integer not null check (trip_nights > 0),
  max_stops text not null,
  routing_type text not null
    check (routing_type in ('direct', 'stops_allowed')),
  price numeric(10, 2) not null check (price > 0),
  currency text not null default 'EUR',
  observed_at timestamptz not null,
  days_until_departure integer not null check (days_until_departure >= 0),
  verification_status text not null default 'indicative'
    check (verification_status in ('indicative', 'verified')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (
    scan_run_id,
    route_id,
    rule_key,
    departure_date,
    return_date,
    max_stops
  )
);

create index if not exists indicative_prices_statistics_idx
  on public.indicative_price_observations (
    route_id,
    rule_key,
    departure_month,
    routing_type,
    currency
  );

create index if not exists indicative_prices_run_idx
  on public.indicative_price_observations (scan_run_id, route_id);

create index if not exists indicative_prices_observed_at_idx
  on public.indicative_price_observations (observed_at desc);

alter table public.indicative_price_observations enable row level security;

create or replace function public.get_indicative_price_statistics(
  p_limit integer default 100,
  p_route_id uuid default null
)
returns table (
  route_id uuid,
  origin_airport text,
  destination_airport text,
  rule_key text,
  rule_label text,
  departure_month date,
  routing_type text,
  max_stops text,
  currency text,
  combinations_observed bigint,
  observations bigint,
  independent_scan_runs bigint,
  minimum_price numeric,
  median_price numeric,
  lower_quartile_price numeric,
  maximum_price numeric,
  last_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    observation.route_id,
    observation.origin_airport,
    observation.destination_airport,
    observation.rule_key,
    max(observation.rule_label) as rule_label,
    observation.departure_month,
    observation.routing_type,
    observation.max_stops,
    observation.currency,
    count(distinct (observation.departure_date, observation.return_date)) as combinations_observed,
    count(*) as observations,
    count(distinct observation.scan_run_id) as independent_scan_runs,
    min(observation.price) as minimum_price,
    percentile_cont(0.5) within group (order by observation.price)::numeric as median_price,
    percentile_cont(0.25) within group (order by observation.price)::numeric as lower_quartile_price,
    max(observation.price) as maximum_price,
    max(observation.observed_at) as last_updated_at
  from public.indicative_price_observations as observation
  where p_route_id is null or observation.route_id = p_route_id
  group by
    observation.route_id,
    observation.origin_airport,
    observation.destination_airport,
    observation.rule_key,
    observation.departure_month,
    observation.routing_type,
    observation.max_stops,
    observation.currency
  order by max(observation.observed_at) desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.get_indicative_price_overview()
returns table (
  observations bigint,
  combinations bigint,
  routes bigint,
  rules bigint,
  departure_months bigint,
  independent_scan_runs bigint,
  verified_calendar_prices bigint,
  last_updated_at timestamptz,
  table_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) as observations,
    count(distinct (observation.route_id, observation.rule_key, observation.departure_date, observation.return_date, observation.max_stops)) as combinations,
    count(distinct observation.route_id) as routes,
    count(distinct (observation.route_id, observation.rule_key)) as rules,
    count(distinct observation.departure_month) as departure_months,
    count(distinct observation.scan_run_id) as independent_scan_runs,
    count(*) filter (where observation.verification_status = 'verified') as verified_calendar_prices,
    max(observation.observed_at) as last_updated_at,
    pg_total_relation_size('public.indicative_price_observations'::regclass) as table_bytes
  from public.indicative_price_observations as observation;
$$;

revoke all on table public.indicative_price_observations from anon, authenticated;
grant select, insert, update on table public.indicative_price_observations to service_role;
grant usage, select on sequence public.indicative_price_observations_id_seq to service_role;

revoke all on function public.get_indicative_price_statistics(integer, uuid) from public;
grant execute on function public.get_indicative_price_statistics(integer, uuid) to service_role;
revoke all on function public.get_indicative_price_overview() from public;
grant execute on function public.get_indicative_price_overview() to service_role;

comment on table public.indicative_price_observations is
  'Calendar-only prices kept separate from verified price_snapshots and deal generation.';
