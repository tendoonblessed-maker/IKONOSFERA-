'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { listProfiles, type Profile } from "@/lib/supabase-rest";
import { createRequestEpoch } from "@/lib/request-epoch";
import { appendOlderChannelPosts } from "@/lib/channel-post-pagination";
import { prependOlderChannelComments } from "@/lib/channel-comment-pagination";
import {listDiscussionFeedPage,mergeDiscussionFeedItems,removeDiscussionPostComments,removeDiscussionComments,type DiscussionFeedCursor,type DiscussionFeedItem} from "@/lib/channel-discussion-pagination";
import StatusEmoji from "@/components/StatusEmoji";
import {
 addPostComment, deletePost, editChannelPost, manageChannelComment, imageUrl, listChannelPosts, listChannelPostsPage, listPostComments, listPostCommentsPage, listPostReactions, setPostReaction, REACTION_EMOJIS, publishPost,
 removeUpload, uploadChannelAttachment, updateChannel, updateChannelAvatar, deleteChannel, getChannelSubscriberCounts, sendDiscussionMessage, deleteDiscussionMessage,
 type Channel, type ChannelPost, type PostComment, type PostReaction, type ReactionEmoji
} from "@/lib/social";

type Props={token:string;userId:string;channel:Channel;onBack:()=>void;onShowProfile:(id:string)=>void;subscribed:boolean;onToggleSubscribe:()=>void;onMessageAuthor:()=>void;onChannelUpdated?:(channel:Channel)=>void;onChannelDeleted?:()=>void};
const readable=(e:unknown)=>e instanceof Error?e.message:"Ошибка соединения";
const formattedDate=(s:string)=>new Date(s).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});

