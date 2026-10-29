'use client';

import {useEffect,useState} from 'react';
import {getDirectMediaUrl,invalidateDirectMediaUrl} from '@/lib/supabase-rest';
import ChatPhotoViewer from '@/components/ChatPhotoViewer';

type Props={
 token:string;
 path:string;
 type:'image'|'video'|'audio'|'file';
};

/** Secure signed media is only displayed for the current account + file.
 * Photos open in-app instead of navigating out of the conversation. */
export default function ChatMedia({token,path,type}:Props){
 const [signed,setSigned]=useState<{scope:string;url:string}|null>(null);
 const [errorScope,setErrorScope]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
 const [previewOpen,setPreviewOpen]=useState(false);
 const scope=token+':'+path;
 const url=signed?.scope===scope?signed.url:null;
 const error=errorScope===scope;

 useEffect(()=>{
  let active=true;
  setSigned(null);
  setErrorScope(null);
  setPreviewOpen(false);
  if(retry>0)invalidateDirectMediaUrl(token,path);
  void getDirectMediaUrl(token,path)
   .then(value=>{if(active)setSigned({scope,url:value});})
   .catch(()=>{if(active)setErrorScope(scope);});
  return()=>{active=false;};
 },[token,path,retry,scope]);

 const handleMediaError=()=>{
  invalidateDirectMediaUrl(token,path);
  setErrorScope(scope);
  setPreviewOpen(false);
 };

 if(error)return <button type="button" className="chat-media-retry"
   onClick={()=>setRetry(value=>value+1)}>Не удалось загрузить вложение · Повторить</button>;
 if(!url)return <span className="chat-media-loading">Загружаем вложение…</span>;

 if(type==='image')return <>
  <button type="button" className="chat-media-open"
    aria-label="Просмотреть фотографию" onClick={()=>setPreviewOpen(true)}>
    <img className="chat-media-image" src={url} alt="Фото в сообщении"
      loading="lazy" decoding="async" onError={handleMediaError}/>
  </button>
  {previewOpen&&<ChatPhotoViewer src={url} onClose={()=>setPreviewOpen(false)}
    onImageError={handleMediaError}/>}
 </>;
 if(type==='video')return <video className="chat-media-video" src={url}
   controls playsInline preload="metadata" onError={handleMediaError}
   aria-label="Видео в сообщении"/>;
 if(type==='audio')return <audio className="chat-media-audio" src={url}
   controls preload="metadata" onError={handleMediaError}
   aria-label="Музыка в сообщении"/>;
 return <a className="chat-file-link" href={url} target="_blank"
   rel="noopener noreferrer" download>📎 Открыть файл</a>;
}
