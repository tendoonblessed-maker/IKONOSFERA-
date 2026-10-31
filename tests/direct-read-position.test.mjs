import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldAcknowledgeDirectRead,countNewDirectMessagesBelow} from '../lib/direct-read-position.ts';

const CHAT='11111111-1111-4111-8111-111111111111';
const OTHER='99999999-9999-4999-8999-999999999999';
const ME='22222222-2222-4222-8222-222222222222';
const PARTNER='33333333-3333-4333-8333-333333333333';
const row=(id,sender_id=PARTNER,overrides={})=>({
 id,chat_id:CHAT,sender_id,read_at:null,deleted_for:[],...overrides
});
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('read only committed, visible latest incoming messages',()=>{
 const rows=[row('a',ME),row('b')];
 assert.equal(shouldAcknowledgeDirectRead(rows,CHAT,ME,true,true,true),true);
 assert.equal(shouldAcknowledgeDirectRead(rows,CHAT,ME,false,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead(rows,CHAT,ME,true,false,true),false);
 assert.equal(shouldAcknowledgeDirectRead(rows,CHAT,ME,true,true,false),false);
 assert.equal(shouldAcknowledgeDirectRead([],CHAT,ME,true,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead([row('a',ME)],CHAT,ME,true,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead([row('a',PARTNER,{read_at:'2026-10-29T10:00:00Z'})],CHAT,ME,true,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead([row('a',PARTNER,{deleted_for:[ME]})],CHAT,ME,true,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead([row('a',PARTNER,{chat_id:OTHER})],CHAT,ME,true,true,true),false);
 assert.equal(shouldAcknowledgeDirectRead([row('a'),row('b',PARTNER,{chat_id:OTHER})],CHAT,ME,true,true,true),false);
});

test('unseen count excludes own, hidden, edited and foreign-chat messages',()=>{
 const prior=new Set(['a','b']);
 const latest=[row('a'),row('b',PARTNER,{read_at:'2026-10-29T10:00:00Z'}),row('c'),
  row('d',ME),row('e',PARTNER,{deleted_for:[ME]}),
  row('f',PARTNER,{chat_id:OTHER}),row('g')];
 assert.equal(countNewDirectMessagesBelow(latest,prior,ME,CHAT,false),2);
 assert.equal(countNewDirectMessagesBelow(latest,prior,ME,CHAT,true),0);
 assert.equal(countNewDirectMessagesBelow(latest,new Set(),ME,CHAT,false),0);
 assert.equal(countNewDirectMessagesBelow(latest,prior,ME,OTHER,false),1);
});

test('read RPC is viewport-gated, not inside a server poll',()=>{
 const app=file('components/AppShell.tsx');
 const sync=app.slice(app.indexOf('const sync=async(first=false)=>{'),app.indexOf('void sync(true);',app.indexOf('const sync=async(first=false)=>{')));
 assert.doesNotMatch(sync,/markChatRead\(/);
 assert.match(app,/const acknowledgeDirectIfVisible=useCallback\(\(\)=>\{/);
 assert.match(app,/shouldAcknowledgeDirectRead\(chatMessages,chatId,userId,/);
 assert.match(app,/document\.visibilityState==='visible'/);
 assert.match(app,/if\(state\.lastId===last\.id\|\|state\.pendingId\)return/);
 assert.match(app,/if\(directReadRef\.current===state\)state\.lastId=last\.id/);
 assert.match(app,/useEffect\(\(\)=>\{acknowledgeDirectIfVisible\(\);\}/);
 assert.match(app,/setNewDirectMessagesBelow\(count=>Math\.min\(100,count\+newBelow\)\)/);
 assert.match(app,/recentDirectWindowRef\.current=\{key:'',ids:new Set\(\)\}/);
 assert.match(app,/ik-direct-unseen-badge/);
 assert.match(app,/newDirectMessagesBelow>99\?'99\+'/);
 const css=file('app/globals.css');
 assert.match(css,/\.ik-direct-unseen-badge\{/);
});
