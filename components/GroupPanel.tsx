'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from 'react';
import {groupMessages,sendGroupMessage,groupMembers,markGroupRead,type Group,type GroupMessage} from '@/lib/groups';
import {listProfiles,type Profile} from '@/lib/supabase-rest';
import StatusEmoji from '@/components/StatusEmoji';
import ChatMessageText from '@/components/ChatMessageText';
import GroupSearchPanel from '@/components/GroupSearchPanel';
import {searchGroupMessages,getGroupMessageContext,normalizeGroupSearch,GROUP_SEARCH_PAGE_SIZE,GROUP_SEARCH_MAX_OFFSET} from '@/lib/group-search';
import {getUserActivities,activityLabel,type UserActivity} from '@/lib/activity';
import {imageUrl} from '@/lib/social';
import {readGroupDrafts} from '@/lib/group-drafts';
import {getOrCreateGroupSendAttempt,clearGroupSendAttempt} from '@/lib/group-send-attempts';
import {subscribeGroupChanges} from '@/lib/group-realtime';
import {mergeConfirmedGroupMessages,CONFIRMED_GROUP_MESSAGE_GRACE_MS,type ConfirmedGroupMessage} from '@/lib/group-history';
import {shouldAcknowledgeGroupRead,countNewIncomingBelow} from '@/lib/group-read-position';
import {fetchOlderGroupMessages,prependOlderGroupMessages,preserveOlderGroupMessages,GROUP_HISTORY_MAX_LOADED} from '@/lib/group-pagination';
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
 const [hasOlder,setHasOlder]=useState(false);
 const [loadingOlder,setLoadingOlder]=useState(false);
 const [olderError,setOlderError]=useState('');
 const [showJumpToLatest,setShowJumpToLatest]=useState(false);
 const [newMessagesBelow,setNewMessagesBelow]=useState(0);
 const [searchOpen,setSearchOpen]=useState(false);
 const [searchQuery,setSearchQuery]=useState('');
 const [searchPage,setSearchPage]=useState(0);
 const [searchRetry,setSearchRetry]=useState(0);
 const [searchResults,setSearchResults]=useState<GroupMessage[]>([]);
 const [searchLoading,setSearchLoading]=useState(false);
 const [searchError,setSearchError]=useState('');
 const [searchHasMore,setSearchHasMore]=useState(false);
 const [searchLocating,setSearchLocating]=useState<string|null>(null);
 const [pendingSearchJump,setPendingSearchJump]=useState<string|null>(null);
 const historyRef=useRef<HTMLDivElement|null>(null);
 const prependScrollRef=useRef<{groupId:string;userId:string;height:number;top:number}|null>(null);
 const olderLoadingRef=useRef(false);
 const olderRequestRef=useRef(0);
 const initialPageLoadedRef=useRef(false);
 const composerFormRef=useRef<HTMLFormElement|null>(null);
 const followNewestRef=useRef(true);
 const browsingOlderRef=useRef(false);
 const searchRequestRef=useRef(0);
 const searchJumpRequestRef=useRef(0);
 const lastReadRef=useRef<string|null>(null);
 const latestGroupMessageRef=useRef<string|null>(null);
 const previousMessageIdsRef=useRef<{groupId:string;ownerId:string;ids:Set<string>}>({
  groupId:group.id,ownerId:userId,ids:new Set()
 });
 const requestSequenceRef=useRef(0);
 const confirmedGroupMessagesRef=useRef<Map<string,ConfirmedGroupMessage>>(new Map());
 const contextRef=useRef({groupId:group.id,userId,token});
 contextRef.current={groupId:group.id,userId,token};
 useEffect(()=>{
  confirmedGroupMessagesRef.current.clear();
  olderRequestRef.current++;
  olderLoadingRef.current=false;
  initialPageLoadedRef.current=false;
  prependScrollRef.current=null;
  setHasOlder(false);setLoadingOlder(false);setOlderError('');
  setMessages([]);
  setInitialLoading(true);
  latestGroupMessageRef.current=null;
  lastReadRef.current=null;
  followNewestRef.current=true;
  browsingOlderRef.current=false;
  searchRequestRef.current++;
  searchJumpRequestRef.current++;
  setSearchOpen(false);setSearchQuery('');setSearchPage(0);setSearchRetry(0);
  setSearchResults([]);setSearchLoading(false);setSearchError('');setSearchHasMore(false);
  setSearchLocating(null);setPendingSearchJump(null);
  previousMessageIdsRef.current={groupId:group.id,ownerId:userId,ids:new Set()};
  setShowJumpToLatest(false);
  setNewMessagesBelow(0);
 },[group.id,userId]);
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

 const acknowledgeLatestIfVisible=useCallback(()=>{
  const last=latestGroupMessageRef.current;
  if(browsingOlderRef.current||!shouldAcknowledgeGroupRead(last,lastReadRef.current,
     followNewestRef.current,document.visibilityState==='visible'))return;
  // The outgoing read RPC is scoped to this membership and never runs while
  // the user is reading older items, even if Realtime has delivered new ones.
  lastReadRef.current=last;
  void markGroupRead(token,group.id).catch(()=>{
    if(lastReadRef.current===last)lastReadRef.current=null;
  });
 },[token,group.id]);

 const refresh=useCallback(async()=>{
  const requestId=++requestSequenceRef.current;
  const msgs=await groupMessages(token,group.id);
  // When a slower poll finishes after a newer one, do not replace the newer
  // messages. The same guard applies after a quick group-switch/unmount.
  if(requestId!==requestSequenceRef.current
   ||contextRef.current.groupId!==group.id
   ||contextRef.current.userId!==userId
   ||contextRef.current.token!==token||browsingOlderRef.current)return;
  if(!initialPageLoadedRef.current){
   initialPageLoadedRef.current=true;
   // Current API returns at most 150 latest rows. Only allow paging
   // once the initial window is known (avoids pointless empty requests).
   setHasOlder(msgs.length>=150);
  }
  setMessages(current=>mergeConfirmedGroupMessages(
   preserveOlderGroupMessages(current,msgs),
   confirmedGroupMessagesRef.current,group.id,userId
  ));
  setInitialLoading(false);
  latestGroupMessageRef.current=msgs.length?msgs[msgs.length-1].id:null;
 },[token,group.id,userId]);
 useEffect(()=>{
  let cancelled=false;
  let inFlight=false;
  let queuedSync=false;
  let realtimeTimer:number|null=null;
  setInitialLoading(true);
  const sync=()=>{
    if(cancelled||document.visibilityState==='hidden'||!navigator.onLine||browsingOlderRef.current)return;
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
 // Search runs against the full group history via the existing RLS-filtered
 // PostgREST table. Old responses cannot cross a changed query/account/group.
 useEffect(()=>{
  const id=++searchRequestRef.current;
  const term=normalizeGroupSearch(searchQuery);
  if(!searchOpen||term.length<2){setSearchLoading(false);setSearchError('');return;}
  let cancelled=false;
  setSearchLoading(true);setSearchError('');
  const timeout=window.setTimeout(()=>{
   const requestGroup=group.id,requestOwner=userId,requestToken=token;
   void searchGroupMessages(token,group.id,term,searchPage*GROUP_SEARCH_PAGE_SIZE)
    .then(rows=>{
     if(cancelled||id!==searchRequestRef.current
        ||contextRef.current.groupId!==requestGroup
        ||contextRef.current.userId!==requestOwner
        ||contextRef.current.token!==requestToken)return;
     const next=rows.slice(0,GROUP_SEARCH_PAGE_SIZE);
     setSearchResults(previous=>searchPage===0?next:[
      ...previous,...next.filter(m=>!previous.some(old=>old.id===m.id))
     ]);
     setSearchHasMore(rows.length>GROUP_SEARCH_PAGE_SIZE
      &&(searchPage+1)*GROUP_SEARCH_PAGE_SIZE<=GROUP_SEARCH_MAX_OFFSET);
    })
    .catch(e=>{
     if(!cancelled&&id===searchRequestRef.current)
       setSearchError(e instanceof Error?e.message:'Ошибка поиска');
    })
    .finally(()=>{
     if(!cancelled&&id===searchRequestRef.current)setSearchLoading(false);
    });
  },searchPage===0?320:0);
  return()=>{cancelled=true;searchRequestRef.current++;window.clearTimeout(timeout);};
 },[searchOpen,searchQuery,searchPage,searchRetry,group.id,userId,token]);
 function closeSearch(){searchRequestRef.current++;setSearchOpen(false);setSearchQuery('');
  setSearchResults([]);setSearchPage(0);setSearchError('');setSearchHasMore(false);
 }
 function changeSearch(query:string){setSearchQuery(query);setSearchPage(0);setSearchRetry(0);
  setSearchResults([]);setSearchError('');setSearchHasMore(false);
 }
 async function openSearchResult(message:GroupMessage){
  if(searchLocating)return;
  const groupId=group.id,ownerId=userId,requestToken=token;
  const requestId=++searchJumpRequestRef.current;
  setSearchLocating(message.id);
  // Pause recent-page polling so it cannot overwrite a historical jump.
  browsingOlderRef.current=true;
  followNewestRef.current=false;
  setShowJumpToLatest(true);
  setNewMessagesBelow(0);
  try{
   const current=messages.some(row=>row.id===message.id);
   const around=current?messages:await getGroupMessageContext(token,groupId,message.id,message.created_at);
   if(requestId!==searchJumpRequestRef.current
      ||contextRef.current.groupId!==groupId
      ||contextRef.current.userId!==ownerId
      ||contextRef.current.token!==requestToken)return;
   if(!around.some(row=>row.id===message.id))throw Error('Сообщение больше недоступно.');
   olderRequestRef.current++;
   olderLoadingRef.current=false;
   prependScrollRef.current=null;
   setLoadingOlder(false);setOlderError('');
   // This is a historical window, so older pages are available on demand.
   if(!current)setHasOlder(true);
   previousMessageIdsRef.current={groupId,ownerId,ids:new Set(around.map(row=>row.id))};
   if(!current)setMessages(around);
   setPendingSearchJump(message.id);
   closeSearch();
  }catch(e){
   if(requestId===searchJumpRequestRef.current){
    browsingOlderRef.current=false;
    setSearchError(e instanceof Error?e.message:'Не удалось открыть сообщение');
   }
  }finally{
   if(requestId===searchJumpRequestRef.current)setSearchLocating(null);
  }
 }
 useLayoutEffect(()=>{
  if(!pendingSearchJump)return;
  const history=historyRef.current;
  const target=history?.querySelector<HTMLElement>('[data-group-message-id="'+pendingSearchJump+'"]');
  if(!history||!target)return;
  const offset=target.getBoundingClientRect().top-history.getBoundingClientRect().top;
  history.scrollTop=Math.max(0,history.scrollTop+offset-(history.clientHeight-target.offsetHeight)/2);
  target.classList.remove('ik-group-search-target');
  void target.offsetWidth; // Restart highlight on repeated jumps.
  target.classList.add('ik-group-search-target');
  setPendingSearchJump(null);
 },[pendingSearchJump,messages]);

 // Explicit cursor paging protects equally timestamped messages from loss.
 // Stale pages from another group/account or a search jump are discarded.
 async function loadOlder(){
  if(olderLoadingRef.current||!hasOlder||initialLoading||!online||!messages.length)return;
  const history=historyRef.current,oldest=messages[0];
  const groupId=group.id,ownerId=userId,requestToken=token;
  const requestId=++olderRequestRef.current;
  olderLoadingRef.current=true;
  setLoadingOlder(true);setOlderError('');
  if(history)prependScrollRef.current={
   groupId,userId:ownerId,height:history.scrollHeight,top:history.scrollTop
  };
  followNewestRef.current=false;
  try{
   const page=await fetchOlderGroupMessages(requestToken,groupId,oldest);
   if(requestId!==olderRequestRef.current
      ||contextRef.current.groupId!==groupId
      ||contextRef.current.userId!==ownerId
      ||contextRef.current.token!==requestToken)return;
   if(!page.messages.length){
    prependScrollRef.current=null;
    setHasOlder(false);
   }else{
    setMessages(current=>prependOlderGroupMessages(current,page.messages));
    setHasOlder(page.hasMore&&messages.length+page.messages.length<GROUP_HISTORY_MAX_LOADED);
   }
  }catch(e){
   if(requestId===olderRequestRef.current){
    prependScrollRef.current=null;
    setOlderError(e instanceof Error?e.message:'Ошибка загрузки истории группы');
   }
  }finally{
   if(requestId===olderRequestRef.current){
    olderLoadingRef.current=false;
    setLoadingOlder(false);
   }
  }
 }
 useLayoutEffect(()=>{
  const snapshot=prependScrollRef.current,history=historyRef.current;
  if(!snapshot||!history)return;
  prependScrollRef.current=null;
  if(snapshot.groupId!==group.id||snapshot.userId!==userId)return;
  const growth=history.scrollHeight-snapshot.height;
  history.scrollTop=Math.max(0,snapshot.top+growth);
 },[messages,group.id,userId]);

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
 useLayoutEffect(()=>{
  const history=historyRef.current;
  if(history&&followNewestRef.current){
   history.scrollTop=history.scrollHeight;
   // Only acknowledge after the new messages have been painted into history.
   acknowledgeLatestIfVisible();
  }
 },[messages,initialLoading,acknowledgeLatestIfVisible]);
 useEffect(()=>{
  const previous=previousMessageIdsRef.current;
  if(previous.groupId!==group.id||previous.ownerId!==userId){
    previousMessageIdsRef.current={groupId:group.id,ownerId:userId,ids:new Set(messages.map(m=>m.id))};
    setNewMessagesBelow(0);
    return;
  }
  const newBelow=countNewIncomingBelow(messages,previous.ids,userId,followNewestRef.current);
  previous.ids=new Set(messages.map(m=>m.id));
  if(newBelow>0)setNewMessagesBelow(n=>Math.min(99,n+newBelow));
 },[messages,group.id,userId]);
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
   if(browsingOlderRef.current){
     // Sending from an archived search result should return to the current
     // conversation rather than append a new post to historical context.
     browsingOlderRef.current=false;
     followNewestRef.current=true;
     latestGroupMessageRef.current=null;
     initialPageLoadedRef.current=false;
     prependScrollRef.current=null;
     olderRequestRef.current++;
     olderLoadingRef.current=false;
     setHasOlder(false);setLoadingOlder(false);setOlderError('');
     setMessages([]);
     setInitialLoading(true);
     setShowJumpToLatest(false);
     setNewMessagesBelow(0);
     void refresh().catch(e=>setError(e instanceof Error?e.message:'Ошибка обновления группы'));
   }else{
     setMessages(current=>mergeConfirmedGroupMessages(
       current,confirmedGroupMessagesRef.current,groupId,accountId
     ));
   }
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
 <button type="button" className="ik-group-search-trigger" aria-label="Поиск сообщений в группе"
  aria-expanded={searchOpen} onClick={()=>searchOpen?closeSearch():setSearchOpen(true)}>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
   <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
  </svg>
 </button>
 </header>
 {searchOpen&&<GroupSearchPanel query={searchQuery} onQueryChange={changeSearch}
  onClose={closeSearch} results={searchResults} loading={searchLoading}
  error={searchError} hasMore={searchHasMore} locatingId={searchLocating}
  ownerId={userId} names={names}
  onMore={()=>{
   if(searchError){setSearchRetry(value=>value+1);setSearchError('');}
   else if(!searchLoading)setSearchPage(page=>page+1);
  }} onOpen={message=>{void openSearchResult(message);}}/>}
 <div className="ik-group-history-wrap">
 <div className="conversation-history" ref={historyRef} aria-busy={initialLoading} onScroll={event=>{
 const area=event.currentTarget;
 const nearBottom=!browsingOlderRef.current&&area.scrollHeight-area.scrollTop-area.clientHeight<120;
 if(area.scrollTop<100&&area.scrollHeight>area.clientHeight+30&&
    hasOlder&&!loadingOlder&&!olderError&&online&&!initialLoading){
  void loadOlder();
 }
 followNewestRef.current=nearBottom;
 setShowJumpToLatest(!nearBottom);
 if(nearBottom){setNewMessagesBelow(0);acknowledgeLatestIfVisible();}
 }}>
 {!initialLoading&&hasOlder&&<div className="ik-group-older-control">
  <button type="button" disabled={loadingOlder||!online} onClick={()=>{void loadOlder();}}>
   {loadingOlder?'Загружаем старые сообщения…':'Показать более ранние сообщения'}
  </button>
 </div>}
 {!initialLoading&&olderError&&<div className="ik-group-older-error" role="alert">
  <span>{olderError}</span>
  <button type="button" onClick={()=>{setOlderError('');void loadOlder();}}>Повторить</button>
 </div>}
 {initialLoading&&<div className="ik-chat-loading" role="status" aria-label="Загружаем сообщения группы"><div className="ik-chat-loading-bubble incoming"/><div className="ik-chat-loading-bubble incoming short"/><div className="ik-chat-loading-bubble outgoing"/><span className="ik-chat-loading-label">Загружаем сообщения…</span></div>}
 {!initialLoading&&!error&&messages.length===0&&<p className="group-empty">Группа создана. Напиши первое сообщение!</p>}
 {!initialLoading&&error&&messages.length===0&&<div className="ik-chat-load-error" role="alert">
  <strong>Не удалось загрузить сообщения группы</strong>
  <p>Проверь подключение. Сообщения не удалены.</p>
  <button type="button" onClick={()=>{setError('');setInitialLoading(true);void refresh().catch(e=>{setInitialLoading(false);setError(e instanceof Error?e.message:'Ошибка загрузки');});}}>Попробовать снова</button>
 </div>}
 {messages.map(m=><article key={m.id} data-group-message-id={m.id} className={'bubble '+(m.sender_id===userId?'mine':'theirs')}><strong className="group-author ik-name-with-status"><span>{m.sender_id===userId?'Вы':names[m.sender_id]||'Участник'}</span><StatusEmoji index={memberById.get(m.sender_id)?.status_emoji} decorative/></strong><div><ChatMessageText text={m.body}/></div><time>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
 {showJumpToLatest&&<button type="button" className="ik-group-jump-latest"
  aria-label={newMessagesBelow>0?`К последним сообщениям, новых: ${newMessagesBelow}`:'К последним сообщениям'}
  onClick={()=>{
   const history=historyRef.current;
   if(!history)return;
   const wasBrowsingArchive=browsingOlderRef.current;
   browsingOlderRef.current=false;
   followNewestRef.current=true;
   // Do not merge a potentially distant historical context with the newest
   // page: otherwise a false continuous gap appears in the chat history.
   if(wasBrowsingArchive){
    initialPageLoadedRef.current=false;
    olderRequestRef.current++;
    olderLoadingRef.current=false;
    prependScrollRef.current=null;
    setHasOlder(false);setLoadingOlder(false);setOlderError('');
    setMessages([]);
    setInitialLoading(true);
   }
   // The old context is not the latest page. Do not acknowledge it.
   latestGroupMessageRef.current=null;
   void refresh().catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки новых сообщений'));
   setShowJumpToLatest(false);
   setNewMessagesBelow(0);
   acknowledgeLatestIfVisible();
  }}>
  <span aria-hidden="true">↓</span>{newMessagesBelow>0&&<span className="ik-group-jump-count">{newMessagesBelow<99?newMessagesBelow:'99+'}</span>}
 </button>}
 </div>
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