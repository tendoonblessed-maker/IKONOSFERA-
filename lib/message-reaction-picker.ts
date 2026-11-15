/** Keyboard behavior for the non-modal message reaction popover. */
export function getMessageReactionPickerNextIndex(
  currentIndex:number,
  key:string,
  count:number
):number|null{
  if(!Number.isInteger(count)||count<=0||!Number.isInteger(currentIndex)||currentIndex<0||currentIndex>=count)return null;
  if(key==='ArrowRight')return (currentIndex+1)%count;
  if(key==='ArrowLeft')return (currentIndex-1+count)%count;
  if(key==='Home')return 0;
  if(key==='End')return count-1;
  return null;
}

/** Do not let Escape interrupt an IME candidate/commit interaction. */
export function shouldCloseMessageReactionPickerOnKeydown(
  event:Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>
):boolean{
  return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}
