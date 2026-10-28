-- Personal chat removal + blocklist: ownership is enforced by RLS and RPC.
create table if not exists public.user_blocks(
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 constraint user_blocks_not_self check(blocker_id<>blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id,blocker_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public,anon,authenticated;
grant select,insert,delete on public.user_blocks to authenticated;
drop policy if exists user_blocks_read_own on public.user_blocks;
create policy user_blocks_read_own on public.user_blocks for select to authenticated
 using(blocker_id=(select auth.uid()));
drop policy if exists user_blocks_create_own on public.user_blocks;
create policy user_blocks_create_own on public.user_blocks for insert to authenticated
 with check(blocker_id=(select auth.uid()) and blocked_id<>blocker_id);
drop policy if exists user_blocks_remove_own on public.user_blocks;
create policy user_blocks_remove_own on public.user_blocks for delete to authenticated
 using(blocker_id=(select auth.uid()));

-- Existing pin/unpin/delete-everyone keep their behavior; delete_self additionally
-- masks all previous messages for one participant and removes their inbox entry.
create or replace function public.manage_direct_chat(p_chat_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.chats%rowtype;me uuid:=auth.uid();
begin
 select * into c from public.chats where id=p_chat_id for update;
 if not found or me is null or (me<>c.user_a and me<>c.user_b) then
   raise exception 'Not a participant' using errcode='42501';
 end if;
 if p_action='hide' then
   update public.chats set hidden_for=array_append(hidden_for,me)
   where id=p_chat_id and not(me=any(hidden_for));
 elsif p_action='delete_self' then
   update public.messages set deleted_for=array_append(deleted_for,me)
   where chat_id=p_chat_id and not(me=any(deleted_for));
   update public.chats
     set hidden_for=case when me=any(hidden_for) then hidden_for else array_append(hidden_for,me) end,
         pinned_for=array_remove(pinned_for,me),
         draft_for=array_remove(draft_for,me)
   where id=p_chat_id;
 elsif p_action='pin' then
   if not(me=any(c.pinned_for)) and
     (select count(*) from public.chats where me=any(pinned_for))>=5
   then raise exception 'Можно закрепить максимум 5 чатов';end if;
   update public.chats set pinned_for=array_append(pinned_for,me)
   where id=p_chat_id and not(me=any(pinned_for));
 elsif p_action='unpin' then
   update public.chats set pinned_for=array_remove(pinned_for,me) where id=p_chat_id;
 elsif p_action='delete_everyone' then
   -- Existing cascade deletes messages and membership for both participants.
   delete from public.chats where id=p_chat_id;
 else
   raise exception 'Unknown action';
 end if;
end;$$;
revoke all on function public.manage_direct_chat(uuid,text) from public,anon;
grant execute on function public.manage_direct_chat(uuid,text) to authenticated;

-- Blocking must be checked server-side, including file messages uploaded via REST.
-- This trigger also brings a previously deleted chat back when a new message arrives.
create or replace function public.guard_direct_message_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 me uuid:=auth.uid();
 other_id uuid;
begin
 if me is null or new.sender_id<>me then
   raise exception 'Not authenticated as sender' using errcode='42501';
 end if;
 select case when user_a=me then user_b when user_b=me then user_a else null end
 into other_id from public.chats where id=new.chat_id;
 if other_id is null then
   raise exception 'Not a participant' using errcode='42501';
 end if;
 if exists(
   select 1 from public.user_blocks
   where (blocker_id=me and blocked_id=other_id)
      or (blocker_id=other_id and blocked_id=me)
 ) then
   raise exception 'Сообщение не отправлено: пользователь заблокирован' using errcode='42501';
 end if;
 update public.chats set hidden_for=array_remove(hidden_for,other_id)
 where id=new.chat_id and other_id=any(hidden_for);
 return new;
end;$$;
drop trigger if exists guard_direct_message_delivery on public.messages;
create trigger guard_direct_message_delivery before insert on public.messages
 for each row execute function public.guard_direct_message_delivery();
revoke all on function public.guard_direct_message_delivery() from public,anon,authenticated;

-- Opening a chat never bypasses blocks (even if the chat already exists).
create or replace function public.start_direct_chat(target_username text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 caller uuid:=auth.uid();
 recipient uuid;
 a uuid;
 b uuid;
 conversation uuid;
begin
 if caller is null then raise exception 'Sign in first' using errcode='28000';end if;
 select p.id into recipient from public.profiles p
 where p.username=lower(trim(target_username)) limit 1;
 if recipient is null then raise exception 'User not found';end if;
 if recipient=caller then raise exception 'Cannot message yourself';end if;
 if exists(select 1 from public.user_blocks
    where (blocker_id=caller and blocked_id=recipient)
       or (blocker_id=recipient and blocked_id=caller)) then
   raise exception 'Невозможно начать диалог: пользователь заблокирован' using errcode='42501';
 end if;
 a:=least(caller,recipient);b:=greatest(caller,recipient);
 insert into public.chats(user_a,user_b) values (a,b)
 on conflict(user_a,user_b) do nothing returning id into conversation;
 if conversation is null then
   select id into conversation from public.chats where user_a=a and user_b=b;
 end if;
 insert into public.chat_members(chat_id,user_id)
 values(conversation,caller),(conversation,recipient)
 on conflict do nothing;
 update public.chats set draft_for=array_append(draft_for,caller)
 where id=conversation and not(caller=any(draft_for));
 return conversation;
end;$$;
revoke all on function public.start_direct_chat(text) from public,anon;
grant execute on function public.start_direct_chat(text) to authenticated;
