/**
 * Keep the group composer connectivity hint fresh across mobile PWA resumes.
 * navigator.onLine is only a browser hint: actual requests remain the source
 * of truth, and reconnecting never sends a saved draft automatically.
 */
type NetworkEventTarget=Pick<EventTarget,'addEventListener'|'removeEventListener'>;

export function watchNetworkStatus(
 onChange:(online:boolean)=>void,
 windowRef:NetworkEventTarget=window,
 documentRef:NetworkEventTarget=document,
 navigatorRef:Pick<Navigator,'onLine'>=navigator
):()=>void{
 let disposed=false;
 const update=()=>{if(!disposed)onChange(navigatorRef.onLine);};
 update();
 windowRef.addEventListener('online',update);
 windowRef.addEventListener('offline',update);
 windowRef.addEventListener('pageshow',update);
 documentRef.addEventListener('visibilitychange',update);
 return()=>{
  if(disposed)return;
  disposed=true;
  windowRef.removeEventListener('online',update);
  windowRef.removeEventListener('offline',update);
  windowRef.removeEventListener('pageshow',update);
  documentRef.removeEventListener('visibilitychange',update);
 };
}
