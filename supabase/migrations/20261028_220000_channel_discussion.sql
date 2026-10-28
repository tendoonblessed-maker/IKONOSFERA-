-- Channel owner controls and linked discussion. Comments are the canonical replies shown in both post threads and discussion.
alter table public.channels add column if not exists discussion_enabled boolean not null default false;
create table if not exists public.channel_discussion_messages(
 id uuid primary key default gen_random_uuid(),
 channel_id uuid not null references public.channels(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1500),
 created_at timestamptz not null default now()
);
create index if not exists channel_discussion_messages_recent on public.channel_discussion_messages(channel_id,created_at desc);
alter table public.channel_discussion_messages enable row level security;
create policy discussion_read on public.channel_discussion_messages for select to authenticated
 using(exists(select 1 from public.channels c where c.id=channel_id and c.discussion_enabled));
create policy discussion_write on public.channel_discussion_messages for insert to authenticated
 with check(author_id=(select auth.uid()) and exists(select 1 from public.channels c where c.id=channel_id and c.discussion_enabled));
create policy discussion_delete on public.channel_discussion_messages for delete to authenticated
 using(author_id=(select auth.uid()) or exists(select 1 from public.channels c where c.id=channel_id and c.owner_id=(select auth.uid())));
revoke all on public.channel_discussion_messages from anon,authenticated;
grant select,insert,delete on public.channel_discussion_messages to authenticated;
