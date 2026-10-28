create table if not exists public.message_reactions(
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check(emoji in ('👍🏻','👎🏻','✌🏻','👌🏻','🖕🏻','🫶🏻','🕊️')),
 created_at timestamptz not null default now(),
 primary key(message_id,user_id)
);
create table if not exists public.channel_post_reactions(
 post_id uuid not null references public.channel_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check(emoji in ('👍🏻','👎🏻','✌🏻','👌🏻','🖕🏻','🫶🏻','🕊️')),
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create index if not exists message_reactions_user on public.message_reactions(user_id);
create index if not exists post_reactions_user on public.channel_post_reactions(user_id);
alter table public.message_reactions enable row level security;
alter table public.channel_post_reactions enable row level security;
create policy message_reactions_read on public.message_reactions for select to authenticated using(exists(
 select 1 from public.messages m join public.chats c on c.id=m.chat_id where m.id=message_id and ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)));
create policy message_reactions_insert on public.message_reactions for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.messages m join public.chats c on c.id=m.chat_id where m.id=message_id and ((select auth.uid())=c.user_a or (select auth.uid())=c.user_b)));
create policy message_reactions_delete on public.message_reactions for delete to authenticated using(user_id=(select auth.uid()));
create policy post_reactions_read on public.channel_post_reactions for select to authenticated using(exists(
 select 1 from public.channel_posts p where p.id=post_id));
create policy post_reactions_insert on public.channel_post_reactions for insert to authenticated with check(
 user_id=(select auth.uid()) and exists(select 1 from public.channel_posts p where p.id=post_id));
create policy post_reactions_delete on public.channel_post_reactions for delete to authenticated using(user_id=(select auth.uid()));
grant select,insert,delete on public.message_reactions,public.channel_post_reactions to authenticated;
