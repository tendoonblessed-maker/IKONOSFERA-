/** Only override browser Find while a private conversation is visible.
 * Never steal Ctrl/Cmd+F from the sign-in page, groups or channels.
 */
type FindKey={
  key:string;
  ctrlKey:boolean;
  metaKey:boolean;
  altKey:boolean;
  shiftKey:boolean;
};
export function shouldOpenDirectChatSearch(event:FindKey,directChatVisible:boolean):boolean{
  return directChatVisible
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='f';
}

/** Return focus to the still-mounted chat search action after an explicit close.
 * Never focus a stale trigger after the user switches chats or signs out. */
export function focusDirectSearchTrigger(trigger:Pick<HTMLButtonElement,'isConnected'|'focus'>|null):boolean{
  if(!trigger?.isConnected)return false;
  trigger.focus({preventScroll:true});
  return true;
}
