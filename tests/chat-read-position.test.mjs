import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isDirectChatAtLatest,shouldAcknowledgeDirectChatRead} from '../lib/chat-read-position.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('direct chat read receipts require unread incoming messages at the visible latest page',()=>{
 assert.equal(shouldAcknowledgeDirectChatRead(true,true,true),true);
 assert.equal(shouldAcknowledgeDirectChatRead(false,true,true),false,'nothing unread must not write');
 assert.equal(shouldAcknowledgeDirectChatRead(true,false,true),false,'older history is not the visible latest page');
 assert.equal(shouldAcknowledgeDirectChatRead(true,true,false),false,'background tabs must not acknowledge reads');
 assert.equal(shouldAcknowledgeDirectChatRead(false,false,false),false);
});

test('latest-page detection uses the committed scroll geometry and rejects invalid viewports',()=>{
 assert.equal(isDirectChatAtLatest(1200,900,300),true,'exactly at the bottom');
 assert.equal(isDirectChatAtLatest(1200,781,300),true,'within the 120px latest-page tolerance');
 assert.equal(isDirectChatAtLatest(1200,780,300),false,'the 120px boundary is not latest');
 assert.equal(isDirectChatAtLatest(1200,500,300),false,'older history is outside the viewport');
 assert.equal(isDirectChatAtLatest(100,0,300),true,'short conversations fit entirely in the viewport');
 assert.equal(isDirectChatAtLatest(1200,0,0),false,'unmounted or zero-height viewport is not visible');
 assert.equal(isDirectChatAtLatest(Number.NaN,0,300),false,'invalid geometry is rejected');
});

test('direct chat read acknowledgement is staged after GET and committed after latest-page layout',()=>{
 const shell=read('components/AppShell.tsx');
 const sync=shell.slice(shell.indexOf('const sync=async(first=false)'),shell.indexOf('  },[selected,session?.access_token,userId,chatReloadNonce]);'));
 const fetchIndex=sync.indexOf('const messages=(await listMessages(token,chatId)).reverse()');
 const stageIndex=sync.indexOf('setPendingDirectRead(unreadMessageIds.length?');
 assert.ok(fetchIndex>=0,'history is fetched before staging a read receipt');
 assert.ok(stageIndex>fetchIndex,'the receipt is staged only after a successful history GET');
 assert.doesNotMatch(sync,/markChatRead\(/,'the GET continuation must not write a read receipt before React commits');
 const scrollIndex=shell.indexOf('history.scrollTop=history.scrollHeight;');
 const ackIndex=shell.indexOf('if(shouldAcknowledgeDirectChatRead(',scrollIndex);
 assert.ok(scrollIndex>=0&&ackIndex>scrollIndex,'the latest-page scroll is committed before read acknowledgement');
 assert.match(shell,/pending\.messageIds\.every\(id=>history\.querySelector\('#ik-chat-message-'\+id\)\)/,'every unread message must have a committed DOM node');
 assert.match(shell,/isDirectChatAtLatest\(history\.scrollHeight,history\.scrollTop,history\.clientHeight\)/);
 assert.match(shell,/pending\.chatId!==selected\|\|pending\.userId!==userId\|\|pending\.token!==session\?\.access_token/,'stale chat/account/token receipts are discarded');
 assert.match(shell,/document\.visibilityState==='visible'&&navigator\.onLine/);
 assert.match(shell,/markChatRead\(pending\.token,pending\.chatId\)/);
});

test('direct chat latest-page scroll is a layout effect that precedes the receipt effect',()=>{
 const shell=read('components/AppShell.tsx');
 const scrollIndex=shell.indexOf('history.scrollTop=history.scrollHeight;');
 const receiptIndex=shell.indexOf('const pending=pendingDirectRead;');
 assert.ok(scrollIndex>=0&&receiptIndex>scrollIndex);
 const before=shell.slice(0,scrollIndex);
 assert.ok(before.lastIndexOf('useLayoutEffect(()=>{')>=0,'scroll restoration runs after DOM commit');
 const receipt=shell.slice(shell.lastIndexOf('useLayoutEffect(()=>{',receiptIndex),shell.indexOf('  },[pendingDirectRead,chatMessages,selected,userId,session?.access_token]);'));
 assert.match(receipt,/setPendingDirectRead\(null\)/);
 assert.match(receipt,/if\(shouldAcknowledgeDirectChatRead\(/);
});
