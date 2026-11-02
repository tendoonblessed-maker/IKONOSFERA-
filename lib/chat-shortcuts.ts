/** Only override browser Find while a private conversation is visible.
 * Never steal Ctrl/Cmd+F from the sign-in page, groups or channels.
 */
type CompositionKey={
  key:string;
  isComposing?:boolean;
  keyCode?:number;
};
type FindKey=CompositionKey&{
  ctrlKey:boolean;
  metaKey:boolean;
  altKey:boolean;
  shiftKey:boolean;
};
/** Safari and some mobile keyboards report keyCode 229 during IME input. */
function isImeKey(event:CompositionKey):boolean{
  return event.isComposing===true||event.keyCode===229;
}
export function shouldOpenDirectChatSearch(event:FindKey,directChatVisible:boolean):boolean{
  return directChatVisible
    && !isImeKey(event)
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='f';
}
/** Escape confirms IME composition before it should close the search UI. */
export function shouldCloseDirectChatSearch(event:CompositionKey):boolean{
  return event.key==='Escape'&&!isImeKey(event);
}

/** Return focus to the still-mounted chat search action after an explicit close.
 * Never focus a stale trigger after the user switches chats or signs out. */
export function focusDirectSearchTrigger(trigger:Pick<HTMLButtonElement,'isConnected'|'focus'>|null):boolean{
  if(!trigger?.isConnected)return false;
  trigger.focus({preventScroll:true});
  return true;
}
