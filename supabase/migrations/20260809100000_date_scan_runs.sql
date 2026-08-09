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

alter table public.date_scan_runs enable row level security;
