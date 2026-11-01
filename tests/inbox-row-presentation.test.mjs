import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {inboxUnreadCount,inboxUnreadBadge,inboxRowLabel} from '../lib/inbox-row-presentation.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('unread counts are sanitized consistently for direct and group rows',()=>{
 assert.equal(inboxUnreadCount(null),0);
 assert.equal(inboxUnreadCount(undefined),0);
 assert.equal(inboxUnreadCount(''),0);
 assert.equal(inboxUnreadCount('abc'),0);
 assert.equal(inboxUnreadCount(Infinity),0);
 assert.equal(inboxUnreadCount(-2),0);
 assert.equal(inboxUnreadCount(true),0);
 assert.equal(inboxUnreadCount('4'),4);
 assert.equal(inboxUnreadCount(3.9),3);
 assert.equal(inboxUnreadCount(Number.MAX_VALUE),Number.MAX_SAFE_INTEGER);
});

test('badges retain the Telegram-style 99+ cap without losing accessible counts',()=>{
 assert.equal(inboxUnreadBadge(1),'1');
 assert.equal(inboxUnreadBadge(99),'99');
 assert.equal(inboxUnreadBadge(100),'99+');
 assert.equal(inboxRowLabel('Мария',100),'Открыть чат с Мария. Непрочитанных сообщений: 100');
 assert.equal(inboxRowLabel('Группа',0),'Открыть чат с Группа');
});

test('selection mode announces whether activating the chat will select or deselect it',()=>{
 assert.equal(inboxRowLabel('Мария',2,true,false),'Выбрать чат с Мария. Непрочитанных сообщений: 2');
 assert.equal(inboxRowLabel('Мария',2,true,true),'Снять выбор чата с Мария. Непрочитанных сообщений: 2');
});

test('both inbox components use shared unread labels and visible unread state',()=>{
 const direct=source('components/ChatInboxRow.tsx');
 const group=source('components/GroupInboxRow.tsx');
 for(const row of [direct,group]){
  assert.match(row,/inboxUnreadCount\(/);
  assert.match(row,/inboxUnreadBadge\(unread\)/);
  assert.match(row,/aria-label=\{inboxRowLabel\(/);
  assert.match(row,/ik-inbox-unread/);
  assert.match(row,/ik-inbox-has-draft/);
 }
 assert.match(direct,/aria-pressed=\{selectionMode\?selectedForBulk:undefined\}/);
 assert.match(group,/aria-label=\{'Непрочитанных: '\+unread\}/);
});

test('unread previews gain emphasis without overriding draft previews or read chats',()=>{
 const css=source('app/inbox-unread-polish.css');
 const layout=source('app/layout.tsx');
 assert.match(css,/\.ik-inbox-unread:not\(\.ik-inbox-has-draft\)/);
 assert.match(css,/\.ik-group-inbox\.ik-inbox-unread:not\(\.ik-inbox-has-draft\)/);
 assert.match(css,/font-weight:650!important/);
 assert.ok(layout.indexOf('import "./inbox-unread-polish.css"')>layout.indexOf('import "./light-telegram-theme.css"'));
});
