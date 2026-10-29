'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {groupMessages,sendGroupMessage,groupMembers,markGroupRead,type Group,type GroupMessage} from '@/lib/groups';
import {listProfiles,type Profile} from '@/lib/supabase-rest';
import StatusEmoji from '@/components/StatusEmoji';
import {getUserActivities,activityLabel,type UserActivity} from '@/lib/activity';
import {imageUrl} from '@/lib/social';
import {readGroupDrafts} from '@/lib/group-drafts';
import {getOrCreateGroupSendAttempt,clearGroupSendAttempt} from '@/lib/group-send-attempts';
import {subscribeGroupChanges} from '@/lib/group-realtime';
import {mergeConfirmedGroupMessages,CONFIRMED_GROUP_MESSAGE_GRACE_MS,type ConfirmedGroupMessage} from '@/lib/group-history';
type Props={token:string;userId:string;group:Group;onBack:()=>void;onShowProfile:(id:string)=>void;onDraftChange:(groupId:string,text:string)=>void};
export default function GroupPanel({token,userId,group,onBack,onShowProfile,onDraftChange}:Props){
 const [messages,setMessages]=useState<GroupMessage[]>([]);
 const [members,setMembers]=useState<Profile[]>([]);
 const [presence,setPresence]=useState<Record<string,UserActivity>>({});
 const [membersOpen,setMembersOpen]=useState(false);
 const [memberSearch,setMemberSearch]=useState('');
 const [draft,setDraft]=useState(()=>readGroupDrafts(userId)[group.id]??'');
 const [online,setOnline]=useState(true);
 const draftVersionRef=useRef(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [retryAvailable,setRetryAvailable]=useState(false);
 const [initialLoading,setInitialLoading]=useState(true);
 const historyRef=useRef<HTMLDivElement|null>(null);
 const composerFormRef=useRef<HTMLFormElement|null>(null);
 const followNewestRef=useRef(true);
 const lastReadRef=useRef<string|null>(null);
 const requestSequenceRef=useRef(0);
 const confirmedGroupMessagesRef=useRef<Map<string,ConfirmedGroupMessage>>(new Map());
 const contextRef=useRef({groupId:group.id,userId,token});
 contextRef.current={groupId:group.id,userId,token};
 useEffect(()=>{confirmedGroupMessagesRef.current.clear();},[group.id,userId]);
 // Mounting or switching accounts must not show another person's draft.
 useEffect(()=>{
  draftVersionRef.current+=1;
  setDraft(readGroupDrafts(userId)[group.id]??'');
 },[group.id,userId]);
 useEffect(()=>{
  const update=()=>setOnline(navigator.onLine);
  update();
  window.addEventListener('online',update);
  window.addEventListener('offline',update);
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 function changeDraft(text:string){
  draftVersionRef.current+=1;
  setDraft(text);
  setRetryAvailable(false);
  onDraftChange(group.id,text);
 }

 const refresh=useCallback(async()=>{
  const requestId=++requestSequenceRef.current;
  const msgs=await groupMessages(token,group.id);
  // When a slower poll finishes after a newer one, do not replace the newer
  // messages. The same guard applies after a quick group-switch/unmount.
  if(requestId!==requestSequenceRef.current
   ||contextRef.current.groupId!==group.id
   ||contextRef.current.userId!==userId
   ||contextRef.current.token!==token)return;
  setMessages(mergeConfirmedGroupMessages(
   msgs,confirmedGroupMessagesRef.current,group.id,userId
  ));
  setInitialLoading(false);
  const last=msgs.length?msgs[msgs.length-1].id:null;
  if(document.visibilityState==='visible'&&last!==lastReadRef.current){
    lastReadRef.current=last;
    void markGroupRead(token,group.id).catch(()=>{if(lastReadRef.current===last)lastReadRef.current=null;});
  }
 },[token,group.id,userId]);
 useEffect(()=>{
  let cancelled=false;
  let inFlight=false;
  let queuedSync=false;
  let realtimeTimer:number|null=null;
  setInitialLoading(true);
  const sync=()=>{
    if(cancelled||document.visibilityState==='hidden'||!navigator.onLine)return;
    if(inFlight){queuedSync=true;return;}
    inFlight=true;
    void refresh().then(()=>{if(!cancelled)setError('');}).catch(e=>{
      if(!cancelled){setInitialLoading(false);setError(e instanceof Error?e.message:'Не удалось загрузить сообщения группы');}
    }).finally(()=>{
      inFlight=false;
      // A Realtime event arriving during an older GET must not be discarded.
      if(queuedSync&&!cancelled){queuedSync=false;sync();}
    });
  };
  sync();
  const onRealtimeChanged=()=>{
    if(cancelled||document.visibilityState==='hidden'||!navigator.onLine)return;
    if(realtimeTimer!==null)window.clearTimeout(realtimeTimer);
    realtimeTimer=window.setTimeout(()=>{
      realtimeTimer=null;
      sync();
    },150);
  };
  const unsubscribeRealtime=subscribeGroupChanges(token,group.id,onRealtimeChanged);
  // Polling is a fallback and heals any missed WebSocket notifications.
  const timer=window.setInterval(sync,6000);
  const onOnline=()=>sync();
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('online',onOnline);
  return()=>{
    cancelled=true;
    requestSequenceRef.current++;
    window.clearInterval(timer);
    if(realtimeTimer!==null)window.clearTimeout(realtimeTimer);
    unsubscribeRealtime();
    document.removeEventListener('visibilitychange',sync);
    window.removeEventListener('online',onOnline);
  };
 },[refresh,token,group.id]);
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
 async function send(e:FormEvent){
 e.preventDefault();
 if(busy||!draft.trim())return;
 // Never queue a surprise send on reconnect. Let the user retry manually.
 if(!online||!navigator.onLine){setError('Нет интернета. Сообщение осталось в черновике.');return;}
 const body=draft.trim(),groupId=group.id,accountId=userId,requestToken=token;
 const sentDraftVersion=draftVersionRef.current;
 setBusy(true);setError('');setRetryAvailable(false);
 try{
   // A network timeout does not tell us whether the POST committed. Reuse a
   // UUID stored for this exact draft until the server confirms its row.
   const attempt=getOrCreateGroupSendAttempt(accountId,groupId,body);
   const sent=await sendGroupMessage(requestToken,groupId,accountId,body,attempt.id);
   // Use the actual server-returned message instead of waiting for another
   // network request. Ignore results after account/group navigation.
   if(contextRef.current.groupId!==groupId||contextRef.current.userId!==accountId
      ||contextRef.current.token!==requestToken)return;
   confirmedGroupMessagesRef.current.set(sent.id,{
     message:sent,expiresAt:Date.now()+CONFIRMED_GROUP_MESSAGE_GRACE_MS
   });
   // Clear the attempt only after DB acknowledgment and account/group guard.
   clearGroupSendAttempt(accountId,groupId,attempt.id);
   setMessages(current=>mergeConfirmedGroupMessages(
     current,confirmedGroupMessagesRef.current,groupId,accountId
   ));
   // Do not wipe newer text typed while the server was saving the message.
   if(draftVersionRef.current===sentDraftVersion){
     draftVersionRef.current+=1;
     setDraft('');
     onDraftChange(groupId,'');
   }
 }catch(e){
   if(contextRef.current.groupId!==groupId||contextRef.current.userId!==accountId
      ||contextRef.current.token!==requestToken)return;
   setRetryAvailable(true);
   setError((e instanceof Error?e.message:'Ошибка отправки')+' · Черновик сохранён.');
 }
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
 <form ref={composerFormRef} className="composer ik-group-composer" onSubmit={send}>
 <textarea aria-label="Сообщение группе" placeholder={online?"Сообщение группе…":"Нет сети · черновик сохранён"} rows={1} enterKeyHint="enter" maxLength={4000} value={draft}
 onChange={e=>{changeDraft(e.target.value);if(error)setError('');}}
 onKeyDown={e=>{
   if(e.key!=='Enter'||e.nativeEvent.isComposing)return;
   // Desktop: Enter sends, Shift+Enter inserts a newline.
   // Mobile: Enter inserts a newline; Cmd/Ctrl+Enter always sends.
   const sendKey=e.ctrlKey||e.metaKey||(!e.shiftKey&&window.matchMedia('(pointer:fine)').matches);
   if(sendKey){e.preventDefault();e.currentTarget.form?.requestSubmit();}
 }}
 />
 <button type="submit" className="send-button" aria-label="Отправить в группу" disabled={busy||!draft.trim()||!online}>➤</button>
 </form>
 {!online&&<p className="ik-group-offline" role="status">Нет соединения. Текст останется в черновике, отправь его после подключения.</p>}
 {error&&<div className="ik-group-send-alert" role="alert">
 <span>{error}</span>
 {retryAvailable&&online&&draft.trim()&&<button type="button" onClick={()=>composerFormRef.current?.requestSubmit()} disabled={busy}>Повторить отправку</button>}
 </div>}
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