'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backendReady, createTemporaryAccount, consumeEmailLinkSession, clearSession, currentUser, findProfileByUsername, listChats, listChatPreviews, listMessages, manageChat, manageMessage, listBlockedUsers, blockUser, unblockUser, type UserBlock, listMessageReactions, setMessageReaction, markChatRead, listProfiles, myProfile, postMessage, reopenChat, sendDirectMedia, sendEmailCode, signOut, startDirectChat, validSession, type ChatMessage, type MessageReaction, type DirectChat, type Profile, type Session, type ChatPreview } from '@/lib/supabase-rest';

import ProfilePanel from "@/components/ProfilePanel";
import ChatMedia from "@/components/ChatMedia";
import ChatInboxRow from "@/components/ChatInboxRow";
import {pingActivity,myActivityVisibility,getUserActivities,activityLabel,type ActivityVisibility,type UserActivity} from '@/lib/activity';
import StoriesStrip from "@/components/StoriesStrip";
import GroupPanel from "@/components/GroupPanel";
import GroupInboxRow from "@/components/GroupInboxRow";
import {createGroup,listGroups,listGroupOverviews,type Group,type GroupOverview} from "@/lib/groups";
import ChannelsPanel from "@/components/ChannelsPanel";
import BotsPanel from "@/components/BotsPanel";
import { REACTION_EMOJIS, type ReactionEmoji, createChannel, imageUrl, listChannels, listMySubscriptions, subscribeChannel, unsubscribeChannel, getChannelSubscriberCounts, type Channel } from "@/lib/social";

