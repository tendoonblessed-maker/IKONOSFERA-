import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(sourceFile,bindings={}){
  const source=readFileSync(new URL('../'+sourceFile,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const result={};
  const context={exports:result,process:{env:{
    NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'
  }},Date,Promise,Math,JSON,URLSearchParams,AbortSignal,Error,Map,Set,...bindings};
  vm.runInNewContext(compiled,context,{timeout:1000});
  return result;
}

const key='ikonosfera-session-v1';
function sessionEnvironment(fetch){
 const records=new Map([[key,JSON.stringify({
   access_token:'expired-access-token',refresh_token:'saved-refresh-token',expires_at:Math.floor(Date.now()/1000)-60
 })]]);
 const localStorage={
   getItem(name){return records.get(name)??null;},
   setItem(name,value){records.set(name,String(value));},
   removeItem(name){records.delete(name);}
 };
 const client=compile('lib/supabase-rest.ts',{window:{},localStorage,fetch});
 return {client,records};
}

test('expired session is retained when the network is down, then refreshes successfully',async()=>{
 let online=false,requests=0;
 const fetch=async()=>{
   requests++;
   if(!online)throw new Error('offline');
   return {ok:true,status:200,text:async()=>JSON.stringify({
     access_token:'new-access-token',refresh_token:'new-refresh-token',expires_in:3600
   })};
 };
 const {client,records}=sessionEnvironment(fetch);
 await assert.rejects(client.validSession(),/offline/);
 assert.ok(records.get(key)?.includes('saved-refresh-token'));
 online=true;
 const session=await client.validSession();
 assert.equal(session.access_token,'new-access-token');
 assert.equal(session.refresh_token,'new-refresh-token');
 assert.equal(requests,2);
});

test('concurrent authentication checks exchange the refresh token only once',async()=>{
 let requests=0;
 const {client}=sessionEnvironment(async()=>{
   requests++;
   await Promise.resolve();
   return {ok:true,status:200,text:async()=>JSON.stringify({
     access_token:'refreshed',refresh_token:'rotated',expires_in:3600
   })};
 });
 const [a,b,c]=await Promise.all([client.validSession(),client.validSession(),client.validSession()]);
 assert.equal(requests,1);
 assert.equal(a.access_token,'refreshed');
 assert.equal(b.refresh_token,'rotated');
 assert.equal(c.refresh_token,'rotated');
});

test('explicit invalid refresh token removes the revoked session',async()=>{
 const {client,records}=sessionEnvironment(async()=>({
   ok:false,status:400,text:async()=>JSON.stringify({message:'Invalid Refresh Token'})
 }));
 const value=await client.validSession();
 assert.equal(value,null);
 assert.equal(records.has(key),false);
});

test('direct chat history merges recent pages and avoids duplicates',()=>{
 const {mergeRecentPage,prependEarlierPage}=compile('lib/chat-history.ts');
 const msg=(id,time,body)=>({id:id.toString().padStart(4,'0'),created_at:'2026-10-29T12:00:'+time.toString().padStart(2,'0')+'Z',body});
 const old=msg(1,1,'one'),second=msg(2,2,'old-version'),third=msg(3,3,'three');
 const refreshedSecond=msg(2,2,'edited');
 const merged=mergeRecentPage([old,second],[refreshedSecond,third],2);
 assert.deepEqual(Array.from(merged,m=>m.id),['0001','0002','0003']);
 assert.equal(merged[1].body,'edited');
 const earlier=msg(0,0,'zero');
 const extended=prependEarlierPage(merged,[earlier,old]);
 assert.deepEqual(Array.from(extended,m=>m.id),['0000','0001','0002','0003']);
 assert.equal(extended[1].body,'one');
 assert.deepEqual(Array.from(mergeRecentPage(extended,[third],2),m=>m.id),['0003']);
});
