-- Attach an optional private PDF to a stable shared-study snapshot.
begin;

alter table public.shared_study_links
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_file_size bigint,
  add column if not exists pdf_mime_type text,
  add column if not exists pdf_attached_at timestamptz;

alter table public.shared_study_links
  drop constraint if exists shared_study_pdf_metadata_check;
alter table public.shared_study_links
  add constraint shared_study_pdf_metadata_check check (
    (num_nonnulls(pdf_storage_path,pdf_file_name,pdf_file_size,pdf_mime_type,pdf_attached_at)=0)
    or (
      num_nonnulls(pdf_storage_path,pdf_file_name,pdf_file_size,pdf_mime_type,pdf_attached_at)=5
      and pdf_file_name<>''
      and length(pdf_file_name)<=255
      and lower(right(pdf_file_name,4))='.pdf'
      and position(chr(10) in pdf_file_name)=0
      and position(chr(13) in pdf_file_name)=0
      and position('/' in pdf_file_name)=0
      and position(chr(92) in pdf_file_name)=0
      and pdf_file_size between 1 and 26214400
      and pdf_mime_type='application/pdf'
      and pdf_storage_path=user_id::text||'/shared/'||share_id::text||'.pdf'
    )
  );

drop function if exists public.create_study_share(uuid,text,uuid,text,text,text,jsonb);
create function public.create_study_share(
  p_share_id uuid,
  p_kind text,
  p_source uuid,
  p_item text,
  p_title text,
  p_subject text,
  p_snapshot jsonb,
  p_pdf_file_name text default null,
  p_pdf_file_size bigint default null,
  p_pdf_mime_type text default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid:=auth.uid();
 existing public.shared_study_links;
 item jsonb;
 owned boolean:=false;
 object_path text;
begin
 if owner_id is null then raise exception 'Sign in to share study content.'; end if;
 if p_share_id is null or substring(p_share_id::text from 15 for 1)<>'4' or substring(p_share_id::text from 20 for 1) not in ('8','9','a','b') or p_source is null or p_kind is null then
  raise exception 'Invalid study source or share ID.';
 end if;
 case p_kind
 when 'pdf' then select exists(select 1 from public.pdfs where id=p_source and user_id=owner_id) into owned;
 when 'note' then select exists(select 1 from public.notes where id=p_source and user_id=owner_id) into owned;
 when 'flashcard' then select exists(select 1 from public.flashcards where id=p_source and user_id=owner_id) into owned;
 when 'quiz' then select exists(select 1 from public.quizzes q where q.id=p_source and q.user_id=owner_id and exists(select 1 from jsonb_array_elements(q.questions) v where v->>'id'=p_item)) into owned;
 else raise exception 'Invalid study source.';
 end case;
 if not owned then raise exception 'Save your study item before sharing, or refresh if it was deleted.'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 500 or p_subject is null or length(p_subject)>500 then
  raise exception 'Invalid share title or subject.';
 end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>1000000 or
  (p_snapshot-array['text','flashcards','quizzes'])<>'{}'::jsonb or
  jsonb_typeof(p_snapshot->'text') is distinct from 'string' or
  jsonb_typeof(p_snapshot->'flashcards') is distinct from 'array' or
  jsonb_typeof(p_snapshot->'quizzes') is distinct from 'array' then raise exception 'Invalid content snapshot.'; end if;
 if jsonb_array_length(p_snapshot->'flashcards')>500 or jsonb_array_length(p_snapshot->'quizzes')>500 then
  raise exception 'Share a smaller study selection.';
 end if;
 if length(trim(p_snapshot->>'text'))=0 and jsonb_array_length(p_snapshot->'flashcards')=0 and jsonb_array_length(p_snapshot->'quizzes')=0 then
  raise exception 'There is no study content to share.';
 end if;
 for item in select value from jsonb_array_elements((p_snapshot->'flashcards')||(p_snapshot->'quizzes')) loop
  if jsonb_typeof(item)<>'object' or (item-array['question','answer','explanation','options'])<>'{}'::jsonb or
   jsonb_typeof(item->'question') is distinct from 'string' or jsonb_typeof(item->'answer') is distinct from 'string' or
   jsonb_typeof(item->'explanation') is distinct from 'string' or jsonb_typeof(item->'options') is distinct from 'array' then
   raise exception 'Invalid study preview.';
  end if;
  if exists(select 1 from jsonb_array_elements(item->'options') o where jsonb_typeof(o)<>'string') then
   raise exception 'Invalid question options.';
  end if;
 end loop;

 if num_nonnulls(p_pdf_file_name,p_pdf_file_size,p_pdf_mime_type) not in (0,3) then raise exception 'Invalid PDF metadata.'; end if;
 if p_pdf_file_name is not null then
  if length(trim(p_pdf_file_name)) not between 1 and 255 or lower(right(p_pdf_file_name,4))<>'.pdf' or
   position(chr(10) in p_pdf_file_name)>0 or position(chr(13) in p_pdf_file_name)>0 or
   position('/' in p_pdf_file_name)>0 or position(chr(92) in p_pdf_file_name)>0 or
   p_pdf_file_size not between 1 and 26214400 or p_pdf_mime_type<>'application/pdf' then
   raise exception 'Invalid PDF metadata.';
  end if;
  object_path:=owner_id::text||'/shared/'||p_share_id::text||'.pdf';
  if not exists(select 1 from storage.objects where bucket_id='herin-pdfs' and name=object_path) then
   raise exception 'The attached PDF is unavailable.';
  end if;
 end if;

 -- Keep retries idempotent without allowing a link's attachment to be replaced after publication.
 perform pg_advisory_xact_lock(hashtextextended(p_share_id::text,0));
 select * into existing from public.shared_study_links where share_id=p_share_id;
 if found then
  if existing.user_id=owner_id and existing.is_public
   and existing.pdf_storage_path is not distinct from object_path
   and existing.pdf_file_name is not distinct from p_pdf_file_name
   and existing.pdf_file_size is not distinct from p_pdf_file_size
   and existing.pdf_mime_type is not distinct from p_pdf_mime_type then return existing.share_id; end if;
  raise exception 'This share link cannot be reused.';
 end if;
 insert into public.shared_study_links(
  share_id,user_id,pdf_id,note_id,flashcard_id,quiz_id,source_item_id,title,subject,content_snapshot,
  pdf_storage_path,pdf_file_name,pdf_file_size,pdf_mime_type,pdf_attached_at
 ) values(
  p_share_id,owner_id,case when p_kind='pdf' then p_source end,case when p_kind='note' then p_source end,
  case when p_kind='flashcard' then p_source end,case when p_kind='quiz' then p_source end,
  case when p_kind='quiz' then p_item end,p_title,p_subject,p_snapshot,
  object_path,p_pdf_file_name,p_pdf_file_size,p_pdf_mime_type,case when object_path is not null then now() end
 );
 return p_share_id;
end $$;

drop function if exists public.get_shared_study(uuid);
create function public.get_shared_study(p_share_id uuid)
returns table(
 title text,subject text,content_snapshot jsonb,created_at timestamptz,
 pdf_file_name text,pdf_file_size bigint,pdf_mime_type text,pdf_attached_at timestamptz
)
language sql stable security definer set search_path='' as $$
 select s.title,s.subject,s.content_snapshot,s.created_at,s.pdf_file_name,s.pdf_file_size,s.pdf_mime_type,s.pdf_attached_at
 from public.shared_study_links s
 where s.share_id=p_share_id and s.is_public and (s.expires_at is null or s.expires_at>now())
 and (s.quiz_id is null or exists(select 1 from public.quizzes q, jsonb_array_elements(q.questions) v where q.id=s.quiz_id and v->>'id'=s.source_item_id));
$$;

revoke all on function public.create_study_share(uuid,text,uuid,text,text,text,jsonb,text,bigint,text) from public,anon;
revoke all on function public.get_shared_study(uuid) from public;
grant execute on function public.create_study_share(uuid,text,uuid,text,text,text,jsonb,text,bigint,text) to authenticated;
grant execute on function public.get_shared_study(uuid) to anon,authenticated;
notify pgrst,'reload schema';
commit;
