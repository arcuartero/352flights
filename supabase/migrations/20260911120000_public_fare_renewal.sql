-- Snapshots remain immutable history. This table selects the authoritative observation.
CREATE TABLE public.public_fare_lifecycle (
  itinerary_key text PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES public.scanned_routes(id) ON DELETE CASCADE,
  current_snapshot_id bigint NOT NULL REFERENCES public.price_snapshots(id),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  renewal_required boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_reason text NOT NULL,
  reference_minor numeric,
  reference_points integer,
  cache_dirty boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_fare_renewal_due_idx ON public.public_fare_lifecycle(next_attempt_at, expires_at)
  WHERE status = 'active';
CREATE UNIQUE INDEX public_fare_current_snapshot_idx ON public.public_fare_lifecycle(current_snapshot_id);
CREATE INDEX public_fare_pattern_history_idx ON public.price_snapshots
  (route_id, (metadata->>'pattern_key'), currency, max_stops, scanned_at DESC);
ALTER TABLE public.public_fare_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_fare_lifecycle FROM anon, authenticated;
GRANT SELECT ON public.public_fare_lifecycle TO service_role;

-- Use stored search context for old snapshots as well as new ones. Unknown context
-- is never silently identified as a one-adult economy search.
CREATE FUNCTION public.public_fare_identity(s public.price_snapshots) RETURNS text
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(
    s.route_id, s.departure_date, s.return_date, upper(s.currency), upper(s.max_stops),
    coalesce(s.metadata->>'search_adults', substring(s.metadata->>'skyscanner_url' from 'adultsv2=([0-9]+)')),
    lower(coalesce(s.metadata->>'search_cabin', substring(s.metadata->>'skyscanner_url' from 'cabinclass=([a-zA-Z_]+)'))),
    coalesce(s.metadata->'airline_codes', jsonb_build_array(s.metadata->>'primary_airline_code')),
    s.metadata->>'outbound_departure_at', s.metadata->>'outbound_arrival_at',
    s.metadata->>'return_departure_at', s.metadata->>'return_arrival_at',
    s.metadata->'outbound_stop_count', s.metadata->'return_stop_count'
  )::text)
$$;

-- Deduplicate upload retries, retain genuine observations, and exclude the price
-- under evaluation. Monthly reference first, exact pattern fallback, at least 8.
CREATE FUNCTION public.public_fare_renewal_reference(s public.price_snapshots) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH comparable AS (
    SELECT DISTINCT ON (coalesce(
      CASE WHEN h.metadata ? 'local_snapshot_id' THEN
        concat(h.metadata->>'local_route_id', ':', h.metadata->>'local_scanned_at', ':', h.metadata->>'local_snapshot_id') END,
      concat(public.public_fare_identity(h), ':', h.scanned_at, ':', h.price))) h.*
    FROM public.price_snapshots h
    WHERE h.route_id = s.route_id AND h.id <> s.id AND h.scanned_at <= s.scanned_at
      AND h.price > 0 AND h.currency = s.currency AND h.cabin_class = s.cabin_class
      AND h.max_stops = s.max_stops
      AND h.metadata->>'pattern_key' = s.metadata->>'pattern_key'
      AND coalesce(h.metadata->>'search_adults', substring(h.metadata->>'skyscanner_url' from 'adultsv2=([0-9]+)'))
        IS NOT DISTINCT FROM coalesce(s.metadata->>'search_adults', substring(s.metadata->>'skyscanner_url' from 'adultsv2=([0-9]+)'))
      AND coalesce(h.metadata->>'search_cabin', substring(h.metadata->>'skyscanner_url' from 'cabinclass=([a-zA-Z_]+)'))
        IS NOT DISTINCT FROM coalesce(s.metadata->>'search_cabin', substring(s.metadata->>'skyscanner_url' from 'cabinclass=([a-zA-Z_]+)'))
  ), monthly AS (
    SELECT * FROM comparable WHERE date_trunc('month', departure_date) = date_trunc('month', s.departure_date)
    ORDER BY scanned_at DESC, id DESC LIMIT 180
  ), history AS (
    SELECT * FROM comparable ORDER BY scanned_at DESC, id DESC LIMIT 180
  ), chosen AS (
    SELECT price FROM monthly WHERE (SELECT count(*) FROM monthly) >= 8
    UNION ALL
    SELECT price FROM history WHERE (SELECT count(*) FROM monthly) < 8
  ), ordered AS (
    SELECT price, row_number() OVER (ORDER BY price) AS n, count(*) OVER () AS total FROM chosen
  )
  SELECT jsonb_build_object(
    'reference_minor', CASE WHEN count(*) >= 8 THEN
      (SELECT round(avg(price) * 100) FROM ordered WHERE n IN ((total + 1) / 2, (total + 2) / 2)) END,
    'points', count(*),
    'scope', CASE WHEN (SELECT count(*) FROM monthly) >= 8 THEN 'pattern_month' ELSE 'pattern_all_months' END
  ) FROM chosen
