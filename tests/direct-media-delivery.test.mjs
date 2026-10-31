import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const CHAT='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const file=()=>({type:'image/png',size:123,name:'photo.png'});
const ok=data=>({ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)});
const bad=(status,message)=>({ok:false,status,json:async()=>({message}),text:async()=>JSON.stringify({message})});

function setup(handler){
 const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={},calls=[];
 const context={
  exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://unit-test.invalid',
   NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},
  AbortSignal,crypto:{randomUUID},fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length,calls);
  }
 };
 vm.runInNewContext(compiled,context,{filename:'supabase-rest.cjs',timeout:2000});
 return {api:exports,calls};
}
const isUpload=call=>call.url.includes('/storage/v1/object/ikonosfera-direct-media/');
const isInfo=call=>call.url.includes('/storage/v1/object/info/authenticated/');
const isInsert=call=>call.url.includes('/rest/v1/messages?select=')&&call.options.method==='POST';
const isVerify=call=>call.url.includes('/rest/v1/messages?select=')&&call.options.method==='GET';
const payload=call=>JSON.parse(call.options.body);
const row=call=>({
 id:randomUUID(),chat_id:CHAT,sender_id:OWNER,body:payload(call).body,
 media_type:payload(call).media_type,media_path:payload(call).media_path,
 client_message_id:payload(call).client_message_id,read_at:null,
 created_at:'2026-10-31T10:00:00Z'
});
const meta=(upload,f)=>({
 name:upload.url.split('/storage/v1/object/ikonosfera-direct-media/')[1],
 bucket_id:'ikonosfera-direct-media',metadata:{size:f.size,mimetype:f.type}
});

test('normal media send writes exactly one private object and one keyed message',async()=>{
 const image=file();
 const {api,calls}=setup((url,options,n,all)=>{
  if(options.method==='POST'&&url.includes('/storage/'))return ok({});
  if(options.method==='POST'&&url.includes('/rest/v1/messages'))return ok([row(all.at(-1))]);
  throw Error('Unexpected request '+url);
 });
 const result=await api.sendDirectMedia('jwt',CHAT,OWNER,image,' Подпись ');
 assert.equal(result.body,'Подпись');
 assert.equal(calls.length,2);
 const upload=calls.find(isUpload),insert=calls.find(isInsert);
 assert.equal(upload.options.headers['x-upsert'],'false');
 assert.equal(upload.options.headers.Authorization,'Bearer jwt');
 assert.equal(insert.options.headers.Authorization,'Bearer jwt');
 assert.equal(payload(insert).client_message_id.length,36);
 assert.ok(payload(insert).media_path.startsWith(CHAT+'/'+OWNER+'/'));
 assert.equal(payload(insert).body,'Подпись');
 assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
});

test('lost DB POST response is recovered with one read-only scoped query; never DELETE uploaded image',async()=>{
 const image=file();
 let inserted;
 const {api,calls}=setup((url,options,n,all)=>{
  if(isUpload(all.at(-1)))return ok({});
  if(isInsert(all.at(-1))){inserted=row(all.at(-1));throw Error('response lost after commit');}
  if(isVerify(all.at(-1)))return ok([inserted]);
  throw Error('Unexpected request '+url);
 });
 const result=await api.sendDirectMedia('jwt',CHAT,OWNER,image,'Фото');
 assert.equal(result.id,inserted.id);
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isInsert).length,1);
 assert.equal(calls.filter(isVerify).length,1);
 assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
 const get=calls.find(isVerify);
 assert.ok(get.url.includes('chat_id=eq.'+CHAT));
 assert.ok(get.url.includes('sender_id=eq.'+OWNER));
 assert.ok(get.url.includes('client_message_id=eq.'+inserted.client_message_id));
});

test('manual retry reuses original media path and DB client ID without uploading twice',async()=>{
 const image=file();
 let firstPost,requestCount=0;
 const {api,calls}=setup((url,options,n,all)=>{
  const call=all.at(-1);
  if(isUpload(call))return ok({});
  if(isInsert(call)){
   requestCount++;
   if(requestCount===1){firstPost=payload(call);throw Error('timeout');}
   assert.equal(payload(call).client_message_id,firstPost.client_message_id);
   assert.equal(payload(call).media_path,firstPost.media_path);
   return ok([row(call)]);
  }
  if(isVerify(call))return ok([]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,image,''),/не подтверждена/);
 const confirmed=await api.sendDirectMedia('jwt',CHAT,OWNER,image,'');
 assert.equal(confirmed.client_message_id,firstPost.client_message_id);
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isInsert).length,2);
 assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
});

