create table if not exists public.scanner_control_agents (
  id text primary key,
  last_seen_at timestamptz not null default timezone('utc', now()),
  price_scanner_running boolean not null default false,
  dates_scanner_running boolean not null default false,
  active_owner text,
  active_pid bigint,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  check (active_owner is null or active_owner in ('price_scanner', 'dates_scanner'))
);

create table if not exists public.scanner_control_commands (
  id uuid primary key default gen_random_uuid(),
  target_agent_id text not null references public.scanner_control_agents(id) on delete cascade,
  scanner_type text not null check (scanner_type in ('price_scanner', 'dates_scanner')),
  action text not null check (action in ('start', 'stop')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'failed', 'expired')),
  requested_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  completed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error text,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists scanner_control_one_active_command_idx
  on public.scanner_control_commands (target_agent_id, scanner_type)
  where status in ('pending', 'claimed');

create index if not exists scanner_control_commands_recent_idx
  on public.scanner_control_commands (target_agent_id, requested_at desc);

alter table public.scanner_control_agents enable row level security;
alter table public.scanner_control_commands enable row level security;

create or replace function public.claim_next_scanner_control_command(
  p_agent_id text
)
returns table (
  id uuid,
  scanner_type text,
  action text,
  payload jsonb,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scanner_control_commands
  set
    status = 'expired',
    completed_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    error = 'The Mac did not collect this command before it expired.'
  where target_agent_id = p_agent_id
    and status = 'pending'
    and requested_at < timezone('utc', now()) - interval '10 minutes';

  return query
  with next_command as (
    select command.id
    from public.scanner_control_commands as command
    where command.target_agent_id = p_agent_id
      and command.status = 'pending'
    order by command.requested_at asc
    limit 1
    for update skip locked
  )
  update public.scanner_control_commands as command
  set
    status = 'claimed',
    claimed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from next_command
  where command.id = next_command.id
  returning
    command.id,
    command.scanner_type,
    command.action,
    command.payload,
    command.requested_at;
end;
$$;

insert into public.scanner_control_agents (id, metadata)
values ('mac', '{"label":"Mac scanner controller"}'::jsonb)
on conflict (id) do nothing;

revoke all on table public.scanner_control_agents from anon, authenticated;
revoke all on table public.scanner_control_commands from anon, authenticated;
grant select, insert, update on table public.scanner_control_agents to service_role;
grant select, insert, update on table public.scanner_control_commands to service_role;

revoke all on function public.claim_next_scanner_control_command(text) from public;
grant execute on function public.claim_next_scanner_control_command(text) to service_role;

comment on table public.scanner_control_commands is
  'Private command queue used by /ops to control scanners running on the Mac.';
