'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {addStory,getContactsStories,imageUrl,uploadPhoto,type Story} from '@/lib/social';
import type {Profile} from '@/lib/supabase-rest';
import {useStoryProgress} from '@/lib/use-story-progress';

type Person={id:string;name:string;avatar:string|null;stories:Story[]};
type Props={token:string;userId:string;contacts:Profile[];ownProfile:Profile|null};
export default function StoriesStrip({token,userId,contacts,ownProfile}:Props){
 const [people,setPeople]=useState<Person[]>([]);
 const [active,setActive]=useState<{person:number;story:number}|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [paused,setPaused]=useState(false);
 const inputRef=useRef<HTMLInputElement>(null);
 const activeStoryId=active?people[active.person]?.stories[active.story]?.id??null:null;
 const progressRef=useStoryProgress(activeStoryId,()=>next(),paused);
 const load=useCallback(async()=>{
  const ids=[userId,...contacts.map(x=>x.id)];
  const stories=await getContactsStories(token,ids);
  const own=stories.filter(x=>x.user_id===userId).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  const participants:Person[]=[{id:userId,name:'Моя история',avatar:ownProfile?.avatar_path??null,stories:own}];
  for(const c of contacts){
   const list=stories.filter(s=>s.user_id===c.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
   if(list.length&&!participants.some(p=>p.id===c.id))participants.push({id:c.id,name:c.display_name||c.username,avatar:c.avatar_path??null,stories:list});
  }
  setPeople(participants);
 },[token,userId,contacts,ownProfile]);
 useEffect(()=>{void load().catch(()=>{});},[load]);

 useEffect(()=>{if(!active)return;const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setActive(null);if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[active,people]);
 useEffect(()=>{if(!active)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[active]);
 function next(){setActive(prev=>{if(!prev)return null;const group=people[prev.person];if(prev.story+1<group.stories.length)return {...prev,story:prev.story+1};const i=people.findIndex((p,j)=>j>prev.person&&p.stories.length);return i<0?null:{person:i,story:0};});}
 function prev(){setActive(current=>{if(!current)return null;if(current.story>0)return {...current,story:current.story-1};for(let j=current.person-1;j>=0;j--)if(people[j].stories.length)return {person:j,story:people[j].stories.length-1};return {...current,story:0};});}
 async function create(file?:File){if(!file||busy)return;setBusy(true);setError('');try{
   const path=await uploadPhoto(token,userId,file);await addStory(token,userId,path,'');await load();setActive({person:0,story:0});
  }catch(e){setError(e instanceof Error?e.message:'Не удалось добавить историю');}finally{setBusy(false);}}
 const person=active?people[active.person]:null;const story=active&&person?person.stories[active.story]:null;
 return <section className="home-stories" aria-label="Истории контактов">
  <div className="home-stories-header"><strong>Истории</strong><span>Доступны 24 часа</span></div>
  <div className="home-stories-track">
   {people.map((p,i)=><button type="button" key={p.id} className={'home-story-item'+(p.stories.length?' has-stories':'')} onClick={()=>p.stories.length?setActive({person:i,story:0}):inputRef.current?.click()}>
    <span className="home-story-ring"><span className="home-story-avatar">{imageUrl(p.avatar)?<img src={imageUrl(p.avatar)||''} alt=""/>:<span>{p.name.slice(0,1).toUpperCase()}</span>}</span>{p.id===userId&&<i className="home-story-plus">+</i>}</span>
    <small>{p.name}</small>
   </button>)}
   {!people.slice(1).length&&<p className="home-stories-empty">Истории людей, с которыми ты переписываешься, появятся здесь.</p>}
  </div>
  <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Загрузить свою историю" disabled={busy} onChange={e=>{void create(e.target.files?.[0]);e.target.value='';}}/>
  {people[0]?.stories.length>0&&<button className="home-story-add" type="button" disabled={busy} onClick={()=>inputRef.current?.click()}>+ Добавить историю</button>}
  {error&&<p role="alert" className="profile-error">{error}</p>}
  {story&&person&&<div className="story-viewer story-viewer-telegram" role="dialog" aria-modal="true" aria-label={'Истории: '+person.name} onPointerDown={()=>setPaused(true)} onPointerUp={()=>setPaused(false)} onPointerCancel={()=>setPaused(false)}>
   <div className="story-viewer-stage">
    <img className="story-viewer-image" src={imageUrl(story.image_path)||''} alt={story.caption||'История'}/>
    <div className="story-progress">{person.stories.map((s,i)=><span className="story-progress-track" key={s.id}><span className={i<active!.story?'done':i===active!.story?'playing story-progress-fill':''} ref={i===active!.story?progressRef:undefined}/></span>)}</div>
    <header className="story-viewer-header"><span className="story-viewer-avatar">{imageUrl(person.avatar)?<img src={imageUrl(person.avatar)||''} alt=""/>:person.name.slice(0,1)}</span><span className="story-viewer-author"><strong>{person.name}</strong><small>{new Date(story.created_at).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><button type="button" className="story-viewer-close" onClick={()=>setActive(null)} aria-label="Закрыть"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    <button type="button" className="story-viewer-prev" aria-label="Предыдущая" onClick={prev}/><button type="button" className="story-viewer-next" aria-label="Следующая" onClick={next}/>
    {story.caption&&<div className="story-viewer-caption">{story.caption}</div>}
   </div>
  </div>}
 </section>;
}
