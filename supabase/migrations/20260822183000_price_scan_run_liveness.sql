alter table public.price_scan_runs
  add column if not exists heartbeat_at timestamptz,
  add column if not exists last_progress_at timestamptz;

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

  -- A delayed sync from an old local state must never reopen a run that has
  -- already reached a terminal state.
  if old.status <> 'running' and new.status = 'running' then
    return old;
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
    -- In particular, keep this timestamp unchanged when only updated_at,
    -- sync_status, or sync_summary is written by a retrying synchronizer.
    new.last_progress_at := coalesce(
      old.last_progress_at,
      new.last_progress_at,
      old.started_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists price_scan_runs_guard_liveness on public.price_scan_runs;
create trigger price_scan_runs_guard_liveness
before insert or update on public.price_scan_runs
for each row
execute function public.guard_price_scan_run_liveness();

create or replace function public.close_superseded_price_scan_runs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.price_scan_runs
  set
    status = 'stopped',
    completed_at = coalesce(heartbeat_at, last_progress_at, timezone('utc', now())),
    duration_ms = greatest(
      round(
        extract(
          epoch from (
            coalesce(heartbeat_at, last_progress_at, timezone('utc', now())) - started_at
          )
        ) * 1000
      ),
      0
    ),
    stopped_reason = 'Scanner stopped before completion because a newer scanner execution started.',
    stopped_reason_code = 'superseded_by_new_run',
    sync_status = case when sync_status = 'completed' then sync_status else 'partial' end,
    sync_summary = coalesce(sync_summary, '{}'::jsonb) || jsonb_build_object(
      'automatically_closed', true,
      'superseded_by_run_key', new.run_key,
      'closed_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
  where status = 'running'
    and run_key <> new.run_key
    and started_at < new.started_at;

  return new;
end;
$$;

drop trigger if exists price_scan_runs_close_superseded on public.price_scan_runs;
create trigger price_scan_runs_close_superseded
after insert or update of status, started_at on public.price_scan_runs
for each row
when (new.status = 'running')
execute function public.close_superseded_price_scan_runs();

create or replace function public.reconcile_stale_price_scan_runs(
  stale_after_seconds integer default 1800
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer;
begin
  update public.price_scan_runs
  set
    status = 'stopped',
    completed_at = case
      when heartbeat_at is not null or last_progress_at is not null
        then greatest(
          coalesce(heartbeat_at, started_at),
          coalesce(last_progress_at, started_at)
        )
      else timezone('utc', now())
    end,
    duration_ms = case
      when heartbeat_at is null and last_progress_at is null then null
      else greatest(
        round(
          extract(
            epoch from (
              greatest(
                coalesce(heartbeat_at, started_at),
                coalesce(last_progress_at, started_at)
              ) - started_at
            )
          ) * 1000
        ),
        0
      )
    end,
    stopped_reason = 'No real scanner activity was recorded before the liveness deadline. The saved partial results were preserved.',
    stopped_reason_code = 'heartbeat_expired',
    sync_status = case when sync_status = 'completed' then sync_status else 'partial' end,
    sync_summary = coalesce(sync_summary, '{}'::jsonb) || jsonb_build_object(
      'automatically_closed', true,
      'liveness_timeout_seconds', greatest(stale_after_seconds, 60),
      'last_heartbeat_at', heartbeat_at,
      'last_progress_at', last_progress_at,
      'closed_at', timezone('utc', now())
    ),
    updated_at = timezone('utc', now())
  where status = 'running'
    and greatest(
      coalesce(heartbeat_at, started_at),
      coalesce(last_progress_at, started_at)
    ) < timezone('utc', now()) - make_interval(secs => greatest(stale_after_seconds, 60));

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

create index if not exists price_scan_runs_running_liveness_idx
  on public.price_scan_runs (
    greatest(
      coalesce(heartbeat_at, started_at),
      coalesce(last_progress_at, started_at)
    )
  )
  where status = 'running';

revoke all on function public.reconcile_stale_price_scan_runs(integer) from public;
grant execute on function public.reconcile_stale_price_scan_runs(integer) to service_role;

-- Legacy running rows have no heartbeat. Start their progress clock at the
-- recorded start rather than at updated_at, which may have been refreshed by
-- sync retries. This immediately closes genuinely abandoned historical rows.
update public.price_scan_runs
set last_progress_at = started_at
where status = 'running'
  and last_progress_at is null;

select public.reconcile_stale_price_scan_runs(1800);
