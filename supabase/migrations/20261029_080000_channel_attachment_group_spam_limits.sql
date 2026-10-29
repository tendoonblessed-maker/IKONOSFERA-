-- Prerelease server-side integrity and spam limits.
-- An attachment-only channel post must be allowed and owned by its author.
alter table public.channel_posts drop constraint if exists channel_post_content;
alter table public.channel_posts add constraint channel_post_content
 check (char_length(trim(coalesce(body,'')))>0 or image_path is not null or attachment_path is not null);
alter table public.channel_posts drop constraint if exists channel_post_attachment_owner;
alter table public.channel_posts add constraint channel_post_attachment_owner
 check (attachment_path is null or split_part(attachment_path,'/',1)=author_id::text);
alter table public.channel_posts drop constraint if exists channel_post_attachment_pair;
alter table public.channel_posts add constraint channel_post_attachment_pair
 check ((attachment_path is null and attachment_type is null) or
        (attachment_path is not null and attachment_type is not null));
-- The existing rate-window function already verifies NEW.sender_id = auth.uid(),
-- and limits the combined direct + group message count to 30/minute per user.
drop trigger if exists group_messages_limit_rate on public.group_messages;
create trigger group_messages_limit_rate before insert on public.group_messages
 for each row execute function public.limit_direct_message_rate();
