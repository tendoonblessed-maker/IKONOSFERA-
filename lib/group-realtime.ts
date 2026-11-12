'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Realtime is an untrusted wake-up hint only. INSERT refreshes the latest page;
 * UPDATE/DELETE forward a validated ID for an authenticated, group-scoped RLS read.
 * Keep a separate socket only for the currently opened group.
 */
export function subscribeGroupChanges(token:string,groupId:string,onChanged:(messageId?:string)=>void):()=>void{
 if(!backendReady||!publishableKey||!token||!UUID.test(groupId)||typeof window==='undefined')return()=>{};
 const client=createClient(apiUrl,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let disposed=false;
 const channel=client.channel('group-db:'+groupId);
 const changed=(messageId?:unknown)=>{
  if(disposed)return;
  onChanged(typeof messageId==='string'&&UUID.test(messageId)?messageId:undefined);
 };
 const scope={schema:'public' as const,table:'group_messages',filter:'group_id=eq.'+groupId};
 void client.realtime.setAuth(token).then(()=>{
  if(disposed)return;
  channel
   .on('postgres_changes',{...scope,event:'INSERT'},()=>changed())
   // Message content from the WebSocket is never rendered or trusted.
   .on('postgres_changes',{...scope,event:'UPDATE'},payload=>changed(payload?.new?.id))
   // Postgres Changes cannot reliably filter DELETE by group_id. The old
   // payload may contain only the primary-key ID; use it solely as a hint.
   // The follow-up GET is scoped by both this group ID and the message ID,
   // and existing group-member RLS remains authoritative.
   .on('postgres_changes',{schema:'public',table:'group_messages',event:'DELETE'},payload=>{
    const oldGroupId=payload?.old?.group_id;
    if(typeof oldGroupId==='string'&&oldGroupId.toLowerCase()!==groupId.toLowerCase())return;
    changed(payload?.old?.id);
   })
   .subscribe(status=>{
    if(status==='SUBSCRIBED')changed(); // reconcile events missed during join
   });
 }).catch(()=>{/* The periodic HTTPS refresh remains active. */});
 return()=>{
  disposed=true;
  void client.removeChannel(channel)
   .finally(()=>{client.realtime.disconnect();})
   .catch(()=>{client.realtime.disconnect();});
 };
}
