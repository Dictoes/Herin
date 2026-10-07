insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('herin-profile-photos','herin-profile-photos',false,array['image/jpeg','image/png','image/webp','image/gif'],5242880)
on conflict(id) do update set public=false, allowed_mime_types=excluded.allowed_mime_types, file_size_limit=excluded.file_size_limit;

drop policy if exists herin_profile_photos_owner on storage.objects;
create policy herin_profile_photos_owner on storage.objects for all to authenticated
using (bucket_id='herin-profile-photos' and name=((select auth.uid())::text || '/avatar'))
with check (bucket_id='herin-profile-photos' and name=((select auth.uid())::text || '/avatar'));
