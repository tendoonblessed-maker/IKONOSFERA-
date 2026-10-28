'use client';
import {useEffect,useState} from 'react';
import {getDirectMediaUrl,invalidateDirectMediaUrl} from '@/lib/supabase-rest';
export default function ChatMedia({token,path,type}:{token:string;path:string;type:"image"|"video"|"audio"|"file"}){
 const [url,setUrl]=useState<string|null>(null);
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setUrl(null);setError(false);
  if(retry>0)invalidateDirectMediaUrl(token,path);
  void getDirectMediaUrl(token,path).then(value=>{if(active)setUrl(value);}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[token,path,retry]);
 if(error)return <button type="button" className="chat-media-retry" onClick={()=>setRetry(value=>value+1)}>Не удалось загрузить вложение · Повторить</button>;
 if(!url)return <span className="chat-media-loading">Загружаем вложение…</span>;
 return type==="image"?<a href={url} target="_blank" rel="noreferrer" aria-label="Открыть фото"><img className="chat-media-image" src={url} alt="Фото в сообщении" loading="lazy" decoding="async" onError={()=>setError(true)}/></a>
 :type==="video"?<video className="chat-media-video" src={url} controls playsInline preload="metadata" onError={()=>setError(true)} aria-label="Видео в сообщении"/>:type==="audio"?<audio className="chat-media-audio" src={url} controls preload="metadata" onError={()=>setError(true)} aria-label="Музыка в сообщении"/>:<a className="chat-file-link" href={url} target="_blank" rel="noreferrer" download>📎 Открыть файл</a>;
}
