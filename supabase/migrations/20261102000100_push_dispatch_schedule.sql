-- pg_net is used only to invoke our protected Edge Function from pg_cron.
create extension if not exists pg_net;

-- Do not send the known placeholder tokens left by integration testing to Expo.
-- Keep the rows for audit; only mark them as unusable test fixtures.
with fake_pending as (
  select id
    from public.push_dispatch
   where status = 'pending'
     and token like 'ExponentPushToken[test-%'
   order by created_at asc
   limit 100
)
update public.push_dispatch as d
   set status = 'failed',
       last_error = 'test_placeholder_token',
       claimed_at = null
 where d.id in (select id from fake_pending);

-- Replace only this named job if the migration is reapplied.
do $wanas$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
    from cron.job
   where jobname = 'wanas-push-drain'
   limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'wanas-push-drain',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://ycqvqcbejzzbxsnkqkxk.supabase.co/functions/v1/push-drain',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-push-secret', (
            select decrypted_secret
              from vault.decrypted_secrets
             where name = 'wanas_push_drain_secret'
          )
        ),
        body := jsonb_build_object('limit', 100),
        timeout_milliseconds := 10000
      );
    $job$
  );
end;
$wanas$;
