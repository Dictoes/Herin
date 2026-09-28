-- Additive AI support. Apply AFTER the existing Herin setup; preserves all existing rows.
begin;
create table if not exists public.study_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  name text not null check (length(name) between 1 and 150),
  start_page integer not null check (start_page > 0),
  end_page integer not null check (end_page >= start_page),
  created_at timestamptz not null default now()
);
create table if not exists public.study_generations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pdf_id uuid not null references public.pdfs(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  topic_id uuid references public.study_topics(id) on delete set null,
  request jsonb not null,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  lease uuid not null,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  result jsonb
);
alter table public.flashcards alter column highlight_id drop not null;
alter table public.flashcards add column if not exists pdf_id uuid references public.pdfs(id) on delete cascade;
alter table public.flashcards add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.flashcards add column if not exists topic_id uuid references public.study_topics(id) on delete set null;
alter table public.flashcards add column if not exists difficulty text;
alter table public.flashcards add column if not exists source_page integer;
alter table public.flashcards add column if not exists generation_id uuid references public.study_generations(id) on delete set null;
alter table public.quizzes add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.quizzes add column if not exists topic_id uuid references public.study_topics(id) on delete set null;
alter table public.quizzes add column if not exists difficulty text;
alter table public.quizzes add column if not exists generation_id uuid references public.study_generations(id) on delete set null;
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  score integer not null check (score >= 0),
  total_questions integer not null check (total_questions > 0 and score <= total_questions),
  created_at timestamptz not null default now()
);
create index if not exists study_topics_owner_pdf on public.study_topics(user_id,pdf_id);
create index if not exists study_generations_owner_created on public.study_generations(user_id,created_at);
create index if not exists flashcards_pdf_id on public.flashcards(pdf_id);
create index if not exists quiz_attempts_owner_quiz on public.quiz_attempts(user_id,quiz_id);
alter table public.study_topics enable row level security;
alter table public.study_generations enable row level security;
alter table public.quiz_attempts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_topics' and policyname='Own study topics') then
    create policy "Own study topics" on public.study_topics for all to authenticated
      using (user_id=auth.uid()) with check (user_id=auth.uid() and exists (select 1 from public.pdfs p where p.id=pdf_id and p.user_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_generations' and policyname='Own study generations') then
    create policy "Own study generations" on public.study_generations for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quiz_attempts' and policyname='Own quiz attempts') then
    create policy "Own quiz attempts" on public.quiz_attempts for all to authenticated using (user_id=auth.uid())
      with check (user_id=auth.uid() and exists (select 1 from public.quizzes q where q.id=quiz_id and q.user_id=auth.uid()));
  end if;
end $$;
grant select,insert,update,delete on public.study_topics,public.study_generations,public.quiz_attempts to authenticated;

-- Serialize identical requests. Each attempt has a lease, so a timed-out worker cannot save over a retry.
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
    if (select count(*) from public.study_generations where user_id=owner and created_at>now()-interval '24 hours') >= 20 then raise exception 'DAILY_LIMIT'; end if;
    insert into public.study_generations(id,user_id,pdf_id,class_id,topic_id,request,lease)
      values((p_request->>'requestId')::uuid,owner,p.id,(p_request->>'classId')::uuid,t.id,p_request,p_lease);
  end if;
  return jsonb_build_object('completed',false);
end $$;

-- One transaction saves both kinds of material and its idempotent result.
create or replace function public.finish_study_generation(p_id uuid,p_lease uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.study_generations; p public.pdfs; item jsonb; card_id uuid; quiz_id uuid:=gen_random_uuid(); cards jsonb:='[]'; questions jsonb:='[]'; v_result jsonb; ui_pdf text;
begin
  select * into g from public.study_generations where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if g.status='completed' then return g.result; end if;
  if g.lease<>p_lease or g.status<>'processing' then raise exception 'REQUEST_CONFLICT'; end if;
  select * into p from public.pdfs where id=g.pdf_id and user_id=auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
  if g.class_id is not null and not exists(select 1 from public.classes where id=g.class_id and user_id=auth.uid()) then raise exception 'NOT_FOUND'; end if;
  if g.topic_id is not null and not exists(select 1 from public.study_topics where id=g.topic_id and pdf_id=g.pdf_id and user_id=auth.uid()) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_result->'flashcards')<>'array' or jsonb_typeof(p_result->'quiz_questions')<>'array' or jsonb_array_length(p_result->'flashcards')>30 or jsonb_array_length(p_result->'quiz_questions')>30 then raise exception 'INVALID_RESULT'; end if;
  ui_pdf:=coalesce(p.data->>'id',p.id::text);
  for item in select value from jsonb_array_elements(p_result->'flashcards') loop
    card_id:=gen_random_uuid();
    insert into public.flashcards(id,user_id,pdf_id,class_id,topic_id,highlight_id,question,answer,difficulty,source_page,generation_id,data)
      values(card_id,auth.uid(),g.pdf_id,g.class_id,g.topic_id,null,item->>'question',item->>'answer',item->>'difficulty',(item->>'source_page')::integer,g.id,
      jsonb_build_object('id',card_id,'pdfId',ui_pdf,'subject',p.data->>'subject','sourcePage',item->'source_page','difficulty',item->>'difficulty','generationId',g.id,'classId',g.class_id,'topicId',g.topic_id,'generated',true,'generator','gemini','level',0,'createdAt',now()));
    cards:=cards||jsonb_build_array(card_id);
  end loop;
  for item in select value from jsonb_array_elements(p_result->'quiz_questions') loop
    questions:=questions||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'pdfId',ui_pdf,'classId',g.class_id,'topicId',g.topic_id,'generationId',g.id,'createdAt',now(),'type','multiple','question',item->>'question','options',item->'choices','correctAnswer',item->>'correct_answer','explanation',item->>'explanation','difficulty',item->>'difficulty','sourcePage',item->'source_page','generated',true,'generator','gemini'));
  end loop;
  if jsonb_array_length(questions)>0 then
    insert into public.quizzes(id,user_id,pdf_id,class_id,topic_id,title,questions,total_questions,difficulty,generation_id)
      values(quiz_id,auth.uid(),g.pdf_id,g.class_id,g.topic_id,p.title||' — AI quiz',questions,jsonb_array_length(questions),g.request->>'difficulty',g.id);
  end if;
  v_result:=jsonb_build_object('generationId',g.id,'flashcardCount',jsonb_array_length(cards),'quizCount',jsonb_array_length(questions),'flashcardIds',cards,'quizId',case when jsonb_array_length(questions)>0 then quiz_id else null end,'summaries',coalesce(p_result->'summaries','[]'::jsonb));
  v_result:=v_result||jsonb_build_object('flashcards',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.flashcards f where f.generation_id=g.id and f.user_id=auth.uid()),'quiz',case when jsonb_array_length(questions)>0 then jsonb_build_object('id',quiz_id,'questions',questions) else null end);
  update public.study_generations set status='completed',result=v_result where id=g.id;
  return v_result;
end $$;

create or replace function public.save_quiz_attempt(p_id uuid,p_quiz uuid,p_score integer,p_total integer)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.quizzes where id=p_quiz and user_id=auth.uid() and p_total<=total_questions) then raise exception 'NOT_FOUND'; end if;
  insert into public.quiz_attempts(id,user_id,quiz_id,score,total_questions) values(p_id,auth.uid(),p_quiz,p_score,p_total) on conflict(id) do nothing;
  update public.quizzes set score=p_score where id=p_quiz and user_id=auth.uid();
end $$;
revoke all on function public.claim_study_generation(jsonb,uuid),public.finish_study_generation(uuid,uuid,jsonb),public.save_quiz_attempt(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.claim_study_generation(jsonb,uuid),public.finish_study_generation(uuid,uuid,jsonb),public.save_quiz_attempt(uuid,uuid,integer,integer) to authenticated;
commit;
