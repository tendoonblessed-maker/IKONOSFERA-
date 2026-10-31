/* IKONOSFERA social API. All writes use the signed-in user's JWT and Supabase RLS. */
import { apiUrl } from "@/lib/supabase-rest";
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export type FullProfile = { id:string; username:string; display_name:string; avatar_path:string|null; cover_path:string|null; bio:string; featured_channel_id:string|null; status_emoji:number|null; age_years:number|null };
export type ProfilePhoto = { id:string; user_id:string; image_path:string; caption:string; created_at:string };
export type Story = { id:string; user_id:string; image_path:string; caption:string; created_at:string; expires_at:string };
export type Channel = { id:string; owner_id:string; title:string; slug:string; description:string; discussion_enabled:boolean; avatar_path?:string|null; created_at:string };
export type ChannelPost = { id:string; channel_id:string; author_id:string; body:string; image_path:string|null; attachment_path?:string|null; attachment_type?:"image"|"video"|"audio"|"file"|null; created_at:string };
export type PostComment = { id:string; post_id:string; author_id:string; body:string; created_at:string };

function requestHeaders(token:string, extras:Record<string,string>={}) {
  return { apikey:publicKey, Authorization:"Bearer "+token, "Content-Type":"application/json", ...extras };
}
async function api<T>(path:string,token:string,method="GET",body?:unknown,timeoutMs=0) : Promise<T> {
  const res=await fetch(apiUrl+path,{method,headers:requestHeaders(token,method==="POST"||method==="PATCH"||method==="DELETE"?{Prefer:"return=representation"}:{}),
    body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",
    signal:timeoutMs>0?AbortSignal.timeout(timeoutMs):undefined});
  const value=await res.json().catch(()=>null);
  if(!res.ok)throw Error(value?.message||value?.error||value?.msg||"Ошибка сервера ("+res.status+")");
  return value as T;
}
export function imageUrl(path:string|null|undefined):string|null {
  if(!path||!apiUrl||!/^[a-z0-9-]+\/[a-z0-9.-]+\.(jpg|png|webp)$/i.test(path))return null;
  return apiUrl+"/storage/v1/object/public/ikonosfera-media/"+path.split("/").map(encodeURIComponent).join("/");
}
export async function uploadPhoto(token:string,userId:string,file:File):Promise<string>{
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("Поддерживаются JPG, PNG и WebP.");
  if(file.size>3*1024*1024)throw Error("Фото должно быть меньше 3 МБ.");
  if(file.size===0)throw Error("Файл пустой.");
  const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
  const path=userId+"/"+crypto.randomUUID()+"."+ext;
  const res=await fetch(apiUrl+"/storage/v1/object/ikonosfera-media/"+path,{
    method:"POST",headers:{apikey:publicKey,Authorization:"Bearer "+token,"Content-Type":file.type,
      "Cache-Control":"max-age=31536000","x-upsert":"false"},body:file});
  if(!res.ok){const value=await res.json().catch(()=>null);throw Error(value?.message||value?.error||"Ошибка загрузки фотографии");}
  return path;
}
export async function removeUpload(token:string,path:string):Promise<void>{
  if(!imageUrl(path))return;
  const res=await fetch(apiUrl+"/storage/v1/object/ikonosfera-media/"+path,{method:"DELETE",
    headers:{apikey:publicKey,Authorization:"Bearer "+token}});
  if(!res.ok&&res.status!==404){const obj=await res.json().catch(()=>null);throw Error(obj?.message||"Не удалось удалить файл");}
}
export async function getFullProfile(token:string,userId:string):Promise<FullProfile|null>{
  const rows=await api<FullProfile[]>("/rest/v1/profiles?select=id,username,display_name,bio,avatar_path,cover_path,featured_channel_id,status_emoji,age_years&id=eq."+encodeURIComponent(userId)+"&limit=1",token);
  return rows[0]??null;
}
export async function updateFullProfile(token:string,userId:string,fields:Partial<Pick<FullProfile,"avatar_path"|"cover_path"|"bio"|"featured_channel_id"|"status_emoji"|"age_years">>):Promise<FullProfile>{
  const rows=await api<FullProfile[]>("/rest/v1/profiles?select=id,username,display_name,bio,avatar_path,cover_path,featured_channel_id,status_emoji,age_years&id=eq."+encodeURIComponent(userId),token,"PATCH",fields);
  if(!rows[0])throw Error("Профиль не найден");return rows[0];
}
export async function getProfilePhotos(token:string,userId:string):Promise<ProfilePhoto[]>{
  return api<ProfilePhoto[]>("/rest/v1/profile_photos?select=id,user_id,image_path,caption,created_at&user_id=eq."+encodeURIComponent(userId)+"&order=created_at.desc&limit=60",token);
}
export async function addProfilePhoto(token:string,userId:string,image_path:string,caption:string):Promise<ProfilePhoto>{
  const rows=await api<ProfilePhoto[]>("/rest/v1/profile_photos?select=*&limit=1",token,"POST",{user_id:userId,image_path,caption:caption.slice(0,240)});
  if(!rows[0])throw Error("Фото не опубликовано");return rows[0];
}
export async function deleteProfilePhoto(token:string,id:string):Promise<void>{
  await api("/rest/v1/profile_photos?id=eq."+encodeURIComponent(id),token,"DELETE");
}
export async function getStories(token:string,userId:string):Promise<Story[]>{
  return api<Story[]>("/rest/v1/stories?select=*&user_id=eq."+encodeURIComponent(userId)+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=created_at.desc&limit=40",token);
}
export async function getContactsStories(token:string,userIds:string[]):Promise<Story[]>{
 if(!userIds.length)return [];
 const ids=Array.from(new Set(userIds)).filter(id=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,100);
 if(!ids.length)return [];
 return api<Story[]>("/rest/v1/stories?select=*&user_id=in.("+ids.map(encodeURIComponent).join(",")+")&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=created_at.desc&limit=200",token);
}
export async function addStory(token:string,userId:string,image_path:string,caption:string):Promise<Story>{
  const rows=await api<Story[]>("/rest/v1/stories?select=*",token,"POST",{user_id:userId,image_path,caption:caption.slice(0,240)});
  if(!rows[0])throw Error("История не опубликована");return rows[0];
}
export async function deleteStory(token:string,id:string):Promise<void>{
  await api("/rest/v1/stories?id=eq."+encodeURIComponent(id),token,"DELETE");
}
export async function getChannelSubscriberCounts(token:string,ids:string[]):Promise<Record<string,number>>{
 const unique=Array.from(new Set(ids)).filter(id=>/^[0-9a-f-]{36}$/i.test(id)).slice(0,100);
 if(!unique.length)return {};
 const counts=await api<{channel_id:string;subscribers:number}[]>('/rest/v1/rpc/channel_subscriber_counts',token,'POST',{p_ids:unique});
 return Object.fromEntries(counts.map(row=>[row.channel_id,Number(row.subscribers)]));
}
export async function listChannels(token:string):Promise<Channel[]>{
  return api<Channel[]>("/rest/v1/channels?select=*&order=created_at.desc&limit=100",token);
}
/** Fetch one selected channel even if it is outside the first page of discovery. */
export async function getChannelById(token:string,channelId:string):Promise<Channel|null>{
 if(!/^[a-f0-9-]{36}$/i.test(channelId))return null;
 const channels=await api<Channel[]>("/rest/v1/channels?select=*&id=eq."+encodeURIComponent(channelId)+"&limit=1",token);
 return channels[0]??null;
}
export async function createChannel(token:string,owner_id:string,title:string,slug:string,description:string):Promise<Channel>{
  const rows=await api<Channel[]>("/rest/v1/channels?select=*",token,"POST",{owner_id,title:title.trim(),slug:slug.trim().toLowerCase(),description:description.trim()});
  if(!rows[0])throw Error("Канал не создан");return rows[0];
}
export async function updateChannel(token:string,channelId:string,ownerId:string,title:string,slug:string,description:string,discussionEnabled:boolean):Promise<Channel>{
 const safeSlug=slug.trim().toLowerCase();
 if(!title.trim()||title.trim().length>80||!/^[a-z0-9_]{3,32}$/.test(safeSlug)||description.length>500)throw Error("Проверь название, адрес и описание канала.");
 const rows=await api<Channel[]>("/rest/v1/channels?id=eq."+encodeURIComponent(channelId)+"&owner_id=eq."+encodeURIComponent(ownerId)+"&select=*",token,"PATCH",{title:title.trim(),slug:safeSlug,description:description.trim(),discussion_enabled:discussionEnabled});
 if(!rows[0])throw Error("Не удалось изменить канал. Проверь права владельца.");
 return rows[0];
}
export async function updateChannelAvatar(token:string,channelId:string,ownerId:string,avatarPath:string|null):Promise<Channel>{
 const rows=await api<Channel[]>("/rest/v1/channels?id=eq."+encodeURIComponent(channelId)+"&owner_id=eq."+encodeURIComponent(ownerId)+"&select=*",token,"PATCH",{avatar_path:avatarPath});
 if(!rows[0])throw Error("Не удалось изменить аватарку канала. Проверь права владельца.");
 return rows[0];
}
export async function deleteChannel(token:string,channelId:string,ownerId:string):Promise<void>{
 const rows=await api<Channel[]>("/rest/v1/channels?id=eq."+encodeURIComponent(channelId)+"&owner_id=eq."+encodeURIComponent(ownerId)+"&select=id",token,"DELETE");
 if(!rows.length)throw Error("Не удалось удалить канал. Проверь права владельца.");
}
export type DiscussionMessage={id:string;channel_id:string;author_id:string;body:string;created_at:string};
export async function listDiscussionMessages(token:string,channelId:string):Promise<DiscussionMessage[]>{
 return api<DiscussionMessage[]>("/rest/v1/channel_discussion_messages?select=*&channel_id=eq."+encodeURIComponent(channelId)+"&order=created_at.asc&limit=300",token);
}
export async function sendDiscussionMessage(token:string,channelId:string,userId:string,body:string):Promise<void>{
 if(!body.trim()||body.length>1500)throw Error("Сообщение должно быть до 1500 символов.");
 await api("/rest/v1/channel_discussion_messages",token,"POST",{channel_id:channelId,author_id:userId,body:body.trim()});
}
export async function deleteDiscussionMessage(token:string,id:string):Promise<void>{
 const rows=await api<DiscussionMessage[]>("/rest/v1/channel_discussion_messages?id=eq."+encodeURIComponent(id)+"&select=*",token,"DELETE");
 if(!rows.length)throw Error("Сообщение не удалено.");
}
export async function listDiscussionComments(token:string,channelId:string):Promise<(PostComment & {channel_posts:{body:string;channel_id:string}|null})[]>{
 return api<(PostComment & {channel_posts:{body:string;channel_id:string}|null})[]>("/rest/v1/channel_comments?select=id,post_id,author_id,body,created_at,channel_posts!inner(body,channel_id)&channel_posts.channel_id=eq."+encodeURIComponent(channelId)+"&order=created_at.asc&limit=300",token);
}
export async function listChannelPosts(token:string,channelId:string):Promise<ChannelPost[]>{
  return api<ChannelPost[]>("/rest/v1/channel_posts?select=*&channel_id=eq."+encodeURIComponent(channelId)+"&order=created_at.desc&limit=100",token);
}
export async function publishPost(token:string,author_id:string,channel_id:string,body:string,image_path:string|null,attachment?:{path:string;type:"image"|"video"|"audio"|"file"}|null):Promise<ChannelPost>{
  const rows=await api<ChannelPost[]>("/rest/v1/channel_posts?select=*",token,"POST",{author_id,channel_id,body:body.trim(),image_path,attachment_path:attachment?.path??null,attachment_type:attachment?.type??null},18000);
  if(!rows[0])throw Error("Пост не опубликован");return rows[0];
}

type ChannelPostAttempt={
 authorId:string;channelId:string;body:string;
 attachment:{path:string;type:"image"|"video"|"audio"|"file"};
 insertAttempted:boolean;
};
/** A File stays identical while a failed post is still in the same preview.
 * This state intentionally never stores JWTs, bytes or a persistent browser key.
 */
const channelPostAttempts=new WeakMap<File,ChannelPostAttempt>();
function matchesChannelPost(row:ChannelPost,attempt:ChannelPostAttempt):boolean{
 return Boolean(row?.id&&row.channel_id===attempt.channelId
   &&row.author_id===attempt.authorId&&row.body===attempt.body
   &&row.image_path===null&&row.attachment_path===attempt.attachment.path
   &&row.attachment_type===attempt.attachment.type);
}
/** Read back by the unpredictable exact Storage object path; public channel
 * rows are still queried with the caller JWT and normal PostgREST RLS.
 */
async function confirmChannelPost(token:string,attempt:ChannelPostAttempt):Promise<ChannelPost|null>{
 const rows=await api<ChannelPost[]>(
  "/rest/v1/channel_posts?select=id,channel_id,author_id,body,image_path,attachment_path,attachment_type,created_at"
  +"&channel_id=eq."+encodeURIComponent(attempt.channelId)
  +"&author_id=eq."+encodeURIComponent(attempt.authorId)
  +"&attachment_path=eq."+encodeURIComponent(attempt.attachment.path)
  +"&limit=3",token,"GET",undefined,18000);
 const verified=rows.filter(row=>matchesChannelPost(row,attempt));
 // Without a DB uniqueness constraint, multiple rows using one object cannot
 // safely be treated as one successful write.
 if(verified.length>1)throw Error("В канале найдено несколько публикаций с этим вложением. Проверь список перед повтором.");
 if(verified.length===1)return verified[0];
 if(rows.length>0)throw Error("Сервер сохранил вложение с другими данными. Проверь канал перед повтором.");
 return null;
}
/**
 * Upload once, insert at most once for the same file+caption+channel+author.
 * A dropped DB response is reconciled through a read-only exact-path lookup.
 * Never delete a possibly referenced public object. No SQL migration needed.
 */
export async function publishChannelPostSafely(
 token:string,authorId:string,channelId:string,body:string,file:File|null
):Promise<ChannelPost>{
 const text=body.trim();
 if(!text)throw Error("Добавь текст к публикации: сервер пока не поддерживает пост только с вложением.");
 if(!file)return publishPost(token,authorId,channelId,text,null,null);
 let attempt=channelPostAttempts.get(file);
 if(!attempt||attempt.authorId!==authorId||attempt.channelId!==channelId||attempt.body!==text){
   const attachment=await uploadChannelAttachment(token,authorId,file);
   attempt={authorId,channelId,body:text,attachment,insertAttempted:false};
   channelPostAttempts.set(file,attempt);
 }
 const finish=(post:ChannelPost):ChannelPost=>{
   if(!matchesChannelPost(post,attempt))throw Error("Сервер вернул другую публикацию. Проверь канал перед повтором.");
   if(channelPostAttempts.get(file)===attempt)channelPostAttempts.delete(file);
   return post;
 };
 if(attempt.insertAttempted){
   // A previous POST may have committed. Another INSERT with no uniqueness
   // key could create a duplicate; a manual retry therefore only checks.
   const previous=await confirmChannelPost(token,attempt);
   if(previous)return finish(previous);
   throw Error("Не удалось подтвердить предыдущую публикацию. Обнови канал перед повтором, чтобы не создать дубликат.");
 }
 attempt.insertAttempted=true;
 let failure:unknown=null;
 try{
   return finish(await publishPost(token,authorId,channelId,text,null,attempt.attachment));
 }catch(error){failure=error;}
 try{
   const verified=await confirmChannelPost(token,attempt);
   if(verified)return finish(verified);
 }catch(error){
   // A mismatching canonical row is a hard stop; network/permissions failures
   // keep the original send error and the in-memory attempt for manual check.
   if(error instanceof Error&&/несколько публикаций|с другими данными/.test(error.message))throw error;
 }
 const detail=failure instanceof Error?failure.message:"Не удалось получить подтверждение сервера.";
 throw Error("Публикация не подтверждена ("+detail+"). Вложение сохранено; повторная отправка автоматически не выполнялась.");
}
export async function deletePost(token:string,id:string):Promise<void>{await api("/rest/v1/channel_posts?id=eq."+encodeURIComponent(id),token,"DELETE");}
export async function listPostComments(token:string,postId:string):Promise<PostComment[]>{
  return api<PostComment[]>("/rest/v1/channel_comments?select=*&post_id=eq."+encodeURIComponent(postId)+"&order=created_at.asc&limit=150",token);
}
export async function addPostComment(token:string,post_id:string,author_id:string,body:string):Promise<PostComment>{
  const rows=await api<PostComment[]>("/rest/v1/channel_comments?select=*",token,"POST",{post_id,author_id,body:body.trim()});
  if(!rows[0])throw Error("Комментарий не опубликован");return rows[0];
}
export async function removeComment(token:string,id:string):Promise<void>{await api("/rest/v1/channel_comments?id=eq."+encodeURIComponent(id),token,"DELETE");}

export type ChannelSubscription={channel_id:string;user_id:string;created_at:string};
export async function listMySubscriptions(token:string,userId:string):Promise<ChannelSubscription[]>{
 return api<ChannelSubscription[]>("/rest/v1/channel_subscriptions?select=channel_id,user_id,created_at&user_id=eq."+encodeURIComponent(userId)+"&limit=1000",token);
}
export async function subscribeChannel(token:string,userId:string,channelId:string):Promise<void>{
 await api("/rest/v1/channel_subscriptions?on_conflict=channel_id,user_id",token,"POST",{channel_id:channelId,user_id:userId});
}
export async function unsubscribeChannel(token:string,userId:string,channelId:string):Promise<void>{
 await api("/rest/v1/channel_subscriptions?channel_id=eq."+encodeURIComponent(channelId)+"&user_id=eq."+encodeURIComponent(userId),token,"DELETE");
}

/** Channels created by this user; used in profile's featured-channel picker. */
export async function listOwnedChannels(token:string,ownerId:string):Promise<Channel[]>{
 return api<Channel[]>("/rest/v1/channels?select=*&owner_id=eq."+encodeURIComponent(ownerId)+"&order=created_at.desc&limit=100",token);
}

export const REACTION_EMOJIS=['👍🏻','👎🏻','✌🏻','👌🏻','🖕🏻','🫶🏻','🕊️'] as const;
export type ReactionEmoji=typeof REACTION_EMOJIS[number];
export type PostReaction={post_id:string;user_id:string;emoji:ReactionEmoji};
export async function listPostReactions(token:string,postIds:string[]):Promise<PostReaction[]>{
 if(!postIds.length)return [];
 return api<PostReaction[]>("/rest/v1/channel_post_reactions?select=post_id,user_id,emoji&post_id=in.("+postIds.map(encodeURIComponent).join(",")+")&limit=3000",token);
}
export async function setPostReaction(token:string,userId:string,postId:string,emoji:ReactionEmoji|null):Promise<void>{
 await api("/rest/v1/channel_post_reactions?post_id=eq."+encodeURIComponent(postId)+"&user_id=eq."+encodeURIComponent(userId),token,"DELETE");
 if(emoji)await api("/rest/v1/channel_post_reactions",token,"POST",{post_id:postId,user_id:userId,emoji});
}

export async function editChannelPost(token:string,postId:string,body:string):Promise<void>{
 await api('/rest/v1/rpc/edit_channel_post',token,'POST',{p_post_id:postId,p_body:body});
}
export async function manageChannelComment(token:string,commentId:string,action:"edit"|"delete",body?:string):Promise<void>{
 await api('/rest/v1/rpc/manage_channel_comment',token,'POST',{p_comment_id:commentId,p_action:action,p_body:body??null});
}

export async function uploadChannelAttachment(token:string,userId:string,file:File):Promise<{path:string;type:"image"|"video"|"audio"|"file"}>{
 const allowed:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4","video/webm":"webm","video/quicktime":"mov","audio/mpeg":"mp3","audio/mp4":"m4a","audio/wav":"wav","audio/ogg":"ogg","application/pdf":"pdf","text/plain":"txt","application/zip":"zip","application/msword":"doc","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx","application/vnd.ms-excel":"xls","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx"};
 const ext=allowed[file.type];
 if(!ext)throw Error("Неподдерживаемый формат вложения.");
 if(file.size===0||file.size>25*1024*1024)throw Error("Максимальный размер вложения — 25 МБ.");
 const path=userId+"/"+crypto.randomUUID()+"."+ext;
 const res=await fetch(apiUrl+"/storage/v1/object/ikonosfera-media/"+path,{method:"POST",headers:{apikey:publicKey,Authorization:"Bearer "+token,"Content-Type":file.type,"x-upsert":"false"},body:file});
 if(!res.ok)throw Error("Не удалось загрузить вложение.");
 return {path,type:file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":file.type.startsWith("audio/")?"audio":"file"};
}
