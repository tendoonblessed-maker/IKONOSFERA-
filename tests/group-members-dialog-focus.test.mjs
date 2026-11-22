import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function loadHelper(){
 const source=read('lib/dialog-focus.ts');
 const compiled=ts.transpileModule(source,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const context={exports:{}};
 vm.runInNewContext(compiled,context,{timeout:2000,filename:'dialog-focus.cjs'});
 return context.exports;
}

test('dialog focus trap wraps Shift+Tab from first and Tab from last',()=>{
 const api=loadHelper();
 assert.equal(api.dialogTabTarget(0,3,true),2);
 assert.equal(api.dialogTabTarget(2,3,false),0);
 assert.equal(api.dialogTabTarget(1,3,false),null,'interior Tab stays native');
 assert.equal(api.dialogTabTarget(1,3,true),null,'interior Shift+Tab stays native');
});

test('dialog focus trap moves focus inside when focus starts outside',()=>{
 const api=loadHelper();
 assert.equal(api.dialogTabTarget(-1,3,false),0);
 assert.equal(api.dialogTabTarget(-1,3,true),2);
 assert.equal(api.dialogTabTarget(0,1,true),0);
});

test('empty dialog has a focusable fallback',()=>{
 const api=loadHelper();
 assert.equal(api.dialogTabTarget(-1,0,false),-1);
 assert.equal(api.dialogTabTarget(0,0,true),-1);
});

test('group members dialog focuses search, traps Tab, closes on Escape and restores opener',()=>{
 const panel=read('components/GroupPanel.tsx');
 assert.match(panel,/membersTriggerRef\.current=event\.currentTarget/);
 assert.match(panel,/membersSearchRef\.current\?\.focus\(\)/);
 assert.match(panel,/membersTriggerRef\.current/);
 assert.match(panel,/opener\?\.isConnected/);
 assert.match(panel,/opener\.focus\(\)/);
 assert.match(panel,/membersDialogRef/);
 assert.match(panel,/onKeyDown={handleMembersDialogKeyDown}/);
 assert.match(panel,/event\.key==='Escape'/);
 assert.match(panel,/event\.key!=='Tab'/);
 assert.match(panel,/querySelectorAll<HTMLElement>/);
 assert.match(panel,/aria-modal="true"/);
 assert.match(panel,/tabIndex={-1}/);
 assert.match(panel,/membersTriggerRef\.current=null/);
});
