'use client';

import {useEffect,useRef,useState} from 'react';
import {chooseVoiceMimeType,createVoiceFile,createVoiceRecorderOptions,elapsedVoiceSeconds,formatVoiceTime,getVoiceClockNow,hasUnavailableVoiceTrack,resolveVoiceMimeType,VOICE_RECORD_MAX_MS,VOICE_RECORD_MAX_BYTES,VOICE_TRACK_MUTE_GRACE_MS} from '@/lib/voice-notes';

type Props={
 disabled:boolean;
 onRecorded:(file:File)=>void;
 onError:(message:string)=>void;
};
type TrackListeners={
 track:MediaStreamTrack;
 onMute:()=>void;
 onUnmute:()=>void;
 onEnded:()=>void;
};
type Capture={
 recorder:MediaRecorder;
 stream:MediaStream;
 chunks:Blob[];
 bytes:number;
 startedAt:number;
 discard:boolean;
 stopRequested:boolean;
 clock:number|null;
 limit:number|null;
 muteGrace:number|null;
 trackListeners:TrackListeners[];
};
type Phase='idle'|'requesting'|'recording'|'finalizing';

function stopTracks(stream:MediaStream){
 stream.getTracks().forEach(track=>track.stop());
}
function clearCaptureTimers(capture:Capture){
 if(capture.clock!==null)window.clearInterval(capture.clock);
 if(capture.limit!==null)window.clearTimeout(capture.limit);
 if(capture.muteGrace!==null)window.clearTimeout(capture.muteGrace);
 capture.clock=null;capture.limit=null;capture.muteGrace=null;
}
function removeCaptureTrackListeners(capture:Capture){
 capture.trackListeners.forEach(({track,onMute,onUnmute,onEnded})=>{
  track.removeEventListener('mute',onMute);
  track.removeEventListener('unmute',onUnmute);
  track.removeEventListener('ended',onEnded);
 });
 capture.trackListeners=[];
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
   removeCaptureTrackListeners(capture);
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
  if(hasUnavailableVoiceTrack(capture.stream.getAudioTracks())){
   cancel();
   errorRef.current('Микрофон временно недоступен. Запись отменена — начни заново.');
   return;
  }
  capture.stopRequested=true;
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
  if(typeof MediaRecorder.isTypeSupported==='function'&&!mime){
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
   // Older Safari/WebViews may record successfully without MIME probing.
   const recorder=new MediaRecorder(stream,createVoiceRecorderOptions(mime));
   const capture:Capture={
    recorder,stream,chunks:[],bytes:0,startedAt:getVoiceClockNow(),
    discard:false,stopRequested:false,clock:null,limit:null,muteGrace:null,trackListeners:[]
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
    removeCaptureTrackListeners(capture);
    stopTracks(capture.stream);
    captureRef.current=null;
    if(!liveRef.current)return;
    setPhase('idle');setElapsed(0);
    // A browser/system stop without our explicit stop request is an
    // interruption, not a complete voice message. Never preview partial audio.
    if(!capture.stopRequested){
     errorRef.current('Запись прервана браузером или системным аудиособытием. Запусти её заново.');
     return;
    }
    try{
     const actualMime=resolveVoiceMimeType(recorder.mimeType,capture.chunks,mime);
     const file=createVoiceFile(capture.chunks,actualMime);
     recordedRef.current(file); // Existing media preview asks before upload.
    }catch(error){
     errorRef.current(error instanceof Error?error.message:'Не удалось подготовить голосовое сообщение.');
    }
   };

   // Mobile OS calls, route changes and device hand-offs may mute or end the
   // microphone track while MediaRecorder still appears to be recording.
   for(const track of stream.getAudioTracks()){
    const onMute=()=>{
     if(captureRef.current!==capture||capture.discard||capture.muteGrace!==null)return;
     capture.muteGrace=window.setTimeout(()=>{
      capture.muteGrace=null;
      if(captureRef.current!==capture||capture.discard)return;
      if(hasUnavailableVoiceTrack(capture.stream.getAudioTracks())){
       cancel();
       errorRef.current('Звук микрофона прерван системой. Запись отменена — начни заново.');
      }
     },VOICE_TRACK_MUTE_GRACE_MS);
    };
    const onUnmute=()=>{
     if(captureRef.current!==capture||capture.discard)return;
     if(!hasUnavailableVoiceTrack(capture.stream.getAudioTracks())&&capture.muteGrace!==null){
      window.clearTimeout(capture.muteGrace);
      capture.muteGrace=null;
     }
    };
    const onEnded=()=>{
     if(captureRef.current!==capture||capture.discard)return;
     cancel();
     errorRef.current('Микрофон был отключён системой. Запись отменена — начни заново.');
    };
    track.addEventListener('mute',onMute);
    track.addEventListener('unmute',onUnmute);
    track.addEventListener('ended',onEnded);
    capture.trackListeners.push({track,onMute,onUnmute,onEnded});
   }

   recorder.start(1000);
   capture.clock=window.setInterval(()=>{
    if(captureRef.current===capture)setElapsed(elapsedVoiceSeconds(capture.startedAt,getVoiceClockNow()));
   },250);
   capture.limit=window.setTimeout(()=>{
    if(captureRef.current===capture&&capture.recorder.state==='recording'){
     if(hasUnavailableVoiceTrack(capture.stream.getAudioTracks())){
      cancel();
      errorRef.current('Микрофон временно недоступен. Запись отменена — начни заново.');
      return;
     }
     capture.stopRequested=true;
     setPhase('finalizing');
     try{capture.recorder.stop();}
     catch{cancel();errorRef.current('Не удалось завершить запись. Попробуй ещё раз.');}
    }
   },VOICE_RECORD_MAX_MS);
   setPhase('recording');
  }catch(error){
   if(stream){
    const failedCapture=captureRef.current?.stream===stream?captureRef.current:null;
    if(failedCapture){
     failedCapture.discard=true;
     clearCaptureTimers(failedCapture);
     removeCaptureTrackListeners(failedCapture);
     failedCapture.recorder.ondataavailable=null;
     failedCapture.recorder.onstop=null;
     failedCapture.recorder.onerror=null;
     captureRef.current=null;
     if(failedCapture.recorder.state!=='inactive'){
      try{failedCapture.recorder.stop();}catch{}
     }
    }
    stopTracks(stream);
   }
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
