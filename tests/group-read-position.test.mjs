import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldAcknowledgeGroupRead,countNewIncomingBelow} from '../lib/group-read-position.ts';

const GROUP='11111111-1111-4111-8111-111111111111';
const A='22222222-2222-4222-8222-222222222222';
const B='33333333-3333-4333-8333-333333333333';
const message=(id,sender_id=B)=>({id,sender_id,group_id:GROUP,body:'Привет',created_at:'2026-10-29T08:00:00Z'});
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only mark group messages read while the latest row is visible',()=>{
 assert.equal(shouldAcknowledgeGroupRead('new','old',false,true),false,'older history must not be marked read');
 assert.equal(shouldAcknowledgeGroupRead('new','old',true,false),false,'background tab must not mark read');
 assert.equal(shouldAcknowledgeGroupRead('new','old',true,true),true);
 assert.equal(shouldAcknowledgeGroupRead('new','new',true,true),false,'avoid repeated writes to the same cursor');
 assert.equal(shouldAcknowledgeGroupRead(null,'old',true,true),false,'empty groups should not write');
 assert.equal(shouldAcknowledgeGroupRead('new',null,true,true),true);
});

test('new incoming messages are counted only while reading older group history',()=>{
 const prev=new Set(['1','2']);
 const next=[message('1'),message('2'),message('3'),message('4',A)];
 assert.equal(countNewIncomingBelow(next,prev,A,false),1);
 assert.equal(countNewIncomingBelow(next,prev,A,true),0);
 assert.equal(countNewIncomingBelow(next,new Set(),A,false),0,'first page is not all new');
 assert.equal(countNewIncomingBelow(next,prev,B,false),1,'a different owner only counts other participants');
});

test('message count handles simultaneous new replies, deletions and background merges',()=>{
 const ids=new Set(['one','two','three']);
 const next=[message('one'),message('four'),message('five'),message('six',A)];
 assert.equal(countNewIncomingBelow(next,ids,A,false),2);
});

test('group read RPC is called from visibility-safe and bottom-safe action, not unconditional HTTP polling',()=>{
 const panel=file('components/GroupPanel.tsx');
 const refresh=panel.slice(panel.indexOf('const refresh=useCallback('),panel.indexOf(' useEffect(()=>{\n  let cancelled=false'));
 assert.match(panel,/const acknowledgeLatestIfVisible=useCallback\(\(\)=>\{/);
 assert.match(panel,/shouldAcknowledgeGroupRead\(last,lastReadRef\.current,/);
 assert.match(panel,/followNewestRef\.current,document\.visibilityState==='visible'/);
 assert.match(panel,/markGroupRead\(token,group\.id\)/);
 assert.match(refresh,/latestGroupMessageRef\.current=msgs\.length\?msgs\[msgs\.length-1\]\.id:null/);
 assert.doesNotMatch(refresh,/acknowledgeLatestIfVisible\(\)/,'do not acknowledge before React commits the fetched page');
 assert.match(panel,/useLayoutEffect\(\(\)=>\{\n  const history=historyRef\.current;/);
 assert.match(panel,/history\.scrollTop=history\.scrollHeight;\n   \/\/ Only acknowledge after/);
 assert.doesNotMatch(refresh,/void markGroupRead\(/,'refresh never marks read unconditionally');
 assert.match(panel,/if\(nearBottom\)\{setNewMessagesBelow\(0\);acknowledgeLatestIfVisible\(\);\}/);
});

test('group jumping to latest does not scroll entire iPhone page and retains older scroll position',()=>{
 const panel=file('components/GroupPanel.tsx');
 const css=file('app/globals.css');
 assert.match(panel,/className="ik-group-history-wrap"/);
 assert.match(panel,/className="ik-group-jump-latest"/);
 assert.match(panel,/showJumpToLatest&&<button/);
 assert.match(panel,/setShowJumpToLatest\(!nearBottom\)/);
 assert.match(panel,/history\.scrollTop=history\.scrollHeight/);
 assert.match(panel,/setNewMessagesBelow\(0\)/);
 assert.match(panel,/countNewIncomingBelow\(messages,previous\.ids,userId,followNewestRef\.current\)/);
 assert.doesNotMatch(panel,/scrollIntoView/);
 assert.match(css,/\.group-view \.ik-group-history-wrap/);
 assert.match(css,/min-height:0/);
 assert.match(css,/\.ik-group-jump-latest:focus-visible/);
});

test('group jump is scoped to group/account and new message badge saturates at 99',()=>{
 const panel=file('components/GroupPanel.tsx');
 assert.match(panel,/previousMessageIdsRef\.current=\{groupId:group\.id,ownerId:userId,ids:new Set\(\)\}/);
 assert.match(panel,/if\(previous\.groupId!==group\.id\|\|previous\.ownerId!==userId\)/);
 assert.match(panel,/setNewMessagesBelow\(n=>Math\.min\(99,n\+newBelow\)\)/);
 assert.match(panel,/newMessagesBelow<99\?newMessagesBelow:'99\+'/);
 assert.match(panel,/aria-label=\{newMessagesBelow>0/);
});
