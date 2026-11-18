import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createMessageReactionSingleFlightGate} from '../lib/message-reaction-single-flight.mjs';

const shell=readFileSync(new URL('../components/AppShell.tsx',import.meta.url),'utf8');

test('the synchronous gate rejects duplicate reaction attempts until released',()=>{
 const gate=createMessageReactionSingleFlightGate();
 assert.equal(gate.acquire(),true);
 assert.equal(gate.acquire(),false);
 assert.equal(gate.release(),true);
 assert.equal(gate.acquire(),true);
 assert.equal(gate.release(),true);
});

test('release is idempotent and never opens an already idle gate twice',()=>{
 const gate=createMessageReactionSingleFlightGate();
 assert.equal(gate.release(),false);
 assert.equal(gate.acquire(),true);
 assert.equal(gate.release(),true);
 assert.equal(gate.release(),false);
 assert.equal(gate.acquire(),true);
});

test('AppShell acquires the reaction gate synchronously before updating busy state',()=>{
 const start=shell.indexOf('async function reactToMessage(');
 const end=shell.indexOf('function queueAttachment(',start);
 assert.ok(start>=0&&end>start,'reaction handler should remain discoverable');
 const body=shell.slice(start,end);
 const acquire=body.indexOf('messageReactionGateRef.current.acquire()');
 const busy=body.indexOf('setSending(true)');
 assert.ok(acquire>=0&&acquire<busy,'single-flight acquisition must precede asynchronous React busy state');
 assert.match(body,/finally\{\s*messageReactionGateRef\.current\.release\(\);\s*setSending\(false\);\s*\}/);
});

test('late reaction results and errors are scoped to the originating chat generation',()=>{
 const start=shell.indexOf('async function reactToMessage(');
 const end=shell.indexOf('function queueAttachment(',start);
 const body=shell.slice(start,end);
 assert.match(body,/const generation=chatContextGenerationRef\.current/);
 assert.match(body,/const stillInChat=\(\)=>selectedRef\.current===chatId&&chatContextGenerationRef\.current===generation/);
 assert.match(body,/if\(stillInChat\(\)\)setMessageReactionPicker\(null\)/);
 assert.match(body,/if\(stillInChat\(\)\)setMessageReactions/);
 assert.match(body,/catch\(e\)\{if\(stillInChat\(\)\)setError\(userFacingError\(e\)\);\}/);
});
