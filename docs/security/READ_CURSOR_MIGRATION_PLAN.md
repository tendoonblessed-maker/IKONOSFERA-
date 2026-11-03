# Безопасный переход read_at → chat_members.last_read_at (только план)

**Не применять к production без отдельного утверждения.** Действующая схема:
- `public.messages.read_at timestamptz` — текущая отметка прочтения у **каждого сообщения**;
- `public.mark_chat_messages_read(chat_id)` — `SECURITY DEFINER`, проверяет участника и массово обновляет `messages.read_at`;
- `public.list_chat_previews()` — `SECURITY INVOKER`, unread считает по `m.read_at IS NULL`;
- `public.chat_members(chat_id,user_id)` — **пока нет** `last_read_at`, только SELECT для authenticated; клиенты не могут делать UPDATE;
- `public.group_members(group_id,user_id,joined_at,last_read_at)` — **уже работает на cursor**, не переносить данные групп в `chats`.

## Важный инвариант

`last_read_at` может представить только непрерывный префикс прочитанных сообщений, а
`read_at` позволяет «дыры» (раннее unread, позднее read). Безоговорочный `MAX(created_at)
WHERE read_at IS NOT NULL` **небезопасен**: он пометит непрочитанное до этой даты как прочитанное.
Идентичные `created_at` и сортировка по UUID требуют аккуратного пограничного сравнения.
Включать курсор на весь исторический массив до анализа дыр запрещено.

## Этап A — аддитивная схема без переключения поведения

В отдельной миграции на staging:

```sql
alter table public.chat_members
  add column if not exists last_read_at timestamptz;
-- Индекс (user_id, chat_id) уже есть: chat_members_user_id_idx.
-- Старое messages.read_at НЕ удаляем, default не меняем.
```

После этого `mark_chat_messages_read` и `list_chat_previews` продолжают работать **по старой схеме**.
Результаты старых клиентов не меняются.

## Этап B — консервативное обратное заполнение

Только в staging и после snapshot/backup. Пример бэкфилла **без ложного прочтения**:
если между началом и `MAX(read created_at)` встречаются более ранние непрочитанные *видимые*
чужие сообщения, оставляем курсор NULL до явного повторного открытия чата.

```sql
with candidates as (
 select cm.chat_id,cm.user_id,
   max(m.created_at) filter (where m.read_at is not null) as max_read
 from public.chat_members cm
 left join public.messages m
   on m.chat_id=cm.chat_id and m.sender_id<>cm.user_id
 group by cm.chat_id,cm.user_id
), trusted as (
 select x.*,
   case when x.max_read is null then null
     when exists (
       select 1 from public.messages u
       where u.chat_id=x.chat_id and u.sender_id<>x.user_id
         and u.created_at<=x.max_read
         and u.read_at is null
         and not u.deleted_for_everyone
         and not (x.user_id=any(u.deleted_for))
     ) then null
     else x.max_read
   end as safely_read_to
 from candidates x
)
update public.chat_members cm
set last_read_at=trusted.safely_read_to
from trusted
where cm.chat_id=trusted.chat_id and cm.user_id=trusted.user_id
  and cm.last_read_at is null and trusted.safely_read_to is not null;
```

Ограничение: курсор не отражает «дырявый» legacy unread; в dual-read режиме
старый счётчик остаётся источником истины. В старом `read_at` время чтения
может отличаться от `created_at` на произвольный интервал — НЕ копировать
`MAX(read_at)` как курсор сообщений.

## Этап C — два формата параллельно, без потери старых клиентов

1. Добавить **узкий серверный** `mark_chat_read_v2(p_chat_id,p_last_visible_message_id)`.
   Проверить `auth.uid()`, membership и видимость именно указанного сообщения
   (отсутствие `deleted_for`, `deleted_for_everyone`). Взять `created_at` из БД,
   а не принимать произвольное клиентское время.
2. Писать `chat_members.last_read_at=greatest(existing, message.created_at)`
   **только для своей строки**, с монотонным изменением. У текущего `chat_members` нет
   клиентских UPDATE GRANT; не выдавать произвольный UPDATE, позволяющий подделать
   время. Если не получается INVOKER+RLS без возможности подлога, выбрать узкий
   DEF с `SET search_path=''`, explicit UID/membership, минимальным EXECUTE и
   SQL-тестами на отсутствие доступа к чужим строкам.
3. В переходный период обе версии API поддерживаются: старый `mark_chat_messages_read`
   продолжает заполнять `read_at`, новый курсор заполняется совместно.
   Либо один новый серверный обработчик обновляет **оба** состояния транзакционно
   при полностью проверенном доступе, либо отдельные вызовы с мониторингом
   расхождений. Пока клиенты не обновлены, legacy unread рассчитывается
   строго по `read_at`.
4. Добавить `get_chat_list_v2` как **новый RPC** рядом с `list_active_chats` и
   `list_chat_previews`. Возвращать id/profile/preview/unread/pin/draft/прочтение
   **одним** запросом; сортировка и фильтр `hidden_for` как сейчас.
   Unread на переходе: legacy по `read_at` для ещё не мигрировавших диалогов;
   cursor для подтверждённых мигрировавших диалогов с признаком cursor-ready.
   Без этого флага нельзя незаметно пересчитывать старые чаты.
5. Счётчик в v2: сообщения `sender_id<>auth.uid()`, не удалённые, не скрытые
   персонально, дата сообщения строго **позже** корректного cursor.
   Не считать `now()` прочитанным временем, иначе будут ложные read receipts.
6. Вывод «прочитано» у отправителя: сравнивать `created_at` отправленного
   сообщения с курсором **второго** участника; на границе одинакового timestamp
   потребуется оговорённый tie-breaker (`id`) или дополнительный cursor ID.
   Это нельзя бездумно приравнять к `messages.read_at`.

## Этап D — тестирование, раскатка, откат

- SQL: A читает **только свою** `chat_members` cursor; B не может менять курсор A.
  Тестировать старую и новую схемы на нескольких чатах, включая пустые, скрытые,
  удалённые, медиа, одинаковые timestamps, граничные удаления и «дыры» `read_at`.
- Производительность: `EXPLAIN (ANALYZE, BUFFERS)` на **staging** с большим объёмом
  сообщений; проверить индексы `messages(chat_id,created_at DESC)` и
  `chat_members(user_id,chat_id)`. Индекс `messages_unread_by_chat` убрать
  *только после завершения cutover*, не на первой миграции.
- Раскатка: feature flag → небольшой процент тестовых аккаунтов → сравнение v1/v2
  непрочитанных и receipts → полный переход, метрики расхождений.
- **Быстрый rollback без DDL:** выключить flag и вернуть вызовы
  `list_chat_previews`/`mark_chat_messages_read`; продолжать оставлять старый
  `messages.read_at` доступным. Новый `chat_members.last_read_at` сохранить,
  не удалять в аварийном откате.
- Только после отдельного одобрения и истечения периода совместимости обсуждать
  удаление `messages.read_at`; до этого **ни единого DROP старого поля**.

**Риск данных:** во время работы старых и новых клиентов курсоры могут отличаться.
Не выбирать `last_read_at` единственным источником истины, пока не проверены
фоновое чтение, подписки Realtime и сценарии пользователей на нескольких устройствах.
