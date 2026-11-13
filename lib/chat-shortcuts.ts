/** Only override browser/app shortcuts outside active IME composition.
 * Never steal native Find from the sign-in page, groups or channels.
 */
type ShortcutKey={
  key:string;
  ctrlKey:boolean;
  metaKey:boolean;
  altKey:boolean;
  shiftKey:boolean;
  isComposing?:boolean;
  keyCode?:number;
};

function canHandleChatShortcut(event:ShortcutKey):boolean{
  // keyCode 229 covers browsers that report IME composition late/inconsistently.
  return !event.isComposing&&event.keyCode!==229;
}

export function shouldOpenChatListSearch(event:ShortcutKey):boolean{
  return canHandleChatShortcut(event)
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='k';
}

export function shouldOpenDirectChatSearch(event:ShortcutKey,directChatVisible:boolean):boolean{
  return directChatVisible
    && canHandleChatShortcut(event)
    && (event.ctrlKey||event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase()==='f';
}
