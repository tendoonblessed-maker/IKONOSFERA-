'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';
import {createRealtimeRefreshGate,shouldRefreshChatAfterRealtimeFailure} from './chat-realtime-status';

const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Realtime is a wake-up signal, not a trusted message transport.
 * The normal listMessages() request still enforces PostgREST SELECT RLS,
 * filters hidden/deleted messages, and is the single source of truth.
 *
 * A fresh, sessionless SDK client is created only for the selected direct
 * conversation. No secret/service-role key or chat bodies are broadcast.
 */
export function subscribeDirectChatChanges(
 token:string,
 chatId:string,
 onChanged:()=>void
):()=>void{
 if(!backendReady||!key||!token||!UUID.test(chatId)||typeof window==='undefined')return()=>{};

 const client=createClient(apiUrl,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 let stopped=false;
 const refreshGate=createRealtimeRefreshGate(onChanged);
 const changed=()=>{if(!stopped)refreshGate.trigger();};
 const channel=client.channel('direct-db:'+chatId);
 const scope={schema:'public' as const,table:'messages',filter:'chat_id=eq.'+chatId};

 // Must authorize the socket with the existing login JWT. The SDK does not
 // take ownership of the saved session or launch a second Auth refresh loop.
 void client.realtime.setAuth(token).then(()=>{
  if(stopped)return;
  channel
   .on('postgres_changes',{...scope,event:'INSERT'},changed)
   .on('postgres_changes',{...scope,event:'UPDATE'},changed)
   .subscribe(status=>{
    if(status==='SUBSCRIBED')changed(); // close join/read race and resubscribe gaps
    // Reconcile immediately over RLS-protected HTTP when the socket degrades;
    // bursty status transitions are coalesced by the per-subscription gate.
    if(shouldRefreshChatAfterRealtimeFailure(status))changed();
   });
 }).catch(()=>{
  // A 6-second HTTP polling fallback remains active; wake the authenticated
  // HTTP read immediately when the Realtime auth handshake fails.
  changed();
 });

 return()=>{
  stopped=true;
  refreshGate.dispose();
  void client.removeChannel(channel)
   .finally(()=>{client.realtime.disconnect();})
   .catch(()=>{client.realtime.disconnect();});
 };
}
