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
#variable_conflict use_column
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

revoke all on function public.claim_next_scanner_control_command(text) from public;
grant execute on function public.claim_next_scanner_control_command(text) to service_role;
