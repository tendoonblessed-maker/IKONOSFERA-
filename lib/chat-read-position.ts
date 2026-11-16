/**
 * A direct-chat read receipt advances the server cursor for the conversation,
 * so only acknowledge it after the newest page has been committed and is still
 * the visible viewport.
 */
export function isDirectChatAtLatest(
 scrollHeight:number,
 scrollTop:number,
 clientHeight:number,
 threshold=120
):boolean{
 if(![scrollHeight,scrollTop,clientHeight,threshold].every(Number.isFinite)||clientHeight<=0||threshold<0)return false;
 return scrollHeight-scrollTop-clientHeight<threshold;
}

export function isDirectChatReadSnapshotCurrent(snapshotRevision:number,currentRevision:number):boolean{
 return Number.isSafeInteger(snapshotRevision)&&snapshotRevision>=0
  &&Number.isSafeInteger(currentRevision)&&currentRevision>=0
  &&snapshotRevision===currentRevision;
}

export function shouldAcknowledgeDirectChatRead(
 hasUnreadIncoming:boolean,
 atLatest:boolean,
 visible:boolean
):boolean{
 return hasUnreadIncoming&&atLatest&&visible;
}


type DirectReadCandidate={
 id:string;
 sender_id:string;
 read_at:string|null;
 deleted_for?:string[];
};

/** Only visible incoming unread rows should block/trigger a broad chat read. */
export function getVisibleUnreadIncomingDirectMessageIds(
 messages:readonly DirectReadCandidate[],
 readerId:string
):string[]{
 if(!readerId)return [];
 return messages
  .filter(message=>message.sender_id!==readerId
   &&!message.read_at
   &&!message.deleted_for?.includes(readerId))
  .map(message=>message.id);
}
