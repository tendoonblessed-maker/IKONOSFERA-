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
