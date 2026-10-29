-- STAGING ONLY. NEVER RUN THIS WRITE-CAPABLE TEST IN PRODUCTION.
-- Populate IDs of TWO real staging auth.users, disjoint chats, messages,
-- one edited message and one private file owned by account B.
-- Run through an authorized SQL Editor or psql DB role with SET ROLE privilege.
-- Test all data mutation paths only inside a transaction that is rolled back.
-- Replace the values below with test fixture IDs before executing.
BEGIN;
SET LOCAL statement_timeout='15s';
SELECT set_config('audit.a_user','REPLACE_WITH_VALID_UUID_A',true);
SELECT set_config('audit.b_user','REPLACE_WITH_VALID_UUID_B',true);
SELECT set_config('audit.a_chat','REPLACE_WITH_VALID_UUID_CHAT_A',true);
SELECT set_config('audit.b_chat','REPLACE_WITH_VALID_UUID_CHAT_B',true);
SELECT set_config('audit.b_message','REPLACE_WITH_VALID_UUID_MESSAGE_B',true);
SELECT set_config('audit.b_history','REPLACE_WITH_VALID_BIGINT_HISTORY_ROW',true);
SELECT set_config('audit.b_private_name','REPLACE_WITH_PRIVATE_STORAGE_OBJECT_NAME_B',true);
SELECT set_config('audit.b_comment','REPLACE_WITH_VALID_UUID_CHANNEL_COMMENT_B',true);

-- Abort rather than misleadingly report all tests passed on empty/missing data.
DO $$
DECLARE a uuid; b uuid; ca uuid; cb uuid; mb uuid;
BEGIN
 a:=current_setting('audit.a_user')::uuid;
 b:=current_setting('audit.b_user')::uuid;
 ca:=current_setting('audit.a_chat')::uuid;
 cb:=current_setting('audit.b_chat')::uuid;
 mb:=current_setting('audit.b_message')::uuid;
 IF a=b OR ca=cb THEN RAISE EXCEPTION 'Use two different users and chats'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=a)
    OR NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=b) THEN
   RAISE EXCEPTION 'Both auth users must exist in staging';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=ca AND user_id=a)
    OR EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=ca AND user_id=b)
    OR NOT EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=cb AND user_id=b)
    OR EXISTS(SELECT 1 FROM public.chat_members WHERE chat_id=cb AND user_id=a) THEN
   RAISE EXCEPTION 'Fixture chats must be disjoint by membership';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.messages WHERE id=mb AND chat_id=cb) THEN
   RAISE EXCEPTION 'Foreign message fixture missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.message_edit_history
   WHERE id=current_setting('audit.b_history')::bigint AND editor_id=b) THEN
   RAISE EXCEPTION 'Foreign edit history fixture missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects
  WHERE bucket_id='ikonosfera-direct-media'
    AND name=current_setting('audit.b_private_name')) THEN
   RAISE EXCEPTION 'Private attachment fixture missing';
 END IF;
END $$;

-- A's JWT session. The SQL Editor impersonation is a privileged TEST only:
-- real Supabase Auth JWT signature validation MUST be tested separately.
SELECT set_config('request.jwt.claim.sub',current_setting('audit.a_user'),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS DISTINCT FROM current_setting('audit.a_user')::uuid THEN
   RAISE EXCEPTION 'UID not set correctly for A';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.chats c
   WHERE c.id=current_setting('audit.a_chat')::uuid) THEN
   RAISE EXCEPTION 'A cannot see own chat: fixture/permission broken';
 END IF;
 IF EXISTS(SELECT 1 FROM public.chats c WHERE c.id=current_setting('audit.b_chat')::uuid)
    OR EXISTS(SELECT 1 FROM public.messages m WHERE m.id=current_setting('audit.b_message')::uuid)
    OR EXISTS(SELECT 1 FROM public.message_edit_history h
       WHERE h.id=current_setting('audit.b_history')::bigint)
    OR EXISTS(SELECT 1 FROM public.user_activity u
       WHERE u.user_id=current_setting('audit.b_user')::uuid)
    OR EXISTS(SELECT 1 FROM storage.objects o
       WHERE o.bucket_id='ikonosfera-direct-media'
         AND o.name=current_setting('audit.b_private_name')) THEN
   RAISE EXCEPTION 'ISOLATION FAILED: A sees private records owned by B';
 END IF;

 -- Existing read-only SQL permissions should prevent foreign writes.
 BEGIN
   UPDATE public.messages SET body=body
   WHERE id=current_setting('audit.b_message')::uuid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 THEN RAISE EXCEPTION 'ISOLATION FAILED: A updated B message'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE public.message_edit_history SET previous_body=previous_body
   WHERE id=current_setting('audit.b_history')::bigint;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 THEN RAISE EXCEPTION 'ISOLATION FAILED: A updated B history'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE public.user_activity SET last_seen_at=last_seen_at
   WHERE user_id=current_setting('audit.b_user')::uuid;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 THEN RAISE EXCEPTION 'ISOLATION FAILED: A updated B status'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
   UPDATE storage.objects SET name=name
   WHERE bucket_id='ikonosfera-direct-media'
     AND name=current_setting('audit.b_private_name');
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 THEN RAISE EXCEPTION 'ISOLATION FAILED: A updated B file'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 -- Privileged RPC must reject cross-chat requests.
 BEGIN
   PERFORM public.mark_chat_messages_read(current_setting('audit.b_chat')::uuid);
   RAISE EXCEPTION 'ISOLATION FAILED: A marked B chat read';
 EXCEPTION WHEN others THEN
   IF SQLERRM LIKE 'ISOLATION FAILED:%' THEN RAISE; END IF;
 END;
 BEGIN
   PERFORM public.manage_direct_message(
     current_setting('audit.b_message')::uuid,'edit','Test edit from A');
   RAISE EXCEPTION 'ISOLATION FAILED: A edited B message via privileged RPC';
 EXCEPTION WHEN others THEN
   IF SQLERRM LIKE 'ISOLATION FAILED:%' THEN RAISE; END IF;
 END;
