import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {focusWrapTarget} from '../lib/modal-focus.ts';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('forward Tab wraps from last modal control to first',()=>{
 const controls=['close','search','member-1','member-2'];
 assert.equal(focusWrapTarget(controls,'member-2',false),'close');
 assert.equal(focusWrapTarget(controls,'member-1',false),null);
 assert.equal(focusWrapTarget(controls,'close',false),null);
});

test('Shift+Tab wraps from first modal control to last',()=>{
 const controls=['close','search','member-1'];
 assert.equal(focusWrapTarget(controls,'close',true),'member-1');
 assert.equal(focusWrapTarget(controls,'search',true),null);
 assert.equal(focusWrapTarget(controls,'member-1',true),null);
});

test('recover focus that escaped to the background in both directions',()=>{
 const controls=['close','search','member-1'];
 assert.equal(focusWrapTarget(controls,'chat-composer',false),'close');
 assert.equal(focusWrapTarget(controls,'chat-composer',true),'member-1');
 assert.equal(focusWrapTarget(controls,null,false),'close');
 assert.equal(focusWrapTarget(controls,null,true),'member-1');
});

test('empty and single-control modals behave safely',()=>{
 assert.equal(focusWrapTarget([],null,false),null);
 assert.equal(focusWrapTarget([],null,true),null);
 assert.equal(focusWrapTarget(['close'],'close',false),'close');
 assert.equal(focusWrapTarget(['close'],'close',true),'close');
});

test('group member modal wires focus trap, Escape, focus restore and scroll cleanup',()=>{
 const panel=source('components/GroupPanel.tsx');
 assert.match(panel,/import \{focusWrapTarget\} from '@\/lib\/modal-focus'/);
 assert.match(panel,/membersCloseRef\.current\?\.focus\(\)/);
 assert.match(panel,/focusWrapTarget\(controls,document\.activeElement as HTMLElement\|null,event\.shiftKey\)/);
 assert.match(panel,/event\.key==='Escape'/);
 assert.match(panel,/event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*setMembersOpen\(false\)/);
 assert.match(panel,/document\.body\.style\.overflow='hidden'/);
 assert.match(panel,/document\.body\.style\.overflow=previousOverflow/);
 assert.match(panel,/previouslyFocused\?\.isConnected/);
 assert.match(panel,/membersTriggerRef\.current\?\.focus\(\)/);
 assert.match(panel,/ref=\{membersDialogRef\}/);
 assert.match(panel,/ref=\{membersCloseRef\}/);
 assert.match(panel,/event\.target===event\.currentTarget/);
});

test('opening the member modal does not automatically summon the mobile keyboard',()=>{
 const panel=source('components/GroupPanel.tsx');
 assert.doesNotMatch(panel,/membersSearchRef\.current\?\.focus\(\)/);
 assert.match(panel,/membersCloseRef\.current\?\.focus\(\)/);
});
