import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createChannelSendGate,isLatestChannelCommentRequest} from '../lib/channel-comment-request.ts';

const USER='11111111-1111-4111-8111-111111111111';
const CHANNEL='22222222-2222-4222-8222-222222222222';
const POST_A='33333333-3333-4333-8333-333333333333';
const POST_B='44444444-4444-4444-8444-444444444444';
const current=(overrides={})=>({
 requestId:7,latestRequestId:7,requestOwnerId:USER,activeOwnerId:USER,
 requestChannelId:CHANNEL,activeChannelId:CHANNEL,requestPostId:POST_A,activePostId:POST_A,
 ...overrides
});
const isCurrent=x=>isLatestChannelCommentRequest(
 x.requestId,x.latestRequestId,x.requestOwnerId,x.activeOwnerId,
 x.requestChannelId,x.activeChannelId,x.requestPostId,x.activePostId
);

test('accepts only the latest comment request for the same account, channel and post',()=>{
 assert.equal(isCurrent(current()),true);
});
test('rejects an older request after the user opens another post',()=>{
 assert.equal(isCurrent(current({requestId:6,latestRequestId:7,activePostId:POST_B})),false);
});
test('rejects results from a previous account or channel context',()=>{
 assert.equal(isCurrent(current({activeOwnerId:'55555555-5555-4555-8555-555555555555'})),false);
 assert.equal(isCurrent(current({activeChannelId:'55555555-5555-4555-8555-555555555555'})),false);
});
test('rejects a closed or changed comment panel',()=>{
 assert.equal(isCurrent(current({activePostId:null})),false);
 assert.equal(isCurrent(current({activePostId:POST_B})),false);
});
test('fails closed on invalid request counters and malformed identifiers',()=>{
 assert.equal(isCurrent(current({requestId:0})),false);
 assert.equal(isCurrent(current({requestId:1.5})),false);
 assert.equal(isCurrent(current({requestOwnerId:' '})),false);
 assert.equal(isCurrent(current({requestPostId:'not-an-id'})),false);
});

test('channel send gate rejects overlapping sends and permits a later send',()=>{
 const gate=createChannelSendGate();
 const first=gate.acquire();
 assert.equal(typeof first,'symbol');
 assert.equal(gate.acquire(),null);
 assert.equal(gate.release(first),true);
 const second=gate.acquire();
 assert.equal(typeof second,'symbol');
 assert.equal(gate.release(second),true);
});
test('an old send lease cannot release a newer active send',()=>{
 const gate=createChannelSendGate();
 const first=gate.acquire();
 assert.equal(gate.release(first),true);
 const second=gate.acquire();
 assert.equal(gate.release(first),false);
 assert.equal(gate.acquire(),null);
 assert.equal(gate.release(second),true);
 assert.equal(gate.acquire()!==null,true);
});

test('ChannelsPanel guards comment reads and synchronously gates send handlers',()=>{
 const panel=readFileSync(new URL('../components/ChannelsPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/commentRequestRef=useRef\(0\)/);
 assert.match(panel,/openCommentsRef=useRef<string\|null>\(null\)/);
 assert.match(panel,/isLatestChannelCommentRequest\(/);
 assert.match(panel,/if\(!isCurrentCommentRequest\(requestId,ownerId,channelId,postId\)\)return;/);
 assert.match(panel,/const lease=channelSendGateRef\.current\?\.acquire\(\);if\(!lease\)return;/);
 assert.match(panel,/release\(lease\);setBusy\(false\);/);
 assert.match(panel,/commentsLoading&&<p role="status"/);
});
