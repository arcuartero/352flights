-- Fixed-window throttling for public forms. Keys are SHA-256 hashes; no raw IPs or emails are stored.
CREATE TABLE IF NOT EXISTS public.request_rate_limits (
  bucket_key text PRIMARY KEY CHECK (char_length(bucket_key) BETWEEN 1 AND 200),
  window_started_at timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0)
);

ALTER TABLE public.request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_rate_limits FROM anon, authenticated;
GRANT SELECT, DELETE ON public.request_rate_limits TO service_role;

-- Returns true while the caller is within p_limit hits for the current window.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_hits integer;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit';
  END IF;

  INSERT INTO public.request_rate_limits AS limits (bucket_key, window_started_at, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE SET
    window_started_at = CASE
      WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE limits.window_started_at
    END,
    hits = CASE
      WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE limits.hits + 1
    END
  RETURNING hits INTO current_hits;

  -- Opportunistic cleanup keeps the table small without a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM public.request_rate_limits WHERE window_started_at < now() - interval '1 day';
  END IF;

  RETURN current_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
