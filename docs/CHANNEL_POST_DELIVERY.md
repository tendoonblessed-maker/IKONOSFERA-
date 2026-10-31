# Channel posts: lost-acknowledgment recovery without duplicate publications

## Verified read-only database facts (31 Oct 2026)

The connected IKONOSFERA Supabase project is active, but there is no verified
separate staging project. We performed **SELECT-only** metadata inspection;
no live schema or bucket settings were modified.

- Both media buckets already have a 25 MiB limit, and the public
  `ikonosfera-media` bucket already allows the image, video, audio and
  document MIME types listed in the frontend. The original SQL migration is
  older than the active bucket state: it must **not** be used to infer the
  current size/MIME configuration.
- The live `channel_posts` table includes `attachment_path` and
  `attachment_type` columns.
- The live `channel_post_content` check still requires nonempty `body` or a
  nonnull **`image_path`**. A file-only post with `attachment_path` but no
  `image_path` therefore fails this check.

## Fixed in this frontend-only PR

Previously the channel composer uploaded a public object, then tried a
PostgREST INSERT. On **any** error, it deleted the uploaded object via
`removeUpload`. If the database had already committed the post but the
HTTP response was lost, the deletion broke the published attachment.

The new `publishChannelPostSafely` flow:

1. Validates that the draft has nonempty body, reflecting the current live
   constraint. No file upload is attempted for an invalid file-only post.
2. For an attached File, retains the uploaded object path and media type in
   an ephemeral `WeakMap` bound to the exact File instance, author, channel
   and text. No access tokens or file bytes are saved in browser storage.
3. Attempts the database INSERT **once** for that attachment attempt.
   A successful response must match the author, channel, text, file path,
   image_path=null, and attachment type.
4. On a lost or mismatched response, performs an authenticated read-only
   PostgREST SELECT filtered by author/channel/**exact uploaded path**.
   It accepts exactly one fully matching canonical row; no broad fuzzy match.
5. On a second manual click after an uncertain result, performs **only the
   read-back**, not another INSERT, because the current schema has no
   server-enforced idempotency key for channel posts.
6. Never deletes the object on an uncertain result. Failed inserts may leave
   unused public files; automatic cleanup requires reviewed server-side
   reference checks and a grace period.
7. After confirmation, clears the composer and displays the newly published
   post even if refreshing the feed separately fails. A feed refresh error
   cannot masquerade as a failed send.

Text-only posts retain their existing path. This is not cross-tab/device
exactly-once delivery, and does not preserve File objects across page reloads.

## Remaining release gates

- Validate read-back and PostgREST permissions on an isolated staging
  Supabase instance with two test accounts and real upload bytes.
- Consider a separate, reviewed migration to allow file-only posts using
  `attachment_path`, with constraint tests. Do not modify production merely
  because the frontend form once offered this option.
- PR #76 separately fixes rendering channel audio/video/document URLs.
  Integrate and test both together before releasing them.
- Verify Safari iPhone, Android and Windows, especially response loss after
  database commit and relaunching the app while a send is uncertain.

## Automated tests

`node --test tests/channel-post-delivery.test.mjs` and the full CI pipeline:
typecheck, lint, all tests, and Next.js build.
