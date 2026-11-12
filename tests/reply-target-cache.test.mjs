import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/reply-target-cache.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {bumpReplyTargetVersion,snapshotReplyTargetVersions,isReplyTargetVersionCurrent,filterReplyTargetsForCurrentVersion,isReplyTargetOwnerCurrent,mapWithConcurrency}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('a Realtime update invalidates only the matching reply-target snapshot',()=>{
  const versions=new Map();
  const snapshot=snapshotReplyTargetVersions(['edited-message','unchanged-message'],versions);
  bumpReplyTargetVersion(versions,'edited-message');

  assert.equal(isReplyTargetVersionCurrent('edited-message',versions,snapshot),false);
  assert.equal(isReplyTargetVersionCurrent('unchanged-message',versions,snapshot),true);
  assert.deepEqual(filterReplyTargetsForCurrentVersion([
    {id:'edited-message',body:'stale quote'},
    {id:'unchanged-message',body:'still current'}
  ],versions,snapshot),[
    {id:'unchanged-message',body:'still current'}
  ]);
});

test('a fresh read after a Realtime invalidation is accepted',()=>{
  const versions=new Map();
  const oldSnapshot=snapshotReplyTargetVersions(['message'],versions);
  bumpReplyTargetVersion(versions,'message');
  const freshSnapshot=snapshotReplyTargetVersions(['message'],versions);

  assert.equal(isReplyTargetVersionCurrent('message',versions,oldSnapshot),false);
  assert.equal(isReplyTargetVersionCurrent('message',versions,freshSnapshot),true);
  assert.deepEqual(filterReplyTargetsForCurrentVersion([
    {id:'message',body:'latest server value'}
  ],versions,freshSnapshot),[
    {id:'message',body:'latest server value'}
  ]);
});


test('reply-target requests are owned by chat, account, and exact access token',()=>{
  const owner={chatId:'shared-chat',userId:'account-a',accessToken:'token-a'};
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner}),true);

  // A shared conversation ID is not sufficient after switching accounts.
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner,userId:'account-b',accessToken:'token-b'}),false);
  // A refreshed/replaced session for the same user must also invalidate the old request.
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner,accessToken:'token-a-rotated'}),false);
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner,chatId:'another-chat'}),false);
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner,chatId:null}),false);
  assert.equal(isReplyTargetOwnerCurrent(owner,{...owner,userId:''}),false);
});

test('AppShell checks the committed owner both before and inside queued state updates',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/useLayoutEffect\(\(\)=>\{\s*replyTargetOwnerRef\.current=\{chatId:selected,userId,accessToken:session\?\.access_token\?\?''\};/);
  assert.match(shell,/isReplyTargetOwnerCurrent\(requestOwner,replyTargetOwnerRef\.current\)/);
  assert.match(shell,/setReplyTargets\(current=>\s*isReplyTargetOwnerCurrent\(requestOwner,replyTargetOwnerRef\.current\)\?/);
});


test('reply-target batches preserve order while limiting concurrent PostgREST reads',async()=>{
  let active=0;
  let maximum=0;
  const results=await mapWithConcurrency([0,1,2,3,4,5,6],3,async value=>{
    active++;
    maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,(7-value)*2));
    active--;
    return value*10;
  });
  assert.equal(maximum,3);
  assert.deepEqual(results,[0,10,20,30,40,50,60]);
});

test('reply-target batch failure aborts siblings and does not start queued reads',async()=>{
  const started=[];
  let abortSiblings;
  let onErrorCalls=0;
  const sibling=new Promise((_,reject)=>{abortSiblings=reject;});
  const request=mapWithConcurrency([0,1,2,3],2,async value=>{
    started.push(value);
    if(value===0)throw new Error('first batch failed');
    if(value===1)return sibling;
    return value;
  },{
    onError:()=>{
      onErrorCalls++;
      abortSiblings(new Error('sibling aborted'));
    }
  });
  await assert.rejects(request,/first batch failed/);
  assert.deepEqual(started,[0,1]);
  assert.equal(onErrorCalls,1);
});

test('reply-target batch workers stop scheduling when the chat owner becomes stale',async()=>{
  let current=true;
  const started=[];
  const results=await mapWithConcurrency([1,2,3],1,async value=>{
    started.push(value);
    current=false;
    return value;
  },{shouldContinue:()=>current});
  assert.deepEqual(started,[1]);
  assert.equal(results[0],1);
});

test('AppShell caps reply-target reads at three and aborts active siblings on failure',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/mapWithConcurrency\(batches,3,/);
  assert.match(shell,/shouldContinue:stillInChat/);
  assert.match(shell,/onError:\(\)=>\{for\(const scope of activeScopes\)scope\.abort\(\);\}/);
});
