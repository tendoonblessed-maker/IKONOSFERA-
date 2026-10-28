'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backendReady, createTemporaryAccount, consumeEmailLinkSession, clearSession, currentUser, findProfileByUsername, listChats, listMessages, manageChat, manageMessage, listMessageReactions, setMessageReaction, markChatRead, listProfiles, myProfile, postMessage, reopenChat, sendDirectMedia, sendEmailCode, signOut, startDirectChat, validSession, type ChatMessage, type MessageReaction, type DirectChat, type Profile, type Session } from '@/lib/supabase-rest';

import ProfilePanel from "@/components/ProfilePanel";
import ChatMedia from "@/components/ChatMedia";
import StoriesStrip from "@/components/StoriesStrip";
import ChannelsPanel from "@/components/ChannelsPanel";
import { REACTION_EMOJIS, type ReactionEmoji, createChannel, imageUrl, listChannels, listMySubscriptions, subscribeChannel, unsubscribeChannel, type Channel } from "@/lib/social";

type Tab = 'chats' | 'contacts' | 'channels' | 'profile' | 'settings';
type Platform = { ios: boolean; standalone: boolean };
type ChatRow = { chat: DirectChat; other: Profile | null };
const userFacingError = (error: unknown) => {
  const message=error instanceof Error?error.message:'Неизвестная ошибка';
  if(/email.rate.limit.exceeded|email.*rate.*limit|over_email_send_rate_limit/i.test(message))
    return 'Сейчас отправлено слишком много писем. В бесплатной почте Supabase действует общий лимит. Попробуй позднее — повторные нажатия не ускорят вход.';
  if(/email.*not.*confirmed/i.test(message))return 'Электронная почта ещё не подтверждена. Открой ссылку Sign in в письме.';
  if(/invalid.*token|otp.*expired|token.*expired/i.test(message))return 'Ссылка устарела или уже была использована. Запроси новое письмо для входа.';
  return message;
};

