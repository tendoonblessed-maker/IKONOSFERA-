-- Optional self-reported age for IKONOSFERA profiles.
-- It is not an identity/age-verification system. Users may leave it null.
alter table public.profiles add column if not exists age_years smallint;
alter table public.profiles drop constraint if exists profiles_age_years_check;
alter table public.profiles add constraint profiles_age_years_check
  check (age_years is null or age_years between 13 and 120);
comment on column public.profiles.age_years is
  'Optional self-reported age, shown to authenticated profile viewers. No date of birth stored.';
