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
 assert.match(panel,/const list=await listPostComments\(token,postId\);\s*if\(!commentsRequestGuard\.isCurrent\(requestId\)\)return;/);
 assert.match(panel,/const people=await listProfiles\(token,ids\);\s*if\(!commentsRequestGuard\.isCurrent\(requestId\)\)return;/);
 assert.match(panel,/if\(commentsRequestGuard\.isCurrent\(requestId\)\)setError\(readable\(e\)\)/);
 assert.match(panel,/useEffect\(\(\)=>\(\)=>commentsRequestGuard\.invalidate\(\),\[commentsRequestGuard\]\)/);
});
