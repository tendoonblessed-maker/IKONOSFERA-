-- Optional publicly displayed age. No birth date is collected or exposed.
-- Users can leave it NULL (not displayed) or clear it at any time.
alter table public.profiles
  add column if not exists age_years smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='profiles_age_years_range'
      and conrelid='public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_age_years_range
      check (age_years is null or age_years between 1 and 120);
  end if;
end $$;

-- An account may only feature a channel it actually owns.
-- Client-side filtering is not a permission boundary.
create or replace function public.validate_featured_channel_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.featured_channel_id is not null and not exists (
    select 1 from public.channels channel_row
    where channel_row.id=new.featured_channel_id
      and channel_row.owner_id=new.id
  ) then
    raise exception 'You can only feature channels you own'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_featured_channel_owner()
  from PUBLIC, anon, authenticated;

drop trigger if exists validate_featured_channel_owner_trigger
  on public.profiles;
create trigger validate_featured_channel_owner_trigger
  before insert or update of featured_channel_id
  on public.profiles
  for each row execute function public.validate_featured_channel_owner();
