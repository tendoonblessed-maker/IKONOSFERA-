/** Cancel private voice capture when the page is backgrounded. */
export function shouldDiscardVoiceRecordingOnBackground(visibilityState,phase){
 return visibilityState==="hidden"
  &&(phase==="requesting"||phase==="recording"||phase==="finalizing");
}
