'use client';

import {useEffect,useState,type ReactNode} from 'react';
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
 const [loadingScope,setLoadingScope]=useState<string|null>(null);
 const [retry,setRetry]=useState(0);
 const [previewOpen,setPreviewOpen]=useState(false);
 const scope=token+':'+path;
 const url=signed?.scope===scope?signed.url:null;
 const error=errorScope===scope;
 const statusMessage=loadingScope===scope?'Загружаем вложение…':'';
 const alertMessage=error?'Не удалось загрузить вложение':'';

 useEffect(()=>{
  let active=true;
  // Keep live regions mounted before changing their text so assistive
  // technology can announce the request lifecycle reliably.
  setLoadingScope(scope);
  setSigned(null);
  setErrorScope(null);
  setPreviewOpen(false);
  if(retry>0)invalidateDirectMediaUrl(token,path);
  void getDirectMediaUrl(token,path)
   .then(value=>{if(active){setSigned({scope,url:value});setLoadingScope(null);}})
   .catch(()=>{if(active){setErrorScope(scope);setLoadingScope(null);}});
  return()=>{active=false;};
 },[token,path,retry,scope]);

 const handleMediaError=()=>{
  invalidateDirectMediaUrl(token,path);
  setErrorScope(scope);
  setLoadingScope(null);
  setPreviewOpen(false);
 };

 let mediaContent:ReactNode;
 if(error)mediaContent=<button type="button" className="chat-media-retry"
   onClick={()=>setRetry(value=>value+1)}>Не удалось загрузить вложение · Повторить</button>;
 else if(!url)mediaContent=<span className="chat-media-loading" aria-hidden="true">Загружаем вложение…</span>;
 else if(type==='image')mediaContent=<>
  <button type="button" className="chat-media-open"
    aria-label="Просмотреть фотографию" onClick={()=>setPreviewOpen(true)}>
    <img className="chat-media-image" src={url} alt="Фото в сообщении"
      loading="lazy" decoding="async" onError={handleMediaError}/>
  </button>
  {previewOpen&&<ChatPhotoViewer src={url} onClose={()=>setPreviewOpen(false)}
    onImageError={handleMediaError}/>}
 </>;
 else if(type==='video')mediaContent=<video className="chat-media-video" src={url}
   controls playsInline preload="metadata" onError={handleMediaError}
   aria-label="Видео в сообщении"/>;
 else if(type==='audio')mediaContent=<audio className="chat-media-audio" src={url}
   controls preload="metadata" onError={handleMediaError}
   aria-label="Музыка в сообщении"/>;
 else mediaContent=<a className="chat-file-link" href={url} target="_blank"
   rel="noopener noreferrer" download>📎 Открыть файл</a>;

 return <>
  <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</span>
  <span className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{alertMessage}</span>
  {mediaContent}
 </>;
}
