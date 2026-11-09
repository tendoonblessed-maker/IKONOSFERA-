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

/** Count newly arrived OTHER-user messages only while reading older history. */
export function countNewIncomingBelow(
 latest:GroupMessage[],
 previousIds:Set<string>,
 readerId:string,
 atBottom:boolean
):number{
 if(atBottom||previousIds.size===0)return 0;
 const counted=new Set<string>();
 return latest.reduce((n,m)=>{
  if(!m.id||previousIds.has(m.id)||m.sender_id===readerId||counted.has(m.id))return n;
  counted.add(m.id);
  return n+1;
 },0);
}
