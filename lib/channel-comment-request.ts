const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Fail closed when a comment read no longer belongs to the visible context. */
export function isLatestChannelCommentRequest(
 requestId:number,latestRequestId:number,
 requestOwnerId:string,activeOwnerId:string,
 requestChannelId:string,activeChannelId:string,
 requestPostId:string,activePostId:string|null
):boolean{
 return Number.isSafeInteger(requestId)&&requestId>0&&requestId===latestRequestId
  &&UUID.test(requestOwnerId)&&UUID.test(activeOwnerId)&&requestOwnerId.toLowerCase()===activeOwnerId.toLowerCase()
  &&UUID.test(requestChannelId)&&UUID.test(activeChannelId)&&requestChannelId.toLowerCase()===activeChannelId.toLowerCase()
  &&UUID.test(requestPostId)&&typeof activePostId==='string'&&UUID.test(activePostId)&&requestPostId.toLowerCase()===activePostId.toLowerCase();
}

/** Synchronous single-flight gate for channel send actions. */
export function createChannelSendGate(){
 let active:symbol|null=null;
 return {
  acquire():symbol|null{if(active)return null;const lease=Symbol('channel-send');active=lease;return lease;},
  release(lease:symbol):boolean{if(active!==lease)return false;active=null;return true;}
 };
}
