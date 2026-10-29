'use client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { backendReady, createTemporaryAccount, consumeEmailLinkSession, clearSession, currentUser, findProfileByUsername, listChats, listChatPreviews, listMessages, listOlderMessages, listReplyTargets, searchDirectMessages, type DirectMessageSearchResult, DIRECT_MESSAGE_SEARCH_PAGE_SIZE, type ReplyTarget, CHAT_MESSAGE_PAGE_SIZE, manageChat, manageMessage, listMessageReactions, setMessageReaction, markChatRead, listProfiles, myProfile, postMessage, reopenChat, sendDirectMedia, validateDirectMediaFile, sendEmailCode, signOut, startDirectChat, validSession, type ChatMessage, type MessageReaction, type DirectChat, type Profile, type Session, type ChatPreview } from '@/lib/supabase-rest';

import ProfilePanel from "@/components/ProfilePanel";
import {mergeRecentPage,prependEarlierPage} from "@/lib/chat-history";
import {readChatDrafts,writeChatDrafts,clearChatDrafts,type ChatDrafts} from "@/lib/chat-drafts";
import ChatMedia from "@/components/ChatMedia";
import ChatAttachmentPreview from "@/components/ChatAttachmentPreview";
import ChatInboxRow from "@/components/ChatInboxRow";
import StatusEmoji from "@/components/StatusEmoji";
import SwipeReplyMessage from "@/components/SwipeReplyMessage";
import ReplyQuote from "@/components/ReplyQuote";
import MessageEditForm from "@/components/MessageEditForm";
import DirectMessageSearchPanel from "@/components/DirectMessageSearchPanel";
import FloatingActionMenu from "@/components/FloatingActionMenu";
import {listSavedContacts,addSavedContact,removeSavedContact,listBlockedUsers,addBlockedUser,removeBlockedUser} from "@/lib/contacts";
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
type ChatRow = { chat: DirectChat; other: Profile | null; preview:ChatPreview|null; previewUnavailable?:boolean };
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
  const [savedContacts,setSavedContacts]=useState<Profile[]>([]);
  const [blockedUsers,setBlockedUsers]=useState<Profile[]>([]);
  const [blocklistOpen,setBlocklistOpen]=useState(false);
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
  const [chatLoad,setChatLoad]=useState<{id:string;status:'loading'|'ready'|'error'}|null>(null);
  const [chatReloadNonce,setChatReloadNonce]=useState(0);
  const [hasOlderMessages,setHasOlderMessages]=useState(false);
  const [loadingOlderMessages,setLoadingOlderMessages]=useState(false);
  const [olderMessagesError,setOlderMessagesError]=useState(false);
  const [messageReactions,setMessageReactions]=useState<MessageReaction[]>([]);
  const [messageReactionPicker,setMessageReactionPicker]=useState<string|null>(null);
  const [editingMessageId,setEditingMessageId]=useState<string|null>(null);
  const [editingMessageBody,setEditingMessageBody]=useState("");
  const [search,setSearch]=useState('');
  const [chatFilter,setChatFilter]=useState<'all'|'private'|'groups'|'unread'|'bots'>('all');
  const [editingChats,setEditingChats]=useState(false);
  const [selectedChatIds,setSelectedChatIds]=useState<string[]>([]);
  const [selectedBot,setSelectedBot]=useState<'days'|'mood'|null>(null);
  const [messageSearch,setMessageSearch]=useState('');
  const [searchInConversation,setSearchInConversation]=useState(false);
  const [messageSearchResults,setMessageSearchResults]=useState<DirectMessageSearchResult[]>([]);
  const [messageSearchOwner,setMessageSearchOwner]=useState<{chatId:string;userId:string;query:string}|null>(null);
  const [messageSearchLoading,setMessageSearchLoading]=useState(false);
  const [messageSearchError,setMessageSearchError]=useState(false);
  const [messageSearchHasMore,setMessageSearchHasMore]=useState(false);
  const [messageSearchPage,setMessageSearchPage]=useState(0);
  const [messageSearchRetry,setMessageSearchRetry]=useState(0);
  const [selectedMessages,setSelectedMessages]=useState<string[]>([]);
  const [messageMenuId,setMessageMenuId]=useState<string|null>(null);
  const [createMenuOpen,setCreateMenuOpen]=useState(false);
  const [lookup,setLookup]=useState(initialUsername);
  const [draft,setDraft]=useState('');
  const [pendingAttachment,setPendingAttachment]=useState<{chatId:string;ownerId:string;file:File}|null>(null);
  const [attachmentCaption,setAttachmentCaption]=useState('');
  const [attachmentDragActive,setAttachmentDragActive]=useState(false);
  const [draftPreviews,setDraftPreviews]=useState<ChatDrafts>({});
  const [showJumpToLatest,setShowJumpToLatest]=useState(false);
  const [replyingTo,setReplyingTo]=useState<{chatId:string;id:string;text:string;name:string}|null>(null);
  const [replyTargets,setReplyTargets]=useState<Record<string,ReplyTarget>>({});
  const [locatingReply,setLocatingReply]=useState<string|null>(null);
  const [pendingReplyJump,setPendingReplyJump]=useState<{chatId:string;id:string}|null>(null);
  const [email,setEmail]=useState('');
  const [emailSent,setEmailSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [sending,setSending]=useState(false);
  const [networkOnline,setNetworkOnline]=useState(true);
  const [bootstrapRetryNonce,setBootstrapRetryNonce]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [installHelp,setInstallHelp]=useState(false);
  const [installPrompt,setInstallPrompt]=useState<(Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>})|null>(null);
  const messageEnd=useRef<HTMLDivElement|null>(null);
  const conversationHistoryRef=useRef<HTMLDivElement|null>(null);
  const chatAutoScrollRef=useRef(true);
  const loadingOlderRef=useRef(false);
  const prependScrollRef=useRef<{chatId:string;height:number;top:number}|null>(null);
  const selectedRef=useRef<string|null>(null);
  const searchInputRef=useRef<HTMLInputElement|null>(null);
  const previewCacheRef=useRef<{ownerId:string;previews:Map<string,ChatPreview>}>({ownerId:'',previews:new Map()});
  const draftsRef=useRef<ChatDrafts>({});
  const draftsOwnerRef=useRef('');
  const replyTargetsQueriedRef=useRef<Set<string>>(new Set());
  const replyJumpRequestRef=useRef(0);
  const chatContextGenerationRef=useRef(0);
  const messageSearchRequestRef=useRef(0);
  const composerRef=useRef<HTMLTextAreaElement|null>(null);
  const attachmentDragDepthRef=useRef(0);

  useEffect(()=>{
    // Browser online/offline is only a connectivity hint, not a guarantee
    // that Supabase is reachable. Never auto-send unsent chat drafts.
    const update=()=>{
      const connected=navigator.onLine;
      setNetworkOnline(connected);
      if(connected)setError(previous=>previous.startsWith('Нет соединения с интернетом.')?'':previous);
    };
    update();
    window.addEventListener('online',update);
    window.addEventListener('offline',update);
    window.addEventListener('pageshow',update); // iOS Safari back/forward cache
    return()=>{
      window.removeEventListener('online',update);
      window.removeEventListener('offline',update);
      window.removeEventListener('pageshow',update);
    };
  },[]);

  useEffect(()=>{
    // Restore only the signed-in person's drafts; anonymous account drafts
    // never appear in someone else's account after switching users.
    if(userId===draftsOwnerRef.current)return;
    draftsOwnerRef.current=userId;
    const existing=userId?readChatDrafts(userId):{};
    draftsRef.current=existing;
    setDraftPreviews({...existing});
  },[userId]);
  function updateChatDraft(chatId:string,text:string){
    const next={...draftsRef.current};
    if(text.trim())next[chatId]=text;
    else delete next[chatId];
    draftsRef.current=next;
    setDraftPreviews(next);
    if(userId)writeChatDrafts(userId,next);
  }

  useEffect(()=>{
    selectedRef.current=selected;
    chatContextGenerationRef.current+=1;
    replyJumpRequestRef.current+=1;
    setLocatingReply(null);setPendingReplyJump(null);
    setReplyingTo(null);setShowJumpToLatest(false);
    setEditingMessageId(null);setEditingMessageBody('');
    setPendingAttachment(null);setAttachmentCaption('');
    attachmentDragDepthRef.current=0;setAttachmentDragActive(false);
    resetMessageSearch();
  },[selected,userId]);
  useEffect(()=>{replyTargetsQueriedRef.current.clear();setReplyTargets({});},[selected,userId]);
  // Quotations may refer to messages outside the newest page. Fetch only those
  // target IDs, under normal Supabase RLS; never cache quotes between accounts.
  useEffect(()=>{
    const chatId=selected;
    if(!session||!chatId||chatLoad?.id!==chatId||chatLoad.status!=='ready')return;
    const generation=chatContextGenerationRef.current;
    const inChat=chatMessages.filter(message=>message.chat_id===chatId);
    const loaded=new Set(inChat.map(message=>message.id));
    const missing=[...new Set(inChat.map(message=>message.reply_to_message_id).filter((id):id is string=>Boolean(id)))].filter(id=>!loaded.has(id)&&!replyTargetsQueriedRef.current.has(id));
    if(!missing.length)return;
    for(const id of missing)replyTargetsQueriedRef.current.add(id);
    // Every request has a bounded PostgREST URL; quote previews from earlier
    // pages are not silently discarded after the first 100 IDs.
    const batches:Array<string[]>=[];
    for(let start=0;start<missing.length;start+=100)batches.push(missing.slice(start,start+100));
    const stillInChat=()=>selectedRef.current===chatId&&chatContextGenerationRef.current===generation;
    void Promise.all(batches.map(ids=>listReplyTargets(session.access_token,chatId,ids)))
      .then(results=>{
        if(!stillInChat())return;
        const targets=results.flat();
        setReplyTargets(current=>({...current,...Object.fromEntries(targets.map(target=>[target.id,target]))}));
      })
      .catch(()=>{
        // Permit a later chat refresh to retry a transient network failure.
        if(stillInChat())for(const id of missing)replyTargetsQueriedRef.current.delete(id);
      });
  },[chatMessages,chatLoad?.id,chatLoad?.status,selected,session?.access_token]);
  // Full-history search uses a scoped, security-invoker database RPC.
  // Debounce typing and ignore every stale response when the query, chat,
  // account, or tab changes. Never cache search results across accounts.
  useEffect(()=>{
    const requestId=++messageSearchRequestRef.current;
    const chatId=selected;
    const term=messageSearch.trim();
    const offset=messageSearchPage*DIRECT_MESSAGE_SEARCH_PAGE_SIZE;
    if(!searchInConversation||!session||!chatId||term.length<2||term.length>120){
      setMessageSearchResults([]);
      setMessageSearchLoading(false);
      setMessageSearchError(false);
      setMessageSearchHasMore(false);
      return;
    }
    const token=session.access_token;
    const generation=chatContextGenerationRef.current;
    const belongs=()=>messageSearchRequestRef.current===requestId
      &&chatContextGenerationRef.current===generation&&selectedRef.current===chatId;
    setMessageSearchLoading(true);setMessageSearchError(false);
    const timer=window.setTimeout(()=>{
      void searchDirectMessages(token,chatId,term,offset).then(matches=>{
        if(!belongs())return;
        const page=matches.slice(0,DIRECT_MESSAGE_SEARCH_PAGE_SIZE);
        setMessageSearchOwner({chatId,userId,query:term});
        setMessageSearchResults(previous=>offset===0?page:[
          ...previous,...page.filter(item=>!previous.some(old=>old.id===item.id))
        ]);
        setMessageSearchHasMore(matches.length>DIRECT_MESSAGE_SEARCH_PAGE_SIZE
          &&offset+DIRECT_MESSAGE_SEARCH_PAGE_SIZE<=600);
      }).catch(()=>{
        if(belongs())setMessageSearchError(true);
      }).finally(()=>{
        if(belongs())setMessageSearchLoading(false);
      });
    },messageSearchPage===0?320:0);
    return()=>window.clearTimeout(timer);
  },[searchInConversation,messageSearch,messageSearchPage,messageSearchRetry,selected,session?.access_token,userId]);

  function resetMessageSearch(){
    messageSearchRequestRef.current+=1;
    setMessageSearch('');
    setSearchInConversation(false);
    setMessageSearchPage(0);
    setMessageSearchRetry(0);
    setMessageSearchResults([]);
    setMessageSearchOwner(null);
    setMessageSearchError(false);
    setMessageSearchHasMore(false);
    setMessageSearchLoading(false);
  }
  function updateMessageSearch(value:string){
    setMessageSearch(value);
    setMessageSearchPage(0);
    setMessageSearchRetry(0);
    setMessageSearchResults([]);
    setMessageSearchOwner(null);
    setMessageSearchHasMore(false);
  }

  // iOS Safari's visual viewport shrinks when the keyboard appears.
  // Follow that visible area rather than a stale 100dvh layout height,
  // without disabling the user's ability to pinch-zoom for accessibility.
  useEffect(()=>{
    const root=document.documentElement;
    let animationFrame=0;
    const setVisibleHeight=()=>{
      if(!window.matchMedia('(max-width:800px)').matches){
        root.style.removeProperty('--ik-visible-viewport-height');
        return;
      }
      const viewport=window.visualViewport;
      if(viewport&&Math.abs(viewport.scale-1)>0.02){
        root.style.removeProperty('--ik-visible-viewport-height');
        return;
      }
      const height=viewport?.height??window.innerHeight;
      if(Number.isFinite(height)&&height>200){
        root.style.setProperty('--ik-visible-viewport-height',Math.round(height)+'px');
      }
    };
    const update=()=>{
      window.cancelAnimationFrame(animationFrame);
      animationFrame=window.requestAnimationFrame(setVisibleHeight);
    };
    const viewport=window.visualViewport;
    setVisibleHeight();
    viewport?.addEventListener('resize',update);
    viewport?.addEventListener('scroll',update);
    window.addEventListener('resize',update);
    window.addEventListener('orientationchange',update);
    return()=>{
      window.cancelAnimationFrame(animationFrame);
      root.style.removeProperty('--ik-visible-viewport-height');
      viewport?.removeEventListener('resize',update);
      viewport?.removeEventListener('scroll',update);
      window.removeEventListener('resize',update);
      window.removeEventListener('orientationchange',update);
    };
  },[]);
  useEffect(()=>{
    const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const standalone=window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
    setPlatform({ios,standalone});
    const onInstall=(e:Event)=>{e.preventDefault();setInstallPrompt(e as Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>});};
    window.addEventListener('beforeinstallprompt',onInstall);
    if('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('/sw.js').catch(()=>{});
    return ()=>window.removeEventListener('beforeinstallprompt',onInstall);
  },[]);

  const loadInboxPreviews=useCallback(async(token:string,ownerId:string)=>{
    // Never expose another account's previous message snippets during logout
    // or a fast account switch, even when the preview endpoint is offline.
    if(previewCacheRef.current.ownerId!==ownerId){
      previewCacheRef.current={ownerId,previews:new Map()};
    }
    try{
      const rows=await listChatPreviews(token);
      const fetched=new Map(rows.map(item=>[item.chat_id,item]));
      if(previewCacheRef.current.ownerId===ownerId){
        previewCacheRef.current={ownerId,previews:fetched};
      }
      return {overview:previewCacheRef.current.ownerId===ownerId?fetched:new Map<string,ChatPreview>(),failed:false};
    }catch{
      const same=previewCacheRef.current.ownerId===ownerId;
      // Intermittent preview endpoint errors must not erase last-message text.
      return {overview:same?previewCacheRef.current.previews:new Map<string,ChatPreview>(),failed:true};
    }
  },[]);
  const refresh=useCallback(async (token:string,id:string,activeChat:string|null)=>{
    // Start slow discovery in parallel, but never delay the inbox on those calls.
    const extrasPromise=Promise.all([
      listChannels(token),listMySubscriptions(token,id),listGroups(token),
      listGroupOverviews(token),listSavedContacts(token,id),listBlockedUsers(token,id)
    ]).catch(()=>null);
    const [chats,previewResult]=await Promise.all([
      listChats(token),loadInboxPreviews(token,id)
    ]);
    const chatPartnerIds=Array.from(new Set(chats.map(chat=>chat.user_a===id?chat.user_b:chat.user_a)));
    const chatProfiles=await listProfiles(token,chatPartnerIds);
    const chatById=new Map(chatProfiles.map(person=>[person.id,person]));
    const overview=previewResult.overview;
    setRows(chats.filter(chat=>!chat.hidden_for?.includes(id))
      .sort((a,b)=>{
        const pinned=Number(Boolean(b.pinned_for?.includes(id)))-Number(Boolean(a.pinned_for?.includes(id)));
        if(pinned)return pinned;
        return Date.parse(overview.get(b.id)?.last_created_at||b.created_at)
          -Date.parse(overview.get(a.id)?.last_created_at||a.created_at);
      })
      .map(chat=>({chat,other:chatById.get(chat.user_a===id?chat.user_b:chat.user_a)??null,preview:overview.get(chat.id)??null,previewUnavailable:previewResult.failed&&!overview.has(chat.id)})));
    // Chat list may now render, even if discovery or membership queries are slow.
    setLoading(false);
    const extras=await extrasPromise;
    if(!extras)return; // Preserve last good channels/groups on an unrelated API error.
    const [allChannels,memberships,groupList,groupSummaries,contactIds,blockedIds]=extras;
    setChannels(allChannels);
    setGroups(groupList);
    setGroupOverviews(Object.fromEntries(groupSummaries.map(summary=>[summary.group_id,summary])));
    setSubscriptions(memberships.map(m=>m.channel_id));
    const moreIds=Array.from(new Set([...contactIds,...blockedIds].filter(pid=>!chatById.has(pid))));
    const moreProfiles=moreIds.length?await listProfiles(token,moreIds):[];
    const peopleById=new Map([...chatProfiles,...moreProfiles].map(person=>[person.id,person]));
    setSavedContacts(contactIds.map(personId=>peopleById.get(personId)).filter((p):p is Profile=>Boolean(p)));
    setBlockedUsers(blockedIds.map(personId=>peopleById.get(personId)).filter((p):p is Profile=>Boolean(p)));
    void getChannelSubscriberCounts(token,allChannels.map(channel=>channel.id))
      .then(counts=>setSubscriberCounts(counts)).catch(()=>{});
    void activeChat;

  },[loadInboxPreviews]);

  // Fast inbox refresh: keep channels, group feeds and contacts out of the
  // high-frequency path. Their full state is synced separately at a slower cadence.
  const refreshInbox=useCallback(async(token:string,id:string)=>{
    const [chats,previewResult]=await Promise.all([
      listChats(token),loadInboxPreviews(token,id)
    ]);
    const others=Array.from(new Set(chats.map(chat=>chat.user_a===id?chat.user_b:chat.user_a)));
    const profiles=await listProfiles(token,others);
    const byId=new Map(profiles.map(person=>[person.id,person]));
    const overview=previewResult.overview;
    setRows(chats.filter(chat=>!chat.hidden_for?.includes(id))
      .sort((a,b)=>{
        const pinned=Number(Boolean(b.pinned_for?.includes(id)))-Number(Boolean(a.pinned_for?.includes(id)));
        if(pinned)return pinned;
        return Date.parse(overview.get(b.id)?.last_created_at||b.created_at)
          -Date.parse(overview.get(a.id)?.last_created_at||a.created_at);
      })
      .map(chat=>({chat,other:byId.get(chat.user_a===id?chat.user_b:chat.user_a)??null,preview:overview.get(chat.id)??null,previewUnavailable:previewResult.failed&&!overview.has(chat.id)})));
  },[loadInboxPreviews]);

  useEffect(()=>{
    if(!selected||!session?.access_token||!userId)return;
    let cancelled=false;
    let inFlight=false;
    const chatId=selected;
    const token=session.access_token;
    setChatLoad({id:chatId,status:'loading'});
    setChatMessages([]);
    setHasOlderMessages(false);
    setLoadingOlderMessages(false);
    setOlderMessagesError(false);
    loadingOlderRef.current=false;
    prependScrollRef.current=null;
    setMessageReactions([]);
    setSelectedMessages([]);
    setMessageMenuId(null);
    const sync=async(first=false)=>{
      if(cancelled||inFlight||document.visibilityState==='hidden')return;
      // Offline detection avoids pointless 18-second fetch timeouts.
      // The 'online' listener below triggers an immediate retry.
      if(!navigator.onLine)return;
      inFlight=true;
      try{
        const messages=(await listMessages(token,chatId)).reverse();
        if(cancelled)return;
        setChatMessages(current=>mergeRecentPage(current,messages,CHAT_MESSAGE_PAGE_SIZE));
        if(first)setHasOlderMessages(messages.length===CHAT_MESSAGE_PAGE_SIZE);
        setChatLoad({id:chatId,status:'ready'});
        // Reactions must not block displaying text and attachments.
        void listMessageReactions(token,messages.map(message=>message.id))
          .then(reactions=>{if(!cancelled)setMessageReactions(current=>{
            const recentIds=new Set(messages.map(message=>message.id));
            return [...current.filter(reaction=>!recentIds.has(reaction.message_id)),...reactions];
          });})
          .catch(()=>{});
        if(messages.some(message=>message.sender_id!==userId&&!message.read_at)){
          void markChatRead(token,chatId).catch(()=>{});
        }
      }catch(e){
        if(!cancelled&&first){
          setChatLoad({id:chatId,status:'error'});
          setError(userFacingError(e));
        }
      }finally{inFlight=false;}
    };
    void sync(true);
    const timer=window.setInterval(()=>void sync(),6000);
    const onVisible=()=>{if(document.visibilityState==='visible')void sync();};
    const onConnected=()=>{if(document.visibilityState==='visible')void sync(true);};
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',onConnected);
    return()=>{
      cancelled=true;window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('online',onConnected);
    };
  },[selected,session?.access_token,userId,chatReloadNonce]);

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
        if(!cancelled)setError('');
      } catch(e){if(!cancelled){setError(userFacingError(e));/* A transient network failure must not discard valid login credentials. */}}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[refresh,bootstrapRetryNonce]);

  // On an offline cold launch, profile fetching can fail before the signed-in
  // session is hydrated. Retry bootstrap once connectivity returns; otherwise
  // the app would remain on the sign-in screen until a manual reload.
  useEffect(()=>{
    if(session)return;
    const retryBootstrap=()=>{if(backendReady)setBootstrapRetryNonce(count=>count+1);};
    window.addEventListener('online',retryBootstrap);
    return()=>window.removeEventListener('online',retryBootstrap);
  },[session]);

  useEffect(()=>{
    if(!session||!userId)return;
    let cancelled=false;
    let inFlight=false;
    let cycles=0;
    const run=async(forceFull=false)=>{
      if(cancelled||inFlight||document.visibilityState==='hidden')return;
      // Offline detection avoids pointless 18-second fetch timeouts.
      // The 'online' listener below triggers an immediate retry.
      if(!navigator.onLine)return;
      inFlight=true;
      try{
        const valid=await validSession();
        if(cancelled)return;
        if(!valid){
          setSession(null);setUserId('');setSelected(null);setRows([]);setSavedContacts([]);setBlockedUsers([]);
          return;
        }
        if(valid.access_token!==session.access_token)setSession(valid);
        // Only every ~72 seconds refresh large data (channels/groups/subscriptions).
        // The lightweight inbox refresh is enough to keep badges and new chats fresh.
        if(forceFull||++cycles%6===0)await refresh(valid.access_token,userId,null);
        else await refreshInbox(valid.access_token,userId);
      }catch{ /* transient network failure; retry on the next poll */ }
      finally{inFlight=false;}
    };
    const onVisible=()=>{if(document.visibilityState==='visible')void run(true);};
    const onConnected=()=>{if(document.visibilityState==='visible')void run(true);};
    const timer=window.setInterval(()=>void run(),12000);
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('online',onConnected);
    return()=>{
      cancelled=true;window.clearInterval(timer);
      document.removeEventListener('visibilitychange',onVisible);
      window.removeEventListener('online',onConnected);
    };
  },[session,userId,refresh,refreshInbox]);

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
    try{
      await navigator.clipboard.writeText(window.location.origin+'/');
      setError('');
      setNotice('Ссылка скопирована!');
    }catch{
      setError('Не удалось скопировать ссылку. Адрес: '+window.location.origin+'/');
    }
  }
  // Only the lightweight share confirmation disappears automatically. Other
  // notices (including important sign-in instructions) remain dismissible.
  useEffect(()=>{
    if(notice!=='Ссылка скопирована!')return;
    const timer=window.setTimeout(()=>{
      setNotice(current=>current==='Ссылка скопирована!'?'':current);
    },2800);
    return()=>window.clearTimeout(timer);
  },[notice]);
  // Scroll only the message history. scrollIntoView() was scrolling the page
  // itself on iPhone Safari and pushing the composer below the viewport.
  useEffect(()=>{chatAutoScrollRef.current=true;},[selected]);
  useLayoutEffect(()=>{
    const pending=prependScrollRef.current;
    const history=conversationHistoryRef.current;
    if(!pending||!history||pending.chatId!==selected)return;
    history.scrollTop=pending.top+(history.scrollHeight-pending.height);
    prependScrollRef.current=null;
  },[chatMessages.length,selected]);
  // React must first commit the newly fetched page before we can scroll to
  // a quoted source. The earlier effect restores the reader's scroll anchor.
  useLayoutEffect(()=>{
    if(!pendingReplyJump||pendingReplyJump.chatId!==selected)return;
    if(scrollToHistoryMessage(pendingReplyJump.id))setPendingReplyJump(null);
  },[pendingReplyJump,chatMessages,searchInConversation,messageSearch,selected]);
  useEffect(()=>{
    const history=conversationHistoryRef.current;
    if(!history||!chatAutoScrollRef.current)return;
    // Never pull the reader away from older messages during incoming polls.
    history.scrollTop=history.scrollHeight;
  },[chatMessages.length,selected]);
  useEffect(()=>{if(selected)setDraft(draftsRef.current[selected]||'');},[selected,userId]);
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
    setEditingChats(false);setSelectedChatIds([]);setMessageMenuId(null);
    setSelectedGroup(null);setSelectedBot(null);setCreatingGroup(false);
    resetMessageSearch();setSelectedMessages([]);setCreateMenuOpen(false);setTab(next);setSelected(null);setSelectedChannel(null);setProfileTarget(next==="profile"&&userId?userId:null);setShowRecommendations(false);setError("");
  }
  async function loadOlderChatMessages(){
    if(!session||!selected||loadingOlderRef.current||!hasOlderMessages||!chatMessages.length)return;
    const chatId=selected,token=session.access_token,oldest=chatMessages[0];
    const generation=chatContextGenerationRef.current;
    const stillInChat=()=>selectedRef.current===chatId&&chatContextGenerationRef.current===generation;
    const history=conversationHistoryRef.current;
    loadingOlderRef.current=true;
    chatAutoScrollRef.current=false;
    if(history)prependScrollRef.current={chatId,height:history.scrollHeight,top:history.scrollTop};
    setLoadingOlderMessages(true);setOlderMessagesError(false);
    try{
      const older=(await listOlderMessages(token,chatId,oldest)).reverse();
      if(!stillInChat())return;
      setHasOlderMessages(older.length===CHAT_MESSAGE_PAGE_SIZE);
      if(older.length){
        setChatMessages(current=>prependEarlierPage(current,older));
        // Older reactions load on demand rather than during every 6s poll.
        void listMessageReactions(token,older.map(message=>message.id))
          .then(reactions=>{
            if(stillInChat())setMessageReactions(current=>{
              const ids=new Set(older.map(message=>message.id));
              return [...current.filter(reaction=>!ids.has(reaction.message_id)),...reactions];
            });
          }).catch(()=>{});
      }else prependScrollRef.current=null;
    }catch(error){
      if(stillInChat()){
        prependScrollRef.current=null;
        setOlderMessagesError(true);
      }
    }finally{
      // An old chat request must not unlock a newly opened chat's pagination.
      if(stillInChat()){
        loadingOlderRef.current=false;
        setLoadingOlderMessages(false);
      }
    }
  }

  function scrollToHistoryMessage(id:string):boolean{
    // Never scroll the page itself: iOS Safari would hide the composer.
    const history=conversationHistoryRef.current;
    const original=history?.querySelector<HTMLElement>('#ik-chat-message-'+id);
    if(!original||!history)return false;
    chatAutoScrollRef.current=false;
    const distance=original.getBoundingClientRect().top-history.getBoundingClientRect().top;
    const centeredTop=history.scrollTop+distance-(history.clientHeight-original.offsetHeight)/2;
    history.scrollTo({
      top:Math.max(0,centeredTop),
      behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
    });
    original.classList.remove('ik-reply-target-flash');
    void original.offsetWidth; // Restart highlight on repeated navigation.
    original.classList.add('ik-reply-target-flash');
    return true;
  }

  async function jumpToOriginalMessage(id:string,fromSearch=false){
    if(!session||!selected||!userId||locatingReply)return;
    const chatId=selected,token=session.access_token;
    // Search results remain available when a distant match requires another
    // bounded page fetch. Close the panel only once the source is found.
    if(!fromSearch)resetMessageSearch();
    if(chatMessages.some(message=>message.id===id)){
      const hidden=chatMessages.some(message=>message.id===id&&message.deleted_for?.includes(userId));
      if(hidden){setNotice('Исходное сообщение скрыто в твоей истории.');return;}
      if(fromSearch)resetMessageSearch();
      setPendingReplyJump({chatId,id});
      return;
    }
    if(loadingOlderRef.current){
      setNotice('Дождись окончания загрузки истории и нажми на цитату ещё раз.');
      return;
    }
    const requestId=++replyJumpRequestRef.current;
    loadingOlderRef.current=true;
    chatAutoScrollRef.current=false;
    setLoadingOlderMessages(true);setOlderMessagesError(false);setLocatingReply(id);
    const history=conversationHistoryRef.current;
    if(history)prependScrollRef.current={chatId,height:history.scrollHeight,top:history.scrollTop};
    const stillInChat=()=>selectedRef.current===chatId&&replyJumpRequestRef.current===requestId;
    try{
      // First confirm that the original is still visible under the user's
      // normal database RLS. Never search a different chat or hidden content.
      const source=replyTargets[id]??(await listReplyTargets(token,chatId,[id]))[0];
      if(!stillInChat())return;
      if(!source){
        prependScrollRef.current=null;
        setNotice('Исходное сообщение удалено или больше недоступно.');
        return;
      }
      let cursor=chatMessages[0];
      let more=hasOlderMessages;
      const loaded:ChatMessage[]=[];
      let found=false;
      // Bound each tap to five pages, instead of downloading an unbounded
      // conversation. Another tap continues from the earliest loaded page.
      for(let page=0;page<5&&more;page++){
        const older=await listOlderMessages(token,chatId,cursor);
        if(!stillInChat())return;
        if(!older.length){more=false;break;}
        loaded.push(...older);
        cursor=older[older.length-1];
        more=older.length===CHAT_MESSAGE_PAGE_SIZE;
        if(older.some(message=>message.id===id)){found=true;break;}
      }
      if(loaded.length){
        setChatMessages(current=>prependEarlierPage(current,loaded));
        setHasOlderMessages(more);
        // Keep reaction counts on fetched pages without creating a URL with
        // hundreds of message IDs. Errors never interrupt quote navigation.
        for(let offset=0;offset<loaded.length;offset+=CHAT_MESSAGE_PAGE_SIZE){
          const ids=loaded.slice(offset,offset+CHAT_MESSAGE_PAGE_SIZE).map(message=>message.id);
          void listMessageReactions(token,ids).then(reactions=>{
            if(!stillInChat())return;
            const batch=new Set(ids);
            setMessageReactions(current=>[
              ...current.filter(reaction=>!batch.has(reaction.message_id)),...reactions
            ]);
          }).catch(()=>{});
        }
      }else prependScrollRef.current=null;
      if(found){
        prependScrollRef.current=null;
        if(fromSearch)resetMessageSearch();
        setPendingReplyJump({chatId,id});
      }else{
        setNotice(more
          ?'Загружены ранние сообщения. Нажми на цитату ещё раз, чтобы продолжить поиск.'
          :'Исходное сообщение не найдено в доступной истории.');
      }
    }catch{
      if(stillInChat()){
        prependScrollRef.current=null;
        setOlderMessagesError(true);
        setNotice('Не удалось загрузить старые сообщения. Нажми на цитату ещё раз.');
      }
    }finally{
      if(stillInChat()){
        loadingOlderRef.current=false;
        setLoadingOlderMessages(false);
        setLocatingReply(null);
      }
    }
  }

  function replyToMessage(message:ChatMessage){
    if(!selected||message.deleted_for_everyone)return;
    const partner=rows.find(row=>row.chat.id===selected)?.other;
    setReplyingTo({
      chatId:selected,id:message.id,
      name:message.sender_id===userId?'Вы':partner?.display_name||partner?.username||'Собеседник',
      text:(message.body||'Вложение').replace(/\s+/g,' ').trim().slice(0,110)
    });
    setMessageMenuId(null);
    window.requestAnimationFrame(()=>composerRef.current?.focus());
  }

  async function sendMessage(e:React.FormEvent){
    e.preventDefault();if(!session||!selected||!userId||sending||activePartnerBlocked)return;
    if(!networkOnline||!navigator.onLine){
      setError('Нет соединения с интернетом. Сообщение осталось в черновике.');
      return;
    }
    const chatId=selected,plainText=draft.trim(),token=session.access_token;
    const reply=replyingTo?.chatId===chatId?replyingTo:null;
    // Reply metadata is stored server-side rather than prepended to plain text.
    // This keeps editing, copying and message search free from fake quote text.
    if(!plainText||plainText.length>4000)return;
    setSending(true);setError('');
    try{
      await postMessage(token,chatId,userId,plainText,crypto.randomUUID(),reply?.id??null);
      // Users may type their next message while the previous send is in flight.
      // Only clear the exact draft that was submitted, not their new text.
      if((draftsRef.current[chatId]||'').trim()===plainText){
        updateChatDraft(chatId,'');
        if(selectedRef.current===chatId)setDraft(current=>current.trim()===plainText?'':current);
      }
      if(reply)setReplyingTo(current=>current?.id===reply.id&&current.chatId===chatId?null:current);
      // A sent message is not a failed send just because its refresh failed.
      try{
        const updated=(await listMessages(token,chatId)).reverse();
        if(selectedRef.current===chatId)setChatMessages(current=>mergeRecentPage(current,updated,CHAT_MESSAGE_PAGE_SIZE));
      }catch{/* The next inbox sync will show the successfully sent message. */}
    }catch(e){setError(userFacingError(e));}
    finally{setSending(false);}
  }
  async function toggleSavedContact(person:Profile){
    if(!session||!userId||busy)return;
    setBusy(true);setError('');
    const already=savedContacts.some(item=>item.id===person.id);
    try{
      if(already)await removeSavedContact(session.access_token,userId,person.id);
      else await addSavedContact(session.access_token,userId,person.id);
      setSavedContacts(previous=>already?previous.filter(item=>item.id!==person.id):[...previous,person]);
      setNotice(already?'Контакт удалён из списка.':'Пользователь добавлен в контакты.');
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function toggleBlockedUser(person:Profile){
    if(!session||!userId||busy)return;
    const already=blockedUsers.some(item=>item.id===person.id);
    if(!already&&!window.confirm('Заблокировать '+(person.display_name||person.username)+'? Вы не сможете отправлять друг другу личные сообщения, пока блокировка активна.'))return;
    setBusy(true);setError('');
    try{
      if(already)await removeBlockedUser(session.access_token,userId,person.id);
      else await addBlockedUser(session.access_token,userId,person.id);
      setBlockedUsers(previous=>already?previous.filter(item=>item.id!==person.id):[...previous,person]);
      setNotice(already?'Пользователь разблокирован.':'Пользователь добавлен в чёрный список.');
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function toggleProfileBlock(targetId:string){
    if(!session||busy)return;
    try{
      const person=(await listProfiles(session.access_token,[targetId]))[0];
      if(person)await toggleBlockedUser(person);
      else setError('Пользователь не найден.');
    }catch(e){setError(userFacingError(e));}
  }
  function toggleChatSelection(chatId:string){
    setSelectedChatIds(previous=>previous.includes(chatId)?previous.filter(id=>id!==chatId):[...previous,chatId]);
  }
  async function applyBulkChatAction(action:'read'|'hide'){
    if(!session||!userId||busy||!selectedChatIds.length)return;
    if(action==='hide'&&!window.confirm('Скрыть выбранные чаты только у себя?'))return;
    setBusy(true);setError('');
    try{
      for(const id of selectedChatIds){
        if(action==='read')await markChatRead(session.access_token,id);
        else await manageChat(session.access_token,id,'hide');
      }
      await refresh(session.access_token,userId,null);
      setSelectedChatIds([]);setEditingChats(false);
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function chatAction(chatId:string,action:"hide"|"pin"|"unpin"|"delete_self"|"delete_everyone"){
    if(!session||!userId||busy)return;
    if(action==="delete_everyone"&&!window.confirm("Удалить диалог и всю историю у вас обоих? Это действие необратимо."))return;
    if(action==="delete_self"&&!window.confirm("Удалить этот чат и его историю только у себя? У собеседника история останется."))return;
    if(action==="hide"&&!window.confirm("Скрыть диалог только у себя?"))return;
    setBusy(true);setError("");
    try{
      await manageChat(session.access_token,chatId,action);
      const deleted=action==="hide"||action==="delete_self"||action==="delete_everyone";
      if(deleted&&selected===chatId){setSelected(null);setMessageMenuId(null);setChatMessages([]);}
      await refresh(session.access_token,userId,deleted?null:selected);
      setNotice(deleted?(action==="delete_everyone"?"Чат удалён для обоих.":action==="delete_self"?"Чат и его история удалены у тебя.":"Чат скрыт."):(action==="pin"?"Чат закреплён.":"Чат откреплён."));
    }catch(e){setError(userFacingError(e));}
    finally{setBusy(false);}
  }
  async function messageAction(messageId:string,action:"hide"|"delete_everyone"|"edit",body?:string){
    if(!session||!selected||!userId)return;
    if(action==="delete_everyone"&&!window.confirm("Удалить сообщение для обоих?"))return;
    const chatId=selected,token=session.access_token;
    try{
      await manageMessage(token,messageId,action,body);
      if(selectedRef.current===chatId){
        setMessageMenuId(null);setEditingMessageId(null);
        // Actions on pages older than 100 messages must update locally too.
        setChatMessages(current=>current.flatMap(message=>{
          if(message.id!==messageId)return [message];
          if(action==='hide')return [];
          if(action==='delete_everyone')return [{...message,deleted_for_everyone:true,body:'',media_path:null,media_type:null}];
          return [{...message,body:body??message.body,edited_at:new Date().toISOString()}];
        }));
      }
      try{
        const updated=(await listMessages(token,chatId)).reverse();
        if(selectedRef.current===chatId)setChatMessages(current=>mergeRecentPage(current,updated,CHAT_MESSAGE_PAGE_SIZE));
      }catch{/* Keep the confirmed action; retry updating the history on polling. */}
    }catch(e){setError(userFacingError(e));}
  }
  async function reactToMessage(messageId:string,emoji:ReactionEmoji){
    if(!session||!selected||!userId||sending)return;
    const chatId=selected,token=session.access_token;
    const previous=messageReactions.find(r=>r.message_id===messageId&&r.user_id===userId);
    setSending(true);setError("");
    try{
      await setMessageReaction(token,userId,messageId,previous?.emoji===emoji?null:emoji);
      if(selectedRef.current===chatId)setMessageReactionPicker(null);
      try{
        const updated=await listMessageReactions(token,[messageId]);
        if(selectedRef.current===chatId)setMessageReactions(current=>[
          ...current.filter(reaction=>reaction.message_id!==messageId),...updated
        ]);
      }catch{/* Reaction was saved; the chat poll will reload its state. */}
    }catch(e){setError(userFacingError(e));}finally{setSending(false);}
  }
  function queueAttachment(file:File|undefined){
    if(!file||!selected||!userId||sending||activePartnerBlocked)return;
    const problem=validateDirectMediaFile(file);
    if(problem){setError(problem);return;}
    setError('');
    setAttachmentCaption('');
    setPendingAttachment({chatId:selected,ownerId:userId,file});
  }
  async function sendAttachment(file:File|undefined,caption=''){
    if(!file||!session||!selected||!userId||sending||activePartnerBlocked)return;
    if(!networkOnline||!navigator.onLine){
      setError('Нет соединения с интернетом. Вложение осталось в предпросмотре.');
      return;
    }
    const chatId=selected,token=session.access_token;
    const problem=validateDirectMediaFile(file);
    if(problem){setError(problem);return;}
    setSending(true);setError("");
    try{
      await sendDirectMedia(token,chatId,userId,file,caption);
      if(selectedRef.current===chatId){
        setPendingAttachment(current=>current?.chatId===chatId&&current.ownerId===userId&&current.file===file?null:current);
        setAttachmentCaption('');
      }
      setNotice("Вложение отправлено.");
      try{
        const updated=(await listMessages(token,chatId)).reverse();
        if(selectedRef.current===chatId)setChatMessages(current=>mergeRecentPage(current,updated,CHAT_MESSAGE_PAGE_SIZE));
      }catch{/* Do not report a sent attachment as failed during refresh. */}
    }catch(e){setError(userFacingError(e));}
    finally{setSending(false);}
  }
  async function logout(){if(!session)return;if(anonymous&&!window.confirm('Это временный аккаунт. После выхода восстановить его нельзя. Выйти?'))return;setBusy(true);try{await signOut(session.access_token);}catch(e){setError(userFacingError(e));}finally{clearChatDrafts(userId);draftsOwnerRef.current='';draftsRef.current={};setDraftPreviews({});setDraft('');previewCacheRef.current={ownerId:'',previews:new Map()};clearSession();setSession(null);setUserId('');setProfile(null);setAnonymous(false);setRows([]);setSavedContacts([]);setBlockedUsers([]);setSelected(null);setProfileTarget(null);setSelectedChannel(null);setChannels([]);setChatMessages([]);setBusy(false);}}
  async function install(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);}else setInstallHelp(true);}
  const storyContacts=useMemo(()=>{
    const byId=new Map<string,Profile>();
    for(const person of savedContacts)byId.set(person.id,person);
    for(const row of rows)if(row.other)byId.set(row.other.id,row.other);
    return Array.from(byId.values());
  },[rows,savedContacts]);
  const contactPeople=useMemo(()=>[...savedContacts].sort((a,b)=>(a.display_name||a.username).localeCompare(b.display_name||b.username,'ru')),[savedContacts]);
  const savedContactIds=useMemo(()=>new Set(savedContacts.map(person=>person.id)),[savedContacts]);
  const blockedUserIds=useMemo(()=>new Set(blockedUsers.map(person=>person.id)),[blockedUsers]);
  useEffect(()=>{
    if(tab!=='contacts'||!session||!contactPeople.length)return;
    let cancelled=false;
    const check=()=>{if(document.visibilityState==='hidden')return;void getUserActivities(session.access_token,contactPeople.slice(0,60).map(p=>p.id)).then(activities=>{if(!cancelled)setUserActivities(previous=>({...previous,...activities}));}).catch(()=>{});};
    check();const poll=window.setInterval(check,45000);
    return()=>{cancelled=true;window.clearInterval(poll);};
  },[tab,session,contactPeople]);
    const active=rows.find(r=>r.chat.id===selected);
  const activePartnerId=active?.other?.id??null;
  const activePartnerBlocked=Boolean(activePartnerId&&blockedUserIds.has(activePartnerId));
  const canPrepareAttachment=Boolean(active&&session&&userId&&!activePartnerBlocked
    &&!profileTarget&&!selectedGroup&&!selectedChannel&&!selectedBot);
  const menuMessage=chatMessages.find(message=>message.id===messageMenuId)||null;
  useEffect(()=>{
    if(!messageMenuId)return;
    const handleKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setMessageMenuId(null);};
    window.addEventListener('keydown',handleKey);
    return()=>window.removeEventListener('keydown',handleKey);
  },[messageMenuId]);
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
  const activeChatLoading=Boolean(selected&&(chatLoad?.id!==selected||chatLoad.status==='loading'));
  const activeChatLoadError=Boolean(selected&&chatLoad?.id===selected&&chatLoad.status==='error');
  const messageById=new Map(chatMessages.map(message=>[message.id,message]));
  const visibleMessages=chatMessages.filter(message=>!message.deleted_for?.includes(userId));
  const loggedIn=Boolean(session&&userId);
  const detailOpen=Boolean(!loggedIn||selected||profileTarget||selectedChannel||selectedGroup||selectedBot);
  const myChannels=channels.filter(ch=>ch.owner_id===userId||subscriptions.includes(ch.id));
  const recommendedChannels=channels.filter(ch=>ch.owner_id!==userId&&!subscriptions.includes(ch.id));
  const filteredChannels=(showRecommendations?recommendedChannels:myChannels).filter(ch=>!channelSearch.trim()||((ch.title+" "+ch.slug).toLowerCase().includes(channelSearch.trim().toLowerCase())));

  return <div className={`messenger ${loggedIn?"is-authenticated":"is-guest"}`} data-version="windows-desktop-v3" data-current-tab={tab}>
    {!networkOnline&&<div className="ik-network-offline" role="status" aria-live="polite">
      <span className="ik-network-offline-mark" aria-hidden="true"/>
      <span><strong>Нет соединения</strong><small>Черновик останется в чате. Отправь сообщение после подключения.</small></span>
    </div>}
    <aside className={`chats-pane ${detailOpen?'has-conversation':''}`}>
      <div className="pane-heading"><div className="brand-label"><img className="brand-mini" src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={132} height={70}/></div><button type="button" className="release-pill" onClick={()=>profile?.id&&goToProfile(profile.id)} disabled={!profile}>{profile ? "@"+profile.username : "ALPHA"}</button></div>
      <div className="pane-toolbar">
        {tab==='chats'&&loggedIn?<button type="button" className="ik-edit-toggle" aria-pressed={editingChats} onClick={()=>{setEditingChats(value=>!value);setSelectedChatIds([]);}}>{editingChats?'Готово':'Изм.'}</button>:<span className="ik-toolbar-spacer" aria-hidden="true"/>}
        <h1>{tab==='chats'?'Чаты':tab==='contacts'?'Контакты':tab==='channels'?'Каналы':tab==='profile'?'Профиль':'Настройки'}</h1>
        <button type="button" className="icon-button ik-compose-button" title={tab==='channels'?'Создать канал':'Новое сообщение'} aria-label={tab==='channels'?'Создать канал':'Новое сообщение'} onClick={()=>{if(tab==='channels'){setChannelCreating(v=>!v);}else{setTab('chats');setCreateMenuOpen(v=>!v);}}} disabled={!loggedIn||editingChats}>
          {tab==='chats'?<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m13 11 7.5-7.5a2.1 2.1 0 0 1 3 3L16 14l-4 1 1-4Z"/></svg>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>}
        </button>
      </div>
      {tab==='chats'&&<div className="pane-search"><span aria-hidden="true" className="ik-search-glyph"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="10.7" cy="10.7" r="6.4"/><path d="m15.5 15.5 5 5"/></svg></span><input ref={searchInputRef} aria-label="Поиск по чатам" placeholder="Поиск по чатам и сообщениям" value={search} onChange={e=>setSearch(e.target.value)} disabled={!loggedIn}/></div>}
      {tab==='chats'&&loggedIn&&session&&<StoriesStrip token={session.access_token} userId={userId} contacts={storyContacts} ownProfile={profile}/>}
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
      {tab==='chats'&&editingChats&&<div className="ik-bulk-actions" role="toolbar" aria-label="Выбранные чаты"><span>{selectedChatIds.length?'Выбрано: '+selectedChatIds.length:'Выбери переписки'}</span><button type="button" disabled={!selectedChatIds.length||busy} onClick={()=>void applyBulkChatAction('read')}>Прочитать</button><button type="button" disabled={!selectedChatIds.length||busy} onClick={()=>void applyBulkChatAction('hide')}>Скрыть</button></div>}
      <div className="chat-list">
      {tab==='chats'&&loggedIn&&chatFilter==='bots'&&<div className="ik-bot-list"><button type="button" onClick={()=>{setSelectedBot('days');setSelected(null);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);}}><span>◷</span><strong>Сколько мне осталось?<small>Счётчик дней до выбранной даты</small></strong><b>›</b></button><button type="button" onClick={()=>{setSelectedBot('mood');setSelected(null);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);}}><span>✳</span><strong>Точка равновесия<small>15 вопросов о самочувствии</small></strong><b>›</b></button></div>}
      {tab==='chats'&&chatFilter!=='bots'&&(loggedIn?inboxItems.length?inboxItems.map(item=>item.kind==='group'
       ? <GroupInboxRow key={'g-'+item.group.id} group={item.group} overview={groupOverviews[item.group.id]} active={selectedGroup?.id===item.group.id} onOpen={()=>{setSelectedGroup(item.group);setSelected(null);setSelectedChannel(null);setProfileTarget(null);}}/>
       : <ChatInboxRow key={'c-'+item.row.chat.id} row={item.row} currentUserId={userId} active={selected===item.row.chat.id} selectionMode={editingChats} selectedForBulk={selectedChatIds.includes(item.row.chat.id)}
          onOpen={()=>{if(editingChats){toggleChatSelection(item.row.chat.id);return;}setSelected(item.row.chat.id);setSelectedGroup(null);setSelectedChannel(null);setProfileTarget(null);setChatMessages([]);setError('');}}
          isSavedContact={Boolean(item.row.other&&savedContactIds.has(item.row.other.id))}
          isBlocked={Boolean(item.row.other&&blockedUserIds.has(item.row.other.id))}
          draft={draftPreviews[item.row.chat.id]||''}
          onContactAction={()=>{if(item.row.other)void toggleSavedContact(item.row.other);}}
          onBlockAction={()=>{if(item.row.other)void toggleBlockedUser(item.row.other);}}
          onAction={action=>void chatAction(item.row.chat.id,action)}/>
       ):<div className="list-empty ik-chat-empty"><div className="empty-icon">✉</div><strong>{chatFilter==='unread'?'Всё прочитано':chatFilter==='groups'?'Нет групп':'Нет переписок'}</strong><p>{chatFilter==='unread'?'Новые сообщения появятся здесь.':chatFilter==='groups'?'Создай группу и пригласи участников.':'Найди человека по юзернейму или создай группу.'}</p>{chatFilter==='all'&&<button className="secondary-action" onClick={()=>switchTab('contacts')}>Новый чат</button>}</div>:<div className="list-empty"><div className="empty-icon">✉</div><strong>Нет переписок</strong><p>{backendReady?'Войди, чтобы читать сообщения.':'Для переписки осталось подключить сервер.'}</p></div>)}
      {tab==='contacts'&&<div className="contact-search-panel">
        <form className="ik-contact-lookup" onSubmit={e=>{e.preventDefault();void searchPerson(lookup.trim().replace(/^@/,''));}}>
          <label className="ik-visually-hidden" htmlFor="lookup">Найти пользователя</label>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.6 4.6"/></svg>
          <input id="lookup" placeholder="Поиск по контактам и @username" value={lookup} onChange={e=>setLookup(e.target.value)} maxLength={25} disabled={!loggedIn}/>
          <button type="submit" disabled={!loggedIn||busy||lookup.trim().replace(/^@/,'').length<3}>{busy?'…':'Найти'}</button>
        </form>
        <div className="ik-contact-invite"><span aria-hidden="true">＋</span><div><strong>Контакты IKONOSFERA</strong><small>Сохранённые люди доступны на всех устройствах</small></div></div>
        <div className="ik-contact-section-label">КОНТАКТЫ <span>{contactPeople.length}</span></div>
        <div className="ik-contact-people">
          {contactPeople.filter(person=>!lookup.trim()||((person.display_name||'')+' '+person.username).toLowerCase().includes(lookup.trim().replace(/^@/,'').toLowerCase())).map(person=>
            <div key={person.id} className="ik-contact-person-row">
              <button type="button" className="ik-contact-person" onClick={()=>goToProfile(person.id)}>
                <span className="contact-avatar">{imageUrl(person.avatar_path)?<img className="avatar-image" src={imageUrl(person.avatar_path)||''} alt=""/>:(person.display_name||person.username).slice(0,1).toUpperCase()}</span>
                <span className="ik-contact-person-text"><strong className="ik-name-with-status"><span>{person.display_name||person.username}</span><StatusEmoji index={person.status_emoji} decorative/></strong><small>{blockedUserIds.has(person.id)?'Заблокирован':activityLabel(userActivities[person.id])}</small></span>
              </button>
              <button type="button" className="ik-contact-remove" title="Удалить из контактов" aria-label={'Удалить из контактов '+(person.display_name||person.username)} disabled={busy} onClick={()=>void toggleSavedContact(person)}>×</button>
            </div>
          )}
          {!contactPeople.length&&<p className="ik-contacts-empty">Сохранённых контактов пока нет. В разделе «Чаты» открой меню ⋯ рядом с перепиской и выбери «Добавить в контакты».</p>}
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
        {!channelCreating&&loggedIn&&<button type="button" className="ik-channel-create-promo" onClick={()=>setChannelCreating(true)}>
          <span className="ik-channel-create-promo-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11v-2a3 3 0 0 1 3-3h6l7-3v18l-7-3H7a3 3 0 0 1-3-3v-4Z"/><path d="m8 18 2 4h4l-3-4"/></svg>
          </span>
          <span><strong>Создать канал</strong><small>Делись идеями, новостями и общайся с подписчиками</small></span>
          <span className="ik-channel-create-promo-arrow" aria-hidden="true">›</span>
        </button>}
        <div className="channel-list">{filteredChannels.length?filteredChannels.map(ch=><div key={ch.id} className={"channel-list-row"+(ch.id===selectedChannel?.id?" active":"")}>
          <button type="button" className="channel-row-open" onClick={()=>{setSelectedChannel(ch);setSelected(null);setProfileTarget(null);setError("");}}><span className="channel-list-icon">{ch.avatar_path&&imageUrl(ch.avatar_path)?<img className="ik-channel-list-avatar" src={imageUrl(ch.avatar_path)||""} alt="" loading="lazy" decoding="async"/>:"#"} </span><span><strong>{ch.title}</strong><small>@{ch.slug} · {(subscriberCounts[ch.id]??0).toLocaleString('ru-RU')} подписчиков</small></span></button>
          {ch.owner_id===userId?<span className="channel-owner-badge">Мой</span>:<button type="button" disabled={busy} className="channel-subscribe-button" onClick={()=>void toggleSubscription(ch.id)}>{subscriptions.includes(ch.id)?"Отписаться":"Подписаться"}</button>}
        </div>):<p className="channel-empty-list">{!loggedIn?"Войди, чтобы увидеть каналы.":showRecommendations?"Новых рекомендаций пока нет.":"Ты ещё не подписан на каналы. Загляни в рекомендации."}</p>}</div>
      </div>}
      {tab==='settings'&&<div className="settings-panel ik-settings-redesign">
        <header className="ik-settings-page-header">
          <h2>Настройки</h2>
          {loggedIn&&<button type="button" className="ik-settings-header-edit" onClick={()=>goToProfile(userId)}>Изм.</button>}
        </header>
        {loggedIn?<>
          <div className="ik-settings-hero">
            <button type="button" className="ik-settings-profile-link" onClick={()=>goToProfile(userId)} aria-label="Открыть мой профиль">
              <span className="ik-settings-hero-avatar">{imageUrl(profile?.avatar_path)
                ?<img src={imageUrl(profile?.avatar_path)||""} alt="" decoding="async"/>
                :(profile?.display_name||'?').charAt(0).toUpperCase()}</span>
              <span className="ik-settings-hero-details">
                <span className="ik-settings-hero-name ik-name-with-status"><strong>{profile?.display_name||"Мой профиль"}</strong><StatusEmoji index={profile?.status_emoji} decorative/></span>
                <span className="ik-settings-hero-username">@{profile?.username||'профиль'}</span>
                <span className={"ik-settings-hero-presence"+(userActivities[userId]?.status==='в сети'?" is-online":"")}><span aria-hidden="true"/>{userActivities[userId]?.status==='в сети'?"В сети":"Мой аккаунт"}</span>
              </span>
              <span className="ik-settings-chevron" aria-hidden="true">›</span>
            </button>
            <button type="button" className="ik-settings-edit-profile" onClick={()=>goToProfile(userId)}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h16m-14-5L16.8 4.2a2.2 2.2 0 0 1 3.1 3.1L9.1 18.1l-4 .9.9-4Z"/></svg>
              Редактировать профиль
            </button>
          </div>
          <div className="ik-settings-shortcuts">
            <button type="button" onClick={()=>goToProfile(userId)}>
              <span className="ik-settings-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m5 18 6-6 4 4 3-3 3 3"/></svg></span>
              <span><strong>Фото и истории</strong><small>Управление</small></span><span aria-hidden="true">›</span>
            </button>
            <button type="button" onClick={()=>switchTab('channels')}>
              <span className="ik-settings-shortcut-icon ik-settings-shortcut-channel" aria-hidden="true"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11v-2c0-1.7 1.3-3 3-3h6l7-3v18l-7-3H7c-1.7 0-3-1.3-3-3v-4Z"/><path d="m8 18 2 4h4l-3-4"/></svg></span>
              <span><strong>Мои каналы</strong><small>Публикации</small></span><span aria-hidden="true">›</span>
            </button>
          </div>
          {anonymous&&<p className="test-account-warning">Тестовый аккаунт без почты: доступ сохраняется только на этом устройстве. После выхода или очистки данных восстановить его нельзя.</p>}
          <section className="ik-settings-section" aria-label="Аккаунт">
            <h3>АККАУНТ</h3>
            <div className="ik-settings-group">
              <button type="button" className="ik-settings-row" onClick={()=>goToProfile(userId)}>
                <span className="ik-settings-icon" aria-hidden="true">◉</span><span className="ik-settings-row-label">Мой профиль</span><span className="ik-settings-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" className="ik-settings-row" onClick={()=>switchTab('contacts')}>
                <span className="ik-settings-icon" aria-hidden="true">♙</span><span className="ik-settings-row-label">Контакты</span><span className="ik-settings-chevron" aria-hidden="true">›</span>
              </button>
              <button type="button" className="ik-settings-row" onClick={()=>switchTab('channels')}>
                <span className="ik-settings-icon" aria-hidden="true">#</span><span className="ik-settings-row-label">Мои каналы</span><span className="ik-settings-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          </section>
          <section className="ik-settings-section" aria-label="Приватность">
            <h3>КОНФИДЕНЦИАЛЬНОСТЬ</h3>
            <div className="ik-settings-group ik-settings-privacy-group">
              <div className="ik-blocklist-settings">
                <button type="button" className="ik-blocklist-toggle ik-settings-row" onClick={()=>setBlocklistOpen(value=>!value)} aria-expanded={blocklistOpen} aria-controls="ik-blocklist-content">
                  <span className="ik-settings-icon" aria-hidden="true">⊘</span><span className="ik-settings-row-label">Чёрный список</span><span className="ik-block-count">{blockedUsers.length}</span><span className="ik-settings-chevron" aria-hidden="true">{blocklistOpen?'⌄':'›'}</span>
                </button>
                {blocklistOpen&&<div id="ik-blocklist-content" className="ik-blocklist-content">
                  {blockedUsers.length?blockedUsers.map(person=><div className="ik-blocked-person" key={person.id}>
                    <span className="contact-avatar">{imageUrl(person.avatar_path)?<img className="avatar-image" alt="" src={imageUrl(person.avatar_path)||''}/>:((person.display_name||person.username)[0]||'?').toUpperCase()}</span>
                    <span className="ik-blocked-person-info"><strong className="ik-name-with-status"><span>{person.display_name||person.username}</span><StatusEmoji index={person.status_emoji} decorative/></strong><small>@{person.username}</small></span>
                    <button type="button" disabled={busy} onClick={()=>void toggleBlockedUser(person)}>Разблокировать</button>
                  </div>):<p className="ik-empty-blocklist">Здесь пока никого нет.</p>}
                </div>}
              </div>
              <div className="ik-privacy-settings">
                <label htmlFor="ik-presence-privacy" className="ik-settings-privacy-heading">
                  <span className="ik-settings-icon" aria-hidden="true">◷</span><span>Последняя активность</span>
                </label>
                <select id="ik-presence-privacy" value={activityVisibility} onChange={e=>void changeActivityVisibility(e.target.value as ActivityVisibility)}>
                  <option value="approximate">Приблизительно: недавно / на неделе / давно</option>
                  <option value="exact">Точное время и статус «В сети»</option>
                </select>
                <p className="ik-privacy-note">Управляй тем, как другие видят твою активность.</p>
              </div>
            </div>
          </section>
          <section className="ik-settings-section" aria-label="Приложение">
            <h3>ПРИЛОЖЕНИЕ</h3>
            <div className="ik-settings-group">
              <button type="button" className="ik-settings-row" onClick={()=>void copyCleanLink()}>
                <span className="ik-settings-icon" aria-hidden="true">↗</span><span className="ik-settings-row-label">Поделиться IKONOSFERA</span><span className="ik-settings-chevron" aria-hidden="true">›</span>
              </button>
              {!platform.standalone&&<button type="button" className="ik-settings-row" onClick={()=>void install()}>
                <span className="ik-settings-icon" aria-hidden="true">↓</span><span className="ik-settings-row-label">Установить приложение</span><span className="ik-settings-chevron" aria-hidden="true">›</span>
              </button>}
              <div className="ik-settings-row ik-settings-info-row"><span className="ik-settings-icon" aria-hidden="true">ⓘ</span>
                <span className="ik-settings-row-label">Подключение</span>
                <span className="ik-settings-row-value">{backendReady?'Работает':'Не подключено'}</span>
              </div>
            </div>
          </section>
          <button type="button" className="ik-settings-logout" disabled={busy} onClick={logout}>Выйти из аккаунта</button>
        </>:<p className="ik-settings-login-hint">Войди, чтобы настроить профиль.</p>}
      </div>}
      </div>
      <nav className="pane-nav" aria-label="Основные разделы">
  <button type="button" aria-label="Контакты" aria-current={tab==='contacts'?'page':undefined} className={tab==='contacts'?'current':''} onClick={()=>switchTab('contacts')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="9" r="5"/><path d="M4 25v-2.5c0-5 4.3-8 10-8s10 3 10 8V25"/></svg></span><span className="nav-label">Контакты</span></button>
  <button type="button" aria-label="Каналы" aria-current={tab==='channels'?'page':undefined} className={tab==='channels'?'current':''} onClick={()=>switchTab('channels')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13v-3a3 3 0 0 1 3-3h7l7-4v21l-7-4H8a3 3 0 0 1-3-3v-4Z"/><path d="m9 21 2 5h4l-3-6"/></svg></span><span className="nav-label">Каналы</span></button>
  <button type="button" aria-label="Чаты" aria-current={tab==='chats'?'page':undefined} className={tab==='chats'?'current':''} onClick={()=>switchTab('chats')}><span className="nav-art"><svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6.5C4 4.6 5.6 3 7.5 3h13C22.4 3 24 4.6 24 6.5v12c0 2-1.6 3.5-3.5 3.5H11l-7 4V6.5Z"/><path d="M8 10h12M8 15h8"/></svg></span><span className="nav-label">Чаты</span></button>
  <button type="button" aria-label="Настройки" aria-current={tab==='settings'||tab==='profile'?'page':undefined} className={tab==='settings'||tab==='profile'?'current':''} onClick={()=>switchTab('settings')}><span className="nav-art">{imageUrl(profile?.avatar_path)?<img className="nav-profile-avatar" src={imageUrl(profile?.avatar_path)||''} alt=""/>:<svg viewBox="0 0 28 28" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="14" cy="9" r="5"/><path d="M5 25v-2c0-5 4-8 9-8s9 3 9 8v2"/></svg>}</span><span className="nav-label">Настройки</span></button>
</nav>
    </aside>
    <main className={`conversation-pane ${detailOpen?'open':''}${attachmentDragActive?' ik-attachment-dragging':''}`}
      onPaste={event=>{
        if(!canPrepareAttachment||sending)return;
        const target=event.target;
        if(target instanceof Element&&target.closest('input,textarea,[contenteditable="true"]')
          &&target!==composerRef.current)return;
        const pasted=Array.from(event.clipboardData.items)
          .find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
        if(!pasted)return;
        event.preventDefault();
        queueAttachment(pasted);
      }}
      onDragEnter={event=>{
        if(!canPrepareAttachment||sending||!Array.from(event.dataTransfer.types).includes('Files'))return;
        event.preventDefault();attachmentDragDepthRef.current+=1;
        setAttachmentDragActive(true);
      }}
      onDragOver={event=>{
        if(!canPrepareAttachment||sending||!Array.from(event.dataTransfer.types).includes('Files'))return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';
      }}
      onDragLeave={event=>{
        if(!attachmentDragDepthRef.current)return;
        event.preventDefault();
        attachmentDragDepthRef.current=Math.max(0,attachmentDragDepthRef.current-1);
        if(attachmentDragDepthRef.current===0)setAttachmentDragActive(false);
      }}
      onDrop={event=>{
        if(!canPrepareAttachment||!Array.from(event.dataTransfer.types).includes('Files'))return;
        event.preventDefault();attachmentDragDepthRef.current=0;setAttachmentDragActive(false);
        if(sending)return;
        const files=Array.from(event.dataTransfer.files);
        queueAttachment(files[0]);
        if(files.length>1)setNotice('Сейчас можно отправлять по одному вложению за раз.');
      }}>
      {attachmentDragActive&&canPrepareAttachment&&<div className="ik-attachment-drop-overlay" aria-hidden="true">
        <span>Отпусти файл, чтобы добавить в сообщение</span>
      </div>}
      {selectedBot&&loggedIn?<BotsPanel userId={userId} bot={selectedBot} onBack={()=>setSelectedBot(null)}/>:
      selectedGroup&&session&&loggedIn?<GroupPanel key={selectedGroup.id} token={session.access_token} userId={userId} group={selectedGroup} onBack={()=>setSelectedGroup(null)} onShowProfile={id=>{setSelectedGroup(null);goToProfile(id);}}/>:
      profileTarget&&session&&loggedIn?<ProfilePanel key={profileTarget} token={session.access_token} userId={userId} targetId={profileTarget} onBack={()=>{setProfileTarget(null);if(tab==='profile')setTab('chats');}} onOwnProfileChange={()=>{void myProfile(session.access_token,userId).then(setProfile).catch(()=>{});}} onMessage={openDirectFromProfile} isBlocked={blockedUserIds.has(profileTarget)} onBlockUser={id=>void toggleProfileBlock(id)} onOpenChannel={channel=>{setProfileTarget(null);setSelected(null);setSelectedChannel(channel);setTab("channels");}}/>:
      selectedChannel&&session&&loggedIn?<ChannelsPanel key={selectedChannel.id} token={session.access_token} userId={userId} channel={selectedChannel} onBack={()=>setSelectedChannel(null)} onShowProfile={goToProfile} subscribed={subscriptions.includes(selectedChannel.id)||selectedChannel.owner_id===userId} onToggleSubscribe={()=>void toggleSubscription(selectedChannel.id)} onMessageAuthor={()=>void getChannelOwnerAndChat(selectedChannel.owner_id)} onChannelUpdated={updated=>{setSelectedChannel(updated);setChannels(old=>old.map(ch=>ch.id===updated.id?updated:ch));}} onChannelDeleted={()=>{setSelectedChannel(null);setChannels(old=>old.filter(ch=>ch.id!==selectedChannel.id));setTab("channels");}}/>:
      
      active&&loggedIn?<><header className="conversation-header"><button type="button" className="back-button" onClick={()=>setSelected(null)} aria-label="Назад к чатам"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5-7 7 7 7"/><path d="M7 12h14"/></svg></button><button type="button" className="contact-avatar small contact-avatar-button" onClick={()=>active.other&&goToProfile(active.other.id)} title="Открыть профиль">{imageUrl(active.other?.avatar_path)?<img className="avatar-image" src={imageUrl(active.other?.avatar_path)||""} alt=""/>:(active.other?.display_name||'?').slice(0,1).toUpperCase()}</button><button type="button" className="conversation-heading conversation-heading-link" onClick={()=>active.other&&goToProfile(active.other.id)}><strong className="ik-name-with-status"><span>{active.other?.display_name??'Собеседник'}</span><StatusEmoji index={active.other?.status_emoji} decorative/></strong><small className={userActivities[activePartnerId||'']?.status==='в сети'?'ik-online-label':undefined}>{activityLabel(userActivities[activePartnerId||''])}</small></button><FloatingActionMenu label="Действия с чатом"
  wrapperClassName="ik-conversation-more"
  triggerClassName="ik-conversation-more-trigger"
  popupClassName="ik-conversation-more-menu ik-floating-conversation-actions"
  trigger={<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>}>
  <button type="button" onClick={()=>active.other&&goToProfile(active.other.id)}>Открыть профиль</button>
  {active.other&&<button type="button" disabled={busy} onClick={()=>void toggleSavedContact(active.other!)}>{savedContactIds.has(active.other.id)?'Удалить из контактов':'＋ Добавить в контакты'}</button>}
  <button type="button" onClick={()=>{if(searchInConversation)resetMessageSearch();else setSearchInConversation(true);}}>Поиск в переписке</button>
  <button type="button" disabled={busy} onClick={()=>void chatAction(active.chat.id,active.chat.pinned_for?.includes(userId)?'unpin':'pin')}>{active.chat.pinned_for?.includes(userId)?'Открепить чат':'Закрепить чат'}</button>
  {active.other&&<button type="button" disabled={busy} onClick={()=>void toggleBlockedUser(active.other!)}>{blockedUserIds.has(active.other.id)?'Разблокировать':'Заблокировать'}</button>}
  <button type="button" disabled={busy} onClick={()=>void chatAction(active.chat.id,'delete_self')}>Удалить только у себя</button>
  <button type="button" disabled={busy} onClick={()=>void chatAction(active.chat.id,'delete_everyone')}>Удалить у обоих</button>
</FloatingActionMenu></header>{activePartnerBlocked&&<div className="ik-chat-blocked-banner" role="status"><span>Собеседник заблокирован. Отправка сообщений отключена.</span><button type="button" onClick={()=>active.other&&void toggleBlockedUser(active.other)}>Разблокировать</button></div>}{searchInConversation&&<DirectMessageSearchPanel
        query={messageSearch} onQueryChange={updateMessageSearch} onClose={resetMessageSearch}
        results={messageSearchOwner?.chatId===selected&&messageSearchOwner.userId===userId&&messageSearchOwner.query===messageSearch.trim()?messageSearchResults:[]} loading={messageSearchLoading} failed={messageSearchError}
        hasMore={messageSearchHasMore} onMore={()=>{
          if(messageSearchError){setMessageSearchError(false);setMessageSearchRetry(retry=>retry+1);}
          else if(!messageSearchLoading)setMessageSearchPage(page=>page+1);
        }}
        onOpen={id=>{void jumpToOriginalMessage(id,true);}}
        userId={userId} partnerName={active.other?.display_name||active.other?.username||'Собеседник'}
        locatingId={locatingReply}
      />}{selectedMessages.length>0&&<div className="ik-selection-toolbar"><span>Выбрано: {selectedMessages.length}</span><button type="button" onClick={()=>{const text=chatMessages.filter(m=>selectedMessages.includes(m.id)).map(m=>m.body).join("\n\n");void navigator.clipboard.writeText(text).then(()=>setNotice("Сообщения скопированы")).catch(()=>setError("Не удалось скопировать"));}}>Копировать</button><button type="button" onClick={()=>setSelectedMessages([])}>Отмена</button></div>}<div className="conversation-history" ref={conversationHistoryRef} aria-live="polite" aria-busy={activeChatLoading} onScroll={event=>{
        const area=event.currentTarget;
        const distance=area.scrollHeight-area.scrollTop-area.clientHeight;
        chatAutoScrollRef.current=distance<120;
        setShowJumpToLatest(distance>220&&!activeChatLoading);
      }}>
      {!activeChatLoading&&!activeChatLoadError&&hasOlderMessages&&<div className="ik-chat-older-controls">
        <button type="button" className="ik-chat-older-button" disabled={loadingOlderMessages} onClick={()=>void loadOlderChatMessages()}>
          {loadingOlderMessages?'Загружаем ранние сообщения…':olderMessagesError?'Не удалось загрузить. Повторить':'Показать предыдущие сообщения'}
        </button>
      </div>}
      {activeChatLoading&&<div className="ik-chat-loading" role="status" aria-label="Загружаем переписку">
        <div className="ik-chat-loading-line"><span className="ik-chat-loading-avatar"/></div>
        <div className="ik-chat-loading-bubble incoming"/><div className="ik-chat-loading-bubble incoming short"/>
        <div className="ik-chat-loading-bubble outgoing"/><div className="ik-chat-loading-bubble incoming"/>
        <span className="ik-chat-loading-label"><span className="ik-chat-loading-spinner" aria-hidden="true"/>Загружаем сообщения…</span>
      </div>}
      {activeChatLoadError&&<div className="ik-chat-load-error" role="alert"><strong>Не удалось загрузить переписку</strong><p>Проверь подключение к интернету. История сообщений не удалена.</p><button type="button" onClick={()=>{setError('');setChatReloadNonce(n=>n+1);}}>Попробовать снова</button></div>}
      {!activeChatLoading&&!activeChatLoadError&&!chatMessages.length&&<div className="conversation-blank"><span>Начало переписки</span><p>Сообщения видны только участникам диалога.</p></div>}{visibleMessages.map((message,index)=><Fragment key={message.id}>{(index===0||new Date(visibleMessages[index-1].created_at).toDateString()!==new Date(message.created_at).toDateString())&&<div className="ik-chat-day-separator" role="separator"><span>{dayLabel(message.created_at)}</span></div>}<SwipeReplyMessage className={`chat-message-row ${message.sender_id===userId?'mine':'theirs'}`}
        disabled={Boolean(message.deleted_for_everyone||editingMessageId===message.id)}
        onReply={()=>replyToMessage(message)}
        onOpenMenu={!message.deleted_for_everyone?()=>{setMessageMenuId(message.id);setMessageReactionPicker(null);}:undefined}><div id={'ik-chat-message-'+message.id} className={`bubble ${message.sender_id===userId?'mine':'theirs'}`}>
          {!message.deleted_for_everyone&&message.reply_to_message_id&&<ReplyQuote
            target={messageById.get(message.reply_to_message_id)??replyTargets[message.reply_to_message_id]??null}
            senderName={!(messageById.get(message.reply_to_message_id)??replyTargets[message.reply_to_message_id])?'Исходное сообщение':((messageById.get(message.reply_to_message_id)??replyTargets[message.reply_to_message_id])?.sender_id===userId)?'Вы':active?.other?.display_name||active?.other?.username||'Собеседник'}
            onJump={()=>void jumpToOriginalMessage(message.reply_to_message_id!)}
            loading={locatingReply===message.reply_to_message_id}
          />}{!message.deleted_for_everyone&&message.media_path&&message.media_type&&session&&<ChatMedia token={session.access_token} path={message.media_path} type={message.media_type}/>} {message.deleted_for_everyone?<span className="message-deleted">Сообщение удалено</span>:editingMessageId===message.id?<MessageEditForm
            value={editingMessageBody} onChange={setEditingMessageBody}
            onSave={body=>messageAction(message.id,'edit',body)}
            onCancel={()=>{setEditingMessageId(null);setEditingMessageBody('');}}
          />:message.body&&<span>{message.body}</span>}<time dateTime={message.created_at}>{message.edited_at&&!message.deleted_for_everyone&&<span className="message-edited-label" title="Сообщение отредактировано">изм. · </span>}{message.sender_id===userId&&<span className={"message-receipt"+(message.read_at?" read":"")} title={message.read_at?"Просмотрено":"Отправлено"}>{message.read_at?"✓✓":"✓"}</span>}{new Date(message.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div><div className="chat-message-tools">{!message.deleted_for_everyone&&<button type="button" className="ik-message-menu-toggle" aria-label="Действия с сообщением" onClick={()=>{setMessageMenuId(message.id);setMessageReactionPicker(null);}}>···</button>}<div className="reaction-bar message-reaction-bar">
 {REACTION_EMOJIS.filter(emoji=>messageReactions.some(r=>r.message_id===message.id&&r.emoji===emoji)).map(emoji=><button key={emoji} type="button" className={"reaction-pill"+(messageReactions.some(r=>r.message_id===message.id&&r.user_id===userId&&r.emoji===emoji)?" mine":"")} onClick={()=>void reactToMessage(message.id,emoji)} disabled={sending}>{emoji} <span>{messageReactions.filter(r=>r.message_id===message.id&&r.emoji===emoji).length}</span></button>)}
 <button type="button" className="reaction-add" aria-label="Добавить реакцию" onClick={()=>setMessageReactionPicker(messageReactionPicker===message.id?null:message.id)}>☺ +</button>
 {messageReactionPicker===message.id&&<div className="reaction-picker">{REACTION_EMOJIS.map(emoji=><button type="button" key={emoji} disabled={sending} onClick={()=>void reactToMessage(message.id,emoji)} aria-label={"Реакция "+emoji}>{emoji}</button>)}</div>}
 </div></div></SwipeReplyMessage></Fragment>)}<div ref={messageEnd}/></div>
      {showJumpToLatest&&!activeChatLoading&&<button type="button" className={"ik-jump-to-latest"+(replyingTo?.chatId===selected?" with-reply":"")} aria-label="Перейти к последним сообщениям" title="К последним сообщениям"
        onClick={()=>{const history=conversationHistoryRef.current;if(history){chatAutoScrollRef.current=true;history.scrollTop=history.scrollHeight;}setShowJumpToLatest(false);}}>
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 9 7 7 7-7"/></svg>
      </button>}
      {replyingTo?.chatId===selected&&<div className="ik-inline-reply" role="status">
        <div className="ik-inline-reply-mark" aria-hidden="true"/>
        <div className="ik-inline-reply-copy"><strong>Ответ для {replyingTo.name}</strong><span>{replyingTo.text}</span></div>
        <button type="button" onClick={()=>setReplyingTo(null)} aria-label="Отменить ответ">✕</button>
      </div>}
      <form className="composer" onSubmit={sendMessage}><label className="chat-attach-button" title="Прикрепить фото, видео, музыку или файл" aria-label="Прикрепить файл"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.5 12.3 19.7a5.4 5.4 0 0 1-7.7-7.7L13 3.6a3.6 3.6 0 0 1 5.1 5.1l-8.7 8.7a1.8 1.8 0 0 1-2.6-2.6l7.7-7.7"/></svg><input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" disabled={sending||activePartnerBlocked||!networkOnline} onChange={e=>{queueAttachment(e.target.files?.[0]);e.target.value="";}}/></label><textarea ref={composerRef} aria-label="Написать сообщение" enterKeyHint="enter" placeholder={activePartnerBlocked?"Вы заблокировали пользователя":"Сообщение…"} rows={1} disabled={activePartnerBlocked} value={draft} onChange={e=>{setDraft(e.target.value);if(selected)updateChatDraft(selected,e.target.value);}} onInput={e=>{const element=e.currentTarget;element.style.height='auto';element.style.height=Math.min(element.scrollHeight,136)+'px';}} onKeyDown={e=>{
        // On iOS/Android the Return key must create a newline, not send the
        // message unexpectedly. Hardware-keyboard users retain Enter-to-send.
        const softKeyboard=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
          ||window.matchMedia('(pointer:coarse) and (hover:none)').matches;
        if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!softKeyboard){
          e.preventDefault();
          if(draft.trim()&&!sending)e.currentTarget.form?.requestSubmit();
        }
      }} maxLength={4000}/><button type="submit" className="send-button" disabled={!draft.trim()||sending||activePartnerBlocked||!networkOnline} aria-label="Отправить сообщение" title={!networkOnline?'Нет соединения с интернетом':undefined}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></form></>:selected&&loggedIn?<div className="ik-chat-entry-loading" aria-live="polite" role="status">
       <header className="conversation-header"><button type="button" className="back-button" aria-label="Назад к чатам" onClick={()=>setSelected(null)}>‹</button><strong>Открываем диалог…</strong></header>
       <div className="ik-chat-loading"><div className="ik-chat-loading-bubble incoming"/><div className="ik-chat-loading-bubble incoming short"/><div className="ik-chat-loading-bubble outgoing"/><span className="ik-chat-loading-label"><span className="ik-chat-loading-spinner" aria-hidden="true"/>Загружаем переписку…</span></div>
     </div>:<div className="conversation-placeholder">{!loggedIn&&<div className="guest-brand"><img src="/branding/ikonosfera-wordmark.svg" alt="IKONOSFERA" width={250} height={108}/><span>© BY TENDO888</span></div>}{loggedIn&&<div className="welcome-mark" aria-hidden="true">IKONOSFERA<span> / DESKTOP</span></div>}<h2>{loggedIn?'Твои разговоры начинаются здесь':emailSent?'Остался один шаг':'Больше чем просто мессенджер'}</h2><p>{loggedIn?'Выбери переписку слева или найди человека по юзернейму.':emailSent?'Открой письмо и перейди по ссылке Sign in.':'IKONOSFERA — современный мессенджер для Android, iPhone, macOS и Windows. Работает без VPN и ограничений!'}</p>{loggedIn&&<div className="desktop-welcome-actions"><button type="button" className="accent-button" onClick={()=>switchTab('contacts')}>＋ Найти человека</button><button type="button" className="secondary-action" onClick={()=>switchTab('channels')}>Открыть каналы</button></div>}{!loggedIn&&(backendReady?<div className="auth-panel"><h3>{emailSent?'Проверь почту':'Войти или зарегистрироваться'}</h3>{!emailSent?<form onSubmit={requestSignInLink}><label htmlFor="authEmail">Электронная почта</label><input id="authEmail" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/><button className="accent-button" disabled={busy}>{busy?'Отправляем…':'Получить ссылку для входа'}</button></form>:<div className="email-signin-result"><div className="email-signin-guide" role="status"><strong>Письмо отправлено на {email}</strong><p>Открой почту и найди письмо от <b>Supabase Auth</b> с темой <b>Your sign-in link</b>.</p><p>Нажми синюю ссылку <b>Sign in</b> («Войти»). После перехода IKONOSFERA откроется с твоим аккаунтом.</p><small>Если письма нет, проверь «Спам». Ссылка одноразовая; вводить код не требуется.</small></div><button type="button" className="text-button" onClick={()=>{setEmailSent(false);setError('');}}>Использовать другой адрес</button></div>}<div className="temporary-login"><button type="button" className="secondary-action" onClick={()=>void beginTemporaryAccount()} disabled={busy}>Попробовать без почты — тестовый аккаунт</button><p>Бесплатный тестовый вход. Для работы требуется включить Anonymous Sign-Ins в Supabase. Не используй реальные личные данные.</p></div></div>:<div className="setup-notice"><strong>Подключаем сообщения</strong><p>Сервер переписки ещё не настроен. Как только будет подключена база, здесь появится вход.</p></div>)}</div>}
    </main>
    {pendingAttachment?.chatId===selected&&pendingAttachment.ownerId===userId
      &&canPrepareAttachment&&<ChatAttachmentPreview
        file={pendingAttachment.file} caption={attachmentCaption}
        sending={sending||!networkOnline}
        onCaptionChange={setAttachmentCaption}
        onCancel={()=>{setPendingAttachment(null);setAttachmentCaption('');}}
        onSend={()=>{void sendAttachment(pendingAttachment.file,attachmentCaption);}}
      />}
    {menuMessage&&<div className="ik-message-menu-backdrop" onClick={()=>setMessageMenuId(null)}>
      <div className="ik-message-menu-sheet" role="dialog" aria-modal="true" aria-label="Действия с сообщением" onClick={e=>e.stopPropagation()}>
        <div className="ik-message-menu-preview">
          <span className="ik-message-menu-preview-name">{menuMessage.sender_id===userId?'Вы':active?.other?.display_name||'Собеседник'}</span>
          <span className="ik-message-menu-preview-text">{menuMessage.body?.slice(0,180)||'Вложение'}</span>
          <span className="ik-message-menu-preview-time">{new Date(menuMessage.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
        </div>
        <div className="ik-message-menu-reactions" role="group" aria-label="Быстрая реакция">
          {REACTION_EMOJIS.slice(0,6).map(emoji=><button type="button" key={emoji} aria-label={'Реакция '+emoji} disabled={sending} onClick={()=>{const id=menuMessage.id;setMessageMenuId(null);void reactToMessage(id,emoji);}}>{emoji}</button>)}
        </div>
        <div className="ik-message-menu-buttons">
          <button type="button" onClick={()=>replyToMessage(menuMessage)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 9 5 14l5 5"/><path d="M5 14h9a5 5 0 0 0 5-5V5"/></svg><span>Ответить</span>
          </button>
          {Boolean(menuMessage.body)&&<button type="button" onClick={()=>{const text=menuMessage.body;setMessageMenuId(null);void navigator.clipboard.writeText(text).then(()=>setNotice('Сообщение скопировано.')).catch(()=>setError('Не удалось скопировать сообщение.'));}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Копировать</span>
          </button>}
          {menuMessage.sender_id===userId&&!menuMessage.deleted_for_everyone&&!menuMessage.media_path&&<button type="button" onClick={()=>{setEditingMessageId(menuMessage.id);setEditingMessageBody(menuMessage.body);setMessageMenuId(null);}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h16"/><path d="m7 16 9-9 3 3-9 9-4 1 1-4Z"/><path d="m15 8 2-2a2 2 0 0 1 3 3l-2 2"/></svg><span>Изменить</span>
          </button>}
          <button type="button" onClick={()=>{setSelectedMessages(previous=>previous.includes(menuMessage.id)?previous.filter(id=>id!==menuMessage.id):[...previous,menuMessage.id]);setMessageMenuId(null);}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><span>{selectedMessages.includes(menuMessage.id)?'Снять выделение':'Выбрать'}</span>
          </button>
          <div className="ik-message-menu-divider" role="separator"/>
          <button type="button" className="ik-message-menu-danger" onClick={()=>{const id=menuMessage.id;setMessageMenuId(null);void messageAction(id,'hide');}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg><span>Удалить у себя</span>
          </button>
          {menuMessage.sender_id===userId&&<button type="button" className="ik-message-menu-danger" onClick={()=>{const id=menuMessage.id;setMessageMenuId(null);void messageAction(id,'delete_everyone');}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/></svg><span>Удалить для всех</span>
          </button>}
        </div>
        <button type="button" className="ik-message-menu-cancel" onClick={()=>setMessageMenuId(null)}>Отмена</button>
      </div>
    </div>}
    {(error||notice)&&<div role="status" className={`toast ${error?'toast-error':notice==='Ссылка скопирована!'?'toast-copy-success':''}`}><span>{error||notice}</span><button aria-label="Закрыть уведомление" onClick={()=>{setError('');setNotice('');}}>×</button></div>}
    {installHelp&&<div className="install-backdrop" role="dialog" aria-modal="true" aria-label="Установка приложения"><div className="install-card"><h2>Установить IKONOSFERA</h2><p>{platform.ios?'Открой страницу в Safari → «Поделиться» → «На экран Домой» → «Добавить».':'В Chrome на Android открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран».'}</p><button className="accent-button" onClick={()=>setInstallHelp(false)}>Понятно</button></div></div>}
    {loading&&<div className="initializing"><img src="/branding/ikonosfera.svg" alt="IKONOSFERA © BY TENDO888" width={1266} height={734}/><span>Загружаем переписки…</span></div>}
  </div>;
}
