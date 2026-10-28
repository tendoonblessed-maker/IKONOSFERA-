# IKONOSFERA — Telegram-inspired architecture and UX roadmap

## Principle

IKONOSFERA remains an independent messenger: its accounts, messages, channels and groups belong to its own Supabase backend. UI interaction patterns may be inspired by Telegram, but the implementation is original. Existing IKONOSFERA wordmark, Inter fonts, custom 3D navigation images, monochrome branding and PWA identity remain unchanged.

Telegram Web K/A source code is GPLv3. This project does **not** copy or embed it. TDLib communicates with Telegram's infrastructure and is **not** a general-purpose backend for independent IKONOSFERA messages.

## This delivery: inbox and chat UX

- Server-side, RLS-respecting chat overview: latest visible message, time, sender, unread badge.
- Draft-only empty chats remain invisible to the recipient until the first message.
- Conversations sorted by pinned status and latest activity.
- Compact chat rows, preview truncation, consistent mobile/desktop responsive layout.
- Filters: all and unread; keyboard search with Ctrl/Cmd+K.
- One compact create menu for personal conversation, group or channel.
- Per-chat unsent draft kept in memory for the active session (not saved to disk).
- Multi-line composer: Enter sends, Shift+Enter inserts a line break; IME-safe.
- Background tab sync is paused; overlapping polling calls are prevented.
- Existing rich messages, attachments, editing, deletion, reactions and story views stay intact.

## Technical foundation to preserve

- Next.js 16 / React 19 / TypeScript on Vercel
- Supabase Postgres with RLS and signed-in user JWTs; no service-role key in the client.
- Public profiles; private direct chats and groups; channel posts, comments and subscriptions.
- Media storage authorization and signed file URLs.
- Custom PWA assets and install flow.

## Future milestones (NOT yet shipped by this change)

1. **Transport:** scalable per-chat Supabase Realtime subscriptions, reconnect/resync, deduplication and delivery acks. Avoid subscription storms for large inboxes.
2. **Groups:** group inbox preview/unread/read-state, mention permissions, moderation and owner roles; shareable invite links with expiration.
3. **Message history:** cursor pagination, virtualized long lists, per-chat server-side search and date jump navigation.
4. **Offline:** consent-aware IndexedDB message cache with security review and clearing on sign-out; outbox with safe replay and idempotency.
5. **Notifications:** web push with permission prompts and privacy-preserving payloads.
6. **Voice/video:** complete LiveKit configuration and secure server-issued tokens, group voice channels, supported screen sharing, device permissions and session lifecycle.
7. **Security/release:** browser/device E2E, accessibility and performance audit, backup/restore tests, spam prevention and load tests.

## Release checklist

- TypeScript, project policy lint, Node tests, Next build
- SQL regression test under authenticated role and RLS visibility
- Preview deployment check and production alias validation
- Manual two-account check (first message, unread, hiding, pinning, replies)
- Desktop: Chrome/Edge Windows and Safari macOS; mobile: Chrome Android and Safari iOS
- Keep changes on a feature branch and merge only after CI is green.
