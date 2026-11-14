import type {GroupMessage} from './groups';

/**
 * Reconcile one already-loaded row with an authenticated server read.
 * Keep its current slot so an UPDATE cannot move the reader's scroll anchor.
 * A null row means the scoped read no longer exposes that message.
 */
export function reconcileLoadedGroupMessage(
 current:GroupMessage[],
 groupId:string,
 messageId:string,
 updated:GroupMessage|null
):GroupMessage[]{
 const normalizedGroupId=groupId.toLowerCase();
 const normalizedMessageId=messageId.toLowerCase();
 const index=current.findIndex(message=>
  message.group_id.toLowerCase()===normalizedGroupId
  &&message.id.toLowerCase()===normalizedMessageId
 );
 if(index<0)return current;
 if(updated&&(
  updated.group_id.toLowerCase()!==normalizedGroupId
  ||updated.id.toLowerCase()!==normalizedMessageId
 ))return current;
 const next=current.slice();
 if(updated)next[index]=updated;
 else next.splice(index,1);
 return next;
}


export type GroupMessageReadRequest={controller:AbortController;timeoutId:number};

/** Abort active per-message reads when a group view pauses, retaining IDs for resume. */
export function abortGroupMessageReads(
 requests:Map<string,GroupMessageReadRequest>,
 pending:Set<string>,
 clearTimer:(timeoutId:number)=>void=(timeoutId)=>clearTimeout(timeoutId)
):void{
 for(const [id,request] of requests){
  pending.add(id);
  clearTimer(request.timeoutId);
  request.controller.abort();
 }
}

/** A stale completion must not remove a newer read for the same message ID. */
export function finishGroupMessageRead(
 requests:Map<string,GroupMessageReadRequest>,
 messageId:string,
 controller:AbortController,
 clearTimer:(timeoutId:number)=>void=(timeoutId)=>clearTimeout(timeoutId)
):boolean{
 const active=requests.get(messageId);
 if(!active||active.controller!==controller)return false;
 clearTimer(active.timeoutId);
 requests.delete(messageId);
 return true;
}

/**
 * Remove only candidate rows that a bounded, group-scoped RLS read no longer
 * returns. Rows outside the checked viewport and other groups are untouched.
 */
const GROUP_MESSAGE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function normalizeGroupMessageUuid(value:unknown):string|null{
 return typeof value==='string'&&GROUP_MESSAGE_UUID.test(value)?value.toLowerCase():null;
}
export function removeMissingGroupMessages(
 current:GroupMessage[],
 groupId:string,
 candidateIds:string[],
 existingIds:string[]
):GroupMessage[]{
 const normalizedGroupId=normalizeGroupMessageUuid(groupId);
 if(!normalizedGroupId||!Array.isArray(current)||!Array.isArray(candidateIds)||!Array.isArray(existingIds))return current;
 const normalizedCandidates=candidateIds.map(normalizeGroupMessageUuid);
 const normalizedExisting=existingIds.map(normalizeGroupMessageUuid);
 // This helper can remove UI rows, so malformed evidence must fail closed:
 // keep the complete snapshot rather than partially reconciling uncertain IDs.
 if(normalizedCandidates.some(id=>id===null)||normalizedExisting.some(id=>id===null))return current;
 const candidates=new Set(normalizedCandidates as string[]);
 const existing=new Set(normalizedExisting as string[]);
 if(Array.from(existing).some(id=>!candidates.has(id)))return current;
 const identities=current.map(message=>{
  if(!message)return null;
  const id=normalizeGroupMessageUuid(message.id);
  const messageGroupId=normalizeGroupMessageUuid(message.group_id);
  return id&&messageGroupId?{id,groupId:messageGroupId}:null;
 });
 if(identities.some(identity=>identity===null))return current;
 let changed=false;
 const next=current.filter((_,index)=>{
  const identity=identities[index];
  if(!identity||identity.groupId!==normalizedGroupId
     ||!candidates.has(identity.id)||existing.has(identity.id))return true;
  changed=true;
  return false;
 });
 return changed?next:current;
}


/** Compare visible group-message IDs as a set; DOM reordering alone is not a new page. */
export function sameVisibleGroupMessageIds(
 previous:readonly string[]|null,
 next:readonly string[]
):boolean{
 if(!previous||previous.length!==next.length)return false;
 const ids=new Set(previous.map(id=>id.toLowerCase()));
 return ids.size===next.length&&next.every(id=>ids.has(id.toLowerCase()));
}

/** Queue one fresh RLS snapshot when the reader moves to another visible group page. */
export function shouldQueueGroupHistoryReconcile(
 inFlightIds:readonly string[]|null,
 nextIds:readonly string[],
 force=false
):boolean{
 if(!nextIds.length)return false;
 return force||!sameVisibleGroupMessageIds(inFlightIds,nextIds);
}
