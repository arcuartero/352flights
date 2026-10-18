-- Apply before deploying the hourly digest. Contains private recipient data: service role only.
CREATE TABLE public.scheduled_digest_jobs (
  delivery_date date PRIMARY KEY,
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  model jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scheduled_digest_messages (
  idempotency_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  sent_at timestamptz
);
ALTER TABLE public.scheduled_digest_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_digest_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_digest_jobs, public.scheduled_digest_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.scheduled_digest_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.scheduled_digest_messages TO service_role;
COMMENT ON TABLE public.scheduled_digest_messages IS
  'Frozen Resend requests and permanent acknowledgements. Never retry an unacknowledged request beyond the provider idempotency window.';

-- Existing delivery IDs are bigint identities; a separate nullable key deduplicates daily reports.
ALTER TABLE public.email_deliveries ADD COLUMN scheduled_message_key text UNIQUE;
