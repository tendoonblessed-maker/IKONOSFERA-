-- Chat privacy and blocklist. Existing installs retain their user_blocks rows.
-- The block table may already exist in development; keep this idempotent for new installs.
create table if not exists public.user_blocks(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 constraint user_blocks_pair_pk primary key(owner_id,blocked_id),
 constraint user_blocks_not_self check(owner_id<>blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public,anon,authenticated;
grant select,insert,delete on public.user_blocks to authenticated;
drop policy if exists user_blocks_select_self on public.user_blocks;
create policy user_blocks_select_self on public.user_blocks for select to authenticated
 using(owner_id=(select auth.uid()));
drop policy if exists user_blocks_insert_self on public.user_blocks;
create policy user_blocks_insert_self on public.user_blocks for insert to authenticated
 with check(owner_id=(select auth.uid()) and owner_id<>blocked_id);
drop policy if exists user_blocks_delete_self on public.user_blocks;
create policy user_blocks_delete_self on public.user_blocks for delete to authenticated
 using(owner_id=(select auth.uid()));
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

-- Existing delivery trigger checks blocks in both directions and
-- restores the recipient's inbox if a newly received message arrives.
create or replace function public.enforce_direct_message_blocks()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select case when c.user_a=new.sender_id then c.user_b
             when c.user_b=new.sender_id then c.user_a else null end
 into recipient from public.chats c where c.id=new.chat_id;
 if recipient is null or (select auth.uid()) is null or new.sender_id<>(select auth.uid()) then
   raise exception 'Invalid direct message participant' using errcode='42501';
 end if;
 if exists(select 1 from public.user_blocks b
 where (b.owner_id=new.sender_id and b.blocked_id=recipient)
    or (b.owner_id=recipient and b.blocked_id=new.sender_id)) then
   raise exception 'Сообщение не отправлено: переписка заблокирована' using errcode='42501';
 end if;
 update public.chats set hidden_for=array_remove(hidden_for,recipient)
 where id=new.chat_id and recipient=any(hidden_for);
 return new;
end;$$;
revoke all on function public.enforce_direct_message_blocks() from public,anon,authenticated;

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
    where (owner_id=caller and blocked_id=recipient)
       or (owner_id=recipient and blocked_id=caller)) then
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
