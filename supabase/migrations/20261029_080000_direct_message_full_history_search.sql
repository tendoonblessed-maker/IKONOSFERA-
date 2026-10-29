-- Literal, RLS-respecting search through the entire accessible direct-chat history.
-- Return at most 31 matches per request so clients can paginate 30 at a time.
create or replace function public.search_direct_messages(
  p_chat_id uuid,
  p_query text,
  p_limit integer default 31,
  p_offset integer default 0
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $search$
  select m.id, m.sender_id, m.body, m.created_at
  from public.messages as m
  where (select auth.uid()) is not null
    and public.is_chat_member(p_chat_id)
    and m.chat_id = p_chat_id
    and char_length(btrim(coalesce(p_query,''))) between 2 and 120
    -- strpos is literal, not an ILIKE/regex pattern: %, _, * and commas
    -- are treated as user text, never wildcard instructions.
    and position(lower(btrim(p_query)) in lower(m.body)) > 0
    and coalesce(m.deleted_for_everyone,false) = false
    and not ((select auth.uid()) = any(coalesce(m.deleted_for,'{}'::uuid[])))
  order by m.created_at desc, m.id desc
  limit greatest(1,least(coalesce(p_limit,31),31))
  offset greatest(0,least(coalesce(p_offset,0),600));
$search$;

revoke all on function public.search_direct_messages(uuid,text,integer,integer)
  from public, anon;
grant execute on function public.search_direct_messages(uuid,text,integer,integer)
  to authenticated;
