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
