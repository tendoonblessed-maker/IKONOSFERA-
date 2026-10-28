# Open-source messenger integrations in IKONOSFERA

Updated: 2026-10-29.

## Licensing boundary

- Telegram Web K: https://github.com/TelegramOrg/Telegram-web-k — GPLv3.
- Telegram Web A: https://github.com/Ajaxy/telegram-tt — GPLv3.
- Telegram iOS, Android and Desktop are also GPL-licensed.
- Telegram's TDLib connects to **Telegram's** network, not to IKONOSFERA's
  Supabase backend. We do not embed it or copy Telegram client components.
- The layout, SVGs, swipe-to-reply behavior and monochrome theme in IKONOSFERA
  are independently implemented. They are not source-code extracts from Telegram.

## Permissive packages integrated

| Package | License | Installed version | Use in IKONOSFERA |
| --- | --- | --- | --- |
| [react-swipeable](https://github.com/FormidableLabs/react-swipeable) | MIT | 7.0.2 | Native-feeling horizontal swipe-to-reply on messages; retain vertical scrolling on iOS |
| [@floating-ui/react](https://github.com/floating-ui/floating-ui) | MIT | 0.27.20 | Position inbox action menus in a portal, flip/shift away from edges, handle outside click, Escape and keyboard focus |

Package licenses and notices remain with the npm packages. If bundling or
distributing this application, preserve third-party notices as required by their
respective licenses. Avoid copying Telegram GPL source verbatim unless a
compatible distribution and licensing strategy has been chosen.

## Telegram-like UX independently implemented

- A flat iOS-style four-tab navigation bar instead of a floating capsule.
- Minimal monochrome chat rows with avatar, name, last message, time, unread count.
- Folder tabs shown with an underline rather than floating filter pills.
- Context menu anchored to the chat action button with viewport collision avoidance.
- Swipe-to-reply with a visible quoted-message preview above the composer.
- Refined bubbles, read receipts, compact headers, search, date dividers and settings.
- Existing Supabase RLS, offline behavior, account authentication, direct/group
  messaging, stories, pinned channels and blacklists remain the app's own logic.

### Known limitation: message replies

Messages use the existing text-message endpoint, so reply context is embedded
as an explicit quoted prefix when sent. The new preview is only a composer UX.
A truly linked threaded reply would need a new `reply_to_message_id` column,
server-side ownership/membership validation, API changes and reply rendering.
That schema migration is deliberately **not** mixed into this design release.

## Evaluated, not currently installed

- [@tanstack/react-virtual](https://github.com/TanStack/virtual) — MIT:
  useful once users have thousands of chat/message rows. Not installed because
  current cursor pagination already bounds loaded pages and virtualizing
  dynamically-sized bubbles would require further scroll-position tests.
- [Telegram Web K / Web A](https://telegram.org/apps) — GPLv3:
  useful architectural and interaction references, but not a compatible
  drop-in component library for this project's current license status.
- [TDLib](https://core.telegram.org/tdlib) — Telegram network client:
  no benefit to direct Supabase chats without changing the underlying protocol.

## Validation

`npm run check` and `npm run build` must pass. After deployment, physically
check iPhone Safari: rotate the screen, open/close chat row menus at the screen
edges, swipe a message without blocking vertical scrolling, cancel reply,
send reply, focus the composer and show/hide the keyboard. Verify Android
back button and desktop keyboard Escape too.
