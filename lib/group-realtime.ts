'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Live updates are untrusted wake-up hints only. Callers re-read rows through
 * authenticated PostgREST + group-member RLS; UPDATE forwards only a validated ID.
 * Keep a separate socket only for the currently opened group.
 */
export function subscribeGroupChanges(token:string,groupId:string,onChanged:(messageId?:string)=>void):()=>void{
 if(!backendReady||!publishableKey||!token||!UUID.test(groupId)||typeof window==='undefined')return()=>{};
 const client=createClient(apiUrl,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let disposed=false;
 const channel=client.channel('group-db:'+groupId);
 const changed=(messageId?:string)=>{if(!disposed)onChanged(messageId);};
 const scope={schema:'public' as const,table:'group_messages',filter:'group_id=eq.'+groupId};
 void client.realtime.setAuth(token).then(()=>{
  if(disposed)return;
  channel
   .on('postgres_changes',{...scope,event:'INSERT'},()=>changed())
   // Forward only a validated row ID. Message content from the socket is never used.
   .on('postgres_changes',{...scope,event:'UPDATE'},payload=>{
    const id=payload?.new?.id;
    changed(typeof id==='string'&&UUID.test(id)?id:undefined);
   })
   // DELETE is left to the bounded HTTPS poll: Postgres Changes cannot
   // reliably filter DELETE by the non-primary-key group_id column here.
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
