begin;

drop policy if exists herin_profile_photos_owner on storage.objects;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'herin-profile-photos'
  ) then
    raise exception 'Remove objects from herin-profile-photos through the Supabase Storage API before applying this migration.';
  end if;
end
$$;

delete from storage.buckets where id = 'herin-profile-photos';

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'avatar_path'
where raw_user_meta_data ? 'avatar_path';

alter table if exists public.profiles drop column if exists avatar_url;

commit;