type Tab = 'chats' | 'contacts' | 'channels' | 'profile' | 'settings';
type Platform = { ios: boolean; standalone: boolean };
type ChatRow = { chat: DirectChat; other: Profile | null; preview:ChatPreview|null };
function dayLabel(value:string):string{
 const date=new Date(value),now=new Date();
 if(date.toDateString()===now.toDateString())return 'Сегодня';
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 if(date.toDateString()===yesterday.toDateString())return 'Вчера';
 return date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:date.getFullYear()===now.getFullYear()?undefined:'numeric'});
}
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
  const [groups,setGroups]=useState<Group[]>([]);
  const [groupOverviews,setGroupOverviews]=useState<Record<string,GroupOverview>>({});
  const [selectedGroup,setSelectedGroup]=useState<Group|null>(null);
  const [creatingGroup,setCreatingGroup]=useState(false);
  const [groupTitle,setGroupTitle]=useState('');
  const [groupSelection,setGroupSelection]=useState<string[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [profileTarget,setProfileTarget]=useState<string|null>(null);
  const [selectedChannel,setSelectedChannel]=useState<Channel|null>(null);
  const [channels,setChannels]=useState<Channel[]>([]);
  const [subscriptions,setSubscriptions]=useState<string[]>([]);
  const [subscriberCounts,setSubscriberCounts]=useState<Record<string,number>>({});
  const [activityVisibility,setActivityVisibility]=useState<ActivityVisibility>('approximate');
  const [userActivities,setUserActivities]=useState<Record<string,UserActivity>>({});
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
  const [chatFilter,setChatFilter]=useState<'all'|'private'|'groups'|'unread'|'bots'>('all');
  const [editingChats,setEditingChats]=useState(false);
  const [selectedChatIds,setSelectedChatIds]=useState<string[]>([]);
  const [blockedUsers,setBlockedUsers]=useState<UserBlock[]>([]);
  const [blockedProfiles,setBlockedProfiles]=useState<Profile[]>([]);
  const [blacklistOpen,setBlacklistOpen]=useState(false);
  const [selectedBot,setSelectedBot]=useState<'days'|'mood'|null>(null);
  const [messageSearch,setMessageSearch]=useState('');
  const [searchInConversation,setSearchInConversation]=useState(false);
  const [createMenuOpen,setCreateMenuOpen]=useState(false);
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
  const searchInputRef=useRef<HTMLInputElement|null>(null);
  const draftsRef=useRef<Record<string,string>>({});
  const composerRef=useRef<HTMLTextAreaElement|null>(null);

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
    const [chats,previews,allChannels,memberships,groupList,groupSummaries]=await Promise.all([listChats(token),listChatPreviews(token).catch(()=>[] as ChatPreview[]),listChannels(token),listMySubscriptions(token,id),listGroups(token),listGroupOverviews(token)]);
    setChannels(allChannels);
    const counts=await getChannelSubscriberCounts(token,allChannels.map(ch=>ch.id)).catch(()=>({} as Record<string,number>));
    setSubscriberCounts(counts);
    setGroups(groupList);
    setGroupOverviews(Object.fromEntries(groupSummaries.map(summary=>[summary.group_id,summary])));
    setSubscriptions(memberships.map(m=>m.channel_id));
    const others=Array.from(new Set(chats.map(c=>c.user_a===id?c.user_b:c.user_a)));
    const profiles=await listProfiles(token,others);
    const byId=new Map(profiles.map(p=>[p.id,p]));
    const overview=new Map(previews.map(p=>[p.chat_id,p]));
    setRows(chats.filter(chat=>!chat.hidden_for?.includes(id))
      .sort((a,b)=>{
        const pinned=Number(Boolean(b.pinned_for?.includes(id)))-Number(Boolean(a.pinned_for?.includes(id)));
        if(pinned)return pinned;
        const aTime=overview.get(a.id)?.last_created_at||a.created_at;
        const bTime=overview.get(b.id)?.last_created_at||b.created_at;
        return Date.parse(bTime)-Date.parse(aTime);
      })
      .map(chat=>({chat,other:byId.get(chat.user_a===id?chat.user_b:chat.user_a)??null,preview:overview.get(chat.id)??null})));
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
    let inFlight=false;
    const run=async()=>{
      if(cancelled||inFlight||document.visibilityState==='hidden')return;
      inFlight=true;
      try{
        const valid=await validSession();
        if(cancelled)return;
        if(!valid){
          setSession(null);setUserId('');setSelected(null);setRows([]);
          return;
        }
        if(valid.access_token!==session.access_token)setSession(valid);
        await refresh(valid.access_token,userId,selectedRef.current);
      }catch{ /* transient network failure; retry next tick */ }
      finally{inFlight=false;}
    };
    const onVisible=()=>{if(document.visibilityState==='visible')void run();};
    const timer=window.setInterval(()=>void run(),3000);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[session,userId,refresh]);

  useEffect(()=>{
    if(!session||!userId)return;
    let cancelled=false;
    void myActivityVisibility(session.access_token,userId).then(value=>{if(!cancelled)setActivityVisibility(value);}).catch(()=>{});
    const ping=()=>{if(!cancelled&&document.visibilityState==='visible')void pingActivity(session.access_token).catch(()=>{});};
    ping();const timer=window.setInterval(ping,45000);
    document.addEventListener('visibilitychange',ping);window.addEventListener('focus',ping);
    return()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',ping);window.removeEventListener('focus',ping);};
  },[session,userId]);
  async function changeActivityVisibility(next:ActivityVisibility){
    if(!session)return;
    const previous=activityVisibility;setActivityVisibility(next);
    try{await pingActivity(session.access_token,next);setNotice(next==='exact'?'Точное время посещения доступно другим.':'Точное время посещения скрыто.');}
    catch(e){setActivityVisibility(previous);setError(userFacingError(e));}
  }
  async function copyCleanLink(){
    try{await navigator.clipboard.writeText(window.location.origin+'/');setNotice('Скопирована чистая ссылка без меток ChatGPT.');}
    catch{setError('Не удалось скопировать ссылку. Адрес: '+window.location.origin+'/');}
  }
    useEffect(()=>{messageEnd.current?.scrollIntoView({behavior:'auto'});},[chatMessages.length,selected]);
  useEffect(()=>{if(selected)setDraft(draftsRef.current[selected]||'');},[selected]);
  useEffect(()=>{const field=composerRef.current;if(!field)return;field.style.height='auto';field.style.height=Math.min(field.scrollHeight,136)+'px';},[draft,selected]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
        event.preventDefault();setTab('chats');setCreateMenuOpen(false);
        searchInputRef.current?.focus();searchInputRef.current?.select();
      }
      if(event.key==='Escape'&&document.activeElement===searchInputRef.current){
        setSearch('');searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown',keyboard);
    return()=>window.removeEventListener('keydown',keyboard);
  },[]);

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
  async function makeGroup(e:React.FormEvent){
    e.preventDefault();if(!session||!userId||busy||!groupSelection.length||!groupTitle.trim())return;
    setBusy(true);setError('');
    try{const id=await createGroup(session.access_token,groupTitle,groupSelection);
      const updated=await listGroups(session.access_token);setGroups(updated);
      setSelectedGroup(updated.find(g=>g.id===id)||null);setCreatingGroup(false);
      setGroupTitle('');setGroupSelection([]);setSelected(null);setSelectedChannel(null);setProfileTarget(null);setTab('chats');
      setNotice('Группа создана.');
    }catch(e){setError(userFacingError(e));}finally{setBusy(false);}
  }
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
    setEditingChats(false);setSelectedChatIds([]);
    setSelectedGroup(null);setSelectedBot(null);setCreatingGroup(false);
    setMessageSearch("");setSearchInConversation(false);setCreateMenuOpen(false);setTab(next);setSelected(null);setSelectedChannel(null);setProfileTarget(next==="profile"&&userId?userId:null);setShowRecommendations(false);setError("");
  }
  async function sendMessage(e:React.FormEvent){
    e.preventDefault();if(!session||!selected||!userId||sending)return;
    if(activePartnerId&&blockedIds.has(activePartnerId)){setError('Пользователь заблокирован. Разблокируй его в настройках.');return;}
    const chatId=selected,body=draft.trim();
    if(!body||body.length>4000)return;
    setSending(true);setError('');
    try{
      await postMessage(session.access_token,chatId,userId,body);
      delete draftsRef.current[chatId];
      if(selectedRef.current===chatId){
        setDraft('');
        try{setChatMessages((await listMessages(session.access_token,chatId)).reverse());}
        catch{/* The next sync will refresh sent messages without resending. */}
      }
    }catch(e){setError(userFacingError(e));}
    finally{setSending(false);}
  }
  function toggleChatSelection(chatId:string){
    setSelectedChatIds(previous=>previous.includes(chatId)?previous.filter(id=>id!==chatId):[...previous,chatId]);
  }
  async function applyBulkChatAction(action:'read'|'delete_self'){
    if(!session||!userId||busy||!selectedChatIds.length)return;
    if(action==='delete_self'&&!window.confirm('Удалить выбранные чаты только у себя? Сообщения пропадут из твоей истории, но останутся у собеседников.'))return;
    setBusy(true);setError('');
    try{
      for(const id of selectedChatIds){
        if(action==='read')await markChatRead(session.access_token,id);
        else await manageChat(session.access_token,id,'delete_self');
      }
      await refresh(session.access_token,userId,null);
      setSelectedChatIds([]);setEditingChats(false);
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function chatAction(chatId:string,action:"hide"|"delete_self"|"pin"|"unpin"|"delete_everyone"|"block"){
    if(!session||!userId||busy)return;
    const item=rows.find(row=>row.chat.id===chatId);
    if(action==='block'){
      const personId=item?.other?.id||(item?.chat.user_a===userId?item.chat.user_b:item?.chat.user_a);
      if(personId)await blockPerson(personId);
      else setError('Не удалось определить собеседника.');
      return;
    }
    if(action==='delete_everyone'&&!window.confirm('Удалить всю переписку у тебя и собеседника? Сообщения исчезнут у обоих без возможности восстановления.'))return;
    if(action==='delete_self'&&!window.confirm('Удалить переписку только у себя? Собеседник сохранит свои сообщения.'))return;
    if(action==='hide'&&!window.confirm('Скрыть чат только у себя?'))return;
    setBusy(true);setError('');
    try{
      await manageChat(session.access_token,chatId,action);
      const removed=action==='hide'||action==='delete_self'||action==='delete_everyone';
      if(removed&&selected===chatId){setSelected(null);setChatMessages([]);}
      await refresh(session.access_token,userId,removed?null:selected);
      if(removed)setNotice(action==='delete_everyone'?'Переписка удалена у обоих.':action==='delete_self'?'Переписка удалена только у тебя.':'Чат скрыт.');
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
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
    if(activePartnerId&&blockedIds.has(activePartnerId)){setError('Пользователь заблокирован. Разблокируй его в настройках.');return;}
    setSending(true);setError("");
    try{
      await sendDirectMedia(session.access_token,selected,userId,file);
      setChatMessages((await listMessages(session.access_token,selected)).reverse());
      setNotice("Вложение отправлено.");
    }catch(e){setError(userFacingError(e));}
    finally{setSending(false);}
  }
  async function logout(){if(!session)return;if(anonymous&&!window.confirm('Это временный аккаунт. После выхода восстановить его нельзя. Выйти?'))return;setBusy(true);try{await signOut(session.access_token);}catch(e){setError(userFacingError(e));}finally{clearSession();setSession(null);setUserId('');setProfile(null);setAnonymous(false);setRows([]);setSelected(null);setProfileTarget(null);setSelectedChannel(null);setChannels([]);setBlockedUsers([]);setBlockedProfiles([]);setChatMessages([]);setBusy(false);}}
  async function install(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}else setInstallHelp(true);}
  const blockedIds=useMemo(()=>new Set(blockedUsers.map(entry=>entry.blocked_id)),[blockedUsers]);
  const loadBlocked=useCallback(async (token:string,id:string)=>{
    const entries=await listBlockedUsers(token,id);
    const details=await listProfiles(token,entries.map(entry=>entry.blocked_id));
    setBlockedUsers(entries);setBlockedProfiles(details);
  },[]);
  useEffect(()=>{
    if(!session||!userId){setBlockedUsers([]);setBlockedProfiles([]);return;}
    let cancelled=false;
    void Promise.all([listBlockedUsers(session.access_token,userId)]).then(async([entries])=>{
      const details=await listProfiles(session.access_token,entries.map(row=>row.blocked_id));
      if(!cancelled){setBlockedUsers(entries);setBlockedProfiles(details);}
    }).catch(()=>{});
    return()=>{cancelled=true;};
  },[session,userId]);
  async function unblockPerson(targetId:string){
    if(!session||!userId||busy)return;setBusy(true);setError('');
    try{await unblockUser(session.access_token,userId,targetId);await loadBlocked(session.access_token,userId);setNotice('Пользователь удалён из чёрного списка.');}
    catch(e){setError(userFacingError(e));}finally{setBusy(false);}
  }
  async function blockPerson(targetId:string){
    if(!session||!userId||busy||targetId===userId)return;
    if(!window.confirm('Добавить пользователя в чёрный список? Вы больше не сможете отправлять друг другу сообщения, пока не разблокируешь его.'))return;
    setBusy(true);setError('');
    try{await blockUser(session.access_token,userId,targetId);await loadBlocked(session.access_token,userId);setNotice('Пользователь заблокирован. Разблокировать можно в настройках.');}
    catch(e){setError(userFacingError(e));}finally{setBusy(false);}
  }
  const storyContacts=useMemo(()=>rows.map(row=>row.other).filter((p):p is Profile=>Boolean(p)),[rows]);
  const contactPeople=useMemo(()=>[...storyContacts].sort((a,b)=>(a.display_name||a.username).localeCompare(b.display_name||b.username,'ru')),[storyContacts]);
  useEffect(()=>{
    if(tab!=='contacts'||!session||!contactPeople.length)return;
    let cancelled=false;
    const check=()=>{if(document.visibilityState==='hidden')return;void getUserActivities(session.access_token,contactPeople.slice(0,60).map(p=>p.id)).then(activities=>{if(!cancelled)setUserActivities(previous=>({...previous,...activities}));}).catch(()=>{});};
    check();const poll=window.setInterval(check,45000);
    return()=>{cancelled=true;window.clearInterval(poll);};
  },[tab,session,contactPeople]);
    const active=rows.find(r=>r.chat.id===selected);
  const activePartnerId=active?.other?.id??null;
  useEffect(()=>{
    if(!session||!activePartnerId)return;
    let gone=false;
    const refreshActivity=()=>{if(document.visibilityState==='hidden')return;
      void getUserActivities(session.access_token,[activePartnerId]).then(result=>{if(!gone)setUserActivities(old=>({...old,...result}));}).catch(()=>{});
    };
    refreshActivity();const timer=window.setInterval(refreshActivity,30000);
    return()=>{gone=true;window.clearInterval(timer);};
  },[session,activePartnerId]);
  const filtered=rows.filter(r=>chatFilter!=='groups'&&chatFilter!=='bots'&&(chatFilter!=='unread'||Number(r.preview?.unread_count||0)>0) && (!search.trim()||`${r.other?.display_name??''} ${r.other?.username??''} ${r.preview?.last_body??''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const unreadTotal=rows.reduce((sum,row)=>sum+Number(row.preview?.unread_count||0),0)+groups.reduce((sum,group)=>sum+Number(groupOverviews[group.id]?.unread_count||0),0);
  const visibleGroups=groups.filter(g=>chatFilter!=='private'&&chatFilter!=='bots'&&(chatFilter!=='unread'||Number(groupOverviews[g.id]?.unread_count||0)>0)&&(!search.trim()||((g.title+' '+(groupOverviews[g.id]?.last_body||'')).toLowerCase().includes(search.trim().toLowerCase()))));
  const inboxItems=[
    ...filtered.map(row=>({kind:'chat' as const,row,pinned:Boolean(row.chat.pinned_for?.includes(userId)),time:Date.parse(row.preview?.last_created_at||row.chat.created_at)})),
    ...visibleGroups.map(group=>({kind:'group' as const,group,pinned:false,time:Date.parse(groupOverviews[group.id]?.last_created_at||group.created_at)}))
  ].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(b.time||0)-(a.time||0));
  const visibleMessages=chatMessages.filter(message=>!message.deleted_for?.includes(userId)&&(!searchInConversation||!messageSearch.trim()||message.body.toLocaleLowerCase('ru').includes(messageSearch.trim().toLocaleLowerCase('ru'))));
  const loggedIn=Boolean(session&&userId);
  const detailOpen=Boolean(!loggedIn||selected||profileTarget||selectedChannel||selectedGroup||selectedBot);
  const myChannels=channels.filter(ch=>ch.owner_id===userId||subscriptions.includes(ch.id));
  const recommendedChannels=channels.filter(ch=>ch.owner_id!==userId&&!subscriptions.includes(ch.id));
  const filteredChannels=(showRecommendations?recommendedChannels:myChannels).filter(ch=>!channelSearch.trim()||((ch.title+" "+ch.slug).toLowerCase().includes(channelSearch.trim().toLowerCase())));

  return <div className={`messenger ${loggedIn?"is-authenticated":"is-guest"}`} data-version="windows-desktop-v3">
    <aside className={`chats-pane ${detailOpen?'has-conversation':''}`}>
      <div className="pane-heading"><div className="brand-label"><img className="brand-mini" src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={132} height={70}/></div><button type="button" className="release-pill" onClick={()=>profile?.id&&goToProfile(profile.id)} disabled={!profile}>{profile ? "@"+profile.username : "ALPHA"}</button></div>
      <div className="pane-toolbar">
        {tab==='chats'&&loggedIn?<button type="button" className="ik-edit-toggle" aria-pressed={editingChats} onClick={()=>{setEditingChats(value=>!value);setSelectedChatIds([]);}}>{editingChats?'Готово':'Изм.'}</button>:<span className="ik-toolbar-spacer" aria-hidden="true"/>}
        <h1>{tab==='chats'?'Чаты':tab==='contacts'?'Контакты':tab==='channels'?'Каналы':tab==='profile'?'Профиль':'Настройки'}</h1>
        <button type="button" className="icon-button ik-compose-button" title={tab==='channels'?'Создать канал':'Новое сообщение'} aria-label={tab==='channels'?'Создать канал':'Новое сообщение'} onClick={()=>{if(tab==='channels'){setChannelCreating(v=>!v);}else{setTab('chats');setCreateMenuOpen(v=>!v);}}} disabled={!loggedIn||editingChats}>
          {tab==='chats'?<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m13 11 7.5-7.5a2.1 2.1 0 0 1 3 3L16 14l-4 1 1-4Z"/></svg>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
        </button>
      </div>
      {tab==='chats'&&loggedIn&&session&&<StoriesStrip token={session.access_token} userId={userId} contacts={storyContacts} ownProfile={profile}/>}
      {tab==='chats'&&<div className="pane-search"><span aria-hidden="true">⌕</span><input ref={searchInputRef} aria-label="Поиск по чатам" placeholder="Поиск по чатам и сообщениям" value={search} onChange={e=>setSearch(e.target.value)} disabled={!loggedIn}/></div>}
      {tab==='chats'&&loggedIn&&<div className="ik-chat-actions">
        {createMenuOpen&&<div className="ik-create-menu" role="group" aria-label="Новая беседа">
          <button type="button" onClick={()=>{setCreateMenuOpen(false);switchTab('contacts');}}>✉ <span>Личное сообщение</span></button>
          <button type="button" onClick={()=>{setCreatingGroup(true);setCreateMenuOpen(false);}}>♧ <span>Новая группа</span></button>
          <button type="button" onClick={()=>{setTab('channels');setChannelCreating(true);setCreatingGroup(false);setCreateMenuOpen(false);}}>＃ <span>Новый канал</span></button>
        </div>}
        {creatingGroup&&<form className="group-create-form" onSubmit={makeGroup}>
          <div className="ik-create-title"><strong>Новая группа</strong><button type="button" onClick={()=>setCreatingGroup(false)} aria-label="Отменить создание группы">✕</button></div>
          <label>Название группы<input required maxLength={80} value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} placeholder="Наша компания"/></label>
          <strong>Добавить из контактов</strong>
          <div className="group-contact-list">{storyContacts.length?storyContacts.map(person=><label key={person.id} className="group-contact-choice"><input type="checkbox" checked={groupSelection.includes(person.id)} onChange={e=>setGroupSelection(prev=>e.target.checked?[...prev,person.id]:prev.filter(id=>id!==person.id))}/><span>{person.display_name||person.username} <small>@{person.username}</small></span></label>):<p>Контактов пока нет. Начни переписку, чтобы добавить человека в группу.</p>}</div>
          <button type="submit" className="accent-button" disabled={busy||!groupTitle.trim()||!groupSelection.length}>Создать группу ({groupSelection.length+1})</button>
        </form>}
      </div>}
      {tab==='chats'&&loggedIn&&<div className="ik-inbox-filters" role="group" aria-label="Фильтр переписок">
        <button type="button" className={chatFilter==='all'?'selected':''} aria-pressed={chatFilter==='all'} onClick={()=>setChatFilter('all')}>Все</button>
        <button type="button" className={chatFilter==='private'?'selected':''} aria-pressed={chatFilter==='private'} onClick={()=>setChatFilter('private')}>Личные</button>
        <button type="button" className={chatFilter==='groups'?'selected':''} aria-pressed={chatFilter==='groups'} onClick={()=>setChatFilter('groups')}>Группы</button>
        <button type="button" className={chatFilter==='bots'?'selected':''} aria-pressed={chatFilter==='bots'} onClick={()=>{setChatFilter('bots');setSelectedBot(null);}}>Боты</button>
        <button type="button" className={chatFilter==='unread'?'selected':''} aria-pressed={chatFilter==='unread'} onClick={()=>setChatFilter('unread')}>Непрочитанные{unreadTotal>0&&<span className="ik-filter-count">{unreadTotal>99?'99+':unreadTotal}</span>}</button>
      </div>}
      {tab==='chats'&&editingChats&&<div className="ik-bulk-actions" role="toolbar" aria-label="Выбранные чаты"><span>{selectedChatIds.length?'Выбрано: '+selectedChatIds.length:'Выбери переписки'}</span><button type="button" disabled={!selectedChatIds.length||busy} onClick={()=>void applyBulkChatAction('read')}>Прочитать</button><button type="button" disabled={!selectedChatIds.length||busy} onClick={()=>void applyBulkChatAction('delete_self')}>Удалить у себя</button></div>}
      <div className="chat-list">
      {tab==='chats'&&loggedIn&&chatFilter==='bots'&&<div className="ik-bot-list"><button type="button" onClick={()=>{setSelectedBot('days');setSelected(null);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);}}><span>◷</span><strong>Сколько мне осталось?<small>Счётчик дней до выбранной даты</small></strong><b>›</b></button><button type="button" onClick={()=>{setSelectedBot('mood');setSelected(null);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);}}><span>✳</span><strong>Точка равновесия<small>15 вопросов о самочувствии</small></strong><b>›</b></button></div>}
      {tab==='chats'&&chatFilter!=='bots'&&(loggedIn?inboxItems.length?inboxItems.map(item=>item.kind==='group'
       ? <GroupInboxRow key={'g-'+item.group.id} group={item.group} overview={groupOverviews[item.group.id]} active={selectedGroup?.id===item.group.id} onOpen={()=>{setSelectedGroup(item.group);setSelected(null);setSelectedChannel(null);setProfileTarget(null);}}/>
       : <ChatInboxRow key={'c-'+item.row.chat.id} row={item.row} currentUserId={userId} active={selected===item.row.chat.id} selectionMode={editingChats} selectedForBulk={selectedChatIds.includes(item.row.chat.id)}
          onOpen={()=>{if(editingChats){toggleChatSelection(item.row.chat.id);return;}setSelected(item.row.chat.id);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);setChatMessages([]);setError('');}}
          onAction={action=>void chatAction(item.row.chat.id,action)}/>
       ):<div className="list-empty ik-chat-empty"><div className="empty-icon">✉</div><strong>{chatFilter==='unread'?'Всё прочитано':chatFilter==='groups'?'Нет групп':'Нет переписок'}</strong><p>{chatFilter==='unread'?'Новые сообщения появятся здесь.':chatFilter==='groups'?'Создай группу и пригласи участников.':'Найди человека по юзернейму или создай группу.'}</p>{chatFilter==='all'&&<button className="secondary-action" onClick={()=>switchTab('contacts')}>Новый чат</button>}</div>:<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>{backendReady?'Войди, чтобы читать сообщения.':'Для переписки осталось подключить сервер.'}</p></div>)}
      {tab==='contacts'&&<div className="contact-search-panel">
        <form className="ik-contact-lookup" onSubmit={e=>{e.preventDefault();void searchPerson(lookup.trim().replace(/^@/,''));}}>
          <label className="ik-visually-hidden" htmlFor="lookup">Найти пользователя</label>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.6 4.6"/></svg>
          <input id="lookup" placeholder="Поиск по контактам и @username" value={lookup} onChange={e=>setLookup(e.target.value)} maxLength={25} disabled={!loggedIn}/>
          <button type="submit" disabled={!loggedIn||busy||lookup.trim().replace(/^@/,'').length<3}>{busy?'…':'Найти'}</button>
        </form>
        <div className="ik-contact-invite"><span aria-hidden="true">＋</span><div><strong>Контакты IKONOSFERA</strong><small>Открой профиль или найди пользователя выше</small></div></div>
        <div className="ik-contact-section-label">КОНТАКТЫ <span>{contactPeople.length}</span></div>
        <div className="ik-contact-people">
          {contactPeople.filter(person=>!lookup.trim()||((person.display_name||'')+' '+person.username).toLowerCase().includes(lookup.trim().replace(/^@/,'').toLowerCase())).map(person=>
            <button type="button" key={person.id} className="ik-contact-person" onClick={()=>goToProfile(person.id)}>
              <span className="contact-avatar">{imageUrl(person.avatar_path)?<img className="avatar-image" src={imageUrl(person.avatar_path)||''} alt=""/>:(person.display_name||person.username).slice(0,1).toUpperCase()}</span>
              <span className="ik-contact-person-text"><strong>{person.display_name||person.username}</strong><small>{activityLabel(userActivities[person.id])}</small></span>
              <span className="ik-contact-chevron" aria-hidden="true">›</span>
            </button>
          )}
          {!contactPeople.length&&<p className="ik-contacts-empty">Контакты появятся здесь после переписки. Нового человека можно найти по @username выше.</p>}
        </div>
      </div>}

      {tab==='channels'&&<div className="channel-browser">
        <div className="channel-tools"><input aria-label="Поиск каналов" value={channelSearch} onChange={e=>setChannelSearch(e.target.value)} placeholder="Поиск каналов" disabled={!loggedIn}/><button type="button" className="secondary-action" disabled={!loggedIn} onClick={()=>setChannelCreating(v=>!v)}>{channelCreating?"Закрыть":"＋ Создать канал"}</button></div>
        {channelCreating&&<form className="channel-create-form" onSubmit={makeChannel}><label>Название<input maxLength={80} value={channelTitle} onChange={e=>setChannelTitle(e.target.value)} placeholder="Мой канал" required/></label>
          <label>Адрес канала<input pattern="[a-z0-9_]{3,32}" maxLength={32} minLength={3} value={channelSlug} onChange={e=>setChannelSlug(e.target.value.toLowerCase())} placeholder="my_channel" required/></label>
          <label>Описание<textarea maxLength={500} value={channelDescription} onChange={e=>setChannelDescription(e.target.value)} placeholder="О чём этот канал?"/></label>
          <button type="submit" className="accent-button" disabled={busy||!loggedIn}>{busy?"Создаём…":"Создать"}</button>
        </form>}
        <div className="channel-browser-tabs"><button type="button" className={!showRecommendations?"selected":""} onClick={()=>setShowRecommendations(false)}>Мои каналы</button><button type="button" className={showRecommendations?"selected":""} onClick={()=>setShowRecommendations(true)}>Рекомендации</button></div>
        <div className="channel-list">{filteredChannels.length?filteredChannels.map(ch=><div key={ch.id} className={"channel-list-row"+(ch.id===selectedChannel?.id?" active":"")}>
          <button type="button" className="channel-row-open" onClick={()=>{setSelectedChannel(ch);setSelected(null);setProfileTarget(null);setError("");}}><span className="channel-list-icon">#</span><span><strong>{ch.title}</strong><small>@{ch.slug} · {(subscriberCounts[ch.id]??0).toLocaleString('ru-RU')} подписчиков</small></span></button>
          {ch.owner_id===userId?<span className="channel-owner-badge">Мой</span>:<button type="button" disabled={busy} className="channel-subscribe-button" onClick={()=>void toggleSubscription(ch.id)}>{subscriptions.includes(ch.id)?"Отписаться":"Подписаться"}</button>}
        </div>):<p className="channel-empty-list">{!loggedIn?"Войди, чтобы увидеть каналы.":showRecommendations?"Новых рекомендаций пока нет.":"Ты ещё не подписан на каналы. Загляни в рекомендации."}</p>}</div>
      </div>}
      {tab==='settings'&&<div className="settings-panel"><h2>Мой профиль</h2>{loggedIn?<><button type="button" className="open-own-profile" onClick={()=>goToProfile(userId)}><span className="contact-avatar">{imageUrl(profile?.avatar_path)?<img className="avatar-image" src={imageUrl(profile?.avatar_path)||""} alt=""/>:(profile?.display_name||'?').charAt(0).toUpperCase()}</span><span><strong>{profile?.display_name||"Мой профиль"}</strong><small>Оформление · фото · истории</small></span><span>›</span></button><p>Люди могут найти тебя по уникальному имени.</p>{anonymous&&<p className="test-account-warning">Тестовый аккаунт без почты: доступ хранится только на этом устройстве. После удаления приложения, очистки данных или выхода восстановить его нельзя.</p>}<button type="button" className="settings-edit-button" onClick={()=>goToProfile(userId)}>✎ Редактировать профиль</button><div className="ik-privacy-settings"><h3>Время последнего посещения</h3><p>Кто видит твою активность: по умолчанию показывается только приблизительный период.</p>
<label htmlFor="ik-presence-privacy">Показывать другим</label><select id="ik-presence-privacy" value={activityVisibility} onChange={e=>void changeActivityVisibility(e.target.value as ActivityVisibility)}>
<option value="approximate">Приблизительно: недавно / на неделе / в этом году / давно</option>
<option value="exact">Точное время и статус «В сети»</option></select>
<p className="ik-privacy-note">При скрытом времени другие не увидят, когда именно ты был в сети.</p></div>
<button type="button" className="secondary-action ik-copy-link" onClick={()=>void copyCleanLink()}>Копировать ссылку на IKONOSFERA</button><button className="secondary-action" onClick={logout} disabled={busy}>Выйти из аккаунта</button></>:<p>Войди, чтобы настроить профиль.</p>}<div className="settings-meta"><span>Платформа</span><strong>{platform.ios?'iPhone / iPad':'Android / Desktop'}</strong><span>Запуск</span><strong>{platform.standalone?'Установленное приложение':'Браузер'}</strong><span>Сервер</span><strong>{backendReady?'Настроен':'Не подключён'}</strong></div>{!platform.standalone&&<button className="secondary-action" onClick={()=>void install()}>Установить приложение</button>}</div>}
      </div>
      <nav className="pane-nav" aria-label="Основные разделы">
  <button type="button" aria-label="Контакты" aria-current={tab==='contacts'?'page':undefined} className={tab==='contacts'?'current':''} onClick={()=>switchTab('contacts')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="9" r="5"/><path d="M4 25v-2.5c0-5 4.3-8 10-8s10 3 10 8V25"/></svg></span><span className="nav-label">Контакты</span></button>
  <button type="button" aria-label="Каналы" aria-current={tab==='channels'?'page':undefined} className={tab==='channels'?'current':''} onClick={()=>switchTab('channels')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13v-3a3 3 0 0 1 3-3h7l7-4v21l-7-4H8a3 3 0 0 1-3-3v-4Z"/><path d="m9 21 2 5h4l-3-6"/></svg></span><span className="nav-label">Каналы</span></button>
  <button type="button" aria-label="Чаты" aria-current={tab==='chats'?'page':undefined} className={tab==='chats'?'current':''} onClick={()=>switchTab('chats')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6.5C4 4.6 5.6 3 7.5 3h13C22.4 3 24 4.6 24 6.5v12c0 2-1.6 3.5-3.5 3.5H11l-7 4V6.5Z"/><path d="M8 10h12M8 15h8"/></svg></span><span className="nav-label">Чаты</span></button>
  <button type="button" aria-label="Настройки" aria-current={tab==='settings'||tab==='profile'?'page':undefined} className={tab==='settings'||tab==='profile'?'current':''} onClick={()=>switchTab('settings')}><span className="nav-art">{imageUrl(profile?.avatar_path)?<img className="nav-profile-avatar" src={imageUrl(profile?.avatar_path)||''} alt=""/>:<svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="9" r="5"/><path d="M5 25v-2c0-5 4-8 9-8s9 3 9 8v2"/></svg>}</span><span className="nav-label">Настройки</span></button>
</nav>
    </aside>
    <main className={`conversation-pane ${detailOpen?'open':''}`}>
      {selectedBot&&loggedIn?<BotsPanel userId={userId} bot={selectedBot} onBack={()=>setSelectedBot(null)}/>:
      selectedGroup&&session&&loggedIn?<GroupPanel key={selectedGroup.id} token={session.access_token} userId={userId} group={selectedGroup} onBack={()=>setSelectedGroup(null)} onShowProfile={id=>{setSelectedGroup(null);goToProfile(id);}}/>:
      profileTarget&&session&&loggedIn?<ProfilePanel key={profileTarget} token={session.access_token} userId={userId} targetId={profileTarget} onBack={()=>{setProfileTarget(null);if(tab==='profile')setTab('chats');}} onOwnProfileChange={()=>{void myProfile(session.access_token,userId).then(setProfile).catch(()=>{});}} onMessage={openDirectFromProfile} onOpenChannel={channel=>{setProfileTarget(null);setSelected(null);setSelectedChannel(channel);setTab("channels");}}/>:
      selectedChannel&&session&&loggedIn?<ChannelsPanel key={selectedChannel.id} token={session.access_token} userId={userId} channel={selectedChannel} onBack={()=>setSelectedChannel(null)} onShowProfile={goToProfile} subscribed={subscriptions.includes(selectedChannel.id)||selectedChannel.owner_id===userId} onToggleSubscribe={()=>void toggleSubscription(selectedChannel.id)} onMessageAuthor={()=>void getChannelOwnerAndChat(selectedChannel.owner_id)} onChannelUpdated={updated=>{setSelectedChannel(updated);setChannels(old=>old.map(ch=>ch.id===updated.id?updated:ch));}} onChannelDeleted={()=>{setSelectedChannel(null);setChannels(old=>old.filter(ch=>ch.id!==selectedChannel.id));setTab("channels");}}/>:
      
      active&&loggedIn?<><header className="conversation-header"><button className="back-button" onClick={()=>setSelected(null)} aria-label="Назад к чатам">‹</button><button type="button" className="contact-avatar small contact-avatar-button" onClick={()=>active.other&&goToProfile(active.other.id)} title="Открыть профиль">{imageUrl(active.other?.avatar_path)?<img className="avatar-image" src={imageUrl(active.other?.avatar_path)||""} alt=""/>:(active.other?.display_name||'?').slice(0,1).toUpperCase()}</button><button type="button" className="conversation-heading conversation-heading-link" onClick={()=>active.other&&goToProfile(active.other.id)}><strong>{active.other?.display_name??'Собеседник'}</strong><small className={userActivities[activePartnerId||'']?.status==='в сети'?'ik-online-label':undefined}>{activityLabel(userActivities[activePartnerId||''])}</small></button><details className="ik-conversation-more"><summary title="Действия с чатом" aria-label="Действия с чатом">···</summary><div className="ik-conversation-more-menu"><button type="button" onClick={()=>active.other&&goToProfile(active.other.id)}>Открыть профиль</button><button type="button" onClick={()=>{setSearchInConversation(value=>!value);setMessageSearch("");}}>Поиск в переписке</button><button type="button" onClick={()=>void chatAction(active.chat.id,active.chat.pinned_for?.includes(userId)?'unpin':'pin')}>{active.chat.pinned_for?.includes(userId)?'Открепить':'Закрепить чат'}</button><button type="button" onClick={()=>void chatAction(active.chat.id,'delete_self')}>Удалить у себя</button><button type="button" className="ik-danger-action" onClick={()=>void chatAction(active.chat.id,'delete_everyone')}>Удалить для обоих</button>{active.other&&!blockedIds.has(active.other.id)&&<button type="button" onClick={()=>void chatAction(active.chat.id,'block')}>Заблокировать</button>}{active.other&&blockedIds.has(active.other.id)&&<button type="button" onClick={()=>{setBlacklistOpen(true);switchTab('settings');}}>Чёрный список</button>}</div></details></header>{searchInConversation&&<div className="ik-conversation-search"><input autoFocus aria-label="Поиск сообщений в текущем чате" placeholder="Найти сообщение…" value={messageSearch} onChange={e=>setMessageSearch(e.target.value)}/><span>{visibleMessages.length} сообщ.</span><button type="button" onClick={()=>{setSearchInConversation(false);setMessageSearch("");}}>✕</button></div>}<div className="conversation-history" aria-live="polite">{!chatMessages.length&&<div className="conversation-blank"><span>Начало переписки</span><p>Сообщения видны только участникам диалога.</p></div>}{visibleMessages.map((message,index)=><Fragment key={message.id}>{(index===0||new Date(visibleMessages[index-1].created_at).toDateString()!==new Date(message.created_at).toDateString())&&<div className="ik-chat-day-separator" role="separator"><span>{dayLabel(message.created_at)}</span></div>}<div className={`chat-message-row ${message.sender_id===userId?'mine':'theirs'}`}><div className={`bubble ${message.sender_id===userId?'mine':'theirs'}`}>{!message.deleted_for_everyone&&message.media_path&&message.media_type&&session&&<ChatMedia token={session.access_token} path={message.media_path} type={message.media_type}/>} {message.deleted_for_everyone?<span className="message-deleted">Сообщение удалено</span>:editingMessageId===message.id?<form className="message-edit-form" onSubmit={e=>{e.preventDefault();void messageAction(message.id,"edit",editingMessageBody);}}><input value={editingMessageBody} onChange={e=>setEditingMessageBody(e.target.value)} maxLength={4000}/><button type="submit">Сохранить</button><button type="button" onClick={()=>setEditingMessageId(null)}>Отмена</button></form>:message.body&&<span>{message.body}</span>}<time dateTime={message.created_at}>{message.edited_at&&!message.deleted_for_everyone&&<span className="message-edited-label" title="Сообщение отредактировано">изм. · </span>}{message.sender_id===userId&&<span className={"message-receipt"+(message.read_at?" read":"")} title={message.read_at?"Просмотрено":"Отправлено"}>{message.read_at?"✓✓":"✓"}</span>}{new Date(message.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div><div className="chat-message-tools">{!message.deleted_for_everyone&&<details className="message-menu"><summary aria-label="Действия с сообщением" title="Действия с сообщением">···</summary><div className="message-manage-actions">{message.sender_id===userId&&<button type="button" onClick={()=>{setEditingMessageId(message.id);setEditingMessageBody(message.body);}}>Изменить</button>}<button type="button" onClick={()=>void messageAction(message.id,"hide")}>Удалить у себя</button>{message.sender_id===userId&&<button type="button" onClick={()=>void messageAction(message.id,"delete_everyone")}>Удалить у всех</button>}</div></details>}<div className="reaction-bar message-reaction-bar">
 {REACTION_EMOJIS.filter(emoji=>messageReactions.some(r=>r.message_id===message.id&&r.emoji===emoji)).map(emoji=><button key={emoji} type="button" className={"reaction-pill"+(messageReactions.some(r=>r.message_id===message.id&&r.user_id===userId&&r.emoji===emoji)?" mine":"")} onClick={()=>void reactToMessage(message.id,emoji)} disabled={sending}>{emoji} <span>{messageReactions.filter(r=>r.message_id===message.id&&r.emoji===emoji).length}</span></button>)}
 <button type="button" className="reaction-add" aria-label="Добавить реакцию" onClick={()=>setMessageReactionPicker(messageReactionPicker===message.id?null:message.id)}>☺ +</button>
 {messageReactionPicker===message.id&&<div className="reaction-picker">{REACTION_EMOJIS.map(emoji=><button type="button" key={emoji} disabled={sending} onClick={()=>void reactToMessage(message.id,emoji)} aria-label={"Реакция "+emoji}>{emoji}</button>)}</div>}
 </div></div></div></Fragment>)}<div ref={messageEnd}/></div>{activePartnerId&&blockedIds.has(activePartnerId)&&<div className="ik-blocked-notice" role="status">Пользователь в чёрном списке. <button type="button" onClick={()=>{switchTab('settings');setBlacklistOpen(true);}}>Открыть настройки</button></div>}<form className="composer" onSubmit={sendMessage}><label className="chat-attach-button" title="Прикрепить фото, видео, музыку или файл" aria-label="Прикрепить файл">＋<input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" disabled={sending||Boolean(activePartnerId&&blockedIds.has(activePartnerId))} onChange={e=>{void sendAttachment(e.target.files?.[0]);e.target.value="";}}/></label><textarea ref={composerRef} aria-label="Написать сообщение" placeholder={activePartnerId&&blockedIds.has(activePartnerId)?"Пользователь заблокирован":"Сообщение…"} disabled={Boolean(activePartnerId&&blockedIds.has(activePartnerId))} rows={1} value={draft} onChange={e=>{setDraft(e.target.value);if(selected)draftsRef.current[selected]=e.target.value;}} onInput={e=>{const element=e.currentTarget;element.style.height='auto';element.style.height=Math.min(element.scrollHeight,136)+'px';}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(draft.trim()&&!sending)e.currentTarget.form?.requestSubmit();}}} maxLength={4000}/><button type="submit" className="send-button" disabled={!draft.trim()||sending||Boolean(activePartnerId&&blockedIds.has(activePartnerId))} aria-label="Отправить сообщение">➤</button></form></>:<div className="conversation-placeholder">{!loggedIn&&<div className="guest-brand"><img src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={250} height={108}/><span>© BY TENDO888</span></div>}{loggedIn&&<div className="welcome-mark" aria-hidden="true">IKONOSFERA<span> / DESKTOP</span></div>}<h2>{loggedIn?'Твои разговоры начинаются здесь':emailSent?'Остался один шаг':'Больше чем просто мессенджер'}</h2><p>{loggedIn?'Выбери переписку слева или найди человека по юзернейму.':emailSent?'Открой письмо и перейди по ссылке Sign in.':'IKONOSFERA — современный мессенджер для Android, iPhone, macOS и Windows. Работает без VPN и ограничений!'}</p>{loggedIn&&<div className="desktop-welcome-actions"><button type="button" className="accent-button" onClick={()=>switchTab('contacts')}>＋ Найти человека</button><button type="button" className="secondary-action" onClick={()=>switchTab('channels')}>Открыть каналы</button></div>}{!loggedIn&&(backendReady?<div className="auth-panel"><h3>{emailSent?'Проверь почту':'Войти или зарегистрироваться'}</h3>{!emailSent?<form onSubmit={requestSignInLink}><label htmlFor="authEmail">Электронная почта</label><input id="authEmail" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/><button className="accent-button" disabled={busy}>{busy?'Отправляем…':'Получить ссылку для входа'}</button></form>:<div className="email-signin-result"><div className="email-signin-guide" role="status"><strong>Письмо отправлено на {email}</strong><p>Открой почту и найди письмо от <b>Supabase Auth</b> с темой <b>Your sign-in link</b>.</p><p>Нажми синюю ссылку <b>Sign in</b> («Войти»). После перехода IKONOSFERA откроется с твоим аккаунтом.</p><small>Если письма нет, проверь «Спам». Ссылка одноразовая; вводить код не требуется.</small></div><button type="button" className="text-button" onClick={()=>{setEmailSent(false);setError('');}}>Использовать другой адрес</button></div>}<div className="temporary-login"><button type="button" className="secondary-action" onClick={()=>void beginTemporaryAccount()} disabled={busy}>Попробовать без почты — тестовый аккаунт</button><p>Бесплатный тестовый вход. Для работы требуется включить Anonymous Sign-Ins в Supabase. Не используй реальные личные данные.</p></div></div>:<div className="setup-notice"><strong>Подключаем сообщения</strong><p>Сервер переписки ещё не настроен. Как только будет подключена база, здесь появится вход.</p></div>)}</div>}
    </main>
    {(error||notice)&&<div role="status" className={`toast ${error?'toast-error':''}`}><span>{error||notice}</span><button aria-label="Закрыть уведомление" onClick={()=>{setError('');setNotice('');}}>×</button></div>}
    {installHelp&&<div className="install-backdrop" role="dialog" aria-modal="true" aria-label="Установка приложения"><div className="install-card"><h2>Установить IKONOSFERA</h2><p>{platform.ios?'Открой страницу в Safari → «Поделиться» → «На экран Домой» → «Добавить».':'В Chrome на Android открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».'}</p><button className="accent-button" onClick={()=>setInstallHelp(false)}>Понятно</button></div></div>}
    {loading&&<div className="initializing"><img src="/branding/ikonosfera.svg" alt="IKONOSFERA © BY TENDO888" width={1266} height={734}/><span>Загружаем переписки…</span></div>}
  </div>;
}
