import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createSingleFlightRefreshGate} from '../lib/single-flight-refresh.ts';

test('ordinary overlapping polls are ignored instead of starting a second refresh',()=>{
  const gate=createSingleFlightRefreshGate();
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:false});
  assert.deepEqual(gate.enter(false),{accepted:false,forceFull:false});
  assert.equal(gate.leave(),false);
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:false});
  assert.equal(gate.leave(),false);
});

test('resume during an in-flight poll queues exactly one full refresh',()=>{
  const gate=createSingleFlightRefreshGate();
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:false});

  assert.deepEqual(gate.enter(true),{accepted:false,forceFull:false});
  assert.deepEqual(gate.enter(true),{accepted:false,forceFull:false});
  assert.deepEqual(gate.enter(false),{accepted:false,forceFull:false});
  assert.equal(gate.leave(),true,'the active task reports a queued full refresh');

  // If the document is still hidden/offline, the caller can wait. The next
  // eligible run inherits the queued full-refresh requirement.
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:true});
  assert.equal(gate.leave(),false);
});

test('a forced refresh admitted while idle does not leave a duplicate queued run',()=>{
  const gate=createSingleFlightRefreshGate();
  assert.deepEqual(gate.enter(true),{accepted:true,forceFull:true});
  assert.equal(gate.leave(),false);
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:false});
  assert.equal(gate.leave(),false);
});

test('disposing the gate discards queued work and rejects later requests',()=>{
  const gate=createSingleFlightRefreshGate();
  assert.deepEqual(gate.enter(false),{accepted:true,forceFull:false});
  assert.deepEqual(gate.enter(true),{accepted:false,forceFull:false});
  gate.dispose();
  assert.equal(gate.leave(),false);
  assert.deepEqual(gate.enter(true),{accepted:false,forceFull:false});
});

test('AppShell queues a full session/inbox refresh when resume overlaps an older request',()=>{
  const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  const start=shell.indexOf('const refreshGate=createSingleFlightRefreshGate()');
  const end=shell.indexOf("\n  useEffect(()=>{\n    if(!session||!userId)return;\n    let cancelled=false;\n    void myActivityVisibility",start);
  assert.ok(start>=0&&end>start,'the global session refresh effect is present');
  const effect=shell.slice(start,end);
  assert.match(effect,/const admission=refreshGate\.enter\(forceFull\)/);
  assert.match(effect,/if\(admission\.forceFull\|\|\+\+cycles%6===0\)/);
  assert.match(effect,/const queuedFull=refreshGate\.leave\(\)/);
  assert.match(effect,/if\(queuedFull&&!cancelled&&document\.visibilityState==='visible'&&navigator\.onLine\)void run\(true\)/);
  assert.match(effect,/startVisiblePolling\(\s*\(\)=>void run\(\),12000,document,window,navigator,\(\)=>void run\(true\)\s*\)/);
  assert.match(effect,/refreshGate\.dispose\(\);stopPolling\(\)/);
  assert.doesNotMatch(effect,/let inFlight=false/);
});
