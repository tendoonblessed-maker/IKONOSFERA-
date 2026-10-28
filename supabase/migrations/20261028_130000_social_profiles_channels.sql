-- IKONOSFERA social MVP: profile photos, stories (24h), channels, posts, comments.
-- Public media intentionally visible to anyone with a link. Never upload secrets.
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists cover_path text,
  add column if not exists bio text not null default '';
alter table public.profiles
  add constraint profiles_bio_length check (char_length(bio) <= 160),
  add constraint profiles_avatar_owner check (avatar_path is null or split_part(avatar_path,'/',1) = id::text),
  add constraint profiles_cover_owner check (cover_path is null or split_part(cover_path,'/',1) = id::text);

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  caption text not null default '' check(char_length(caption)<=240),
  created_at timestamptz not null default now(),
  constraint profile_photos_own_path check(split_part(image_path,'/',1)=user_id::text)
);
create index profile_photos_user_time on public.profile_photos(user_id,created_at desc);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  caption text not null default '' check(char_length(caption)<=240),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+ interval '24 hours'),
  constraint stories_own_path check(split_part(image_path,'/',1)=user_id::text),
  constraint stories_expiry_range check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create index stories_active_user_idx on public.stories(user_id,expires_at desc);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check(slug ~ '^[a-z0-9_]{3,32}$'),
  title text not null check(char_length(trim(title)) between 1 and 80),
  description text not null default '' check(char_length(description)<=500),
  created_at timestamptz not null default now()
);
create index channels_owner_idx on public.channels(owner_id);

create table public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check(char_length(body)<=4000),
  image_path text,
  created_at timestamptz not null default now(),
  constraint channel_post_content check(char_length(trim(body))>0 or image_path is not null),
  constraint channel_post_image_owner check(image_path is null or split_part(image_path,'/',1)=author_id::text)
);
create index channel_posts_channel_time on public.channel_posts(channel_id,created_at desc);

create table public.channel_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.channel_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(char_length(trim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index channel_comments_post_time on public.channel_comments(post_id,created_at asc);

alter table public.profile_photos enable row level security;
alter table public.stories enable row level security;
alter table public.channels enable row level security;
alter table public.channel_posts enable row level security;
alter table public.channel_comments enable row level security;

create policy photos_read on public.profile_photos for select to authenticated using (true);
create policy photos_create_own on public.profile_photos for insert to authenticated with check(user_id=(select auth.uid()));
create policy photos_delete_own on public.profile_photos for delete to authenticated using(user_id=(select auth.uid()));

create policy stories_read_active_or_own on public.stories for select to authenticated
  using(expires_at > now() or user_id=(select auth.uid()));
create policy stories_create_own on public.stories for insert to authenticated
  with check(user_id=(select auth.uid()) and created_at <= now() and expires_at > now()
    and expires_at <= created_at + interval '24 hours');
create policy stories_delete_own on public.stories for delete to authenticated using(user_id=(select auth.uid()));

create policy channels_read on public.channels for select to authenticated using(true);
create policy channels_create_own on public.channels for insert to authenticated with check(owner_id=(select auth.uid()));
create policy channels_update_own on public.channels for update to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy channels_delete_own on public.channels for delete to authenticated using(owner_id=(select auth.uid()));

create policy channel_posts_read on public.channel_posts for select to authenticated using(true);
create policy channel_posts_create_owner on public.channel_posts for insert to authenticated
  with check(author_id=(select auth.uid()) and exists(select 1 from public.channels c where c.id=channel_id and c.owner_id=(select auth.uid())));
create policy channel_posts_delete_owner on public.channel_posts for delete to authenticated
  using(author_id=(select auth.uid()) and exists(select 1 from public.channels c where c.id=channel_id and c.owner_id=(select auth.uid())));

create policy channel_comments_read on public.channel_comments for select to authenticated using(true);
create policy channel_comments_create_own on public.channel_comments for insert to authenticated
  with check(author_id=(select auth.uid()) and exists(select 1 from public.channel_posts p where p.id=post_id));
create policy channel_comments_delete_own on public.channel_comments for delete to authenticated using(author_id=(select auth.uid()));

revoke all on public.profile_photos,public.stories,public.channels,public.channel_posts,public.channel_comments from anon,authenticated;
grant select on public.profile_photos,public.stories,public.channels,public.channel_posts,public.channel_comments to authenticated;
grant insert,delete on public.profile_photos,public.stories,public.channel_posts,public.channel_comments to authenticated;
grant insert,update,delete on public.channels to authenticated;
grant update (avatar_path,cover_path,bio) on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ikonosfera-media','ikonosfera-media',true,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=3145728,
  allowed_mime_types=excluded.allowed_mime_types;

-- Every upload is scoped to the authenticated user's own UUID folder.
-- There is intentionally no upsert or replace path; each image gets a unique filename.
create policy ik_media_read on storage.objects for select to authenticated
  using(bucket_id='ikonosfera-media');
create policy ik_media_upload on storage.objects for insert to authenticated
  with check(bucket_id='ikonosfera-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy ik_media_delete on storage.objects for delete to authenticated
  using(bucket_id='ikonosfera-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
