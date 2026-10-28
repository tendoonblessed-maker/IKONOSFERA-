-- Rename only automatically generated legacy usernames; preserve all chosen usernames.
do $$
declare p record; candidate text;
begin
 for p in select id from public.profiles where username ~ '^u_[a-f0-9]{20}$' order by created_at,id loop
   loop
     candidate := 'profile' || nextval('public.ikonosfera_profile_number_seq')::text;
     exit when not exists(select 1 from public.profiles where username=candidate);
   end loop;
   update public.profiles set username=candidate where id=p.id;
 end loop;
end;
$$;