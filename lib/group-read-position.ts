import type {GroupMessage} from './groups';

/**
 * Reading group history must not acknowledge new incoming messages that
 * aren't on screen. A successful read must represent the last visible page.
 */
export function shouldAcknowledgeGroupRead(
 latestId:string|null,
 lastAcknowledgedId:string|null,
 atBottom:boolean,
 visible:boolean
):boolean{
 return Boolean(latestId&&latestId!==lastAcknowledgedId&&atBottom&&visible);
}

/** Return only newly observed messages written by someone other than the reader. */
export function getNewIncomingGroupMessages(
 latest:GroupMessage[],
 previousIds:ReadonlySet<string>,
 readerId:string
):GroupMessage[]{
 return latest.filter(message=>!previousIds.has(message.id)&&message.sender_id!==readerId);
}

/** Count newly arrived OTHER-user messages only while reading older history. */
export function countNewIncomingBelow(
 latest:GroupMessage[],
 previousIds:Set<string>,
 readerId:string,
 atBottom:boolean
):number{
 if(atBottom||previousIds.size===0)return 0;
 return latest.reduce((n,m)=>n+(!previousIds.has(m.id)&&m.sender_id!==readerId?1:0),0);
}
