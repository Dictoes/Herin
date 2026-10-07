-- HERIN: paste this WHOLE file into a NEW Supabase SQL Editor query.
-- Safe to rerun against the schema supplied with this project. No tables or rows are dropped.
begin;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade, display_name text, avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade, theme text default 'system' check(theme in ('light','dark','system')), email_notifications boolean default true, push_notifications boolean default true, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, instructor text, schedule_pattern text, color_code text, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.pdfs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, class_id uuid references public.classes(id) on delete set null, title text not null, file_path text not null, page_count integer check(page_count>0), data jsonb not null default '{}'::jsonb, extracted_text jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, pdf_id uuid references public.pdfs(id) on delete cascade, content text not null, page_number integer check(page_number>0), data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, pdf_id uuid not null references public.pdfs(id) on delete cascade, highlighted_text text not null, color_code text default '#FFFF00', bounding_box jsonb, page_number integer check(page_number>0), data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, highlight_id uuid references public.highlights(id) on delete cascade, question text not null, answer text not null, last_reviewed_at timestamptz, next_review_at timestamptz, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, pdf_id uuid not null references public.pdfs(id) on delete cascade, title text not null, questions jsonb not null default '[]'::jsonb, score integer check(score>=0), total_questions integer check(total_questions>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, class_id uuid references public.classes(id) on delete cascade, title text not null, description text, due_date timestamptz not null, status text default 'pending' check(status in ('pending','in_progress','completed')), data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, remind_at timestamptz not null, is_completed boolean default false, related_entity_type text check(related_entity_type in ('assignment','quiz','class','custom')), related_entity_id uuid, data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.pdfs add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.notes add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.highlights add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.flashcards add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.classes add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.assignments add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.reminders add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.pdfs add column if not exists extracted_text jsonb;
alter table public.notes alter column pdf_id drop not null;
alter table public.flashcards alter column highlight_id drop not null;

create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(user_id) values(new.id) on conflict(user_id) do nothing;
 insert into public.user_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create index if not exists idx_profiles_user_id on public.profiles(user_id);
drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.profiles;
create policy herin_owner on public.profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.profiles to authenticated;

alter table public.user_preferences enable row level security;
create index if not exists idx_user_preferences_user_id on public.user_preferences(user_id);
drop trigger if exists update_user_preferences_updated_at on public.user_preferences;
create trigger update_user_preferences_updated_at before update on public.user_preferences for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.user_preferences;
create policy herin_owner on public.user_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.user_preferences to authenticated;

alter table public.classes enable row level security;
create index if not exists idx_classes_user_id on public.classes(user_id);
drop trigger if exists update_classes_updated_at on public.classes;
create trigger update_classes_updated_at before update on public.classes for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.classes;
create policy herin_owner on public.classes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.classes to authenticated;

alter table public.pdfs enable row level security;
create index if not exists idx_pdfs_user_id on public.pdfs(user_id);
drop trigger if exists update_pdfs_updated_at on public.pdfs;
create trigger update_pdfs_updated_at before update on public.pdfs for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.pdfs;
create policy herin_owner on public.pdfs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.pdfs to authenticated;

alter table public.notes enable row level security;
create index if not exists idx_notes_user_id on public.notes(user_id);
drop trigger if exists update_notes_updated_at on public.notes;
create trigger update_notes_updated_at before update on public.notes for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.notes;
create policy herin_owner on public.notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.notes to authenticated;

alter table public.highlights enable row level security;
create index if not exists idx_highlights_user_id on public.highlights(user_id);
drop trigger if exists update_highlights_updated_at on public.highlights;
create trigger update_highlights_updated_at before update on public.highlights for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.highlights;
create policy herin_owner on public.highlights for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.highlights to authenticated;

alter table public.flashcards enable row level security;
create index if not exists idx_flashcards_user_id on public.flashcards(user_id);
drop trigger if exists update_flashcards_updated_at on public.flashcards;
create trigger update_flashcards_updated_at before update on public.flashcards for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.flashcards;
create policy herin_owner on public.flashcards for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.flashcards to authenticated;

alter table public.quizzes enable row level security;
create index if not exists idx_quizzes_user_id on public.quizzes(user_id);
drop trigger if exists update_quizzes_updated_at on public.quizzes;
create trigger update_quizzes_updated_at before update on public.quizzes for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.quizzes;
create policy herin_owner on public.quizzes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.quizzes to authenticated;

alter table public.assignments enable row level security;
create index if not exists idx_assignments_user_id on public.assignments(user_id);
drop trigger if exists update_assignments_updated_at on public.assignments;
create trigger update_assignments_updated_at before update on public.assignments for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.assignments;
create policy herin_owner on public.assignments for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.assignments to authenticated;

alter table public.reminders enable row level security;
create index if not exists idx_reminders_user_id on public.reminders(user_id);
drop trigger if exists update_reminders_updated_at on public.reminders;
create trigger update_reminders_updated_at before update on public.reminders for each row execute function public.update_updated_at_column();
drop policy if exists herin_owner on public.reminders;
create policy herin_owner on public.reminders for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.reminders to authenticated;

insert into storage.buckets(id,name,public,allowed_mime_types) values('herin-pdfs','herin-pdfs',false,array['application/pdf'])
on conflict(id) do update set public=false, allowed_mime_types=excluded.allowed_mime_types;

insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('herin-profile-photos','herin-profile-photos',false,array['image/jpeg','image/png','image/webp','image/gif'],5242880)
on conflict(id) do update set public=false, allowed_mime_types=excluded.allowed_mime_types, file_size_limit=excluded.file_size_limit;

drop policy if exists herin_profile_photos_owner on storage.objects;
create policy herin_profile_photos_owner on storage.objects for all to authenticated
using (bucket_id='herin-profile-photos' and name=((select auth.uid())::text || '/avatar'))
with check (bucket_id='herin-profile-photos' and name=((select auth.uid())::text || '/avatar'));

drop policy if exists herin_pdfs_read on storage.objects;
create policy herin_pdfs_read on storage.objects for select to authenticated
using (bucket_id = 'herin-pdfs' and (select auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists herin_pdfs_insert on storage.objects;
create policy herin_pdfs_insert on storage.objects for insert to authenticated
 with check (bucket_id = 'herin-pdfs' and (select auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists herin_pdfs_update on storage.objects;
create policy herin_pdfs_update on storage.objects for update to authenticated
using (bucket_id = 'herin-pdfs' and (select auth.uid())::text = (storage.foldername(name))[1]) with check (bucket_id = 'herin-pdfs' and (select auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists herin_pdfs_delete on storage.objects;
create policy herin_pdfs_delete on storage.objects for delete to authenticated
using (bucket_id = 'herin-pdfs' and (select auth.uid())::text = (storage.foldername(name))[1]);

commit;
