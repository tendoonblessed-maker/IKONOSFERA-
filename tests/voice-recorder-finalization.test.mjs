import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {VOICE_FINALIZE_TIMEOUT_MS,VOICE_RECORD_MAX_MS,VOICE_PERMISSION_TIMEOUT_MS} from '../lib/voice-notes.ts';

const source=readFileSync(new URL('../components/VoiceRecorder.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  jsx:ts.JsxEmit.ReactJSX}
}).outputText;

function harness({
 deliverStop=false,mimeDetection='supported',
 defaultMimeType='audio/webm;codecs=opus',getUserMedia
}={}){
 const hooks=[];
 let hook=0;
 let nextTimer=1;
 const timers=new Map();
 const intervals=new Map();
 const errors=[];
 const recorded=[];
 const recorders=[];
 const trackListeners=new Set();
 const documentEvents=new Map();
 const windowEvents=new Map();
 const doc={
  visibilityState:'visible',
  addEventListener(name,handler){documentEvents.set(name,handler);},
  removeEventListener(name,handler){if(documentEvents.get(name)===handler)documentEvents.delete(name);}
 };
 const tracks=[{
  kind:'audio',readyState:'live',stopped:false,
  addEventListener(name,listener){if(name==='ended')trackListeners.add(listener);},
  removeEventListener(name,listener){if(name==='ended')trackListeners.delete(listener);},
  stop(){this.stopped=true;this.readyState='ended';},
  end(){
   this.readyState='ended';
   const listeners=[...trackListeners];
   trackListeners.clear();
   listeners.forEach(listener=>listener());
  }
 }];
 const stream={getTracks:()=>tracks};
 const schedule=(map)=>(fn,ms)=>{
  const id=nextTimer++;
  map.set(id,{fn,ms});
  return id;
 };
 const win={
  setTimeout:schedule(timers),clearTimeout:id=>timers.delete(id),
  setInterval:schedule(intervals),clearInterval:id=>intervals.delete(id),
  addEventListener(name,handler){windowEvents.set(name,handler);},
  removeEventListener(name,handler){if(windowEvents.get(name)===handler)windowEvents.delete(name);}
 };
 const jsx=(type,props)=>({type,props:props??{}});
 const react={
  useRef(initial){
   const i=hook++;
   if(!(i in hooks))hooks[i]={current:initial};
   return hooks[i];
  },
  useState(initial){
   const i=hook++;
   if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;
   return [hooks[i],value=>{
    hooks[i]=typeof value==='function'?value(hooks[i]):value;
   }];
  },
  useEffect(effect,deps){
   const i=hook++;
   const previous=hooks[i];
   if(previous&&deps&&deps.length===previous.deps.length
      &&deps.every((value,j)=>Object.is(value,previous.deps[j])))return;
   previous?.cleanup?.();
   hooks[i]={deps:deps??[],cleanup:effect()};
  }
 };
 class FakeMediaRecorder{
  static isTypeSupported(type){
   if(mimeDetection==='throws')throw Error('feature detection unavailable');
   return mimeDetection==='supported'&&type==='audio/webm';
  }
  constructor(_stream,options={}){
   this.state='inactive';
   this.options=options;
   this.mimeType=options.mimeType||defaultMimeType;
   recorders.push(this);
  }
  start(){this.state='recording';}
  stop(){
   this.state='inactive';
   if(deliverStop){
    this.ondataavailable?.({data:new Blob(['audio bytes'])});
    this.onstop?.();
   }
  }
 }
 if(mimeDetection==='missing')delete FakeMediaRecorder.isTypeSupported;
 const exports={};
 vm.runInNewContext(compiled,{
  exports,Blob,File,Date,console,
  navigator:{mediaDevices:{getUserMedia:getUserMedia??(async()=>stream)}},
  MediaRecorder:FakeMediaRecorder,
  window:win,document:doc,
  require(name){
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('react.fragment')};
   if(name==='@/lib/media-stream-lifecycle')return {
    stopMediaStreamTracks(stream){
     let tracks;
     try{tracks=stream?.getTracks?.()??[];}catch{return;}
     for(const track of tracks){try{track.stop();}catch{}}
    }
   };
   if(name==='@/lib/voice-notes')return {
    VOICE_FINALIZE_TIMEOUT_MS,VOICE_RECORD_MAX_MS,VOICE_PERMISSION_TIMEOUT_MS,VOICE_RECORD_MAX_BYTES:25*1024*1024,
    chooseVoiceMimeType:check=>check('audio/webm')?'audio/webm':null,
    normalizeVoiceMimeType:mime=>{
     const base=(mime||'').split(';',1)[0].trim().toLowerCase();
     return ['audio/mp4','audio/webm','audio/ogg'].includes(base)?base:null;
    },
    formatVoiceTime:()=> '00:00',
    createVoiceFile:(chunks,mime)=>{
     const base=(mime||'').split(';',1)[0].trim().toLowerCase();
     const ext=base==='audio/mp4'?'m4a':base==='audio/ogg'?'ogg':'webm';
     return new File(chunks,'voice.'+ext,{type:base});
    }
   };
   throw Error('Unexpected dependency: '+name);
  }
 },{timeout:2000,filename:'VoiceRecorder.test.cjs'});
 const Component=exports.default;
 const render=()=>{
  hook=0;
  return Component({disabled:false,onRecorded:file=>recorded.push(file),
   onError:message=>errors.push(message)});
 };
 const find=(node,predicate)=>{
  if(Array.isArray(node)){
   for(const child of node){const found=find(child,predicate);if(found)return found;}
   return null;
  }
  if(!node||typeof node!=='object')return null;
  if(predicate(node))return node;
  return find(node.props?.children,predicate);
 };
 const button=(tree,text)=>find(tree,node=>
  node.type==='button'&&node.props?.children===text);
 const pending=(ms)=>Array.from(timers.values()).filter(timer=>timer.ms===ms);
 const fireTimeout=ms=>{
  const entry=Array.from(timers.entries()).find(([,timer])=>timer.ms===ms);
  if(!entry)return false;
  const [id,timer]=entry;
  timers.delete(id);
  timer.fn();
  return true;
 };
 const clickStart=()=>{
  const trigger=find(render(),node=>node.props?.['aria-label']==='Записать голосовое сообщение');
  assert.ok(trigger);
  trigger.props.onClick();
 };
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const start=async({recording=true}={})=>{
  clickStart();
  // getUserMedia() is asynchronous; flush its full promise chain before
  // asserting recorder construction, rather than assuming two microtasks.
  await flush();
  assert.equal(recorders.length,1,'recorder startup: '+errors.join(' | '));
  assert.equal(recorders[0].state,recording?'recording':'inactive');
 };
 return {
  render,button,pending,fireTimeout,start,clickStart,flush,errors,recorded,tracks,recorders,timers,intervals,
  document:doc,
  emitDocument:name=>documentEvents.get(name)?.(),
  emitWindow:name=>windowEvents.get(name)?.()
 };
}

