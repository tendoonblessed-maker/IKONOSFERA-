'use client';
import {useEffect,useState} from 'react';
import {getDirectMediaUrl} from '@/lib/supabase-rest';
export default function ChatMedia({token,path,type}:{token:string;path:string;type:"image"|"video"}){
 const [url,setUrl]=useState<string|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;setUrl(null);setError(false);
  void getDirectMediaUrl(token,path).then(value=>{if(active)setUrl(value);}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[token,path]);
 if(error)return <span className="chat-media-error">Не удалось загрузить вложение</span>;
 if(!url)return <span className="chat-media-loading">Загружаем вложение…</span>;
 return type==="image"?<a href={url} target="_blank" rel="noreferrer" aria-label="Открыть фото"><img className="chat-media-image" src={url} alt="Фото в сообщении" loading="lazy"/></a>
 :<video className="chat-media-video" src={url} controls playsInline preload="metadata" aria-label="Видео в сообщении"/>;
}