export default function AppShell({ initialUsername = "" }: { initialUsername?: string }) {
  const [tab,setTab]=useState<Tab>(initialUsername ? 'contacts' : 'chats');
  const [platform,setPlatform]=useState<Platform>({ios:false,standalone:false});
  const [session,setSession]=useState<Session|null>(null);
  const [userId,setUserId]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null);
  const [anonymous,setAnonymous]=useState(false);
  const [rows,setRows]=useState<ChatRow[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [profileTarget,setProfileTarget]=useState<string|null>(null);
  const [selectedChannel,setSelectedChannel]=useState<Channel|null>(null);
  const [channels,setChannels]=useState<Channel[]>([]);
  const [subscriptions,setSubscriptions]=useState<string[]>([]);
  const [showRecommendations,setShowRecommendations]=useState(false);
  const [channelSearch,setChannelSearch]=useState("");
  const [channelCreating,setChannelCreating]=useState(false);
  const [channelTitle,setChannelTitle]=useState("");
  const [channelSlug,setChannelSlug]=useState("");
  const [channelDescription,setChannelDescription]=useState("");
  const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const [messageReactions,setMessageReactions]=useState<MessageReaction[]>([]);
  const [messageReactionPicker,setMessageReactionPicker]=useState<string|null>(null);
  const [editingMessageId,setEditingMessageId]=useState<string|null>(null);
  const [editingMessageBody,setEditingMessageBody]=useState("");
  const [search,setSearch]=useState('');
  const [lookup,setLookup]=useState(initialUsername);
  const [draft,setDraft]=useState('');
  const [email,setEmail]=useState('');
  const [emailSent,setEmailSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [installHelp,setInstallHelp]=useState(false);
  const [installPrompt,setInstallPrompt]=useState<(Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>})|null>(null);
  const messageEnd=useRef<HTMLDivElement|null>(null);
  const selectedRef=useRef<string|null>(null);

  useEffect(()=>{selectedRef.current=selected;},[selected]);
  useEffect(()=>{
    const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const standalone=window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
    setPlatform({ios,standalone});
    const onInstall=(e:Event)=>{e.preventDefault();setInstallPrompt(e as Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>});};
    window.addEventListener('beforeinstallprompt',onInstall);
    if('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js').catch(()=>{});
    return ()=>window.removeEventListener('beforeinstallprompt',onInstall);
  },[]);

  const refresh=useCallback(async (token:string,id:string,activeChat:string|null)=>{
    const [chats,allChannels,memberships]=await Promise.all([listChats(token),listChannels(token),listMySubscriptions(token,id)]);
    setChannels(allChannels);
    setSubscriptions(memberships.map(m=>m.channel_id));
    const others=Array.from(new Set(chats.map(c=>c.user_a===id?c.user_b:c.user_a)));
    const profiles=await listProfiles(token,others);
    const byId=new Map(profiles.map(p=>[p.id,p]));
    setRows(chats.filter(chat=>!chat.hidden_for?.includes(id)).sort((a,b)=>Number(Boolean(b.pinned_for?.includes(id)))-Number(Boolean(a.pinned_for?.includes(id)))).map(chat=>({chat,other:byId.get(chat.user_a===id?chat.user_b:chat.user_a)??null})));
    if(activeChat && chats.some(chat=>chat.id===activeChat)) {
      const messages=await listMessages(token,activeChat);
      const ordered=messages.reverse();
      setChatMessages(ordered);
      setMessageReactions(await listMessageReactions(token,ordered.map(m=>m.id)));
      if(typeof document!=='undefined'&&document.visibilityState==='visible'){
        if(ordered.some(m=>m.sender_id!==id&&!m.read_at)){
          void markChatRead(token,activeChat).then(()=>listMessages(token,activeChat)).then(fresh=>{
            if(selectedRef.current===activeChat)setChatMessages(fresh.reverse());
          }).catch(()=>{});
        }
      }
    } else if(activeChat) {setSelected(null);setChatMessages([]);}
  },[]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        if(!backendReady){setLoading(false);return;}
        const valid=consumeEmailLinkSession()??await validSession();if(!valid||cancelled){return;}
        const user=await currentUser(valid.access_token);
        if(cancelled)return;
        const p=await myProfile(valid.access_token,user.id);
        setSession(valid);setUserId(user.id);setProfile(p);setAnonymous(Boolean(user.is_anonymous));
        await refresh(valid.access_token,user.id,null);
      } catch(e){if(!cancelled){clearSession();setError(userFacingError(e));}}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[refresh]);

  useEffect(()=>{
    if(!session||!userId)return;
    let cancelled=false;
    const run=async()=>{
      const valid=await validSession();
      if(!valid||cancelled){if(!cancelled){setSession(null);setUserId('');setSelected(null);}return;}
      if(valid.access_token!==session.access_token)setSession(valid);
      try{await refresh(valid.access_token,userId,selectedRef.current);}catch{ /* retry on next poll */ }
    };
    const timer=window.setInterval(()=>void run(),3000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[session,userId,refresh]);

  useEffect(()=>{messageEnd.current?.scrollIntoView({behavior:'auto'});},[chatMessages.length,selected]);

  async function requestSignInLink(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{await sendEmailCode(email.trim().toLowerCase());setEmailSent(true);setNotice('Письмо отправлено. Нажми Sign in («Войти») в письме от Supabase Auth.');}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function beginTemporaryAccount(){
    if(!backendReady||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const next=await createTemporaryAccount();
      const user=await currentUser(next.access_token);
      const p=await myProfile(next.access_token,user.id);
      if(!p)throw Error('Профиль не создан. Повтори вход позже.');
      setSession(next);setUserId(user.id);setProfile(p);setAnonymous(true);
      setSelected(null);setTab('profile');setProfileTarget(user.id);
      setNotice('Тестовый аккаунт создан. Для сохранения доступа используй вход по почте.');
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function searchPerson(username:string){
    if(!session)return;setError("");setBusy(true);
    try{const person=await findProfileByUsername(session.access_token,username);
      if(!person)throw Error("Пользователь с таким юзернеймом не найден.");
      setSelected(null);setSelectedChannel(null);setProfileTarget(person.id);setLookup("");
    }catch(e){setError(userFacingError(e));}finally{setBusy(false);}
  }
  async function openChat(username:string){if(!session||!userId)return;setError('');setBusy(true);try{const id=await startDirectChat(session.access_token,username.replace(/^@/,''));await reopenChat(session.access_token,id);setProfileTarget(null);setSelectedChannel(null);setSelected(id);setTab('chats');setLookup('');setSearch('');await refresh(session.access_token,userId,id);}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function makeChannel(e:React.FormEvent){
    e.preventDefault();if(!session||!userId||busy)return;
    setBusy(true);setError("");
    try{
      const channel=await createChannel(session.access_token,userId,channelTitle,channelSlug,channelDescription);
      setChannels(await listChannels(session.access_token));
      await subscribeChannel(session.access_token,userId,channel.id);
      setSubscriptions(prev=>[...prev,channel.id]);
      setSelectedChannel(channel);setSelected(null);setProfileTarget(null);
      setTab("channels");setChannelCreating(false);
      setChannelTitle("");setChannelSlug("");setChannelDescription("");
      setNotice("Канал создан. Теперь можно публиковать посты.");
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function toggleSubscription(channelId:string){
    if(!session||!userId||busy)return;
    setBusy(true);setError("");
    try{
      if(subscriptions.includes(channelId)){
        await unsubscribeChannel(session.access_token,userId,channelId);
        setSubscriptions(prev=>prev.filter(id=>id!==channelId));
        if(selectedChannel?.id===channelId)setSelectedChannel(null);
      }else{
        await subscribeChannel(session.access_token,userId,channelId);
        setSubscriptions(prev=>[...prev,channelId]);
      }
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function getChannelOwnerAndChat(ownerId:string){
    if(!session||ownerId===userId)return;
    try{const people=await listProfiles(session.access_token,[ownerId]);if(people[0])await openChat(people[0].username);}
    catch(e){setError(userFacingError(e));}
  }
  function openDirectFromProfile(username:string){void openChat(username);}
  function goToProfile(id:string){
    if(!id)return;setSelected(null);setSelectedChannel(null);setProfileTarget(id);setError("");
  }
  function switchTab(next:Tab){
    setTab(next);setSelected(null);setSelectedChannel(null);setProfileTarget(next==="profile"&&userId?userId:null);setShowRecommendations(false);setError("");
  }
  async function sendMessage(e:React.FormEvent){e.preventDefault();if(!session||!selected||!userId||sending)return;const body=draft.trim();if(!body||body.length>4000)return;setSending(true);setError('');try{await postMessage(session.access_token,selected,userId,body);setDraft('');setChatMessages((await listMessages(session.access_token,selected)).reverse());}catch(e){setError(userFacingError(e));}finally{setSending(false);}}
  async function chatAction(chatId:string,action:"hide"|"pin"|"unpin"|"delete_everyone"){
    if(!session||!userId)return;
    if(action==="delete_everyone"&&!window.confirm("Удалить диалог и все сообщения у обоих участников?"))return;
    if(action==="hide"&&!window.confirm("Скрыть диалог только у себя?"))return;
    try{await manageChat(session.access_token,chatId,action);if(selected===chatId&&(action==="hide"||action==="delete_everyone"))setSelected(null);
      await refresh(session.access_token,userId,action==="hide"||action==="delete_everyone"?null:selected);
    }catch(e){setError(userFacingError(e));}
  }
  async function messageAction(messageId:string,action:"hide"|"delete_everyone"|"edit",body?:string){
    if(!session||!selected||!userId)return;
    if(action==="delete_everyone"&&!window.confirm("Удалить сообщение для обоих?"))return;
    try{await manageMessage(session.access_token,messageId,action,body);
      setEditingMessageId(null);setChatMessages((await listMessages(session.access_token,selected)).reverse());
    }catch(e){setError(userFacingError(e));}
  }
  async function reactToMessage(messageId:string,emoji:ReactionEmoji){
    if(!session||!userId||sending)return;
    const previous=messageReactions.find(r=>r.message_id===messageId&&r.user_id===userId);
    setSending(true);setError("");
    try{await setMessageReaction(session.access_token,userId,messageId,previous?.emoji===emoji?null:emoji);
      setMessageReactions(await listMessageReactions(session.access_token,chatMessages.map(m=>m.id)));
      setMessageReactionPicker(null);
    }catch(e){setError(userFacingError(e));}finally{setSending(false);}
  }
  async function sendAttachment(file:File|undefined){
    if(!file||!session||!selected||!userId||sending)return;
    setSending(true);setError("");
    try{
      await sendDirectMedia(session.access_token,selected,userId,file);
      setChatMessages((await listMessages(session.access_token,selected)).reverse());
      setNotice("Вложение отправлено.");
    }catch(e){setError(userFacingError(e));}
    finally{setSending(false);}
  }
  async function logout(){if(!session)return;if(anonymous&&!window.confirm('Это временный аккаунт. После выхода восстановить его нельзя. Выйти?'))return;setBusy(true);try{await signOut(session.access_token);}catch(e){setError(userFacingError(e));}finally{clearSession();setSession(null);setUserId('');setProfile(null);setAnonymous(false);setRows([]);setSelected(null);setProfileTarget(null);setSelectedChannel(null);setChannels([]);setChatMessages([]);setBusy(false);}}
  async function install(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}else setInstallHelp(true);}
  const storyContacts=useMemo(()=>rows.map(row=>row.other).filter((p):p is Profile=>Boolean(p)),[rows]);
  const active=rows.find(r=>r.chat.id===selected);
  const filtered=rows.filter(r=>!search.trim()||`${r.other?.display_name??''} ${r.other?.username??''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const loggedIn=Boolean(session&&userId);
  const detailOpen=Boolean(!loggedIn||selected||profileTarget||selectedChannel);
  const myChannels=channels.filter(ch=>ch.owner_id===userId||subscriptions.includes(ch.id));
  const recommendedChannels=channels.filter(ch=>ch.owner_id!==userId&&!subscriptions.includes(ch.id));
  const filteredChannels=(showRecommendations?recommendedChannels:myChannels).filter(ch=>!channelSearch.trim()||((ch.title+" "+ch.slug).toLowerCase().includes(channelSearch.trim().toLowerCase())));

  return <div className={`messenger ${loggedIn?"is-authenticated":"is-guest"}`} data-version="windows-desktop-v3">
    <aside className={`chats-pane ${detailOpen?'has-conversation':''}`}>
      <div className="pane-heading"><div className="brand-label"><img className="brand-mini" src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={132} height={70}/></div><button type="button" className="release-pill" onClick={()=>profile?.id&&goToProfile(profile.id)} disabled={!profile}>{profile ? "@"+profile.username : "ALPHA"}</button></div>
      <div className="pane-toolbar"><h1>{tab==='chats'?'Чаты':tab==='contacts'?'Контакты':tab==='channels'?'Каналы':tab==='profile'?'Профиль':'Настройки'}</h1><button type="button" className="icon-button" title="Создать чат" aria-label="Новый чат" onClick={()=>{switchTab(tab==='channels'?'channels':'contacts');if(tab==='channels')setChannelCreating(true);}} disabled={!loggedIn}>＋</button></div>
      {tab==='chats'&&<div className="pane-search"><span aria-hidden="true">⌕</span><input aria-label="Поиск по чатам" placeholder="Поиск" value={search} onChange={e=>setSearch(e.target.value)} disabled={!loggedIn}/></div>}
      {tab==='chats'&&loggedIn&&session&&<StoriesStrip token={session.access_token} userId={userId} contacts={storyContacts} ownProfile={profile}/>}
      <div className="chat-list">
      {tab==='chats'&&(loggedIn?filtered.length?filtered.map(row=><div key={row.chat.id} className="chat-row-wrap"><button type="button" className={`chat-item ${selected===row.chat.id?'active':''}`} onClick={()=>{setSelected(row.chat.id);setSelectedChannel(null);setProfileTarget(null);setChatMessages([]);setError('');}}><span className="contact-avatar">{imageUrl(row.other?.avatar_path)?<img className="avatar-image" src={imageUrl(row.other?.avatar_path)||""} alt=""/>:(row.other?.display_name||'?').slice(0,1).toUpperCase()}</span><span className="contact-info"><strong>{row.other?.display_name??'Собеседник'}</strong><small>@{row.other?.username??'unknown'}</small></span><span className="chat-item-dot"/></button><details className="chat-row-menu"><summary aria-label="Действия с чатом" title="Управление чатом">···</summary><div className="chat-row-actions"><button type="button" title="Закрепить или открепить" onClick={()=>void chatAction(row.chat.id,row.chat.pinned_for?.includes(userId)?"unpin":"pin")}>{row.chat.pinned_for?.includes(userId)?"📌":"♧"}</button><button type="button" title="Удалить чат для себя" onClick={()=>void chatAction(row.chat.id,"hide")}>Скрыть</button><button type="button" title="Удалить чат для обоих" onClick={()=>void chatAction(row.chat.id,"delete_everyone")}>Удалить всем</button></div></details></div>):<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>Нажми +, чтобы найти человека по юзернейму и начать общение.</p><button className="secondary-action" onClick={()=>setTab('contacts')}>Новый чат</button></div>:<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>{backendReady?'Войди, чтобы читать сообщения.':'Для переписки осталось подключить сервер.'}</p></div>)}
      {tab==='contacts'&&<div className="contact-search-panel"><h2>Поиск пользователя</h2><p>Открой профиль по юзернейму. Диалог создастся только после нажатия «Написать сообщение».</p><form onSubmit={e=>{e.preventDefault();void searchPerson(lookup.trim());}}><label htmlFor="lookup">Юзернейм</label><input id="lookup" placeholder="например, friend_01" value={lookup} onChange={e=>setLookup(e.target.value)} minLength={3} maxLength={25} disabled={!loggedIn}/><button className="accent-button" disabled={!loggedIn||busy||!lookup.trim()}>{busy?'Ищем…':'Найти профиль'}</button></form></div>}

      {tab==='channels'&&<div className="channel-browser">
        <div className="channel-tools"><input aria-label="Поиск каналов" value={channelSearch} onChange={e=>setChannelSearch(e.target.value)} placeholder="Поиск каналов" disabled={!loggedIn}/><button type="button" className="secondary-action" disabled={!loggedIn} onClick={()=>setChannelCreating(v=>!v)}>{channelCreating?"Закрыть":"＋ Создать канал"}</button></div>
        {channelCreating&&<form className="channel-create-form" onSubmit={makeChannel}><label>Название<input maxLength={80} value={channelTitle} onChange={e=>setChannelTitle(e.target.value)} placeholder="Мой канал" required/></label>
          <label>Адрес канала<input pattern="[a-z0-9_]{3,32}" maxLength={32} minLength={3} value={channelSlug} onChange={e=>setChannelSlug(e.target.value.toLowerCase())} placeholder="my_channel" required/></label>
          <label>Описание<textarea maxLength={500} value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} placeholder="О чём этот канал?"/></label>
          <button type="submit" className="accent-button" disabled={busy||!loggedIn}>{busy?"Создаём…":"Создать"}</button>
        </form>}
        <div className="channel-browser-tabs"><button type="button" className={!showRecommendations?"selected":""} onClick={()=>setShowRecommendations(false)}>Мои каналы</button><button type="button" className={showRecommendations?"selected":""} onClick={()=>setShowRecommendations(true)}>Рекомендации</button></div>
        <div className="channel-list">{filteredChannels.length?filteredChannels.map(ch=><div key={ch.id} className={"channel-list-row"+(ch.id===selectedChannel?.id?" active":"")}>
          <button type="button" className="channel-row-open" onClick={()=>{setSelectedChannel(ch);setSelected(null);setProfileTarget(null);setError("");}}><span className="channel-list-icon">#</span><span><strong>{ch.title}</strong><small>@{ch.slug}</small></span></button>
          {ch.owner_id===userId?<span className="channel-owner-badge">Мой</span>:<button type="button" disabled={busy} className="channel-subscribe-button" onClick={()=>void toggleSubscription(ch.id)}>{subscriptions.includes(ch.id)?"Отписаться":"Подписаться"}</button>}
        </div>):<p className="channel-empty-list">{!loggedIn?"Войди, чтобы увидеть каналы.":showRecommendations?"Новых рекомендаций пока нет.":"Ты ещё не подписан на каналы. Загляни в рекомендации."}</p>}</div>
      </div>}
      {tab==='settings'&&<div className="settings-panel"><h2>Мой профиль</h2>{loggedIn?<><button type="button" className="open-own-profile" onClick={()=>goToProfile(userId)}><span className="contact-avatar">{imageUrl(profile?.avatar_path)?<img className="avatar-image" src={imageUrl(profile?.avatar_path)||""} alt=""/>:(profile?.display_name||'?').charAt(0).toUpperCase()}</span><span><strong>{profile?.display_name||"Мой профиль"}</strong><small>Оформление · фото · истории</small></span><span>›</span></button><p>Люди могут найти тебя по уникальному имени.</p>{anonymous&&<p className="test-account-warning">Тестовый аккаунт без почты: доступ хранится только на этом устройстве. После удаления приложения, очистки данных или выхода восстановить его нельзя.</p>}<button type="button" className="settings-edit-button" onClick={()=>goToProfile(userId)}>✎ Редактировать профиль</button><button className="secondary-action" onClick={logout} disabled={busy}>Выйти из аккаунта</button></>:<p>Войди, чтобы настроить профиль.</p>}<div className="settings-meta"><span>Платформа</span><strong>{platform.ios?'iPhone / iPad':'Android / Desktop'}</strong><span>Запуск</span><strong>{platform.standalone?'Установленное приложение':'Браузер'}</strong><span>Сервер</span><strong>{backendReady?'Настроен':'Не подключён'}</strong></div>{!platform.standalone&&<button className="secondary-action" onClick={()=>void install()}>Установить приложение</button>}</div>}
      </div>
      <nav className="pane-nav" aria-label="Основные разделы">
  <button type="button" aria-label="Чаты" aria-current={tab==='chats'?'page':undefined} className={tab==='chats'?'current':''} onClick={()=>switchTab('chats')}><span className="nav-art"><img src="/nav-chats.webp" alt="" width="64" height="64"/></span><span className="nav-label">Чаты</span></button>
  <button type="button" aria-label="Контакты" aria-current={tab==='contacts'?'page':undefined} className={tab==='contacts'?'current':''} onClick={()=>switchTab('contacts')}><span className="nav-art"><img src="/nav-contacts.webp" alt="" width="64" height="64"/></span><span className="nav-label">Контакты</span></button>
  <button type="button" aria-label="Каналы" aria-current={tab==='channels'?'page':undefined} className={tab==='channels'?'current':''} onClick={()=>switchTab('channels')}><span className="nav-art nav-art-channel"><span className="channel-nav-symbol">#</span></span><span className="nav-label">Каналы</span></button>
  <button type="button" aria-label="Профиль" aria-current={tab==='profile'?'page':undefined} className={tab==='profile'?'current':''} onClick={()=>switchTab('profile')}><span className="nav-art"><img src="/nav-profile.webp" alt="" width="64" height="64"/></span><span className="nav-label">Профиль</span></button>
  <button type="button" aria-label="Настройки" aria-current={tab==='settings'?'page':undefined} className={tab==='settings'?'current':''} onClick={()=>switchTab('settings')}><span className="nav-art"><img src="/nav-settings.webp" alt="" width="64" height="64"/></span><span className="nav-label">Настройки</span></button>
</nav>
    </aside>
    <main className={`conversation-pane ${detailOpen?'open':''}`}>
      {profileTarget&&session&&loggedIn?<ProfilePanel key={profileTarget} token={session.access_token} userId={userId} targetId={profileTarget} onBack={()=>{setProfileTarget(null);if(tab==='profile')setTab('chats');}} onOwnProfileChange={()=>{void myProfile(session.access_token,userId).then(setProfile).catch(()=>{});}} onMessage={openDirectFromProfile} onOpenChannel={channel=>{setProfileTarget(null);setSelected(null);setSelectedChannel(channel);setTab("channels");}}/>:
      selectedChannel&&session&&loggedIn?<ChannelsPanel key={selectedChannel.id} token={session.access_token} userId={userId} channel={selectedChannel} onBack={()=>setSelectedChannel(null)} onShowProfile={goToProfile} subscribed={subscriptions.includes(selectedChannel.id)||selectedChannel.owner_id===userId} onToggleSubscribe={()=>void toggleSubscription(selectedChannel.id)} onMessageAuthor={()=>void getChannelOwnerAndChat(selectedChannel.owner_id)} onChannelUpdated={updated=>{setSelectedChannel(updated);setChannels(old=>old.map(ch=>ch.id===updated.id?updated:ch));}} onChannelDeleted={()=>{setSelectedChannel(null);setChannels(old=>old.filter(ch=>ch.id!==selectedChannel.id));setTab("channels");}}/>:
      
      active&&loggedIn?<><header className="conversation-header"><button className="back-button" onClick={()=>setSelected(null)} aria-label="Назад к чатам">‹</button><button type="button" className="contact-avatar small contact-avatar-button" onClick={()=>active.other&&goToProfile(active.other.id)} title="Открыть профиль">{imageUrl(active.other?.avatar_path)?<img className="avatar-image" src={imageUrl(active.other?.avatar_path)||""} alt=""/>:(active.other?.display_name||'?').slice(0,1).toUpperCase()}</button><button type="button" className="conversation-heading conversation-heading-link" onClick={()=>active.other&&goToProfile(active.other.id)}><strong>{active.other?.display_name??'Собеседник'}</strong><small>@{active.other?.username??'unknown'}</small></button></header><div className="conversation-history" aria-live="polite">{!chatMessages.length&&<div className="conversation-blank"><span>Начало переписки</span><p>Сообщения видны только участникам диалога.</p></div>}{chatMessages.filter(message=>!message.deleted_for?.includes(userId)).map(message=><div key={message.id} className={`bubble ${message.sender_id===userId?'mine':'theirs'}`}>{!message.deleted_for_everyone&&message.media_path&&message.media_type&&session&&<ChatMedia token={session.access_token} path={message.media_path} type={message.media_type}/>} {message.deleted_for_everyone?<span className="message-deleted">Сообщение удалено</span>:editingMessageId===message.id?<form className="message-edit-form" onSubmit={e=>{e.preventDefault();void messageAction(message.id,"edit",editingMessageBody);}}><input value={editingMessageBody} onChange={e=>setEditingMessageBody(e.target.value)} maxLength={4000}/><button type="submit">Сохранить</button><button type="button" onClick={()=>setEditingMessageId(null)}>Отмена</button></form>:message.body&&<span>{message.body}</span>}<time dateTime={message.created_at}>{message.edited_at&&!message.deleted_for_everyone&&<span className="message-edited-label" title="Сообщение отредактировано">изм. · </span>}{message.sender_id===userId&&<span className={"message-receipt"+(message.read_at?" read":"")} title={message.read_at?"Просмотрено":"Отправлено"}>{message.read_at?"✓✓":"✓"}</span>}{new Date(message.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time>{!message.deleted_for_everyone&&<details className="message-menu"><summary aria-label="Действия с сообщением" title="Действия с сообщением">···</summary><div className="message-manage-actions">{message.sender_id===userId&&<button type="button" onClick={()=>{setEditingMessageId(message.id);setEditingMessageBody(message.body);}}>Изменить</button>}<button type="button" onClick={()=>void messageAction(message.id,"hide")}>Удалить у себя</button>{message.sender_id===userId&&<button type="button" onClick={()=>void messageAction(message.id,"delete_everyone")}>Удалить у всех</button>}</div></details>}<div className="reaction-bar message-reaction-bar">
 {REACTION_EMOJIS.filter(emoji=>messageReactions.some(r=>r.message_id===message.id&&r.emoji===emoji)).map(emoji=><button key={emoji} type="button" className={"reaction-pill"+(messageReactions.some(r=>r.message_id===message.id&&r.user_id===userId&&r.emoji===emoji)?" mine":"")} onClick={()=>void reactToMessage(message.id,emoji)} disabled={sending}>{emoji} <span>{messageReactions.filter(r=>r.message_id===message.id&&r.emoji===emoji).length}</span></button>)}
 <button type="button" className="reaction-add" aria-label="Добавить реакцию" onClick={()=>setMessageReactionPicker(messageReactionPicker===message.id?null:message.id)}>☺ +</button>
 {messageReactionPicker===message.id&&<div className="reaction-picker">{REACTION_EMOJIS.map(emoji=><button type="button" key={emoji} disabled={sending} onClick={()=>void reactToMessage(message.id,emoji)} aria-label={"Реакция "+emoji}>{emoji}</button>)}</div>}
 </div></div>)}<div ref={messageEnd}/></div><form className="composer" onSubmit={sendMessage}><label className="chat-attach-button" title="Прикрепить фото, видео, музыку или файл" aria-label="Прикрепить файл">＋<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" disabled={sending} onChange={e=>{void sendAttachment(e.target.files?.[0]);e.target.value="";}}/></label><input aria-label="Написать сообщение" placeholder="Сообщение…" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4000}/><button type="submit" className="send-button" disabled={!draft.trim()||sending} aria-label="Отправить сообщение">➤</button></form></>:<div className="conversation-placeholder">{!loggedIn&&<div className="guest-brand"><img src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={250} height={108}/><span>© BY TENDO888</span></div>}{loggedIn&&<div className="welcome-mark" aria-hidden="true">IKONOSFERA<span> / DESKTOP</span></div>}<h2>{loggedIn?'Твои разговоры начинаются здесь':emailSent?'Остался один шаг':'Больше чем просто мессенджер'}</h2><p>{loggedIn?'Выбери переписку слева или найди человека по юзернейму.':emailSent?'Открой письмо и перейди по ссылке Sign in.':'IKONOSFERA — современный мессенджер для Android, iPhone, macOS и Windows. Работает без VPN и ограничений!'}</p>{loggedIn&&<div className="desktop-welcome-actions"><button type="button" className="accent-button" onClick={()=>switchTab('contacts')}>＋ Найти человека</button><button type="button" className="secondary-action" onClick={()=>switchTab('channels')}>Открыть каналы</button></div>}{!loggedIn&&(backendReady?<div className="auth-panel"><h3>{emailSent?'Проверь почту':'Войти или зарегистрироваться'}</h3>{!emailSent?<form onSubmit={requestSignInLink}><label htmlFor="authEmail">Электронная почта</label><input id="authEmail" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/><button className="accent-button" disabled={busy}>{busy?'Отправляем…':'Получить ссылку для входа'}</button></form>:<div className="email-signin-result"><div className="email-signin-guide" role="status"><strong>Письмо отправлено на {email}</strong><p>Открой почту и найди письмо от <b>Supabase Auth</b> с темой <b>Your sign-in link</b>.</p><p>Нажми синюю ссылку <b>Sign in</b> («Войти»). После перехода IKONOSFERA откроется с твоим аккаунтом.</p><small>Если письма нет, проверь «Спам». Ссылка одноразовая; вводить код не требуется.</small></div><button type="button" className="text-button" onClick={()=>{setEmailSent(false);setError('');}}>Использовать другой адрес</button></div>}<div className="temporary-login"><button type="button" className="secondary-action" onClick={()=>void beginTemporaryAccount()} disabled={busy}>Попробовать без почты — тестовый аккаунт</button><p>Бесплатный тестовый вход. Для работы требуется включить Anonymous Sign-Ins в Supabase. Не используй реальные личные данные.</p></div></div>:<div className="setup-notice"><strong>Подключаем сообщения</strong><p>Сервер переписки ещё не настроен. Как только будет подключена база, здесь появится вход.</p></div>)}</div>}
    </main>
    {(error||notice)&&<div role="status" className={`toast ${error?'toast-error':''}`}><span>{error||notice}</span><button aria-label="Закрыть уведомление" onClick={()=>{setError('');setNotice('');}}>×</button></div>}
    {installHelp&&<div className="install-backdrop" role="dialog" aria-modal="true" aria-label="Установка приложения"><div className="install-card"><h2>Установить IKONOSFERA</h2><p>{platform.ios?'Открой страницу в Safari → «Поделиться» → «На экран Домой» → «Добавить».':'В Chrome на Android открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».'}</p><button className="accent-button" onClick={()=>setInstallHelp(false)}>Понятно</button></div></div>}
    {loading&&<div className="initializing"><img src="/branding/ikonosfera.svg" alt="IKONOSFERA © BY TENDO888" width={1266} height={734}/><span>Загружаем переписки…</span></div>}
  </div>;
}
