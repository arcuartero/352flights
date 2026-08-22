alter table public.price_snapshots
  add column if not exists scan_run_id uuid;

alter table public.price_snapshots
  drop constraint if exists price_snapshots_scan_run_id_fkey;

alter table public.price_snapshots
  add constraint price_snapshots_scan_run_id_fkey
  foreign key (scan_run_id)
  references public.price_scan_runs(id)
  on delete set null;

create index if not exists price_snapshots_scan_run_route_idx
  on public.price_snapshots (scan_run_id, route_id);

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
