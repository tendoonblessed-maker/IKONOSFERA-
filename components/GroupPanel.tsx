'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {groupMessages,sendGroupMessage,groupMembers,markGroupRead,type Group,type GroupMessage} from '@/lib/groups';
import {listProfiles,type Profile} from '@/lib/supabase-rest';
import StatusEmoji from '@/components/StatusEmoji';
import {getUserActivities,activityLabel,type UserActivity} from '@/lib/activity';
import {imageUrl} from '@/lib/social';
type Props={token:string;userId:string;group:Group;onBack:()=>void;onShowProfile:(id:string)=>void};
export default function GroupPanel({token,userId,group,onBack,onShowProfile}:Props){
 const [messages,setMessages]=useState<GroupMessage[]>([]);
 const [members,setMembers]=useState<Profile[]>([]);
 const [presence,setPresence]=useState<Record<string,UserActivity>>({});
 const [membersOpen,setMembersOpen]=useState(false);
 const [memberSearch,setMemberSearch]=useState('');
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [initialLoading,setInitialLoading]=useState(true);
 const historyRef=useRef<HTMLDivElement|null>(null);
 const followNewestRef=useRef(true);
 const lastReadRef=useRef<string|null>(null);
 const requestSequenceRef=useRef(0);
 const refresh=useCallback(async()=>{
  const requestId=++requestSequenceRef.current;
  const msgs=await groupMessages(token,group.id);
  // When a slower poll finishes after a newer one, do not replace the newer
  // messages. The same guard applies after a quick group-switch/unmount.
  if(requestId!==requestSequenceRef.current)return;
  setMessages(msgs);
  setInitialLoading(false);
  const last=msgs.length?msgs[msgs.length-1].id:null;
  if(document.visibilityState==='visible'&&last!==lastReadRef.current){
    lastReadRef.current=last;
    void markGroupRead(token,group.id).catch(()=>{if(lastReadRef.current===last)lastReadRef.current=null;});
  }
 },[token,group.id]);
 useEffect(()=>{
  let cancelled=false;
  let inFlight=false;
  setInitialLoading(true);
  const sync=()=>{if(cancelled||inFlight||document.visibilityState==='hidden')return;
    inFlight=true;
    void refresh().then(()=>{if(!cancelled)setError('');}).catch(e=>{
      if(!cancelled){setInitialLoading(false);setError(e instanceof Error?e.message:'Не удалось загрузить сообщения группы');}
    }).finally(()=>{inFlight=false;});
  };
  sync();
  const timer=window.setInterval(sync,6000);
  document.addEventListener('visibilitychange',sync);
  return()=>{cancelled=true;requestSequenceRef.current++;window.clearInterval(timer);document.removeEventListener('visibilitychange',sync);};
 },[refresh]);
 // Group membership and profiles change much less often than chat messages.
 useEffect(()=>{
  let cancelled=false;
  const updateMembers=()=>{
    if(document.visibilityState==='hidden')return;
    void groupMembers(token,group.id).then(memberships=>
      listProfiles(token,memberships.map(member=>member.user_id))
    ).then(profiles=>{if(!cancelled)setMembers(profiles);}).catch(()=>{});
  };
  updateMembers();
  const timer=window.setInterval(updateMembers,120000);
  return()=>{cancelled=true;window.clearInterval(timer);};
 },[token,group.id]);
 useEffect(()=>{const history=historyRef.current;if(history&&followNewestRef.current)history.scrollTop=history.scrollHeight;},[messages.length,initialLoading]);
 useEffect(()=>{if(!membersOpen)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMembersOpen(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[membersOpen]);
  useEffect(()=>{if(!membersOpen||!members.length)return;let gone=false;const load=()=>{if(document.visibilityState==='visible')void getUserActivities(token,members.map(m=>m.id)).then(value=>{if(!gone)setPresence(value);}).catch(()=>{});};load();const t=setInterval(load,40000);return()=>{gone=true;clearInterval(t);};},[token,membersOpen,members]);
 async function send(e:FormEvent){e.preventDefault();if(busy||!draft.trim())return;
 const body=draft.trim();setBusy(true);setError('');
 try{
   await sendGroupMessage(token,group.id,userId,body);
   setDraft(current=>current.trim()===body?'':current);
   // Successful message send must not be reported as failed if refresh times out.
   await refresh().catch(()=>{});
 }catch(e){setError(e instanceof Error?e.message:'Ошибка отправки');}
 finally{setBusy(false);}
 }
 const names=Object.fromEntries(members.map(p=>[p.id,p.display_name||p.username]));
 const memberById=new Map(members.map(p=>[p.id,p]));
 const filtered=members.filter(p=>(p.display_name+' '+p.username).toLowerCase().includes(memberSearch.toLowerCase()));
 return <section className="group-view">
 <header className="conversation-header"><button type="button" className="back-button" onClick={onBack} aria-label="Назад">‹</button>
 <button type="button" className="conversation-heading group-member-trigger" onClick={()=>setMembersOpen(true)} aria-label="Показать участников группы"><strong>{group.title}</strong><small>{members.length} участников · нажми, чтобы посмотреть</small></button>
 </header>
 <div className="conversation-history" ref={historyRef} aria-busy={initialLoading} onScroll={event=>{
 const area=event.currentTarget;
 followNewestRef.current=area.scrollHeight-area.scrollTop-area.clientHeight<120;
 }}>
 {initialLoading&&<div className="ik-chat-loading" role="status" aria-label="Загружаем сообщения группы"><div className="ik-chat-loading-bubble incoming"/><div className="ik-chat-loading-bubble incoming short"/><div className="ik-chat-loading-bubble outgoing"/><span className="ik-chat-loading-label">Загружаем сообщения…</span></div>}
 {!initialLoading&&!error&&messages.length===0&&<p className="group-empty">Группа создана. Напиши первое сообщение!</p>}
 {!initialLoading&&error&&messages.length===0&&<div className="ik-chat-load-error" role="alert">
  <strong>Не удалось загрузить сообщения группы</strong>
  <p>Проверь подключение. Сообщения не удалены.</p>
  <button type="button" onClick={()=>{setError('');setInitialLoading(true);void refresh().catch(e=>{setInitialLoading(false);setError(e instanceof Error?e.message:'Ошибка загрузки');});}}>Попробовать снова</button>
 </div>}
 {messages.map(m=><article key={m.id} className={'bubble '+(m.sender_id===userId?'mine':'theirs')}><strong className="group-author ik-name-with-status"><span>{m.sender_id===userId?'Вы':names[m.sender_id]||'Участник'}</span><StatusEmoji index={memberById.get(m.sender_id)?.status_emoji} decorative/></strong><div>{m.body}</div><time>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
 <form className="composer" onSubmit={send}><input aria-label="Сообщение группе" placeholder="Сообщение группе…" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" className="send-button" disabled={busy||!draft.trim()}>➤</button></form>
 {error&&<p className="profile-error" role="alert">{error}</p>}
 {membersOpen&&<div className="ik-members-backdrop" role="dialog" aria-modal="true" aria-label="Участники группы">
 <div className="ik-members-modal"><div className="ik-members-header"><div><strong>{group.title}</strong><small>{members.length} участников</small></div><button type="button" onClick={()=>setMembersOpen(false)} aria-label="Закрыть список участников">✕</button></div>
 <input className="ik-members-search" aria-label="Найти участника" placeholder="Поиск участников" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/>
 <div className="ik-members-list">{filtered.map(p=><button type="button" key={p.id} className="ik-member-row" onClick={()=>{setMembersOpen(false);onShowProfile(p.id);}}>
 <span className="ik-member-avatar">{imageUrl(p.avatar_path)?<img src={imageUrl(p.avatar_path)||''} alt=""/>:(p.display_name||p.username).slice(0,1).toUpperCase()}</span>
 <span className="ik-member-info"><strong><span className="ik-name-with-status"><span>{p.display_name||p.username}</span><StatusEmoji index={p.status_emoji} decorative/></span>{p.id===group.owner_id&&<span className="ik-member-owner">Администратор</span>}</strong><small>{activityLabel(presence[p.id])}</small></span><span className="ik-member-arrow">›</span>
 </button>)}
 {!filtered.length&&<p className="ik-member-empty">Никого не найдено</p>}</div></div>
 </div>}
 </section>;
}