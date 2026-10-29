import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const API='https://example.supabase.co';
function socialClient(fetch){
 const source=readFileSync(new URL('../lib/social.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={};
 const context={exports,require(id){
  if(id==='@/lib/supabase-rest')return {apiUrl:API};
  throw Error('Unexpected module import: '+id);
 },process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key'}},fetch,
  Date,Math,Promise,JSON,encodeURIComponent,Error,Map,Set};
 vm.runInNewContext(compiled,context,{timeout:1000});
 return exports;
}
const successful=(body)=>({ok:true,status:200,json:async()=>body});

test('channel avatar remains available when channel list reloads',async()=>{
 const userId='01b96821-bd71-40d0-8b64-2a7f5e8e2391';
 const channelId='b11d8c04-23ce-4cff-856b-193ab4536021';
 const path=userId+'/a45d88d3-7dd3-4d34-88fa-7192966bb7e0.jpg';
 let record={id:channelId,owner_id:userId,title:'Комната',slug:'room',
  description:'',discussion_enabled:false,avatar_path:null,created_at:'2026-10-29T01:00:00Z'};
 const requests=[];
 const fetch=async(url,options)=>{
  const method=options?.method||'GET';
  requests.push({url,method,authorization:options?.headers?.Authorization});
  if(!String(url).startsWith(API+'/rest/v1/channels?'))throw Error('Unexpected endpoint '+url);
  if(method==='PATCH'){
   assert.equal(options.headers.Authorization,'Bearer example-user-token');
   record={...record,...JSON.parse(options.body)};
   return successful([{...record}]);
  }
  return successful([{...record}]);
 };
 const api=socialClient(fetch);
 const updated=await api.updateChannelAvatar('example-user-token',channelId,userId,path);
 assert.equal(updated.avatar_path,path);
 const listed=await api.listChannels('example-user-token');
 assert.equal(listed.length,1);
 assert.equal(listed[0].avatar_path,path);
 assert.equal(api.imageUrl(listed[0].avatar_path),
   API+'/storage/v1/object/public/ikonosfera-media/'+path);
 assert.equal(requests.length,2);
});

test('profile emoji and featured channel are persisted using authenticated PATCH',async()=>{
 const userId='01b96821-bd71-40d0-8b64-2a7f5e8e2391';
 const channelId='b11d8c04-23ce-4cff-856b-193ab4536021';
 let profile={id:userId,username:'tendo',display_name:'Tendo',
  bio:'',avatar_path:null,cover_path:null,featured_channel_id:null,status_emoji:null};
 const fetch=async(url,options)=>{
  const method=options?.method||'GET';
  if(!String(url).includes('/rest/v1/profiles?'))throw Error('Unexpected endpoint');
  if(method==='PATCH'){
   assert.equal(options.headers.Authorization,'Bearer example-user-token');
   profile={...profile,...JSON.parse(options.body)};
  }
  return successful([{...profile}]);
 };
 const api=socialClient(fetch);
 const pinned=await api.updateFullProfile('example-user-token',userId,{featured_channel_id:channelId});
 assert.equal(pinned.featured_channel_id,channelId);
 const emoji=await api.updateFullProfile('example-user-token',userId,{status_emoji:18});
 assert.equal(emoji.status_emoji,18);
 const refreshed=await api.getFullProfile('example-user-token',userId);
 assert.equal(refreshed.featured_channel_id,channelId);
 assert.equal(refreshed.status_emoji,18);
});
test('malformed image paths are rejected rather than shown as broken images',()=>{
 const api=socialClient(async()=>{throw Error('Should not fetch');});
 assert.equal(api.imageUrl('../../malicious.png'),null);
 assert.equal(api.imageUrl(null),null);
 assert.equal(api.imageUrl('x/not-a-supported.svg'),null);
});
