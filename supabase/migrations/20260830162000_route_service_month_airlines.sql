alter table public.route_service_months
  add column if not exists airline_names text[] not null default '{}'::text[];

create index if not exists price_snapshots_departure_route_idx
  on public.price_snapshots (departure_date, route_id);

create or replace view public.route_airline_coverage as
with observed_airlines as (
  select
    snapshot.route_id,
    trim(airline.value) as airline_name
  from public.price_snapshots as snapshot
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(snapshot.metadata -> 'airline_names') = 'array'
        then snapshot.metadata -> 'airline_names'
      else '[]'::jsonb
    end
  ) as airline(value)
  where snapshot.departure_date >= current_date

  union all

  select
    snapshot.route_id,
    trim(snapshot.metadata ->> 'primary_airline') as airline_name
  from public.price_snapshots as snapshot
  where snapshot.departure_date >= current_date
    and nullif(trim(snapshot.metadata ->> 'primary_airline'), '') is not null
)
select
  route_id,
  array_agg(distinct airline_name order by airline_name) as airline_names
from observed_airlines
where airline_name <> ''
group by route_id;

revoke all on public.route_airline_coverage from anon, authenticated;
grant select on public.route_airline_coverage to service_role;
