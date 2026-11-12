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
):void{
 const active=requests.get(messageId);
 if(!active||active.controller!==controller)return;
 clearTimer(active.timeoutId);
 requests.delete(messageId);
}
