'use client';
import '@livekit/components-styles';
import {useEffect,useState} from 'react';
import {LiveKitRoom,RoomAudioRenderer,ControlBar,GridLayout,ParticipantTile,useTracks,StartAudio} from '@livekit/components-react';
import {Track} from 'livekit-client';
type Props={kind:'call'|'voice';id:string;withVideo:boolean;token:string;onLeave:()=>void};
function Stage(){
 const tracks=useTracks([{source:Track.Source.Camera,withPlaceholder:true},{source:Track.Source.ScreenShare,withPlaceholder:false}],{onlySubscribed:false});
 return <div className="ik-call-stage"><GridLayout tracks={tracks}><ParticipantTile/></GridLayout></div>;
}
export default function CallRoom({kind,id,withVideo,token,onLeave}:Props){
 const [connection,setConnection]=useState<{token:string;url:string}|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setConnection(null);setError('');
  void fetch('/api/livekit-token',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({kind,id}),signal:controller.signal,cache:'no-store'})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось подключиться');return data as {token:string;url:string};})
   .then(setConnection).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Сбой связи');});
  return ()=>controller.abort();
 },[kind,id,token]);
 if(error)return <div className="ik-call-error" role="alert"><h2>Не удалось подключиться</h2><p>{error}</p><button onClick={onLeave}>Закрыть</button></div>;
 if(!connection)return <div className="ik-call-loading" role="status">Подключаем защищённую комнату…</div>;
 return <LiveKitRoom
  token={connection.token} serverUrl={connection.url} connect={true}
  audio={true} video={withVideo} onDisconnected={onLeave}
  onError={e=>setError(e.message||'Ошибка устройства или соединения')}
  data-lk-theme="default" className="ik-livekit-room"
 >
  <div className="ik-call-header"><span className="ik-call-dot"/><strong>{kind==='voice'?'Голосовая комната':'Звонок IKONOSFERA'}</strong><span>Зашифрованное соединение</span></div>
  <Stage/>
  <RoomAudioRenderer/>
  <StartAudio label="Включить звук"/>
  <div className="ik-call-controls"><ControlBar saveUserChoices={true} controls={{microphone:true,camera:true,screenShare:typeof navigator!=='undefined'&&Boolean(navigator.mediaDevices?.getDisplayMedia),chat:false,leave:true}}/></div>
 </LiveKitRoom>;
}
