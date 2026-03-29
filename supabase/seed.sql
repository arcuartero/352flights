insert into public.scanned_routes (
  origin_airport,
  destination_airport,
  destination_city,
  bucket,
  teaser,
  trip_nights,
  lookahead_start_days,
  lookahead_end_days,
  max_stops
)
values
  ('LUX', 'LHR', 'London', 'weekend_europe', 'Thursday-to-Sunday city breaks with reliable business and leisure demand.', 3, 21, 90, 'NON_STOP'),
  ('LUX', 'LGW', 'London', 'weekend_europe', 'Alternate London inventory to catch low-cost swings before the obvious airport does.', 3, 21, 90, 'NON_STOP'),
  ('LUX', 'AMS', 'Amsterdam', 'weekend_europe', 'Short-haul weekend inventory that reacts fast to low-fare releases.', 2, 14, 75, 'NON_STOP'),
  ('LUX', 'BCN', 'Barcelona', 'sun_breaks', 'Classic shoulder-season beach route with strong open-rate potential.', 4, 21, 120, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'MAD', 'Madrid', 'sun_breaks', 'High-volume city break and gateway route with plenty of fare variance.', 4, 21, 120, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'LIS', 'Lisbon', 'sun_breaks', 'Strong year-round demand and headline-friendly pricing when TAP inventory opens up.', 5, 30, 140, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'OPO', 'Porto', 'sun_breaks', 'Lower average fare than Lisbon, useful for consistent deal volume.', 4, 30, 140, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'FCO', 'Rome', 'weekend_europe', 'A dependable editorial route with good click-through when prices dip.', 3, 21, 100, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'MXP', 'Milan', 'weekend_europe', 'Fashion-week and shoulder-season demand create clean deal narratives.', 3, 14, 90, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'ATH', 'Athens', 'sun_breaks', 'Longer Mediterranean trips with wide fare dispersion.', 5, 30, 150, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'BUD', 'Budapest', 'weekend_europe', 'Price-sensitive weekend traffic makes this route ideal for frequent sends.', 3, 14, 90, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'PRG', 'Prague', 'weekend_europe', 'Reliable long-weekend route with broad appeal among Luxembourg subscribers.', 3, 14, 90, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'VIE', 'Vienna', 'weekend_europe', 'Good for premium weekend inventory and clean nonstop positioning.', 3, 14, 90, 'NON_STOP'),
  ('LUX', 'JFK', 'New York', 'long_haul', 'Flagship long-haul route that justifies premium tiers later.', 7, 45, 220, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'EWR', 'New York', 'long_haul', 'Alternative New York inventory to avoid single-airport blind spots.', 7, 45, 220, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'DXB', 'Dubai', 'long_haul', 'Sun-seeking winter traffic with strong promotional copy potential.', 6, 40, 200, 'ONE_STOP_OR_FEWER'),
  ('LUX', 'NRT', 'Tokyo', 'long_haul', 'The aspirational route that drives shares even when sends are less frequent.', 8, 60, 260, 'ONE_STOP_OR_FEWER')
on conflict (origin_airport, destination_airport, bucket) do update
set
  destination_city = excluded.destination_city,
  teaser = excluded.teaser,
  trip_nights = excluded.trip_nights,
  lookahead_start_days = excluded.lookahead_start_days,
  lookahead_end_days = excluded.lookahead_end_days,
  max_stops = excluded.max_stops,
  is_active = true;

