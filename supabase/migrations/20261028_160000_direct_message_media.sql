alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_type text;
alter table public.messages drop constraint if exists messages_media_pair;
alter table public.messages add constraint messages_media_pair check (
 (media_path is null and media_type is null) or
 (media_path is not null and media_type in ('image','video')));
alter table public.messages drop constraint if exists messages_media_path_format;
alter table public.messages add constraint messages_media_path_format check (
 media_path is null or media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|mp4|webm|mov)$');
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
 char_length(trim(body))<=4000 and (char_length(trim(body))>=1 or media_path is not null));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ikonosfera-direct-media','ikonosfera-direct-media',false,26214400,
array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "dm media participants read" on storage.objects;
create policy "dm media participants read" on storage.objects for select to authenticated
using(bucket_id='ikonosfera-direct-media' and exists(
 select 1 from public.chats c where c.id=(split_part(name,'/',1))::uuid
 and ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)));
drop policy if exists "dm media sender upload" on storage.objects;
create policy "dm media sender upload" on storage.objects for insert to authenticated
with check(bucket_id='ikonosfera-direct-media' and split_part(name,'/',2)=(select auth.uid())::text
and exists(select 1 from public.chats c where c.id=(split_part(name,'/',1))::uuid
and ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)));
drop policy if exists "dm media sender delete" on storage.objects;
create policy "dm media sender delete" on storage.objects for delete to authenticated
using(bucket_id='ikonosfera-direct-media' and split_part(name,'/',2)=(select auth.uid())::text);
