import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createChannelCommentsGate} from '../lib/channel-comments-gate.ts';

const panel=readFileSync(new URL('../components/ChannelsPanel.tsx',import.meta.url),'utf8');

test('a late response from another post cannot become the active comments thread',()=>{
 const gate=createChannelCommentsGate();
 const old=gate.begin('post-A');
 const current=gate.begin('post-B');
 assert.equal(gate.isCurrent(old),false);
 assert.equal(gate.isCurrent(current),true);
 gate.finish(old);
 assert.equal(gate.isLoading('post-B'),true,'old cleanup must not cancel new request');
 gate.finish(current);
 assert.equal(gate.isLoading('post-B'),false);
});

test('tapping the same thread while loading cancels its pending result',()=>{
 const gate=createChannelCommentsGate();
 const request=gate.begin('post-A');
 assert.equal(gate.isLoading('post-A'),true);
 gate.cancel();
 assert.equal(gate.isCurrent(request),false);
 assert.equal(gate.isLoading('post-A'),false);
 const reopened=gate.begin('post-A');
 assert.notEqual(reopened,request);
 assert.equal(gate.isCurrent(reopened),true);
});

test('channel or account navigation invalidates outstanding requests',()=>{
 const gate=createChannelCommentsGate();
 const old=gate.begin('post-A');
 gate.cancel();
 const next=gate.begin('post-B');
 assert.equal(gate.isCurrent(old),false);
 assert.equal(gate.isCurrent(next),true);
});

test('channel UI ignores stale comments, profile results and errors',()=>{
 assert.match(panel,/useRef\(createChannelCommentsGate\(\)\)/);
 assert.match(panel,/if\(openComments===postId\|\|gate\.isLoading\(postId\)\)/);
 assert.match(panel,/const requestId=gate\.begin\(postId\)/);
 assert.match(panel,/const list=await listPostComments\(token,postId\);\s*if\(!gate\.isCurrent\(requestId\)\)return;/);
 assert.match(panel,/const people=await listProfiles\(token,ids\);\s*if\(!gate\.isCurrent\(requestId\)\)return;/);
 assert.match(panel,/if\(gate\.isCurrent\(requestId\)\)setError\(readable\(e\)\)/);
 assert.match(panel,/finally\{gate\.finish\(requestId\);\}/);
 assert.match(panel,/return\(\)=>commentsGateRef\.current\.cancel\(\)/);
 assert.ok(panel.includes('setOpenComments(null);setComments([]);setAuthors({});setCommentDraft("");'));
});
