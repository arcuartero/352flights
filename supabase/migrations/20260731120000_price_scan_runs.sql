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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists price_scan_runs_started_at_idx
  on public.price_scan_runs (started_at desc);

create index if not exists price_scan_runs_status_started_at_idx
  on public.price_scan_runs (status, started_at desc);

alter table public.price_scan_runs enable row level security;
