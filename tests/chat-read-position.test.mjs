import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldAcknowledgeDirectChatRead} from '../lib/chat-read-position.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct chat read receipts require unread incoming messages at the visible latest page',()=>{
 assert.equal(shouldAcknowledgeDirectChatRead(true,true,true),true);
 assert.equal(shouldAcknowledgeDirectChatRead(false,true,true),false,'nothing unread must not write');
 assert.equal(shouldAcknowledgeDirectChatRead(true,false,true),false,'older history is not the visible latest page');
 assert.equal(shouldAcknowledgeDirectChatRead(true,true,false),false,'background tabs must not acknowledge reads');
 assert.equal(shouldAcknowledgeDirectChatRead(false,false,false),false);
});

test('direct chat sync checks the live scroll and visibility state after the history GET',()=>{
 const shell=read('components/AppShell.tsx');
 const sync=shell.slice(shell.indexOf('const sync=async(first=false)'),shell.indexOf('  },[selected,session?.access_token,userId,chatReloadNonce]);'));
 const fetchIndex=sync.indexOf('const messages=(await listMessages(token,chatId)).reverse()');
 const guardIndex=sync.indexOf('if(shouldAcknowledgeDirectChatRead(');
 assert.ok(fetchIndex>=0,'history is fetched before read acknowledgement');
 assert.ok(guardIndex>fetchIndex,'read guard is evaluated after the asynchronous history fetch');
 assert.match(sync,/chatAutoScrollRef\.current/);
 assert.match(sync,/document\.visibilityState==='visible'/);
 assert.match(sync,/markChatRead\(token,chatId\)/);
 assert.match(shell,/chatAutoScrollRef\.current=distance<120/,'manual scrolling updates the latest-page state');
});
