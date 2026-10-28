create table if not exists public.group_chats(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (char_length(trim(title)) between 1 and 80),
 created_at timestamptz not null default now()
);
create table if not exists public.group_members(
 group_id uuid not null references public.group_chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
create index if not exists group_members_user_lookup on public.group_members(user_id,group_id);
create table if not exists public.group_messages(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.group_chats(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 body text not null check(char_length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists group_messages_time on public.group_messages(group_id,created_at);
alter table public.group_chats enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
create or replace function public.is_group_member(p_group uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_members where group_id=p_group and user_id=(select auth.uid()))
$$;
revoke all on function public.is_group_member(uuid) from public,anon;
grant execute on function public.is_group_member(uuid) to authenticated;
create policy group_read_member on public.group_chats for select to authenticated using(public.is_group_member(id));
create policy group_member_read on public.group_members for select to authenticated using(public.is_group_member(group_id));
create policy group_message_read on public.group_messages for select to authenticated using(public.is_group_member(group_id));
create policy group_message_write on public.group_messages for insert to authenticated
 with check(sender_id=(select auth.uid()) and public.is_group_member(group_id));
revoke all on public.group_chats,public.group_members,public.group_messages from anon,authenticated;
grant select on public.group_chats,public.group_members,public.group_messages to authenticated;
grant insert on public.group_messages to authenticated;
create or replace function public.create_group_chat(p_title text,p_members uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();new_id uuid;distinct_members uuid[];member_count int;
begin
 if me is null then raise exception 'Sign in required';end if;
 if char_length(trim(coalesce(p_title,''))) not between 1 and 80 then raise exception 'Invalid group name';end if;
 select array_agg(distinct member_id) into distinct_members from unnest(coalesce(p_members,'{}'::uuid[])) member_id where member_id<>me;
 member_count:=coalesce(array_length(distinct_members,1),0);
 if member_count<1 or member_count>49 then raise exception 'Choose between 1 and 49 contacts';end if;
 if (select count(*) from public.profiles where id=any(distinct_members))<>member_count then raise exception 'Unknown contact';end if;
 insert into public.group_chats(owner_id,title) values(me,trim(p_title)) returning id into new_id;
 insert into public.group_members(group_id,user_id) values(new_id,me);
 insert into public.group_members(group_id,user_id) select new_id,unnest(distinct_members);
 return new_id;
end;$$;
revoke all on function public.create_group_chat(text,uuid[]) from public,anon;
grant execute on function public.create_group_chat(text,uuid[]) to authenticated;