test('a hung mobile MediaRecorder stop releases microphone and returns to idle',async()=>{
 const h=harness();
 await h.start();
 h.button(h.render(),'Готово').props.onClick();
 const finalizing=h.render();
 assert.ok(h.button(finalizing,'Отменить'),'cancel stays visible during finalization');
 assert.notEqual(h.button(finalizing,'Отменить').props.disabled,true,
  'a stuck finalization must never trap the user');
 const watchdog=h.pending(VOICE_FINALIZE_TIMEOUT_MS);
 assert.equal(watchdog.length,1);
 watchdog[0].fn();
 assert.equal(h.tracks[0].stopped,true,'microphone track must be released');
 assert.equal(h.recorded.length,0,'incomplete recording is never sent');
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/не завершил запись/);
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,0);
 assert.equal(h.button(h.render(),'Отменить'),null,'recording UI returns to idle');
});

test('manual cancel while finalizing suppresses late stop and watchdog callbacks',async()=>{
 const h=harness();
 await h.start();
 h.button(h.render(),'Готово').props.onClick();
 const timeout=h.pending(VOICE_FINALIZE_TIMEOUT_MS)[0].fn;
 h.button(h.render(),'Отменить').props.onClick();
 timeout(); // even a queued callback must not resurrect a canceled capture
 h.recorders[0].onstop?.();
 assert.equal(h.tracks[0].stopped,true);
 assert.equal(h.recorded.length,0);
 assert.deepEqual(h.errors,[]);
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,0);
});

test('successful synchronous onstop cancels watchdog and preserves recorded audio',async()=>{
 const h=harness({deliverStop:true});
 await h.start();
 h.button(h.render(),'Готово').props.onClick();
 assert.equal(h.recorded.length,1);
 assert.equal(h.recorded[0].type,'audio/webm');
 assert.equal(h.tracks[0].stopped,true);
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,0,
  'synchronous stop must not leave a timer that reports false failure');
 assert.deepEqual(h.errors,[]);
});

