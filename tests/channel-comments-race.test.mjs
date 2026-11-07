import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequestEpoch} from '../lib/request-epoch.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('a newer channel comment request makes the earlier response stale',()=>{
 const requests=createRequestEpoch();
 const first=requests.begin();
 const second=requests.begin();
 assert.equal(requests.isCurrent(first),false);
 assert.equal(requests.isCurrent(second),true);
});

test('closing the comments panel or unmounting invalidates pending requests',()=>{
 const requests=createRequestEpoch();
 const pending=requests.begin();
 requests.invalidate();
 assert.equal(requests.isCurrent(pending),false);
 const next=requests.begin();
 assert.equal(requests.isCurrent(next),true);
 requests.invalidate();
 assert.equal(requests.isCurrent(next),false);
});

test('ChannelsPanel checks freshness after comments and profile awaits and ignores stale errors',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/const requestId=commentsRequestGuard\.begin\(\)/);
 assert.match(panel,/const list=await listPostComments\(token,postId\);\s*if\(!isCurrent\(\)\)return;/);
 assert.match(panel,/const people=await listProfiles\(token,ids\);\s*if\(!isCurrent\(\)\)return;/);
 assert.match(panel,/if\(isCurrent\(\)\)setError\(readable\(e\)\)/);
 assert.match(panel,/channelScopeRef\.current\.token===token/);
 assert.match(panel,/channelScopeRef\.current\.channelId===channel\.id/);
 assert.match(panel,/useEffect\(\(\)=>\(\)=>commentsRequestGuard\.invalidate\(\),\[commentsRequestGuard\]\)/);
});


test('channel post and reaction refreshes cannot commit after a newer request or channel switch',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/const postsRequestGuardRef=useRef/);
 assert.match(panel,/const requestId=postsRequestGuard\.begin\(\)/);
 assert.match(panel,/const list=await listChannelPosts\(token,channel\.id\);\s*if\(!isCurrent\(\)\)return false;/);
 assert.match(panel,/const nextReactions=await listPostReactions\(token,list\.map\(p=>p\.id\)\);\s*if\(!isCurrent\(\)\)return false;/);
 assert.match(panel,/setPosts\(list\);setReactions\(nextReactions\)/);
 assert.match(panel,/channelScopeRef\.current=\{token,channelId:channel\.id\}/);
 assert.match(panel,/if\(isCurrent\(\)\)throw e/);
});

test('discussion message and comment loads are scoped and stale failures do not reach the new channel',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/const discussionRequestGuardRef=useRef/);
 assert.match(panel,/const \[messages,replies\]=await Promise\.all\(\[listDiscussionMessages\(token,channel\.id\),listDiscussionComments\(token,channel\.id\)\]\)/);
 assert.match(panel,/if\(!isCurrent\(\)\)return false;\s*setDiscussionMessages\(messages\);setDiscussionComments\(replies\)/);
 assert.match(panel,/if\(isCurrent\(\)\)setError\(readable\(e\)\)/);
 assert.match(panel,/discussionRequestGuard\.invalidate\(\);setDiscussionOpen\(false\)/);
});

test('switching channel context clears the previous feed and discussion snapshots',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/setPosts\(\[\]\);setReactions\(\[\]\);setDiscussionMessages\(\[\]\);setDiscussionComments\(\[\]\);setDiscussionOpen\(false\)/);
 assert.match(panel,/postsRequestGuard\.invalidate\(\)/);
 assert.match(panel,/discussionRequestGuard\.invalidate\(\)/);
});
