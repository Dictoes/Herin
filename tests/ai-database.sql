-- Run against a configured project. All test users and content roll back, including on failure.
begin;
create temporary table ai_test_ids as select gen_random_uuid() owner_id,gen_random_uuid() other_id,gen_random_uuid() pdf_id,gen_random_uuid() request_id,gen_random_uuid() lease_id,gen_random_uuid() attempt_id;
grant select on ai_test_ids to authenticated;
insert into auth.users(id,aud,role,email) select owner_id,'authenticated','authenticated',owner_id::text||'@example.invalid' from ai_test_ids;
insert into auth.users(id,aud,role,email) select other_id,'authenticated','authenticated',other_id::text||'@example.invalid' from ai_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_id::text from ai_test_ids),true) is not null as authenticated;
insert into public.pdfs(id,user_id,title,file_path,page_count,data,extracted_text) select pdf_id,owner_id,'Transaction-only test',owner_id::text||'/test.pdf',1,'{}','{"pages":[{"pageNum":1,"text":"Plants use light."}]}' from ai_test_ids;
do $$
declare ids record; req jsonb; claim jsonb; saved jsonb; saved_again jsonb; denied boolean:=false;
begin
  select * into ids from ai_test_ids;
  req:=jsonb_build_object('pdfId',ids.pdf_id,'requestId',ids.request_id,'classId',null,'topicId',null,'contentType','both','quantity',1,'difficulty','easy');
  claim:=public.claim_study_generation(req,ids.lease_id);
  if (claim->>'completed')::boolean then raise exception 'Unexpected completion'; end if;
  begin perform public.claim_study_generation(req,gen_random_uuid()); exception when others then if sqlerrm like '%IN_PROGRESS%' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Concurrent request was not blocked'; end if;
  saved:=public.finish_study_generation(ids.request_id,ids.lease_id,'{"flashcards":[{"question":"What do plants use?","answer":"Light","difficulty":"easy","source_page":1}],"quiz_questions":[{"question":"What do plants use?","choices":["Light","Stone","Sand","Metal"],"correct_answer":"Light","explanation":"The source states light.","difficulty":"easy","source_page":1}],"summaries":[]}');
  saved_again:=public.finish_study_generation(ids.request_id,ids.lease_id,'{}');
  if saved<>saved_again or (saved->>'flashcardCount')::int<>1 or (saved->>'quizCount')::int<>1 then raise exception 'Idempotent save failed'; end if;
  if (select count(*) from public.flashcards where generation_id=ids.request_id)<>1 then raise exception 'Duplicate cards'; end if;
  perform public.save_quiz_attempt(ids.attempt_id,(saved->>'quizId')::uuid,1,1);
  perform public.save_quiz_attempt(ids.attempt_id,(saved->>'quizId')::uuid,1,1);
  if (select count(*) from public.quiz_attempts where id=ids.attempt_id)<>1 then raise exception 'Duplicate attempt'; end if;
  if (select score from public.quizzes where id=(saved->>'quizId')::uuid)<>1 then raise exception 'Score not saved'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select other_id::text from ai_test_ids),true) is not null as switched_account;
do $$ declare ids record; denied boolean:=false;
begin
  select * into ids from ai_test_ids;
  if exists(select 1 from public.pdfs where id=ids.pdf_id) or exists(select 1 from public.study_generations where id=ids.request_id) or exists(select 1 from public.flashcards where generation_id=ids.request_id) then raise exception 'RLS exposed another owner'; end if;
  begin perform public.claim_study_generation(jsonb_build_object('pdfId',ids.pdf_id,'requestId',gen_random_uuid()),gen_random_uuid()); exception when others then if sqlerrm like '%NOT_FOUND%' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Cross-owner generation allowed'; end if;
end $$;
rollback;
select 'PASS: atomic save, duplicate retry, concurrency lease, quiz score/history, cross-user RLS; all fixtures rolled back' as result;
