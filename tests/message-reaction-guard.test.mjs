import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createSingleFlightGuard,isCurrentChatActionScope} from '../lib/single-flight-guard.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('a synchronous guard rejects a second action before React can rerender',()=>{
 const guard=createSingleFlightGuard();
 const release=guard.acquire();
 assert.equal(typeof release,'function');
 assert.equal(guard.acquire(),null,'a same-turn duplicate must not start another request');
 release();
 assert.equal(typeof guard.acquire(),'function','a completed action releases the guard');
});

test('release is idempotent and an old release cannot unlock a newer action',()=>{
 const guard=createSingleFlightGuard();
 const first=guard.acquire();
 assert.equal(typeof first,'function');
 first();
 const second=guard.acquire();
 assert.equal(typeof second,'function');
 first(); // a delayed duplicate cleanup from the old lease is harmless
 assert.equal(guard.acquire(),null,'the newer action remains protected');
 second();
 assert.equal(typeof guard.acquire(),'function');
});

test('independent guard instances do not share action state',()=>{
 const first=createSingleFlightGuard();
 const second=createSingleFlightGuard();
 const release=first.acquire();
 assert.equal(typeof second.acquire(),'function');
 assert.equal(first.acquire(),null);
 release();
});

test('message reactions acquire the synchronous guard before network work and release in finally',()=>{
 const app=load('components/AppShell.tsx');
 const start=app.indexOf('async function reactToMessage(');
 const end=app.indexOf('function queueAttachment(',start);
 assert.ok(start>=0&&end>start,'reaction handler exists');
 const handler=app.slice(start,end);
 assert.match(handler,/const release=reactionActionGuardRef\.current\?\.acquire\(\);\s*if\(!release\)return;/);
 assert.ok(handler.indexOf('acquire()')<handler.indexOf('await setMessageReaction('),
  'the lock is acquired before the first asynchronous mutation');
 assert.match(handler,/finally\{release\(\);setSending\(false\);\}/);
 assert.match(app,/reactionActionGuardRef=useRef<ReturnType<typeof createSingleFlightGuard>\|null>\(null\)/);
});

test('reaction results are valid only for the same chat, account and context generation',()=>{
 const action={chatId:'chat-a',userId:'user-a',generation:7};
 assert.equal(isCurrentChatActionScope(action,{...action}),true);
 assert.equal(isCurrentChatActionScope(action,{...action,chatId:'chat-b'}),false);
 assert.equal(isCurrentChatActionScope(action,{...action,userId:'user-b'}),false);
 assert.equal(isCurrentChatActionScope(action,{...action,generation:8}),false,
  'closing and reopening the same chat must invalidate the old result');
});

test('AppShell publishes identity in a layout effect and ignores stale reaction completions',()=>{
 const app=load('components/AppShell.tsx');
 assert.match(app,/useLayoutEffect\(\(\)=>\{\s*\/\/ Publish chat\/account identity before paint[\s\S]*?selectedRef\.current=selected;\s*userIdRef\.current=userId;\s*chatContextGenerationRef\.current\+\+;/);
 const start=app.indexOf('async function reactToMessage(');
 const end=app.indexOf('function queueAttachment(',start);
 const handler=app.slice(start,end);
 assert.match(handler,/const actionScope=\{chatId,userId,generation:chatContextGenerationRef\.current\}/);
 assert.match(handler,/isCurrentChatActionScope\(actionScope,\{\s*chatId:selectedRef\.current,userId:userIdRef\.current,generation:chatContextGenerationRef\.current\s*\}\)/);
 assert.ok(handler.indexOf('if(!isCurrent())return;')<handler.indexOf('setMessageReactionPicker(null)'),
  'a stale mutation response must not update the new chat UI');
 assert.match(handler,/if\(isCurrent\(\)\)setMessageReactions/);
 assert.match(handler,/catch\(e\)\{if\(isCurrent\(\)\)setError/);
 assert.match(handler,/finally\{release\(\);setSending\(false\);\}/);
});
