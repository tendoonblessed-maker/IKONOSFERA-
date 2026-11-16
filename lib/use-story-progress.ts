'use client';
import {useLayoutEffect,useRef} from 'react';
import {createStoryProgressScheduler} from '@/lib/story-progress-scheduler';

/**
 * The progress line is the story playback clock. It advances only while the
 * viewer is visible, not held and motion is allowed, and does not keep
 * scheduling frames in the background. Paused foreground time is preserved.
 */
export const STORY_DURATION_MS=6000;

export function useStoryProgress(storyId:string|null,onComplete:()=>void,paused=false){
 const progressRef=useRef<HTMLSpanElement|null>(null);
 const callbackRef=useRef(onComplete);
 const pausedRef=useRef(paused);
 const motionReducedRef=useRef(false);
 const schedulerRef=useRef<ReturnType<typeof createStoryProgressScheduler>|null>(null);

 useLayoutEffect(()=>{callbackRef.current=onComplete;},[onComplete]);
 useLayoutEffect(()=>{
  pausedRef.current=paused;
  schedulerRef.current?.sync();
 },[paused]);

 useLayoutEffect(()=>{
  if(!storyId)return;
  let motionQuery:MediaQueryList|null=null;
  if(typeof window.matchMedia==='function'){
   motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
   motionReducedRef.current=motionQuery.matches;
  }else{
   motionReducedRef.current=false;
  }
  const scheduler=createStoryProgressScheduler({
   durationMs:STORY_DURATION_MS,
   isPaused:()=>pausedRef.current,
   isMotionReduced:()=>motionReducedRef.current,
   isVisible:()=>document.visibilityState==='visible',
   requestFrame:callback=>window.requestAnimationFrame(callback),
   cancelFrame:handle=>window.cancelAnimationFrame(handle),
   onProgress:fraction=>{
    if(progressRef.current)progressRef.current.style.transform='scaleX('+fraction+')';
   },
   onComplete:()=>callbackRef.current()
  });
  schedulerRef.current=scheduler;
  const onMotionChange=(event:MediaQueryListEvent)=>{
   motionReducedRef.current=event.matches;
   scheduler.sync();
  };
  if(motionQuery){
   if(typeof motionQuery.addEventListener==='function'){
    motionQuery.addEventListener('change',onMotionChange);
   }else{
    motionQuery.addListener(onMotionChange);
   }
  }
  const onVisibilityChange=()=>scheduler.sync();
  document.addEventListener('visibilitychange',onVisibilityChange);
  return()=>{
   document.removeEventListener('visibilitychange',onVisibilityChange);
   if(motionQuery){
    if(typeof motionQuery.removeEventListener==='function'){
     motionQuery.removeEventListener('change',onMotionChange);
    }else{
     motionQuery.removeListener(onMotionChange);
    }
   }
   scheduler.dispose();
   if(schedulerRef.current===scheduler)schedulerRef.current=null;
  };
 },[storyId]);

 return progressRef;
}
