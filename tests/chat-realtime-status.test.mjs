import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {shouldRefreshChatAfterRealtimeFailure} from '../lib/chat-realtime-status.ts';

const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Realtime channel failures trigger an immediate HTTP reconciliation',()=>{
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.equal(shouldRefreshChatAfterRealtimeFailure(status),true,status);
 for(const status of ['SUBSCRIBED','SUBSCRIBING','JOINING','unknown'])assert.equal(shouldRefreshChatAfterRealtimeFailure(status),false,status);
});

test('direct and group subscriptions wake the RLS-protected refresh on failure',()=>{
 const direct=load('lib/direct-realtime.ts');
 const group=load('lib/group-realtime.ts');
 assert.match(direct,/if\(shouldRefreshChatAfterRealtimeFailure\(status\)\)changed\(\)/);
 assert.match(group,/if\(shouldRefreshChatAfterRealtimeFailure\(status\)\)changed\(\)/);
 assert.match(direct,/if\(!stopped\)onChanged\(\)/);
 assert.match(group,/if\(!disposed\)onChanged\(\)/);
 assert.match(direct,/if\(status==='SUBSCRIBED'\)changed\(\)/);
 assert.match(group,/if\(status==='SUBSCRIBED'\)changed\(\)/);
});

test('Realtime failure hints never become message payloads or replace polling',()=>{
 const direct=load('lib/direct-realtime.ts');
 const group=load('lib/group-realtime.ts');
 assert.match(direct,/table:'messages',filter:'chat_id=eq\.'\+chatId/);
 assert.match(group,/table:'group_messages',filter:'group_id=eq\.'\+groupId/);
 assert.match(direct,/6-second HTTP polling fallback remains active/);
 assert.match(group,/periodic HTTPS refresh remains active/);
 assert.doesNotMatch(direct,/JSON\.parse\(payload|setChatMessages/);
 assert.doesNotMatch(group,/JSON\.parse\(payload|setGroupMessages/);
});
