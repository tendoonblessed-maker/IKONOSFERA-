-- DRAFT ONLY. DO NOT APPLY IN PRODUCTION BEFORE STAGING TESTS + APPROVAL.
-- Verified 2026-10-29: four tables expose ALL table grants to anon and
-- authenticated, PUBLIC can EXECUTE one trigger routine, future objects created
-- by postgres and supabase_admin auto-grant anon.
-- Run under an appropriately privileged role, in a controlled maintenance window.
-- No table / row / policy / function body changes.
BEGIN;

-- RLS is necessary but is NOT sufficient for TRUNCATE, TRIGGER, REFERENCES.
REVOKE ALL PRIVILEGES ON TABLE
  public.channel_post_reactions,
  public.direct_message_rate_windows,
  public.message_edit_history,
  public.message_reactions
FROM anon;

-- Narrow the three most dangerous SQL-level table grants for authenticated.
-- Existing application SELECT / INSERT / DELETE / UPDATE continue unchanged
-- until separately audited. This change revokes only the following privileges.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.channel_post_reactions,
  public.direct_message_rate_windows,
  public.message_edit_history,
  public.message_reactions
FROM authenticated;

-- Trigger functions do not require client EXECUTE. Leave internal trigger
-- invocation intact; remove unnecessary public/anon ACL.
REVOKE EXECUTE ON FUNCTION public.validate_featured_profile_channel()
FROM PUBLIC, anon;

-- Both postgres and supabase_admin currently have explicit broad defaults.
-- Defaults are creator-specific. This does NOT change existing tables.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- PostgreSQL grants PUBLIC EXECUTE on newly created functions globally by
-- default. Per-schema REVOKE alone does not counter a global default grant.
-- These global defaults affect *future functions in all schemas* created by
-- those roles, so approval must explicitly cover this scope.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- AFTERWARD: verify pg_default_acl, table privileges, and ALL authenticated
-- API clients; explicitly GRANT EXECUTE for each new intended RPC.
