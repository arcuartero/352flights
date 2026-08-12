insert into public.scanned_routes (
  origin_airport,
  destination_airport,
  destination_city,
  bucket,
  teaser,
  trip_nights,
  min_trip_nights,
  max_trip_nights,
  lookahead_start_days,
  lookahead_end_days,
  max_stops
)
values
  (
    'LUX', 'MRS', 'Marseille', 'weekend_europe',
    'Mediterranean city route with direct access to Provence and the coast.',
    4, 1, 7, 3, 250, 'NON_STOP'
  ),
  (
    'LUX', 'TLS', 'Toulouse', 'weekend_europe',
    'Southern France city route with useful weekend and short-break demand.',
    4, 1, 7, 3, 250, 'NON_STOP'
  )
on conflict (origin_airport, destination_airport, bucket) do update
set
  destination_city = excluded.destination_city,
  teaser = excluded.teaser,
  trip_nights = excluded.trip_nights,
  min_trip_nights = excluded.min_trip_nights,
  max_trip_nights = excluded.max_trip_nights,
  lookahead_start_days = excluded.lookahead_start_days,
  lookahead_end_days = excluded.lookahead_end_days,
  max_stops = excluded.max_stops,
  is_active = true;
