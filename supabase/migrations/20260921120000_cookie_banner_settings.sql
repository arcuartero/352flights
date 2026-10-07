CREATE TABLE public.cookie_banner_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cookie_banner_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cookie_banner_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cookie_banner_settings TO service_role;
