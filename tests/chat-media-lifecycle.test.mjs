import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const helperSource=readFileSync(new URL('../lib/chat-media-lifecycle.ts',import.meta.url),'utf8');
const componentSource=readFileSync(new URL('../components/ChatMedia.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(helperSource,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function load(){
 const exports={};
 vm.runInNewContext(compiled,{exports},{filename:'chat-media-lifecycle.cjs',timeout:2000});
 return exports;
}

test('detaching a private audio or video player pauses playback immediately',()=>{
 const {pauseChatMediaOnDetach}=load();
 let pauses=0;
 pauseChatMediaOnDetach({pause(){pauses++;}});
 assert.equal(pauses,1);
});

test('media cleanup tolerates missing elements and browser disposal errors',()=>{
 const {pauseChatMediaOnDetach}=load();
 assert.doesNotThrow(()=>pauseChatMediaOnDetach(null));
 assert.doesNotThrow(()=>pauseChatMediaOnDetach(undefined));
 assert.doesNotThrow(()=>pauseChatMediaOnDetach({pause(){throw Error('already disposed');}}));
});

test('ChatMedia attaches both native players to the detach cleanup callback',()=>{
 assert.match(componentSource,/const mediaElementRef=useRef<HTMLMediaElement\|null>\(null\)/);
 assert.match(componentSource,/const bindMediaElement=useCallback\(/);
 assert.match(componentSource,/pauseChatMediaOnDetach\(mediaElementRef\.current\)/);
 assert.equal((componentSource.match(/ref=\{bindMediaElement\}/g)||[]).length,2);
 assert.match(componentSource,/if\(type==='video'\)return <video ref=\{bindMediaElement\}/);
 assert.match(componentSource,/if\(type==='audio'\)return <audio ref=\{bindMediaElement\}/);
});

test('backgrounding a tab pauses private chat playback but returning does not autoplay',()=>{
 const {watchChatMediaPageLifecycle}=load();
 const listeners=new Map();
 const doc={
  visibilityState:'visible',
  addEventListener(type,listener){listeners.set('doc:'+type,listener);},
  removeEventListener(type,listener){if(listeners.get('doc:'+type)===listener)listeners.delete('doc:'+type);}
 };
 const win={
  addEventListener(type,listener){listeners.set('win:'+type,listener);},
  removeEventListener(type,listener){if(listeners.get('win:'+type)===listener)listeners.delete('win:'+type);}
 };
 let pauses=0;
 const cleanup=watchChatMediaPageLifecycle({pause(){pauses++;}},doc,win);
 doc.visibilityState='hidden';
 listeners.get('doc:visibilitychange')();
 assert.equal(pauses,1);
 doc.visibilityState='visible';
 listeners.get('doc:visibilitychange')();
 assert.equal(pauses,1);
 cleanup();
 assert.equal(listeners.size,0);
});

test('pagehide stops playback even when visibilitychange is not delivered',()=>{
 const {watchChatMediaPageLifecycle}=load();
 let pageHide;
 const doc={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 const win={addEventListener(type,listener){if(type==='pagehide')pageHide=listener;},removeEventListener(){}};
 let pauses=0;
 watchChatMediaPageLifecycle({pause(){pauses++;}},doc,win);
 pageHide();
 assert.equal(pauses,1);
});

test('page lifecycle watcher safely ignores a missing player',()=>{
 const {watchChatMediaPageLifecycle}=load();
 assert.doesNotThrow(()=>watchChatMediaPageLifecycle(null,{visibilityState:'visible',addEventListener(){},removeEventListener(){}},{addEventListener(){},removeEventListener(){}}));
});

test('ChatMedia pauses its player on page hide and removes lifecycle listeners on detach',()=>{
 assert.match(componentSource,/watchChatMediaPageLifecycle\(element,document,window\)/);
 assert.match(componentSource,/mediaLifecycleCleanupRef\.current\?\.\(\)/);
 assert.match(componentSource,/mediaLifecycleCleanupRef\.current=null/);
});
