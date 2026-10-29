-- Migration applied to Supabase project as 20261029071053.
-- Notify only current members of a group about new messages.
-- SELECT RLS on public.group_messages still checks is_group_member(group_id).
-- Realtime is a wake-up signal; the client re-reads via PostgREST.
-- Deliberately retain the original publication and default replica identity.
do $$
begin
 if not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public'
    and tablename='group_messages'
 ) then
  execute 'ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages';
 end if;
end
$$;
