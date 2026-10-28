-- Direct-message media schema and storage policies
alter table public.messages drop constraint if exists messages_media_path_format;
alter table public.messages add constraint messages_media_path_format check(
media_path is null or media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|mp4|webm|mov)$');
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check(
char_length(trim(body))<=4000 and (char_length(trim(body))>=1 or media_path is not null));
