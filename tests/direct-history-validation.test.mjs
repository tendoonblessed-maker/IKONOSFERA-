import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {
 assertDirectHistoryChatId,
 assertDirectHistoryCursor,
 validateDirectMessagePage
} from '../lib/direct-history-validation.ts';

const CHAT='11111111-1111-4111-8111-111111111111';
const OTHER_CHAT='22222222-2222-4222-8222-222222222222';
const USER='33333333-3333-4333-8333-333333333333';
const ID_A='00000000-0000-4000-8000-000000000001';
const ID_B='00000000-0000-4000-8000-000000000002';
const ID_C='00000000-0000-4000-8000-000000000003';
const STAMP='2026-11-15T15:00:00.123456Z';

function row(id=ID_A,created_at=STAMP,extra={}){
 return {
  id,chat_id:CHAT,sender_id:USER,body:'Сообщение',created_at,
  media_path:null,media_type:null,read_at:null,edited_at:null,
  deleted_for:[],deleted_for_everyone:false,reply_to_message_id:null,
  ...extra
 };
}

test('valid newest page keeps complete rows in server order',()=>{
 const page=[row(ID_B,'2026-11-15T15:00:01Z'),row(ID_A,'2026-11-15T15:00:00Z')];
 assert.deepEqual(validateDirectMessagePage(page,CHAT),page);
});

test('the entire page is rejected when one row belongs to another chat',()=>{
 assert.throws(()=>validateDirectMessagePage([
  row(ID_B),row(ID_C,STAMP,{chat_id:OTHER_CHAT})
 ],CHAT),/историю переписки/);
});

test('malformed and duplicate rows fail closed instead of returning a partial page',()=>{
 assert.throws(()=>validateDirectMessagePage([row(ID_B),null],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_B),row(ID_B.toUpperCase())],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_B,STAMP,{sender_id:'not-a-uuid'})],CHAT),/историю переписки/);
});

test('message field types and timestamp formats are validated before UI use',()=>{
 assert.throws(()=>validateDirectMessagePage([row(ID_A,'yesterday')],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_A,STAMP,{media_type:'executable'})],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_A,STAMP,{read_at:'not-a-date'})],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_A,STAMP,{deleted_for:['not-a-uuid']})],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_A,STAMP,{deleted_for_everyone:'false'})],CHAT),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([row(ID_A,STAMP,{reply_to_message_id:'bad'})],CHAT),/историю переписки/);
});

test('oversized responses are rejected even when the server ignores the requested limit',()=>{
 assert.throws(()=>validateDirectMessagePage(Array.from({length:101},()=>row()),CHAT),/историю переписки/);
});

test('descending millisecond order and exact-timestamp UUID ties are checked',()=>{
 assert.throws(()=>validateDirectMessagePage([
  row(ID_A,STAMP),row(ID_B,STAMP)
 ],CHAT),/историю переписки/);
 assert.deepEqual(validateDirectMessagePage([
  row(ID_B,STAMP),row(ID_A,STAMP)
 ],CHAT).map(item=>item.id),[ID_B,ID_A]);
 assert.throws(()=>validateDirectMessagePage([
  row(ID_A,'2026-11-15T15:00:01Z'),row(ID_B,'2026-11-15T15:00:02Z')
 ],CHAT),/историю переписки/);
});

test('different fractional timestamps in one millisecond are not falsely rejected',()=>{
 const page=[
  row(ID_A,'2026-11-15T15:00:00.123457Z'),
  row(ID_B,'2026-11-15T15:00:00.123456Z')
 ];
 assert.deepEqual(validateDirectMessagePage(page,CHAT),page);
});

test('older pages must be below their cursor and cannot repeat an exact boundary row',()=>{
 const cursor={id:ID_B,created_at:STAMP};
 const valid=[row(ID_A,'2026-11-15T14:59:59Z')];
 assert.deepEqual(validateDirectMessagePage(valid,CHAT,cursor),valid);
 assert.throws(()=>validateDirectMessagePage([
  row(ID_C,'2026-11-15T15:00:01Z')
 ],CHAT,cursor),/историю переписки/);
 assert.throws(()=>validateDirectMessagePage([
  row(ID_C,STAMP)
 ],CHAT,cursor),/историю переписки/);
});

test('invalid chat IDs and pagination cursors are rejected before constructing a request',()=>{
 assert.throws(()=>assertDirectHistoryChatId('not-a-uuid'),/идентификатор/);
 assert.throws(()=>assertDirectHistoryCursor(CHAT,{id:'bad',created_at:STAMP}),/курсор/);
 assert.throws(()=>assertDirectHistoryCursor(CHAT,{id:ID_A,created_at:'tomorrow'}),/курсор/);
});

test('both direct history endpoints validate unknown payloads and retain bounded RLS-scoped queries',()=>{
 const source=readFileSync(new URL('../lib/supabase-rest.ts',import.meta.url),'utf8');
 const latest=source.slice(source.indexOf('export async function listMessages'),source.indexOf('/** Older than',source.indexOf('export async function listMessages')));
 const older=source.slice(source.indexOf('export async function listOlderMessages'),source.indexOf('/** Load original messages',source.indexOf('export async function listOlderMessages')));
 assert.match(source,/DIRECT_HISTORY_PAGE_MAX/);
 assert.match(latest,/assertDirectHistoryChatId\(chatId\)/);
 assert.match(latest,/http<unknown>/);
 assert.match(latest,/validateDirectMessagePage<ChatMessage>\(rows,chatId\)/);
 assert.match(latest,/chat_id=eq\./);
 assert.match(older,/assertDirectHistoryCursor\(chatId,before\)/);
 assert.match(older,/http<unknown>/);
 assert.match(older,/validateDirectMessagePage<ChatMessage>\(rows,chatId,before\)/);
 assert.match(older,/order=created_at\.desc,id\.desc/);
 assert.doesNotMatch(latest+older,/\.filter\(/,'malformed rows must not be silently filtered');
});
