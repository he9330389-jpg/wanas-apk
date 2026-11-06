-- Safe, additive support for a single scheduled Push dispatcher.
-- This does not delete or rewrite existing dispatch rows.

alter table public.push_dispatch
  add column if not exists claimed_at timestamptz;

create index if not exists push_dispatch_status_created_at_idx
  on public.push_dispatch (status, created_at);

create or replace function public.claim_push_dispatch(p_limit integer default 100)
returns table (
  id uuid,
  notification_id uuid,
  user_id uuid,
  token text,
  title text,
  body text,
  data jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  with picked as (
    select d.id
    from public.push_dispatch as d
    where d.status = 'pending'
       or (d.status = 'processing' and d.claimed_at < clock_timestamp() - interval '5 minutes')
    order by d.created_at asc
    for update skip locked
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ), claimed as (
    update public.push_dispatch as d
       set status = 'processing',
           claimed_at = clock_timestamp(),
           attempts = d.attempts + 1
      from picked
     where d.id = picked.id
    returning d.id, d.notification_id, d.user_id, d.token, d.title, d.body, d.data, d.attempts
  )
  select claimed.id, claimed.notification_id, claimed.user_id, claimed.token,
         claimed.title, claimed.body, claimed.data, claimed.attempts
    from claimed;
end;
$$;

create or replace function public.validate_push_drain_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select p_secret is not null and exists (
    select 1
      from vault.decrypted_secrets as s
     where s.name = 'wanas_push_drain_secret'
       and s.decrypted_secret = p_secret
  );
$$;

revoke all on function public.claim_push_dispatch(integer) from public, anon, authenticated;
revoke all on function public.validate_push_drain_secret(text) from public, anon, authenticated;
grant execute on function public.claim_push_dispatch(integer) to service_role;
grant execute on function public.validate_push_drain_secret(text) to service_role;

-- Generate the internal scheduler token inside Vault; it is never returned to the client.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'wanas_push_drain_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'wanas_push_drain_secret',
      'Internal authentication for the WANAS scheduled Push dispatcher',
      null
    );
  end if;
end;
$$;
