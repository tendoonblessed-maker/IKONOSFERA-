'use client';

import {useEffect,useRef,useState} from 'react';
import {chooseVoiceMimeType,createVoiceFile,formatVoiceTime,VOICE_RECORD_MAX_MS,VOICE_RECORD_MAX_BYTES} from '@/lib/voice-notes';

type Props={
 disabled:boolean;
 onRecorded:(file:File)=>void;
 onError:(message:string)=>void;
};
type Capture={
 recorder:MediaRecorder;
 stream:MediaStream;
 chunks:Blob[];
 bytes:number;
 startedAt:number;
 discarded:boolean;
 clock:number|null;
 limit:number|null;
};
type Phase='idle'|'requesting'|'recording'|'finalizing';

function stopTracks(stream:MediaStream){
 stream.getTracks().forEach(track=>track.stop());
}
function clearCaptureTimers(capture:Capture){
 if(capture.clock!==null)window.clearInterval(capture.clock);
 if(capture.limit!==null)window.clearTimeout(capture.limit);
 capture.clock=null;capture.limit=null;
}

export default function VoiceRecorder({disabled,onRecorded,onError}:Props){
 const [phase,setPhase]=useState<Phase>('idle');
 const [elapsed,setElapsed]=useState(0);
 const captureRef=useRef<Capture|null>(null);
 const requestRef=useRef(0);
 const liveRef=useRef(true);
 const errorRef=useRef(onError);
 const recordedRef=useRef(onRecorded);
 errorRef.current=onError;
 recordedRef.current=onRecorded;

 // Cancel an in-flight permission prompt and stop all microphone tracks on
 // navigation, account switch, blocking, unmount, or explicit cancellation.
 const dispose=(discard:boolean)=>{
  requestRef.current+=1;
  const capture=captureRef.current;
  captureRef.current=null;
  if(capture){
   capture.discard=discard;
   clearCaptureTimers(capture);
   capture.recorder.ondataavailable=null;
   capture.recorder.onstop=null;
   capture.recorder.onerror=null;
   if(capture.recorder.state!=='inactive'){
    try{capture.recorder.stop();}catch{}
   }
   stopTracks(capture.stream);
  }
 };
 useEffect(()=>{
  liveRef.current=true;
  return()=>{liveRef.current=false;dispose(true);};
 },[]);
 useEffect(()=>{
  if(disabled&&phase!=='idle'){
   dispose(true);
   setPhase('idle');
   setElapsed(0);
  }
 // Only disabled changes should force cancellation, not a rerender.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[disabled]);

 const cancel=()=>{
  dispose(true);
  setElapsed(0);
  setPhase('idle');
 };
 const finish=()=>{
  const capture=captureRef.current;
  if(!capture||capture.discard||capture.recorder.state!=='recording')return;
  setPhase('finalizing');
  try{capture.recorder.stop();}
  catch{cancel();errorRef.current('Не удалось завершить запись. Попробуй ещё раз.');}
 };

 const start=async()=>{
  if(disabled||phase!=='idle')return;
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   errorRef.current('Запись с микрофона недоступна в этом браузере или без HTTPS.');
   return;
  }
  const mime=typeof MediaRecorder.isTypeSupported==='function'
   ?chooseVoiceMimeType(type=>MediaRecorder.isTypeSupported(type)):null;
  if(!mime){
   errorRef.current('Браузер не поддерживает доступные форматы голосовых сообщений.');
   return;
  }
  const generation=++requestRef.current;
  setPhase('requesting');
  setElapsed(0);
  let stream:MediaStream|null=null;
  try{
   stream=await navigator.mediaDevices.getUserMedia({
    audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
   });
   // Permission may have been granted after the user left the chat.
   if(requestRef.current!==generation||!liveRef.current||disabled){
    stopTracks(stream);
    return;
   }
   const recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});
   const capture:Capture={
    recorder,stream,chunks:[],bytes:0,startedAt:Date.now(),
    discarded:false,clock:null,limit:null
   };
   captureRef.current=capture;
   recorder.ondataavailable=event=>{
    if(capture.discard||!event.data?.size)return;
    capture.bytes+=event.data.size;
    if(capture.bytes>VOICE_RECORD_MAX_BYTES){
     cancel();
     errorRef.current('Запись превышает 25 МБ. Попробуй записать сообщение короче.');
     return;
    }
    capture.chunks.push(event.data);
   };
   recorder.onerror=()=>{
    if(capture.discard||captureRef.current!==capture)return;
    cancel();
    errorRef.current('Произошла ошибка записи звука. Проверь микрофон.');
   };
   recorder.onstop=()=>{
    if(capture.discard||captureRef.current!==capture)return;
    clearCaptureTimers(capture);
    stopTracks(capture.stream);
    captureRef.current=null;
    if(!liveRef.current)return;
    setPhase('idle');setElapsed(0);
    try{
     const file=createVoiceFile(capture.chunks,recorder.mimeType||mime);
     recordedRef.current(file); // Existing media preview asks before upload.
    }catch(error){
     errorRef.current(error instanceof Error?error.message:'Не удалось подготовить голосовое сообщение.');
    }
   };
   recorder.start(1000);
   capture.clock=window.setInterval(()=>{
    if(captureRef.current===capture)setElapsed(Math.min(120,Math.floor((Date.now()-capture.startedAt)/1000)));
   },250);
   capture.limit=window.setTimeout(()=>{
    if(captureRef.current===capture&&capture.recorder.state==='recording'){
     setPhase('finalizing');
     capture.recorder.stop();
    }
   },VOICE_RECORD_MAX_MS);
   setPhase('recording');
  }catch(error){
   if(stream)stopTracks(stream);
   if(captureRef.current?.stream===stream)captureRef.current=null;
   if(requestRef.current!==generation||!liveRef.current)return;
   setPhase('idle');
   const denial=error instanceof Error&&(error.name==='NotAllowedError'||error.name==='PermissionDeniedError');
   errorRef.current(denial
    ?'Разреши доступ к микрофону в настройках браузера, чтобы записать голосовое.'
    :'Микрофон недоступен. Проверь подключение устройства и повтори попытку.');
  }
 };

 return <div className="ik-voice-recorder">
  <button type="button" className="ik-voice-trigger" onClick={()=>void start()}
   disabled={disabled||phase!=='idle'} title="Записать голосовое сообщение"
   aria-label="Записать голосовое сообщение">
   <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="2.5" width="6" height="12" rx="3"/>
    <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4m-4 0h8"/>
   </svg>
  </button>
  {phase!=='idle'&&<div className="ik-voice-panel" role="group" aria-label="Голосовое сообщение">
   <div className="ik-voice-status" role="status" aria-live="polite">
    <span className={'ik-voice-dot'+(phase==='recording'?' is-recording':'')} aria-hidden="true"/>
    <strong>{phase==='requesting'?'Доступ к микрофону…':phase==='finalizing'?'Подготавливаем запись…':'Идёт запись'}</strong>
    {phase==='recording'&&<time>{formatVoiceTime(elapsed)}</time>}
   </div>
   <span className="ik-voice-help">Не более 2 минут · перед отправкой можно прослушать</span>
   <div className="ik-voice-actions">
    <button type="button" className="ik-voice-cancel" onClick={cancel}
     disabled={phase==='finalizing'}>Отменить</button>
    <button type="button" className="ik-voice-stop" onClick={finish}
     disabled={phase!=='recording'}>Готово</button>
   </div>
  </div>}
 </div>;
}
