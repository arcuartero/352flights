alter table public.price_scan_runs
  add column if not exists search_window_start date,
  add column if not exists search_window_end date,
  add column if not exists scanned_cities jsonb not null default '[]'::jsonb;

alter table public.price_scan_runs
  drop constraint if exists price_scan_runs_scanned_cities_check;

alter table public.price_scan_runs
  add constraint price_scan_runs_scanned_cities_check
  check (jsonb_typeof(scanned_cities) = 'array');
