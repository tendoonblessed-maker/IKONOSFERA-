import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {chatActionScopeKey,createSingleFlightGuard,isCurrentChatActionScope} from '../lib/single-flight-guard.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const scope=(chatId,userId='user-a')=>({chatId,userId});

test('a synchronous guard rejects a duplicate reaction in the same account and chat',()=>{
 const guard=createSingleFlightGuard();
 const release=guard.acquire(scope('chat-a'));
 assert.equal(typeof release,'function');
 assert.equal(guard.acquire(scope('chat-a')),null,'same-turn duplicate must not start another request');
 release();
 assert.equal(typeof guard.acquire(scope('chat-a')),'function','completed action releases its scope');
});

test('a slow reaction in one chat does not block another chat or account',()=>{
 const guard=createSingleFlightGuard();
 const releaseA=guard.acquire(scope('chat-a','user-a'));
 assert.equal(typeof releaseA,'function');
 const releaseOtherChat=guard.acquire(scope('chat-b','user-a'));
 const releaseOtherAccount=guard.acquire(scope('chat-a','user-b'));
 assert.equal(typeof releaseOtherChat,'function');
 assert.equal(typeof releaseOtherAccount,'function');
 assert.equal(guard.acquire(scope('chat-a','user-a')),null,'the original chat remains single-flight');
 releaseOtherChat();
 releaseOtherAccount();
 releaseA();
});

test('release is idempotent and an old lease cannot unlock a newer action in its scope',()=>{
 const guard=createSingleFlightGuard();
 const first=guard.acquire(scope('chat-a'));
 assert.equal(typeof first,'function');
 first();
 const second=guard.acquire(scope('chat-a'));
 assert.equal(typeof second,'function');
 first();
 assert.equal(guard.acquire(scope('chat-a')),null,'newer action remains protected');
 second();
 assert.equal(typeof guard.acquire(scope('chat-a')),'function');
});

test('independent guard instances do not share action state',()=>{
 const first=createSingleFlightGuard();
 const second=createSingleFlightGuard();
 const release=first.acquire(scope('chat-a'));
 assert.equal(typeof second.acquire(scope('chat-a')),'function');
 assert.equal(first.acquire(scope('chat-a')),null);
 release();
});

test('chat scope keys separate accounts and conversations without delimiter collisions',()=>{
 assert.notEqual(chatActionScopeKey(scope('chat-a','user-a')),chatActionScopeKey(scope('chat-b','user-a')));
 assert.notEqual(chatActionScopeKey(scope('chat-a','user-a')),chatActionScopeKey(scope('chat-a','user-b')));
 assert.notEqual(chatActionScopeKey(scope('a:b','c')),chatActionScopeKey(scope('b','a:c')));
});

test('reaction handler acquires a chat-scoped guard before network work and releases it in finally',()=>{
 const app=load('components/AppShell.tsx');
 const start=app.indexOf('async function reactToMessage(');
 const end=app.indexOf('function queueAttachment(',start);
 assert.ok(start>=0&&end>start,'reaction handler exists');
 const handler=app.slice(start,end);
 assert.match(handler,/const release=reactionActionGuardRef\.current\?\.acquire\(\{chatId,userId\}\);\s*if\(!release\)return;/);
 assert.ok(handler.indexOf('acquire(')<handler.indexOf('await setMessageReaction('),
  'the lock is acquired before the first asynchronous mutation');
 assert.match(handler,/const scopeKey=chatActionScopeKey\(\{chatId,userId\}\)/);
 assert.match(handler,/setReactionBusyScopes\(current=>new Set\(current\)\.add\(scopeKey\)\)/);
 assert.match(handler,/setReactionBusyScopes\(current=>\{const next=new Set\(current\);next\.delete\(scopeKey\);return next;\}\)/);
 assert.match(handler,/finally\{[\s\S]*release\(\);/);
 assert.doesNotMatch(handler,/setSending|\|\|sending/,
  'reaction requests must not share the global message-send busy flag');
 assert.match(handler,/chatMessages\.some\(message=>message\.id===messageId&&message\.chat_id===chatId\)/,
  'a stale message-menu action must not mutate a message outside the selected chat');
 assert.match(app,/reactionActionGuardRef=useRef<ReturnType<typeof createSingleFlightGuard>\|null>\(null\)/);
});

test('reaction results are valid only for the same chat, account and context generation',()=>{
 const action={chatId:'chat-a',userId:'user-a',generation:7};
 assert.equal(isCurrentChatActionScope(action,{...action}),true);
 assert.equal(isCurrentChatActionScope(action,{...action,chatId:'chat-b'}),false);
 assert.equal(isCurrentChatActionScope(action,{...action,chatId:null}),false,
  'no selected chat means the old action is no longer current');
 assert.equal(isCurrentChatActionScope(action,{...action,userId:'user-b'}),false);
 assert.equal(isCurrentChatActionScope(action,{...action,generation:8}),false,
  'closing and reopening the same chat must invalidate the old result');
});

test('AppShell publishes identity in a layout effect and ignores stale reaction completions',()=>{
 const app=load('components/AppShell.tsx');
 const layoutStart=app.indexOf('useLayoutEffect(()=>{');
 const layoutEnd=app.indexOf('},[selected,userId]);',layoutStart);
 assert.ok(layoutStart>=0&&layoutEnd>layoutStart,'chat identity layout effect exists');
 const identityEffect=app.slice(layoutStart,layoutEnd);
 assert.match(identityEffect,/selectedRef\.current=selected;/);
 assert.match(identityEffect,/userIdRef\.current=userId;/);
 assert.match(identityEffect,/chatContextGenerationRef\.current\+=1;/);
 const start=app.indexOf('async function reactToMessage(');
 const end=app.indexOf('function queueAttachment(',start);
 const handler=app.slice(start,end);
 assert.match(handler,/const actionScope=\{chatId,userId,generation:chatContextGenerationRef\.current\}/);
 assert.match(handler,/isCurrentChatActionScope\(actionScope,\{\s*chatId:selectedRef\.current,userId:userIdRef\.current,generation:chatContextGenerationRef\.current\s*\}\)/);
 assert.ok(handler.indexOf('if(!isCurrent())return;')<handler.indexOf('setMessageReactionPicker(null)'),
  'a stale mutation response must not update the new chat UI');
 assert.match(handler,/if\(isCurrent\(\)\)setMessageReactions/);
 assert.match(handler,/catch\(e\)\{if\(isCurrent\(\)\)setError/);
 assert.match(handler,/setReactionBusyScopes\(current=>\{const next=new Set\(current\);next\.delete\(scopeKey\);return next;\}\)/);
});

test('reaction controls are disabled only for the active account/chat reaction scope',()=>{
 const app=load('components/AppShell.tsx');
 assert.match(app,/const activeReactionScopeKey=selected&&userId\?chatActionScopeKey\(\{chatId:selected,userId\}\):""/);
 assert.match(app,/const reactionBusy=Boolean\(activeReactionScopeKey&&reactionBusyScopes\.has\(activeReactionScopeKey\)\)/);
 const start=app.indexOf('<div className="reaction-bar message-reaction-bar">');
 const end=app.indexOf('</div></div></SwipeReplyMessage>',start);
 const bar=app.slice(start,end);
 assert.equal((bar.match(/disabled=\{reactionBusy\}/g)||[]).length,2);
 const menuStart=app.indexOf('<div className="ik-message-menu-reactions"');
 const menuEnd=app.indexOf('</div>',menuStart);
 assert.match(app.slice(menuStart,menuEnd),/disabled=\{reactionBusy\}/);
});
