# Channel reliability integration (#75, #76, #77)

## Scope

This integration branch combines three independently tested draft PRs against
the current `main` without touching production.

- **PR #75**: channel avatar PATCH recovery on lost responses and safe
  fallback rendering, without deleting an image which may already be in use.
- **PR #76**: verified channel attachment URL generation for image, video,
  audio and document paths; no broken `href="#"` download.
- **PR #77**: attached channel post publish acknowledgment verification,
  no dangerous Storage deletion after a committed-but-unacknowledged POST,
  and no blind retry without a database uniqueness key.

## How overlap was resolved

- Retained one shared `api(..., timeoutMs)` helper.
- Added avatar `getChannelById(..., timeoutMs)` and
  `updateChannelAvatar(...)` verification alongside the canonical post
  query helper.
- The channel component imports both `publishChannelPostSafely` and
  `channelAttachmentUrl` and includes the avatar state updates.
- All original regression tests are included; this release branch should
  pass the whole project's typecheck, lint, tests and Next build.

## Backend facts and limitations

The connected IKONOSFERA Supabase project was checked read-only on
31 October 2026: `ikonosfera-media` is public, permits image, video, audio
and document MIME types, and has a 25 MiB object limit. That is **different**
from the initial historical migration with an image-only 3 MiB bucket.
No live bucket setting was changed while preparing this branch.

The live `channel_post_content` constraint still requires a nonblank text
body or `image_path`, even when `attachment_path` is set. The UI therefore
requires a caption for file-attached channel posts until a separately
reviewed schema migration changes the constraint.

An uncertain INSERT may still leave an orphan public object; automatically
deleting objects without server-side reference checks would risk breaking
published posts. A browser refresh loses the in-memory File attempt, and
text-only posts do not yet have a server-enforced idempotency key.

## Release gate

This branch is a draft integration only. Before any deployment to main or
production, run on an isolated staging database and exercise:

1. Avatar upload where PATCH commits but the acknowledgment is dropped;
   confirm the image remains available in the list and channel header.
2. A video/audio/document upload and playback/download in a channel post.
3. A channel post with a dropped POST response; confirm exactly one visible
   post, one intact media object and no second POST on manual retry.
4. Invalid MIME, oversize attachment, file-only post, permission rejection,
   account switching, iPhone Safari keyboard and Windows layouts.

No SQL migrations or production operations are included.
