import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {VOICE_FINALIZE_TIMEOUT_MS,VOICE_RECORD_MAX_MS} from '../lib/voice-notes.ts';

const source=readFileSync(new URL('../components/VoiceRecorder.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  jsx:ts.JsxEmit.ReactJSX}
}).outputText;

function harness({deliverStop=false}={}){
 const hooks=[];
 let hook=0;
 let nextTimer=1;
 const timers=new Map();
 const intervals=new Map();
 const errors=[];
 const recorded=[];
 const recorders=[];
 const tracks=[{stopped:false,stop(){this.stopped=true;}}];
 const stream={getTracks:()=>tracks};
 const schedule=(map)=>(fn,ms)=>{
  const id=nextTimer++;
  map.set(id,{fn,ms});
  return id;
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
  static isTypeSupported(type){return type==='audio/webm';}
  constructor(_stream,{mimeType}){
   this.state='inactive';
   this.mimeType=mimeType;
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
 const exports={};
 vm.runInNewContext(compiled,{
  exports,Blob,File,Date,console,
  navigator:{mediaDevices:{getUserMedia:async()=>stream}},
  MediaRecorder:FakeMediaRecorder,
  window:{
   setTimeout:schedule(timers),
   clearTimeout:id=>timers.delete(id),
   setInterval:schedule(intervals),
   clearInterval:id=>intervals.delete(id)
  },
  require(name){
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:Symbol.for('react.fragment')};
   if(name==='@/lib/voice-notes')return {
    VOICE_FINALIZE_TIMEOUT_MS,VOICE_RECORD_MAX_MS,VOICE_RECORD_MAX_BYTES:25*1024*1024,
    chooseVoiceMimeType:check=>check('audio/webm')?'audio/webm':null,
    formatVoiceTime:()=> '00:00',
    createVoiceFile:chunks=>new File(chunks,'voice.webm',{type:'audio/webm'})
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
 const start=async()=>{
  const trigger=find(render(),node=>node.props?.['aria-label']==='Записать голосовое сообщение');
  assert.ok(trigger);
  trigger.props.onClick();
  // getUserMedia() is asynchronous; flush its full promise chain before
  // asserting recorder construction, rather than assuming two microtasks.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(recorders.length,1,'recorder startup: '+errors.join(' | '));
  assert.equal(recorders[0].state,'recording');
 };
 return {render,button,pending,start,errors,recorded,tracks,recorders,timers,intervals};
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
