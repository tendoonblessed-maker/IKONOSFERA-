import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {collectPostgrestPages,parsePostgrestTotal} from '../lib/postgrest-pagination.mjs';

test('parses exact PostgREST totals and treats unknown totals as unknown',()=>{
  assert.equal(parsePostgrestTotal('0-99/240'),240);
  assert.equal(parsePostgrestTotal('*/0'),0);
  assert.equal(parsePostgrestTotal('0-99/*'),null);
  assert.equal(parsePostgrestTotal(null),null);
  assert.equal(parsePostgrestTotal('invalid'),null);
});

test('continues when the server returns fewer rows than the requested range',async()=>{
  const pages=[
    {rows:['a','b'],contentRange:'0-1/5'},
    {rows:['c','d'],contentRange:'2-3/5'},
    {rows:['e'],contentRange:'4-4/5'}
  ];
  const requests=[];
  const result=await collectPostgrestPages(async(offset,limit)=>{
    requests.push({offset,limit});
    return pages[requests.length-1];
  },{pageSize:3,maxPages:4});

  assert.deepEqual(result,['a','b','c','d','e']);
  assert.deepEqual(requests,[
    {offset:0,limit:3},
    {offset:2,limit:3},
    {offset:4,limit:3}
  ]);
});

test('stops on a short page when the server does not provide a total',async()=>{
  let calls=0;
  const result=await collectPostgrestPages(async()=>{
    calls+=1;
    return {rows:['one','two'],contentRange:'0-1/*'};
  },{pageSize:3});
  assert.deepEqual(result,['one','two']);
  assert.equal(calls,1);
});

test('does not silently return an incomplete list when Content-Range reports more rows',async()=>{
  let calls=0;
  await assert.rejects(
    collectPostgrestPages(async()=>{
      calls+=1;
      return calls===1
        ? {rows:['one','two'],contentRange:'0-1/5'}
        : {rows:[],contentRange:'2-1/5'};
    },{pageSize:3}),
    /pagination ended before the reported total/
  );
});

test('a broken endpoint cannot cause an unbounded pagination loop',async()=>{
  let calls=0;
  await assert.rejects(
    collectPostgrestPages(async(offset,limit)=>{
      calls+=1;
      return {rows:Array.from({length:limit},(_,i)=>offset+i),contentRange:'0-9/100'};
    },{pageSize:2,maxPages:2}),
    /exceeded the safe page limit/
  );
  assert.equal(calls,2);
});

test('saved contacts and blocked users use exact-count range pagination',()=>{
  const source=readFileSync(new URL('../lib/contacts.ts',import.meta.url),'utf8');
  assert.match(source,/import \{collectPostgrestPages\} from ["']@\/lib\/postgrest-pagination\.mjs["']/);
  assert.match(source,/"Range-Unit":"items"/);
  assert.match(source,/Range:`\$\{offset\}-\$\{offset\+limit-1\}`/);
  assert.match(source,/Prefer:"count=exact"/);
  assert.match(source,/collectPostgrestPages<T>/);
  assert.match(source,/listAllRows<ContactRow>/);
  assert.match(source,/listAllRows<BlockRow>/);
  assert.doesNotMatch(source,/limit=500/);
});
