export type VoiceRecorderPhase='idle'|'requesting'|'recording'|'finalizing';

/** Cancel private voice capture when the page is backgrounded. */
export function shouldDiscardVoiceRecordingOnBackground(
 visibilityState:DocumentVisibilityState,
 phase:VoiceRecorderPhase
):boolean{
 return visibilityState==='hidden'
  &&(phase==='requesting'||phase==='recording'||phase==='finalizing');
}

/** Cancel private voice capture when the document is being left, even if visibilitychange was skipped. */
export function shouldDiscardVoiceRecordingOnPageHide(
 phase:VoiceRecorderPhase
):boolean{
 return phase==='requesting'||phase==='recording'||phase==='finalizing';
}
