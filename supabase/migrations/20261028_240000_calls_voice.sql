-- IKONOSFERA calls: separate from direct messages and Discord-like group voice rooms.
-- Prepared for pre-release; keep existing direct and group membership schema unchanged.
create table if not exists public.calls (
 id uuid primary key default gen_random_uuid(),
 chat_kind text not null check (chat_kind in ('direct','group')),
 chat_id uuid not null,
 created_by uuid not null references auth.users(id),
 with_video boolean not null default false,
 status text not null default 'ringing' check(status in('ringing','active','ended')),
 created_at timestamptz not null default now(),
 ended_at timestamptz
);
create index if not exists calls_by_chat on public.calls(chat_kind,chat_id,created_at desc);
create table if not exists public.call_invites(
 call_id uuid not null references public.calls(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'ringing' check(status in('ringing','accepted','declined','missed')),
 created_at timestamptz not null default now(),
 primary key(call_id,user_id)
);
create index if not exists call_invites_pending on public.call_invites(user_id,status,created_at desc);
create table if not exists public.voice_channels(
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.group_chats(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 60),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists voice_channels_group on public.voice_channels(group_id);
create or replace function public.is_call_chat_member(p_kind text,p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_kind='direct' then public.is_chat_member(p_id)
 when p_kind='group' then public.is_group_member(p_id) else false end
$$;
revoke all on function public.is_call_chat_member(text,uuid) from public,anon;
grant execute on function public.is_call_chat_member(text,uuid) to authenticated;
alter table public.calls enable row level security;
alter table public.call_invites enable row level security;
alter table public.voice_channels enable row level security;
create policy calls_read_members on public.calls for select to authenticated
 using(public.is_call_chat_member(chat_kind,chat_id));
create policy invites_read_own on public.call_invites for select to authenticated
 using(user_id=(select auth.uid()));
create policy voices_read_members on public.voice_channels for select to authenticated
 using(public.is_group_member(group_id));
create policy voices_create_owner on public.voice_channels for insert to authenticated
 with check(created_by=(select auth.uid()) and exists(select 1 from public.group_chats g where g.id=group_id and g.owner_id=(select auth.uid())));
revoke all on public.calls,public.call_invites,public.voice_channels from anon,authenticated;
grant select on public.calls,public.call_invites,public.voice_channels to authenticated;
grant insert on public.voice_channels to authenticated;

create or replace function public.start_messenger_call(p_chat_kind text,p_chat_id uuid,p_with_video boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();new_id uuid;recipients integer;
begin
 if me is null or p_chat_kind not in ('direct','group') or not public.is_call_chat_member(p_chat_kind,p_chat_id)
 then raise exception 'No access to call';end if;
 -- Serialize new calls for each conversation to avoid duplicate ringing sessions.
 perform pg_advisory_xact_lock(hashtextextended('ik-call:'||p_chat_kind||':'||p_chat_id::text,0));
 if exists(select 1 from public.calls where chat_kind=p_chat_kind and chat_id=p_chat_id
  and status<>'ended' and created_at>now()-interval '6 hours') then
  raise exception 'Call already in progress';end if;
 if p_chat_kind='direct' then
  select count(*) into recipients from public.chat_members where chat_id=p_chat_id;
 else
  select count(*) into recipients from public.group_members where group_id=p_chat_id;
 end if;
 if recipients<2 or recipients>50 then raise exception 'Call requires 2-50 participants';end if;
 insert into public.calls(chat_kind,chat_id,created_by,with_video)
 values(p_chat_kind,p_chat_id,me,p_with_video) returning id into new_id;
 if p_chat_kind='direct' then
  insert into public.call_invites(call_id,user_id)
  select new_id,user_id from public.chat_members where chat_id=p_chat_id and user_id<>me;
 else
  insert into public.call_invites(call_id,user_id)
  select new_id,user_id from public.group_members where group_id=p_chat_id and user_id<>me;
 end if;
 return new_id;
end;$$;
create or replace function public.respond_messenger_call(p_call_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();row_call public.calls%rowtype;
begin
 select * into row_call from public.calls where id=p_call_id for update;
 if me is null or not found then raise exception 'Call not found';end if;
 if row_call.status='ended' or (row_call.status='ringing' and row_call.created_at<now()-interval '45 seconds') then
  update public.calls set status='ended',ended_at=now() where id=p_call_id;
  update public.call_invites set status='missed' where call_id=p_call_id and status='ringing';
  raise exception 'Call expired or ended';end if;
 if not exists(select 1 from public.call_invites where call_id=p_call_id and user_id=me and status='ringing')
 then raise exception 'No pending invitation';end if;
 update public.call_invites set status=case when p_accept then 'accepted' else 'declined' end
 where call_id=p_call_id and user_id=me and status='ringing';
 if p_accept then
  update public.calls set status='active' where id=p_call_id;
 elsif not exists(select 1 from public.call_invites where call_id=p_call_id and status in ('ringing','accepted')) then
  update public.calls set status='ended',ended_at=now() where id=p_call_id;
 end if;
end;$$;
create or replace function public.end_messenger_call(p_call_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();row_call public.calls%rowtype;
begin
 select * into row_call from public.calls where id=p_call_id for update;
 if me is null or not found or not public.is_call_chat_member(row_call.chat_kind,row_call.chat_id)
 then raise exception 'No access to end call';end if;
 update public.calls set status='ended',ended_at=now() where id=p_call_id;
 update public.call_invites set status='missed' where call_id=p_call_id and status='ringing';
end;$$;
revoke all on function public.start_messenger_call(text,uuid,boolean),
 public.respond_messenger_call(uuid,boolean),public.end_messenger_call(uuid) from public,anon;
grant execute on function public.start_messenger_call(text,uuid,boolean),
 public.respond_messenger_call(uuid,boolean),public.end_messenger_call(uuid) to authenticated;
