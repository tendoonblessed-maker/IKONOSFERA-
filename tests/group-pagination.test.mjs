import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const GROUP='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333';
const base={group_id:GROUP,sender_id:USER,body:'test'};
const stamp='2026-10-29T09:50:12.123456+00:00';
function row(id,created_at=stamp,extra={}){
 return {id,created_at,...base,...extra};
}
const id=(n)=>n.toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function setup(handler=()=>({ok:true,json:async()=>[]})){
 const source=read('lib/group-pagination.ts');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const calls=[];
 const exports={};
 const context={
  exports,URLSearchParams,URL,AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test'}},
  fetch:async(url,options)=>{
   calls.push({url,options});
   return handler(url,options,calls.length);
  },
  require(name){
   assert.equal(name,'@/lib/supabase-rest');
   return {apiUrl:'https://unit.test'};
  }
 };
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'group-pagination.cjs'});
 return {api:exports,calls};
}
const success=data=>({ok:true,json:async()=>data});

test('group history keyset cursor queries one group with timestamp + UUID tie breaker',()=>{
 const {api}=setup();
 const path=api.olderGroupMessagesPath(GROUP,row(id(5)));
 const url=new URL(path,'https://unit.test');
 assert.equal(url.pathname,'/rest/v1/group_messages');
 assert.equal(url.searchParams.get('group_id'),'eq.'+GROUP);
 assert.equal(url.searchParams.get('select'),'id,group_id,sender_id,body,created_at');
 assert.equal(url.searchParams.get('limit'),'71');
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('or'),
  '(created_at.lt.'+stamp+',and(created_at.eq.'+stamp+',id.lt.'+id(5)+'))');
});

test('cursor accepts valid 6-digit microsecond timestamps and rejects invalid filters',()=>{
 const {api}=setup();
 for(const timestamp of ['2026-10-29T09:50:12Z','2026-10-29T09:50:12.001Z',
  '2026-10-29T09:50:12.123456+00:00']){
  assert.doesNotThrow(()=>api.olderGroupMessagesPath(GROUP,row(id(1),timestamp)));
 }
 for(const timestamp of ['abc','2026-10-29T09:50:12Z,group_id.eq.'+OTHER,
  '2026-10-29T09:50:12.1234567Z','2026-10-29T09:50:12-foo']){
  assert.throws(()=>api.olderGroupMessagesPath(GROUP,row(id(1),timestamp)),/курсор/);
 }
 assert.throws(()=>api.olderGroupMessagesPath(OTHER+'x',row(id(1))),/курсор/);
 assert.throws(()=>api.olderGroupMessagesPath(GROUP,row('not-uuid')),/курсор/);
});

test('older page uses signed-in user JWT, strict no-store, bounded limit and server RLS',async()=>{
 const old=[row(id(4)),row(id(3)),row(id(2))];
 const {api,calls}=setup(()=>success(old));
 const page=await api.fetchOlderGroupMessages('signed-jwt',GROUP,row(id(5)));
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer signed-jwt');
 assert.equal(calls[0].options.headers.apikey,'public-test');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 assert.deepEqual(Array.from(page.messages,x=>x.id),[id(2),id(3),id(4)]);
 assert.equal(page.hasMore,false);
});

test('extra row establishes hasMore but never overlaps next page boundary',async()=>{
 const many=Array.from({length:71},(_,i)=>row(id(80-i)));
 const {api}=setup(()=>success(many));
 const page=await api.fetchOlderGroupMessages('jwt',GROUP,row(id(81)));
 assert.equal(page.messages.length,70);
 assert.equal(page.messages[0].id,id(11));
 assert.equal(page.messages.at(-1).id,id(80));
 assert.equal(page.hasMore,true);
 // 71st row id(10) is not shown. Next page queries below id(11).
 const nextUrl=new URL(api.olderGroupMessagesPath(GROUP,page.messages[0]),'https://unit.test');
 assert.ok(nextUrl.searchParams.get('or').includes('id.lt.'+id(11)));
});

