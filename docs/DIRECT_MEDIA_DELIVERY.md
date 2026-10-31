# Private media delivery: recovery without deleting delivered files

## Issue

Previous `sendDirectMedia` uploaded a private object and then inserted its message
via PostgREST. If the database **committed** but the HTTP reply was dropped,
the catch handler unconditionally sent `DELETE /storage/v1/object/...`. A
message could remain in chat pointing to a deleted private image or audio file.
Retrying with a new random filename could also create duplicate messages.

## Implementation

- One attachment preview (`File` object), account, chat and exact caption uses
  one in-memory attempt, containing a stable storage path and
  `client_message_id` UUID.
- Storage POST still uses `x-upsert:false`. A lost reply, HTTP timeout or
  duplicate-path response is resolved by **metadata-only** authenticated
  `GET /storage/v1/object/info/authenticated/ikonosfera-direct-media/<path>`.
  The path, bucket, MIME and byte length must match the selected file. A
  mismatch fails closed; the app never uploads over an existing object.
- Database INSERT includes `client_message_id` (supported by the existing
  direct-message integrity migration). The canonical response must match chat,
  sender, path, media type, caption and client UUID. Ambiguous results are
  verified by RLS-scoped `SELECT` on (chat, sender, client UUID).
- Manual retry first looks up an earlier uncertain DB insert. It reuses the
  original storage object and UUID, rather than automatically performing a
  new upload. No automatic sends happen on network reconnection.
- **Never delete uploaded objects automatically after an uncertain INSERT.**
  There is no safe way for this client to prove that no message is referencing
  a path after a timed-out request. An unreferenced object is preferable to a
  broken delivered message.
- `WeakMap<File,...>` keeps state limited to the live browser tab. The File
  is not serializable and cannot be restored after refresh, so the user must
  reselect it in that case. No media contents, JWTs or paths go into browser
  storage.

## Limits / future maintenance

- A permanently rejected send can leave an orphan private object. A **future**
  server-side garbage collector must verify there are no DB references and
  respect an age grace period before removing anything.
- Different File instances, tabs and devices have distinct identities.
- This work does **not** change database migrations, public storage access,
  bucket policies, or production.
- Manual smoke testing with a real Supabase staging instance and iOS Safari
  is still needed before merging.

## Tests

`node --test tests/direct-media-delivery.test.mjs`

Covers normal delivery, lost DB acknowledgment, saved-but-unacknowledged upload,
missing metadata, duplicate upload retry, mismatched canonical rows/metadata,
RLS denial, changed captions and invalid files.
