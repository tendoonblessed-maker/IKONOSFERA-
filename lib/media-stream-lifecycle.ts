/** Best-effort microphone cleanup: one failing track must not leave others active. */
export function stopMediaStreamTracks(
 stream:Pick<MediaStream,'getTracks'>|null|undefined
):void{
 let tracks:MediaStreamTrack[];
 try{
  tracks=stream?.getTracks?.()??[];
 }catch{
  return;
 }
 for(const track of tracks){
  try{track.stop();}catch{}
 }
}
