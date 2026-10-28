'use client';

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { changeProfile } from "@/lib/supabase-rest";
import {
 addProfilePhoto, addStory, deleteProfilePhoto, deleteStory, getFullProfile, getProfilePhotos,
 getStories, imageUrl, listOwnedChannels, removeUpload, updateFullProfile, uploadPhoto,
 type Channel, type FullProfile, type ProfilePhoto, type Story
} from "@/lib/social";

const readableError=(e:unknown)=>e instanceof Error?e.message:"Что-то пошло не так";
type Props={token:string;userId:string;targetId:string;onBack:()=>void;onOwnProfileChange:()=>void;onMessage:(username:string)=>void;onOpenChannel:(channel:Channel)=>void};

export default function ProfilePanel({token,userId,targetId,onBack,onOwnProfileChange,onMessage,onOpenChannel}:Props){
 const mine=targetId===userId;
 const [profile,setProfile]=useState<FullProfile|null>(null);
 const [photos,setPhotos]=useState<ProfilePhoto[]>([]);
 const [stories,setStories]=useState<Story[]>([]);
 const [ownedChannels,setOwnedChannels]=useState<Channel[]>([]);
 const [featuredChannel,setFeaturedChannel]=useState<Channel|null>(null);
 const [chosenChannelId,setChosenChannelId]=useState<string>("");
 const [name,setName]=useState("");const [username,setUsername]=useState("");const [bio,setBio]=useState("");
 const [editing,setEditing]=useState(false);const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const [viewer,setViewer]=useState<{url:string;caption:string}|null>(null);
 const [storyIndex,setStoryIndex]=useState<number|null>(null);
 const activeStory=storyIndex===null?null:stories[storyIndex]??null;
 const reload=useCallback(async()=>{
  const [p,gallery,active,owned]=await Promise.all([
   getFullProfile(token,targetId),getProfilePhotos(token,targetId),getStories(token,targetId),listOwnedChannels(token,targetId)
  ]);
  setProfile(p);setPhotos(gallery);setStories(active);setOwnedChannels(owned);
  setFeaturedChannel(owned.find(ch=>ch.id===p?.featured_channel_id)??null);
  setChosenChannelId(p?.featured_channel_id??"");
  setName(p?.display_name||"");setUsername(p?.username||"");setBio(p?.bio||"");
 },[token,targetId]);
 useEffect(()=>{let mounted=true;void reload().catch(e=>{if(mounted)setError(readableError(e));});return()=>{mounted=false;};},[reload]);
 const run=async(action:()=>Promise<void>)=>{
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{await action();await reload();}
  catch(e){setError(readableError(e));}
  finally{setBusy(false);}
 };
 async function chooseImage(file:File|undefined,kind:"avatar"|"cover"|"photo"|"story"){
  if(!file||!mine||!profile)return;
  await run(async()=>{
   const path=await uploadPhoto(token,userId,file);
   try{
    if(kind==="avatar"||kind==="cover"){
      await updateFullProfile(token,userId,kind==="avatar"?{avatar_path:path}:{cover_path:path});
      onOwnProfileChange();
    }else if(kind==="photo")await addProfilePhoto(token,userId,path,"");
    else await addStory(token,userId,path,"");
    setNotice(kind==="story"?"История опубликована на 24 часа.":"Изображение сохранено.");
   }catch(e){await removeUpload(token,path).catch(()=>{});throw e;}
  });
 }
 async function save(e:FormEvent){
  e.preventDefault();if(!profile||!mine)return;
  await run(async()=>{
   await changeProfile(token,userId,username.trim().toLowerCase().replace(/^@/,""),name.trim());
   await updateFullProfile(token,userId,{bio:bio.trim(),featured_channel_id:chosenChannelId||null});
   onOwnProfileChange();setEditing(false);setNotice("Профиль обновлён.");
  });
 }
 async function clearImage(kind:"avatar"|"cover"){
  if(!profile||!mine)return;
  const path=kind==="avatar"?profile.avatar_path:profile.cover_path;
  await run(async()=>{
   await updateFullProfile(token,userId,kind==="avatar"?{avatar_path:null}:{cover_path:null});
   if(path)await removeUpload(token,path).catch(()=>{});
   onOwnProfileChange();setNotice("Изображение удалено.");
  });
 }
 useEffect(()=>{
  if(storyIndex===null||!activeStory)return;
  const timer=window.setTimeout(()=>setStoryIndex(index=>index===null?null:index+1>=stories.length?null:index+1),6000);
  return()=>window.clearTimeout(timer);
 },[storyIndex,activeStory?.id,stories.length]);
 useEffect(()=>{
  if(storyIndex===null)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setStoryIndex(null);
   if(event.key==='ArrowRight')setStoryIndex(i=>i===null?null:i+1>=stories.length?null:i+1);
   if(event.key==='ArrowLeft')setStoryIndex(i=>i===null?null:Math.max(0,i-1));};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[storyIndex,stories.length]);
 const avatar=profile?imageUrl(profile.avatar_path):null;
 const cover=profile?imageUrl(profile.cover_path):null;
 return <section className="profile-view" aria-label="Профиль пользователя">
   <header className="profile-topbar"><button type="button" className="profile-back" onClick={onBack} aria-label="Назад">‹ <span>Назад</span></button>
     <strong>Профиль</strong>{mine?<button type="button" className="profile-link" onClick={()=>setEditing(v=>!v)}>{editing?"Готово":"Изм."}</button>:<span/>}</header>
   <div className="profile-scroll">
    <div className="profile-hero">
     <div className="profile-cover" style={cover?{backgroundImage:"url("+cover+")"}:undefined}>
       {mine&&<label className="profile-cover-action">Изменить обложку<input aria-label="Выбрать обложку" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"cover");e.target.value="";}}/></label>}
     </div>
     <div className={"profile-avatar-large"+(stories.length?" profile-avatar-has-story":"")} onClick={()=>{if(stories.length)setStoryIndex(0);}} role={stories.length?"button":undefined} tabIndex={stories.length?0:undefined} onKeyDown={e=>{if(stories.length&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setStoryIndex(0);}}} aria-label={stories.length?"Посмотреть истории":undefined}>{avatar?<img src={avatar} alt="Аватар пользователя"/>:<span>{(profile?.display_name||"?").charAt(0).toUpperCase()}</span>}
      {mine&&<label className="profile-avatar-camera" title="Изменить фото"><span aria-hidden="true">▣</span><input aria-label="Загрузить фото профиля" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"avatar");e.target.value="";}}/></label>}
     </div>
     {profile?<div className="profile-identity"><h1>{profile.display_name}</h1><p>@{profile.username}</p>
        {profile.bio&&<div className="profile-bio">{profile.bio}</div>}
        {!mine&&<button type="button" className="accent-button profile-message-button" onClick={()=>onMessage(profile.username)}>Написать сообщение</button>}</div>:<p>Загрузка профиля…</p>}
    </div>
    {mine&&editing&&<form className="profile-editor" onSubmit={save}>
     <h2>Изменить профиль</h2>
     <label>Имя<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} required/></label>
     <label>Юзернейм<input value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" required/></label>
     <label>О себе<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3} placeholder="Расскажи немного о себе"/></label>
     <label>Канал в профиле
       <select value={chosenChannelId} onChange={e=>setChosenChannelId(e.target.value)}>
         <option value="">Не показывать канал</option>
         {ownedChannels.map(ch=><option key={ch.id} value={ch.id}>{ch.title} (@{ch.slug})</option>)}
       </select>
       <small>Можно закрепить один из каналов, которые ты создал. Его увидят посетители профиля.</small>
     </label>
     <button className="accent-button" disabled={busy} type="submit">{busy?"Сохраняем…":"Сохранить изменения"}</button>
     <div className="profile-delete-actions">{profile?.avatar_path&&<button type="button" onClick={()=>void clearImage("avatar")} disabled={busy}>Удалить аватар</button>}{profile?.cover_path&&<button type="button" onClick={()=>void clearImage("cover")} disabled={busy}>Удалить обложку</button>}</div>
    </form>}
    {(featuredChannel||mine)&&<div className="profile-content-section profile-featured-section">
      <div className="profile-section-title"><div><h2>Мой канал</h2><p>Закреплён в профиле</p></div>
       {mine&&!editing&&<button type="button" className="profile-action" onClick={()=>setEditing(true)}>Изменить</button>}</div>
      {featuredChannel?<button type="button" className="profile-featured-channel" onClick={()=>onOpenChannel(featuredChannel)}>
        <span className="profile-featured-icon">#</span><span className="profile-featured-details"><strong>{featuredChannel.title}</strong><small>@{featuredChannel.slug}</small>
        {featuredChannel.description&&<span>{featuredChannel.description}</span>}</span><span className="profile-featured-arrow">›</span>
      </button>:<p className="profile-empty">Здесь можно закрепить свой канал. Открой «Изм.» и выбери канал в настройках профиля.</p>}
    </div>}
    <div className="profile-content-section">
     <div className="profile-section-title"><div><h2>Истории</h2><p>Доступны 24 часа</p></div>
       {mine&&<label className="profile-action">+ История<input type="file" aria-label="Добавить историю" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"story");e.target.value="";}}/></label>}</div>
     {stories.length?<div className="profile-stories">{stories.map(st=><div className="profile-story" key={st.id}>
      <button type="button" className="profile-story-thumb" onClick={()=>setStoryIndex(stories.findIndex(item=>item.id===st.id))}><img src={imageUrl(st.image_path)||""} alt="История пользователя"/></button>
      <small>{new Date(st.expires_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small>
      {mine&&<button disabled={busy} className="profile-small-delete" type="button" onClick={()=>void run(async()=>{await deleteStory(token,st.id);await removeUpload(token,st.image_path).catch(()=>{});})}>Удалить</button>}
     </div>)}</div>:<p className="profile-empty">Пока нет активных историй.</p>}
    </div>
    <div className="profile-content-section">
     <div className="profile-section-title"><div><h2>Фото профиля</h2><p>Твоя галерея</p></div>
       {mine&&<label className="profile-action">+ Фото<input aria-label="Выложить фото в профиль" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"photo");e.target.value="";}}/></label>}</div>
     {photos.length?<div className="profile-photo-grid">{photos.map(photo=><div className="profile-grid-cell" key={photo.id}>
      <button type="button" onClick={()=>{const url=imageUrl(photo.image_path);if(url)setViewer({url,caption:photo.caption});}}><img src={imageUrl(photo.image_path)||""} alt="Фото в профиле"/></button>
      {mine&&<button type="button" className="profile-grid-delete" disabled={busy} title="Удалить фото" onClick={()=>void run(async()=>{await deleteProfilePhoto(token,photo.id);await removeUpload(token,photo.image_path).catch(()=>{});})}>×</button>}
     </div>)}</div>:<p className="profile-empty">В галерее пока нет фотографий.</p>}
    </div>
    <p className="profile-privacy">Фото и истории доступны другим зарегистрированным пользователям. Не публикуй личные документы.</p>
    {(error||notice)&&<p role="status" className={error?"profile-error":"profile-success"}>{error||notice}</p>}
   </div>
   {activeStory&&<div className="story-viewer" role="dialog" aria-modal="true" aria-label="Просмотр историй">
    <div className="story-viewer-stage" key={activeStory.id}>
     <div className="story-progress">{stories.map((st,i)=><span key={st.id} className="story-progress-track"><span className={i<storyIndex!?"done":i===storyIndex?"playing":""}/></span>)}</div>
     <header className="story-viewer-header"><span className="story-viewer-avatar">{avatar?<img src={avatar} alt=""/>:(profile?.display_name||"?").charAt(0)}</span>
      <span className="story-viewer-author"><strong>{profile?.display_name}</strong><small>{new Date(activeStory.created_at).toLocaleString("ru-RU",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})}</small></span>
      <button type="button" className="story-viewer-close" onClick={()=>setStoryIndex(null)} aria-label="Закрыть историю">×</button>
     </header>
     <img className="story-viewer-image" src={imageUrl(activeStory.image_path)||""} alt={activeStory.caption||"История"}/>
     <button type="button" className="story-viewer-prev" onClick={()=>setStoryIndex(i=>i===null?null:Math.max(0,i-1))} aria-label="Предыдущая история"/>
     <button type="button" className="story-viewer-next" onClick={()=>setStoryIndex(i=>i===null?null:i+1>=stories.length?null:i+1)} aria-label="Следующая история"/>
     {activeStory.caption&&<div className="story-viewer-caption">{activeStory.caption}</div>}
    </div>
   </div>}
   {viewer&&<div className="profile-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр фото"><button className="profile-lightbox-close" type="button" onClick={()=>setViewer(null)}>Закрыть ×</button><img src={viewer.url} alt={viewer.caption||"Фото пользователя"}/>{viewer.caption&&<p>{viewer.caption}</p>}</div>}
 </section>;
}
