import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scopedProfileActivity} from '../lib/profile-activity-scope.ts';

const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER_OWNER='22222222-2222-4222-8222-222222222222';
const PROFILE='33333333-3333-4333-8333-333333333333';
const OTHER_PROFILE='44444444-4444-4444-8444-444444444444';

test('profile activity is visible only for the matching account and target profile',()=>{
 const activity={user_id:PROFILE,status:'в сети',last_seen_at:null};
 const snapshot={ownerId:OWNER,targetId:PROFILE,value:activity};
 assert.equal(scopedProfileActivity(snapshot,OWNER,PROFILE),activity);
 assert.equal(scopedProfileActivity(snapshot,OTHER_OWNER,PROFILE),null);
 assert.equal(scopedProfileActivity(snapshot,OWNER,OTHER_PROFILE),null);
});

test('a missing or empty activity snapshot never reuses a previous profile status',()=>{
 assert.equal(scopedProfileActivity(null,OWNER,PROFILE),null);
 assert.equal(scopedProfileActivity({ownerId:OWNER,targetId:PROFILE,value:null},OWNER,PROFILE),null);
 assert.equal(scopedProfileActivity({ownerId:OWNER,targetId:PROFILE,value:{status:'в сети'}},'',PROFILE),null);
 assert.equal(scopedProfileActivity({ownerId:OWNER,targetId:PROFILE,value:{status:'в сети'}},OWNER,''),null);
});
