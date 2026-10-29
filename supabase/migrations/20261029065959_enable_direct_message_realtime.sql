-- Published in Supabase as migration 20261029065959.
-- Realtime sends UPDATE/INSERT hints only to sessions with SELECT RLS access.
-- All chat contents are fetched separately via authenticated PostgREST.
-- Intentionally does not expose group chats or any other table.
do $$
begin
 if not exists (
   select 1 from pg_publication_tables
   where pubname='supabase_realtime'
     and schemaname='public'
     and tablename='messages'
 ) then
   execute 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
 end if;
end
$$;
