-- Shared allowance across PDFs and generation types. Fixed UTC 00:00/08:00/16:00 resets.
-- Read-only, caller-scoped RPC; never accepts a user ID or client-supplied clock.
create or replace function public.get_study_generation_quota()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  owner uuid := auth.uid();
  current_time_utc timestamptz := statement_timestamp();
  window_start timestamptz;
  used_count integer;
begin
  if owner is null then raise exception 'AUTH_REQUIRED'; end if;
  window_start := date_bin(interval '8 hours', current_time_utc, timestamptz '2000-01-01 00:00:00+00');
  select count(*) into used_count from public.study_generations
    where user_id=owner and created_at >= window_start and created_at < window_start + interval '8 hours';
  return jsonb_build_object('limit',20,'used',used_count,'remaining',greatest(0,20-used_count),
    'resets_at',window_start + interval '8 hours','server_now',current_time_utc);
end $$;
revoke all on function public.get_study_generation_quota() from public, anon;
grant execute on function public.get_study_generation_quota() to authenticated;

-- Preserve the existing per-user advisory lock, ownership validation and idempotent retries.
create or replace function public.claim_study_generation(p_request jsonb,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.study_generations; p public.pdfs; t public.study_topics; owner uuid:=auth.uid();
begin
  if owner is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
  select * into p from public.pdfs where id=(p_request->>'pdfId')::uuid and user_id=owner;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_request->>'classId' is not null and not exists(select 1 from public.classes where id=(p_request->>'classId')::uuid and user_id=owner) then raise exception 'NOT_FOUND'; end if;
  if p_request->>'topicId' is not null then
    select * into t from public.study_topics where id=(p_request->>'topicId')::uuid and pdf_id=p.id and user_id=owner;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  select * into g from public.study_generations where id=(p_request->>'requestId')::uuid and user_id=owner for update;
  if found then
    if g.request <> p_request then raise exception 'REQUEST_CONFLICT'; end if;
    if g.status='completed' then return jsonb_build_object('completed',true,'result',g.result); end if;
    if g.status='processing' and g.started_at > now()-interval '3 minutes' then raise exception 'IN_PROGRESS'; end if;
    update public.study_generations set status='processing',lease=p_lease,started_at=now() where id=g.id;
  else
    if (public.get_study_generation_quota()->>'remaining')::integer = 0 then raise exception 'GENERATION_LIMIT'; end if;
    insert into public.study_generations(id,user_id,pdf_id,class_id,topic_id,request,lease)
      values((p_request->>'requestId')::uuid,owner,p.id,(p_request->>'classId')::uuid,t.id,p_request,p_lease);
  end if;
  return jsonb_build_object('completed',false);
end $$;