export default function ChannelsPanel({token,userId,channel,onBack,onShowProfile,subscribed,onToggleSubscribe,onMessageAuthor,onChannelUpdated,onChannelDeleted}:Props){
 const mine=channel.owner_id===userId;
 const [currentChannel,setCurrentChannel]=useState(channel);
 const [subscriberCount,setSubscriberCount]=useState<number|null>(null);
 useEffect(()=>{let cancelled=false;void getChannelSubscriberCounts(token,[channel.id]).then(counts=>{if(!cancelled)setSubscriberCount(counts[channel.id]??0);}).catch(()=>{if(!cancelled)setSubscriberCount(null);});return()=>{cancelled=true;};},[token,channel.id,subscribed]);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [avatarBusy,setAvatarBusy]=useState(false);
 const [settingsTitle,setSettingsTitle]=useState(channel.title);
 const [settingsSlug,setSettingsSlug]=useState(channel.slug);
 const [settingsDescription,setSettingsDescription]=useState(channel.description);
 const [settingsDiscussion,setSettingsDiscussion]=useState(Boolean(channel.discussion_enabled));
 const [discussionOpen,setDiscussionOpen]=useState(false);
 const [discussionItems,setDiscussionItems]=useState<DiscussionFeedItem[]>([]);
 const [discussionCursor,setDiscussionCursor]=useState<DiscussionFeedCursor|null>(null);
 const [hasOlderDiscussion,setHasOlderDiscussion]=useState(false);
 const [discussionLoading,setDiscussionLoading]=useState(false);
 const [olderDiscussionLoading,setOlderDiscussionLoading]=useState(false);
 const [discussionError,setDiscussionError]=useState("");
 const [olderDiscussionError,setOlderDiscussionError]=useState("");
 const discussionListRef=useRef<HTMLDivElement|null>(null);
 const discussionAbortRef=useRef<AbortController|null>(null);
 const discussionOlderLoadingRef=useRef(false);
 const discussionScrollAnchorRef=useRef<{scrollTop:number;scrollHeight:number}|null>(null);
 const deletedDiscussionPostsRef=useRef<Set<string>>(new Set());
 const deletedDiscussionCommentsRef=useRef<Set<string>>(new Set());
 const discussionInitialScrollRef=useRef(false);
 const [discussionDraft,setDiscussionDraft]=useState("");
  const [posts,setPosts]=useState<ChannelPost[]>([]);
 const [hasOlderPosts,setHasOlderPosts]=useState(false);
 const [postsReloading,setPostsReloading]=useState(false);
 const [olderPostsLoading,setOlderPostsLoading]=useState(false);
 const [olderPostsError,setOlderPostsError]=useState("");
 const [reactions,setReactions]=useState<PostReaction[]>([]);
 const [reactionPicker,setReactionPicker]=useState<string|null>(null);
 const [body,setBody]=useState("");const [file,setFile]=useState<File|null>(null);
 const [openComments,setOpenComments]=useState<string|null>(null);
 const [comments,setComments]=useState<PostComment[]>([]);
 const [commentsLoading,setCommentsLoading]=useState(false);
 const [hasOlderComments,setHasOlderComments]=useState(false);
 const [olderCommentsLoading,setOlderCommentsLoading]=useState(false);
 const [olderCommentsError,setOlderCommentsError]=useState("");
 const commentsPostRef=useRef<string|null>(null);
 const [authors,setAuthors]=useState<Record<string,Profile>>({});
 const [commentDraft,setCommentDraft]=useState("");
 const [editingPostId,setEditingPostId]=useState<string|null>(null);
 const [editingCommentId,setEditingCommentId]=useState<string|null>(null);
 const [editingBody,setEditingBody]=useState("");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const commentsRequestGuardRef=useRef<ReturnType<typeof createRequestEpoch> | null>(null);
 if(!commentsRequestGuardRef.current)commentsRequestGuardRef.current=createRequestEpoch();
 const commentsRequestGuard=commentsRequestGuardRef.current;
 const olderCommentsLoadingRef=useRef(false);
 const postsRequestGuardRef=useRef<ReturnType<typeof createRequestEpoch> | null>(null);
 if(!postsRequestGuardRef.current)postsRequestGuardRef.current=createRequestEpoch();
 const postsRequestGuard=postsRequestGuardRef.current;
 const olderPostsRequestGuardRef=useRef<ReturnType<typeof createRequestEpoch> | null>(null);
 if(!olderPostsRequestGuardRef.current)olderPostsRequestGuardRef.current=createRequestEpoch();
 const olderPostsRequestGuard=olderPostsRequestGuardRef.current;
 const reactionsRequestGuardRef=useRef<ReturnType<typeof createRequestEpoch> | null>(null);
 if(!reactionsRequestGuardRef.current)reactionsRequestGuardRef.current=createRequestEpoch();
 const reactionsRequestGuard=reactionsRequestGuardRef.current;
 const olderPostsLoadingRef=useRef(false);
 const postsReloadingRef=useRef(false);
 const cancelOlderPostsLoad=useCallback(()=>{
  olderPostsRequestGuard.invalidate();
  olderPostsLoadingRef.current=false;
  setOlderPostsLoading(false);
 },[olderPostsRequestGuard]);
 const discussionRequestGuardRef=useRef<ReturnType<typeof createRequestEpoch> | null>(null);
 if(!discussionRequestGuardRef.current)discussionRequestGuardRef.current=createRequestEpoch();
 const discussionRequestGuard=discussionRequestGuardRef.current;
 const abortDiscussionRequest=useCallback(()=>{
  discussionAbortRef.current?.abort();
  discussionAbortRef.current=null;
  discussionRequestGuard.invalidate();
  discussionOlderLoadingRef.current=false;
 },[discussionRequestGuard]);
 const channelScopeRef=useRef({token,userId,channelId:channel.id});
 useLayoutEffect(()=>{
  // Publish only committed identity props; an abandoned concurrent render must not
  // invalidate requests that still belong to the visible channel.
  channelScopeRef.current={token,userId,channelId:channel.id};
  deletedDiscussionPostsRef.current.clear();
  deletedDiscussionCommentsRef.current.clear();
  abortDiscussionRequest();
  setDiscussionOpen(false);
  setDiscussionItems([]);setDiscussionCursor(null);setHasOlderDiscussion(false);
  setDiscussionLoading(false);setOlderDiscussionLoading(false);setDiscussionError("");setOlderDiscussionError("");
  discussionScrollAnchorRef.current=null;discussionInitialScrollRef.current=false;
  commentsRequestGuard.invalidate();
  commentsPostRef.current=null;
  olderCommentsLoadingRef.current=false;
  setCommentsLoading(false);setHasOlderComments(false);setOlderCommentsLoading(false);setOlderCommentsError("");
  postsRequestGuard.invalidate();
  cancelOlderPostsLoad();
  reactionsRequestGuard.invalidate();
  postsReloadingRef.current=true;
  setPostsReloading(true);
  setHasOlderPosts(false);
 },[token,userId,channel.id,commentsRequestGuard,postsRequestGuard,cancelOlderPostsLoad,reactionsRequestGuard,abortDiscussionRequest]);
 useEffect(()=>()=> {
  commentsRequestGuard.invalidate();
  postsRequestGuard.invalidate();
  abortDiscussionRequest();
 },[commentsRequestGuard,postsRequestGuard,abortDiscussionRequest]);
 useEffect(()=>()=> {
  olderPostsRequestGuard.invalidate();
  olderPostsLoadingRef.current=false;
  postsReloadingRef.current=false;
  reactionsRequestGuard.invalidate();
 },[olderPostsRequestGuard,reactionsRequestGuard]);
 const reload=useCallback(async()=>{
  const requestId=postsRequestGuard.begin();
  cancelOlderPostsLoad();
  reactionsRequestGuard.invalidate();
  postsReloadingRef.current=true;setPostsReloading(true);
  setOlderPostsError("");
  const isCurrent=()=>postsRequestGuard.isCurrent(requestId)
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId===userId
   &&channelScopeRef.current.channelId===channel.id;
  try{
   const list=await listChannelPosts(token,channel.id);
   if(!isCurrent())return false;
   const nextReactions=await listPostReactions(token,list.map(p=>p.id));
   if(!isCurrent())return false;
   setPosts(list);setReactions(nextReactions);setHasOlderPosts(list.hasMore);
   return true;
  }catch(e){
   if(isCurrent())throw e;
   return false;
  }finally{
   if(isCurrent()){postsReloadingRef.current=false;setPostsReloading(false);}
  }
 },[token,channel.id,postsRequestGuard,cancelOlderPostsLoad,reactionsRequestGuard]);
 const loadOlderPosts=useCallback(async()=>{
  if(!hasOlderPosts||!posts.length||postsReloadingRef.current||olderPostsLoadingRef.current)return;
  const oldest=posts[posts.length-1];
  olderPostsLoadingRef.current=true;
  const requestId=olderPostsRequestGuard.begin();
  const isCurrent=()=>olderPostsRequestGuard.isCurrent(requestId)
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId===userId
   &&channelScopeRef.current.channelId===channel.id;
  setOlderPostsLoading(true);setOlderPostsError("");
  try{
   const page=await listChannelPostsPage(token,channel.id,oldest);
   if(!isCurrent())return;
   const nextReactions=await listPostReactions(token,page.posts.map(p=>p.id));
   if(!isCurrent())return;
   const merged=appendOlderChannelPosts(posts,page.posts);
   if(merged.length===posts.length&&page.hasMore){
    setOlderPostsError("Не удалось продвинуться к более ранним публикациям. Повтори загрузку.");
    return;
   }
   const pageIds=new Set(page.posts.map(p=>p.id));
   setPosts(merged);
   setReactions(current=>[...current.filter(reaction=>!pageIds.has(reaction.post_id)),...nextReactions]);
   setHasOlderPosts(page.hasMore);
  }catch(e){
   if(isCurrent())setOlderPostsError(readable(e));
  }finally{
   if(isCurrent()){olderPostsLoadingRef.current=false;setOlderPostsLoading(false);}
  }
 },[hasOlderPosts,posts,token,userId,channel.id,olderPostsRequestGuard]);
 const loadDiscussion=useCallback(async()=>{
  abortDiscussionRequest();
  const controller=new AbortController();
  discussionAbortRef.current=controller;
  const requestId=discussionRequestGuard.begin();
  const isCurrent=()=>discussionRequestGuard.isCurrent(requestId)
   &&discussionAbortRef.current===controller
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId===userId
   &&channelScopeRef.current.channelId===channel.id;
  setDiscussionLoading(true);setOlderDiscussionLoading(false);setDiscussionError("");setOlderDiscussionError("");
  try{
   const page=await listDiscussionFeedPage(token,channel.id,undefined,controller.signal);
   if(!isCurrent())return false;
   discussionScrollAnchorRef.current=null;
   discussionInitialScrollRef.current=page.items.length>0;
   setDiscussionItems(removeDiscussionComments(removeDiscussionPostComments(page.items,deletedDiscussionPostsRef.current),deletedDiscussionCommentsRef.current));setDiscussionCursor(page.cursor);setHasOlderDiscussion(page.hasMore);
   return true;
  }catch(e){
   if(isCurrent())setDiscussionError(readable(e));
   return false;
  }finally{
   if(isCurrent()){discussionAbortRef.current=null;setDiscussionLoading(false);}
  }
 },[token,userId,channel.id,discussionRequestGuard,abortDiscussionRequest]);
 const loadOlderDiscussion=useCallback(async()=>{
  if(!hasOlderDiscussion||!discussionCursor||discussionOlderLoadingRef.current)return;
  abortDiscussionRequest();
  discussionOlderLoadingRef.current=true;
  const controller=new AbortController();
  discussionAbortRef.current=controller;
  const requestId=discussionRequestGuard.begin();
  const isCurrent=()=>discussionRequestGuard.isCurrent(requestId)
   &&discussionAbortRef.current===controller
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId===userId
   &&channelScopeRef.current.channelId===channel.id;
  const list=discussionListRef.current;
  const anchor=list?{scrollTop:list.scrollTop,scrollHeight:list.scrollHeight}:null;
  setOlderDiscussionLoading(true);setOlderDiscussionError("");
  try{
   const page=await listDiscussionFeedPage(token,channel.id,discussionCursor,controller.signal);
   if(!isCurrent())return;
   const visibleItems=removeDiscussionComments(removeDiscussionPostComments(page.items,deletedDiscussionPostsRef.current),deletedDiscussionCommentsRef.current);
   if(visibleItems.length&&anchor)discussionScrollAnchorRef.current=anchor;
   setDiscussionItems(current=>mergeDiscussionFeedItems(current,visibleItems));
   setDiscussionCursor(page.cursor);setHasOlderDiscussion(page.hasMore);
  }catch(e){
   if(isCurrent())setOlderDiscussionError(readable(e));
  }finally{
   if(isCurrent()){
    discussionAbortRef.current=null;discussionOlderLoadingRef.current=false;setOlderDiscussionLoading(false);
   }
  }
 },[hasOlderDiscussion,discussionCursor,token,userId,channel.id,discussionRequestGuard,abortDiscussionRequest]);
 useLayoutEffect(()=>{
  const list=discussionListRef.current;
  const anchor=discussionScrollAnchorRef.current;
  if(anchor){
   if(list)list.scrollTop=anchor.scrollTop+(list.scrollHeight-anchor.scrollHeight);
   discussionScrollAnchorRef.current=null;
   return;
  }
  if(discussionInitialScrollRef.current){
   if(list)list.scrollTop=list.scrollHeight;
   discussionInitialScrollRef.current=false;
  }
 },[discussionItems]);
 async function changeChannelAvatar(file:File|undefined){
  if(!mine||!file||avatarBusy)return;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setError("Выбери JPG, PNG или WebP.");return;}
  if(file.size>3*1024*1024){setError("Аватарка должна быть меньше 3 МБ.");return;}
  setAvatarBusy(true);setError("");
  try{
   const bitmap=await createImageBitmap(file);
   const canvas=document.createElement("canvas");canvas.width=512;canvas.height=512;
   const context=canvas.getContext("2d");
   if(!context){bitmap.close();throw Error("Редактор изображений недоступен.");}
   const scale=Math.max(512/bitmap.width,512/bitmap.height);
   context.drawImage(bitmap,(512-bitmap.width*scale)/2,(512-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);
   bitmap.close();
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(Error("Не удалось обработать фото.")),"image/jpeg",.9));
   const uploaded=await uploadChannelAttachment(token,userId,new File([blob],"channel-avatar.jpg",{type:"image/jpeg"}));
   try{const updated=await updateChannelAvatar(token,currentChannel.id,userId,uploaded.path);setCurrentChannel(updated);onChannelUpdated?.(updated);setNotice("Аватарка канала обновлена.");}
   catch(e){await removeUpload(token,uploaded.path).catch(()=>{});throw e;}
  }catch(e){setError(readable(e));}finally{setAvatarBusy(false);}
 }
 async function saveSettings(e:FormEvent){
  e.preventDefault();if(!mine||busy)return;setBusy(true);setError("");
  try{const updated=await updateChannel(token,channel.id,userId,settingsTitle,settingsSlug,settingsDescription,settingsDiscussion);
   setCurrentChannel(updated);onChannelUpdated?.(updated);setSettingsOpen(false);setNotice("Настройки канала сохранены.");
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function eraseChannel(){
  if(!mine||busy||!window.confirm("Удалить канал и все публикации, комментарии и обсуждения без возможности восстановления?"))return;
  const answer=window.prompt('Для полного удаления введи УДАЛИТЬ');
  if(answer!=="УДАЛИТЬ")return;
  setBusy(true);setError("");
  try{await deleteChannel(token,channel.id,userId);onChannelDeleted?.();}catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function sendDiscussion(e:FormEvent){
  e.preventDefault();if(!currentChannel.discussion_enabled||busy||!discussionDraft.trim())return;
  setBusy(true);setError("");
  try{await sendDiscussionMessage(token,channel.id,userId,discussionDraft);setDiscussionDraft("");await loadDiscussion();}
  catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function eraseDiscussion(id:string){
  if(busy||!window.confirm("Удалить сообщение из обсуждения?"))return;
  setBusy(true);setError("");try{await deleteDiscussionMessage(token,id);await loadDiscussion();}
  catch(e){setError(readable(e));}finally{setBusy(false);}
 }
  async function react(postId:string,emoji:ReactionEmoji){
  if(busy)return;
  const requestId=reactionsRequestGuard.begin();
  const isCurrent=()=>reactionsRequestGuard.isCurrent(requestId)
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId === userId
   &&channelScopeRef.current.channelId===channel.id;
  setBusy(true);setError("");setNotice("");
  const mine=reactions.find(r=>r.post_id===postId&&r.user_id===userId);
  try{
   await setPostReaction(token,userId,postId,mine?.emoji===emoji?null:emoji);
   if(!isCurrent())return;
   setReactions(current=>{
    const remaining=current.filter(r=>!(r.post_id===postId&&r.user_id===userId));
    return mine?.emoji===emoji?remaining:[...remaining,{post_id:postId,user_id:userId,emoji}];
   });
   setReactionPicker(null);
   try{
    const updated=await listPostReactions(token,[postId]);
    if(isCurrent())setReactions(current=>[...current.filter(r=>r.post_id!==postId),...updated]);
   }catch{
    if(isCurrent())setNotice("Реакция сохранена, но счётчики пока не обновились.");
   }
  }catch(e){if(isCurrent())setError(readable(e));}
  finally{if(isCurrent())setBusy(false);}
 }
 useEffect(()=>{void reload().catch(e=>setError(readable(e)));commentsPostRef.current=null;olderCommentsLoadingRef.current=false;setOpenComments(null);setComments([]);setCommentsLoading(false);setHasOlderComments(false);setOlderCommentsLoading(false);setOlderCommentsError("");setBody("");setFile(null);setPosts([]);setReactions([]);abortDiscussionRequest();setDiscussionItems([]);setDiscussionCursor(null);setHasOlderDiscussion(false);setDiscussionLoading(false);setOlderDiscussionLoading(false);setDiscussionError("");setOlderDiscussionError("");discussionScrollAnchorRef.current=null;discussionInitialScrollRef.current=false;setDiscussionOpen(false);setHasOlderPosts(false);setOlderPostsError("");setOlderPostsLoading(false);olderPostsLoadingRef.current=false;setBusy(false);},[reload,abortDiscussionRequest]);
 async function showComments(postId:string){
  const requestId=commentsRequestGuard.begin();
  const isCurrent=()=>commentsRequestGuard.isCurrent(requestId)
   &&commentsPostRef.current===postId
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId === userId
   &&channelScopeRef.current.channelId===channel.id;
  if(openComments===postId){
   commentsPostRef.current=null;
   commentsRequestGuard.invalidate();
   olderCommentsLoadingRef.current=false;
   setOpenComments(null);setComments([]);setCommentsLoading(false);
   setHasOlderComments(false);setOlderCommentsLoading(false);setOlderCommentsError("");
   return;
  }
  commentsPostRef.current=postId;
  olderCommentsLoadingRef.current=false;
  setOpenComments(postId);setComments([]);setCommentsLoading(true);
  setHasOlderComments(false);setOlderCommentsLoading(false);setOlderCommentsError("");
  setError("");
  try{
   const list=await listPostComments(token,postId);
   if(!isCurrent())return;
   setComments(list);setHasOlderComments(list.hasMore);
   const ids=Array.from(new Set(list.map(c=>c.author_id)));
   const people=await listProfiles(token,ids);
   if(!isCurrent())return;
   setAuthors(current=>({...current,...Object.fromEntries(people.map(p=>[p.id,p]))}));
  }catch(e){
   if(isCurrent())setError(readable(e));
  }finally{
   if(isCurrent())setCommentsLoading(false);
  }
 }
 async function loadOlderComments(){
  const postId=commentsPostRef.current;
  if(!postId||!hasOlderComments||commentsLoading||busy||olderCommentsLoadingRef.current||!comments.length)return;
  const oldest=comments[0];
  olderCommentsLoadingRef.current=true;
  const requestId=commentsRequestGuard.begin();
  const isCurrent=()=>commentsRequestGuard.isCurrent(requestId)
   &&commentsPostRef.current===postId
   &&channelScopeRef.current.token===token
   &&channelScopeRef.current.userId === userId
   &&channelScopeRef.current.channelId===channel.id;
  setOlderCommentsLoading(true);setOlderCommentsError("");
  try{
   const page=await listPostCommentsPage(token,postId,oldest);
   if(!isCurrent())return;
   const ids=Array.from(new Set(page.comments.map(comment=>comment.author_id)));
   const people=await listProfiles(token,ids);
   if(!isCurrent())return;
   const merged=prependOlderChannelComments(comments,page.comments);
   if(merged.length===comments.length&&page.hasMore){
    setOlderCommentsError("Не удалось продвинуться к более ранним комментариям. Повтори загрузку.");
    return;
   }
   setComments(current=>prependOlderChannelComments(current,page.comments));
   setHasOlderComments(page.hasMore);
   setAuthors(current=>({...current,...Object.fromEntries(people.map(person=>[person.id,person]))}));
  }catch(e){
   if(isCurrent())setOlderCommentsError(readable(e));
  }finally{
   if(isCurrent()){olderCommentsLoadingRef.current=false;setOlderCommentsLoading(false);}
  }
 }
 async function post(e:FormEvent){
  e.preventDefault();if(!mine||busy||(!body.trim()&&!file))return;
  setBusy(true);setError("");setNotice("");
  let path:string|null=null;
  try{
   const attachment=file?await uploadChannelAttachment(token,userId,file):null;
   path=attachment?.path??null;
   try{await publishPost(token,userId,channel.id,body,null,attachment);}
   catch(e){if(path)await removeUpload(token,path).catch(()=>{});throw e;}
   setBody("");setFile(null);if(await reload())setNotice("Пост опубликован.");
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function writeComment(e:FormEvent){
  e.preventDefault();if(!openComments||!commentDraft.trim()||busy||commentsLoading||olderCommentsLoadingRef.current)return;
  setBusy(true);setError("");
  try{
   await addPostComment(token,openComments,userId,commentDraft);
   setCommentDraft("");
   const list=await listPostComments(token,openComments);
   setComments(list);setHasOlderComments(list.hasMore);setOlderCommentsError("");
   if(currentChannel.discussion_enabled)await loadDiscussion();
   if(!authors[userId]){const mine=await listProfiles(token,[userId]);if(mine[0])setAuthors(prev=>({...prev,[userId]:mine[0]}));}
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function savePostEdit(id:string){
  if(!mine||busy)return;
  const isCurrent=()=>channelScopeRef.current.token===token
   &&channelScopeRef.current.userId === userId
   &&channelScopeRef.current.channelId===channel.id;
  setBusy(true);setError("");
  try{
   cancelOlderPostsLoad();
   await editChannelPost(token,id,editingBody);
   if(!isCurrent())return;
   setPosts(current=>current.map(post=>post.id===id?{...post,body:editingBody}:post));
   setEditingPostId(null);
  }catch(e){if(isCurrent())setError(readable(e));}
  finally{if(isCurrent())setBusy(false);}
 }
 async function saveCommentEdit(id:string){
  if(busy||olderCommentsLoadingRef.current)return;setBusy(true);setError("");
  try{await manageChannelComment(token,id,"edit",editingBody);setEditingCommentId(null);
   setComments(current=>current.map(comment=>comment.id===id?{...comment,body:editingBody}:comment));
   if(currentChannel.discussion_enabled)await loadDiscussion();
  }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function erasePost(p:ChannelPost){
  if(!mine||busy||!window.confirm("Удалить этот пост?"))return;
  const isCurrent=()=>channelScopeRef.current.token===token
   &&channelScopeRef.current.userId === userId
   &&channelScopeRef.current.channelId===channel.id;
  setBusy(true);setError("");
  try{
   cancelOlderPostsLoad();
   await deletePost(token,p.id);
   if(isCurrent()){
    deletedDiscussionPostsRef.current.add(p.id);
    // Cancel only an in-flight older page; its captured scroll anchor is stale after deletion.
    if(discussionOlderLoadingRef.current){
     abortDiscussionRequest();
     setOlderDiscussionLoading(false);
    }
    discussionScrollAnchorRef.current=null;
    setDiscussionItems(current=>removeDiscussionPostComments(current,deletedDiscussionPostsRef.current));
    setPosts(current=>current.filter(post=>post.id!==p.id));
    setReactions(current=>current.filter(reaction=>reaction.post_id!==p.id));
    setNotice("Пост удалён.");
   }
   if(p.image_path)await removeUpload(token,p.image_path).catch(()=>{});
   if(p.attachment_path)await removeUpload(token,p.attachment_path).catch(()=>{});
  }catch(e){if(isCurrent())setError(readable(e));}
  finally{if(isCurrent())setBusy(false);}
 }
 async function eraseComment(c:PostComment){
  if((c.author_id!==userId&&!mine)||busy||olderCommentsLoadingRef.current)return;
  const isCurrent=()=>channelScopeRef.current.token===token
   &&channelScopeRef.current.userId===userId
   &&channelScopeRef.current.channelId===channel.id;
  setBusy(true);
  try{
   await manageChannelComment(token,c.id,"delete");
   if(!isCurrent())return;
   const deletedId=c.id.toLowerCase();
   deletedDiscussionCommentsRef.current.add(deletedId);
   setComments(old=>old.filter(x=>x.id.toLowerCase()!==deletedId));
   // A pending older-page request captured its scroll-height anchor before this
   // deletion. Cancel it so its later prepend cannot restore against stale geometry.
   if(discussionOlderLoadingRef.current){
    abortDiscussionRequest();
    setOlderDiscussionLoading(false);
   }
   discussionScrollAnchorRef.current=null;
   // Tombstones still protect against any response that raced with cancellation.
   setDiscussionItems(current=>removeDiscussionComments(current,deletedDiscussionCommentsRef.current));
   setNotice("Комментарий удалён.");
  }catch(e){if(isCurrent())setError(readable(e));}
  finally{setBusy(false);}
 }
 return <section className="channel-view">
  <header className="channel-topbar"><button type="button" className="profile-back" onClick={onBack} aria-label="Назад">‹ <span>Назад</span></button>
   <div className="channel-top-title"><strong>{currentChannel.title}</strong><small>{subscriberCount===null?"@"+currentChannel.slug:subscriberCount.toLocaleString("ru-RU")+" подписчиков · @"+currentChannel.slug}</small></div>
   <button type="button" className="channel-owner-link" onClick={()=>onShowProfile(channel.owner_id)}>Автор</button></header>
  <div className="channel-feed">
   {mine&&<div className="channel-management" style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
     <button type="button" className="secondary-action" onClick={()=>setSettingsOpen(v=>!v)}>⚙ Настроить канал</button>
     {currentChannel.discussion_enabled&&<button type="button" className="secondary-action" onClick={()=>{setDiscussionOpen(true);void loadDiscussion();}}>Открыть обсуждение</button>}
   </div>}
   {mine&&settingsOpen&&<form className="channel-compose" onSubmit={saveSettings} style={{display:"grid",gap:12,marginBottom:20}}>
    <h2>Настройки канала</h2>
    <label>Название<input required minLength={1} maxLength={80} value={settingsTitle} onChange={e=>setSettingsTitle(e.target.value)}/></label>
    <label>Адрес канала<input required minLength={3} maxLength={32} pattern="[a-z0-9_]{3,32}" value={settingsSlug} onChange={e=>setSettingsSlug(e.target.value.toLowerCase())}/></label>
    <label>Описание<textarea maxLength={500} value={settingsDescription} onChange={e=>setSettingsDescription(e.target.value)}/></label>
    <label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" checked={settingsDiscussion} onChange={e=>setSettingsDiscussion(e.target.checked)}/> Привязать чат обсуждения к каналу</label>
    <button type="submit" className="accent-button" disabled={busy}>Сохранить изменения</button>
    <button type="button" className="secondary-action channel-delete-danger" onClick={()=>void eraseChannel()} disabled={busy}>Удалить канал навсегда</button>
   </form>}
   {currentChannel.discussion_enabled&&<div style={{marginBottom:16}}>
    <button type="button" className="secondary-action" onClick={()=>{if(discussionOpen){abortDiscussionRequest();setDiscussionLoading(false);setOlderDiscussionLoading(false);setDiscussionOpen(false);}else{setDiscussionOpen(true);void loadDiscussion();}}}>{discussionOpen?"Скрыть обсуждение":"💬 Чат обсуждения"}</button>
   </div>}
   {currentChannel.discussion_enabled&&discussionOpen&&<section className="channel-compose" style={{marginBottom:22}}>
    <h2>Обсуждение канала</h2><p style={{fontSize:12,opacity:.7}}>Сообщения участников и комментарии к публикациям отображаются вместе. Ответы к постам также видны под публикациями.</p>
    <div ref={discussionListRef} role="log" aria-label="История обсуждения канала" aria-busy={discussionLoading||olderDiscussionLoading} style={{maxHeight:400,overflowY:"auto",display:"grid",gap:10,padding:"12px 0"}}>
     {(hasOlderDiscussion||olderDiscussionError)&&<button type="button" className="secondary-action" onClick={()=>void loadOlderDiscussion()} disabled={olderDiscussionLoading||discussionLoading}>{olderDiscussionLoading?"Загрузка…":olderDiscussionError?"Повторить загрузку":"Показать более ранние сообщения"}</button>}
     {olderDiscussionError&&<p role="alert">{olderDiscussionError}</p>}
     {discussionError&&<p role="alert">{discussionError} <button type="button" className="secondary-action" onClick={()=>void loadDiscussion()}>Повторить</button></p>}
     {discussionLoading&&discussionItems.length===0&&<p>Загрузка обсуждения…</p>}
     {!discussionLoading&&!discussionError&&!discussionItems.length&&<p>Пока нет сообщений.</p>}
     {discussionItems.map(item=><div key={item.kind+item.id} className="channel-discussion-entry">
      <small>{item.author_id===userId?"Вы":"Участник "+item.author_id.slice(0,6)} · {formattedDate(item.created_at)}</small>
      {item.kind==="comment"&&<small style={{display:"block",opacity:.6}}>Ответ на публикацию: {item.channel_posts?.body?.slice(0,100)||"Медиа-публикация"}</small>}
      <p style={{margin:"6px 0"}}>{item.body}</p>
      {(mine||item.author_id===userId)&&<button type="button" disabled={busy} className="channel-delete-comment" onClick={()=>void (item.kind==="comment"?eraseComment(item):eraseDiscussion(item.id))}>Удалить</button>}
     </div>)}
    </div>
    <form onSubmit={sendDiscussion} style={{display:"flex",gap:8}}><input aria-label="Сообщение в обсуждении" placeholder="Сообщение участникам…" value={discussionDraft} maxLength={1500} onChange={e=>setDiscussionDraft(e.target.value)} style={{flex:1,minWidth:0}}/><button className="accent-button" type="submit" disabled={busy||!discussionDraft.trim()}>Отправить</button></form>
   </section>}

   <div className="channel-cover-card"><div className="channel-emblem">{currentChannel.avatar_path?<img src={imageUrl(currentChannel.avatar_path) ?? undefined} alt="" className="ik-channel-avatar-img"/>:"#"}{mine&&<label className="ik-channel-avatar-edit" title="Изменить аватарку канала"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={e=>{void changeChannelAvatar(e.target.files?.[0]);e.target.value="";}}/><span>{avatarBusy?"…":"✎"}</span></label>}</div><h1>{currentChannel.title}</h1><p>@{currentChannel.slug}</p>{subscriberCount!==null&&<p className="channel-subscribers">{subscriberCount.toLocaleString("ru-RU")} подписчиков</p>}
    {channel.description&&<p className="channel-description">{currentChannel.description}</p>}
    <span>Канал IKONOSFERA</span><div className="channel-cover-actions">
    {!mine&&<button type="button" className="accent-button" onClick={onToggleSubscribe}>{subscribed?"Отписаться":"Подписаться"}</button>}
    {!mine&&<button type="button" className="secondary-action" onClick={onMessageAuthor}>Написать автору</button>}
    </div></div>
   {mine&&<form className="channel-compose" onSubmit={post}>
     <h2>Новая публикация</h2>
     <textarea rows={4} maxLength={4000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Напиши что-нибудь подписчикам…"/>
     <div className="channel-compose-actions"><label className="profile-action">+ Прикрепить файл<input aria-label="Вложение к посту" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/ogg,.pdf,.txt,.zip,.doc,.docx,.xls,.xlsx" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button type="submit" className="accent-button" disabled={busy||(!body.trim()&&!file)}>Опубликовать</button></div>
     {file&&<p className="channel-file-selected">{file.name} <button type="button" onClick={()=>setFile(null)}>Убрать</button></p>}
   </form>}
   <div className="channel-section-heading">Публикации</div>
   {posts.length===0&&<div className="channel-empty">Публикаций пока нет.</div>}
   {posts.map(post=><article className="channel-post" key={post.id}>
    <div className="channel-post-meta"><span className="channel-post-icon">{currentChannel.avatar_path?<img src={imageUrl(currentChannel.avatar_path) ?? undefined} alt="" className="ik-channel-avatar-img"/>:"#"} </span><strong>{currentChannel.title}</strong><time dateTime={post.created_at}>{formattedDate(post.created_at)}</time></div>
    {editingPostId===post.id?<form className="channel-inline-editor" onSubmit={e=>{e.preventDefault();void savePostEdit(post.id);}}><textarea value={editingBody} maxLength={4000} onChange={e=>setEditingBody(e.target.value)}/><button type="submit">Сохранить</button><button type="button" onClick={()=>setEditingPostId(null)}>Отмена</button></form>:post.body&&<p className="channel-post-body">{post.body}</p>}
    {imageUrl(post.image_path)&&<img className="channel-post-image" src={imageUrl(post.image_path)||""} alt="Изображение к публикации"/>}
    {post.attachment_path&&post.attachment_type==="image"&&<img className="channel-post-image" src={imageUrl(post.attachment_path)||""} alt="Фото к посту"/>}
    {post.attachment_path&&post.attachment_type==="video"&&<video className="channel-post-video" src={imageUrl(post.attachment_path)||""} controls playsInline preload="metadata"/>}
    {post.attachment_path&&post.attachment_type==="audio"&&<audio className="channel-post-audio" src={imageUrl(post.attachment_path)||""} controls preload="metadata"/>}
    {post.attachment_path&&post.attachment_type==="file"&&<a className="channel-file-link" href={imageUrl(post.attachment_path)||"#"} target="_blank" rel="noreferrer" download>📎 Скачать вложение</a>}
    <div className="reaction-bar channel-reaction-bar">
     {REACTION_EMOJIS.filter(emoji=>reactions.some(r=>r.post_id===post.id&&r.emoji===emoji)).map(emoji=><button type="button" key={emoji} className={"reaction-pill"+(reactions.some(r=>r.post_id===post.id&&r.user_id===userId&&r.emoji===emoji)?" mine":"")} disabled={busy} onClick={()=>void react(post.id,emoji)}>{emoji} <span>{reactions.filter(r=>r.post_id===post.id&&r.emoji===emoji).length}</span></button>)}
     <button type="button" className="reaction-add" onClick={()=>setReactionPicker(reactionPicker===post.id?null:post.id)} aria-label="Поставить реакцию">☺ +</button>
     {reactionPicker===post.id&&<div className="reaction-picker">{REACTION_EMOJIS.map(emoji=><button key={emoji} type="button" disabled={busy} onClick={()=>void react(post.id,emoji)} aria-label={"Реакция "+emoji}>{emoji}</button>)}</div>}
    </div>
    <div className="channel-post-actions"><button type="button" onClick={()=>void showComments(post.id)}>{openComments===post.id?"Скрыть комментарии":"Комментарии"}</button>
    {mine&&<button type="button" disabled={busy} onClick={()=>{setEditingPostId(post.id);setEditingBody(post.body);}}>Редактировать</button>}{mine&&<button type="button" disabled={busy} onClick={()=>void erasePost(post)}>Удалить пост</button>}</div>
    {openComments===post.id&&<div className="channel-comments">
       {olderCommentsError&&<p role="alert" className="profile-error">{olderCommentsError}</p>}
       {hasOlderComments&&<div className="channel-older-posts"><button type="button" className="secondary-action" disabled={busy||commentsLoading||olderCommentsLoading} onClick={()=>void loadOlderComments()}>{olderCommentsLoading?"Загружаем…":"Показать более ранние комментарии"}</button></div>}
       {commentsLoading?<p className="channel-no-comments">Загружаем комментарии…</p>:comments.length===0?<p className="channel-no-comments">Будь первым, кто оставит комментарий.</p>:
        comments.map(comment=><div className="channel-comment" key={comment.id}><div className="channel-comment-head"><button type="button" onClick={()=>onShowProfile(comment.author_id)}><span className="ik-name-with-status"><span>{authors[comment.author_id]?.display_name||"Пользователь"}</span><StatusEmoji index={authors[comment.author_id]?.status_emoji} decorative/></span></button><time dateTime={comment.created_at}>{formattedDate(comment.created_at)}</time></div>{editingCommentId===comment.id?<form className="channel-inline-editor" onSubmit={e=>{e.preventDefault();void saveCommentEdit(comment.id);}}><input value={editingBody} maxLength={1500} onChange={e=>setEditingBody(e.target.value)}/><button type="submit" disabled={busy||olderCommentsLoading}>Сохранить</button><button type="button" onClick={()=>setEditingCommentId(null)}>Отмена</button></form>:<p>{comment.body}</p>}
        {comment.author_id===userId&&<button className="channel-delete-comment" type="button" disabled={busy||olderCommentsLoading} onClick={()=>{setEditingCommentId(comment.id);setEditingBody(comment.body);}}>Редактировать</button>}{(comment.author_id===userId||mine)&&<button className="channel-delete-comment" disabled={busy||olderCommentsLoading} onClick={()=>void eraseComment(comment)} type="button">Удалить</button>}</div>)}
       <form className="channel-comment-form" onSubmit={writeComment}><input aria-label="Написать комментарий" maxLength={1500} disabled={commentsLoading||olderCommentsLoading} placeholder="Написать комментарий…" value={commentDraft} onChange={e=>setCommentDraft(e.target.value)}/><button type="submit" className="accent-button" disabled={busy||commentsLoading||olderCommentsLoading||!commentDraft.trim()}>➤</button></form>
      </div>}
   </article>)}
   {olderPostsError&&<p role="alert" className="profile-error">{olderPostsError}</p>}
   {hasOlderPosts&&<div className="channel-older-posts"><button type="button" className="secondary-action" disabled={postsReloading||olderPostsLoading||busy} onClick={()=>void loadOlderPosts()}>{olderPostsLoading?"Загружаем…":"Показать более ранние публикации"}</button></div>}
   {(error||notice)&&<p role="status" className={error?"profile-error":"profile-success"}>{error||notice}</p>}
  </div>
 </section>;
}
