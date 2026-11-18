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

/** A staged read may commit only if no newer poll or Realtime hint arrived. */
export function isGroupReadSnapshotCurrent(snapshotRevision:number,currentRevision:number):boolean{
 return Number.isSafeInteger(snapshotRevision)&&snapshotRevision>=0
  &&Number.isSafeInteger(currentRevision)&&currentRevision>=0
  &&snapshotRevision===currentRevision;
}

/** Reject zero-sized/invalid viewports; tolerate small iOS scroll bounce. */
export function isGroupAtLatest(
 scrollHeight:number,
 scrollTop:number,
 clientHeight:number,
 threshold=120
):boolean{
 if(![scrollHeight,scrollTop,clientHeight,threshold].every(Number.isFinite)
  ||scrollHeight<0||clientHeight<=0||threshold<0)return false;
 return Math.max(0,scrollHeight-scrollTop-clientHeight)<threshold;
}

type GroupReadCandidate=Pick<GroupMessage,'id'|'sender_id'>;

/** Return unique incoming IDs from the fetched page; own and malformed rows cannot trigger a read. */
export function getIncomingGroupMessageIds(
 messages:readonly GroupReadCandidate[],
 readerId:string
):string[]{
 if(!readerId)return [];
 const seen=new Set<string>();
 const ids:string[]=[];
 for(const message of messages){
  if(typeof message.id!=='string'||!message.id.trim()
   ||typeof message.sender_id!=='string'||message.sender_id===readerId
   ||seen.has(message.id))continue;
  seen.add(message.id);
  ids.push(message.id);
 }
 return ids;
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
