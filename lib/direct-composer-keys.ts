/** Keep soft-keyboard Enter as a newline in direct chats, including touch laptops.
 * Hardware keyboards can explicitly send with Ctrl/Cmd+Enter.
 */
type ComposerKey={
  key:string;
  ctrlKey:boolean;
  metaKey:boolean;
  shiftKey:boolean;
  altKey:boolean;
  nativeEvent?:{isComposing?:boolean;keyCode?:number};
};

export function shouldSubmitComposerOnEnter(event:ComposerKey,softKeyboard:boolean):boolean{
  if(event.key!=='Enter'||event.altKey)return false;
  // Some IMEs report keyCode 229 even after isComposing briefly becomes false.
  if(event.nativeEvent?.isComposing||event.nativeEvent?.keyCode===229)return false;
  return event.ctrlKey||event.metaKey||(!event.shiftKey&&!softKeyboard);
}

// Backward-compatible name for the private-chat call site.
export const shouldSubmitDirectComposerOnEnter=shouldSubmitComposerOnEnter;
