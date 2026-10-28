-- Users may feature one of their own channels on their public profile.
alter table public.profiles
 add column if not exists featured_channel_id uuid references public.channels(id) on delete set null;
create index if not exists profiles_featured_channel_idx
 on public.profiles(featured_channel_id) where featured_channel_id is not null;
create or replace function public.validate_featured_profile_channel()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.featured_channel_id is not null and not exists(
   select 1 from public.channels
   where id = new.featured_channel_id and owner_id = new.id
 ) then
   raise exception 'Only a channel you created can be featured on your profile';
 end if;
 return new;
end;
$$;
drop trigger if exists validate_featured_profile_channel on public.profiles;
create trigger validate_featured_profile_channel
 before insert or update of featured_channel_id on public.profiles
 for each row execute function public.validate_featured_profile_channel();
