'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {groupMessages,sendGroupMessage,groupMembers,type Group,type GroupMessage} from '@/lib/groups';
import {listProfiles,type Profile} from '@/lib/supabase-rest';
import {createVoiceChannel,listVoiceChannels,type VoiceChannel} from '@/lib/calls';
type Props={token:string;userId:string;group:Group;onBack:()=>void;callsReady:boolean;onStartCall:(video:boolean)=>void;onJoinVoice:(id:string)=>void};
export default function GroupPanel({token,userId,group,onBack,callsReady,onStartCall,onJoinVoice}:Props){
 const [messages,setMessages]=useState<GroupMessage[]>([]);
 const [names,setNames]=useState<Record<string,string>>({});
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [voiceChannels,setVoiceChannels]=useState<VoiceChannel[]>([]);
 const [newVoice,setNewVoice]=useState('');
 const [voiceForm,setVoiceForm]=useState(false);
 const refresh=useCallback(async()=>{
  const [msgs,members]=await Promise.all([groupMessages(token,group.id),groupMembers(token,group.id)]);
  setMessages(msgs);
  const profiles=await listProfiles(token,members.map(m=>m.user_id));
  setNames(Object.fromEntries(profiles.map((p:Profile)=>[p.id,p.display_name||p.username])));
  if(callsReady)setVoiceChannels(await listVoiceChannels(token,group.id));
 },[token,group.id,callsReady]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},3000);return()=>clearInterval(timer);},[refresh]);
 async function send(e:FormEvent){e.preventDefault();if(busy||!draft.trim())return;setBusy(true);setError('');
 try{await sendGroupMessage(token,group.id,userId,draft);setDraft('');await refresh();}
 catch(e){setError(e instanceof Error?e.message:'Ошибка отправки');}finally{setBusy(false);}}
 async function addVoice(e:FormEvent){
  e.preventDefault();if(busy||!newVoice.trim())return;setBusy(true);setError('');
  try{await createVoiceChannel(token,group.id,userId,newVoice);setNewVoice('');setVoiceForm(false);setVoiceChannels(await listVoiceChannels(token,group.id));}
  catch(e){setError(e instanceof Error?e.message:'Не удалось создать комнату');}finally{setBusy(false);}
 }
 return <section className="group-view"><header className="conversation-header"><button type="button" className="back-button" onClick={onBack}>‹</button><div className="conversation-heading"><strong>{group.title}</strong><small>{Object.keys(names).length} участников</small></div>
 <div className="conversation-call-actions"><button type="button" title={callsReady?"Позвонить группе":"LiveKit пока не подключён"} disabled={!callsReady} onClick={()=>onStartCall(false)}>☎</button><button type="button" title={callsReady?"Видеозвонок":"LiveKit пока не подключён"} disabled={!callsReady} onClick={()=>onStartCall(true)}>▣</button></div></header>
 {callsReady&&<div className="group-voice-strip"><strong>Голосовые комнаты</strong><div className="group-voice-list">{voiceChannels.map(v=><button key={v.id} type="button" onClick={()=>onJoinVoice(v.id)}>◉ {v.name} · Войти</button>)}</div>
 {group.owner_id===userId&&<div className="group-voice-create">{voiceForm?<form onSubmit={addVoice}><input value={newVoice} onChange={e=>setNewVoice(e.target.value)} maxLength={60} aria-label="Название голосовой комнаты" placeholder="Например, Общение" required/><button type="submit" disabled={busy}>Создать</button><button type="button" onClick={()=>setVoiceForm(false)}>Отмена</button></form>:<button type="button" onClick={()=>setVoiceForm(true)}>＋ Новая голосовая комната</button>}</div>}</div>}
 <div className="conversation-history">{messages.length===0&&<p className="group-empty">Группа создана. Напиши первое сообщение!</p>}
 {messages.map(m=><article key={m.id} className={'bubble '+(m.sender_id===userId?'mine':'theirs')}><strong className="group-author">{m.sender_id===userId?'Вы':names[m.sender_id]||'Участник'}</strong><div>{m.body}</div><time>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
 <form className="composer" onSubmit={send}><input aria-label="Сообщение группе" placeholder="Сообщение группе…" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" className="send-button" disabled={busy||!draft.trim()}>➤</button></form>{error&&<p className="profile-error" role="alert">{error}</p>}
 </section>;
}