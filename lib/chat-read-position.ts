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

export function shouldAcknowledgeDirectChatRead(
 hasUnreadIncoming:boolean,
 atLatest:boolean,
 visible:boolean
):boolean{
 return hasUnreadIncoming&&atLatest&&visible;
}
