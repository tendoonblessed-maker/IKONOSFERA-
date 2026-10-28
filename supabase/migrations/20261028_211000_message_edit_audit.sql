create table if not exists public.message_edit_history(
 id bigint generated always as identity primary key,
 message_id uuid not null references public.messages(id) on delete cascade,
 editor_id uuid not null references auth.users(id) on delete cascade,
 previous_body text not null,
 edited_at timestamptz not null default now()
);
alter table public.message_edit_history enable row level security;
create policy message_edit_history_read_own on public.message_edit_history for select to authenticated using(editor_id=auth.uid());
create or replace function public.record_message_edit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.body is distinct from new.body and new.edited_at is not null and not new.deleted_for_everyone then
  insert into public.message_edit_history(message_id,editor_id,previous_body) values(old.id,new.sender_id,old.body);
 end if;
 return new;
end;$$;
create trigger messages_track_edits after update of body on public.messages for each row execute function public.record_message_edit();

create or replace function public.manage_direct_message(p_message_id uuid,p_action text,p_body text default null)
returns void language plpgsql security definer set search_path='' as $$
declare m public.messages%rowtype; c public.chats%rowtype; me uuid:=auth.uid();
begin
 select * into m from public.messages where id=p_message_id for update;
 if not found then raise exception 'Message not found'; end if;
 select * into c from public.chats where id=m.chat_id;
 if me is null or (me<>c.user_a and me<>c.user_b) then raise exception 'Not a participant'; end if;
 if p_action='hide' then
  update public.messages set deleted_for=array_append(deleted_for,me) where id=p_message_id and not(me=any(deleted_for));
 elsif p_action='delete_everyone' then
  if m.sender_id<>me then raise exception 'Only sender can delete for everyone'; end if;
  if m.created_at<now()-interval '48 hours' then raise exception 'Deletion is limited to 48 hours';end if;
  update public.messages set deleted_for_everyone=true,body='',media_path=null,media_type=null where id=p_message_id and not deleted_for_everyone;
 elsif p_action='edit' then
  if m.sender_id<>me or m.deleted_for_everyone then raise exception 'Only sender can edit'; end if;
  if m.created_at<now()-interval '48 hours' then raise exception 'Editing is limited to 48 hours';end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>4000 then raise exception 'Invalid message'; end if;
  update public.messages set body=trim(p_body),edited_at=now() where id=p_message_id and not deleted_for_everyone;
 else raise exception 'Unknown action'; end if;
end;$$;