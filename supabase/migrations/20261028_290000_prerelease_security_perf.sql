-- These are trigger-only functions. Prevent external RPC callers from invoking
-- security-definer trigger functions directly while preserving trigger execution.
revoke all on function public.limit_direct_message_rate() from public,anon,authenticated;
revoke all on function public.record_message_edit() from public,anon,authenticated;
-- Foreign-key and inbox indexes for the Telegram-inspired messaging layout.
create index if not exists ik_channel_comments_author_idx on public.channel_comments(author_id);
create index if not exists ik_discussion_author_idx on public.channel_discussion_messages(author_id);
create index if not exists ik_channel_posts_author_idx on public.channel_posts(author_id);
create index if not exists ik_chats_other_idx on public.chats(user_b);
create index if not exists ik_group_owner_idx on public.group_chats(owner_id);
create index if not exists ik_group_messages_sender_idx on public.group_messages(sender_id);
create index if not exists ik_message_edits_editor_idx on public.message_edit_history(editor_id);
create index if not exists ik_message_edits_message_idx on public.message_edit_history(message_id);
