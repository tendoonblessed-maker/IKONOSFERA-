/** Controls inside a message (including audio/video scrubbers) own their
 * horizontal touch gestures. Only a single-finger gesture starting on plain
 * message content may trigger swipe-to-reply. */
export const MESSAGE_INTERACTIVE_SELECTOR=
 'button,a,input,textarea,select,video,audio,[role="button"],[contenteditable="true"]';

export function shouldBlockMessageSwipe(
 disabled:boolean,touchCount:number,interactiveTarget:boolean
):boolean{
 return disabled||touchCount!==1||interactiveTarget;
}
