import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const SOURCE=readFileSync(new URL('../lib/groups.ts',import.meta.url),'utf8');
const COMPILED=ts.transpileModule(SOURCE,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;

function createHarness(){
 const calls=[];
 const timeouts=[];
 const signals=[];
 const exports={};
 const fakeFetch=async(url,options)=>{
  calls.push({url,options});
  return {
   ok:true,
   json:async()=>url.endsWith('/rpc/create_group_chat')?'group-id':[]
  };
 };
 vm.runInNewContext(COMPILED,{
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key'}},
  Promise,Error,JSON,encodeURIComponent,
  AbortSignal:{
   timeout(milliseconds){
    const signal={timeout:milliseconds,aborted:false};
    timeouts.push(milliseconds);
    signals.push(signal);
    return signal;
   }
  },
  fetch:fakeFetch,
  require(specifier){
   if(specifier==='@/lib/supabase-rest')return {apiUrl:'https://supabase.test'};
   throw new Error('Unexpected module: '+specifier);
  }
 },{timeout:1000,filename:'lib/groups.ts'});
 return {api:exports,calls,timeouts,signals};
}

test('read-only group overview RPC has an explicit 18-second deadline',async()=>{
 const h=createHarness();
 const result=await h.api.listGroupOverviews('user-jwt');
 assert.deepEqual(result,[]);
 assert.equal(h.calls.length,1);
 const {url,options}=h.calls[0];
 assert.equal(url,'https://supabase.test/rest/v1/rpc/list_group_overviews');
 assert.equal(options.method,'POST');
 assert.equal(options.signal,h.signals[0]);
 assert.equal(options.signal.timeout,18_000);
 assert.deepEqual(h.timeouts,[18_000]);
 assert.equal(options.cache,'no-store');
 assert.equal(options.headers.Authorization,'Bearer user-jwt');
 assert.equal(options.headers.apikey,'test-anon-key');
});

test('ordinary group list GET keeps the existing bounded read behavior',async()=>{
 const h=createHarness();
 await h.api.listGroups('user-jwt');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].options.method,'GET');
 assert.equal(h.calls[0].options.signal,h.signals[0]);
 assert.deepEqual(h.timeouts,[18_000]);
});

test('non-idempotent group creation is not given an automatic abort deadline',async()=>{
 const h=createHarness();
 const result=await h.api.createGroup('user-jwt','Test group',[]);
 assert.equal(result,'group-id');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].options.method,'POST');
 assert.equal(h.calls[0].options.signal,undefined);
 assert.deepEqual(h.timeouts,[]);
});
