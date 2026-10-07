-- Counts only. No visitor IDs, IP addresses, user agents, URLs or event rows.
CREATE TABLE public.analytics_aggregates (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reject', 'close', 'selected', 'all', 'declined_view')),
  page_group text NOT NULL CHECK (page_group IN ('all', 'home', 'deals', 'legal', 'other')),
  total bigint NOT NULL DEFAULT 0 CHECK (total >= 0),
  PRIMARY KEY (day, kind, page_group)
);

ALTER TABLE public.analytics_aggregates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_aggregates FROM anon, authenticated;
GRANT SELECT ON public.analytics_aggregates TO service_role;

CREATE FUNCTION public.increment_analytics_aggregate(p_kind text, p_page_group text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_kind NOT IN ('reject', 'close', 'selected', 'all', 'declined_view')
     OR p_page_group NOT IN ('all', 'home', 'deals', 'legal', 'other')
     OR (p_kind <> 'declined_view' AND p_page_group <> 'all') THEN
    RAISE EXCEPTION 'Invalid aggregate dimensions';
  END IF;
  INSERT INTO public.analytics_aggregates(day, kind, page_group, total)
  VALUES (CURRENT_DATE, p_kind, p_page_group, 1)
  ON CONFLICT (day, kind, page_group)
  DO UPDATE SET total = analytics_aggregates.total + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_analytics_aggregate(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_analytics_aggregate(text, text) TO service_role;
