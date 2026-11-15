import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {validateChatPreviewRows} from '../lib/chat-preview-validation.js';

const chatA='11111111-1111-4111-8111-111111111111';
const chatB='22222222-2222-4222-8222-222222222222';
const sender='33333333-3333-4333-8333-333333333333';
const empty=(overrides={})=>({
 chat_id:chatA,last_body:null,last_created_at:null,last_media_type:null,
 last_sender_id:null,unread_count:0,...overrides
});
const recent=(overrides={})=>({
 chat_id:chatB,last_body:'Фото',last_created_at:'2026-11-15T17:00:00.123456+00:00',
 last_media_type:'image',last_sender_id:sender,unread_count:2,...overrides
});
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('accepts empty inbox, empty chats and valid recent previews',()=>{
 assert.deepEqual(validateChatPreviewRows([]),[]);
 assert.equal(validateChatPreviewRows([empty(),recent()]).length,2);
 assert.equal(validateChatPreviewRows([recent({last_created_at:'2026-11-15T16:00:00Z'})]).length,1);
});

test('rejects non-array payloads and responses above the RPC limit',()=>{
 assert.throws(()=>validateChatPreviewRows(null),/Некорректный ответ/);
 assert.throws(()=>validateChatPreviewRows({rows:[]}),/Некорректный ответ/);
 const rows=Array.from({length:101},(_,index)=>empty({
  chat_id:'00000000-0000-4000-8000-'+String(index).padStart(12,'0')
 }));
 assert.throws(()=>validateChatPreviewRows(rows),/Некорректный ответ/);
});

test('rejects malformed and duplicate chat UUIDs case-insensitively',()=>{
 assert.throws(()=>validateChatPreviewRows([empty({chat_id:'not-a-uuid'})]),/Некорректный ответ/);
 assert.throws(()=>validateChatPreviewRows([empty(),empty({chat_id:chatA.toUpperCase()})]),/Некорректный ответ/);
});

test('rejects invalid timestamps, media types, sender IDs and body types',()=>{
 for(const row of [
  recent({last_created_at:'yesterday'}),
  recent({last_created_at:'2026-11-15'}),
  recent({last_media_type:'executable'}),
  recent({last_sender_id:'bad'}),
  recent({last_body:42})
 ])assert.throws(()=>validateChatPreviewRows([row]),/Некорректный ответ/);
});

test('rejects negative, fractional, string and unsafe unread counts',()=>{
 for(const unread_count of [-1,0.5,'2',Number.MAX_SAFE_INTEGER+1]){
  assert.throws(()=>validateChatPreviewRows([recent({unread_count})]),/Некорректный ответ/);
 }
});

test('rejects inconsistent metadata for a chat without a visible message',()=>{
 assert.throws(()=>validateChatPreviewRows([empty({last_body:'Фото'})]),/Некорректный ответ/);
 assert.throws(()=>validateChatPreviewRows([empty({last_sender_id:sender})]),/Некорректный ответ/);
 assert.throws(()=>validateChatPreviewRows([empty({unread_count:1})]),/Некорректный ответ/);
 assert.throws(()=>validateChatPreviewRows([recent({last_sender_id:null})]),/Некорректный ответ/);
});

test('PostgREST inbox previews are treated as unknown until the validator accepts them',()=>{
 const api=source('lib/supabase-rest.ts');
 assert.match(api,/import \{validateChatPreviewRows\} from '\.\/chat-preview-validation\.js'/);
 assert.match(api,/const rows=await http<unknown>\('\/rest\/v1\/rpc\/list_chat_previews'/);
 assert.match(api,/return validateChatPreviewRows\(rows\)/);
 assert.doesNotMatch(api,/http<ChatPreview\[]>\('\/rest\/v1\/rpc\/list_chat_previews'/);
});
