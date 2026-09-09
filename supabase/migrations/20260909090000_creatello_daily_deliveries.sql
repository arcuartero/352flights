CREATE TABLE public.creatello_daily_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date date NOT NULL,
  target_template text NOT NULL,
  language text NOT NULL DEFAULT 'es',
  offer_count integer NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  creatello_inbox_item_id uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT creatello_daily_delivery_template_valid CHECK (
    target_template IN ('flight-deals-352', 'cheap-flights-tiktok', 'travel-offer')
  ),
  CONSTRAINT creatello_daily_delivery_language_valid CHECK (language IN ('es', 'en', 'fr', 'de', 'pt')),
  CONSTRAINT creatello_daily_delivery_offer_count_valid CHECK (offer_count BETWEEN 3 AND 5),
  CONSTRAINT creatello_daily_delivery_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT creatello_daily_delivery_payload_hash_format CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT creatello_daily_delivery_status_valid CHECK (status IN ('pending', 'sent', 'failed')),
  CONSTRAINT creatello_daily_delivery_key UNIQUE (delivery_date, target_template)
);

CREATE TABLE public.creatello_daily_delivery_offers (
  delivery_id uuid NOT NULL REFERENCES public.creatello_daily_deliveries(id) ON DELETE CASCADE,
  source_snapshot_id bigint NOT NULL,
  itinerary_key text NOT NULL,
  destination_airport text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delivery_id, source_snapshot_id),
  CONSTRAINT creatello_daily_offer_snapshot_unique UNIQUE (source_snapshot_id),
  CONSTRAINT creatello_daily_offer_itinerary_unique UNIQUE (itinerary_key),
  CONSTRAINT creatello_daily_offer_itinerary_length CHECK (length(itinerary_key) BETWEEN 1 AND 160),
  CONSTRAINT creatello_daily_offer_airport_format CHECK (destination_airport ~ '^[A-Z]{3}$')
);

CREATE INDEX creatello_daily_deliveries_status_date_idx
  ON public.creatello_daily_deliveries (status, delivery_date DESC);
CREATE INDEX creatello_daily_delivery_offers_delivery_idx
  ON public.creatello_daily_delivery_offers (delivery_id);

CREATE OR REPLACE FUNCTION public.reserve_creatello_daily_delivery(
  p_delivery_date date,
  p_target_template text,
  p_language text,
  p_payload jsonb,
  p_payload_hash text,
  p_source_snapshot_ids bigint[],
  p_itinerary_keys text[],
  p_destination_airports text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_delivery public.creatello_daily_deliveries%ROWTYPE;
  created_delivery public.creatello_daily_deliveries%ROWTYPE;
  offer_count integer := COALESCE(array_length(p_source_snapshot_ids, 1), 0);
BEGIN
  SELECT * INTO existing_delivery
  FROM public.creatello_daily_deliveries
  WHERE delivery_date = p_delivery_date
    AND target_template = p_target_template;

  IF FOUND THEN
    RETURN jsonb_build_object('created', false, 'delivery', to_jsonb(existing_delivery));
  END IF;

  IF offer_count NOT BETWEEN 3 AND 5
     OR array_length(p_itinerary_keys, 1) IS DISTINCT FROM offer_count
     OR array_length(p_destination_airports, 1) IS DISTINCT FROM offer_count THEN
    RAISE EXCEPTION 'Invalid Creatello daily delivery reservation'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.creatello_daily_deliveries (
      delivery_date,
      target_template,
      language,
      offer_count,
      payload,
      payload_hash
    ) VALUES (
      p_delivery_date,
      p_target_template,
      p_language,
      offer_count,
      p_payload,
      p_payload_hash
    )
    RETURNING * INTO created_delivery;

    INSERT INTO public.creatello_daily_delivery_offers (
      delivery_id,
      source_snapshot_id,
      itinerary_key,
      destination_airport
    )
    SELECT
      created_delivery.id,
      values.source_snapshot_id,
      values.itinerary_key,
      values.destination_airport
    FROM unnest(p_source_snapshot_ids, p_itinerary_keys, p_destination_airports)
      AS values(source_snapshot_id, itinerary_key, destination_airport);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO existing_delivery
    FROM public.creatello_daily_deliveries
    WHERE delivery_date = p_delivery_date
      AND target_template = p_target_template;

    IF FOUND THEN
      RETURN jsonb_build_object('created', false, 'delivery', to_jsonb(existing_delivery));
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('created', true, 'delivery', to_jsonb(created_delivery));
END;
$$;

ALTER TABLE public.creatello_daily_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creatello_daily_delivery_offers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.creatello_daily_deliveries FROM anon, authenticated;
REVOKE ALL ON public.creatello_daily_delivery_offers FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_creatello_daily_delivery(
  date, text, text, jsonb, text, bigint[], text[], text[]
) FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.creatello_daily_deliveries TO service_role;
GRANT SELECT, INSERT ON public.creatello_daily_delivery_offers TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_creatello_daily_delivery(
  date, text, text, jsonb, text, bigint[], text[], text[]
) TO service_role;

COMMENT ON TABLE public.creatello_daily_deliveries IS
  'Durable, idempotent daily Creatello packages. The exact validated payload is retained for retries.';
COMMENT ON TABLE public.creatello_daily_delivery_offers IS
  'Globally reserves snapshots and canonical itineraries so automatic Creatello packages never repeat an offer.';
