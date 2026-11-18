export type VoiceRecorderPhase='idle'|'requesting'|'recording'|'finalizing';

/** Cancel private voice capture when the page is backgrounded. */
export function shouldDiscardVoiceRecordingOnBackground(
 visibilityState:DocumentVisibilityState,
 phase:VoiceRecorderPhase
):boolean{
 return visibilityState==='hidden'
  &&(phase==='requesting'||phase==='recording'||phase==='finalizing');
}
