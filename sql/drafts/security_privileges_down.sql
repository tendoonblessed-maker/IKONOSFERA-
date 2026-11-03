-- DRAFT ROLLBACK ONLY, restores the specific 2026-10-29 ACL snapshot.
-- Not a data rollback. Review for privilege changes after the baseline audit.
BEGIN;

-- Restore prior direct grants to anon for the four reviewed tables.
GRANT ALL PRIVILEGES ON TABLE
  public.channel_post_reactions,
  public.direct_message_rate_windows,
  public.message_edit_history,
  public.message_reactions
TO anon;

-- Restore the three column-independent table-level privileges that up revoked.
GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.channel_post_reactions,
  public.direct_message_rate_windows,
  public.message_edit_history,
  public.message_reactions
TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_featured_profile_channel()
TO PUBLIC, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon;

-- Restore global implicit EXECUTE on newly created functions. Note that this
-- broadens all future functions for each creator (not recommended long term).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

COMMIT;
