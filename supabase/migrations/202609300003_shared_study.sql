-- Public access is only through an exact, unguessable token lookup. No public listing.
begin;
create table if not exists public.shared_study_links (
 id uuid primary key default gen_random_uuid(),
 share_id uuid not null unique default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 pdf_id uuid references public.pdfs(id) on delete cascade,
 note_id uuid references public.notes(id) on delete cascade,
 flashcard_id uuid references public.flashcards(id) on delete cascade,
 quiz_id uuid references public.quizzes(id) on delete cascade,
 source_item_id text,
 title text not null check (length(title) between 1 and 500),
 subject text not null default '' check (length(subject)<=500),
 content_snapshot jsonb not null check (jsonb_typeof(content_snapshot)='object' and octet_length(content_snapshot::text)<=1000000),
 is_public boolean not null default true,
 created_at timestamptz not null default now(),
 expires_at timestamptz,
 check (num_nonnulls(pdf_id,note_id,flashcard_id,quiz_id)=1)
);
create index if not exists shared_study_owner_idx on public.shared_study_links(user_id,created_at desc);
alter table public.shared_study_links enable row level security;
revoke all on public.shared_study_links from anon,authenticated;
grant select on public.shared_study_links to authenticated;
drop policy if exists "Owners view their shares" on public.shared_study_links;
create policy "Owners view their shares" on public.shared_study_links for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.create_study_share(p_share_id uuid,p_kind text,p_source uuid,p_item text,p_title text,p_subject text,p_snapshot jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); existing public.shared_study_links; item jsonb; owned boolean:=false;
begin
 if owner_id is null then raise exception 'Sign in to share study content.'; end if;
 if p_share_id is null or p_source is null or p_kind is null then raise exception 'Invalid study source.'; end if;
 case p_kind
 when 'pdf' then select exists(select 1 from public.pdfs where id=p_source and user_id=owner_id) into owned;
 when 'note' then select exists(select 1 from public.notes where id=p_source and user_id=owner_id) into owned;
 when 'flashcard' then select exists(select 1 from public.flashcards where id=p_source and user_id=owner_id) into owned;
 when 'quiz' then select exists(select 1 from public.quizzes q where q.id=p_source and q.user_id=owner_id and exists(select 1 from jsonb_array_elements(q.questions) v where v->>'id'=p_item)) into owned;
 else raise exception 'Invalid study source.';
 end case;
 if not owned then raise exception 'Save your study item before sharing, or refresh if it was deleted.'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 500 or p_subject is null or length(p_subject)>500 then raise exception 'Invalid share title or subject.'; end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object' or octet_length(p_snapshot::text)>1000000 or
 (p_snapshot - array['text','flashcards','quizzes'])<>'{}'::jsonb or
 jsonb_typeof(p_snapshot->'text') is distinct from 'string' or
 jsonb_typeof(p_snapshot->'flashcards') is distinct from 'array' or
 jsonb_typeof(p_snapshot->'quizzes') is distinct from 'array' then raise exception 'Invalid content snapshot.'; end if;
 if jsonb_array_length(p_snapshot->'flashcards')>500 or jsonb_array_length(p_snapshot->'quizzes')>500 then raise exception 'Share a smaller study selection.'; end if;
 if length(trim(p_snapshot->>'text'))=0 and jsonb_array_length(p_snapshot->'flashcards')=0 and jsonb_array_length(p_snapshot->'quizzes')=0 then raise exception 'There is no study content to share.'; end if;
 for item in select value from jsonb_array_elements((p_snapshot->'flashcards')||(p_snapshot->'quizzes')) loop
  if jsonb_typeof(item)<>'object' or (item-array['question','answer','explanation','options'])<>'{}'::jsonb or
   jsonb_typeof(item->'question') is distinct from 'string' or jsonb_typeof(item->'answer') is distinct from 'string' or
   jsonb_typeof(item->'explanation') is distinct from 'string' or jsonb_typeof(item->'options') is distinct from 'array' then raise exception 'Invalid study preview.'; end if;
  if exists(select 1 from jsonb_array_elements(item->'options') o where jsonb_typeof(o)<>'string') then raise exception 'Invalid question options.'; end if;
 end loop;
 -- Retry with the same token never updates an existing snapshot or re-enables a revoked link.
 select * into existing from public.shared_study_links where share_id=p_share_id;
 if found then
  if existing.user_id=owner_id and existing.is_public then return existing.share_id; end if;
  raise exception 'This share link cannot be reused.';
 end if;
 insert into public.shared_study_links(share_id,user_id,pdf_id,note_id,flashcard_id,quiz_id,source_item_id,title,subject,content_snapshot)
 values(p_share_id,owner_id,case when p_kind='pdf' then p_source end,case when p_kind='note' then p_source end,case when p_kind='flashcard' then p_source end,case when p_kind='quiz' then p_source end,case when p_kind='quiz' then p_item end,p_title,p_subject,p_snapshot);
 return p_share_id;
end $$;

create or replace function public.get_shared_study(p_share_id uuid)
returns table(title text,subject text,content_snapshot jsonb,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.title,s.subject,s.content_snapshot,s.created_at from public.shared_study_links s
 where s.share_id=p_share_id and s.is_public and (s.expires_at is null or s.expires_at>now())
 and (s.quiz_id is null or exists(select 1 from public.quizzes q, jsonb_array_elements(q.questions) v where q.id=s.quiz_id and v->>'id'=s.source_item_id));
$$;
create or replace function public.revoke_study_share(p_share_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to manage your links.'; end if;
 update public.shared_study_links set is_public=false where share_id=p_share_id and user_id=auth.uid();
 if not found then raise exception 'Study link not found.'; end if;
end $$;
revoke all on function public.create_study_share(uuid,text,uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.get_shared_study(uuid) from public;
revoke all on function public.revoke_study_share(uuid) from public,anon;
grant execute on function public.create_study_share(uuid,text,uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.get_shared_study(uuid) to anon,authenticated;
grant execute on function public.revoke_study_share(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
