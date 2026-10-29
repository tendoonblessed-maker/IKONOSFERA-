import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const GROUP='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const OWNER='33333333-3333-4333-8333-333333333333';
const ROW={id:'44444444-4444-4444-8444-444444444444',group_id:GROUP,sender_id:OWNER,body:'Текст из архива',created_at:'2026-10-29T08:00:00.000Z'};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function setup(handler=()=>({ok:true,json:async()=>[]})){
 const source=read('lib/group-search.ts');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const calls=[];
 const exports={};
 const ctx={
  exports,URLSearchParams,URL,AbortSignal,
  process:{env:{NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon'}},
  fetch:async(url,options)=>{calls.push({url,options});return handler(url,options,calls.length);},
  require(name){
   assert.equal(name,'./supabase-rest');
   return {apiUrl:'https://test.invalid'};
  }
 };
 vm.runInNewContext(compiled,ctx,{filename:'group-search.cjs',timeout:2500});
 return {api:exports,calls};
}
const result=data=>({ok:true,json:async()=>data});
const params=url=>new URL(url,'https://test.invalid').searchParams;

test('group search queries ONLY requested group, with RLS token and bounded pagination',async()=>{
 const {api,calls}=setup(()=>result([ROW]));
 const rows=await api.searchGroupMessages('user-jwt',GROUP,'привет',0);
 assert.equal(rows[0].id,ROW.id);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'GET');
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-jwt');
 assert.equal(calls[0].options.headers.apikey,'test-anon');
 assert.equal(calls[0].options.cache,'no-store');
 assert.ok(calls[0].options.signal instanceof AbortSignal);
 const url=new URL(calls[0].url);
 assert.equal(url.pathname,'/rest/v1/group_messages');
 assert.equal(url.searchParams.get('group_id'),'eq.'+GROUP);
 assert.equal(url.searchParams.get('order'),'created_at.desc,id.desc');
 assert.equal(url.searchParams.get('limit'),'25');
 assert.equal(url.searchParams.get('offset'),'0');
 assert.ok(url.searchParams.get('body').includes('ilike.'));
});

test('search queries with quotes, commas and Unicode are quoted/encoded, not operators',()=>{
 const {api}=setup();
 const a=params(api.buildGroupSearchPath(GROUP,'  a.b, (текст) "кавычка"  ',24));
 assert.equal(a.get('group_id'),'eq.'+GROUP);
 assert.ok(a.get('body').startsWith('ilike."%'));
 assert.ok(a.get('body').includes('a.b, (текст)'));
 assert.ok(a.get('body').includes('\\"кавычка\\"'));
 assert.equal(a.get('limit'),'25');
 assert.equal(a.get('offset'),'24');
});

test('SQL wildcards are escaped instead of querying every message',()=>{
 const {api}=setup();
 assert.equal(api.normalizeGroupSearch('  два   слова  '),'два слова');
 const filter=params(api.buildGroupSearchPath(GROUP,'a_% test',0)).get('body');
 assert.ok(filter.includes('\\_'));
 assert.ok(filter.includes('\\%'));
 assert.throws(()=>api.buildGroupSearchPath(GROUP,'search*',0),/не поддерживается/);
});

test('reject short, invalid groups, and unbounded search pages before fetch',async()=>{
 const {api,calls}=setup();
 for(const [g,q,offset] of [
  [GROUP,'a',0],['not-a-uuid','abc',0],[GROUP,'abc',-1],
  [GROUP,'abc',1],[GROUP,'abc',504],[GROUP,'abc',Number.NaN]
 ]){
  assert.throws(()=>api.buildGroupSearchPath(g,q,offset));
 }
 assert.equal(calls.length,0);
});

test('context navigation refetches exact target with membership RLS and bounded adjacent rows',async()=>{
 const older={...ROW,id:'55555555-5555-4555-8555-555555555555',created_at:'2026-10-29T07:59:00.000Z'};
 const newer={...ROW,id:'66666666-6666-4666-8666-666666666666',created_at:'2026-10-29T08:01:00.000Z'};
 const {api,calls}=setup((url)=>{
  const p=params(url);
  if(p.get('id'))return result([ROW]);
  if(p.get('order')==='created_at.desc,id.desc')return result([ROW,older]);
  return result([ROW,newer]);
 });
 const list=await api.getGroupMessageContext('jwt',GROUP,ROW.id,ROW.created_at);
 assert.deepEqual(Array.from(list,x=>x.id),[older.id,ROW.id,newer.id]);
 assert.equal(calls.length,3);
 for(const call of calls){
  const p=params(call.url);
  assert.equal(p.get('group_id'),'eq.'+GROUP);
  assert.equal(call.options.headers.Authorization,'Bearer jwt');
  assert.ok(Number(p.get('limit'))<=70);
 }
});

test('context navigation rejects deleted or foreign message before fetching any timeline',async()=>{
 const {api,calls}=setup(()=>result([]));
 await assert.rejects(api.getGroupMessageContext('jwt',GROUP,ROW.id,ROW.created_at),/недоступно/);
 assert.equal(calls.length,1);
 await assert.rejects(api.getGroupMessageContext('jwt','bad',ROW.id,ROW.created_at),/Некорректное/);
});

test('search panel is account scoped, shows complete history results and never executes HTML',()=>{
 const ui=read('components/GroupSearchPanel.tsx');
 const panel=read('components/GroupPanel.tsx');
 const css=read('app/globals.css');
 assert.match(ui,/normalizeGroupSearch\(query\)/);
 assert.match(ui,/aria-label="Найти сообщение в группе"/);
 assert.match(ui,/onClick=\{\(\)=>onOpen\(message\)\}/);
 assert.match(ui,/onClick=\{onMore\}/);
 assert.match(ui,/onClick=\{onClose\}/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|innerHTML|service_role/);
 assert.match(panel,/searchGroupMessages\(token,group\.id,term,searchPage\*GROUP_SEARCH_PAGE_SIZE\)/);
 assert.match(panel,/contextRef\.current\.groupId!==requestGroup/);
 assert.match(panel,/contextRef\.current\.userId!==requestOwner/);
 assert.match(panel,/contextRef\.current\.token!==requestToken/);
 assert.match(panel,/getGroupMessageContext\(token,groupId,message\.id,message\.created_at\)/);
 assert.match(panel,/browsingOlderRef\.current=true/);
 assert.match(panel,/if\(cancelled\|\|document\.visibilityState==='hidden'\|\|!navigator\.onLine\|\|browsingOlderRef\.current\)return/);
 assert.match(panel,/data-group-message-id=\{m\.id\}/);
 assert.match(panel,/target\.getBoundingClientRect\(\)/);
 assert.doesNotMatch(panel,/scrollIntoView/);
 assert.match(css,/\.ik-group-search-bar input\{/);
 assert.match(css,/font-size:16px/);
});

test('older search results cannot silently count as read before latest page is rendered',()=>{
 const panel=read('components/GroupPanel.tsx');
 assert.match(panel,/if\(browsingOlderRef\.current\|\|!shouldAcknowledgeGroupRead/);
 assert.match(panel,/latestGroupMessageRef\.current=null/);
 assert.match(panel,/useLayoutEffect\(\(\)=>\{\n  const history=historyRef\.current;\n  if\(history&&followNewestRef\.current\)\{/);
 assert.match(panel,/acknowledgeLatestIfVisible\(\)/);
});

test('sending a new post from an archival result restores the current group timeline',()=>{
 const panel=read('components/GroupPanel.tsx');
 assert.match(panel,/if\(browsingOlderRef\.current\)\{\n     \/\/ Sending from an archived search result/);
 assert.match(panel,/browsingOlderRef\.current=false;\n     followNewestRef\.current=true;\n     latestGroupMessageRef\.current=null;/);
 assert.match(panel,/void refresh\(\)\.catch\(e=>setError/);
});
