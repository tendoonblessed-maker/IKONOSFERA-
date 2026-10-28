-- Per-member read cursors are private and never used as permissions to send messages.
alter table public.group_members add column if not exists last_read_at timestamptz not null default now();
drop policy if exists group_member_update_own_read_cursor on public.group_members;
create policy group_member_update_own_read_cursor on public.group_members
 for update to authenticated using(user_id=(select auth.uid()))
 with check(user_id=(select auth.uid()));
grant update(last_read_at) on public.group_members to authenticated;

create or replace function public.mark_group_read(p_group_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.group_members set last_read_at=now()
 where group_id=p_group_id and user_id=(select auth.uid());
 if not found then raise exception 'Not a group participant';end if;
end;$$;
revoke all on function public.mark_group_read(uuid) from public,anon;
grant execute on function public.mark_group_read(uuid) to authenticated;

create or replace function public.list_group_overviews()
returns table(group_id uuid,last_body text,last_created_at timestamptz,unread_count bigint,member_count bigint)
language sql stable security invoker set search_path='' as $$
 select g.id,
   left(last_message.body,180) as last_body,
   last_message.created_at,
   (select count(*) from public.group_messages msg
      where msg.group_id=g.id and msg.sender_id<>(select auth.uid())
        and msg.created_at>me.last_read_at) as unread_count,
   (select count(*) from public.group_members participants where participants.group_id=g.id) as member_count
 from public.group_chats g
 join public.group_members me on me.group_id=g.id and me.user_id=(select auth.uid())
 left join lateral (
   select msg.body,msg.created_at from public.group_messages msg
   where msg.group_id=g.id order by msg.created_at desc,msg.id desc limit 1
 ) last_message on true
 order by coalesce(last_message.created_at,g.created_at) desc
 limit 100;
$$;
revoke all on function public.list_group_overviews() from public,anon;
grant execute on function public.list_group_overviews() to authenticated;