END $$;

RESET ROLE;

-- B is deliberately disjoint and must see their own fixture but not A's.
SELECT set_config('request.jwt.claim.sub',current_setting('audit.b_user'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.chats
    WHERE id=current_setting('audit.b_chat')::uuid)
    OR NOT EXISTS(SELECT 1 FROM public.messages
    WHERE id=current_setting('audit.b_message')::uuid)
    OR NOT EXISTS(SELECT 1 FROM storage.objects
    WHERE bucket_id='ikonosfera-direct-media'
      AND name=current_setting('audit.b_private_name')) THEN
   RAISE EXCEPTION 'B cannot see own seeded fixture; test invalid';
 END IF;
 IF EXISTS(SELECT 1 FROM public.chats
    WHERE id=current_setting('audit.a_chat')::uuid) THEN
   RAISE EXCEPTION 'ISOLATION FAILED: B sees A chat';
 END IF;
END $$;
RESET ROLE;

-- SQL role anon: lacks read/write access even where broad GRANT exists.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.message_edit_history)
    OR EXISTS(SELECT 1 FROM public.message_reactions)
    OR EXISTS(SELECT 1 FROM public.channel_post_reactions)
    OR EXISTS(SELECT 1 FROM public.direct_message_rate_windows)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='ikonosfera-direct-media') THEN
  RAISE EXCEPTION 'ISOLATION FAILED: anon sees a protected row';
 END IF;
 IF has_function_privilege('anon','public.manage_direct_message(uuid,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.manage_channel_comment(uuid,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'ISOLATION FAILED: anon can execute privileged RPC';
 END IF;
END $$;
RESET ROLE;

-- Anonymous Sign-In is NOT the SQL role anon: it uses authenticated and
-- is_anonymous in a signed JWT. Reproduce here only the SERVER CLAIM case.
-- A genuine signed JWT + REST test must also be run through Auth in staging.
SELECT set_config('request.jwt.claim.sub',current_setting('audit.a_user'),true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub',current_setting('audit.a_user'),
   'role','authenticated','is_anonymous',true)::text,true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF coalesce((auth.jwt()->>'is_anonymous')::boolean,false) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Test JWT is_anonymous claim was not recognized';
 END IF;
 -- No policy should assume authenticated => verified email.
 -- Existing functions may still allow temporary accounts; document expected
 -- behavior for group creation, start_direct_chat, reporting and write quotas.
END $$;
RESET ROLE;

-- This test is expected to fail on the current release until patched:
-- manage_channel_comment uses "auth.uid() <> author" and in SQL NULL <>
-- author is NULL; a PL/pgSQL IF NULL does not reject the operation.
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.manage_channel_comment(
    current_setting('audit.b_comment')::uuid,'edit','STAGING-ONLY CHECK');
  RAISE EXCEPTION 'ISOLATION FAILED: privileged edit allowed with null UID';
 EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ISOLATION FAILED:%' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;

-- ALWAYS roll back all writes, even if no assertion has failed.
ROLLBACK;

-- Do not run as an automatic production migration. Treat a failure as a
-- security bug or an invalid fixture; investigate the exception and repeat.
