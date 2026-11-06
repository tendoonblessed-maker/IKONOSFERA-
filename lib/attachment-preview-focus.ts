/**
 * Opening the attachment composer should not summon a virtual keyboard before
 * the user decides to write a caption. Some hybrid/mobile browsers report a
 * fine primary pointer even though a touchscreen is present, so consider
 * both media-query input and the browser's touch capability.
 *
 * This decision is deliberately pure to allow regression testing without a
 * DOM or a browser and avoids user-agent sniffing.
 */
export function preferNonTextFocusForAttachment(
 coarsePointer:boolean,
 maxTouchPoints:number
):boolean{
 return coarsePointer||(Number.isFinite(maxTouchPoints)&&maxTouchPoints>0);
}

/**
 * Keep keyboard focus within the attachment dialog, including while sending
 * disables every action. A null result means the browser may advance to the
 * next control inside the dialog normally.
 */
export function getAttachmentPreviewTabTarget(
 active:Element|null,
 dialog:Element,
 controls:readonly Element[],
 shiftKey:boolean
):Element|null{
 if(controls.length===0)return dialog;
 const first=controls[0],last=controls[controls.length-1];
 if(active===dialog)return shiftKey?last:first;
 if(shiftKey&&(active===first||!dialog.contains(active)))return last;
 if(!shiftKey&&(active===last||!dialog.contains(active)))return first;
 return null;
}
