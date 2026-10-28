-- IKONOSFERA MVP: authenticated users, private direct messages.
-- Run only on a legally suitable development database. No demo users or seed data.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Пользователь' check (char_length(trim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_ci on public.profiles (lower(username));

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chats_ordered_pair check (user_a::text < user_b::text),
  constraint chats_unique_pair unique (user_a, user_b)
);
create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (chat_id, user_id)
);
create index if not exists chat_members_user_id_idx on public.chat_members (user_id,chat_id);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_time_idx on public.messages (chat_id, created_at desc);

create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, 'u_' || left(replace(new.id::text, '-', ''), 20), 'Пользователь');
  return new;
end;
$$;
drop trigger if exists on_auth_user_ikonosfera on auth.users;
create trigger on_auth_user_ikonosfera after insert on auth.users
for each row execute function public.create_profile_for_user();

-- One-time backfill for users registered before this migration.
insert into public.profiles(id,username,display_name)
select id, 'u_' || left(replace(id::text,'-',''),20), 'Пользователь' from auth.users
on conflict(id) do nothing;

create or replace function public.is_chat_member(the_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chat_members cm where cm.chat_id = the_chat and cm.user_id = (select auth.uid()));
$$;
revoke all on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

create policy profiles_read_signed_in on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy chats_read_members on public.chats for select to authenticated using (public.is_chat_member(id));
create policy members_read_by_chat_members on public.chat_members for select to authenticated using (public.is_chat_member(chat_id));
create policy messages_read_chat_members on public.messages for select to authenticated using (public.is_chat_member(chat_id));
create policy messages_insert_chat_members on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_chat_member(chat_id));

-- Only this transaction-safe server-side function may create direct conversations.
create or replace function public.start_direct_chat(target_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  recipient uuid;
  a uuid;
  b uuid;
  conversation uuid;
begin
  if caller is null then raise exception 'Sign in first' using errcode='28000'; end if;
  select id into recipient from public.profiles where username = lower(trim(target_username)) limit 1;
  if recipient is null then raise exception 'User not found'; end if;
  if recipient = caller then raise exception 'Cannot message yourself'; end if;
  a := least(caller,recipient); b := greatest(caller,recipient);
  insert into public.chats(user_a,user_b) values(a,b)
    on conflict(user_a,user_b) do nothing returning id into conversation;
  if conversation is null then
    select id into conversation from public.chats where user_a=a and user_b=b;
  end if;
  insert into public.chat_members(chat_id,user_id) values (conversation,caller),(conversation,recipient)
    on conflict do nothing;
  return conversation;
end;
$$;
revoke all on function public.start_direct_chat(text) from public, anon;
grant execute on function public.start_direct_chat(text) to authenticated;

-- No update/delete policies on messages: history is immutable in the MVP.
-- Realtime is optional: the client currently refreshes every 3 seconds (no extra dependency).

-- API privileges are separate from RLS. Do not expose writes to chats or members.
revoke all on table public.profiles, public.chats, public.chat_members, public.messages from anon;
revoke all on table public.profiles, public.chats, public.chat_members, public.messages from authenticated;
grant select on public.profiles, public.chats, public.chat_members, public.messages to authenticated;
grant update (username, display_name) on public.profiles to authenticated;
grant insert on public.messages to authenticated;
revoke execute on function public.create_profile_for_user() from public, anon, authenticated;
