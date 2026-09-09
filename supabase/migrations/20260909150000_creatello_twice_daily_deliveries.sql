ALTER TABLE public.creatello_daily_deliveries
  ADD COLUMN delivery_slot text NOT NULL DEFAULT 'morning';

ALTER TABLE public.creatello_daily_deliveries
  ADD CONSTRAINT creatello_daily_delivery_slot_valid
  CHECK (delivery_slot IN ('morning', 'evening'));

ALTER TABLE public.creatello_daily_deliveries
  DROP CONSTRAINT creatello_daily_delivery_key;

ALTER TABLE public.creatello_daily_deliveries
  ADD CONSTRAINT creatello_daily_delivery_key
  UNIQUE (delivery_date, delivery_slot, target_template);

DROP FUNCTION public.reserve_creatello_daily_delivery(
  date, text, text, jsonb, text, bigint[], text[], text[]
);

CREATE OR REPLACE FUNCTION public.reserve_creatello_daily_delivery(
  p_delivery_date date,
  p_delivery_slot text,
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
  IF p_delivery_slot NOT IN ('morning', 'evening') THEN
    RAISE EXCEPTION 'Invalid Creatello delivery slot'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing_delivery
  FROM public.creatello_daily_deliveries
  WHERE delivery_date = p_delivery_date
    AND delivery_slot = p_delivery_slot
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
      delivery_slot,
      target_template,
      language,
      offer_count,
      payload,
      payload_hash
    ) VALUES (
      p_delivery_date,
      p_delivery_slot,
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
      AND delivery_slot = p_delivery_slot
      AND target_template = p_target_template;

    IF FOUND THEN
      RETURN jsonb_build_object('created', false, 'delivery', to_jsonb(existing_delivery));
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('created', true, 'delivery', to_jsonb(created_delivery));
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_creatello_daily_delivery(
  date, text, text, text, jsonb, text, bigint[], text[], text[]
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_creatello_daily_delivery(
  date, text, text, text, jsonb, text, bigint[], text[], text[]
) TO service_role;

COMMENT ON COLUMN public.creatello_daily_deliveries.delivery_slot IS
  'Idempotent twice-daily delivery window: morning or evening.';
