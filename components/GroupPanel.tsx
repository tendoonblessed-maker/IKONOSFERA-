'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {groupMessages,sendGroupMessage,groupMembers,type Group,type GroupMessage} from '@/lib/groups';
import {listProfiles,type Profile} from '@/lib/supabase-rest';
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
 const refresh=useCallback(async()=>{
  const [msgs,membership]=await Promise.all([groupMessages(token,group.id),groupMembers(token,group.id)]);
  setMessages(msgs);
  const ids=membership.map(m=>m.user_id);
  const profiles=await listProfiles(token,ids);
  setMembers(profiles);
 },[token,group.id]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh().catch(()=>{});},4500);return()=>clearInterval(timer);},[refresh]);
 useEffect(()=>{if(!membersOpen||!members.length)return;let gone=false;const load=()=>{if(document.visibilityState==='visible')void getUserActivities(token,members.map(m=>m.id)).then(value=>{if(!gone)setPresence(value);}).catch(()=>{});};load();const t=setInterval(load,40000);return()=>{gone=true;clearInterval(t);};},[token,membersOpen,members]);
 async function send(e:FormEvent){e.preventDefault();if(busy||!draft.trim())return;setBusy(true);setError('');
 try{await sendGroupMessage(token,group.id,userId,draft);setDraft('');await refresh();}
 catch(e){setError(e instanceof Error?e.message:'Ошибка отправки');}finally{setBusy(false);}}
 const names=Object.fromEntries(members.map(p=>[p.id,p.display_name||p.username]));
 const filtered=members.filter(p=>(p.display_name+' '+p.username).toLowerCase().includes(memberSearch.toLowerCase()));
 return <section className="group-view">
 <header className="conversation-header"><button type="button" className="back-button" onClick={onBack} aria-label="Назад">‹</button>
 <button type="button" className="conversation-heading group-member-trigger" onClick={()=>setMembersOpen(true)} aria-label="Показать участников группы"><strong>{group.title}</strong><small>{members.length} участников · нажми, чтобы посмотреть</small></button>
 </header>
 <div className="conversation-history">{messages.length===0&&<p className="group-empty">Группа создана. Напиши первое сообщение!</p>}
 {messages.map(m=><article key={m.id} className={'bubble '+(m.sender_id===userId?'mine':'theirs')}><strong className="group-author">{m.sender_id===userId?'Вы':names[m.sender_id]||'Участник'}</strong><div>{m.body}</div><time>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
 <form className="composer" onSubmit={send}><input aria-label="Сообщение группе" placeholder="Сообщение группе…" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)}/><button type="submit" className="send-button" disabled={busy||!draft.trim()}>➤</button></form>
 {error&&<p className="profile-error" role="alert">{error}</p>}
 {membersOpen&&<div className="ik-members-backdrop" role="dialog" aria-modal="true" aria-label="Участники группы">
 <div className="ik-members-modal"><div className="ik-members-header"><div><strong>{group.title}</strong><small>{members.length} участников</small></div><button type="button" onClick={()=>setMembersOpen(false)} aria-label="Закрыть список участников">✕</button></div>
 <input className="ik-members-search" aria-label="Найти участника" placeholder="Поиск участников" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/>
 <div className="ik-members-list">{filtered.map(p=><button type="button" key={p.id} className="ik-member-row" onClick={()=>{setMembersOpen(false);onShowProfile(p.id);}}>
 <span className="ik-member-avatar">{imageUrl(p.avatar_path)?<img src={imageUrl(p.avatar_path)||''} alt=""/>:(p.display_name||p.username).slice(0,1).toUpperCase()}</span>
 <span className="ik-member-info"><strong>{p.display_name||p.username}{p.id===group.owner_id&&<span className="ik-member-owner">Администратор</span>}</strong><small>{activityLabel(presence[p.id])}</small></span><span className="ik-member-arrow">›</span>
 </button>)}
 {!filtered.length&&<p className="ik-member-empty">Никого не найдено</p>}</div></div>
 </div>}
 </section>;
}