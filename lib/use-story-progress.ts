'use client';
import {useEffect,useRef} from 'react';

/**
 * The progress line is the story playback clock. Animate with a compositor
 * transform and advance only when it reaches the end. This keeps progress,
 * pause-on-hold and auto-close in sync on iPhone Safari and desktop.
 */
export const STORY_DURATION_MS=6000;

export function useStoryProgress(storyId:string|null,onComplete:()=>void,paused=false){
 const progressRef=useRef<HTMLSpanElement|null>(null);
 const callbackRef=useRef(onComplete);
 const pausedRef=useRef(paused);
 useEffect(()=>{callbackRef.current=onComplete;},[onComplete]);
 useEffect(()=>{pausedRef.current=paused;},[paused]);
 useEffect(()=>{
  if(!storyId)return;
  let frame=0;
  let elapsed=0;
  let previous:number|null=null;
  const tick=(time:number)=>{
   // Background tabs and holding a finger on the story pause playback.
   // The delta cap prevents a stalled frame from skipping entire stories.
   if(previous!==null&&!pausedRef.current&&document.visibilityState==='visible'){
    elapsed+=Math.max(0,Math.min(time-previous,100));
   }
   previous=time;
   const fraction=Math.min(1,elapsed/STORY_DURATION_MS);
   if(progressRef.current)progressRef.current.style.transform='scaleX('+fraction+')';
   if(fraction>=1){callbackRef.current();return;}
   frame=window.requestAnimationFrame(tick);
  };
  if(progressRef.current)progressRef.current.style.transform='scaleX(0)';
  frame=window.requestAnimationFrame(tick);
  return()=>window.cancelAnimationFrame(frame);
 },[storyId]);
 return progressRef;
}
