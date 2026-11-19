import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
 buildPostgrestCursorFilter,
 collectPostgrestKeysetPages,
 parsePostgrestContentRange
} from '../lib/postgrest-pagination.mjs';

const ID_1='11111111-1111-4111-8111-111111111111';
const ID_2='22222222-2222-4222-8222-222222222222';
const ID_3='33333333-3333-4333-8333-333333333333';
const stamp='2026-11-09T12:00:00.123456+00:00';
const row=(id,created_at=stamp)=>({contact_id:id,created_at});
const cursorOf=value=>({created_at:value.created_at,id:value.contact_id});

test('parses exact PostgREST ranges and accepts an empty zero-total range',()=>{
 assert.deepEqual(parsePostgrestContentRange('0-49/240'),{start:0,end:49,total:240});
 assert.deepEqual(parsePostgrestContentRange('*/0'),{start:null,end:null,total:0});
 assert.deepEqual(parsePostgrestContentRange('0-49/*'),{start:0,end:49,total:null});
 assert.throws(()=>parsePostgrestContentRange('0-x/10'),/invalid Content-Range/);
 assert.throws(()=>parsePostgrestContentRange('4-2/10'),/invalid Content-Range interval/);
});

test('builds a composite keyset predicate and preserves it through URL encoding',()=>{
 const cursor={created_at:stamp,id:ID_1};
 const filter=buildPostgrestCursorFilter(cursor,'contact_id');
 assert.equal(filter,'(created_at.lt.'+stamp+',and(created_at.eq.'+stamp+',contact_id.gt.'+ID_1+'))');
 const params=new URLSearchParams({or:filter});
 assert.equal(params.get('or'),filter);
 assert.equal(buildPostgrestCursorFilter(null,'blocked_id'),null);
});

test('rejects unsafe cursor columns, malformed timestamps and malformed IDs',()=>{
 assert.throws(()=>buildPostgrestCursorFilter({created_at:stamp,id:ID_1},'owner_id'),/unsupported ID column/);
 assert.throws(()=>buildPostgrestCursorFilter({created_at:'yesterday',id:ID_1},'contact_id'),/cursor is invalid/);
 assert.throws(()=>buildPostgrestCursorFilter({created_at:stamp,id:'not-a-uuid'},'blocked_id'),/cursor is invalid/);
});

test('continues keyset pagination when server max-rows returns short pages',async()=>{
 const pages=[
  {rows:[row(ID_1)],contentRange:'0-0/3'},
  {rows:[row(ID_2)],contentRange:'0-0/2'},
  {rows:[row(ID_3)],contentRange:'0-0/1'}
 ];
 const requests=[];
 const result=await collectPostgrestKeysetPages(async(cursor,limit)=>{
  requests.push({cursor,limit});
  return pages[requests.length-1];
 },cursorOf,{pageSize:2,maxPages:4});
 assert.deepEqual(result.map(value=>value.contact_id),[ID_1,ID_2,ID_3]);
 assert.deepEqual(requests,[
  {cursor:null,limit:2},
  {cursor:{created_at:stamp,id:ID_1},limit:2},
  {cursor:{created_at:stamp,id:ID_2},limit:2}
 ]);
});

test('accepts an empty list only when PostgREST reports zero remaining rows',async()=>{
 const result=await collectPostgrestKeysetPages(async()=>({rows:[],contentRange:'*/0'}),cursorOf);
 assert.deepEqual(result,[]);
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[],contentRange:'*/3'}),cursorOf),/stopped before the remaining rows/);
});

test('fails closed when exact Content-Range metadata is missing or unknown',async()=>{
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[row(ID_1)],contentRange:null}),cursorOf),/omitted Content-Range/);
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[row(ID_1)],contentRange:'0-0/*'}),cursorOf),/omitted an exact total/);
});

test('rejects repeated rows instead of looping on a server that ignores the cursor',async()=>{
 let calls=0;
 await assert.rejects(collectPostgrestKeysetPages(async()=>{
  calls+=1;
  return {rows:[row(ID_1)],contentRange:'0-0/2'};
 },cursorOf,{pageSize:1}),/repeated a row/);
 assert.equal(calls,2);
});

test('rejects malformed ranges, mismatched lengths and oversized responses',async()=>{
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[row(ID_1)],contentRange:'0-1/2'}),cursorOf),/does not match the page length/);
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[row(ID_1)],contentRange:'1-1/2'}),cursorOf),/did not start at the first remaining row/);
 await assert.rejects(collectPostgrestKeysetPages(async()=>({rows:[row(ID_1),row(ID_2)],contentRange:'0-1/2'}),cursorOf,{pageSize:1}),/invalid page/);
});

test('enforces a finite page limit even if the server keeps reporting remaining rows',async()=>{
 let calls=0;
 await assert.rejects(collectPostgrestKeysetPages(async()=>{
  calls+=1;
  return {rows:[row(calls===1?ID_1:ID_2)],contentRange:'0-0/3'};
 },cursorOf,{pageSize:1,maxPages:2}),/exceeded the safe page limit/);
 assert.equal(calls,2);
});

test('saved contacts and blocked users use created_at plus their own stable ID cursor',()=>{
 const source=readFileSync(new URL('../lib/contacts.ts',import.meta.url),'utf8');
 assert.match(source,/collectPostgrestKeysetPages/);
 assert.match(source,/buildPostgrestCursorFilter\(cursor,idColumn\)/);
 assert.match(source,/Prefer:"count=exact"/);
 assert.ok(source.includes('order:"created_at.desc,"+idColumn+".asc"'));
 assert.match(source,/listAllRows<ContactRow>\("user_contacts","contact_id"/);
 assert.match(source,/listAllRows<BlockRow>\("user_blocks","blocked_id"/);
 assert.doesNotMatch(source,/Range-Unit/);
 assert.doesNotMatch(source,/limit=500/);
});


test('rejects pages that violate created_at DESC and ID ASC ordering at microsecond precision',async()=>{
 const newer=row(ID_2,'2026-11-09T12:00:00.123456+00:00');
 const older=row(ID_1,'2026-11-09T12:00:00.123455+00:00');
 const valid=await collectPostgrestKeysetPages(async()=>({
  rows:[newer,older],contentRange:'0-1/2'
 }),cursorOf);
 assert.deepEqual(valid.map(value=>value.contact_id),[ID_2,ID_1]);
 await assert.rejects(collectPostgrestKeysetPages(async()=>({
  rows:[older,newer],contentRange:'0-1/2'
 }),cursorOf),/outside the requested keyset order/);
});

test('rejects a next page that moves backwards within an equal-timestamp UUID tie-break',async()=>{
 let calls=0;
 await assert.rejects(collectPostgrestKeysetPages(async()=>{
  calls+=1;
  return calls===1
   ?{rows:[row(ID_2)],contentRange:'0-0/2'}
   :{rows:[row(ID_1)],contentRange:'0-0/1'};
 },cursorOf,{pageSize:1}),/outside the requested keyset order/);
 assert.equal(calls,2);
});
