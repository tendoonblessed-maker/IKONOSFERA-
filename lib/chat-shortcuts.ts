/** Only override browser Find while a private conversation is visible.
 * Never steal Ctrl/Cmd+F from the sign-in page, groups or channels.
 */
type ShortcutState={
  repeat?:boolean;
  isComposing?:boolean;
  keyCode?:number;
};

/** Ignore browser key-repeat and IME confirmation events before global shortcuts. */
export function shouldIgnoreGlobalChatShortcut(event:ShortcutState):boolean{
  return event.repeat===true||event.isComposing===true||event.keyCode===229;
}

type FindKey=ShortcutState&{
  key:string;
  ctrlKey:boolean;
  metaKey:boolean;
  altKey:boolean;
  shiftKey:boolean;
};

export function shouldOpenDirectChatSearch(event:FindKey,directChatVisible:boolean):boolean{
  return !shouldIgnoreGlobalChatShortcut(event)
    && directChatVisible
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='f';
}
