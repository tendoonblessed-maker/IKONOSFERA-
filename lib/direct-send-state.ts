/**
 * React-visible busy state for direct sends, scoped to account + chat.
 * The send gate remains the synchronous source of truth; this set only
 * drives controls and status for the currently rendered conversation.
 */
export type DirectSendBusyKeys = ReadonlySet<string>;

export function directSendBusyKey(ownerId:string,chatId:string):string|null{
 if(typeof ownerId!=='string'||ownerId.trim().length===0
   ||typeof chatId!=='string'||chatId.trim().length===0)return null;
 return JSON.stringify([ownerId,chatId]);
}

export function isDirectSendBusy(keys:DirectSendBusyKeys,ownerId:string,chatId:string):boolean{
 const key=directSendBusyKey(ownerId,chatId);
 return key!==null&&keys.has(key);
}

export function updateDirectSendBusyKeys(
 current:DirectSendBusyKeys,ownerId:string,chatId:string,busy:boolean
):DirectSendBusyKeys{
 const key=directSendBusyKey(ownerId,chatId);
 if(key===null||current.has(key)===busy)return current;
 const next=new Set(current);
 if(busy)next.add(key);
 else next.delete(key);
 return next;
}
