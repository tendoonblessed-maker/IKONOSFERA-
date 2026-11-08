import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadWakeup(){
  const source=readFileSync(new URL('../lib/realtime-wakeup.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
  }}).outputText;
  const exports={};
  vm.runInNewContext(compiled,{exports,setTimeout,clearTimeout},{timeout:2000});
  return exports.createRealtimeWakeup;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('Realtime bursts coalesce by kind while preserving independent inbox refreshes',async()=>{
  const createRealtimeWakeup=loadWakeup();
  const calls=[];
  const wakeup=createRealtimeWakeup(kind=>calls.push(kind),20);
  wakeup.notify('direct');
  wakeup.notify('group');
  wakeup.notify('direct');
  wakeup.notify('group');
  assert.deepEqual(calls,[]);
  await wait(35);
  assert.deepEqual(calls,['direct','group']);
  wakeup.dispose();
});

test('a later burst schedules a fresh wake after the previous window flushes',async()=>{
  const createRealtimeWakeup=loadWakeup();
  const calls=[];
  const wakeup=createRealtimeWakeup(kind=>calls.push(kind),20);
  wakeup.notify('group');
  await wait(35);
  wakeup.notify('group');
  await wait(35);
  assert.deepEqual(calls,['group','group']);
  wakeup.dispose();
});

test('disposing a Realtime subscription cancels pending and future wake-ups',async()=>{
  const createRealtimeWakeup=loadWakeup();
  const calls=[];
  const wakeup=createRealtimeWakeup(kind=>calls.push(kind),20);
  wakeup.notify('group');
  wakeup.dispose();
  await wait(35);
  wakeup.notify('direct');
  assert.deepEqual(calls,[]);
});
