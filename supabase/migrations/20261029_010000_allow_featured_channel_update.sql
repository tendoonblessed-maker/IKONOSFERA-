-- Profiles are limited by profiles_update_self RLS (auth.uid() = profiles.id).
-- validate_featured_profile_channel trigger separately restricts the choice to
-- channels owned by that same profile. Keep updates column-scoped.
grant update (featured_channel_id) on public.profiles to authenticated;
