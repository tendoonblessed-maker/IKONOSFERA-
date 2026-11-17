/**
 * A Realtime subscription failure is a wake-up to reconcile over the
 * authenticated HTTP path. The periodic poll remains the durable fallback.
 */
export function shouldRefreshChatAfterRealtimeFailure(status:string):boolean{
 return status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED';
}

export const REALTIME_REFRESH_COALESCE_MS=250;
type RefreshTimer=unknown;
type RefreshSchedule=(callback:()=>void,delayMs:number)=>RefreshTimer;
type RefreshCancel=(timer:RefreshTimer)=>void;

const scheduleRefresh:RefreshSchedule=(callback,delayMs)=>setTimeout(callback,delayMs);
const cancelRefresh:RefreshCancel=timer=>clearTimeout(timer as ReturnType<typeof setTimeout>);

/**
 * Realtime can report several failures for one disconnect (for example
 * CHANNEL_ERROR followed by CLOSED). Refresh immediately once, then collapse
 * any burst during the short cooldown into one trailing authenticated read.
 * Disposal cancels that trailing wake-up when the chat is left.
 */
export function createRealtimeRefreshGate(
 onRefresh:()=>void,
 delayMs=REALTIME_REFRESH_COALESCE_MS,
 schedule:RefreshSchedule=scheduleRefresh,
 cancel:RefreshCancel=cancelRefresh
):{trigger:()=>void;dispose:()=>void}{
 let timer:RefreshTimer;
 let timerActive=false;
 let pending=false;
 let active=true;

 const trigger=()=>{
  if(!active)return;
  if(timerActive){pending=true;return;}
  timerActive=true;
  timer=schedule(()=>{
   timerActive=false;
   timer=undefined;
   if(!active||!pending)return;
   pending=false;
   trigger();
  },delayMs);
  onRefresh();
 };

 const dispose=()=>{
  active=false;
  pending=false;
  if(timerActive){
   cancel(timer);
   timerActive=false;
   timer=undefined;
  }
 };

 return {trigger,dispose};
}
