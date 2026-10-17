-- Run with the quota migration inside BEGIN/ROLLBACK. No fixture data is retained.
do $$
declare
  first_user uuid := gen_random_uuid();
  second_user uuid := gen_random_uuid();
  pdf uuid := gen_random_uuid();
  request_id uuid;
  last_request jsonb;
  balance jsonb;
  window_start timestamptz := date_bin(interval '8 hours', statement_timestamp(), timestamptz '2000-01-01 00:00:00+00');
begin
  insert into auth.users(id) values(first_user),(second_user);
  insert into public.pdfs(id,user_id,title,file_path) values(pdf,first_user,'Quota test','quota-test.pdf');
  -- Old-window requests must not reduce the new allowance.
  insert into public.study_generations(id,user_id,pdf_id,request,lease,created_at,status)
    select gen_random_uuid(),first_user,pdf,'{}'::jsonb,gen_random_uuid(),window_start-interval '1 microsecond','failed' from generate_series(1,20);
  perform set_config('request.jwt.claim.sub',first_user::text,true);
  execute 'set local role authenticated';
  balance := public.get_study_generation_quota();
  assert (balance->>'remaining')::integer=20, 'Old window counted';
  assert (balance->>'resets_at')::timestamptz=window_start+interval '8 hours', 'Wrong reset boundary';
  for i in 1..20 loop
    request_id := gen_random_uuid();
    last_request := jsonb_build_object('pdfId',pdf,'requestId',request_id,'contentType',case when i%2=0 then 'both' else 'quiz' end);
    perform public.claim_study_generation(last_request,gen_random_uuid());
  end loop;
  balance := public.get_study_generation_quota();
  assert (balance->>'remaining')::integer=0, 'Twenty requests did not exhaust allowance';
  begin
    perform public.claim_study_generation(jsonb_build_object('pdfId',pdf,'requestId',gen_random_uuid()),gen_random_uuid());
    raise exception 'Twenty-first request was allowed';
  exception when raise_exception then
    if sqlerrm <> 'GENERATION_LIMIT' then raise; end if;
  end;
  update public.study_generations set status='failed' where id=request_id;
  perform public.claim_study_generation(last_request,gen_random_uuid());
  assert (public.get_study_generation_quota()->>'used')::integer=20, 'Retry consumed another slot';
  perform set_config('request.jwt.claim.sub',second_user::text,true);
  assert (public.get_study_generation_quota()->>'remaining')::integer=20, 'Quota leaked across users';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.get_study_generation_quota();
    raise exception 'Unauthenticated quota read allowed';
  exception when raise_exception then
    if sqlerrm <> 'AUTH_REQUIRED' then raise; end if;
  end;
  execute 'reset role';
end $$;
select 'PASS: 20 allowed, 21st blocked, retry preserved, old window excluded, user isolation and auth enforced' as quota_tests;
