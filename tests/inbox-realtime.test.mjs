import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isLatestAccountSnapshot} from '../lib/inbox-snapshot.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';

test('a stale HTTP snapshot cannot overwrite a newer Realtime inbox refresh',()=>{
 assert.equal(isLatestAccountSnapshot(10,11,OWNER,OWNER),false);
 assert.equal(isLatestAccountSnapshot(12,12,OWNER,OWNER),true);
 assert.equal(isLatestAccountSnapshot(13,12,OWNER,OWNER),false);
});

test('a previous logged-in account cannot commit previews or group badges',()=>{
 assert.equal(isLatestAccountSnapshot(7,7,OWNER,OTHER),false);
 assert.equal(isLatestAccountSnapshot(7,7,OWNER,''),false);
 assert.equal(isLatestAccountSnapshot(7,7,'',OWNER),false);
 assert.equal(isLatestAccountSnapshot(7,7,OTHER,OTHER),true);
});

test('a late request after logout or an account switch is rejected',()=>{
 let revision=1;
 let owner=OWNER;
 const requestId=revision;
 revision++;owner='';
 assert.equal(isLatestAccountSnapshot(requestId,revision,OWNER,owner),false);
 revision++;owner=OTHER;
 assert.equal(isLatestAccountSnapshot(requestId,revision,OWNER,owner),false);
});

test('inbox Realtime only wakes RLS-backed server fetches',()=>{
 const rt=load('lib/inbox-realtime.ts');
 assert.match(rt,/client\.realtime\.setAuth\(token\)/);
 assert.match(rt,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
 assert.match(rt,/table:'messages',event:'INSERT'/);
 assert.match(rt,/table:'messages',event:'UPDATE'/);
 assert.match(rt,/table:'group_messages',event:'INSERT'/);
 assert.match(rt,/if\(status==='SUBSCRIBED'\)\{direct\(\);group\(\);\}/);
 assert.match(rt,/client\.removeChannel\(channel\)/);
 assert.match(rt,/client\.realtime\.disconnect\(\)/);
 assert.doesNotMatch(rt,/\.from\('messages'\)|\.from\('group_messages'\)|payload\.new|service_role/i);
});

test('updates to inbox and group unread badges are debounced and network-resilient',()=>{
 const shell=load('components/AppShell.tsx');
 const effect=shell.slice(shell.indexOf('// Realtime wakes the unread counters'),shell.indexOf('  useEffect(()=>{\n    if(!selected||!session?.access_token||!userId)return;'));
 assert.match(effect,/subscribeInboxChanges\(token,userId,onChanged\)/);
 assert.match(effect,/const direct=pendingDirect,group=pendingGroup/);
 assert.match(effect,/if\(direct\)work\.push\(refreshInbox\(token,userId\)\.catch\(\(\)=>\{\}\)\)/);
 assert.match(effect,/if\(group\)\{/);
 assert.match(effect,/listGroupOverviews\(token\)\.then\(summaries=>/);
 assert.match(effect,/isLatestAccountSnapshot\(requestId,groupOverviewRequestRef\.current,userId,inboxOwnerRef\.current\)/);
 assert.match(effect,/window\.setTimeout\(\(\)=>\{timer=null;void flush\(\);\},240\)/);
 assert.match(effect,/if\(inFlight\)return/);
 assert.match(effect,/if\(!cancelled&&\(pendingDirect\|\|pendingGroup\)\)schedule\(\)/);
 assert.match(effect,/if\(timer!==null\)window\.clearTimeout\(timer\)/);
 assert.match(effect,/unsubscribe\(\)/);
});

test('both the full and lightweight inbox discard older responses and avoid stale preview cache',()=>{
 const shell=load('components/AppShell.tsx');
 assert.match(shell,/const requestId=\+\+previewRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(requestId,previewRequestRef\.current,ownerId,previewCacheRef\.current\.ownerId\)/);
 assert.match(shell,/const inboxRequest=\+\+inboxRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(inboxRequest,inboxRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/const groupRequest=\+\+groupOverviewRequestRef\.current/);
 assert.match(shell,/isLatestAccountSnapshot\(groupRequest,groupOverviewRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/isLatestAccountSnapshot\(requestId,inboxRequestRef\.current,id,inboxOwnerRef\.current\)/);
 assert.match(shell,/inboxOwnerRef\.current='';inboxRequestRef\.current\+\+;previewRequestRef\.current\+\+;groupOverviewRequestRef\.current\+\+/);
});

test('inbox Realtime never replaces six-second conversation and twelve-second inbox fallbacks',()=>{
 const shell=load('components/AppShell.tsx');
 assert.match(shell,/window\.setInterval\(\(\)=>void sync\(\),6000\)/);
 assert.match(shell,/window\.setInterval\(\(\)=>void run\(\),12000\)/);
 assert.match(shell,/document\.addEventListener\('visibilitychange',onVisible\)/);
 assert.match(shell,/window\.addEventListener\('online',onConnected\)/);
 assert.match(load('lib/inbox-realtime.ts'),/return\(\)=>\{\};/);
});
