'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { backendReady, changeProfile, createTemporaryAccount, clearSession, currentUser, listChats, listMessages, listProfiles, myProfile, postMessage, sendEmailCode, signOut, startDirectChat, validSession, verifyEmailCode, type ChatMessage, type DirectChat, type Profile, type Session } from '@/lib/supabase-rest';

import ProfilePanel from "@/components/ProfilePanel";
import ChannelsPanel from "@/components/ChannelsPanel";
import SleepyPixelCat from "@/components/SleepyPixelCat";
import { createChannel, imageUrl, listChannels, type Channel } from "@/lib/social";

type Tab = 'chats' | 'contacts' | 'channels' | 'settings';
type Platform = { ios: boolean; standalone: boolean };
type ChatRow = { chat: DirectChat; other: Profile | null };
const userFacingError = (error: unknown) => error instanceof Error ? error.message : 'Неизвестная ошибка';

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
  const [channelSearch,setChannelSearch]=useState("");
  const [channelCreating,setChannelCreating]=useState(false);
  const [channelTitle,setChannelTitle]=useState("");
  const [channelSlug,setChannelSlug]=useState("");
  const [channelDescription,setChannelDescription]=useState("");
  const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const [search,setSearch]=useState('');
  const [lookup,setLookup]=useState(initialUsername);
  const [draft,setDraft]=useState('');
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [codeSent,setCodeSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sending,setSending]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [editName,setEditName]=useState('');
  const [editUsername,setEditUsername]=useState('');
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
    const [chats,allChannels]=await Promise.all([listChats(token),listChannels(token)]);
    setChannels(allChannels);
    const others=Array.from(new Set(chats.map(c=>c.user_a===id?c.user_b:c.user_a)));
    const profiles=await listProfiles(token,others);
    const byId=new Map(profiles.map(p=>[p.id,p]));
    setRows(chats.map(chat=>({chat,other:byId.get(chat.user_a===id?chat.user_b:chat.user_a)??null})));
    if(activeChat && chats.some(chat=>chat.id===activeChat)) {
      const messages=await listMessages(token,activeChat);
      setChatMessages(messages.reverse());
    } else if(activeChat) {setSelected(null);setChatMessages([]);}
  },[]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try {
        if(!backendReady){setLoading(false);return;}
        const valid=await validSession();if(!valid||cancelled){return;}
        const user=await currentUser(valid.access_token);
        if(cancelled)return;
        const p=await myProfile(valid.access_token,user.id);
        setSession(valid);setUserId(user.id);setProfile(p);setAnonymous(Boolean(user.is_anonymous));
        setEditName(p?.display_name??'');setEditUsername(p?.username??'');
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

  async function requestCode(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{await sendEmailCode(email.trim().toLowerCase());setCodeSent(true);setNotice('Проверь почту. Введи полученный шестизначный код.');}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function confirmCode(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{const next=await verifyEmailCode(email.trim().toLowerCase(),code.trim());const user=await currentUser(next.access_token);const p=await myProfile(next.access_token,user.id);setUserId(user.id);setSession(next);setProfile(p);setAnonymous(Boolean(user.is_anonymous));setEditUsername(p?.username??'');setEditName(p?.display_name??'');await refresh(next.access_token,user.id,null);setCode('');setNotice('');}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function beginTemporaryAccount(){
    if(!backendReady||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const next=await createTemporaryAccount();
      const user=await currentUser(next.access_token);
      const p=await myProfile(next.access_token,user.id);
      if(!p)throw Error('Профиль не создан. Повтори вход позже.');
      setSession(next);setUserId(user.id);setProfile(p);setAnonymous(true);
      setEditUsername(p.username);setEditName(p.display_name);
      setSelected(null);setTab('settings');
      setNotice('Тестовый аккаунт создан. Выбери имя пользователя, чтобы друг смог тебя найти.');
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function openChat(username:string){if(!session||!userId)return;setError('');setBusy(true);try{const id=await startDirectChat(session.access_token,username.replace(/^@/,''));setProfileTarget(null);setSelectedChannel(null);setSelected(id);setTab('chats');setLookup('');setSearch('');await refresh(session.access_token,userId,id);}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function makeChannel(e:React.FormEvent){
    e.preventDefault();if(!session||!userId||busy)return;
    setBusy(true);setError("");
    try{
      const channel=await createChannel(session.access_token,userId,channelTitle,channelSlug,channelDescription);
      setChannels(await listChannels(session.access_token));
      setSelectedChannel(channel);setSelected(null);setProfileTarget(null);
      setTab("channels");setChannelCreating(false);
      setChannelTitle("");setChannelSlug("");setChannelDescription("");
      setNotice("Канал создан. Теперь можно публиковать посты.");
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  function goToProfile(id:string){
    if(!id)return;setSelected(null);setSelectedChannel(null);setProfileTarget(id);setError("");
  }
  function switchTab(next:Tab){
    setTab(next);setSelected(null);setSelectedChannel(null);setProfileTarget(null);setError("");
  }
  async function sendMessage(e:React.FormEvent){e.preventDefault();if(!session||!selected||!userId||sending)return;const body=draft.trim();if(!body||body.length>4000)return;setSending(true);setError('');try{await postMessage(session.access_token,selected,userId,body);setDraft('');setChatMessages((await listMessages(session.access_token,selected)).reverse());}catch(e){setError(userFacingError(e));}finally{setSending(false);}}
  async function saveProfile(e:React.FormEvent){e.preventDefault();if(!session||!userId)return;setBusy(true);setError('');try{const p=await changeProfile(session.access_token,userId,editUsername.trim().toLowerCase().replace(/^@/,''),editName.trim());setProfile(p);setNotice('Профиль сохранён');}catch(e){setError(userFacingError(e));}finally{setBusy(false);}}
  async function logout(){if(!session)return;if(anonymous&&!window.confirm('Это временный аккаунт. После выхода восстановить его нельзя. Выйти?'))return;setBusy(true);try{await signOut(session.access_token);}catch(e){setError(userFacingError(e));}finally{clearSession();setSession(null);setUserId('');setProfile(null);setAnonymous(false);setRows([]);setSelected(null);setProfileTarget(null);setSelectedChannel(null);setChannels([]);setChatMessages([]);setBusy(false);}}
  async function install(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}else setInstallHelp(true);}
  const active=rows.find(r=>r.chat.id===selected);
  const filtered=rows.filter(r=>!search.trim()||`${r.other?.display_name??''} ${r.other?.username??''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const loggedIn=Boolean(session&&userId);
  const detailOpen=Boolean(!loggedIn||selected||profileTarget||selectedChannel);
  const filteredChannels=channels.filter(ch=>!channelSearch.trim()||((ch.title+" "+ch.slug).toLowerCase().includes(channelSearch.trim().toLowerCase())));

  return <div className="messenger" data-version="white-social-v2">
    <aside className={`chats-pane ${detailOpen?'has-conversation':''}`}>
      <div className="pane-heading"><div className="brand-label"><img className="brand-mini" src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={132} height={70}/></div><button type="button" className="release-pill" onClick={()=>profile?.id&&goToProfile(profile.id)} disabled={!profile}>{profile ? "@"+profile.username : "ALPHA"}</button></div>
      <div className="pane-toolbar"><h1>{tab==='chats'?'Чаты':tab==='contacts'?'Контакты':tab==='channels'?'Каналы':'Настройки'}</h1><button type="button" className="icon-button" title="Создать чат" aria-label="Новый чат" onClick={()=>{switchTab(tab==='channels'?'channels':'contacts');if(tab==='channels')setChannelCreating(true);}} disabled={!loggedIn}>＋</button></div>
      {tab==='chats'&&<div className="pane-search"><span aria-hidden="true">⌕</span><input aria-label="Поиск по чатам" placeholder="Поиск" value={search} onChange={e=>setSearch(e.target.value)} disabled={!loggedIn}/></div>}
      <div className="chat-list">
      {tab==='chats'&&(loggedIn?filtered.length?filtered.map(row=><button type="button" key={row.chat.id} className={`chat-item ${selected===row.chat.id?'active':''}`} onClick={()=>{setSelected(row.chat.id);setSelectedChannel(null);setProfileTarget(null);setChatMessages([]);setError('');}}><span className="contact-avatar">{imageUrl(row.other?.avatar_path)?<img className="avatar-image" src={imageUrl(row.other?.avatar_path)||""} alt=""/>:(row.other?.display_name||'?').slice(0,1).toUpperCase()}</span><span className="contact-info"><strong>{row.other?.display_name??'Собеседник'}</strong><small>@{row.other?.username??'unknown'}</small></span><span className="chat-item-dot"/></button>):<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>Нажми +, чтобы найти человека по юзернейму и начать общение.</p><button className="secondary-action" onClick={()=>setTab('contacts')}>Новый чат</button></div>:<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>{backendReady?'Войди, чтобы читать сообщения.':'Для переписки осталось подключить сервер.'}</p></div>)}
      {tab==='contacts'&&<div className="contact-search-panel"><h2>Новый диалог</h2><p>Введи юзернейм другого пользователя IKONOSFERA.</p><form onSubmit={e=>{e.preventDefault();void openChat(lookup.trim());}}><label htmlFor="lookup">Юзернейм</label><input id="lookup" placeholder="например, friend_01" value={lookup} onChange={e=>setLookup(e.target.value)} minLength={3} maxLength={25} disabled={!loggedIn}/><button className="accent-button" disabled={!loggedIn||busy||!lookup.trim()}>{busy?'Открываем…':'Начать переписку'}</button></form></div>}

      {tab==='channels'&&<div className="channel-browser">
        <div className="channel-tools"><input aria-label="Поиск каналов" value={channelSearch} onChange={e=>setChannelSearch(e.target.value)} placeholder="Поиск каналов" disabled={!loggedIn}/><button type="button" className="secondary-action" disabled={!loggedIn} onClick={()=>setChannelCreating(v=>!v)}>{channelCreating?"Закрыть":"＋ Создать канал"}</button></div>
        {channelCreating&&<form className="channel-create-form" onSubmit={makeChannel}><label>Название<input maxLength={80} value={channelTitle} onChange={e=>setChannelTitle(e.target.value)} placeholder="Мой канал" required/></label>
          <label>Адрес канала<input pattern="[a-z0-9_]{3,32}" maxLength={32} minLength={3} value={channelSlug} onChange={e=>setChannelSlug(e.target.value.toLowerCase())} placeholder="my_channel" required/></label>
          <label>Описание<textarea maxLength={500} value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} placeholder="О чём этот канал?"/></label>
          <button type="submit" className="accent-button" disabled={busy||!loggedIn}>{busy?"Создаём…":"Создать"}</button>
        </form>}
        <div className="channel-list">{filteredChannels.length?filteredChannels.map(ch=><button type="button" key={ch.id} className={"channel-list-row"+(ch.id===selectedChannel?.id?" active":"")} onClick={()=>{setSelectedChannel(ch);setSelected(null);setProfileTarget(null);setError("");}}><span className="channel-list-icon">#</span><span><strong>{ch.title}</strong><small>@{ch.slug}</small></span></button>):<p className="channel-empty-list">{loggedIn?"Каналов пока нет. Создай первый!":"Войди, чтобы увидеть каналы."}</p>}</div>
      </div>}
      {tab==='settings'&&<div className="settings-panel"><h2>Мой профиль</h2>{loggedIn?<><button type="button" className="open-own-profile" onClick={()=>goToProfile(userId)}><span className="contact-avatar">{imageUrl(profile?.avatar_path)?<img className="avatar-image" src={imageUrl(profile?.avatar_path)||""} alt=""/>:(profile?.display_name||'?').charAt(0).toUpperCase()}</span><span><strong>{profile?.display_name||"Мой профиль"}</strong><small>Оформление · фото · истории</small></span><span>›</span></button><p>Люди могут найти тебя по уникальному имени.</p>{anonymous&&<p className="test-account-warning">Тестовый аккаунт без почты: доступ хранится только на этом устройстве. После удаления приложения, очистки данных или выхода восстановить его нельзя.</p>}<form onSubmit={saveProfile}><label htmlFor="username">Юзернейм</label><input id="username" value={editUsername} onChange={e=>setEditUsername(e.target.value)} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required/><label htmlFor="displayName">Отображаемое имя</label><input id="displayName" value={editName} onChange={e=>setEditName(e.target.value)} maxLength={60} required/><button className="accent-button" disabled={busy}>Сохранить профиль</button></form><button className="secondary-action" onClick={logout} disabled={busy}>Выйти из аккаунта</button></>:<p>Войди, чтобы настроить профиль.</p>}<div className="settings-meta"><span>Платформа</span><strong>{platform.ios?'iPhone / iPad':'Android / Desktop'}</strong><span>Запуск</span><strong>{platform.standalone?'Установленное приложение':'Браузер'}</strong><span>Сервер</span><strong>{backendReady?'Настроен':'Не подключён'}</strong></div>{!platform.standalone&&<button className="secondary-action" onClick={()=>void install()}>Установить приложение</button>}</div>}
      </div>
      <nav className="pane-nav" aria-label="Основные разделы"><button className={tab==='chats'?'current':''} onClick={()=>switchTab('chats')}><span>◉</span>Чаты</button><button className={tab==='contacts'?'current':''} onClick={()=>switchTab('contacts')}><span>♧</span>Контакты</button><button className={tab==='channels'?'current':''} onClick={()=>switchTab('channels')}><span>▤</span>Каналы</button><button className={tab==='settings'?'current':''} onClick={()=>switchTab('settings')}><span>⚙</span>Профиль</button></nav>
    </aside>
    <main className={`conversation-pane ${detailOpen?'open':''}`}>
      {profileTarget&&session&&loggedIn?<ProfilePanel key={profileTarget} token={session.access_token} userId={userId} targetId={profileTarget} onBack={()=>setProfileTarget(null)} onOwnProfileChange={()=>{void myProfile(session.access_token,userId).then(setProfile).catch(()=>{});}}/>:
      selectedChannel&&session&&loggedIn?<ChannelsPanel key={selectedChannel.id} token={session.access_token} userId={userId} channel={selectedChannel} onBack={()=>setSelectedChannel(null)} onShowProfile={goToProfile}/>:
      
      {active&&loggedIn?<><header className="conversation-header"><button className="back-button" onClick={()=>setSelected(null)} aria-label="Назад к чатам">‹</button><button type="button" className="contact-avatar small contact-avatar-button" onClick={()=>active.other&&goToProfile(active.other.id)} title="Открыть профиль">{imageUrl(active.other?.avatar_path)?<img className="avatar-image" src={imageUrl(active.other?.avatar_path)||""} alt=""/>:(active.other?.display_name||'?').slice(0,1).toUpperCase()}</button><button type="button" className="conversation-heading conversation-heading-link" onClick={()=>active.other&&goToProfile(active.other.id)}><strong>{active.other?.display_name??'Собеседник'}</strong><small>@{active.other?.username??'unknown'}</small></button></header><div className="conversation-history" aria-live="polite">{!chatMessages.length&&<div className="conversation-blank"><span>Начало переписки</span><p>Сообщения видны только участникам диалога.</p></div>}{chatMessages.map(message=><div key={message.id} className={`bubble ${message.sender_id===userId?'mine':'theirs'}`}><span>{message.body}</span><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>)}<div ref={messageEnd}/></div><form className="composer" onSubmit={sendMessage}><input aria-label="Написать сообщение" placeholder="Сообщение…" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4000}/><button type="submit" className="send-button" disabled={!draft.trim()||sending} aria-label="Отправить сообщение">➤</button></form></>:<div className="conversation-placeholder"><div className="brand-lockup"><img src="/branding/ikonosfera.svg" alt="IKONOSFERA © BY TENDO888" width={1266} height={734}/></div><h2>{loggedIn?'Выбери чат':'Общайся без лишнего'}</h2><p>{loggedIn?'Открой существующий диалог или найди друга по имени.':'IKONOSFERA — современный мессенджер для Android, iPhone и компьютера.'}</p>{!loggedIn&&(backendReady?<div className="auth-panel"><h3>{codeSent?'Подтверди вход':'Войти или зарегистрироваться'}</h3>{!codeSent?<form onSubmit={requestCode}><label htmlFor="authEmail">Электронная почта</label><input id="authEmail" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/><button className="accent-button" disabled={busy}>{busy?'Отправляем…':'Получить код'}</button></form>:<form onSubmit={confirmCode}><p>Код отправлен на {email}</p><label htmlFor="authCode">Код из письма</label><input id="authCode" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" required minLength={6} maxLength={8}/><button className="accent-button" disabled={busy}>{busy?'Проверяем…':'Войти'}</button><button type="button" className="text-button" onClick={()=>{setCodeSent(false);setCode('');setError('');}}>Другой адрес</button></form>}<div className="temporary-login"><button type="button" className="secondary-action" onClick={()=>void beginTemporaryAccount()} disabled={busy}>Попробовать без почты — тестовый аккаунт</button><p>Бесплатный тестовый вход. Для работы требуется включить Anonymous Sign-Ins в Supabase. Не используй реальные личные данные.</p></div></div>:<div className="setup-notice"><strong>Подключаем сообщения</strong><p>Сервер переписки ещё не настроен. Как только будет подключена база, здесь появится вход.</p></div>)}{loggedIn&&<SleepyPixelCat/>}</div>}
    </main>
    {(error||notice)&&<div role="status" className={`toast ${error?'toast-error':''}`}><span>{error||notice}</span><button aria-label="Закрыть уведомление" onClick={()=>{setError('');setNotice('');}}>×</button></div>}
    {installHelp&&<div className="install-backdrop" role="dialog" aria-modal="true" aria-label="Установка приложения"><div className="install-card"><h2>Установить IKONOSFERA</h2><p>{platform.ios?'Открой страницу в Safari → «Поделиться» → «На экран Домой» → «Добавить».':'В Chrome на Android открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».'}</p><button className="accent-button" onClick={()=>setInstallHelp(false)}>Понятно</button></div></div>}
    {loading&&<div className="initializing"><img src="/branding/ikonosfera.svg" alt="IKONOSFERA © BY TENDO888" width={1266} height={734}/><span>Загружаем переписки…</span></div>}
  </div>;
}