test('lost Storage POST response is recovered by validating private object metadata',async()=>{
 const image=file();let upload;
 const {api,calls}=setup((url,options,n,all)=>{
  const call=all.at(-1);
  if(isUpload(call)){upload=call;throw Error('lost upload response');}
  if(isInfo(call))return ok(meta(upload,image));
  if(isInsert(call))return ok([row(call)]);
  throw Error('Unexpected request '+url);
 });
 const sent=await api.sendDirectMedia('jwt',CHAT,OWNER,image,'');
 assert.equal(sent.media_path,meta(upload,image).name);
 assert.equal(calls.filter(isUpload).length,1);
 assert.equal(calls.filter(isInfo).length,1);
 assert.equal(calls.filter(isInsert).length,1);
 assert.equal(calls.find(isInfo).options.headers.Authorization,'Bearer jwt');
});

test('unknown upload, then duplicate-path response, requires verified metadata before INSERT',async()=>{
 const image=file();let uploadCount=0,firstUpload;
 const {api,calls}=setup((url,options,n,all)=>{
  const call=all.at(-1);
  if(isUpload(call)){
   uploadCount++;firstUpload??=call;
   if(uploadCount===1)throw Error('network down');
   return bad(409,'KeyAlreadyExists');
  }
  if(isInfo(call))return uploadCount===1?bad(503,'unreachable'):ok(meta(firstUpload,image));
  if(isInsert(call))return ok([row(call)]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,image,''));
 assert.equal(calls.filter(isInsert).length,0);
 await api.sendDirectMedia('jwt',CHAT,OWNER,image,'');
 assert.equal(calls.filter(isUpload).length,2);
 assert.equal(calls.filter(isInsert).length,1);
 assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
});

test('wrong Storage size or type must NOT lead to a DB insert',async()=>{
 for(const wrong of [{size:1000,mimetype:'image/png'},{size:123,mimetype:'video/mp4'}]){
  const image=file();let uploaded;
  const {api,calls}=setup((url,options,n,all)=>{
   const call=all.at(-1);
   if(isUpload(call)){uploaded=call;throw Error('timeout');}
   if(isInfo(call))return ok({...meta(uploaded,image),metadata:wrong});
   throw Error('A DB insert must not run');
  });
  await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,image,'Фото'),/не совпадает с предпросмотром/);
  assert.equal(calls.filter(isInsert).length,0);
 }
});

test('wrong canonical sender or media path cannot be acknowledged as success',async()=>{
 for(const property of ['sender_id','media_path','client_message_id','body']){
  const image=file();let last;
  const {api,calls}=setup((url,options,n,all)=>{
   const call=all.at(-1);
   if(isUpload(call))return ok({});
   if(isInsert(call)){
    const original=row(call);last=original;
    const incorrect={...original,[property]:property==='body'?'other':randomUUID()};
    return ok([incorrect]);
   }
   if(isVerify(call))return ok([]);
   throw Error('Unexpected request '+url);
  });
  await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,image,'Фото'),/именно этого вложения/);
  assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
 }
});

test('a 403 DB reject preserves the object and rejects without a hidden second POST',async()=>{
 const image=file();
 const {api,calls}=setup((url,options,n,all)=>{
  const call=all.at(-1);
  if(isUpload(call))return ok({});
  if(isInsert(call))return bad(403,'Forbidden');
  if(isVerify(call))return ok([]);
  throw Error('Unexpected request '+url);
 });
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,image,''),/Forbidden/);
 assert.equal(calls.filter(isInsert).length,1);
 assert.equal(calls.filter(x=>x.options.method==='DELETE').length,0);
});

test('changed caption or sender must not reuse old storage object or DB UUID',async()=>{
 const image=file(),ids=[],paths=[];
 const {api,calls}=setup((url,options,n,all)=>{
  const call=all.at(-1);
  if(isUpload(call))return ok({});
  if(isInsert(call)){
   ids.push(payload(call).client_message_id);
   paths.push(payload(call).media_path);
   return ok([row(call)]);
  }
  throw Error('Unexpected request '+url);
 });
 await api.sendDirectMedia('jwt',CHAT,OWNER,image,'A');
 await api.sendDirectMedia('jwt',CHAT,OWNER,image,'B');
 assert.notEqual(paths[0],paths[1]);
 assert.notEqual(ids[0],ids[1]);
 assert.equal(calls.filter(isUpload).length,2);
});

test('unsupported and empty files do not reach storage or database',async()=>{
 const {api,calls}=setup(()=>{throw Error('no network expected')});
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,{type:'application/x-msdownload',size:100},''),/Неподдерживаемый формат/);
 await assert.rejects(api.sendDirectMedia('jwt',CHAT,OWNER,{type:'image/png',size:0},''),/Размер вложения/);
 assert.equal(calls.length,0);
});
