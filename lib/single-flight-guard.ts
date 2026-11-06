/**
 * A synchronous single-flight guard for actions whose React disabled state
 * only takes effect after the next render.
 *
 * The returned release function is idempotent and tied to its own lease, so a
 * delayed cleanup cannot unlock a newer action.
 */
export function createSingleFlightGuard(){
 let active:object|null=null;
 return {
  acquire():(()=>void)|null{
   if(active!==null)return null;
   const lease={};
   active=lease;
   let released=false;
   return ()=>{
    if(released)return;
    released=true;
    if(active===lease)active=null;
   };
  }
 };
}
