# IKONOSFERA — 32 серверные операции: реестр архитектуры

**Статус:** спецификация к согласованию, **не 32 выполненных SQL RPC**. Пользователь дал
поправки к №1–16 и начало №17, но текст №18–32 отсутствует.
Названия непереданных пунктов — осмысленные предложения на основе **действующей схемы**, а не
восстановление чужого SQL-файла.

Легенда:
- **INV**: PostgreSQL `SECURITY INVOKER` + RLS;
- **DEF (узко)**: `SECURITY DEFINER` только когда INV+RLS недостаточно, `SET search_path=''`, минимальный GRANT и проверка UID;
- **Route**: серверный Next.js Handler с пользовательской сессией и `auth.getUser()`, **не service_role по умолчанию**;
- **RT**: Realtime Presence/Broadcast с авторизованными приватными каналами;
- **Job**: отдельный worker/Edge/Cron с ограниченными правами, проверкой владельца, журналом и TTL.

| № | Операция / назначение | Слой | Нужен service_role? | Риск | Реальное положение |
|---:|---|---|---|---|---|
| 1 | `normalize_message_text` без HTML-stripping; убрать вредные control/bidi/zero-width, http/https URL-check | Чистая функция клиент+сервер | Нет | Средний | Новая; React экранирует текст, избегать dangerouslySetInnerHTML |
| 2 | `send_direct_message`, идемпотентность `client_message_id` | INV RPC | Нет | Средний | **Есть** |
| 3 | Превью последнего личного сообщения | Поле `get_chat_list` №17 (INV RPC) | Нет | Средний | Частично в `list_chat_previews` |
| 4 | `get_link_preview` с полноценной SSRF-защитой | Route + cache + rate limit | Нет | **Высокий** | **Нет** |
| 5 | Счётчики непрочитанных | Поле `get_chat_list` №17 | Нет | Средний | Старый `messages.read_at` для ЛС, cursor уже есть для групп |
| 6 | Online/presence и `touch_last_seen` раз в 30–60 c | RT Presence + INV/узкий DEF для durable heartbeat | Нет | Средний | `user_activity` и RPC уже есть, но нет server-side write throttle |
| 7 | `send_attachment` приватные медиа | Storage RLS + POST через пользовательский токен | Нет | Высокий | **Есть** |
| 8 | `search_direct_messages` | INV RPC | Нет | Средний | **Есть** |
| 9 | `broadcast_typing`, максимум раз в 3 с, TTL получателя 5 с | RT Broadcast | Нет | Средний | **Нет**, писать в БД нельзя |
| 10 | `set_message_reaction` | PostgREST под RLS | Нет | Средний | **Есть** |
| 11 | `mark_chat_read` (свой cursor, не UPDATE каждого message) | INV+RLS или узкий DEF RPC | Нет | Высокий для совместимости | Существующий `mark_chat_messages_read` требует миграции |
| 12 | `submit_report` и рассмотрение жалоб | INV RPC + приватная админ-панель | Для проверки прав администратора — по возможности нет; отдельный worker может требовать | Высокий | **Нет**; приватные сообщения не фильтровать ИИ/стоп-словами |
| 13 | `validate_voice_metadata` (границы duration/size/mime) | Route либо background validator + Storage | Нет обычно | Средний | Клиентский лимит и бакет есть, независимого server duration-check нет |
| 14 | `manage_direct_message` (редактирование/скрытие/удаление) | Уже DEF, требуется аудит | Нет | Высокий | **Есть**, 48 ч для edit/delete_everyone |
| 15 | `get_message_edit_history` и видимость предыдущих версий | INV под RLS | Нет | Средний | `message_edit_history` есть, SELECT только `editor_id=auth.uid()` |
| 16 | `request_chat_export` (запуск, async archive в private Storage) | Route + Job | Worker — возможно, серверный scoped key; не публиковать | **Высокий** | **Нет** |
| 17 | `get_chat_list()`: собеседник, аватар, превью последнего, unread, pinned, draft, read cursors | **INV RPC**, данные `chats` + `profiles` + `chat_members` + `messages` | **Нет** | **Высокий для миграции** | Новое; заменить параллельные `list_active_chats` + `list_chat_previews` |
| 18* | `get_chat_messages_page` с cursor `(created_at,id)` | INV/PostgREST | Нет | Средний | Частично есть постраничная история |
| 19* | `send_direct_reply` с `client_id` | INV RPC | Нет | Средний | **Есть** |
| 20* | `send_group_message` с UUID-дедупликацией | PostgREST + PK под RLS | Нет | Средний | **Есть** |
| 21* | `get_group_list` (превью и unread) | INV RPC | Нет | Средний | `list_group_overviews` **есть** |
| 22* | `mark_group_read` | INV RPC / RLS собственный cursor | Нет | Средний | **Есть** |
| 23* | `create_group_chat` | Сейчас DEF; аудит/антиспам | Нет | **Высокий** | **Есть**, может добавить любой существующий профиль |
| 24* | `manage_group_members` (инвайт/роли/выход) | INV или узкий DEF RPC | Нет | Высокий | **Нет** как единый контракт |
| 25* | `create_channel` | PostgREST + RLS | Нет | Средний | **Есть** |
| 26* | `publish_channel_post` | PostgREST/Storage + RLS | Нет | Средний | **Есть** |
| 27* | `edit_channel_post` | Сейчас DEF | Нет | Средний | **Есть** |
| 28* | `find_public_profile` | PostgREST + rate limits | Нет | Средний | **Есть** |
| 29* | `block_user/unblock_user` | PostgREST + RLS/trigger | Нет | Средний | **Есть** |
| 30* | `notification_preferences` user settings | INV PostgREST + RLS | Нет | Средний | **Нет** |
| 31* | `enqueue_push_notification` | Edge/Job, delivery with consent | Ограниченная worker-credential возможно; не в браузере | Высокий | **Нет** |
| 32* | `get_export_job_status` и подписанная ссылка | Route + Job + private Storage | Только изолированный worker при необходимости | Высокий | **Нет** |

`*` — **предложение** к отсутствующим в запросе пунктам 18–32; №17 известен частично.
«Есть» не значит «полностью соответствует новой спецификации».

**Не смешивать две модели чатов:**
- ЛС: `chats`, `chat_members`, `messages`. В `chat_members` сейчас только `chat_id,user_id`; личного `last_read_at` пока нет.
- Группы: `group_chats`, `group_members`, `group_messages`; **`group_members.last_read_at` есть**.
- Общий список ЛС и групп может иметь общее **API-представление**, но внутри должен корректно использовать **две разные модели членства**. Запрос `get_chat_list` №17 определён как единый список **личных** чатов с одним RPC; для групп есть `list_group_overviews`. Объединение в одном ответе потребует отдельной спецификации, единого ключа типа `chat_kind,chat_id`, сортировки и отдельной авторизации, а не фиктивной единой таблицы.

**Текущая позиция:** не добавлять ключ `service_role` в Next.js Route Handlers для «упрощения» RLS. Если для экспортного worker привилегированный ключ неизбежен, он живёт только в защищённой среде, получает минимальные операции, проверяет владельца job и аудит доступа; нельзя передавать его в `NEXT_PUBLIC_*`.

Следующее: согласовать недостающие пункты 17–32, тесты изоляции, затем безопасная аддитивная миграция — **не одновременно с массовой заменой клиента**.
