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


/** Keep IME confirmation keys and held-key repeats from sending a direct message.
 * Some iOS Safari/IME sequences report isComposing=false on the final Enter
 * while retaining the legacy keyCode 229.
 */
type DirectComposerKey = Pick<KeyboardEvent,'key'|'shiftKey'|'repeat'|'isComposing'|'keyCode'>;

export function shouldSubmitDirectMessage(event:DirectComposerKey,softKeyboard:boolean):boolean{
  return event.key==='Enter'
    && !event.shiftKey
    && !event.repeat
    && !event.isComposing
    && event.keyCode!==229
    && !softKeyboard;
}