$$;

CREATE FUNCTION public.track_public_fare_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text := public.public_fare_identity(NEW);
  old_state public.public_fare_lifecycle;
  renewal_policy boolean;
  eligible boolean;
  reason text;
  ref jsonb;
BEGIN
  -- Serialize scanner inserts and renewal completion for this itinerary.
  PERFORM pg_advisory_xact_lock(hashtextextended(k, 0));
  SELECT * INTO old_state FROM public.public_fare_lifecycle WHERE itinerary_key = k FOR UPDATE;
  IF FOUND AND (NEW.scanned_at, NEW.id) <= (old_state.observed_at, old_state.current_snapshot_id) THEN
    RETURN NEW;
  END IF;
  -- Do not backfill expired observations or revive them through delayed uploads.
  IF NEW.scanned_at <= now() - interval '7 days' OR NEW.scanned_at > now() + interval '1 minute'
    OR NEW.departure_date < (now() AT TIME ZONE 'Europe/Luxembourg')::date THEN RETURN NEW; END IF;
  renewal_policy := coalesce(old_state.renewal_required, false)
    OR (old_state.itinerary_key IS NOT NULL AND NEW.scanned_at >= old_state.expires_at - interval '1 day');
  eligible := NEW.metadata->>'public_fare_eligible' = 'true';
  reason := CASE WHEN coalesce(eligible, false) THEN 'initial_selection' ELSE 'not_publicly_eligible' END;
  IF renewal_policy THEN
    ref := public.public_fare_renewal_reference(NEW);
    eligible := ref->>'reference_minor' IS NOT NULL AND NEW.price * 100 <= (ref->>'reference_minor')::numeric * 0.88;
    reason := CASE WHEN ref->>'reference_minor' IS NULL THEN 'insufficient_renewal_history'
      WHEN eligible THEN 'renewed_discount' ELSE 'insufficient_discount' END;
  END IF;
  -- Keep the existing structural publication requirements for all observations.
  IF NEW.price <= 0 OR NEW.return_date IS NULL
    OR NEW.metadata->>'outbound_departure_at' IS NULL OR NEW.metadata->>'outbound_arrival_at' IS NULL
    OR NEW.metadata->>'return_departure_at' IS NULL OR NEW.metadata->>'return_arrival_at' IS NULL
    OR coalesce((NEW.metadata->>'destination_stay_hours')::numeric, 0) < 24 THEN
    eligible := false; reason := 'invalid_itinerary';
  END IF;
  INSERT INTO public.public_fare_lifecycle AS l (
    itinerary_key, route_id, current_snapshot_id, observed_at, expires_at, status,
    renewal_required, next_attempt_at, last_reason, reference_minor, reference_points
  ) VALUES (
    k, NEW.route_id, NEW.id, NEW.scanned_at, NEW.scanned_at + interval '7 days',
    CASE WHEN coalesce(eligible, false) THEN 'active' ELSE 'retired' END,
    renewal_policy, NEW.scanned_at + interval '6 days', reason,
    (ref->>'reference_minor')::numeric, (ref->>'points')::integer
  ) ON CONFLICT (itinerary_key) DO UPDATE SET
    current_snapshot_id = excluded.current_snapshot_id, observed_at = excluded.observed_at,
    expires_at = excluded.expires_at, status = excluded.status,
    renewal_required = excluded.renewal_required, next_attempt_at = excluded.next_attempt_at,
    last_reason = excluded.last_reason, reference_minor = excluded.reference_minor,
    reference_points = excluded.reference_points, lease_token = NULL, lease_until = NULL,
    cache_dirty = true, updated_at = clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER track_public_fare_snapshot AFTER INSERT ON public.price_snapshots
