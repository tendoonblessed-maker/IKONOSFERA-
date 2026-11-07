/**
 * A synchronous single-flight guard for actions whose React disabled state
 * only takes effect after the next render.
 *
 * The returned release function is idempotent and tied to its own lease, so a
 * delayed cleanup cannot unlock a newer action.
 */
export type ChatActionScope = Readonly<{
  chatId:string;
  userId:string;
  generation:number;
}>;

/** Reject a late action result after the account or conversation context changes. */
export function isCurrentChatActionScope(
 action:ChatActionScope,
 current:Readonly<{chatId:string|null;userId:string;generation:number}>
):boolean{
 return action.chatId===current.chatId
  &&action.userId===current.userId
  &&action.generation===current.generation;
}

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
