/** Ignore Escape while an IME is still committing a character. Some mobile
 * browsers report keyCode 229 instead of setting isComposing consistently. */
export function shouldClosePhotoViewerOnKeydown(
 event:Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>
):boolean{
 return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}

/** Closing the full-screen viewer must not scroll the underlying chat when
 * focus returns to the photo that originally opened it. */
export function restorePhotoViewerFocus(
 element:Pick<HTMLElement,'isConnected'|'focus'>|null
):void{
 if(element?.isConnected)element.focus({preventScroll:true});
}
