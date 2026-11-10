import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {isCurrentRequest,type RequestScope} from '../lib/request-scope.ts';

const scope:RequestScope={
 groupId:'11111111-1111-4111-8111-111111111111',
 userId:'22222222-2222-4222-8222-222222222222',
 token:'session-token-a'
};
const source=readFileSync(new URL('../components/GroupPanel.tsx',import.meta.url),'utf8');
const send=source.slice(source.indexOf('async function send('),source.indexOf(' const names='));

test('only the latest request in the same group, account and token may release the composer',()=>{
 assert.equal(isCurrentRequest(4,4,scope,scope),true);
 assert.equal(isCurrentRequest(3,4,scope,scope),false);
});

test('a completion from a previous group cannot change the new group composer',()=>{
 const other={...scope,groupId:'33333333-3333-4333-8333-333333333333'};
 assert.equal(isCurrentRequest(7,8,scope,other),false);
});

test('a completion from a previous account or refreshed token is stale',()=>{
 assert.equal(isCurrentRequest(9,10,scope,{...scope,userId:'44444444-4444-4444-8444-444444444444'}),false);
 assert.equal(isCurrentRequest(9,10,scope,{...scope,token:'session-token-b'}),false);
});

test('navigation away and back still invalidates the earlier request generation',()=>{
 const returnedToSameChat={...scope};
 assert.equal(isCurrentRequest(11,13,scope,returnedToSameChat),false);
});

test('GroupPanel invalidates pending sends on scope changes and guards catch/finally UI writes',()=>{
 assert.ok(source.includes('const sendRequestRef=useRef(0)'));
 assert.ok(source.includes('},[group.id,userId,token]);'));
 assert.ok(send.includes('const sendRequestId=++sendRequestRef.current'));
 assert.ok(send.includes('if(!isCurrentRequest(sendRequestId,sendRequestRef.current,sendScope,contextRef.current))return'));
 assert.ok(send.includes('if(isCurrentRequest(sendRequestId,sendRequestRef.current,sendScope,contextRef.current))setBusy(false)'));
 const ack=send.indexOf('clearGroupSendAttempt(accountId,groupId,attempt.id)');
 const guard=send.indexOf('if(!isCurrentRequest(sendRequestId,sendRequestRef.current,sendScope,contextRef.current))return');
 assert.ok(ack>=0&&guard>ack,'a confirmed attempt is cleared before stale UI work is skipped');
});
