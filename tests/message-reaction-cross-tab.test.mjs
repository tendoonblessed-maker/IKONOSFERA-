import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const UUID='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const EMOJI_A='👍🏻';
const EMOJI_B='🫶🏻';

function serialLocks(){
 const tails=new Map();
 const names=[];
 return {
  names,
  request(name,options,callback){
   names.push({name,options});
   const previous=tails.get(name)||Promise.resolve();
   let release;
   const hold=new Promise(resolve=>{release=resolve;});
   const tail=previous.then(()=>hold);
   tails.set(name,tail);
   return previous.then(callback).finally(()=>{
    release();
    if(tails.get(name)===tail)tails.delete(name);
   });
  }
 };
}

function setup({initialEmoji=null,locks,fetchOverride}={}){
 const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const calls=[];
 let currentEmoji=initialEmoji;
 const fetcher=fetchOverride||async(url,options)=>{
  calls.push({url,options});
  if(options.method==='GET'){
   return {ok:true,text:async()=>JSON.stringify(currentEmoji===null?[]:[{message_id:UUID,user_id:USER,emoji:currentEmoji}])};
  }
  if(options.method==='DELETE'){
   currentEmoji=null;
   return {ok:true,text:async()=>''};
  }
  if(options.method==='POST'){
   currentEmoji=JSON.parse(options.body).emoji;
   return {ok:true,text:async()=>''};
  }
  throw new Error('Unexpected HTTP method');
 };
 const context={
  exports,
  process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://supabase.unit.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-anon-test'}},
  fetch:async(url,options)=>{if(!fetchOverride)calls.push({url,options});return fetcher(url,options);},
  AbortSignal,
  ...(locks?{navigator:{locks}}:{})
 };
 vm.runInNewContext(compiled,context,{timeout:3000,filename:'supabase-rest.cjs'});
 return {api:exports,calls,get currentEmoji(){return currentEmoji;}};
}

test('reaction toggle reads the current row and removes only when the chosen emoji is already active',async()=>{
 const h=setup({initialEmoji:EMOJI_A,locks:serialLocks()});
 await h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_A);
 assert.equal(h.calls.length,2);
 assert.equal(h.calls[0].options.method,'GET');
 assert.match(h.calls[0].url,/select=message_id,user_id,emoji/);
 assert.match(h.calls[0].url,/message_id=eq\./);
 assert.match(h.calls[0].url,/user_id=eq\./);
 assert.equal(h.calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(h.calls[1].options.method,'DELETE');
 assert.equal(h.currentEmoji,null);
});

test('reaction toggle replaces a different emoji using the existing RLS DELETE then INSERT contract',async()=>{
 const h=setup({initialEmoji:EMOJI_A,locks:serialLocks()});
 await h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_B);
 assert.deepEqual(h.calls.map(call=>call.options.method),['GET','DELETE','POST']);
 assert.equal(JSON.parse(h.calls[2].options.body).message_id,UUID);
 assert.equal(JSON.parse(h.calls[2].options.body).user_id,USER);
 assert.equal(JSON.parse(h.calls[2].options.body).emoji,EMOJI_B);
 assert.equal(h.calls[2].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(h.currentEmoji,EMOJI_B);
});

test('two tabs serialize toggles and the second decision observes the first committed result',async()=>{
 const locks=serialLocks();
 const h=setup({initialEmoji:EMOJI_A,locks});
 await Promise.all([
  h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_B),
  h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_A)
 ]);
 assert.deepEqual(h.calls.map(call=>call.options.method),['GET','DELETE','POST','GET','DELETE','POST']);
 assert.equal(h.currentEmoji,EMOJI_A);
 assert.equal(locks.names.length,2);
 assert.equal(locks.names[0].name,locks.names[1].name);
 assert.equal(locks.names[0].options.mode,'exclusive');
});

test('a rejected Web Lock fails closed before any reaction request',async()=>{
 const locks={request:async()=>{throw new Error('lock unavailable');}};
 const h=setup({initialEmoji:EMOJI_A,locks});
 await assert.rejects(h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_B),/lock unavailable/);
 assert.equal(h.calls.length,0);
 assert.equal(h.currentEmoji,EMOJI_A);
});

test('browsers without Web Locks retain the existing authenticated reaction write path',async()=>{
 const h=setup({initialEmoji:null});
 await h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_B);
 assert.deepEqual(h.calls.map(call=>call.options.method),['GET','DELETE','POST']);
 assert.equal(h.currentEmoji,EMOJI_B);
});

test('an unexpected current-reaction row fails closed before DELETE or INSERT',async()=>{
 const bad=async(_url,options)=>{
  return {ok:true,text:async()=>JSON.stringify([{message_id:UUID,user_id:'33333333-3333-4333-8333-333333333333',emoji:EMOJI_A}])};
 };
 const h=setup({locks:serialLocks(),fetchOverride:bad});
 await assert.rejects(h.api.toggleMessageReaction('signed-jwt',USER,UUID,EMOJI_B),/Не удалось проверить текущую реакцию/);
 assert.equal(h.calls.length,0);
});

test('the existing schema has the per-message per-user primary key used by the lock scope',()=>{
 const schema=readFileSync(new URL('../supabase/migrations/20261028_180000_reactions.sql',import.meta.url),'utf8');
 assert.match(schema,/primary key\s*\(message_id,user_id\)/i);
});
