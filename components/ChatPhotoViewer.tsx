'use client';

import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';

type Props={
  src:string;
  onClose:()=>void;
  onImageError:()=>void;
};

/** The viewer lives in document.body, outside transformed swipe-message
 * bubbles, so iOS does not clip or offset its fixed overlay. */
export default function ChatPhotoViewer({src,onClose,onImageError}:Props){
  const closeButtonRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLElement>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;

  useEffect(()=>{
    const previousFocus=document.activeElement instanceof HTMLElement
      ?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeButtonRef.current?.focus();

    const handleKeyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if(event.key!=='Tab')return;
      // Keyboard focus must not escape the modal into private chat actions.
      const controls=dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
      if(!controls?.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||!dialogRef.current?.contains(document.activeElement))){
        event.preventDefault();last.focus();
      }else if(!event.shiftKey&&(document.activeElement===last||!dialogRef.current?.contains(document.activeElement))){
        event.preventDefault();first.focus();
      }
    };
    document.addEventListener('keydown',handleKeyboard);
    return()=>{
      document.removeEventListener('keydown',handleKeyboard);
      document.body.style.overflow=previousOverflow;
      if(previousFocus?.isConnected)previousFocus.focus();
    };
  },[]);

  return createPortal(
    <div className="ik-chat-photo-backdrop" onClick={event=>{
      if(event.target===event.currentTarget)onClose();
    }}>
      <section ref={dialogRef} className="ik-chat-photo-dialog" role="dialog"
        aria-modal="true" aria-label="Просмотр фотографии">
        <header className="ik-chat-photo-header">
          <strong>Фотография</strong>
          <div className="ik-chat-photo-controls">
            <a href={src} target="_blank" rel="noopener noreferrer"
              aria-label="Открыть оригинал фотографии в новой вкладке">Оригинал</a>
            <button ref={closeButtonRef} type="button" onClick={onClose}
              aria-label="Закрыть фотографию" title="Закрыть">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                aria-hidden="true"><path d="M6 6 18 18M18 6 6 18"/></svg>
            </button>
          </div>
        </header>
        <div className="ik-chat-photo-stage">
          <img src={src} alt="Фотография из переписки" onError={onImageError}
            decoding="async"/>
        </div>
      </section>
    </div>,document.body
  );
}