FOR EACH ROW EXECUTE FUNCTION public.track_public_fare_snapshot();

-- Initialize only current observations; never reset their original timestamps.
INSERT INTO public.public_fare_lifecycle (
  itinerary_key, route_id, current_snapshot_id, observed_at, expires_at, status, next_attempt_at, last_reason
)
SELECT DISTINCT ON (public.public_fare_identity(s)) public.public_fare_identity(s), s.route_id, s.id,
  s.scanned_at, s.scanned_at + interval '7 days',
  CASE WHEN s.metadata->>'public_fare_eligible' = 'true' THEN 'active' ELSE 'retired' END,
  s.scanned_at + interval '6 days', 'initialized'
FROM public.price_snapshots s JOIN public.scanned_routes r ON r.id = s.route_id
WHERE s.scanned_at > now() - interval '7 days' AND s.scanned_at <= now()
  AND s.departure_date >= (now() AT TIME ZONE 'Europe/Luxembourg')::date AND r.is_active
ORDER BY public.public_fare_identity(s), s.scanned_at DESC, s.id DESC;

CREATE FUNCTION public.claim_public_fare_renewal() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.public_fare_lifecycle; token uuid := gen_random_uuid();
BEGIN
  SELECT f.* INTO l FROM public.public_fare_lifecycle f
    JOIN public.scanned_routes r ON r.id = f.route_id
    JOIN public.price_snapshots s ON s.id = f.current_snapshot_id
  WHERE f.status = 'active' AND f.next_attempt_at <= now() AND f.expires_at > now()
    AND (f.lease_until IS NULL OR f.lease_until < now()) AND r.is_active
    AND s.departure_date >= (now() AT TIME ZONE 'Europe/Luxembourg')::date
  ORDER BY f.expires_at, f.itinerary_key FOR UPDATE OF f SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.public_fare_lifecycle SET renewal_required = true,
    lease_token = token, lease_until = now() + interval '15 minutes', attempts = attempts + 1
  WHERE itinerary_key = l.itinerary_key;
  RETURN jsonb_build_object('itinerary_key', l.itinerary_key, 'lease_token', token,
    'snapshot', (SELECT to_jsonb(s) FROM public.price_snapshots s WHERE id = l.current_snapshot_id),
    'route', (SELECT to_jsonb(r) FROM public.scanned_routes r WHERE id = l.route_id));
END $$;

