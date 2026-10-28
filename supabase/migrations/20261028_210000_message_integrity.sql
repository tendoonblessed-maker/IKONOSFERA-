-- Remove ghost conversations that have never contained a message.
delete from public.chats c where not exists(select 1 from public.messages m where m.chat_id=c.id);

-- Keep new empty conversations invisible until a real message exists.
create or replace function public.list_active_chats()
returns setof public.chats language sql stable security invoker set search_path='' as $$
 select c.* from public.chats c
 where (auth.uid()=c.user_a or auth.uid()=c.user_b)
 and not (auth.uid()=any(c.hidden_for))
 and exists(select 1 from public.messages m where m.chat_id=c.id)
 order by c.created_at desc limit 100;
$$;
revoke all on function public.list_active_chats() from public,anon;
grant execute on function public.list_active_chats() to authenticated;

-- Idempotent sending: a client retry cannot insert the same logical message twice.
alter table public.messages add column if not exists client_message_id uuid;
create unique index if not exists messages_sender_client_message_uidx on public.messages(sender_id,client_message_id) where client_message_id is not null;
create or replace function public.send_direct_message(p_chat_id uuid,p_body text,p_client_message_id uuid)
returns public.messages language plpgsql security invoker set search_path='' as $$
declare sent public.messages%rowtype;
begin
 if auth.uid() is null or not public.is_chat_member(p_chat_id) then raise exception 'Not a participant' using errcode='42501';end if;
 if p_client_message_id is null then raise exception 'client_message_id required';end if;
 if p_body is null or length(trim(p_body))<1 or length(p_body)>4000 then raise exception 'Invalid message';end if;
 insert into public.messages(chat_id,sender_id,body,client_message_id)
 values(p_chat_id,auth.uid(),trim(p_body),p_client_message_id)
 on conflict(sender_id,client_message_id) where client_message_id is not null do nothing returning * into sent;
 if sent.id is null then
  select * into sent from public.messages where sender_id=auth.uid() and client_message_id=p_client_message_id;
  if sent.chat_id<>p_chat_id then raise exception 'Message id reused for another chat';end if;
 end if;
 return sent;
end;$$;
revoke all on function public.send_direct_message(uuid,text,uuid) from public,anon;
grant execute on function public.send_direct_message(uuid,text,uuid) to authenticated;
