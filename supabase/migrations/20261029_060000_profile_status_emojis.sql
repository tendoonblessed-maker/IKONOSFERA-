-- One of the 50 original glossy icons supplied by the IKONOSFERA author.
-- NULL means no emoji status. The existing profiles_update_self policy checks
-- auth.uid() = id for both USING and WITH CHECK; other users cannot change it.
alter table public.profiles
  add column if not exists status_emoji smallint;
alter table public.profiles
  drop constraint if exists profiles_status_emoji_range;
alter table public.profiles
  add constraint profiles_status_emoji_range
  check (status_emoji is null or status_emoji between 0 and 49);
grant update (status_emoji) on public.profiles to authenticated;
comment on column public.profiles.status_emoji is
  'Selected IKONOSFERA glossy user status from 50 uploaded originals, or null';
