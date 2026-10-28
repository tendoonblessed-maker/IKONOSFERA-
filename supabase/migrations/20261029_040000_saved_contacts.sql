-- Authenticated saved contacts, independent of open/hidden/deleted chats.
-- Contacts are one-sided bookmarks: saving a person does not notify or grant
-- them any access to the owner account.
create table if not exists public.user_contacts(
 owner_id uuid not null references public.profiles(id) on delete cascade,
 contact_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 constraint user_contacts_pair_pk primary key(owner_id,contact_id),
 constraint user_contacts_not_self check(owner_id<>contact_id)
);
create index if not exists user_contacts_contact_idx on public.user_contacts(contact_id);
alter table public.user_contacts enable row level security;
revoke all on public.user_contacts from public,anon,authenticated;
grant select,insert,delete on public.user_contacts to authenticated;
drop policy if exists user_contacts_select_self on public.user_contacts;
create policy user_contacts_select_self on public.user_contacts for select to authenticated
 using(owner_id=(select auth.uid()));
drop policy if exists user_contacts_insert_self on public.user_contacts;
create policy user_contacts_insert_self on public.user_contacts for insert to authenticated
 with check(owner_id=(select auth.uid()) and owner_id<>contact_id);
drop policy if exists user_contacts_delete_self on public.user_contacts;
create policy user_contacts_delete_self on public.user_contacts for delete to authenticated
 using(owner_id=(select auth.uid()));
