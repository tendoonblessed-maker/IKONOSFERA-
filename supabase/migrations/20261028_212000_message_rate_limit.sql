create table if not exists public.direct_message_rate_windows(
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null default now(),
 sent_count integer not null default 0
);
alter table public.direct_message_rate_windows enable row level security;
create or replace function public.limit_direct_message_rate()
returns trigger language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 if new.sender_id is distinct from auth.uid() then raise exception 'Invalid sender' using errcode='42501';end if;
 insert into public.direct_message_rate_windows(user_id,window_started_at,sent_count)
 values(new.sender_id,now(),1)
 on conflict(user_id) do update
 set window_started_at=case when public.direct_message_rate_windows.window_started_at<now()-interval '1 minute' then now() else public.direct_message_rate_windows.window_started_at end,
 sent_count=case when public.direct_message_rate_windows.window_started_at<now()-interval '1 minute' then 1 else public.direct_message_rate_windows.sent_count+1 end
 returning sent_count into total;
 if total>30 then raise exception 'Too many messages, try again in a minute' using errcode='P0001';end if;
 return new;
end;$$;
create trigger messages_limit_rate before insert on public.messages for each row execute function public.limit_direct_message_rate();