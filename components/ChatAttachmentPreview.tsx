'use client';

import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

type Props={
 file:File;
 caption:string;
 sending:boolean;
 onCaptionChange:(value:string)=>void;
 onCancel:()=>void;
 onSend:()=>void;
};

export default function ChatAttachmentPreview({file,caption,sending,onCaptionChange,onCancel,onSend}:Props){
 const [preview,setPreview]=useState<{file:File;url:string}|null>(null);
 const dialogRef=useRef<HTMLElement|null>(null);
 const captionRef=useRef<HTMLTextAreaElement|null>(null);
 const sendRef=useRef<HTMLButtonElement|null>(null);
 const closeRef=useRef(onCancel);
 closeRef.current=onCancel;
 const busyRef=useRef(sending);
 busyRef.current=sending;
 const canPreview=/^(image\/|video\/|audio\/)/.test(file.type);
 const src=preview?.file===file?preview.url:null;

 useEffect(()=>{
  setPreview(null);
  if(!canPreview)return;
  const url=URL.createObjectURL(file);
  setPreview({file,url});
  return()=>URL.revokeObjectURL(url);
 },[file,canPreview]);

 useEffect(()=>{
  const previouslyFocused=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  captionRef.current?.focus();
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'&&!busyRef.current){
    event.preventDefault();
    closeRef.current();
   }
   if(event.key!=='Tab')return;
   const controls=dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled])');
   if(!controls?.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&(document.activeElement===first||!dialogRef.current?.contains(document.activeElement))){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&(document.activeElement===last||!dialogRef.current?.contains(document.activeElement))){
    event.preventDefault();first.focus();
   }
  };
  document.addEventListener('keydown',onKeyDown);
  return()=>{
   document.removeEventListener('keydown',onKeyDown);
   document.body.style.overflow=previousOverflow;
   if(previouslyFocused?.isConnected)previouslyFocused.focus();
  };
 },[]);

 const size=file.size<1024?file.size+' Б':file.size<1048576?(file.size/1024).toFixed(1)+' КБ':(file.size/1048576).toFixed(1)+' МБ';
 return createPortal(
  <div className="ik-attachment-preview-backdrop" onClick={event=>{
    if(event.target===event.currentTarget&&!sending)onCancel();
  }}>
   <section ref={dialogRef} className="ik-attachment-preview-dialog" role="dialog"
     aria-modal="true" aria-label="Подготовка вложения">
    <header className="ik-attachment-preview-header">
     <div><strong>Отправить вложение</strong><span>Проверь файл перед отправкой</span></div>
     <button type="button" onClick={onCancel} disabled={sending}
       aria-label="Отменить вложение" title="Закрыть">✕</button>
    </header>
    <div className="ik-attachment-preview-stage">
     {file.type.startsWith('image/')&&src
       ?<img src={src} alt="Предпросмотр фотографии"/>
       :file.type.startsWith('video/')&&src
         ?<video src={src} controls playsInline preload="metadata" aria-label="Предпросмотр видео"/>
         :file.type.startsWith('audio/')&&src
           ?<audio src={src} controls preload="metadata" aria-label="Прослушать запись"/>
           :<span className="ik-attachment-preview-file-icon" aria-hidden="true">📎</span>}
    </div>
    <div className="ik-attachment-preview-details">
     <strong title={file.name}>{file.name||'Вложение'}</strong>
     <span>{size}</span>
    </div>
    <label className="ik-attachment-preview-caption" htmlFor="ik-attachment-caption">
     <span>Подпись <small>необязательно</small></span>
     <textarea ref={captionRef} id="ik-attachment-caption" rows={2} maxLength={4000}
       disabled={sending} value={caption} onChange={event=>onCaptionChange(event.target.value)}
       placeholder="Добавить подпись…"
       onKeyDown={event=>{
        if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing){
         event.preventDefault();
         sendRef.current?.click();
        }
       }}/>
    </label>
    <footer className="ik-attachment-preview-actions">
     <button type="button" disabled={sending} onClick={onCancel}>Отмена</button>
     <button ref={sendRef} type="button" disabled={sending} onClick={onSend}
       className="ik-attachment-preview-submit">
       {sending?'Отправляем…':'Отправить'}
     </button>
    </footer>
   </section>
  </div>,document.body
 );
}
