'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';
import {createRealtimeRefreshGate,shouldRefreshChatAfterRealtimeFailure,startRealtimeAuthHandshake} from './chat-realtime-status';

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
 const refreshGate=createRealtimeRefreshGate(onChanged);
 const changed=()=>{if(!disposed)refreshGate.trigger();};
 const channel=client.channel('group-db:'+groupId);
 const scope={schema:'public' as const,table:'group_messages',filter:'group_id=eq.'+groupId};
 startRealtimeAuthHandshake(
  ()=>client.realtime.setAuth(token),
  ()=>{
   if(disposed)return;
   channel
    .on('postgres_changes',{...scope,event:'INSERT'},changed)
    .subscribe(status=>{
     if(status==='SUBSCRIBED')changed(); // reconcile events missed during join
     // A socket error/timeout/close must wake the authenticated HTTP refresh;
     // repeated status transitions are coalesced by the per-subscription gate.
     if(shouldRefreshChatAfterRealtimeFailure(status))changed();
    });
  },
  // The periodic HTTPS refresh remains active; wake it immediately on auth failure.
  changed
 );
 return()=>{
  disposed=true;
  refreshGate.dispose();
  void client.removeChannel(channel)
   .finally(()=>{client.realtime.disconnect();})
   .catch(()=>{client.realtime.disconnect();});
 };
}
