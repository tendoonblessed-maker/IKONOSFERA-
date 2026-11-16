'use client';

import {useEffect,useRef} from 'react';
import {
 getProfilePhotoLightboxTabTarget,isProfilePhotoLightboxTabStop,
 restoreProfilePhotoLightboxFocus,shouldCloseProfilePhotoLightbox
} from '@/lib/profile-photo-lightbox-focus';

type Props={url:string;caption:string;onClose:()=>void};

/** Accessible, scroll-stable lightbox for a photo opened from a profile gallery. */
export default function ProfilePhotoLightbox({url,caption,onClose}:Props){
 const dialogRef=useRef<HTMLDivElement|null>(null);
 const closeButtonRef=useRef<HTMLButtonElement|null>(null);
 const closeRef=useRef(onClose);
 closeRef.current=onClose;

 useEffect(()=>{
  const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  closeButtonRef.current?.focus({preventScroll:true});

  const tabStops=()=>{
   const dialog=dialogRef.current;
   if(!dialog)return [];
   return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]'
   )).filter(isProfilePhotoLightboxTabStop);
  };
  const onKeyDown=(event:KeyboardEvent)=>{
   if(shouldCloseProfilePhotoLightbox(event)){
    event.preventDefault();
    closeRef.current();
    return;
   }
   if(event.key!=='Tab')return;
   const dialog=dialogRef.current;
   if(!dialog)return;
   const target=getProfilePhotoLightboxTabTarget(document.activeElement,dialog,tabStops(),event.shiftKey);
   if(target){
    event.preventDefault();
    target.focus({preventScroll:true});
   }
  };
  const onFocusIn=(event:FocusEvent)=>{
   const dialog=dialogRef.current;
   if(!dialog||!(event.target instanceof Node)||dialog.contains(event.target))return;
   const target=getProfilePhotoLightboxTabTarget(null,dialog,tabStops(),false)??dialog;
   target.focus({preventScroll:true});
  };
  document.addEventListener('keydown',onKeyDown);
  document.addEventListener('focusin',onFocusIn);
  return()=>{
   document.removeEventListener('keydown',onKeyDown);
   document.removeEventListener('focusin',onFocusIn);
   document.body.style.overflow=previousOverflow;
   restoreProfilePhotoLightboxFocus(previousFocus);
  };
 },[]);

 return <div ref={dialogRef} className="profile-lightbox" role="dialog" aria-modal="true"
  aria-label="Просмотр фото" tabIndex={-1}>
  <button ref={closeButtonRef} className="profile-lightbox-close" type="button"
   onClick={onClose} aria-label="Закрыть фото">Закрыть ×</button>
  <img src={url} alt={caption||"Фото пользователя"}/>
  {caption&&<p>{caption}</p>}
 </div>;
}
