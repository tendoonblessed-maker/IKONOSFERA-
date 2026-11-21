/**
 * Prevent two send paths from racing for the same signed-in chat.
 *
 * The lock is intentionally in-memory and scoped by owner + chat. It only
 * serializes concurrent UI submissions; it is not a replacement for
 * server-side idempotency after an ambiguous network response.
 */
export type DirectSendLease = symbol;

export function createDirectSendGate(){
 const active=new Map<string,DirectSendLease>();
 const key=(ownerId:string,chatId:string)=>JSON.stringify([ownerId,chatId]);
 const valid=(ownerId:string,chatId:string)=>
  typeof ownerId==='string'&&ownerId.trim().length>0
  &&typeof chatId==='string'&&chatId.trim().length>0;
 return {
  tryAcquire(ownerId:string,chatId:string):DirectSendLease|null{
   if(!valid(ownerId,chatId))return null;
   const id=key(ownerId,chatId);
   if(active.has(id))return null;
   const lease=Symbol('direct-send');
   active.set(id,lease);
   return lease;
  },
  release(ownerId:string,chatId:string,lease:DirectSendLease):boolean{
   if(!valid(ownerId,chatId)||typeof lease!=='symbol')return false;
   const id=key(ownerId,chatId);
   if(active.get(id)!==lease)return false;
   active.delete(id);
   return true;
  },
  isInFlight(ownerId:string,chatId:string):boolean{
   return valid(ownerId,chatId)&&active.has(key(ownerId,chatId));
  }
 };
}
