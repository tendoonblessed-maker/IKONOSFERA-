/**
 * Bound Realtime teardown on mobile/offline transitions.
 *
 * Each subscribe*Changes helper owns a dedicated Supabase client. Removing its
 * only channel is preferred, but a stalled leave request must not keep the
 * socket alive indefinitely after the UI has stopped using it.
 */
export const REALTIME_CHANNEL_REMOVE_TIMEOUT_MS = 1500;

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
