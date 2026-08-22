alter table public.scanned_routes
  add column if not exists buckets text[] not null default array['weekend_europe']::text[];

update public.scanned_routes
set buckets = array[bucket]::text[]
where buckets = array['weekend_europe']::text[]
  and bucket <> 'weekend_europe';

update public.scanned_routes
set buckets = array['weekend_europe', 'long_haul']::text[]
where origin_airport = 'LUX'
  and destination_airport in ('IST', 'RAK', 'AGA', 'TUN', 'KGS', 'CFU', 'CHQ', 'HER', 'RHO')
  and max_stops = 'NON_STOP';

do $$
declare
  route_group record;
  duplicate_id uuid;
begin
  for route_group in
    select
      origin_airport,
      destination_airport,
      max_stops,
      (array_agg(
        id
        order by
          case when bucket = 'weekend_europe' then 0 else 1 end,
          created_at,
          id
      ))[1] as canonical_id,
      array_agg(id) as route_ids
    from public.scanned_routes
    group by origin_airport, destination_airport, max_stops
    having count(*) > 1
  loop
    update public.scanned_routes as canonical
    set
      buckets = (
        select array_agg(distinct category order by category)
        from public.scanned_routes as grouped
        cross join lateral unnest(grouped.buckets || array[grouped.bucket]) as category
        where grouped.id = any(route_group.route_ids)
      ),
      trip_nights = (
        select min(grouped.trip_nights)
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      ),
      min_trip_nights = (
        select min(coalesce(grouped.min_trip_nights, grouped.trip_nights))
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      ),
      max_trip_nights = (
        select max(coalesce(grouped.max_trip_nights, grouped.trip_nights))
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      ),
      lookahead_start_days = (
        select min(grouped.lookahead_start_days)
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      ),
      lookahead_end_days = (
        select max(grouped.lookahead_end_days)
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      ),
      is_active = (
        select bool_or(grouped.is_active)
        from public.scanned_routes as grouped
        where grouped.id = any(route_group.route_ids)
      )
    where canonical.id = route_group.canonical_id;

    foreach duplicate_id in array route_group.route_ids
    loop
      continue when duplicate_id = route_group.canonical_id;

      delete from public.route_pattern_overrides as duplicate
      using public.route_pattern_overrides as canonical
      where duplicate.route_id = duplicate_id
        and canonical.route_id = route_group.canonical_id
        and canonical.pattern_key = duplicate.pattern_key;
      update public.route_pattern_overrides
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;

      delete from public.route_service_months as duplicate
      using public.route_service_months as canonical
      where duplicate.route_id = duplicate_id
        and canonical.route_id = route_group.canonical_id
        and canonical.month_start = duplicate.month_start
        and canonical.routing = duplicate.routing;
      update public.route_service_months
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;

      delete from public.route_search_rules as duplicate
      using public.route_search_rules as canonical
      where duplicate.route_id = duplicate_id
        and canonical.route_id = route_group.canonical_id
        and canonical.month_start = duplicate.month_start
        and canonical.pattern_key = duplicate.pattern_key
        and canonical.max_stops = duplicate.max_stops;
      update public.route_search_rules
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;

      update public.route_service_change_events
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;
      update public.price_snapshots
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;
      update public.deal_candidates
      set route_id = route_group.canonical_id
      where route_id = duplicate_id;

      delete from public.scanned_routes where id = duplicate_id;
    end loop;
  end loop;
end
$$;

alter table public.scanned_routes
  drop constraint if exists scanned_routes_origin_airport_destination_airport_bucket_key,
  drop constraint if exists scanned_routes_physical_route_key,
  add constraint scanned_routes_physical_route_key
    unique (origin_airport, destination_airport, max_stops);

alter table public.scanned_routes
  drop constraint if exists scanned_routes_buckets_check,
  add constraint scanned_routes_buckets_check
    check (
      cardinality(buckets) > 0
      and buckets <@ array['weekend_europe', 'sun_breaks', 'long_haul']::text[]
    );
