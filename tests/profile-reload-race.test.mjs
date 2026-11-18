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
