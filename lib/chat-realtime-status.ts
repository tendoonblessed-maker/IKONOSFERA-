/**
 * A Realtime subscription failure is a wake-up to reconcile over the
 * authenticated HTTP path. The periodic poll remains the durable fallback.
 */
export function shouldRefreshChatAfterRealtimeFailure(status:string):boolean{
 return status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED';
}