test('automatic two-minute stop uses the same guarded finalization path',async()=>{
 const h=harness();
 await h.start();
 const deadline=h.pending(VOICE_RECORD_MAX_MS);
 assert.equal(deadline.length,1);
 deadline[0].fn();
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,1);
 h.pending(VOICE_FINALIZE_TIMEOUT_MS)[0].fn();
 assert.equal(h.tracks[0].stopped,true);
 assert.equal(h.recorded.length,0);
});

test('missing MIME feature detection uses the browser default and still previews supported audio',async()=>{
 const h=harness({
  deliverStop:true,mimeDetection:'missing',
  defaultMimeType:'audio/mp4;codecs=mp4a.40.2'
 });
 await h.start();
 assert.equal(Object.hasOwn(h.recorders[0].options,'mimeType'),false,
  'do not force a guessed MIME when the browser must choose');
 h.button(h.render(),'Готово').props.onClick();
 assert.equal(h.recorded.length,1);
 assert.equal(h.recorded[0].type,'audio/mp4');
 assert.equal(h.recorded[0].name,'voice.m4a');
 assert.deepEqual(h.errors,[]);
});

test('a throwing MIME feature detector also falls back to the browser default',async()=>{
 const h=harness({
  deliverStop:true,mimeDetection:'throws',
  defaultMimeType:'audio/ogg;codecs=opus'
 });
 await h.start();
 assert.equal(Object.hasOwn(h.recorders[0].options,'mimeType'),false);
 h.button(h.render(),'Готово').props.onClick();
 assert.equal(h.recorded[0].type,'audio/ogg');
 assert.deepEqual(h.errors,[]);
});

test('an unsupported browser-default MIME is rejected before recording and releases the microphone',async()=>{
 const h=harness({mimeDetection:'missing',defaultMimeType:'video/webm',});
 await h.start({recording:false});
 assert.equal(h.tracks[0].stopped,true);
 assert.equal(h.recorded.length,0);
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/выбрал неподдерживаемый формат/);
 assert.equal(h.intervals.size,0);
 assert.equal(h.timers.size,0);
});


test('an unexpectedly ended microphone track cancels recording and releases all resources',async()=>{
 const h=harness();
 await h.start();
 h.tracks[0].end();
 assert.equal(h.tracks[0].stopped,true,'the ended microphone is fully released');
 assert.equal(h.recorded.length,0,'a truncated recording is never passed to preview');
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/микрофоном прервано/);
 assert.equal(h.button(h.render(),'Отменить'),null,'the composer returns to idle');
 assert.equal(h.timers.size,0,'the recording deadline is cleared');
 assert.equal(h.intervals.size,0,'the elapsed-time ticker is cleared');
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,0);
});

test('manual cancellation detaches the microphone-ended listener before late device events',async()=>{
 const h=harness();
 await h.start();
 h.button(h.render(),'Отменить').props.onClick();
 h.tracks[0].end();
 assert.equal(h.recorded.length,0);
 assert.deepEqual(h.errors,[],'a late device event after cancel must be ignored');
 assert.equal(h.button(h.render(),'Отменить'),null);
 assert.equal(h.timers.size,0);
 assert.equal(h.intervals.size,0);
});


test('backgrounding a recording cancels it, releases the mic and never resumes it',async()=>{
 const h=harness();
 await h.start();
 h.document.visibilityState='hidden';
 h.emitDocument('visibilitychange');
 assert.equal(h.tracks[0].stopped,true,'backgrounding releases the microphone');
 assert.equal(h.recorded.length,0,'a backgrounded recording is never sent to preview');
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/приложение перешло в фон/);
 assert.equal(h.timers.size,0);
 assert.equal(h.intervals.size,0);
 assert.equal(h.button(h.render(),'Отменить'),null,'the composer returns to idle');
 h.document.visibilityState='visible';
 h.emitDocument('visibilitychange');
 assert.ok(h.button(h.render(),'Готово')===null,'returning to the app does not resume the old recording');
 h.emitWindow('pagehide');
 assert.equal(h.errors.length,1,'pagehide after visibilitychange is ignored');
});

