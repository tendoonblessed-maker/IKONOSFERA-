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

type VisibilityTarget=EventTarget&{visibilityState:DocumentVisibilityState};

/**
 * Register the recorder's privacy lifecycle handlers against injectable targets.
 * Returns a cleanup function so both browser wiring and listener teardown can be
 * exercised without a real microphone or browser navigation.
 */
export function registerVoiceRecordingLifecycle(
 documentTarget:VisibilityTarget,
 windowTarget:EventTarget,
 getPhase:()=>VoiceRecorderPhase,
 getAttemptId:()=>number,
 cancel:()=>void,
 report:(message:string)=>void
):()=>void{
 // visibilitychange and pagehide may both fire for one background transition.
 // cancel() invalidates the request generation synchronously; remember that
 // generation so the second event cannot report/cancel the same capture twice.
 let cancelledAttemptId:number|null=null;
 const cancelOnce=(message:string)=>{
  const attemptId=getAttemptId();
  if(cancelledAttemptId===attemptId)return;
  cancel();
  cancelledAttemptId=getAttemptId();
  report(message);
 };
 const onVisibilityChange=()=>{
  if(shouldDiscardVoiceRecordingOnBackground(documentTarget.visibilityState,getPhase())){
   cancelOnce('Запись отменена при переходе приложения в фон.');
  }
 };
 const onPageHide=()=>{
  if(shouldDiscardVoiceRecordingOnPageHide(getPhase())){
   cancelOnce('Запись отменена при уходе со страницы.');
  }
 };
 documentTarget.addEventListener('visibilitychange',onVisibilityChange);
 windowTarget.addEventListener('pagehide',onPageHide);
 return()=>{
  documentTarget.removeEventListener('visibilitychange',onVisibilityChange);
  windowTarget.removeEventListener('pagehide',onPageHide);
 };
}
