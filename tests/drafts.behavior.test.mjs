import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file=readFileSync(new URL('../lib/chat-drafts.ts',import.meta.url),'utf8');
const source=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function mockStorage(){
 const m=new Map();
 return {
   map:m,
   getItem:key=>m.get(key)??null,
   setItem:(key,value)=>m.set(key,String(value)),
   removeItem:key=>m.delete(key)
 };
}
function library(storage){
 const exports={};
 vm.runInNewContext(source,{exports,window:{sessionStorage:storage},Object,JSON,Array,RegExp,String}, {timeout:1000});
 return exports;
}
const alice='11111111-1111-4111-a111-111111111111';
const bob='22222222-2222-4222-b222-222222222222';
const chat='33333333-3333-4333-a333-333333333333';

test('drafts persist across page reloads in one tab but not across accounts',()=>{
 const storage=mockStorage();
 const first=library(storage);
 first.writeChatDrafts(alice,{[chat]:'Привет!'});
 const reload=library(storage);
 assert.equal(reload.readChatDrafts(alice)[chat],'Привет!');
 assert.equal(reload.readChatDrafts(bob)[chat],undefined);
 assert.deepEqual(Object.keys(library(mockStorage()).readChatDrafts(alice)),[]);
 reload.clearChatDrafts(alice);
 assert.deepEqual(Object.keys(first.readChatDrafts(alice)),[]);
});

test('draft payload validation rejects fake keys, non-strings and caps length',()=>{
 const storage=mockStorage(),api=library(storage);
 api.writeChatDrafts(alice,{
   [chat]:'x'.repeat(5000),
   'not-a-chat': 'secret',
   '44444444-4444-4444-a444-444444444444':123,
 });
 const loaded=api.readChatDrafts(alice);
 assert.deepEqual(Object.keys(loaded),[chat]);
 assert.equal(loaded[chat].length,4000);
 assert.deepEqual(Object.keys(api.readChatDrafts('bad-user-id')) ,[]);
});

test('storage failures cannot break typing or reading drafts',()=>{
 const broken={getItem(){throw Error('disabled');},setItem(){throw Error('quota');},removeItem(){throw Error('disabled');}};
 const api=library(broken);
 assert.doesNotThrow(()=>api.writeChatDrafts(alice,{[chat]:'draft'}));
 assert.deepEqual(Object.keys(api.readChatDrafts(alice)),[]);
 assert.doesNotThrow(()=>api.clearChatDrafts(alice));
});
