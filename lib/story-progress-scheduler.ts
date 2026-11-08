export type StoryProgressSchedulerOptions={
 durationMs:number;
 isPaused:()=>boolean;
 isVisible:()=>boolean;
 requestFrame:(callback:(time:number)=>void)=>number;
 cancelFrame:(handle:number)=>void;
 onProgress:(fraction:number)=>void;
 onComplete:()=>void;
};

export type StoryProgressScheduler={
 sync:()=>void;
 dispose:()=>void;
};

/**
 * Owns one story's animation clock. Pausing or hiding cancels the pending
 * animation frame without counting background time; resuming starts a fresh
 * frame and keeps the elapsed foreground time.
 */
export function createStoryProgressScheduler(options:StoryProgressSchedulerOptions):StoryProgressScheduler{
 let elapsedMs=0;
 let previousTime:number|null=null;
 let frameId:number|null=null;
 let generation=0;
 let disposed=false;
 let completed=false;

 const stop=()=>{
  generation++;
  if(frameId!==null){
   options.cancelFrame(frameId);
   frameId=null;
  }
  previousTime=null;
 };

 const tick=(time:number,run:number)=>{
  if(run!==generation)return;
  frameId=null;
  if(disposed||completed||options.isPaused()||!options.isVisible()){
   previousTime=null;
   return;
  }
  if(previousTime!==null){
   elapsedMs+=Math.max(0,Math.min(time-previousTime,100));
  }
  previousTime=time;
  const duration=Math.max(1,options.durationMs);
  const fraction=Math.min(1,elapsedMs/duration);
  options.onProgress(fraction);
  if(fraction>=1){
   completed=true;
   previousTime=null;
   options.onComplete();
   return;
  }
  frameId=options.requestFrame(next=>tick(next,run));
 };

 const sync=()=>{
  if(disposed||completed)return;
  if(options.isPaused()||!options.isVisible()){
   stop();
   return;
  }
  if(frameId!==null)return;
  generation++;
  previousTime=null;
  const run=generation;
  frameId=options.requestFrame(time=>tick(time,run));
 };

 const dispose=()=>{
  if(disposed)return;
  disposed=true;
  stop();
 };

 options.onProgress(0);
 sync();
 return {sync,dispose};
}
