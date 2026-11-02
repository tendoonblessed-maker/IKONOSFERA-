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

/** Count only newly arrived OTHER-user messages *below* the previously
 * visible newest row. Prepending older history must never inflate the
 * "new messages" badge while someone is scrolling through old messages.
 * If the refreshed page has no overlap, we cannot reliably identify which
 * rows are new, so avoid claiming that all of them just arrived.
 */
export function countNewIncomingBelow(
 latest:GroupMessage[],
 previousIds:Set<string>,
 readerId:string,
 atBottom:boolean
):number{
 if(atBottom||previousIds.size===0)return 0;
 let newestKnownIndex=-1;
 for(let index=latest.length-1;index>=0;index--){
  if(previousIds.has(latest[index].id)){
   newestKnownIndex=index;
   break;
  }
 }
 if(newestKnownIndex<0)return 0;
 let count=0;
 for(let index=newestKnownIndex+1;index<latest.length;index++){
  const message=latest[index];
  if(!previousIds.has(message.id)&&message.sender_id!==readerId)count++;
 }
 return count;
}
