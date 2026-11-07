import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {chunkUserActivityIds,USER_ACTIVITY_BATCH_SIZE} from '../lib/activity-batching.ts';

const uuid=(value:number)=>value.toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('activity IDs are fetched in bounded batches without truncating later contacts',()=>{
 const ids=Array.from({length:205},(_,index)=>uuid(index+1));
 const batches=chunkUserActivityIds(ids);
 assert.equal(USER_ACTIVITY_BATCH_SIZE,100);
 assert.deepEqual(batches.map(batch=>batch.length),[100,100,5]);
 assert.deepEqual(batches.flat(),ids);
});

test('activity batching filters invalid IDs and deduplicates UUIDs case-insensitively',()=>{
 const first=uuid(1);
 const second=uuid(2);
 const batches=chunkUserActivityIds([first,first.toUpperCase(),'not-a-uuid',second]);
 assert.deepEqual(batches,[[first,second]]);
});

test('activity batching returns no empty requests and caps caller batch sizes at the RPC limit',()=>{
 assert.deepEqual(chunkUserActivityIds([]),[]);
 assert.deepEqual(chunkUserActivityIds(['invalid']),[]);
 const ids=Array.from({length:205},(_,index)=>uuid(index+1));
 assert.deepEqual(chunkUserActivityIds(ids,500).map(batch=>batch.length),[100,100,5]);
 assert.deepEqual(chunkUserActivityIds(ids,0).map(batch=>batch.length),[100,100,5]);
});

test('activity API walks every bounded batch and the contacts tab does not stop at 60 people',()=>{
 const api=read('lib/activity.ts');
 const shell=read('components/AppShell.tsx');
 assert.match(api,/for\(const batch of batches\)/);
 assert.match(api,/p_user_ids:batch/);
 assert.match(api,/chunkUserActivityIds\(ids\)/);
 assert.doesNotMatch(api,/\.slice\(0,100\)/);
 const start=shell.indexOf("if(tab!=='contacts'||!session||!contactPeople.length)return;");
 const end=shell.indexOf("const active=rows.find",start);
 const effect=shell.slice(start,end);
 assert.match(effect,/getUserActivities\(session\.access_token,contactPeople\.map\(p=>p\.id\)\)/);
 assert.doesNotMatch(effect,/contactPeople\.slice\(0,60\)/);
});
