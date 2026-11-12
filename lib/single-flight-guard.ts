/**
 * A synchronous single-flight guard for actions whose React disabled state
 * only takes effect after the next render.
 *
 * Locks are scoped to one account + conversation: a slow request in one chat
 * must not block reactions in another chat. A lease-specific release keeps
 * delayed cleanup from unlocking a newer action in the same scope.
 */
export type ChatActionScope = Readonly<{
  chatId:string;
  userId:string;
  generation:number;
}>;

type ChatActionIdentity = Pick<ChatActionScope,"chatId"|"userId">;

/** Stable, collision-safe key for one account and one conversation. */
export function chatActionScopeKey(scope:ChatActionIdentity):string{
 return JSON.stringify([scope.userId,scope.chatId]);
}

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
 const active=new Map<string,object>();
 return {
  acquire(scope:ChatActionIdentity):(()=>void)|null{
   const key=chatActionScopeKey(scope);
   if(active.has(key))return null;
   const lease={};
   active.set(key,lease);
   let released=false;
   return ()=>{
    if(released)return;
    released=true;
    if(active.get(key)===lease)active.delete(key);
   };
  }
 };
}
