# Channel posts: safe media and document links

## Bug

`components/ChannelsPanel.tsx` rendered every channel attachment through
`imageUrl(path)`. That function deliberately allows only JPG, PNG and WebP,
so an uploaded MP4/WebM/MOV video, MP3/M4A/WAV/OGG audio file, or PDF/Office
document always produced `null`. The resulting video/audio source was
broken and document downloads used `href="#"`, which does not download anything.

## Browser-side fix

- `lib/social.ts` provides `channelAttachmentUrl(path,type)` for channel
  posts only, without broadening the whitelist for user avatars and photos.
- The helper requires a generated owner UUID / file UUID / known extension and
  checks that its extension matches the server-provided media type.
- Only paths already belonging to the configured public `ikonosfera-media`
  bucket are constructed. Invalid, external, traversal, fragment, query and
  mislabeled paths return `null`.
- Channel posts only render a media control or download link when the helper
  returns a valid URL. There are no dead `#` download links.
- The MIME whitelist in the existing attachment uploader is covered by
  regression tests, alongside the renderer.

## Storage/backend compatibility is a separate release gate

The **initial checked-in migration**
`20261028_130000_social_profiles_channels.sql` provisions the public
`ikonosfera-media` bucket with a **3 MiB** limit and **image-only** MIME
whitelist. The browser-side upload code, however, accepts videos, audio and
documents up to 25 MiB. Those non-image uploads will be rejected by Storage
if that original bucket configuration is still active. This PR fixes the
broken media URL handling only; it does not claim to make disallowed uploads
work or change any live bucket settings.

Before expanding supported channel uploads:

1. Inspect actual configuration on a separate Supabase staging project.
2. Decide whether to use a separate bucket for channel attachments instead
   of expanding the shared bucket also used by avatars and stories. In the
   shared bucket, increasing the limit allows up to 25 MiB *per upload* for
   all authenticated users subject to its existing RLS.
3. Document and test MIME allowlists, size quotas, moderation, content-type
   handling, public visibility and any required database column migrations.
4. Test real public links and safe failure messages on iPhone, Windows and
   Android before any reviewed production release.

No migrations, production Storage policies or user data are changed here.

## Checks

`node --test tests/channel-attachment-links.test.mjs` followed by
the repository's full CI (typecheck, lint, test, build).
