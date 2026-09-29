-- Browser subscriptions are independent from workspace snapshots/backups.
create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null unique,
 subscription jsonb not null,
 timezone text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Read own push devices" on public.push_subscriptions;
create policy "Read own push devices" on public.push_subscriptions for select to authenticated using (user_id=auth.uid());
drop policy if exists "Remove own push devices" on public.push_subscriptions;
create policy "Remove own push devices" on public.push_subscriptions for delete to authenticated using (user_id=auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create index if not exists push_subscriptions_owner on public.push_subscriptions(user_id);

create table if not exists public.push_deliveries (
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 event_key text not null,
 attempts int not null default 1,
 lease_until timestamptz not null default now()+interval '2 minutes',
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(subscription_id,event_key)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;
create or replace function public.claim_push_delivery(p_subscription uuid, p_key text)
returns boolean language sql security definer set search_path = '' as $$
 with claimed as (
 insert into public.push_deliveries(subscription_id,event_key) values(p_subscription,p_key)
 on conflict(subscription_id,event_key) do update
 set attempts=public.push_deliveries.attempts+1, lease_until=now()+interval '2 minutes'
 where public.push_deliveries.sent_at is null and public.push_deliveries.lease_until<now() and public.push_deliveries.attempts<3
 returning 1
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_push_delivery(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_push_delivery(uuid,text) to service_role;
