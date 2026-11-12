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
 assert.match(panel,/useEffect\(\(\)=>\(\)=>\s*\{\s*commentsRequestGuard\.invalidate\(\);\s*postsRequestGuard\.invalidate\(\);\s*abortDiscussionRequest\(\);\s*\},\[commentsRequestGuard,postsRequestGuard,abortDiscussionRequest\]\)/);
 assert.match(panel,/const abortDiscussionRequest=useCallback\(\(\)=>\{[\s\S]*?discussionRequestGuard\.invalidate\(\);/);
});


test('channel post and reaction refreshes cannot commit after a newer request or channel switch',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/const postsRequestGuardRef=useRef/);
 assert.match(panel,/const requestId=postsRequestGuard\.begin\(\)/);
 assert.match(panel,/const list=await listChannelPosts\(token,channel\.id\);\s*if\(!isCurrent\(\)\)return false;/);
 assert.match(panel,/const nextReactions=await listPostReactions\(token,list\.map\(p=>p\.id\)\);\s*if\(!isCurrent\(\)\)return false;/);
 assert.match(panel,/setPosts\(list\);setReactions\(nextReactions\)/);
 assert.match(panel,/useLayoutEffect\(\(\)=>\{\s*\/\/ Publish only committed identity props; an abandoned concurrent render must not/);
 assert.match(panel,/channelScopeRef\.current=\{token,userId,channelId:channel\.id\}/);
 assert.match(panel,/if\(isCurrent\(\)\)throw e/);
});

test('unified discussion feed reads are channel-scoped, abortable and reject stale responses',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/const discussionRequestGuardRef=useRef/);
 assert.match(panel,/const loadDiscussion=useCallback\(async\(\)=>\{/);
 assert.match(panel,/const controller=new AbortController\(\);\s*discussionAbortRef\.current=controller;/);
 assert.match(panel,/const requestId=discussionRequestGuard\.begin\(\)/);
 assert.match(panel,/channelScopeRef\.current\.token===token/);
 assert.match(panel,/channelScopeRef\.current\.userId===userId/);
 assert.match(panel,/channelScopeRef\.current\.channelId===channel\.id/);
 assert.match(panel,/listDiscussionFeedPage\(token,channel\.id,undefined,controller\.signal\)/);
 assert.match(panel,/if\(!isCurrent\(\)\)return false;[\s\S]*?setDiscussionItems\(removeDiscussionComments\(removeDiscussionPostComments\(page\.items,deletedDiscussionPostsRef\.current\),deletedDiscussionCommentsRef\.current\)\);setDiscussionCursor\(page\.cursor\);setHasOlderDiscussion\(page\.hasMore\)/);
 assert.match(panel,/if\(isCurrent\(\)\)setDiscussionError\(readable\(e\)\)/);
 assert.match(panel,/listDiscussionFeedPage\(token,channel\.id,discussionCursor,controller\.signal\)/);
 assert.match(panel,/const visibleItems=removeDiscussionComments\(removeDiscussionPostComments\(page\.items,deletedDiscussionPostsRef\.current\),deletedDiscussionCommentsRef\.current\)/);
 assert.match(panel,/setDiscussionItems\(current=>mergeDiscussionFeedItems\(current,visibleItems\)\)/);
});

test('switching channel context clears the previous feed and discussion snapshots before paint',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/useLayoutEffect\(\(\)=>\{\s*\/\/ Publish only committed identity props/);
 assert.match(panel,/abortDiscussionRequest\(\);\s*setDiscussionOpen\(false\);\s*setDiscussionItems\(\[\]\);setDiscussionCursor\(null\);setHasOlderDiscussion\(false\)/);
 assert.match(panel,/setDiscussionLoading\(false\);setOlderDiscussionLoading\(false\);setDiscussionError\(""\);setOlderDiscussionError\(""\)/);
 assert.match(panel,/postsRequestGuard\.invalidate\(\)/);
 assert.match(panel,/commentsPostRef\.current=null/);
 assert.match(panel,/olderCommentsLoadingRef\.current=false/);
 assert.match(panel,/deletedDiscussionPostsRef\.current\.clear\(\);[\s\S]*?deletedDiscussionCommentsRef\.current\.clear\(\)/);
});



test('discussion refresh cannot resurrect locally deleted posts or comments',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/deletedDiscussionPostsRef\.current\.add\(p\.id\)/);
 assert.match(panel,/deletedDiscussionCommentsRef\.current\.add\(deletedId\)/);
 assert.match(panel,/setDiscussionItems\(current=>removeDiscussionPostComments\(current,deletedDiscussionPostsRef\.current\)\)/);
 assert.match(panel,/setDiscussionItems\(current=>removeDiscussionComments\(current,deletedDiscussionCommentsRef\.current\)\)/);
 assert.match(panel,/removeDiscussionComments\(removeDiscussionPostComments\(page\.items,deletedDiscussionPostsRef\.current\),deletedDiscussionCommentsRef\.current\)/);
});

test('ChannelsPanel publishes account and channel scope after commit and invalidates old reads before paint',()=>{
 const panel=read('components/ChannelsPanel.tsx');
 assert.match(panel,/useLayoutEffect/);
 assert.match(panel,/commentsRequestGuard\.invalidate\(\);[\s\S]*?postsRequestGuard\.invalidate\(\);/);
 assert.match(panel,/abortDiscussionRequest\(\)/);
 assert.match(panel,/const abortDiscussionRequest=useCallback\(\(\)=>\{[\s\S]*?discussionRequestGuard\.invalidate\(\);/);
 assert.match(panel,/commentsPostRef\.current=null/);
 assert.match(panel,/olderCommentsLoadingRef\.current=false/);
 assert.ok((panel.match(/channelScopeRef\.current\.userId===userId/g)||[]).length>=3);
 assert.doesNotMatch(panel,/const channelScopeRef=useRef\(\{token,userId,channelId:channel\.id\}\);\s*channelScopeRef\.current=/);
});
