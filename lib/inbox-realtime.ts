'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type InboxChangeKind='direct'|'group';

/**
 * Global inbox notifications are *wake-up hints*, not message content.
 * PostgreSQL SELECT RLS filters both tables to conversations the current
 * authenticated user belongs to. The UI fetches previews/unread totals via
 * the existing authoritative HTTPS RPCs after each event.
 *
 * Only subscribe while signed in. No secret key, persistent auth session,
 * WebSocket payload rendering, or background notification permission.
 *
 * DELETE events are deliberately excluded: Supabase Realtime does not apply
 * RLS to DELETE, so even an ignored callback could reveal deletion activity
 * from unrelated conversations. The existing RLS-backed HTTP polling path
 * reconciles deletions without exposing those events.
 */
export function subscribeInboxChanges(
 token:string,
 userId:string,
 onChanged:(kind:InboxChangeKind)=>void
):()=>void{
 if(!backendReady||!publishableKey||!token||!UUID.test(userId)||typeof window==='undefined')return()=>{};
 const client=createClient(apiUrl,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let disposed=false;
 const channel=client.channel('inbox-db:'+userId);
 const direct=()=>{if(!disposed)onChanged('direct');};
 const group=()=>{if(!disposed)onChanged('group');};

 void client.realtime.setAuth(token).then(()=>{
  if(disposed)return;
  // Keep this explicit INSERT/UPDATE allowlist; never use event:'*' here.
  channel
   .on('postgres_changes',{schema:'public',table:'messages',event:'INSERT'},direct)
   .on('postgres_changes',{schema:'public',table:'messages',event:'UPDATE'},direct)
   .on('postgres_changes',{schema:'public',table:'group_messages',event:'INSERT'},group)
   // Editing the latest group message changes its inbox preview too. Treat
   // UPDATE as a wake-up hint and re-read the RLS-scoped overview over HTTPS.
   .on('postgres_changes',{schema:'public',table:'group_messages',event:'UPDATE'},group)
   .subscribe(status=>{
    // A reconnect can miss inserts while offline: resynchronize both lists.
    if(status==='SUBSCRIBED'){direct();group();}
   });
 }).catch(()=>{/* Periodic inbox polling continues without Realtime. */});

 return()=>{
  disposed=true;
  void client.removeChannel(channel)
   .finally(()=>{client.realtime.disconnect();})
   .catch(()=>{client.realtime.disconnect();});
 };
}
