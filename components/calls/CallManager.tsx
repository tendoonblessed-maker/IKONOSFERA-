'use client';
import {useEffect,useState} from 'react';
import {endMessengerCall,listPendingCalls,respondMessengerCall,getCall,type Call} from '@/lib/calls';
import CallRoom from './CallRoom';
export type ActiveMedia={kind:'call'|'voice';id:string;withVideo:boolean};
type Props={token:string;userId:string;outgoing:ActiveMedia|null;onOutgoingClear:()=>void};
export default function CallManager({token,userId,outgoing,onOutgoingClear}:Props){
 const [incoming,setIncoming]=useState<Call|null>(null);
 const [joined,setJoined]=useState<ActiveMedia|null>(null);
 const [error,setError]=useState('');
 const active=joined||outgoing;
 useEffect(()=>{
  let cancelled=false;
  const poll=async()=>{
   if(document.visibilityState==='hidden'||active)return;
   try{
    const list=await listPendingCalls(token,userId);
    if(cancelled)return;
    const candidate=list.map(x=>x.calls).find(c=>c&&c.created_by!==userId&&c.status!=='ended'&&Date.now()-Date.parse(c.created_at)<45000);
    setIncoming(candidate||null);
   }catch{/* Preserve the active session during short network interruptions. */}
  };
  void poll();const timer=window.setInterval(()=>void poll(),4000);
  return ()=>{cancelled=true;clearInterval(timer);};
 },[token,userId,active]);
 useEffect(()=>{
  if(!active||active.kind!=='call')return;
  let gone=false;
  const check=async()=>{try{const call=await getCall(token,active.id);if(!gone&&(!call||call.status==='ended')){setJoined(null);onOutgoingClear();setError('Звонок завершён');}}catch{}};
  const interval=window.setInterval(()=>void check(),5000);
  return()=>{gone=true;clearInterval(interval);};
 },[active,token,onOutgoingClear]);
 async function answer(accept:boolean){
  if(!incoming)return;const pending=incoming;setError('');
  try{
   await respondMessengerCall(token,pending.id,accept);
   if(accept)setJoined({kind:'call',id:pending.id,withVideo:pending.with_video});
   setIncoming(null);
  }catch(e){setIncoming(null);setError(e instanceof Error?e.message:'Не удалось ответить');}
 }
 async function leave(){
  if(active?.kind==='call'){try{await endMessengerCall(token,active.id);}catch(e){setError(e instanceof Error?e.message:'Не удалось завершить вызов');}}
  setJoined(null);onOutgoingClear();
 }
 return <>
  {incoming&&!active&&<div className="ik-call-overlay" role="alertdialog" aria-modal="true" aria-label="Входящий звонок">
   <div className="ik-incoming-card"><span className="ik-incoming-symbol">{incoming.with_video?'▣':'☎'}</span>
    <h2>Входящий {incoming.with_video?'видеозвонок':'звонок'}</h2><p>IKONOSFERA · Вызов в чате</p>
    <div className="ik-incoming-actions"><button type="button" onClick={()=>void answer(false)} className="ik-decline">Отклонить</button><button type="button" onClick={()=>void answer(true)} className="ik-accept">Ответить</button></div>
   </div>
  </div>}
  {active&&<div className="ik-call-overlay ik-call-active" role="dialog" aria-modal="true" aria-label="Звонок IKONOSFERA">
   <CallRoom kind={active.kind} id={active.id} withVideo={active.withVideo} token={token} onLeave={()=>void leave()}/>
   <button className="ik-call-close" type="button" onClick={()=>void leave()} aria-label="Покинуть звонок">✕</button>
  </div>}
  {error&&!active&&<div className="ik-call-toast" role="status"><span>{error}</span><button type="button" onClick={()=>setError('')}>Закрыть</button></div>}
 </>;
}
