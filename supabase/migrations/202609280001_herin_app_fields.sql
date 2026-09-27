-- Run once in the Supabase SQL Editor against the existing Herin schema.
-- Additive: preserves existing rows, triggers, and user ownership policies.
begin;
alter table public.pdfs add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.pdfs add column if not exists extracted_text jsonb;
alter table public.notes add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.highlights add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.flashcards add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.classes add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.assignments add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.reminders add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.user_preferences add column if not exists data jsonb not null default '{}'::jsonb;
-- Manual cards and standalone notes are existing Herin features.
alter table public.flashcards alter column highlight_id drop not null;
alter table public.notes alter column pdf_id drop not null;
commit;

-- Existing bucket policies must restrict paths to auth.uid()/filename.pdf.
-- The supplied schema already creates those policies; do not make the bucket public.
