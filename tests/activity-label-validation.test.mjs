import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {activityLabel} from '../lib/activity-label.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=new Date(2026,10,18,15,0,0);
const activity=(status,last_seen_at=null)=>({user_id:'00000000-0000-4000-8000-000000000001',status,last_seen_at});

test('known approximate activity labels are preserved without exposing timestamps',()=>{
 for(const status of ['в сети','был недавно','был на этой неделе','был в этом году','был давно'])
  assert.equal(activityLabel(activity(status,'2026-11-18T14:00:00Z'),now),status);
});

test('exact activity formats today, yesterday and older timestamps',()=>{
 const today=new Date(2026,10,18,10,30).toISOString();
 const yesterday=new Date(2026,10,17,10,30).toISOString();
 const older=new Date(2026,9,10,10,30).toISOString();
 assert.match(activityLabel(activity('exact',today),now),/^был сегодня в /);
 assert.match(activityLabel(activity('exact',yesterday),now),/^был вчера в /);
 assert.match(activityLabel(activity('exact',older),now),/^был /);
});

test('unknown or malformed RPC statuses fail closed to the generic label',()=>{
 for(const value of [null,undefined,[],{},'в сети',activity('EXACT','2026-11-18T14:00:00Z'),activity('custom server text'),activity('exact',null),activity('exact',123),activity('approximate')])
  assert.equal(activityLabel(value,now),'был давно');
});

test('invalid and implausibly future exact timestamps are not rendered',()=>{
 assert.equal(activityLabel(activity('exact','not-a-date'),now),'был давно');
 assert.equal(activityLabel(activity('exact',new Date(now.getTime()+6*60*1000).toISOString()),now),'был давно');
 assert.match(activityLabel(activity('exact',new Date(now.getTime()+4*60*1000).toISOString()),now),/^был сегодня в /);
});

test('activity API re-exports the hardened label helper',()=>{
 const source=load('lib/activity.ts');
 assert.match(source,/export \{activityLabel\} from '\.\/activity-label';/);
 assert.match(source,/export type \{UserActivity\} from '\.\/activity-label';/);
 assert.match(source,/import \{type UserActivity\} from '\.\/activity-label';/);
});
