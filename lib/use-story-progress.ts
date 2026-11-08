'use client';
import {useLayoutEffect,useRef} from 'react';
import {createStoryProgressScheduler} from '@/lib/story-progress-scheduler';

/**
 * The progress line is the story playback clock. It advances only while the
 * viewer is visible and not held, and does not keep scheduling frames in the
 * background. The elapsed foreground time is preserved across pauses.
 */
export const STORY_DURATION_MS=6000;

export function useStoryProgress(storyId:string|null,onComplete:()=>void,paused=false){
 const progressRef=useRef<HTMLSpanElement|null>(null);
 const callbackRef=useRef(onComplete);
 const pausedRef=useRef(paused);
 const schedulerRef=useRef<ReturnType<typeof createStoryProgressScheduler>|null>(null);

 useLayoutEffect(()=>{callbackRef.current=onComplete;},[onComplete]);
 useLayoutEffect(()=>{
  pausedRef.current=paused;
  schedulerRef.current?.sync();
 },[paused]);

 useLayoutEffect(()=>{
  if(!storyId)return;
  const scheduler=createStoryProgressScheduler({
   durationMs:STORY_DURATION_MS,
   isPaused:()=>pausedRef.current,
   isVisible:()=>document.visibilityState==='visible',
   requestFrame:callback=>window.requestAnimationFrame(callback),
   cancelFrame:handle=>window.cancelAnimationFrame(handle),
   onProgress:fraction=>{
    if(progressRef.current)progressRef.current.style.transform='scaleX('+fraction+')';
   },
   onComplete:()=>callbackRef.current()
  });
  schedulerRef.current=scheduler;
  const onVisibilityChange=()=>scheduler.sync();
  document.addEventListener('visibilitychange',onVisibilityChange);
  return()=>{
   document.removeEventListener('visibilitychange',onVisibilityChange);
   scheduler.dispose();
   if(schedulerRef.current===scheduler)schedulerRef.current=null;
  };
 },[storyId]);

 return progressRef;
}
