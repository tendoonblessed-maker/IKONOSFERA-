'use client';

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { changeProfile, explainProfileError, validateUsername } from "@/lib/supabase-rest";
import {getUserActivities,activityLabel,type UserActivity} from "@/lib/activity";
import {useStoryProgress} from "@/lib/use-story-progress";
import StatusEmoji from "@/components/StatusEmoji";
import StatusEmojiPicker from "@/components/StatusEmojiPicker";
import {
 addProfilePhoto, addStory, deleteProfilePhoto, deleteStory, getFullProfile, getProfilePhotos,
 getStories, imageUrl, listOwnedChannels, getChannelById, removeUpload, updateFullProfile, uploadPhoto,
 type Channel, type FullProfile, type ProfilePhoto, type Story
} from "@/lib/social";

const readableError=(e:unknown)=>e instanceof Error?e.message:"Что-то пошло не так";
type Props={token:string;userId:string;targetId:string;onBack:()=>void;onOwnProfileChange:()=>void;onMessage:(username:string)=>void;onOpenChannel:(channel:Channel)=>void;isBlocked?:boolean;onBlockUser?:(targetId:string)=>void};

export default function ProfilePanel({token,userId,targetId,onBack,onOwnProfileChange,onMessage,onOpenChannel,isBlocked=false,onBlockUser}:Props){
 const mine=targetId===userId;
 const [profile,setProfile]=useState<FullProfile|null>(null);
 const [userActivity,setUserActivity]=useState<UserActivity|null>(null);
 const [photos,setPhotos]=useState<ProfilePhoto[]>([]);
 const [stories,setStories]=useState<Story[]>([]);
 const [ownedChannels,setOwnedChannels]=useState<Channel[]>([]);
 const [featuredChannel,setFeaturedChannel]=useState<Channel|null>(null);
 const [chosenChannelId,setChosenChannelId]=useState<string>("");
 const [pinningChannel,setPinningChannel]=useState(false);
 const [statusPickerOpen,setStatusPickerOpen]=useState(false);
 const [profileContentTab,setProfileContentTab]=useState<'stories'|'photos'>('stories');
 const [name,setName]=useState("");const [username,setUsername]=useState("");const [bio,setBio]=useState("");
 const [editing,setEditing]=useState(false);
 const [visitorPreview,setVisitorPreview]=useState(false);
 const [usernameTouched,setUsernameTouched]=useState(false);
 const usernameError=usernameTouched?validateUsername(username):null;const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const [viewer,setViewer]=useState<{url:string;caption:string}|null>(null);
 const [storyIndex,setStoryIndex]=useState<number|null>(null);
 const [storyPaused,setStoryPaused]=useState(false);
 const activeStory=storyIndex===null?null:stories[storyIndex]??null;
 const progressRef=useStoryProgress(activeStory?.id??null,()=>setStoryIndex(i=>i===null?null:i+1>=stories.length?null:i+1),storyPaused);
 const reload=useCallback(async()=>{
  const [p,gallery,active,owned]=await Promise.all([
   getFullProfile(token,targetId),getProfilePhotos(token,targetId),getStories(token,targetId),mine?listOwnedChannels(token,targetId):Promise.resolve([] as Channel[])
  ]);
  const pinned=p?.featured_channel_id
    ? owned.find(ch=>ch.id===p.featured_channel_id)??await getChannelById(token,p.featured_channel_id).catch(()=>null)
    : null;
  setProfile(p);setPhotos(gallery);setStories(active);setOwnedChannels(owned);
  setFeaturedChannel(pinned);
  setChosenChannelId(p?.featured_channel_id??"");
  setName(p?.display_name||"");setUsername(p?.username||"");setBio(p?.bio||"");
 },[token,targetId]);
 useEffect(()=>{let mounted=true;void reload().catch(e=>{if(mounted)setError(readableError(e));});return()=>{mounted=false;};},[reload]);
 useEffect(()=>{let mounted=true;const poll=()=>{if(document.visibilityState!=='visible')return;void getUserActivities(token,[targetId]).then(rows=>{if(mounted)setUserActivity(rows[targetId]||null);}).catch(()=>{});};poll();const timer=window.setInterval(poll,30000);return()=>{mounted=false;window.clearInterval(timer);};},[token,targetId]);
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
  setUsernameTouched(true);
  const validation=validateUsername(username);
  if(validation){setError(validation);return;}
  if(!name.trim()){setError("Имя не может быть пустым.");return;}
  await run(async()=>{
   try{await changeProfile(token,userId,username.trim().toLowerCase().replace(/^@/,""),name.trim());}
   catch(e){throw Error(explainProfileError(e));}
   await updateFullProfile(token,userId,{bio:bio.trim()});
   onOwnProfileChange();setEditing(false);setNotice("Профиль обновлён.");
  });
 }
 async function setStatusEmoji(index:number|null){
  if(!mine||!profile||busy)return;
  if(index===profile.status_emoji){setStatusPickerOpen(false);return;}
  await run(async()=>{
   const updated=await updateFullProfile(token,userId,{status_emoji:index});
   if(updated.status_emoji!==index)throw Error("Не получилось сохранить эмодзи-статус.");
   setProfile(updated);
   setStatusPickerOpen(false);
   onOwnProfileChange();
   setNotice(index===null?"Эмодзи-статус убран.":"Эмодзи-статус установлен.");
  });
 }
 async function pinChannel(){
  if(!profile||!mine||busy)return;
  const next=chosenChannelId||null;
  if(next&&!ownedChannels.some(channel=>channel.id===next)){setError("Выбери свой канал из списка.");return;}
  await run(async()=>{
   const updated=await updateFullProfile(token,userId,{featured_channel_id:next});
   if(updated.featured_channel_id!==next)throw Error("Канал не сохранился. Попробуй ещё раз.");
   setPinningChannel(false);
   setNotice(next?"Канал теперь отображается в профиле.":"Канал откреплён.");
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
  if(storyIndex===null)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setStoryIndex(null);
   if(event.key==='ArrowRight')setStoryIndex(i=>i===null?null:i+1>=stories.length?null:i+1);
   if(event.key==='ArrowLeft')setStoryIndex(i=>i===null?null:Math.max(0,i-1));};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
 },[storyIndex,stories.length]);
 const avatar=profile?imageUrl(profile.avatar_path):null;
 const viewingAsVisitor=!mine||visitorPreview;
 const cover=profile?imageUrl(profile.cover_path):null;
 return <section className="profile-view ik-profile-redesign" aria-label="Профиль пользователя">
   <header className="profile-topbar"><button type="button" className="profile-back" onClick={onBack} aria-label="Назад"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><span>Назад</span></button>
     <strong>{visitorPreview?"Профиль глазами других":"Профиль"}</strong>{mine?<div className="ik-profile-top-actions"><button type="button" className="profile-edit-trigger" onClick={()=>{setVisitorPreview(v=>!v);setEditing(false);}}>{visitorPreview?"Вернуться":"Как видят другие"}</button>{!visitorPreview&&<button type="button" className="profile-edit-trigger" onClick={()=>setEditing(v=>!v)} aria-expanded={editing}>{editing?"Закрыть":"✎ Редактировать"}</button>}</div>:<span/>}</header>
   <div className="profile-scroll">
    <div className="profile-hero">
     <div className="profile-cover" style={cover?{backgroundImage:"url("+cover+")"}:undefined}>
       {!viewingAsVisitor&&<label className="profile-cover-action">Изменить обложку<input aria-label="Выбрать обложку" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"cover");e.target.value="";}}/></label>}
     </div>
     <div className={"profile-avatar-large"+(stories.length?" profile-avatar-has-story":"")} onClick={()=>{if(stories.length)setStoryIndex(0);}} role={stories.length?"button":undefined} tabIndex={stories.length?0:undefined} onKeyDown={e=>{if(stories.length&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setStoryIndex(0);}}} aria-label={stories.length?"Посмотреть истории":undefined}>{avatar?<img src={avatar} alt="Аватар пользователя"/>:<span>{(profile?.display_name||"?").charAt(0).toUpperCase()}</span>}
      {!viewingAsVisitor&&<label className="profile-avatar-camera" title="Изменить фото"><span aria-hidden="true">▣</span><input aria-label="Загрузить фото профиля" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"avatar");e.target.value="";}}/></label>}
     </div>
     {profile?<div className="profile-identity">
       <div className="ik-profile-name-row">
        <h1>{profile.display_name}</h1>
        {mine&&!visitorPreview?
          <button type="button" className="ik-profile-status-click" disabled={busy}
            aria-label={profile.status_emoji===null?"Поставить эмодзи-статус":"Изменить эмодзи-статус"}
            aria-expanded={statusPickerOpen}
            onClick={()=>setStatusPickerOpen(open=>!open)}>
            {profile.status_emoji!==null?<StatusEmoji index={profile.status_emoji}/>:<span className="ik-profile-status-placeholder" aria-hidden="true">＋</span>}
          </button>
          :<StatusEmoji index={profile.status_emoji}/>}
       </div>
       <p>@{profile.username}</p><p className={userActivity?.status==="в сети"?"ik-profile-activity ik-online-label":"ik-profile-activity"}>{activityLabel(userActivity)}</p>
        {profile.bio&&<div className="profile-bio">{profile.bio}</div>}
        {!mine&&<div className="ik-profile-conversation-actions">
          <button type="button" className="accent-button profile-message-button" disabled={isBlocked} onClick={()=>onMessage(profile.username)}>{isBlocked?"Заблокирован":"Написать сообщение"}</button>
          {!isBlocked&&onBlockUser&&<button type="button" className="ik-profile-block-action" onClick={()=>onBlockUser(targetId)}>Заблокировать</button>}
        </div>}</div>:<p>Загрузка профиля…</p>}
    </div>
    {mine&&!visitorPreview&&<section className="profile-content-section ik-status-section" aria-label="Настройка эмодзи-статуса">
      <button type="button" className="ik-status-setting" aria-expanded={statusPickerOpen}
        aria-controls="ik-profile-status-chooser"
        disabled={busy} onClick={()=>setStatusPickerOpen(open=>!open)}>
        <span className="ik-status-setting-image">{profile?.status_emoji!==null&&profile?.status_emoji!==undefined?
          <StatusEmoji index={profile.status_emoji} size="large" decorative/>:
          <span aria-hidden="true">✦</span>}</span>
        <span className="ik-status-setting-text"><strong>Эмодзи-статус</strong>
        <small>{profile?.status_emoji!==null&&profile?.status_emoji!==undefined?"Изменить или убрать":"Выбрать фигурку рядом с именем"}</small></span>
        <span className="ik-status-setting-chevron" aria-hidden="true">{statusPickerOpen?"⌄":"›"}</span>
      </button>
      {statusPickerOpen&&<div id="ik-profile-status-chooser">
        <StatusEmojiPicker value={profile?.status_emoji??null} disabled={busy} onSelect={index=>void setStatusEmoji(index)}/>
      </div>}
    </section>}
    {mine&&!visitorPreview&&editing&&<form className="profile-editor" onSubmit={save}>
     <h2>Редактирование профиля</h2><p className="profile-editor-intro">Измени информацию о себе и нажми «Сохранить изменения».</p>
     <label>Имя<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} required/></label>
     <label>Юзернейм<input value={username} onChange={e=>{setUsername(e.target.value);setUsernameTouched(true);}} onBlur={()=>setUsernameTouched(true)} maxLength={48} aria-invalid={Boolean(usernameError)} aria-describedby="username-feedback" required/><small id="username-feedback" className={usernameError?"profile-field-error":"profile-field-hint"}>{usernameError||"От 3 до 24 символов: латинские буквы, цифры и _. Например, tendo888."}</small></label>
     <label>О себе<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160} rows={3} placeholder="Расскажи немного о себе"/></label>

     <button className="accent-button" disabled={busy} type="submit">{busy?"Сохраняем…":"Сохранить изменения"}</button>
     <div className="profile-delete-actions">{profile?.avatar_path&&<button type="button" onClick={()=>void clearImage("avatar")} disabled={busy}>Удалить аватар</button>}{profile?.cover_path&&<button type="button" onClick={()=>void clearImage("cover")} disabled={busy}>Удалить обложку</button>}</div>
    </form>}
    {(featuredChannel||(mine&&!visitorPreview))&&<div className="profile-content-section profile-featured-section">
      {featuredChannel&&<button type="button" className="profile-featured-channel" onClick={()=>onOpenChannel(featuredChannel)} aria-label={'Открыть канал '+featuredChannel.title}>
        <span className="profile-featured-icon">{featuredChannel.avatar_path?<img src={imageUrl(featuredChannel.avatar_path)??undefined} alt="" className="ik-channel-avatar-img"/>:"#"} </span>
        <span className="profile-featured-details"><strong>{featuredChannel.title}</strong><small>@{featuredChannel.slug}</small></span>
        <span className="profile-featured-arrow" aria-hidden="true">›</span>
      </button>}
      {mine&&!visitorPreview&&<div className="ik-profile-pin-area">
        <button type="button" className="ik-profile-pin-toggle" onClick={()=>{setChosenChannelId(profile?.featured_channel_id??"");setPinningChannel(v=>!v);}} aria-expanded={pinningChannel}>{pinningChannel?"Отмена":featuredChannel?"Изменить закреплённый канал":"+ Прикрепить канал"}</button>
        {pinningChannel&&<div className="ik-profile-pin-picker">
          {ownedChannels.length?<><label htmlFor="ik-profile-channel-choice">Канал в профиле</label>
            <select id="ik-profile-channel-choice" value={chosenChannelId} onChange={e=>setChosenChannelId(e.target.value)}>
              <option value="">Не показывать канал</option>
              {ownedChannels.map(ch=><option key={ch.id} value={ch.id}>{ch.title} (@{ch.slug})</option>)}
            </select>
            <button type="button" className="ik-profile-pin-save" disabled={busy||chosenChannelId===(profile?.featured_channel_id??"")} onClick={()=>void pinChannel()}>{busy?"Сохраняем…":"Сохранить канал"}</button>
          </>:<p>Сначала создай собственный канал в разделе «Каналы».</p>}
        </div>}
      </div>}
    </div>}
    <nav className="ik-profile-content-tabs" aria-label="Разделы профиля">
      <button type="button" className={profileContentTab==='stories'?'selected':''} aria-current={profileContentTab==='stories'?'page':undefined} onClick={()=>setProfileContentTab('stories')}>Истории{stories.length>0&&<span>{stories.length}</span>}</button>
      <button type="button" className={profileContentTab==='photos'?'selected':''} aria-current={profileContentTab==='photos'?'page':undefined} onClick={()=>setProfileContentTab('photos')}>Фотографии{photos.length>0&&<span>{photos.length}</span>}</button>
    </nav>
    {profileContentTab==='stories'&&<div className="profile-content-section ik-profile-gallery-section">
     <div className="profile-section-title"><div><h2>Истории</h2><p>Доступны 24 часа</p></div>
       {!viewingAsVisitor&&<label className="profile-action">+ История<input type="file" aria-label="Добавить историю" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"story");e.target.value="";}}/></label>}</div>
     {stories.length?<div className="profile-stories">{stories.map(st=><div className="profile-story" key={st.id}>
      <button type="button" className="profile-story-thumb" onClick={()=>setStoryIndex(stories.findIndex(item=>item.id===st.id))}><img src={imageUrl(st.image_path)||""} alt="История пользователя"/></button>
      <small>{new Date(st.expires_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small>
      {!viewingAsVisitor&&<button disabled={busy} className="profile-small-delete" type="button" onClick={()=>void run(async()=>{await deleteStory(token,st.id);await removeUpload(token,st.image_path).catch(()=>{});})}>Удалить</button>}
     </div>)}</div>:<p className="profile-empty">Пока нет активных историй.</p>}
    </div>}
    {profileContentTab==='photos'&&<div className="profile-content-section ik-profile-gallery-section">
     <div className="profile-section-title"><div><h2>Фото профиля</h2><p>Твоя галерея</p></div>
       {!viewingAsVisitor&&<label className="profile-action">+ Фото<input aria-label="Выложить фото в профиль" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void chooseImage(e.target.files?.[0],"photo");e.target.value="";}}/></label>}</div>
     {photos.length?<div className="profile-photo-grid">{photos.map(photo=><div className="profile-grid-cell" key={photo.id}>
      <button type="button" onClick={()=>{const url=imageUrl(photo.image_path);if(url)setViewer({url,caption:photo.caption});}}><img src={imageUrl(photo.image_path)||""} alt="Фото в профиле"/></button>
      {!viewingAsVisitor&&<button type="button" className="profile-grid-delete" disabled={busy} title="Удалить фото" onClick={()=>void run(async()=>{await deleteProfilePhoto(token,photo.id);await removeUpload(token,photo.image_path).catch(()=>{});})}>×</button>}
     </div>)}</div>:<p className="profile-empty">В галерее пока нет фотографий.</p>}
    </div>}
    <p className="profile-privacy">Фото и истории доступны другим зарегистрированным пользователям. Не публикуй личные документы.</p>
    {(error||notice)&&<p role="status" className={error?"profile-error":"profile-success"}>{error||notice}</p>}
   </div>
   {activeStory&&<div className="story-viewer story-viewer-telegram" role="dialog" aria-modal="true" aria-label="Просмотр историй" onPointerDown={()=>setStoryPaused(true)} onPointerUp={()=>setStoryPaused(false)} onPointerCancel={()=>setStoryPaused(false)}>
    <div className="story-viewer-stage">
     <div className="story-progress">{stories.map((st,i)=><span key={st.id} className="story-progress-track"><span className={i<(storyIndex??0)?"done":i===storyIndex?"playing story-progress-fill":""} ref={i===storyIndex?progressRef:undefined}/></span>)}</div>
     <header className="story-viewer-header"><span className="story-viewer-avatar">{avatar?<img src={avatar} alt=""/>:(profile?.display_name||"?").charAt(0)}</span>
      <span className="story-viewer-author"><strong>{profile?.display_name}</strong><small>{new Date(activeStory.created_at).toLocaleString("ru-RU",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})}</small></span>
      <button type="button" className="story-viewer-close" onClick={()=>setStoryIndex(null)} aria-label="Закрыть историю"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
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
