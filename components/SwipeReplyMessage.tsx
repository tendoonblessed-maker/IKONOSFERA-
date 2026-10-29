'use client';

import {useEffect,useRef,useState,type ReactNode,type TouchEvent} from 'react';
import {useSwipeable} from 'react-swipeable';

type Props={
  children:ReactNode;
  className:string;
  disabled?:boolean;
  onReply:()=>void;
  onOpenMenu?:()=>void;
};

const HOLD_DURATION_MS=520;
const HOLD_MOVE_TOLERANCE_PX=12;

/** MIT react-swipeable gesture with iOS vertical scroll and long-press actions. */
export default function SwipeReplyMessage({children,className,disabled=false,onReply,onOpenMenu}:Props){
  const [movement,setMovement]=useState(0);
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const touchOrigin=useRef<{x:number;y:number}|null>(null);
  const wasHeld=useRef(false);

  const cancelHold=()=>{
    if(holdTimer.current!==null){
      window.clearTimeout(holdTimer.current);
      holdTimer.current=null;
    }
    touchOrigin.current=null;
  };
  useEffect(()=>()=>cancelHold(),[]);

  const onTouchStart=(event:TouchEvent<HTMLDivElement>)=>{
    cancelHold();
    wasHeld.current=false;
    if(disabled||!onOpenMenu||event.touches.length!==1)return;
    // Never hijack play/pause, opening an attachment, or tapping a quote.
    if(event.target instanceof Element&&event.target.closest('button,a,input,textarea,select,video,audio,[role="button"],[contenteditable="true"]'))return;
    const finger=event.touches[0];
    touchOrigin.current={x:finger.clientX,y:finger.clientY};
    holdTimer.current=window.setTimeout(()=>{
      holdTimer.current=null;
      touchOrigin.current=null;
      wasHeld.current=true;
      setMovement(0);
      onOpenMenu();
    },HOLD_DURATION_MS);
  };
  const onTouchMove=(event:TouchEvent<HTMLDivElement>)=>{
    const origin=touchOrigin.current;
    if(!origin||event.touches.length!==1){cancelHold();return;}
    const finger=event.touches[0];
    if(Math.hypot(finger.clientX-origin.x,finger.clientY-origin.y)>HOLD_MOVE_TOLERANCE_PX)cancelHold();
  };

  const handlers=useSwipeable({
    trackTouch:true,
    trackMouse:false,
    preventScrollOnSwipe:false,
    delta:16,
    swipeDuration:700,
    onSwiping:({dir,deltaX})=>{
      cancelHold(); // A swipe must never also open the long-press menu.
      if(disabled||wasHeld.current)return;
      if(dir==='Right')setMovement(Math.min(72,Math.max(0,deltaX)));
      else if(dir==='Left')setMovement(Math.max(-72,Math.min(0,deltaX)));
    },
    onSwiped:({dir,absX})=>{
      cancelHold();
      setMovement(0);
      if(!disabled&&!wasHeld.current&&(dir==='Right'||dir==='Left')&&absX>=54)onReply();
    },
    onTouchEndOrOnMouseUp:()=>{
      cancelHold();
      setMovement(0);
    }
  });

  return <div {...handlers} className={className+' ik-swipe-message'}
    onTouchStart={onTouchStart}
    onTouchMove={onTouchMove}
    onTouchEnd={cancelHold}
    onTouchCancel={cancelHold}
    onContextMenu={event=>{
      if(disabled||!onOpenMenu)return;
      const target=event.target;
      if(target instanceof Element&&target.closest('button,a,input,textarea,select,video,audio,[role="button"],[contenteditable="true"]'))return;
      event.preventDefault();
      cancelHold();
      setMovement(0);
      onOpenMenu();
    }}
    style={{transform:movement?'translate3d('+movement+'px,0,0)':undefined}}
    data-swipe-to-reply="true" data-long-press-menu={Boolean(onOpenMenu)}>
    <span className="ik-swipe-reply-icon" aria-hidden="true" style={{
      opacity:Math.min(1,Math.abs(movement)/55),
      transform:'translateY(-50%) scale('+(.8+Math.min(1,Math.abs(movement)/55)*.2)+')'
    }}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 9 5 14l5 5"/><path d="M5 14h9a5 5 0 0 0 5-5V5"/></svg>
    </span>
    {children}
  </div>;
}
