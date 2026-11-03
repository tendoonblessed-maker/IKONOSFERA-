# IKONOSFERA · партия 0: проверяемый аудит Supabase (29.10.2026)

**Режим:** документация и `SELECT` в рабочей базе. **Никаких DDL/DML-миграций в production этой партией не выполнялось.**
Источники: реальные `pg_proc`, `pg_default_acl`, `pg_class`, `pg_policies`, `information_schema.role_table_grants`, `storage.buckets`, код GitHub.
**Ограничение входных требований:** подробный перечень пользователя обрывается на №17. Спецификация №18–32 — предложение, не исходный текст пользователя.

## Метрики и воспроизводимость

- `public`: **27** SQL routines; **18** `SECURITY DEFINER`, **13** из них имеют `EXECUTE` у `authenticated`; **все 27** задали `SET search_path = ''`.
- **21** публичная таблица и **8** системных таблиц `storage` имеют `relrowsecurity = true`; `FORCE RLS = false`. RLS не действует для владельцев и `BYPASSRLS` при обычных условиях; не делать вывод «все запросы безопасны».
- `pg_policies`: **53** политики (`public` + `storage`), из них **6** политик `storage.objects`.
- **Два бакета**: `ikonosfera-direct-media` — **private**, 25 MiB; `ikonosfera-media` — **public**, 25 MiB. Нельзя считать публичные аватары конфиденциальными.
- Предупреждения Supabase Advisor: **13 исполнимых authenticated SECURITY DEFINER**, разрешены Anonymous Sign-Ins; утечки паролей (Auth leaked-password protection) не активированы. Существуют RLS-enabled таблицы без политик (`direct_message_rate_windows`, намеренно закрыта на обычный SELECT).

Воспроизвести без изменения данных:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       p.prosecdef as security_definer, p.proconfig,
       has_function_privilege('anon',p.oid,'execute') as anon_exec,
       has_function_privilege('authenticated',p.oid,'execute') as authenticated_exec,
       has_function_privilege('public',p.oid,'execute') as public_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname;

