-- Explicit opt-in subscriptions. Public channels remain discoverable, never auto-joined.
create table if not exists public.channel_subscriptions(
 channel_id uuid not null references public.channels(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(channel_id,user_id)
);
create index if not exists channel_subscriptions_user_time on public.channel_subscriptions(user_id,created_at desc);
alter table public.channel_subscriptions enable row level security;
create policy channel_subscriptions_read_own on public.channel_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy channel_subscriptions_join_self on public.channel_subscriptions for insert to authenticated with check(user_id=(select auth.uid()));
create policy channel_subscriptions_leave_self on public.channel_subscriptions for delete to authenticated using(user_id=(select auth.uid()));
revoke all on public.channel_subscriptions from anon,authenticated;
grant select,insert,delete on public.channel_subscriptions to authenticated;

-- Human-readable short usernames. Sequence is database-allocated (no collisions).
create sequence if not exists public.ikonosfera_profile_number_seq as bigint;
-- Backfill sequence start after any existing 'profileNNN' usernames.
select setval('public.ikonosfera_profile_number_seq',
 greatest(1,coalesce((select max(substring(username from '^profile([0-9]+)$')::bigint) from public.profiles where username ~ '^profile[0-9]+$'),0)+1),false);
create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare candidate text;
begin
  loop
    candidate := 'profile' || nextval('public.ikonosfera_profile_number_seq')::text;
    exit when not exists(select 1 from public.profiles where username=candidate);
  end loop;
  insert into public.profiles(id,username,display_name)
  values(new.id,candidate,'Пользователь');
  return new;
end;
$$;
revoke all on function public.create_profile_for_user() from public,anon,authenticated;
