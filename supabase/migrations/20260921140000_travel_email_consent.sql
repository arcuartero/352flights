alter table public.newsletter_subscribers
  add column if not exists travel_email_consent boolean not null default false,
  add column if not exists travel_email_consented_at timestamptz,
  add column if not exists travel_email_consent_version text,
  add column if not exists travel_email_consent_locale text;

create table if not exists public.subscriber_travel_email_consent_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  consented boolean not null,
  text_version text not null,
  locale text not null,
  source text not null check (source in ('signup', 'preferences', 'unsubscribe')),
  recorded_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscriber_travel_email_consent_events_subscriber_idx
  on public.subscriber_travel_email_consent_events (subscriber_id, recorded_at desc);

create or replace function public.record_travel_email_consent_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.travel_email_consent then
      insert into public.subscriber_travel_email_consent_events
        (subscriber_id, consented, text_version, locale, source, recorded_at)
      values
        (new.id, true, new.travel_email_consent_version, new.travel_email_consent_locale,
         'signup', new.travel_email_consented_at);
    end if;
  elsif new.travel_email_consent is distinct from old.travel_email_consent then
    insert into public.subscriber_travel_email_consent_events
      (subscriber_id, consented, text_version, locale, source)
    values
      (new.id, new.travel_email_consent,
       coalesce(new.travel_email_consent_version, old.travel_email_consent_version),
       coalesce(new.travel_email_consent_locale, old.travel_email_consent_locale),
       case when new.status = 'unsubscribed' then 'unsubscribe' else 'preferences' end);
  end if;
  return new;
end;
$$;

drop trigger if exists record_travel_email_consent_event on public.newsletter_subscribers;
create trigger record_travel_email_consent_event
after insert or update of travel_email_consent on public.newsletter_subscribers
for each row execute function public.record_travel_email_consent_event();

alter table public.subscriber_travel_email_consent_events enable row level security;
