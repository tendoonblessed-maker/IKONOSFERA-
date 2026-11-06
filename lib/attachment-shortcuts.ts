/** Safari and Android IMEs can emit keyCode 229 even when isComposing is false.
 * Never treat these composition keystrokes as send or dismiss shortcuts.
 */
export function isAttachmentImeEvent(event:{isComposing:boolean;keyCode?:number}):boolean{
 return event.isComposing||event.keyCode===229;
}
