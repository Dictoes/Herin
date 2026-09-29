create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The secret is provisioned separately into Vault and Edge Function secrets.
-- No browser key or user session can invoke this scheduled dispatcher.
create or replace function public.dispatch_due_push()
returns void language plpgsql security definer set search_path='' as $$
declare credential text;
begin
 if not exists(select 1 from public.push_subscriptions s join public.user_preferences p on p.user_id=s.user_id where p.push_notifications) then return; end if;
 select decrypted_secret into credential from vault.decrypted_secrets where name='herin_push_cron_secret' limit 1;
 if credential is null then raise exception 'Push scheduler credential is missing'; end if;
 perform net.http_post(
  url:='https://ycejqtvemiesuiflyqmw.supabase.co/functions/v1/push-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',credential),
  body:='{"action":"dispatch"}'::jsonb,
  timeout_milliseconds:=55000
 );
end;
$$;
revoke all on function public.dispatch_due_push() from public, anon, authenticated;
grant execute on function public.dispatch_due_push() to service_role;
select cron.schedule('herin-background-reminders','* * * * *','select public.dispatch_due_push();');
