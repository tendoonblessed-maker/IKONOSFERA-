/**
 * A direct-chat read receipt advances the server cursor for the conversation,
 * so only acknowledge it while the newest page is visible to the reader.
 *
 * Evaluate this after the history GET completes: the reader may have scrolled
 * into older messages or backgrounded the tab while that request was pending.
 */
export function shouldAcknowledgeDirectChatRead(
 hasUnreadIncoming:boolean,
 atLatest:boolean,
 visible:boolean
):boolean{
 return hasUnreadIncoming&&atLatest&&visible;
}
