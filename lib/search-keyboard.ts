/** Keep Escape available to IME candidate/composition handling before closing search. */
export type SearchKeyboardEvent = Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>;

export function shouldCloseSearchOnEscape(event:SearchKeyboardEvent):boolean{
  return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}
