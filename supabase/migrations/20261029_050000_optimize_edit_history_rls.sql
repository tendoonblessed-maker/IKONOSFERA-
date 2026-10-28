-- Avoid evaluating auth.uid() separately for every audit-log row.
-- The ownership condition remains unchanged.
alter policy message_edit_history_read_own on public.message_edit_history
 using(editor_id=(select auth.uid()));