select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
       has_table_privilege('anon',c.oid,'TRUNCATE') as anon_truncate,
       has_table_privilege('authenticated',c.oid,'TRUNCATE') as authenticated_truncate
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','storage') and c.relkind in ('r','p')
order by n.nspname,c.relname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage')
order by schemaname,tablename,policyname;
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
```

## Полный разбор 13 SECURITY DEFINER, которые может вызывать authenticated

В таблице «anonymous» — именно **временный пользователь Supabase Auth с `role=authenticated`**, а не роль `anon`. Для этих 13 функций **роль `anon` не имеет EXECUTE**.

| Функция | UID / доверие к аргументам | Проверка доступа | Динамический SQL / отдаваемые данные | Anonymous Sign-In / вывод |
|---|---|---|---|---|
| `channel_subscriber_counts(p_ids uuid[])` | `auth.uid() IS NOT NULL`; максимум 100 ID, но без проверки формата UUID на клиенте | Только авторизация; считает подписчиков любых каналов, допустимо для общедоступных каналов | Нет EXECUTE-динамики; отдаёт channel_id + subscribers | Anonymous получает общие счётчики. **Низкий/средний:** лимит частоты, нет утечки закрытых каналов лишь при публичной модели |
| `create_group_chat(p_title text,p_members uuid[])` | Проверка UID, длина имени 1–80, 1–49 уникальных участников, проверка существования профилей. **IDs выбирает вызывающий**, не проверяются контакты/согласие | Автор становится owner, присоединяет любого существующего пользователя | Нет; возвращает только UUID группы | **Высокий (спам/нежелательное добавление):** может создавать группы с любыми профилями, включая временные; нужны контакт/приглашение/rate limit |
| `edit_channel_post(p_post_id uuid,p_body text)` | Проверяет `author_id=auth.uid()`, длина до 4000 | Автор поста, не обязательно владелец канала; соответствует текущей модели, перепроверить продуктовую роль | Нет; `void` | Anonymous может редактировать только свои посты. **Низкий/средний**, авторство и права владельца сверить |
| `get_user_activity(p_user_ids uuid[])` | UID обязателен; максимум 100 IDs | Для `exact` отдаёт точный `last_seen_at`; для `approximate` — только диапазон/NULL. Не проверяет блокировки и отношения | Нет; таблица `user_id,status,last_seen_at` | Anonymous может делать массовые запросы 100 ID; **средний (privacy/enumeration)**, per-user rate limit. Сервер уже уважает `visibility` |
| `is_chat_member(the_chat uuid)` | UID внутри SQL; переданный ID не определяет авторизацию | Проверяет запись `chat_members(chat_id,user_id=auth.uid())` | Нет; BOOLEAN | Anonymous проверяет **своё** членство, не чужое; **низкий** |
| `is_group_member(p_group uuid)` | UID внутри SQL | Проверяет `group_members(group_id,user_id=auth.uid())` | Нет; BOOLEAN | Anonymous проверяет только своё членство; **низкий** |
| `manage_channel_comment(p_comment_id,p_action,p_body)` | **Не содержит явной проверки `auth.uid() IS NOT NULL`**. Выражения `auth.uid()<>author` при NULL дают NULL, а IF NULL не отказывает | Delete: автор или owner; edit: автор. Но **неявная проверка с NULL небезопасна** | Нет; `void` | **Высокий приоритет:** явный UID guard в начале и сравнения `IS DISTINCT FROM`, регрессионные тесты. Даже без прямого anon EXECUTE необходимо исключить вызовы authenticated с отсутствующим JWT UID |
| `manage_direct_chat(p_chat_id,p_action)` | `me:=auth.uid()`, явная проверка me и двух участников | Hide/delete_self/pin/unpin; **delete_everyone разрешено любому из двух участников**, удаляет чат каскадом для обоих | Нет; `void` | Anonymous с ролью authenticated может стирать общий чат, если он участник. **Высокий продуктовый риск**: подтверждение намерения, права и восстановление |
| `manage_direct_message(p_message_id,p_action,p_body)` | `me` и участник проверяются, edit/delete_everyone доступны автору; ограничение 48 часов | Hide для участника, edit/delete для автора | Нет; `void` | Anonymous получает те же права в своём чате. **Средний**: аудит `message_edit_history`, роли удаления, управление media |
| `mark_chat_messages_read(p_chat_id)` | Явный UID guard, сверяет `chats.user_a/user_b` | Массовый `UPDATE messages.read_at` у чужих сообщений в **своём** чате | Нет; возвращает число обновлённых строк | **Средний функциональный риск**: переход к одному курсору `chat_members.last_read_at`, но только по этапному плану |
| `reopen_direct_chat(p_chat_id)` | UID только в `WHERE` (неявно), если NULL — обновит 0 строк | Снимает свой UUID из `hidden_for` для одного из участников | Нет; `void` | **Низкий/средний**: явный guard и отказ вместо молчаливого no-op |
| `set_my_activity(p_visibility)` | UID обязателен; visibility только `exact`/`approximate` | Запись только `user_id=auth.uid()`, настройка приватности учитывается в `get_user_activity` | Нет; `void` | **Средний (нагрузка):** каждое обращение делает UPSERT `last_seen_at`; серверная пауза 30–60 с, Presence вместо БД для «онлайн» |
| `start_direct_chat(target_username)` | UID обязателен, ищет профиль по нормализованному username | Блокировки проверяет **в обе стороны**, уникальная пара пользователей, создаёт membership | Нет; возвращает только chat UUID | **Средний**: anonymous может создавать беседы с любыми публичными username. Лимитировать создание/перебор |

**Всем 13:** owner `postgres`, `prosecdef=true`, `proconfig=['search_path=""]`; SQL использует обычные запросы/проверки, **динамический `EXECUTE` отсутствует**; проверить `auth.uid()` без предположения, что `TO authenticated` исключает Supabase Anonymous Sign-Ins. Список — статический аудит исходников функций, не доказательство отсутствия runtime-bypass.

## Действительные GRANT и слабые места

**Четыре таблицы с чрезмерными табличными GRANT для `anon`**:
`channel_post_reactions`, `direct_message_rate_windows`, `message_edit_history`, `message_reactions`.
Им явно предоставлены `SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER`. Для `authenticated` у них тоже есть широкий набор GRANT.

**Важно:** `TRUNCATE` не проверяет RLS. Путь PostgREST не предоставляет пользователю прямой вызов `TRUNCATE`, но выдавать такое право внутренним таблицам опасно и избыточно. Отзыв табличных `anon` GRANT — приоритетный change request. Для authenticated нужно также независимо отозвать `TRUNCATE` и ненужные `TRIGGER/REFERENCES`, после проверки доступа приложений.

`validate_featured_profile_channel()` — **обычная trigger function (не SECURITY DEFINER)**, но имеет `EXECUTE` для **PUBLIC/anon/authenticated**. Прямой SQL `SELECT trigger_function()` не допустим по механике PostgreSQL, однако публичный EXECUTE избыточен; план отзыва есть отдельно.

**Default privileges** для **обоих** создателей `postgres` и `supabase_admin` в схеме `public` сейчас выдаёт `anon` широкие права на будущие TABLE/SEQUENCE и EXECUTE на FUNCTIONS. Одного `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` **недостаточно**. Примерное сокращение должно затронуть обоих создателей и разницу между GLOBAL (`PUBLIC` EXECUTE) и `IN SCHEMA public`, с отдельным rollback. **Ничего не применено** — см. `sql/drafts/security_privileges_up.sql` и `security_privileges_down.sql`.

## Storage: точные политики, а не фраза «файлы приватные»

| Bucket | Public? | Policy | Что разрешено |
|---|---|---|---|
| `ikonosfera-direct-media` | **false** | `dm media participants read` / SELECT | только `authenticated`, если UUID первой части пути — чат с `user_a` или `user_b` равным `auth.uid()` |
| `ikonosfera-direct-media` | false | `dm media sender upload` / INSERT | только `authenticated`, в пути вторая часть = `auth.uid()`, и пользователь участник чата |
| `ikonosfera-direct-media` | false | `dm media sender delete` / DELETE | только `authenticated`, вторая часть пути = `auth.uid()`; членство в SELECT-политике не проверяется для удаления, но путь должен принадлежать отправителю |
| `ikonosfera-media` | **true** | `ik_media_read` / SELECT | только `authenticated` через Storage RLS; **публичная раздача бакета доступна вне Storage RLS** |
| `ikonosfera-media` | true | `ik_media_upload` / INSERT | только `authenticated`, первая папка пути = `auth.uid()` |
| `ikonosfera-media` | true | `ik_media_delete` / DELETE | только `authenticated`, первая папка = `auth.uid()` |

**Риск:** в приватном бакете SELECT в `storage.objects` на стороне SQL ищет `chats.user_a/user_b`; проверить, что блокировки/удаление чата/отзыв доступа и подписанные URL соответствуют продуктовой модели. Signed URLs остаются действительными до своего TTL независимо от следующего запроса RLS.

## Запущенные RLS smoke-тесты

В `BEGIN READ ONLY` с `SET LOCAL ROLE authenticated` и тестовой подстановкой `request.jwt.claim.sub` на **существующего участника A**: **10 собственных чатов, 42 сообщения, 3 приватных файла**, количество чужих чатов/сообщений/правок/статусов/приватных файлов — **0**.

Для **другого участника B**: **1 собственный чат, 0 видимых сообщений и приватных файлов**, чужих сообщений/правок/статусов/файлов — **0**.

Для `SET LOCAL ROLE anon`: ноль видимых строк в `message_edit_history`, `message_reactions`, `channel_post_reactions`, `direct_message_rate_windows`, `storage.objects`.

**Это только чтение на выбранных участниках, не полноценный pentest.** SQL write-изоляция должна быть протестирована в отдельном dev/staging и откатана транзакцией. Подготовлен подробный файл `sql/tests/isolation_ab_anonymous.sql`; **в production его не запускали**.

## Решение перед партией 1

1. Пройти модульные и интеграционные тесты ролей `anon/authenticated`, Anonymous Sign-In и нулевого `auth.uid()` на staging.
2. Исправить NULL-guard в `manage_channel_comment`, ограничить право удаления обоих участников, ввести антиспам групп.
3. Отозвать GRANT и исключить будущие auto-GRANT в отдельном PR с точным rollback.
4. Подготовить cursor migration `read_at -> chat_members.last_read_at` **аддитивно**, но не переключать существующий клиент до воспроизводимого dual-read/dual-write тестирования.
5. Только после уточнения пунктов 17–32 и согласования механики миграции — партия 1.

