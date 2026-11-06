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
