import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isDirectSendBusy,updateDirectSendBusyKeys,directSendBusyKey} from '../lib/direct-send-state.ts';

test('busy state is isolated by account and chat and supports concurrent chats',()=>{
 const empty=new Set();
 const busyA=updateDirectSendBusyKeys(empty,'user-a','chat-a',true);
 const busyB=updateDirectSendBusyKeys(busyA,'user-a','chat-b',true);
 const busyOtherAccount=updateDirectSendBusyKeys(busyB,'user-b','chat-a',true);
 assert.equal(isDirectSendBusy(busyOtherAccount,'user-a','chat-a'),true);
 assert.equal(isDirectSendBusy(busyOtherAccount,'user-a','chat-b'),true);
 assert.equal(isDirectSendBusy(busyOtherAccount,'user-b','chat-a'),true);
 assert.equal(isDirectSendBusy(busyOtherAccount,'user-b','chat-b'),false);
});

test('clearing one chat preserves other in-flight chats',()=>{
 let busy=new Set();
 busy=updateDirectSendBusyKeys(busy,'user-a','chat-a',true);
 busy=updateDirectSendBusyKeys(busy,'user-a','chat-b',true);
 busy=updateDirectSendBusyKeys(busy,'user-a','chat-a',false);
 assert.equal(isDirectSendBusy(busy,'user-a','chat-a'),false);
 assert.equal(isDirectSendBusy(busy,'user-a','chat-b'),true);
 assert.equal(busy.size,1);
});

test('busy state updates are immutable and idempotent',()=>{
 const empty=new Set();
 const first=updateDirectSendBusyKeys(empty,'user-a','chat-a',true);
 assert.notEqual(first,empty);
 assert.equal(updateDirectSendBusyKeys(first,'user-a','chat-a',true),first);
 const cleared=updateDirectSendBusyKeys(first,'user-a','chat-a',false);
 assert.notEqual(cleared,first);
 assert.equal(updateDirectSendBusyKeys(cleared,'user-a','chat-a',false),cleared);
 assert.equal(empty.size,0);
});

test('context keys use tuple encoding and reject empty identifiers',()=>{
 assert.notEqual(directSendBusyKey('a:b','c'),directSendBusyKey('a','b:c'));
 assert.equal(directSendBusyKey('','chat-a'),null);
 assert.equal(directSendBusyKey('user-a','  '),null);
 assert.equal(isDirectSendBusy(new Set(),'','chat-a'),false);
});
