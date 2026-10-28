-- Deleting a conversation for yourself does not block future messages.
-- A fresh direct message reopens the conversation while the previously
-- deleted messages remain hidden for that user in messages.deleted_for.
create or replace function public.reopen_chat_after_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.chats c
     set hidden_for = array_remove(array_remove(c.hidden_for,c.user_a),c.user_b)
   where c.id = new.chat_id and cardinality(c.hidden_for) > 0;
  return new;
end;
$$;
revoke all on function public.reopen_chat_after_new_message() from public,anon,authenticated;
drop trigger if exists reopen_chat_after_new_message on public.messages;
create trigger reopen_chat_after_new_message after insert on public.messages
 for each row execute function public.reopen_chat_after_new_message();
