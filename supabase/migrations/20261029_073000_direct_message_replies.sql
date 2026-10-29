-- Server-backed direct-message replies. Additive and compatible with existing send_direct_message clients.
-- Keep reply targets in the same conversation, including for clients writing directly through PostgREST.
alter table public.messages add column if not exists reply_to_message_id uuid;

create unique index if not exists messages_id_chat_unique_for_replies
  on public.messages (id, chat_id);

alter table public.messages
  add constraint messages_reply_same_chat
  foreign key (reply_to_message_id, chat_id)
  references public.messages (id, chat_id)
  on delete set null (reply_to_message_id);

create index if not exists messages_reply_to_idx
  on public.messages(reply_to_message_id)
  where reply_to_message_id is not null;

-- New endpoint instead of overloading the old RPC: old published clients keep working.
-- SECURITY INVOKER preserves SELECT/INSERT RLS, the member check, the blocklist
-- trigger and the existing 30-messages/minute trigger.
create or replace function public.send_direct_reply(
  p_chat_id uuid,
  p_body text,
  p_client_message_id uuid,
  p_reply_to_message_id uuid
) returns public.messages
language plpgsql security invoker
set search_path = ''
as $$
declare
  sent public.messages%rowtype;
  target public.messages%rowtype;
begin
  if (select auth.uid()) is null or not public.is_chat_member(p_chat_id) then
    raise exception 'Not a participant' using errcode='42501';
  end if;
  if p_client_message_id is null then
    raise exception 'client_message_id required' using errcode='22023';
  end if;
  if p_body is null or length(trim(p_body)) < 1 or length(p_body) > 4000 then
    raise exception 'Invalid message' using errcode='22023';
  end if;
  if p_reply_to_message_id is null then
    raise exception 'Reply target required' using errcode='22023';
  end if;

  -- Return an already-sent message on retry; do not create duplicates.
  select * into sent from public.messages
  where sender_id = (select auth.uid()) and client_message_id = p_client_message_id;
  if found then
    if sent.chat_id is distinct from p_chat_id
      or sent.body is distinct from trim(p_body)
      or sent.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception 'Message id reused with different contents' using errcode='22023';
    end if;
    return sent;
  end if;

  -- RLS hides messages removed by this user; do not allow replying to those,
  -- to removed-for-everyone messages, or to a message in another conversation.
  select * into target from public.messages
  where id = p_reply_to_message_id and chat_id = p_chat_id
    and not deleted_for_everyone;
  if not found then
    raise exception 'Reply target unavailable' using errcode='22023';
  end if;

  insert into public.messages(chat_id,sender_id,body,client_message_id,reply_to_message_id)
  values(p_chat_id,(select auth.uid()),trim(p_body),p_client_message_id,p_reply_to_message_id)
  on conflict(sender_id,client_message_id)
    where client_message_id is not null
  do nothing returning * into sent;

  if sent.id is null then
    select * into sent from public.messages
    where sender_id = (select auth.uid()) and client_message_id = p_client_message_id;
    if sent.chat_id is distinct from p_chat_id
      or sent.body is distinct from trim(p_body)
      or sent.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception 'Message id reused with different contents' using errcode='22023';
    end if;
  end if;
  return sent;
end;
$$;

revoke all on function public.send_direct_reply(uuid,text,uuid,uuid) from public, anon;
grant execute on function public.send_direct_reply(uuid,text,uuid,uuid) to authenticated;
