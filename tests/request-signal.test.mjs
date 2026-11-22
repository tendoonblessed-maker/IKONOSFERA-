import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/request-signal.js',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function loadHelper(){
 const exports={};
 vm.runInNewContext(compiled,{exports,AbortController,setTimeout,clearTimeout},{filename:'request-signal.cjs',timeout:1000});
 return exports.createRequestAbortSignal;
}
test('caller cancellation is forwarded and dispose is idempotent',()=>{
 const createRequestAbortSignal=loadHelper();
 const caller=new AbortController();
 const request=createRequestAbortSignal(caller.signal,1000);
 caller.abort();
 assert.equal(request.signal.aborted,true);
 assert.equal(request.signal.reason,caller.signal.reason);
 request.dispose();
 request.dispose();
});
test('an already-aborted caller signal aborts immediately',()=>{
 const createRequestAbortSignal=loadHelper();
 const caller=new AbortController();
 caller.abort();
 const request=createRequestAbortSignal(caller.signal,1000);
 assert.equal(request.signal.aborted,true);
 request.dispose();
});
test('request deadline aborts with a TimeoutError',async()=>{
 const createRequestAbortSignal=loadHelper();
 const request=createRequestAbortSignal(undefined,15);
 await new Promise(resolve=>request.signal.addEventListener('abort',resolve,{once:true}));
 assert.equal(request.signal.aborted,true);
 assert.equal(request.signal.reason?.name,'TimeoutError');
 request.dispose();
});
test('dispose prevents a later timeout',async()=>{
 const createRequestAbortSignal=loadHelper();
 const request=createRequestAbortSignal(undefined,25);
 request.dispose();
 await new Promise(resolve=>setTimeout(resolve,40));
 assert.equal(request.signal.aborted,false);
});
