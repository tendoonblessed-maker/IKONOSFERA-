alter table public.messages add column if not exists read_at timestamptz;
create index if not exists messages_unread_by_chat on public.messages(chat_id,created_at desc) where read_at is null;
create or replace function public.mark_chat_messages_read(p_chat_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.chats c where c.id=p_chat_id and
 ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)) then
 raise exception 'Not a participant'; end if;
 update public.messages set read_at=now()
 where chat_id=p_chat_id and sender_id<>(select auth.uid()) and read_at is null;
 get diagnostics affected=row_count;
 return affected;
end;
$$;
revoke all on function public.mark_chat_messages_read(uuid) from public,anon;
grant execute on function public.mark_chat_messages_read(uuid) to authenticated;
