-- Activity is private by default. Exact timestamps are returned only when explicitly enabled.
create table if not exists public.user_activity(
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_seen_at timestamptz,
 visibility text not null default 'approximate' check(visibility in('exact','approximate'))
);
alter table public.user_activity enable row level security;
drop policy if exists user_activity_self_read on public.user_activity;
create policy user_activity_self_read on public.user_activity
 for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.user_activity from anon,authenticated;
grant select on public.user_activity to authenticated;

create or replace function public.set_my_activity(p_visibility text default null)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'Authentication required';end if;
 if p_visibility is not null and p_visibility not in ('exact','approximate')
   then raise exception 'Invalid visibility'; end if;
 insert into public.user_activity(user_id,last_seen_at,visibility)
 values(me,now(),coalesce(p_visibility,'approximate'))
 on conflict(user_id) do update set
 last_seen_at=now(),
 visibility=coalesce(p_visibility,public.user_activity.visibility);
end;$$;
revoke all on function public.set_my_activity(text) from public,anon;
grant execute on function public.set_my_activity(text) to authenticated;

create or replace function public.get_user_activity(p_user_ids uuid[])
returns table(user_id uuid,status text,last_seen_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare requested int;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 requested:=coalesce(cardinality(p_user_ids),0);
 if requested>100 then raise exception 'Too many profiles';end if;
 return query
 select p.id as user_id,
  case
   when a.last_seen_at is null then 'был давно'
   when a.visibility='exact' and a.last_seen_at>now()-interval '90 seconds' then 'в сети'
   when a.visibility='exact' then 'exact'
   when a.last_seen_at>=now()-interval '3 days' then 'был недавно'
   when a.last_seen_at>=now()-interval '7 days' then 'был на этой неделе'
   when a.last_seen_at>=date_trunc('year',now()) then 'был в этом году'
   else 'был давно'
  end as status,
  case when a.visibility='exact' then a.last_seen_at else null end as last_seen_at
 from public.profiles p
 left join public.user_activity a on a.user_id=p.id
 where p.id=any(coalesce(p_user_ids,'{}'::uuid[]));
end;$$;
revoke all on function public.get_user_activity(uuid[]) from public,anon;
grant execute on function public.get_user_activity(uuid[]) to authenticated;

-- Return *counts*, never subscription identities. Ordinary users cannot query others' subscriptions.
create or replace function public.channel_subscriber_counts(p_ids uuid[])
returns table(channel_id uuid,subscribers bigint)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if coalesce(cardinality(p_ids),0)>100 then raise exception 'Too many channels';end if;
 return query
 select ch.id, (select count(*) from public.channel_subscriptions cs where cs.channel_id=ch.id)
 from public.channels ch where ch.id=any(coalesce(p_ids,'{}'::uuid[]));
end;$$;
revoke all on function public.channel_subscriber_counts(uuid[]) from public,anon;
grant execute on function public.channel_subscriber_counts(uuid[]) to authenticated;
