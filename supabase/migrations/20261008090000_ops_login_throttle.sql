-- Failed Basic Auth attempts for /ops, stored in request_rate_limits under hashed keys.
-- p_record_failure = false only reads, so successful logins never consume the budget.
CREATE OR REPLACE FUNCTION public.check_failed_attempts(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_record_failure boolean
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_hits integer;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit';
  END IF;

  IF p_record_failure THEN
    current_hits := CASE WHEN public.consume_rate_limit(p_key, p_limit, p_window_seconds) THEN 0 ELSE p_limit + 1 END;
  ELSE
    SELECT CASE
      WHEN window_started_at <= now() - make_interval(secs => p_window_seconds) THEN 0
      ELSE hits
    END INTO current_hits
    FROM public.request_rate_limits
    WHERE bucket_key = p_key;
  END IF;

  RETURN coalesce(current_hits, 0) <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_failed_attempts(text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_failed_attempts(text, integer, integer, boolean) TO service_role;
