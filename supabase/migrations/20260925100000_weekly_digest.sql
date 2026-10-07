-- Weekly snapshots have their own calendar key and cannot collide with daily jobs.
BEGIN;
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_send_type_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_send_type_check
  CHECK (send_type IN ('digest', 'flash', 'weekly'));
ALTER TABLE public.ops_automation_settings
  ADD COLUMN IF NOT EXISTS weekly_digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_weekly_sent_on date;
CREATE TABLE IF NOT EXISTS public.scheduled_weekly_jobs (
  delivery_date date PRIMARY KEY,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  model jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (extract(isodow FROM delivery_date) = 1)
);
ALTER TABLE public.scheduled_weekly_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_weekly_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.scheduled_weekly_jobs TO service_role;
COMMENT ON TABLE public.scheduled_weekly_jobs IS
  'Frozen weekly best-of audience and fares. delivery_date is Monday in Europe/Luxembourg. Delivery acknowledgements use scheduled_digest_messages with lux-weekly keys.';
COMMIT;
