-- Fix first-message flow without exposing unmessaged chats to the recipient.
-- A chat is visible to its owner if it contains a message or they explicitly
-- opened it from a profile. The other participant sees it after first message.
alter table public.chats add column if not exists draft_for uuid[] not null default '{}'::uuid[];

create or replace function public.start_direct_chat(target_username text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  recipient uuid;
  a uuid;
  b uuid;
  conversation uuid;
begin
  if caller is null then raise exception 'Sign in first' using errcode='28000'; end if;
  select p.id into recipient from public.profiles p
    where p.username = lower(trim(target_username)) limit 1;
  if recipient is null then raise exception 'User not found'; end if;
  if recipient = caller then raise exception 'Cannot message yourself'; end if;

  a := least(caller,recipient);
  b := greatest(caller,recipient);
  insert into public.chats(user_a,user_b) values (a,b)
    on conflict(user_a,user_b) do nothing returning id into conversation;
  if conversation is null then
    select id into conversation from public.chats where user_a=a and user_b=b;
  end if;
  insert into public.chat_members(chat_id,user_id)
    values (conversation,caller),(conversation,recipient)
    on conflict do nothing;

  -- Only the person pressing "Написать сообщение" receives an empty draft.
  update public.chats set draft_for=array_append(draft_for,caller)
  where id=conversation and not (caller=any(draft_for));
  return conversation;
end;
$$;
revoke all on function public.start_direct_chat(text) from public,anon;
grant execute on function public.start_direct_chat(text) to authenticated;

create or replace function public.list_active_chats()
returns setof public.chats language sql stable security invoker set search_path='' as $$
 select c.* from public.chats c
 where (auth.uid()=c.user_a or auth.uid()=c.user_b)
   and not (auth.uid()=any(c.hidden_for))
   and (
     (auth.uid()=any(c.draft_for))
     or exists(select 1 from public.messages m where m.chat_id=c.id)
   )
 order by c.created_at desc limit 100;
$$;
revoke all on function public.list_active_chats() from public,anon;
grant execute on function public.list_active_chats() to authenticated;
