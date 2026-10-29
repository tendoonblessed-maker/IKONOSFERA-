'use client';

import {createClient} from '@supabase/supabase-js';
import {apiUrl,backendReady} from './supabase-rest';

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
 const channel=client.channel('direct-db:'+chatId);
 const changed=()=>{if(!stopped)onChanged();};
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
   });
 }).catch(()=>{/* A 6-second HTTP polling fallback remains active. */});

 return()=>{
  stopped=true;
  void client.removeChannel(channel)
   .finally(()=>{client.realtime.disconnect();})
   .catch(()=>{client.realtime.disconnect();});
 };
}