test('pagehide during finalization discards the incomplete recording and ignores late stop',async()=>{
 const h=harness();
 await h.start();
 h.button(h.render(),'Готово').props.onClick();
 assert.equal(h.pending(VOICE_FINALIZE_TIMEOUT_MS).length,1);
 h.emitWindow('pagehide');
 h.recorders[0].onstop?.();
 assert.equal(h.tracks[0].stopped,true);
 assert.equal(h.recorded.length,0,'navigation during finalization cannot expose a partial file');
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/приложение перешло в фон/);
 assert.equal(h.timers.size,0);
 assert.equal(h.intervals.size,0);
});



test('a permission prompt that never resolves is invalidated after a bounded wait',async()=>{
 let rejectPermission;
 const h=harness({
  getUserMedia:()=>new Promise((_,reject)=>{rejectPermission=reject;})
 });
 h.clickStart();
 await h.flush();
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,1);
 assert.equal(h.fireTimeout(VOICE_PERMISSION_TIMEOUT_MS),true);
 assert.equal(h.button(h.render(),'Отменить'),null,'a timed-out prompt returns the composer to idle');
 assert.equal(h.recorders.length,0);
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/занял слишком много времени/);
 assert.equal(h.timers.size,0);
 h.document.visibilityState='hidden';
 h.emitDocument('visibilitychange');
 assert.equal(h.errors.length,1,'an expired prompt no longer owns the recording session');
 rejectPermission?.(new Error('late permission denial'));
 await h.flush();
 assert.equal(h.errors.length,1,'a stale rejection is ignored');
});

test('a microphone stream granted after the permission deadline is immediately stopped',async()=>{
 let resolvePermission;
 const h=harness({
  getUserMedia:()=>new Promise(resolve=>{resolvePermission=resolve;})
 });
 const lateTrack={stopped:false,stop(){this.stopped=true;}};
 h.clickStart();
 await h.flush();
 assert.equal(h.fireTimeout(VOICE_PERMISSION_TIMEOUT_MS),true);
 resolvePermission({getTracks:()=>[lateTrack]});
 await h.flush();
 assert.equal(lateTrack.stopped,true,'late permission grants must release every track');
 assert.equal(h.recorders.length,0,'a stale permission grant never starts MediaRecorder');
 assert.equal(h.recorded.length,0);
 assert.equal(h.errors.length,1);
});

test('a stale permission rejection cannot clear a newer permission deadline',async()=>{
 const requests=[];
 const h=harness({
  getUserMedia:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))
 });
 h.clickStart();
 await h.flush();
 assert.equal(h.fireTimeout(VOICE_PERMISSION_TIMEOUT_MS),true);
 h.clickStart();
 await h.flush();
 assert.equal(requests.length,2);
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,1);
 requests[0].reject(new Error('late permission denial from first prompt'));
 await h.flush();
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,1,
  'the stale request must not clear the newer request timer');
 h.document.visibilityState='hidden';
 h.emitDocument('visibilitychange');
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,0,
  'background cleanup clears the current permission timer');
 assert.equal(h.errors.length,2);
 assert.match(h.errors[1],/приложение перешло в фон/);
});

test('a stale permission rejection cannot disable background cleanup for a newer microphone request',async()=>{
 const requests=[];
 const h=harness({
  getUserMedia:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))
 });

 // First permission prompt is canceled when the app enters the background.
 h.clickStart();
 await h.flush();
 assert.equal(requests.length,1);
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,1);
 h.document.visibilityState='hidden';
 h.emitDocument('visibilitychange');
 assert.equal(h.errors.length,1);
 assert.match(h.errors[0],/приложение перешло в фон/);
 assert.equal(h.pending(VOICE_PERMISSION_TIMEOUT_MS).length,0,'background cleanup clears the permission deadline');

 // A second request starts after returning to the app.
 h.document.visibilityState='visible';
 h.clickStart();
 await h.flush();
 assert.equal(requests.length,2);

 // The first, now-stale permission prompt rejects after the second began.
 requests[0].reject(new Error('late permission denial'));
 await h.flush();

 // Backgrounding must still cancel the second request. Resolving it late
 // must stop its stream rather than starting a recorder while the app is hidden.
 h.document.visibilityState='hidden';
 h.emitDocument('visibilitychange');
 assert.equal(h.errors.length,2,'the active second request is still registered as a session');
 assert.match(h.errors[1],/приложение перешло в фон/);

 requests[1].resolve({getTracks:()=>h.tracks});
 await h.flush();
 assert.equal(h.recorders.length,0,'a stale permission result must never start recording');
 assert.equal(h.tracks[0].stopped,true,'the late microphone stream must be released');
 assert.equal(h.timers.size,0);
 assert.equal(h.intervals.size,0);
});
