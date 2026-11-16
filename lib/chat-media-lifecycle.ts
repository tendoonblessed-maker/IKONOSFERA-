/** Stop a private chat media element before React detaches it.
 * Removing a media node is not used as a substitute for an explicit pause:
 * audio must stop immediately when its conversation is no longer visible.
 */
export type ChatMediaPlaybackElement=Pick<HTMLMediaElement,'pause'>;

export function pauseChatMediaOnDetach(
 element:ChatMediaPlaybackElement|null|undefined
):void{
 if(!element)return;
 try{
  element.pause();
 }catch{
  // Cleanup must remain safe if the browser has already disposed the player.
 }
}

/** Pause private chat playback when the tab is backgrounded, frozen or navigated away.
 * Playback intentionally does not resume automatically when the page returns.
 */
export type ChatMediaVisibilityDocument=Pick<Document,'visibilityState'|'addEventListener'|'removeEventListener'>;
export type ChatMediaPageWindow=Pick<Window,'addEventListener'|'removeEventListener'>;

export function watchChatMediaPageLifecycle(
 element:ChatMediaPlaybackElement|null|undefined,
 doc:ChatMediaVisibilityDocument,
 win:ChatMediaPageWindow
):()=>void{
 if(!element)return ()=>{};
 const onVisibilityChange=()=>{
  if(doc.visibilityState==='hidden')pauseChatMediaOnDetach(element);
 };
 const onPageHide=()=>pauseChatMediaOnDetach(element);
 // Chromium may freeze a page after it is backgrounded; keep this as an
 // additional signal rather than relying on visibilitychange ordering alone.
 const onFreeze=()=>pauseChatMediaOnDetach(element);
 doc.addEventListener('visibilitychange',onVisibilityChange);
 doc.addEventListener('freeze',onFreeze);
 win.addEventListener('pagehide',onPageHide);
 return ()=>{
  doc.removeEventListener('visibilitychange',onVisibilityChange);
  doc.removeEventListener('freeze',onFreeze);
  win.removeEventListener('pagehide',onPageHide);
 };
}
