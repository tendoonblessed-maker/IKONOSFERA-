/** Keep IME cancellation Escape inside composition instead of closing the photo viewer. */
export type PhotoViewerKeyEvent=Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'>;

export function shouldCloseChatPhotoViewer(event:PhotoViewerKeyEvent):boolean{
 return event.key==='Escape'&&!event.isComposing&&event.keyCode!==229;
}
