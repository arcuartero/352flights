create or replace function public.guard_price_scan_run_liveness()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.last_progress_at := coalesce(
      new.last_progress_at,
      new.heartbeat_at,
      new.started_at
    );
    return new;
  end if;

  -- A fresh heartbeat from the exact same process can repair a run that the
  -- liveness reconciler closed while Supabase was timing out. Saved or delayed
  -- local state keeps its old heartbeat and therefore cannot reopen a run.
  if old.status <> 'running' and new.status = 'running' then
    if
      old.stopped_reason_code = 'heartbeat_expired'
      and new.run_key = old.run_key
      and new.started_at = old.started_at
      and new.heartbeat_at is not null
      and new.heartbeat_at > greatest(
        coalesce(old.heartbeat_at, old.started_at),
        coalesce(old.last_progress_at, old.started_at)
      )
      and new.heartbeat_at >= timezone('utc', now()) - interval '15 minutes'
    then
      new.completed_at := null;
      new.duration_ms := null;
      new.stopped_reason := null;
      new.stopped_reason_code := null;
      new.sync_status := 'pending';
      new.sync_summary := coalesce(old.sync_summary, '{}'::jsonb) || jsonb_build_object(
        'reopened_from_live_heartbeat', true,
        'reopened_at', timezone('utc', now())
      );
    else
      return old;
    end if;
  end if;

  if
    new.routes_started is distinct from old.routes_started
    or new.routes_completed is distinct from old.routes_completed
    or new.destinations_scanned is distinct from old.destinations_scanned
    or new.patterns_scanned is distinct from old.patterns_scanned
    or new.rules_scanned is distinct from old.rules_scanned
    or new.found_prices is distinct from old.found_prices
    or new.deal_candidates is distinct from old.deal_candidates
    or new.no_results is distinct from old.no_results
    or new.timed_out is distinct from old.timed_out
    or new.network_outages is distinct from old.network_outages
    or new.hard_errors is distinct from old.hard_errors
    or new.retries is distinct from old.retries
  then
    new.last_progress_at := greatest(
      coalesce(old.last_progress_at, old.started_at),
      coalesce(new.heartbeat_at, timezone('utc', now()))
    );
  else
    new.last_progress_at := coalesce(
      old.last_progress_at,
      new.last_progress_at,
      old.started_at
    );
  end if;

  return new;
end;
$$;
