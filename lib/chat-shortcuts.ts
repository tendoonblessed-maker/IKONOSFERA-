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
/** Ignore Escape used to finish IME composition (including Safari keyCode 229). */
export function shouldCloseSearchOnEscape(event:Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>):boolean{
  return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}

export function shouldOpenDirectChatSearch(event:FindKey,directChatVisible:boolean):boolean{
  return directChatVisible
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='f';
}