test('return no foreign group rows even if a server response contains a stray row',async()=>{
 const {api}=setup(()=>success([row(id(3)),row(id(2),stamp,{group_id:OTHER})]));
 const page=await api.fetchOlderGroupMessages('jwt',GROUP,row(id(4)));
 assert.deepEqual(Array.from(page.messages,x=>x.id),[id(3)]);
});

test('cursor ordering handles identical milliseconds, microseconds and UUID ties',()=>{
 const {api}=setup();
 const rows=[
  row(id(4),'2026-10-29T08:00:00.000125Z'),
  row(id(3),'2026-10-29T08:00:00.000124Z'),
  row(id(2),'2026-10-29T08:00:00Z'),
  row(id(1),'2026-10-29T08:00:00.000125Z')
 ];
 const sorted=rows.sort(api.compareGroupMessages);
 assert.deepEqual(Array.from(sorted,x=>x.id),[id(2),id(3),id(1),id(4)]);
});

test('prepend new page deduplicates concurrent overlap and keeps updated current content',()=>{
 const {api}=setup();
 const original=[row(id(7),'2026-10-29T09:51:00Z'),row(id(8),'2026-10-29T09:52:00Z')];
 const older=[row(id(6),'2026-10-29T09:50:00Z'),row(id(7),'2026-10-29T09:51:00Z',{body:'stale'})];
 const merged=api.prependOlderGroupMessages(original,older);
 assert.deepEqual(Array.from(merged,x=>x.id),[id(6),id(7),id(8)]);
 assert.equal(merged[1].body,'test','latest page has priority over stale earlier fetch');
});

test('realtime latest page retains paged earlier messages but removes deleted latest rows',()=>{
 const {api}=setup();
 const earlier=row(id(1),'2026-10-29T09:00:00Z');
 const old=row(id(2),'2026-10-29T09:50:00Z',{body:'deleted on server'});
 const changed=row(id(3),'2026-10-29T09:51:00Z',{body:'edited'});
 const current=row(id(4),'2026-10-29T09:52:00Z');
 const merged=api.preserveOlderGroupMessages([earlier,old,changed], [row(id(3),changed.created_at,{body:'new edit'}),current]);
 assert.deepEqual(Array.from(merged,x=>x.id),[id(1),id(2),id(3),id(4)]);
 assert.equal(merged[2].body,'new edit');
 assert.deepEqual(Array.from(api.preserveOlderGroupMessages([earlier],[])),[]);
});

test('group pagination UI restores the history scroll anchor and avoids account crossover',()=>{
 const panel=read('components/GroupPanel.tsx');
 const css=read('app/globals.css');
 assert.match(panel,/fetchOlderGroupMessages\(requestToken,groupId,oldest\)/);
 assert.match(panel,/prependOlderGroupMessages\(current,page.messages\)/);
 assert.match(panel,/preserveOlderGroupMessages\(current,msgs\)/);
 assert.match(panel,/snapshot\.top\+growth/);
 assert.match(panel,/snapshot\.groupId!==group\.id\|\|snapshot\.userId!==userId/);
 assert.match(panel,/requestId!==olderRequestRef\.current/);
 assert.match(panel,/contextRef\.current\.userId!==ownerId/);
 assert.match(panel,/olderRequestRef\.current\+\+/);
 assert.match(panel,/area\.scrollTop<100/);
 assert.match(panel,/olderLoadingRef\.current\|\|!hasOlder/);
 assert.match(panel,/Показать более ранние сообщения/);
 assert.match(panel,/role="alert"/);
 assert.match(css,/\.ik-group-older-control button/);
});

test('paged history does not change message schema or database privileges',()=>{
 const groups=read('lib/groups.ts');
 const pagination=read('lib/group-pagination.ts');
 assert.match(groups,/order=created_at\.desc,id\.desc&limit=150/);
 assert.match(pagination,/const GROUP_/g);
 assert.doesNotMatch(pagination,/service_role|ALTER TABLE|GRANT |dangerouslySetInnerHTML/i);
});
