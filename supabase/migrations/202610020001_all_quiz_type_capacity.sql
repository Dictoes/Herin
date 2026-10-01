-- All-types generation requests a per-type count, so the saved quiz can contain
-- up to four times the requested count. Existing generation records are untouched.
begin;
create or replace function public.finish_study_generation(p_id uuid,p_lease uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.study_generations; p public.pdfs; item jsonb; card_id uuid; quiz_id uuid:=gen_random_uuid(); cards jsonb:='[]'; questions jsonb:='[]'; v_result jsonb; ui_pdf text; question_type text;
begin
  select * into g from public.study_generations where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if g.status='completed' then return g.result; end if;
  if g.lease<>p_lease or g.status<>'processing' then raise exception 'REQUEST_CONFLICT'; end if;
  select * into p from public.pdfs where id=g.pdf_id and user_id=auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
  if g.class_id is not null and not exists(select 1 from public.classes where id=g.class_id and user_id=auth.uid()) then raise exception 'NOT_FOUND'; end if;
  if g.topic_id is not null and not exists(select 1 from public.study_topics where id=g.topic_id and pdf_id=g.pdf_id and user_id=auth.uid()) then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_result->'flashcards')<>'array' or jsonb_typeof(p_result->'quiz_questions')<>'array'
    or jsonb_array_length(p_result->'flashcards')>30 or jsonb_array_length(p_result->'quiz_questions')>120 then raise exception 'INVALID_RESULT'; end if;
  if jsonb_array_length(p_result->'quiz_questions')>coalesce((g.request->>'quantity')::integer,10)*case when g.request->>'quizType'='all' then 4 else 1 end then raise exception 'INVALID_RESULT'; end if;
  if g.request->>'quizType'='all' and exists(
    select 1 from jsonb_array_elements(p_result->'quiz_questions') as entries(question)
    group by entries.question->>'type'
    having count(*)>coalesce((g.request->>'quantity')::integer,10)
  ) then raise exception 'INVALID_RESULT'; end if;
  if g.request->>'contentType'='quiz' and jsonb_array_length(p_result->'quiz_questions')=0 then raise exception 'INVALID_RESULT'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_result->'quiz_questions') as entries(question)
    group by lower(regexp_replace(btrim(entries.question->>'question'),'[^[:alnum:]]+',' ','g'))
    having count(*)>1
  ) then raise exception 'INVALID_RESULT'; end if;
  ui_pdf:=coalesce(p.data->>'id',p.id::text);
  for item in select value from jsonb_array_elements(p_result->'flashcards') loop
    card_id:=gen_random_uuid();
    insert into public.flashcards(id,user_id,pdf_id,class_id,topic_id,highlight_id,question,answer,difficulty,source_page,generation_id,data)
      values(card_id,auth.uid(),g.pdf_id,g.class_id,g.topic_id,null,item->>'question',item->>'answer',item->>'difficulty',(item->>'source_page')::integer,g.id,
      jsonb_build_object('id',card_id,'pdfId',ui_pdf,'subject',p.data->>'subject','sourcePage',item->'source_page','difficulty',item->>'difficulty','generationId',g.id,'classId',g.class_id,'topicId',g.topic_id,'generated',true,'generator','gemini','level',0,'createdAt',now()));
    cards:=cards||jsonb_build_array(card_id);
  end loop;
  for item in select value from jsonb_array_elements(p_result->'quiz_questions') loop
    question_type:=item->>'type';
    if question_type is null or question_type not in ('multiple','identification','enumeration','true-false','application')
      or (coalesce(g.request->>'quizType','multiple')<>'all' and question_type<>coalesce(g.request->>'quizType','multiple'))
      or nullif(btrim(item->>'question'),'') is null
      or length(item->>'question')>1000
      or nullif(btrim(item->>'correct_answer'),'') is null
      or length(item->>'correct_answer')>4000
      or nullif(btrim(item->>'explanation'),'') is null
      or length(item->>'explanation')>4000
      or item->>'difficulty' not in ('easy','medium','hard')
      or (g.request->>'difficulty' in ('easy','medium','hard') and item->>'difficulty'<>g.request->>'difficulty')
      or not (item ?& array['type','question','difficulty','source_page','correct_answer','explanation'])
      or item - array['type','question','difficulty','source_page','correct_answer','explanation','choices','expected_items'] <> '{}'::jsonb
      or (jsonb_typeof(item->'source_page') is distinct from 'number' and jsonb_typeof(item->'source_page') is distinct from 'null')
      or (jsonb_typeof(item->'source_page')='number' and (item->>'source_page')::numeric<>trunc((item->>'source_page')::numeric))
      then raise exception 'INVALID_RESULT'; end if;
    if question_type='multiple' then
      if jsonb_typeof(item->'choices') is distinct from 'array' or not (item ? 'choices') then raise exception 'INVALID_RESULT'; end if;
      if jsonb_array_length(item->'choices')<>4
        or exists(select 1 from jsonb_array_elements(item->'choices') c where jsonb_typeof(c)<>'string' or length(c#>>'{}')>1000 or nullif(btrim(c#>>'{}'),'') is null)
        or (select count(distinct lower(btrim(c#>>'{}'))) from jsonb_array_elements(item->'choices') c)<>4
        or not (item->'choices' @> jsonb_build_array(item->>'correct_answer'))
        then raise exception 'INVALID_RESULT'; end if;
    end if;
    if question_type='true-false' and (not (item ? 'choices') or item->'choices' is distinct from '["True","False"]'::jsonb or item->>'correct_answer' not in ('True','False')) then raise exception 'INVALID_RESULT'; end if;
    if question_type='enumeration' then
      if jsonb_typeof(item->'expected_items') is distinct from 'array' or not (item ? 'expected_items') then raise exception 'INVALID_RESULT'; end if;
      if jsonb_array_length(item->'expected_items')<2 or jsonb_array_length(item->'expected_items')>20
        or exists(select 1 from jsonb_array_elements(item->'expected_items') e where jsonb_typeof(e)<>'string' or length(e#>>'{}')>1000 or nullif(btrim(e#>>'{}'),'') is null)
        or (select count(distinct lower(btrim(e#>>'{}'))) from jsonb_array_elements(item->'expected_items') e)<>jsonb_array_length(item->'expected_items')
        or lower(regexp_replace(btrim(item->>'correct_answer'),'[^[:alnum:]]+',' ','g'))<>
          lower(regexp_replace(btrim((select string_agg(e#>>'{}','; ' order by ordinal) from jsonb_array_elements(item->'expected_items') with ordinality as entries(e,ordinal))),'[^[:alnum:]]+',' ','g'))
        then raise exception 'INVALID_RESULT'; end if;
    end if;
    if question_type in ('identification','application') and (item ? 'choices' or item ? 'expected_items') then raise exception 'INVALID_RESULT'; end if;
    if question_type in ('multiple','true-false') and item ? 'expected_items' then raise exception 'INVALID_RESULT'; end if;
    if question_type<>'multiple' and question_type<>'true-false' and item ? 'choices' then raise exception 'INVALID_RESULT'; end if;
    questions:=questions||jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'pdfId',ui_pdf,'classId',g.class_id,'topicId',g.topic_id,'generationId',g.id,'createdAt',now(),
      'type',question_type,'question',item->>'question','options',item->'choices','expectedItems',item->'expected_items',
      'correctAnswer',item->>'correct_answer','explanation',item->>'explanation','difficulty',item->>'difficulty',
      'sourcePage',item->'source_page','generated',true,'generator','gemini'
    ));
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
revoke all on function public.finish_study_generation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.finish_study_generation(uuid,uuid,jsonb) to authenticated;
commit;
