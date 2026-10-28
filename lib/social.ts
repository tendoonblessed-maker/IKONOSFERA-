/* IKONOSFERA social API. All writes use the signed-in user's JWT and Supabase RLS. */
import { apiUrl } from "@/lib/supabase-rest";
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export type FullProfile = { id:string; username:string; display_name:string; avatar_path:string|null; cover_path:string|null; bio:string };
export type ProfilePhoto = { id:string; user_id:string; image_path:string; caption:string; created_at:string };
export type Story = { id:string; user_id:string; image_path:string; caption:string; created_at:string; expires_at:string };
export type Channel = { id:string; owner_id:string; title:string; slug:string; description:string; created_at:string };
export type ChannelPost = { id:string; channel_id:string; author_id:string; body:string; image_path:string|null; created_at:string };
export type PostComment = { id:string; post_id:string; author_id:string; body:string; created_at:string };

function requestHeaders(token:string, extras:Record<string,string>={}) {
  return { apikey:publicKey, Authorization:"Bearer "+token, "Content-Type":"application/json", ...extras };
}
async function api<T>(path:string,token:string,method="GET",body?:unknown) : Promise<T> {
  const res=await fetch(apiUrl+path,{method,headers:requestHeaders(token,method==="POST"||method==="PATCH"?{Prefer:"return=representation"}:{}),
    body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
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
      "Cache-Control":"max-age=3600","x-upsert":"false"},body:file});
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
  const rows=await api<FullProfile[]>("/rest/v1/profiles?select=id,username,display_name,bio,avatar_path,cover_path&id=eq."+encodeURIComponent(userId)+"&limit=1",token);
  return rows[0]??null;
}
export async function updateFullProfile(token:string,userId:string,fields:Partial<Pick<FullProfile,"avatar_path"|"cover_path"|"bio">>):Promise<FullProfile>{
  const rows=await api<FullProfile[]>("/rest/v1/profiles?select=id,username,display_name,bio,avatar_path,cover_path&id=eq."+encodeURIComponent(userId),token,"PATCH",fields);
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
export async function addStory(token:string,userId:string,image_path:string,caption:string):Promise<Story>{
  const rows=await api<Story[]>("/rest/v1/stories?select=*",token,"POST",{user_id:userId,image_path,caption:caption.slice(0,240)});
  if(!rows[0])throw Error("История не опубликована");return rows[0];
}
export async function deleteStory(token:string,id:string):Promise<void>{
  await api("/rest/v1/stories?id=eq."+encodeURIComponent(id),token,"DELETE");
}
export async function listChannels(token:string):Promise<Channel[]>{
  return api<Channel[]>("/rest/v1/channels?select=*&order=created_at.desc&limit=100",token);
}
export async function createChannel(token:string,owner_id:string,title:string,slug:string,description:string):Promise<Channel>{
  const rows=await api<Channel[]>("/rest/v1/channels?select=*",token,"POST",{owner_id,title:title.trim(),slug:slug.trim().toLowerCase(),description:description.trim()});
  if(!rows[0])throw Error("Канал не создан");return rows[0];
}
export async function listChannelPosts(token:string,channelId:string):Promise<ChannelPost[]>{
  return api<ChannelPost[]>("/rest/v1/channel_posts?select=*&channel_id=eq."+encodeURIComponent(channelId)+"&order=created_at.desc&limit=100",token);
}
export async function publishPost(token:string,author_id:string,channel_id:string,body:string,image_path:string|null):Promise<ChannelPost>{
  const rows=await api<ChannelPost[]>("/rest/v1/channel_posts?select=*",token,"POST",{author_id,channel_id,body:body.trim(),image_path});
  if(!rows[0])throw Error("Пост не опубликован");return rows[0];
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
