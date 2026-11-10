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

/** A focus trap must skip controls which are hidden, inert, disabled or not
 * rendered. Checking the actual tabIndex also excludes tabindex="-1" nodes. */
export function isPhotoViewerTabStop(
 element:Pick<HTMLElement,'tabIndex'|'matches'|'closest'|'getClientRects'>
):boolean{
 if(element.tabIndex<0)return false;
 if(element.matches(':disabled,[hidden],[aria-hidden="true"]'))return false;
 if(element.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 return element.getClientRects().length>0;
}

/** Return a focus target only when Tab would leave the dialog's visible tab
 * sequence. A dialog fallback keeps focus trapped while all controls are
 * temporarily unavailable (for example, during an image error transition). */
export function getPhotoViewerTabTarget(
 active:Element|null,
 dialog:HTMLElement,
 controls:readonly HTMLElement[],
 shiftKey:boolean
):HTMLElement|null{
 if(controls.length===0)return dialog;
 const first=controls[0],last=controls[controls.length-1];
 if(active===dialog)return shiftKey?last:first;
 if(shiftKey&&(active===first||!dialog.contains(active)))return last;
 if(!shiftKey&&(active===last||!dialog.contains(active)))return first;
 return null;
}
