-- chat_management_and_channel_editing
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_for uuid[] not null default '{}';
alter table public.messages add column if not exists deleted_for_everyone boolean not null default false;
alter table public.chats add column if not exists hidden_for uuid[] not null default '{}';
alter table public.chats add column if not exists pinned_for uuid[] not null default '{}';
alter table public.channel_posts add column if not exists edited_at timestamptz;
alter table public.channel_comments add column if not exists edited_at timestamptz;

create or replace function public.manage_direct_message(p_message_id uuid,p_action text,p_body text default null)
returns void language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype; c public.chats%rowtype; me uuid:=auth.uid();
begin
 select * into m from public.messages where id=p_message_id;
 if not found then raise exception 'Message not found'; end if;
 select * into c from public.chats where id=m.chat_id;
 if me is null or (me<>c.user_a and me<>c.user_b) then raise exception 'Not a participant'; end if;
 if p_action='hide' then
  update public.messages set deleted_for=array_append(deleted_for,me) where id=p_message_id and not(me=any(deleted_for));
 elsif p_action='delete_everyone' then
  if m.sender_id<>me then raise exception 'Only sender can delete for everyone'; end if;
  update public.messages set deleted_for_everyone=true,body='',media_path=null,media_type=null where id=p_message_id;
 elsif p_action='edit' then
  if m.sender_id<>me or m.deleted_for_everyone then raise exception 'Only sender can edit'; end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>4000 then raise exception 'Message must be 1–4000 characters'; end if;
  update public.messages set body=trim(p_body),edited_at=now() where id=p_message_id;
 else raise exception 'Unknown action'; end if;
end;$$;
create or replace function public.manage_direct_chat(p_chat_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.chats%rowtype;me uuid:=auth.uid();
begin
 select * into c from public.chats where id=p_chat_id;
 if not found or me is null or (me<>c.user_a and me<>c.user_b) then raise exception 'Not a participant'; end if;
 if p_action='hide' then
  update public.chats set hidden_for=array_append(hidden_for,me) where id=p_chat_id and not(me=any(hidden_for));
 elsif p_action='pin' then
  if not(me=any(c.pinned_for)) and (select count(*) from public.chats where me=any(pinned_for))>=5 then raise exception 'Можно закрепить максимум 5 чатов'; end if;
  update public.chats set pinned_for=array_append(pinned_for,me) where id=p_chat_id and not(me=any(pinned_for));
 elsif p_action='unpin' then
  update public.chats set pinned_for=array_remove(pinned_for,me) where id=p_chat_id;
 elsif p_action='delete_everyone' then
  delete from public.chats where id=p_chat_id;
 else raise exception 'Unknown action';end if;
end;$$;
revoke all on function public.manage_direct_message(uuid,text,text),public.manage_direct_chat(uuid,text) from public,anon;
grant execute on function public.manage_direct_message(uuid,text,text),public.manage_direct_chat(uuid,text) to authenticated;
create or replace function public.edit_channel_post(p_post_id uuid,p_body text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.channel_posts p where p.id=p_post_id and p.author_id=auth.uid()) then raise exception 'Only author can edit post';end if;
 if p_body is null or char_length(p_body)>4000 then raise exception 'Post is too long';end if;
 update public.channel_posts set body=p_body,edited_at=now() where id=p_post_id;
end;$$;
create or replace function public.manage_channel_comment(p_comment_id uuid,p_action text,p_body text default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.channel_comments%rowtype;owner uuid;
begin
 select * into c from public.channel_comments where id=p_comment_id;
 if not found then raise exception 'Comment not found';end if;
 select ch.owner_id into owner from public.channel_posts p join public.channels ch on ch.id=p.channel_id where p.id=c.post_id;
 if p_action='delete' then
  if auth.uid()<>c.author_id and auth.uid()<>owner then raise exception 'Not allowed to moderate';end if;
  delete from public.channel_comments where id=p_comment_id;
 elsif p_action='edit' then
  if auth.uid()<>c.author_id then raise exception 'Only author can edit comment';end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>1500 then raise exception 'Comment must be 1–1500 characters';end if;
  update public.channel_comments set body=trim(p_body),edited_at=now() where id=p_comment_id;
 else raise exception 'Unknown action';end if;
end;$$;
revoke all on function public.edit_channel_post(uuid,text),public.manage_channel_comment(uuid,text,text) from public,anon;
grant execute on function public.edit_channel_post(uuid,text),public.manage_channel_comment(uuid,text,text) to authenticated;


-- allow_deleted_message_tombstones
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check(char_length(trim(body))<=4000 and (char_length(trim(body))>=1 or media_path is not null or deleted_for_everyone=true));

-- direct_message_audio_documents
alter table public.messages drop constraint if exists messages_media_pair;
alter table public.messages add constraint messages_media_pair check((media_path is null and media_type is null) or(media_path is not null and media_type in ('image','video','audio','file')));
alter table public.messages drop constraint if exists messages_media_path_format;
alter table public.messages add constraint messages_media_path_format check(media_path is null or media_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp|mp4|webm|mov|mp3|m4a|wav|ogg|pdf|txt|zip|doc|docx|xls|xlsx)$');
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/ogg','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'] where id='ikonosfera-direct-media';


-- channel_multimedia_attachments
alter table public.channel_posts add column if not exists attachment_path text;
alter table public.channel_posts add column if not exists attachment_type text check(attachment_type in('image','video','audio','file'));
update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/ogg','application/pdf','text/plain','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'] where id='ikonosfera-media';

-- enforce_hidden_chat_and_message_visibility
drop policy if exists messages_read_chat_members on public.messages;
create policy messages_read_chat_members on public.messages for select to authenticated using(
 public.is_chat_member(chat_id) and not ((select auth.uid())=any(deleted_for))
);
drop policy if exists chats_read_members on public.chats;
create policy chats_read_members on public.chats for select to authenticated using(
 public.is_chat_member(id) and not ((select auth.uid())=any(hidden_for))
);
create or replace function public.reopen_direct_chat(p_chat_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.chats set hidden_for=array_remove(hidden_for,auth.uid()) where id=p_chat_id
 and (auth.uid()=user_a or auth.uid()=user_b);
end;$$;
revoke all on function public.reopen_direct_chat(uuid) from public,anon;
grant execute on function public.reopen_direct_chat(uuid) to authenticated;