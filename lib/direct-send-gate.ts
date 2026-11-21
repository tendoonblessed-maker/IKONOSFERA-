/**
 * Prevent two send paths from racing for the same signed-in chat.
 *
 * The lock is intentionally in-memory and scoped by owner + chat. It only
 * serializes concurrent UI submissions; it is not a replacement for
 * server-side idempotency after an ambiguous network response.
 */
export function createDirectSendGate(){
 const active=new Set<string>();
 const key=(ownerId:string,chatId:string)=>JSON.stringify([ownerId,chatId]);
 const valid=(ownerId:string,chatId:string)=>
  typeof ownerId==='string'&&ownerId.trim().length>0
  &&typeof chatId==='string'&&chatId.trim().length>0;
 return {
  tryAcquire(ownerId:string,chatId:string):boolean{
   if(!valid(ownerId,chatId))return false;
   const id=key(ownerId,chatId);
   if(active.has(id))return false;
   active.add(id);
   return true;
  },
  release(ownerId:string,chatId:string):void{
   if(!valid(ownerId,chatId))return;
   active.delete(key(ownerId,chatId));
  },
  isInFlight(ownerId:string,chatId:string):boolean{
   return valid(ownerId,chatId)&&active.has(key(ownerId,chatId));
  }
 };
}
