-- Persistent saved contacts and private blocklists.
-- Every row is owned by the current authenticated user; no mutual contact request is needed.
create table if not exists public.user_contacts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_contacts_pair_pk primary key (owner_id,contact_id),
  constraint user_contacts_not_self check (owner_id <> contact_id)
);
create index if not exists user_contacts_contact_idx on public.user_contacts(contact_id);
alter table public.user_contacts enable row level security;
create policy user_contacts_select_self on public.user_contacts for select to authenticated
  using (owner_id = (select auth.uid()));
create policy user_contacts_insert_self on public.user_contacts for insert to authenticated
  with check (owner_id = (select auth.uid()) and owner_id <> contact_id);
create policy user_contacts_delete_self on public.user_contacts for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.user_contacts from anon;
grant select, insert, delete on public.user_contacts to authenticated;

create table if not exists public.user_blocks (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_pair_pk primary key (owner_id,blocked_id),
  constraint user_blocks_not_self check (owner_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);
alter table public.user_blocks enable row level security;
create policy user_blocks_select_self on public.user_blocks for select to authenticated
  using (owner_id = (select auth.uid()));
create policy user_blocks_insert_self on public.user_blocks for insert to authenticated
  with check (owner_id = (select auth.uid()) and owner_id <> blocked_id);
create policy user_blocks_delete_self on public.user_blocks for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

-- Enforce blocks on the server for both text and media direct messages.
-- SECURITY DEFINER is necessary to check the OTHER user's private blocklist.
-- This is trigger-only: no RPC execution privilege is exposed.
create or replace function public.enforce_direct_message_blocks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
begin
  select case when c.user_a = new.sender_id then c.user_b
              when c.user_b = new.sender_id then c.user_a
              else null end
    into recipient from public.chats c where c.id = new.chat_id;
  if recipient is null then
    raise exception 'Invalid direct message participant' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.owner_id = new.sender_id and b.blocked_id = recipient)
       or (b.owner_id = recipient and b.blocked_id = new.sender_id)
  ) then
    raise exception 'Сообщение не отправлено: переписка заблокирована' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_direct_message_blocks() from public, anon, authenticated;
drop trigger if exists enforce_direct_message_blocks on public.messages;
create trigger enforce_direct_message_blocks before insert on public.messages
  for each row execute function public.enforce_direct_message_blocks();

-- Preserve existing hide, pin, unpin and delete-for-everyone semantics.
-- Deleting only for yourself also hides the existing history from that user.
create or replace function public.manage_direct_chat(p_chat_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare c public.chats%rowtype; me uuid := auth.uid();
begin
 select * into c from public.chats where id = p_chat_id;
 if not found or me is null or (me <> c.user_a and me <> c.user_b) then
   raise exception 'Not a participant' using errcode = '42501';
 end if;
 if p_action = 'hide' then
   update public.chats set hidden_for = array_append(hidden_for,me)
     where id = p_chat_id and not (me = any(hidden_for));
 elsif p_action = 'delete_for_me' then
   update public.messages set deleted_for = array_append(deleted_for,me)
     where chat_id = p_chat_id and not (me = any(deleted_for));
   update public.chats
     set hidden_for = case when me = any(hidden_for) then hidden_for else array_append(hidden_for,me) end,
         pinned_for = array_remove(pinned_for,me),
         draft_for = array_remove(draft_for,me)
     where id = p_chat_id;
 elsif p_action = 'pin' then
   if not (me = any(c.pinned_for)) and
      (select count(*) from public.chats where me = any(pinned_for)) >= 5 then
     raise exception 'Можно закрепить максимум 5 чатов';
   end if;
   update public.chats set pinned_for = array_append(pinned_for,me)
     where id = p_chat_id and not (me = any(pinned_for));
 elsif p_action = 'unpin' then
   update public.chats set pinned_for = array_remove(pinned_for,me)
     where id = p_chat_id;
 elsif p_action = 'delete_everyone' then
   delete from public.chats where id = p_chat_id;
 else raise exception 'Unknown action'; end if;
end;
$$;
revoke all on function public.manage_direct_chat(uuid,text) from public,anon;
grant execute on function public.manage_direct_chat(uuid,text) to authenticated;
