-- Telegram-inspired inbox summary: one access-controlled request for all chat previews.
-- Keep user-specific empty drafts invisible to the other participant until first message.
create or replace function public.list_chat_previews()
returns table(
 chat_id uuid,
 last_body text,
 last_created_at timestamptz,
 last_media_type text,
 last_sender_id uuid,
 unread_count bigint
)
language sql stable security invoker set search_path='' as $$
 select c.id,
   case
     when last_message.deleted_for_everyone then 'Сообщение удалено'
     when nullif(trim(last_message.body),'') is not null then left(last_message.body,180)
     when last_message.media_type='image' then 'Фото'
     when last_message.media_type='video' then 'Видео'
     when last_message.media_type='audio' then 'Аудио'
     when last_message.media_type='file' then 'Файл'
     else null
   end as last_body,
   last_message.created_at,
   last_message.media_type,
   last_message.sender_id,
   (
     select count(*) from public.messages m
     where m.chat_id=c.id
       and m.sender_id<>(select auth.uid())
       and m.read_at is null
       and not m.deleted_for_everyone
       and not ((select auth.uid())=any(m.deleted_for))
   ) as unread_count
 from public.chats c
 left join lateral (
   select m.body,m.created_at,m.media_type,m.sender_id,m.deleted_for_everyone
   from public.messages m
   where m.chat_id=c.id
     and not ((select auth.uid())=any(m.deleted_for))
   order by m.created_at desc,m.id desc limit 1
 ) last_message on true
 where ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)
   and not ((select auth.uid())=any(c.hidden_for))
   and ((select auth.uid())=any(c.draft_for)
     or exists(select 1 from public.messages msg where msg.chat_id=c.id))
 order by
   case when (select auth.uid())=any(c.pinned_for) then 0 else 1 end,
   coalesce(last_message.created_at,c.created_at) desc limit 100;
$$;
revoke all on function public.list_chat_previews() from public,anon;
grant execute on function public.list_chat_previews() to authenticated;
