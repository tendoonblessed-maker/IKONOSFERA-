/**
 * Synchronous gate for direct-message reaction mutations.
 * React state updates are asynchronous; this closes the double-tap window
 * before the disabled UI state has rendered.
 */
export function createMessageReactionSingleFlightGate(){
 let active=false;
 return {
  acquire(){
   if(active)return false;
   active=true;
   return true;
  },
  release(){
   if(!active)return false;
   active=false;
   return true;
  }
 };
}
