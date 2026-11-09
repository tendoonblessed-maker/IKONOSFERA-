/**
 * Bound Realtime teardown on mobile/offline transitions.
 *
 * Each subscribe*Changes helper owns a dedicated Supabase client. Removing its
 * only channel is preferred, but a stalled leave request must not keep the
 * socket alive indefinitely after the UI has stopped using it.
 */
export const REALTIME_CHANNEL_REMOVE_TIMEOUT_MS = 1500;
export const REALTIME_AUTH_TIMEOUT_MS = 10000;

export function authorizeRealtimeWithDeadline(
 authorize:()=>Promise<unknown>,
 onAuthorized:()=>void,
 onFailure:()=>void,
 timeoutMs=REALTIME_AUTH_TIMEOUT_MS
):()=>void{
 let finished=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const clearTimer=()=>{
  if(timer!==undefined){
   clearTimeout(timer);
   timer=undefined;
  }
 };
 const fail=()=>{
  if(finished)return;
  finished=true;
  clearTimer();
  try{onFailure();}catch{/* Disposal is best-effort. */}
 };
 const succeed=()=>{
  if(finished)return;
  finished=true;
  clearTimer();
  try{onAuthorized();}catch{
   try{onFailure();}catch{/* Disposal is best-effort. */}
  }
 };

 timer=setTimeout(fail,Math.max(0,timeoutMs));
 try{
  void Promise.resolve(authorize()).then(succeed,fail);
 }catch{
  fail();
 }

 // Calling cancel when a chat/account is disposed clears the watchdog and
 // prevents a late setAuth resolution from starting a stale subscription.
 return()=>{
  if(finished)return;
  finished=true;
  clearTimer();
 };
}

export function removeRealtimeChannelWithDeadline(
 removeChannel:()=>Promise<unknown>,
 disconnect:()=>void,
 timeoutMs=REALTIME_CHANNEL_REMOVE_TIMEOUT_MS
):void{
 let closed=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const close=()=>{
  if(closed)return;
  closed=true;
  if(timer!==undefined)clearTimeout(timer);
  try{disconnect();}catch{/* Socket teardown is best-effort. */}
 };
 timer=setTimeout(close,Math.max(0,timeoutMs));
 try{
  void Promise.resolve(removeChannel()).then(close,close);
 }catch{
  close();
 }
}
