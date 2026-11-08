import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isCurrentChatAction} from '../lib/chat-action-scope.ts';

const scope=(changes={})=>({
  chatId:'11111111-1111-4111-8111-111111111111',
  userId:'22222222-2222-4222-8222-222222222222',
  generation:7,
  ...changes
});

test('a message action may update UI while its original chat and account remain active',()=>{
  assert.equal(isCurrentChatAction(scope(),scope()),true);
});

test('a late action from another chat or account cannot update the current UI',()=>{
  assert.equal(isCurrentChatAction(scope(),scope({chatId:'33333333-3333-4333-8333-333333333333'})),false);
  assert.equal(isCurrentChatAction(scope(),scope({userId:'44444444-4444-4444-8444-444444444444'})),false);
});

test('leaving and reopening the same chat invalidates an earlier action generation',()=>{
  assert.equal(isCurrentChatAction(scope(),scope({generation:9})),false);
});

test('empty or incomplete action scopes are never considered current',()=>{
  assert.equal(isCurrentChatAction(scope({chatId:''}),scope({chatId:''})),false);
  assert.equal(isCurrentChatAction(scope({userId:''}),scope({userId:''})),false);
});

test('message action checks its account/chat generation before every UI commit',()=>{
  const app=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  const start=app.indexOf('async function messageAction(');
  const end=app.indexOf('async function reactToMessage(',start);
  assert.ok(start>=0&&end>start,'messageAction handler exists');
  const action=app.slice(start,end);
  assert.match(app,/import \{isCurrentChatAction,type ChatActionScope\} from ['"]@\/lib\/chat-action-scope['"]/);
  assert.match(action,/const actionScope:ChatActionScope=\{chatId,userId,generation:chatContextGenerationRef\.current\}/);
  assert.match(action,/const isCurrent=\(\)=>selectedRef\.current===chatId&&isCurrentChatAction\(actionScope,\{/);
  const mutation=action.indexOf('await manageMessage(token,messageId,action,body);');
  const staleGuard=action.indexOf('if(!isCurrent())return;',mutation);
  assert.ok(mutation>=0&&staleGuard>mutation,'late mutation is ignored before any UI update');
  assert.match(action,/if\(isCurrent\(\)\)\{\s*setMessageMenuId\(null\)/);
  assert.match(action,/const updated=\(await listMessages\(token,chatId\)\)\.reverse\(\);\s*if\(isCurrent\(\)\)setChatMessages/);
  assert.match(action,/catch\(e\)\{if\(isCurrent\(\)\)setError\(userFacingError\(e\)\);\}/);
});

test('message menu scopes are invalid after chat, account, or visit-generation changes',()=>{
  const menu={...scope(),messageId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  assert.equal(isCurrentChatAction(menu,scope()),true);
  assert.equal(isCurrentChatAction(menu,scope({chatId:'33333333-3333-4333-8333-333333333333'})),false);
  assert.equal(isCurrentChatAction(menu,scope({userId:'44444444-4444-4444-8444-444444444444'})),false);
  assert.equal(isCurrentChatAction(menu,scope({generation:8})),false);
});

test('message menu rendering and delayed actions retain the captured chat scope',()=>{
  const app=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(app,/const \[messageMenuScope,setMessageMenuScope\]=useState<ChatActionScope\|null>\(null\)/);
  assert.match(app,/const currentMessageMenuScope=isCurrentMessageActionScope\(messageMenuScope\)\?messageMenuScope:null/);
  assert.match(app,/openMessageMenu\(message,messageContextGeneration\)/);
  assert.match(app,/messageAction\(id,'hide',undefined,scope\)/);
  assert.match(app,/messageAction\(id,'delete_everyone',undefined,scope\)/);
  assert.match(app,/onSave=\{body=>messageAction\(message.id,'edit',body,scopeForMessage\(message\)\)\}/);
  assert.match(app,/useLayoutEffect\(\(\)=>\{\s*selectedRef\.current=selected;\s*chatContextGenerationRef\.current\+\+/);
  assert.match(app,/function isCurrentMessageActionScope\(scope:ChatActionScope\|null\|undefined\)/);
});
