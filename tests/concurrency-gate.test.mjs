import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../lib/concurrency-gate.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createConcurrencyGate}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

test('one gate caps concurrent reads across overlapping refresh generations',async()=>{
  const gate=createConcurrencyGate(3);
  let active=0;
  let maximum=0;
  const runBatch=items=>Promise.all(items.map(value=>gate.run(async()=>{
    active++;
    maximum=Math.max(maximum,active);
    await new Promise(resolve=>setTimeout(resolve,3));
    active--;
    return value;
  })));

  const [first,second]=await Promise.all([
    runBatch([0,1,2,3,4,5]),
    runBatch([6,7,8,9,10,11])
  ]);
  assert.equal(maximum,3,'overlapping refreshes must share one global limit');
  assert.deepEqual(first,[0,1,2,3,4,5]);
  assert.deepEqual(second,[6,7,8,9,10,11]);
});

test('aborting a queued read removes it without consuming a slot',async()=>{
  const gate=createConcurrencyGate(1);
  let releaseFirst;
  let markFirstStarted;
  const firstStarted=new Promise(resolve=>{markFirstStarted=resolve;});
  const first=gate.run(()=>new Promise(resolve=>{
    releaseFirst=resolve;
    markFirstStarted();
  }));
  await firstStarted;

  const controller=new AbortController();
  let queuedTaskStarted=false;
  const queued=gate.run(async()=>{
    queuedTaskStarted=true;
  },controller.signal);
  controller.abort();
  await assert.rejects(queued,error=>error?.name==='AbortError');

  releaseFirst('done');
  await first;
  assert.equal(queuedTaskStarted,false);
  assert.equal(await gate.run(async()=>42),42,'the slot is released after the first task');
});

test('a failed task releases its slot for the next refresh',async()=>{
  const gate=createConcurrencyGate(1);
  await assert.rejects(gate.run(async()=>{throw new Error('read failed');}),/read failed/);
  assert.equal(await gate.run(async()=> 'recovered'),'recovered');
});

test('invalid limits and already-aborted signals fail before task execution',async()=>{
  assert.throws(()=>createConcurrencyGate(0),/positive integer/);
  assert.throws(()=>createConcurrencyGate(1.5),/positive integer/);
  const gate=createConcurrencyGate(1);
  const controller=new AbortController();
  controller.abort();
  let started=false;
  await assert.rejects(gate.run(async()=>{started=true;},controller.signal),error=>error?.name==='AbortError');
  assert.equal(started,false);
});

test('AppShell shares one read gate across Realtime-triggered refresh effects',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  assert.match(shell,/const replyTargetReadGate=createConcurrencyGate\(3\)/);
  assert.match(shell,/replyTargetReadGate\.run\(\(\)=>stillInChat\(\)/);
  assert.match(shell,/listReplyTargets\(session\.access_token,chatId,ids,controller\.signal\)/);
});
