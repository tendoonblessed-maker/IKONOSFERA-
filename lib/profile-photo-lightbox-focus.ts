/** Pure focus and keyboard rules for the profile photo lightbox. */
export type ProfilePhotoLightboxKey=Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>;

export function shouldCloseProfilePhotoLightbox(event:ProfilePhotoLightboxKey):boolean{
 return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}

export function isProfilePhotoLightboxTabStop(
 element:Pick<HTMLElement,'tabIndex'|'matches'|'closest'|'getClientRects'>
):boolean{
 if(element.tabIndex<0)return false;
 if(element.matches(':disabled,[hidden],[aria-hidden="true"]'))return false;
 if(element.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 return element.getClientRects().length>0;
}

export function getProfilePhotoLightboxTabTarget(
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

export function restoreProfilePhotoLightboxFocus(
 element:Pick<HTMLElement,'isConnected'|'focus'>|null
):void{
 if(element?.isConnected)element.focus({preventScroll:true});
}
