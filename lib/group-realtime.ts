'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Live updates are untrusted wake-up hints only; groupMessages() re-reads
 * authoritative rows through authenticated PostgREST + group-member RLS.
 * Keep a separate socket only for the currently opened group.
 */
export function subscribeGroupChanges(token:string,groupId:string,onChanged:()=>void):()=>void{
 if(!backendReady||!publishableKey||!token||!UUID.test(groupId)||typeof window==='undefined')return()=>{};
 const client=createClient(apiUrl,publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let disposed=false;
 const channel=client.channel('group-db:'+groupId);
 const changed=()=>{if(!disposed)onChanged();};
 const scope={schema:'public' as const,table:'group_messages',filter:'group_id=eq.'+groupId};
 void client.realtime.setAuth(token).then(()=>{
  if(disposed)return;
  channel
   .on('postgres_changes',{...scope,event:'INSERT'},changed)
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
