import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createProfileReloadGate} from '../lib/profile-reload-gate.ts';

const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only the newest overlapping profile reload may commit',()=>{
 const gate=createProfileReloadGate();
 const older=gate.begin();
 assert.equal(gate.isCurrent(older),true);
 const newer=gate.begin();
 assert.equal(gate.isCurrent(older),false);
 assert.equal(gate.isCurrent(newer),true);
});

test('cleanup invalidates pending profile reloads on target/account changes and unmount',()=>{
 const gate=createProfileReloadGate();
 const pending=gate.begin();
 gate.invalidate();
 assert.equal(gate.isCurrent(pending),false);
 const next=gate.begin();
 assert.equal(gate.isCurrent(next),true);
 gate.invalidate();
 assert.equal(gate.isCurrent(next),false);
});

test('profile panel uses a generation guard before committing reload state',()=>{
 const panel=file('components/ProfilePanel.tsx');
 assert.match(panel,/createProfileReloadGate/);
 assert.match(panel,/profileReloadGate\.begin\(\)/);
 assert.match(panel,/profileReloadGate\.isCurrent\(requestId\)/);
 assert.match(panel,/profileReloadGate\.invalidate\(\)/);
 assert.match(panel,/\[token,targetId,userId,profileReloadGate\]/);
});

test('stale profile reload errors are suppressed while current errors remain reportable',async()=>{
 const gate=createProfileReloadGate();
 const staleRequest=gate.begin();
 const currentRequest=gate.begin();
 const staleError=new Error('old profile failed');
 const currentError=new Error('current profile failed');
 const reportIfCurrent=async(requestId,error)=>{
  if(gate.isCurrent(requestId))throw error;
 };
 await assert.doesNotReject(()=>reportIfCurrent(staleRequest,staleError));
 await assert.rejects(()=>reportIfCurrent(currentRequest,currentError),error=>error===currentError);
});

test('ProfilePanel suppresses obsolete reload failures using the request generation',()=>{
 const panel=file('components/ProfilePanel.tsx');
 assert.match(panel,/catch\(error\)\{\s*\/\/ A failed request from an obsolete profile\/account must not surface in the current panel\.\s*if\(profileReloadGate\.isCurrent\(requestId\)\)throw error;\s*\}/);
});
