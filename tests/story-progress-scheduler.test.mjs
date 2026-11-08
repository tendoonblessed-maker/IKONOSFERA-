import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createStoryProgressScheduler} from '../lib/story-progress-scheduler.ts';

function createFrameClock(){
 let nextId=0;
 const pending=new Map();
 const callbacks=new Map();
 return {
  pending,
  callbacks,
  requestFrame(callback){
   const id=++nextId;
   pending.set(id,callback);
   callbacks.set(id,callback);
   return id;
  },
  cancelFrame(id){pending.delete(id);},
  step(time){
   const entry=pending.entries().next();
   assert.equal(entry.done,false,'an animation frame should be scheduled');
   const [id,callback]=entry.value;
   pending.delete(id);
   callback(time);
   return id;
  },
  invoke(id,time){callbacks.get(id)?.(time);}
 };
}

function createHarness({durationMs=6000,visible=true,paused=false}={}){
 const clock=createFrameClock();
 const progress=[];
 let completed=0;
 const state={visible,paused};
 const scheduler=createStoryProgressScheduler({
  durationMs,
  isPaused:()=>state.paused,
  isVisible:()=>state.visible,
  requestFrame:callback=>clock.requestFrame(callback),
  cancelFrame:id=>clock.cancelFrame(id),
  onProgress:value=>progress.push(value),
  onComplete:()=>{completed++;}
 });
 return {clock,progress,state,scheduler,get completed(){return completed;}};
}

test('story progress cancels animation frames while hidden and resumes without counting background time',()=>{
 const h=createHarness();
 assert.equal(h.clock.pending.size,1);
 h.clock.step(0);
 h.clock.step(100);
 assert.equal(h.progress.at(-1),100/6000);

 h.state.visible=false;
 h.scheduler.sync();
 assert.equal(h.clock.pending.size,0,'hidden viewer must not keep scheduling frames');

 h.state.visible=true;
 h.scheduler.sync();
 assert.equal(h.clock.pending.size,1);
 h.clock.step(10000);
 assert.equal(h.progress.at(-1),100/6000,'the first resumed frame must not include hidden time');
 h.clock.step(10100);
 assert.equal(h.progress.at(-1),200/6000);
 assert.equal(h.completed,0);
});

test('holding a story pauses its clock and preserves elapsed foreground time',()=>{
 const h=createHarness();
 h.clock.step(0);
 h.clock.step(100);
 h.state.paused=true;
 h.scheduler.sync();
 assert.equal(h.clock.pending.size,0);
 h.state.paused=false;
 h.scheduler.sync();
 h.clock.step(9000);
 assert.equal(h.progress.at(-1),100/6000);
 h.clock.step(9100);
 assert.equal(h.progress.at(-1),200/6000);
});

test('a canceled pre-pause frame cannot mutate progress or replace the resumed frame',()=>{
 const h=createHarness();
 h.clock.step(0);
 const staleId=[...h.clock.pending.keys()][0];
 const staleCallback=h.clock.callbacks.get(staleId);
 const before=h.progress.length;

 h.state.visible=false;
 h.scheduler.sync();
 h.state.visible=true;
 h.scheduler.sync();
 const resumedId=[...h.clock.pending.keys()][0];
 assert.notEqual(resumedId,staleId);

 staleCallback(5000);
 assert.equal(h.progress.length,before,'stale callback must be ignored');
 assert.deepEqual([...h.clock.pending.keys()],[resumedId],'stale callback must not clear the current frame');
});

test('large frame gaps are capped and completion fires exactly once',()=>{
 const h=createHarness({durationMs:250});
 h.clock.step(0);
 h.clock.step(5000);
 assert.equal(h.progress.at(-1),100/250,'a stalled frame may contribute at most 100 ms');
 h.clock.step(5100);
 h.clock.step(5200);
 assert.equal(h.progress.at(-1),1);
 assert.equal(h.completed,1);
 assert.equal(h.clock.pending.size,0);
 h.scheduler.sync();
 assert.equal(h.completed,1);
 assert.equal(h.clock.pending.size,0);
});

test('dispose cancels pending work and suppresses a callback already queued by the browser',()=>{
 const h=createHarness();
 h.clock.step(0);
 const staleId=[...h.clock.pending.keys()][0];
 const staleCallback=h.clock.callbacks.get(staleId);
 const before=h.progress.length;
 h.scheduler.dispose();
 assert.equal(h.clock.pending.size,0);
 staleCallback(1000);
 assert.equal(h.progress.length,before);
 assert.equal(h.completed,0);
});

test('React story hook syncs the scheduler on visibility changes and unmount',()=>{
 const hook=readFileSync(new URL('../lib/use-story-progress.ts',import.meta.url),'utf8');
 const strip=readFileSync(new URL('../components/StoriesStrip.tsx',import.meta.url),'utf8');
 assert.match(hook,/createStoryProgressScheduler/);
 assert.match(hook,/document\.addEventListener\('visibilitychange',onVisibilityChange\)/);
 assert.match(hook,/scheduler\.sync\(\)/);
 assert.match(hook,/scheduler\.dispose\(\)/);
 assert.match(hook,/window\.requestAnimationFrame/);
 assert.match(hook,/window\.cancelAnimationFrame/);
 assert.match(hook,/useLayoutEffect/);
 assert.match(strip,/useStoryProgress\(activeStoryId,\(\)=>next\(\),paused\)/);
});