CREATE FUNCTION public.finish_public_fare_renewal(
  p_key text, p_token uuid, p_expected_snapshot_id bigint, p_snapshot jsonb DEFAULT NULL,
  p_reason text DEFAULT 'inconclusive'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.public_fare_lifecycle; candidate public.price_snapshots; new_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  SELECT * INTO l FROM public.public_fare_lifecycle WHERE itinerary_key = p_key FOR UPDATE;
  IF NOT FOUND OR p_token IS NULL OR p_expected_snapshot_id IS NULL OR l.lease_token IS NULL OR l.lease_until IS NULL
    OR l.lease_token IS DISTINCT FROM p_token OR l.current_snapshot_id <> p_expected_snapshot_id
    OR l.lease_until <= now() THEN RETURN jsonb_build_object('state', 'superseded'); END IF;
  IF p_snapshot IS NULL THEN
    UPDATE public.public_fare_lifecycle SET lease_token = NULL, lease_until = NULL,
      next_attempt_at = now() + interval '1 hour', last_reason = left(p_reason, 120), updated_at = clock_timestamp()
    WHERE itinerary_key = p_key;
    RETURN jsonb_build_object('state', 'pending', 'reason', p_reason);
  END IF;
  SELECT * INTO candidate FROM public.price_snapshots WHERE id = p_expected_snapshot_id;
  candidate.price := (p_snapshot->>'price')::numeric;
  candidate.metadata := p_snapshot->'metadata';
  candidate.scanned_at := (p_snapshot->>'scanned_at')::timestamptz;
  IF public.public_fare_identity(candidate) <> p_key OR candidate.price <= 0
    OR candidate.scanned_at < l.observed_at OR candidate.scanned_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid renewal observation';
  END IF;
  INSERT INTO public.price_snapshots(route_id, scanned_at, departure_date, return_date, trip_nights,
    cabin_class, max_stops, price, currency, provider, metadata)
  VALUES (candidate.route_id, candidate.scanned_at, candidate.departure_date, candidate.return_date,
    candidate.trip_nights, candidate.cabin_class, candidate.max_stops, candidate.price, candidate.currency,
    candidate.provider, candidate.metadata || jsonb_build_object('renewal_of_snapshot_id', p_expected_snapshot_id))
  RETURNING id INTO new_id;
  SELECT * INTO l FROM public.public_fare_lifecycle WHERE itinerary_key = p_key;
  RETURN jsonb_build_object('state', CASE WHEN l.status = 'active' THEN 'renewed' ELSE 'retired' END,
    'snapshot_id', new_id, 'reason', l.last_reason);
END $$;

-- Revalidate caches durably: failures leave cache_dirty set for the next worker.
CREATE FUNCTION public.ack_public_fare_cache(p_key text, p_updated_at timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.public_fare_lifecycle SET cache_dirty = false
  WHERE itinerary_key = p_key AND updated_at = p_updated_at
$$;

CREATE VIEW public.public_current_fare_snapshots WITH (security_invoker = true) AS
SELECT s.id, s.route_id, s.scanned_at, s.departure_date, s.return_date, s.trip_nights,
  s.max_stops, s.price, s.currency,
  s.metadata || CASE WHEN l.renewal_required THEN jsonb_build_object(
    'public_reference_price', l.reference_minor / 100,
    'public_reference_points', l.reference_points,
    'public_monthly_drop_ratio', s.price * 100 / nullif(l.reference_minor, 0)
  ) ELSE '{}'::jsonb END
  || jsonb_build_object('public_fare_eligible', true, 'public_itinerary_key', l.itinerary_key) AS metadata
FROM public.public_fare_lifecycle l JOIN public.price_snapshots s ON s.id = l.current_snapshot_id
JOIN public.scanned_routes r ON r.id = s.route_id
WHERE l.status = 'active' AND l.expires_at > now() AND r.is_active
  AND s.departure_date >= (now() AT TIME ZONE 'Europe/Luxembourg')::date;
REVOKE ALL ON public.public_current_fare_snapshots FROM anon, authenticated;
GRANT SELECT ON public.public_current_fare_snapshots TO service_role;

REVOKE ALL ON FUNCTION public.public_fare_identity(public.price_snapshots),
  public.public_fare_renewal_reference(public.price_snapshots), public.track_public_fare_snapshot(),
  public.claim_public_fare_renewal(), public.finish_public_fare_renewal(text, uuid, bigint, jsonb, text),
  public.ack_public_fare_cache(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_public_fare_renewal(),
  public.finish_public_fare_renewal(text, uuid, bigint, jsonb, text),
  public.ack_public_fare_cache(text, timestamptz) TO service_role;
