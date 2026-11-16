import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 countNewIncomingDirectMessages,
 rememberDirectMessageIds,
 DIRECT_ANNOUNCEMENT_SEEN_LIMIT
} from '../lib/direct-message-announcements.ts';

const SELF='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const message=(id,sender_id=OTHER,extra={})=>({
 id,sender_id,deleted_for:[],deleted_for_everyone:false,...extra
});
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only unseen incoming direct messages are counted',()=>{
 const seen=new Set(['old']);
 assert.equal(countNewIncomingDirectMessages([
  message('old'),message('incoming'),message('mine',SELF),message('another')
 ],seen,SELF),2);
});

test('edits and read-receipt updates do not announce an already seen message',()=>{
 const seen=new Set(['same']);
 assert.equal(countNewIncomingDirectMessages([message('same')],seen,SELF),0);
});

test('duplicate rows in one refresh are counted once',()=>{
 assert.equal(countNewIncomingDirectMessages([
  message('duplicate'),message('duplicate')
 ],new Set(),SELF),1);
});

test('messages hidden for this user or deleted for everyone are not announced',()=>{
 assert.equal(countNewIncomingDirectMessages([
  message('hidden',OTHER,{deleted_for:[SELF]}),
  message('global-delete',OTHER,{deleted_for_everyone:true}),
  message('visible')
 ],new Set(),SELF),1);
});

test('seen message IDs are retained in a bounded insertion-order window',()=>{
 const seen=rememberDirectMessageIds(new Set(['a','b']),[
  message('c'),message('d')
 ],3);
 assert.deepEqual([...seen],['b','c','d']);
 assert.equal(DIRECT_ANNOUNCEMENT_SEEN_LIMIT,2000);
});

test('direct chat announcements use a dedicated live region instead of making the full history live',()=>{
 const shell=load('components/AppShell.tsx');
 const historyStart=shell.indexOf('className="conversation-history"');
 assert.ok(historyStart>0);
 const historyTag=shell.slice(historyStart,shell.indexOf('>',historyStart)+1);
 assert.doesNotMatch(historyTag,/aria-live=/);
 assert.ok(shell.lastIndexOf('role="status" aria-live="polite" aria-atomic="true"',historyStart)>=0);
 assert.match(shell,/directMessageAnnouncementRef\.current=\{chatId,userId,initialized:false,seenIds:new Set\(\)\}/);
 assert.match(shell,/if\(!tracker\.initialized\)tracker\.initialized=true/);
 assert.match(shell,/countNewIncomingDirectMessages\(messages,tracker\.seenIds,userId\)/);
 assert.match(shell,/rememberDirectMessageIds\(tracker\.seenIds,messages\)/);
 assert.match(shell,/document\.visibilityState==='visible'&&selectedRef\.current===chatId/);
 assert.match(shell,/Новое входящее сообщение/);
 assert.doesNotMatch(shell,/announcement=.*message\.body/);
});
