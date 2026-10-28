'use client';

import {useState,type ReactNode} from 'react';
import {useSwipeable} from 'react-swipeable';

type Props={
  children:ReactNode;
  className:string;
  disabled?:boolean;
  onReply:()=>void;
};

/** MIT react-swipeable gesture, with iOS vertical scrolling left intact. */
export default function SwipeReplyMessage({children,className,disabled=false,onReply}:Props){
  const [movement,setMovement]=useState(0);
  const handlers=useSwipeable({
    trackTouch:true,
    trackMouse:false,
    preventScrollOnSwipe:false,
    delta:16,
    swipeDuration:700,
    onSwiping:({dir,deltaX})=>{
      if(disabled)return;
      if(dir==='Right')setMovement(Math.min(72,Math.max(0,deltaX)));
      else if(dir==='Left')setMovement(Math.max(-72,Math.min(0,deltaX)));
    },
    onSwiped:({dir,absX})=>{
      setMovement(0);
      if(!disabled&&(dir==='Right'||dir==='Left')&&absX>=54)onReply();
    },
    onTouchEndOrOnMouseUp:()=>setMovement(0)
  });

  return <div {...handlers} className={className+' ik-swipe-message'}
    style={{transform:movement?'translate3d('+movement+'px,0,0)':undefined}}
    data-swipe-to-reply="true">
    <span className="ik-swipe-reply-icon" aria-hidden="true" style={{
      opacity:Math.min(1,Math.abs(movement)/55),
      transform:'translateY(-50%) scale('+(.8+Math.min(1,Math.abs(movement)/55)*.2)+')'
    }}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 9 5 14l5 5"/><path d="M5 14h9a5 5 0 0 0 5-5V5"/></svg>
    </span>
    {children}
  </div>;
}
