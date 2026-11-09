import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 cleanChatDrafts,
 updateChatDraftEntry
} from '../lib/chat-drafts.ts';
import {cleanGroupDrafts,writeGroupDraft} from '../lib/group-drafts.ts';

const USER='11111111-1111-4111-8111-111111111111';
const CHAT='22222222-2222-4222-8222-222222222222';
const GROUP='33333333-3333-4333-8333-333333333333';
const records=new Map();
globalThis.window={sessionStorage:{
 getItem:key=>records.get(key)??null,
 setItem:(key,value)=>records.set(key,String(value)),
 removeItem:key=>records.delete(key)
}};

function assertWellFormedBoundary(value){
 if(!value.length)return;
 const last=value.charCodeAt(value.length-1);
 assert.ok(!(last>=0xd800&&last<=0xdbff),'draft must not end with an unmatched high surrogate');
}

test('direct chat drafts never split an emoji surrogate pair at the 4000-unit limit',()=>{
 const boundary='x'.repeat(3999)+'😀';
 const cleaned=cleanChatDrafts({[CHAT]:boundary})[CHAT];
 const updated=updateChatDraftEntry({},CHAT,boundary)[CHAT];
 assert.equal(cleaned.length,3999);
 assert.equal(updated,cleaned);
 assertWellFormedBoundary(cleaned);
 assert.equal(cleaned,'x'.repeat(3999));
});

test('group drafts never split an emoji surrogate pair in normalization or writes',()=>{
 const boundary='x'.repeat(3999)+'😀';
 const normalized=cleanGroupDrafts({[GROUP]:boundary})[GROUP];
 const written=writeGroupDraft(USER,GROUP,boundary)[GROUP];
 assert.equal(normalized.length,3999);
 assert.equal(written,normalized);
 assertWellFormedBoundary(written);
 assert.equal(written,'x'.repeat(3999));
});

test('complete supplementary characters remain intact when they fit the draft cap',()=>{
 const text='😀'.repeat(2000);
 assert.equal(text.length,4000);
 assert.equal(cleanChatDrafts({[CHAT]:text})[CHAT],text);
 assert.equal(cleanGroupDrafts({[GROUP]:text})[GROUP],text);
});

test('ordinary text and under-limit emoji drafts are unchanged',()=>{
 const direct='Привет 👋';
 const group='Собрание завтра 🧑‍🚀';
 assert.equal(cleanChatDrafts({[CHAT]:direct})[CHAT],direct);
 assert.equal(cleanGroupDrafts({[GROUP]:group})[GROUP],group);
});
